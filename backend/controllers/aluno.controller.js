const Aluno = require("../models/aluno.model");
const Oficina = require("../models/oficina.model");
const ExcelJS = require("exceljs");
const path = require("path");
const { Readable } = require("stream");
const { normalizeCpf, isValidCpf } = require("../utils/cpf");

function safeStudentResponse(aluno) {
  if (!aluno) return aluno;
  const { tokenVersion: _tokenVersion, ...safe } = aluno;
  return safe;
}

function maskCpf(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 11 ? `***.***.***-${digits.slice(-2)}` : "";
}

function maskPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 4 ? `(--) *****-${digits.slice(-4)}` : "";
}

function safeStudentListResponse(aluno) {
  const safe = safeStudentResponse(aluno);
  return {
    id: safe.id,
    nome: safe.nome,
    matricula: safe.matricula,
    cpfMascarado: maskCpf(safe.cpf),
    telefoneMascarado: maskPhone(safe.telefone),
    status: safe.status,
    documentosPendentes: safe.documentosPendentes,
    oficinaIds: safe.oficinaIds,
    oficinas: safe.oficinas,
    turmaIds: safe.turmaIds,
    turmaNome: safe.turmaNome,
    turmas: safe.turmas,
    created_at: safe.created_at
  };
}

function normalizeWhatsAppPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return "";
}

function whatsappMatriculaMessage(aluno) {
  return `Olá! Sua matrícula no CJ Tamandaré é: ${aluno.matricula}. Use ela junto com seu CPF para acessar o Portal do Aluno.`;
}

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const columnAliases = {
  nome: ["nome", "nomecompleto", "aluno", "alunoa", "estudante"],
  cpf: ["cpf"],
  idade: ["idade"],
  telefone: ["telefone", "celular", "whatsapp", "contato"],
  responsavel: ["responsavel", "responsavellegal", "nomedoresponsavel", "mae", "pai"],
  email: ["email", "e-mail"],
  oficinas: ["oficina", "oficinas", "atividade", "atividades", "turma", "turmas"],
  status: ["status", "situacao"],
  documentosPendentes: ["documentospendentes", "documentosfaltando", "documentacao", "docs"],
  observacoes: ["observacoes", "observacao", "obs"]
};

function pick(row, key) {
  const aliases = columnAliases[key] || [key];
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null) return String(row[alias]).trim();
  }
  return "";
}

function truthy(value) {
  return ["sim", "true", "1", "pendente", "faltando", "incompleto"].includes(String(value || "").trim().toLowerCase());
}

function splitOffices(value) {
  return String(value || "")
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOfficeName(value) {
  return normalizeHeader(value);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanCell(value) {
  return String(value || "").trim();
}

function normalizeStatus(value) {
  const normalized = normalizeHeader(value);
  if (["inativo", "inativa", "desligado", "desligada"].includes(normalized)) return "inativo";
  return "ativo";
}

function parseBrazilianDate(value) {
  const raw = cleanCell(value);
  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!match) return null;
  const year = Number(match[3].length === 2 ? `19${match[3]}` : match[3]);
  const month = Number(match[2]);
  const day = Number(match[1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function ageFromBirthDate(date, now = new Date()) {
  if (!date) return "";
  let age = now.getFullYear() - date.getUTCFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  if (month < date.getUTCMonth() + 1 || (month === date.getUTCMonth() + 1 && day < date.getUTCDate())) age -= 1;
  return age;
}

function isoDate(date) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function splitLegacyList(value) {
  return String(value || "")
    .split(/[;,|\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isNoLike(value) {
  const normalized = normalizeHeader(value);
  return !normalized || ["nao", "naotem", "nenhuma", "nenhum", "n", "0"].includes(normalized);
}

function normalizeLegacyPhone(value) {
  const raw = cleanCell(value).replace(/\s+/g, " ");
  if (!raw) return "";
  const first = raw.split(/[\/;,|]+/).map((item) => item.trim()).find(Boolean) || raw;
  if (first.length <= 20) return first;
  const digits = first.replace(/\D/g, "");
  return digits.slice(0, 20);
}

function legacyOfficeName(activity) {
  const text = normalizeText(activity);
  if (!text.trim()) return "";
  if (text.includes("futsal")) return "Futsal";
  if (text.includes("volei") || text.includes("vôlei") || text.includes("cambio")) return "Vôlei";
  if (text.includes("muay")) return "Muay Thai";
  if (text.includes("capoeira")) return "Capoeira";
  if (text.includes("judo")) return "Judô";
  if (text.includes("basquete")) return "Basquete";
  if (text.includes("bale") || text.includes("ballet")) return "Ballet";
  if (text.includes("ritmos") || text.includes("move dance")) return "Dança Ritmos";
  if (text.includes("danca urbana") || text.includes("dança urbana")) return "Danças Urbanas";
  if (text.includes("ginastica") || text.includes("ginástica")) return "Ginástica";
  if (text.includes("libras")) return "Libras";
  if (text.includes("ingles") || text.includes("inglês")) return "Inglês";
  if (text.includes("informatica") || text.includes("informática")) return "Informática";
  if (text.includes("xadrez")) return "Xadrez";
  if (text.includes("violao") || text.includes("violão")) return "Violão";
  if (text.includes("teclado")) return "Teclado";
  if (text.includes("canto coral")) return "Canto Coral";
  if (text.includes("bateria") || text.includes("percuss")) return "Bateria e Percussão";
  if (text.includes("flauta")) return "Flauta Doce";
  if (text.includes("pintura")) return "Pintura em Tela";
  if (text.includes("teatro")) return "Teatro";
  if (text.includes("jazz")) return "Jazz";
  if (text.includes("grafite")) return "Grafite";
  if (text.includes("desenho") || text.includes("anime")) return "Desenho Anime";
  if (text.includes("quadra")) return "Agendamento da Quadra";
  return "";
}

function defaultOfficePayload(nome, turmas = []) {
  const categoryByName = {
    Jazz: "Dança e Movimento",
    Grafite: "Artes e Cultura",
    "Desenho Anime": "Artes e Cultura",
    "Agendamento da Quadra": "Esporte"
  };
  const inactive = nome === "Agendamento da Quadra";
  return {
    nome,
    categoria: categoryByName[nome] || "Oficinas",
    descricao: nome === "Agendamento da Quadra"
      ? "Reserva e organização de uso da quadra conforme agenda do Centro da Juventude."
      : `Oficina de ${nome} importada a partir dos cadastros atuais do CJ.`,
    faixaEtaria: "A definir",
    diasSemana: [],
    periodo: "a definir",
    horario: "A definir",
    capacidade: 30,
    imagemUrl: "/img/oficinas.png",
    initials: nome.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    turmas,
    ativo: !inactive
  };
}

function normalizePersonKey(nome, dataNascimento, telefone = "") {
  const phone = String(telefone || "").replace(/\D/g, "");
  return [
    normalizeHeader(nome),
    dataNascimento || phone
  ].filter(Boolean).join(":");
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

async function parseCsv(buffer) {
  const workbook = new ExcelJS.Workbook();
  const sheet = await workbook.csv.read(Readable.from(buffer), {
    parserOptions: { headers: false }
  });
  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(cell.text || cell.value || "");
  });
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const item = {};
    headers.forEach((header, colNumber) => {
      if (!header) return;
      const cell = row.getCell(colNumber);
      item[header] = cell.text || String(cell.value || "");
    });
    if (Object.values(item).some((value) => String(value || "").trim())) rows.push(item);
  });
  return rows;
}

async function parseSpreadsheet(file) {
  const extension = path.extname(file.originalname || "").toLowerCase();
  if (extension === ".csv") return parseCsv(file.buffer);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value || "");
  });

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const item = {};
    headers.forEach((header, colNumber) => {
      if (!header) return;
      const cell = row.getCell(colNumber);
      item[header] = cell.text || String(cell.value || "");
    });
    if (Object.values(item).some((value) => String(value || "").trim())) rows.push(item);
  });
  return rows;
}

async function importFromSpreadsheet(req, res) {
  if (!req.file?.buffer) {
    return res.status(400).json({ message: "Envie uma planilha XLSX ou CSV." });
  }

  const rows = await parseSpreadsheet(req.file);
  if (!rows.length) {
    return res.status(400).json({ message: "A planilha não possui linhas para importar." });
  }

  const oficinas = await Oficina.findAll({ includeInactive: true });
  const officeByName = new Map(oficinas.map((oficina) => [normalizeOfficeName(oficina.nome), oficina]));
  const imported = [];
  const errors = [];

  for (const [index, rawRow] of rows.entries()) {
    const normalizedRow = {};
    Object.entries(rawRow).forEach(([key, value]) => {
      normalizedRow[normalizeHeader(key)] = value;
    });

    const line = index + 2;
    const nome = pick(normalizedRow, "nome");
    const cpf = normalizeCpf(pick(normalizedRow, "cpf"));
    const idadeValue = pick(normalizedRow, "idade");
    const idade = idadeValue === "" ? "" : Number(idadeValue);
    const officeNames = splitOffices(pick(normalizedRow, "oficinas"));
    const oficinaIds = officeNames
      .map((name) => officeByName.get(normalizeOfficeName(name))?.id)
      .filter(Boolean);

    if (!nome || nome.length < 3) {
      errors.push({ linha: line, erro: "Nome obrigatório." });
      continue;
    }
    if (cpf && !isValidCpf(cpf)) {
      errors.push({ linha: line, erro: "CPF inválido." });
      continue;
    }
    if (idade !== "" && (!Number.isInteger(idade) || idade < 10 || idade > 99)) {
      errors.push({ linha: line, erro: "Idade inválida." });
      continue;
    }
    if (!oficinaIds.length) {
      errors.push({ linha: line, erro: `Oficina não encontrada: ${officeNames.join(", ") || "vazia"}.` });
      continue;
    }

    try {
      const aluno = await Aluno.create({
        nome,
        cpf,
        idade,
        telefone: pick(normalizedRow, "telefone"),
        responsavel: pick(normalizedRow, "responsavel"),
        email: pick(normalizedRow, "email"),
        oficinaIds,
        oficinaId: oficinaIds[0] || "",
        status: normalizeStatus(pick(normalizedRow, "status")),
        documentosPendentes: truthy(pick(normalizedRow, "documentosPendentes")),
        observacoes: pick(normalizedRow, "observacoes")
      });
      imported.push({ linha: line, id: aluno.id, nome: aluno.nome });
    } catch (error) {
      errors.push({ linha: line, erro: error.message });
    }
  }

  return res.status(imported.length ? 201 : 400).json({
    message: imported.length
      ? `${imported.length} aluno(s) importado(s).${errors.length ? ` ${errors.length} linha(s) com erro.` : ""}`
      : "Nenhum aluno foi importado.",
    importedCount: imported.length,
    errorCount: errors.length,
    errors: errors.slice(0, 30)
  });
}

async function importLegacySpreadsheet(req, res) {
  if (!req.file?.buffer) {
    return res.status(400).json({ message: "Envie a planilha CSV ou XLSX de inscritos do CJ." });
  }

  const preview = String(req.query.preview || "").toLowerCase() === "true";
  const rows = await parseSpreadsheet(req.file);
  if (!rows.length) {
    return res.status(400).json({ message: "A planilha não possui linhas para importar." });
  }

  let oficinas = await Oficina.findAll({ includeInactive: true });
  const officeByName = new Map(oficinas.map((oficina) => [normalizeOfficeName(oficina.nome), oficina]));
  const existingAlunos = await Aluno.findAll({});
  const existingByKey = new Map(existingAlunos.map((aluno) => [
    normalizePersonKey(aluno.nome, aluno.dataNascimento, aluno.telefone),
    aluno
  ]));
  const imported = [];
  const updated = [];
  const errors = [];
  const officeTurmas = new Map();
  const createdOffices = new Set();
  const plannedOffices = new Set();
  const startIndex = Math.max(Number(req.query.start || 0), 0);
  const limit = Math.max(Number(req.query.limit || rows.length), 1);
  const rowsToProcess = rows.slice(startIndex, startIndex + limit);

  async function ensureOffice(nome, turma) {
    if (!nome) return null;
    const key = normalizeOfficeName(nome);
    const current = officeByName.get(key);
    if (current) {
      const nextTurmas = Array.from(new Set([...(current.turmas || []), turma].filter(Boolean)));
      officeTurmas.set(current.id, nextTurmas);
      return current;
    }
    plannedOffices.add(nome);
    if (preview) return { id: `preview-${key}`, nome };
    const created = await Oficina.create(defaultOfficePayload(nome, [turma].filter(Boolean)));
    officeByName.set(key, created);
    oficinas = [...oficinas, created];
    createdOffices.add(nome);
    return created;
  }

  for (const [index, rawRow] of rowsToProcess.entries()) {
    const normalizedRow = {};
    Object.entries(rawRow).forEach(([key, value]) => {
      normalizedRow[normalizeHeader(key)] = value;
    });

    const line = startIndex + index + 2;
    const rawNome = cleanCell(normalizedRow.nomecompleto || normalizedRow.nome);
    const nome = rawNome || `Cadastro sem nome - linha ${line}`;
    const importAlerts = [];
    const dataNascimentoDate = parseBrazilianDate(normalizedRow.datadenascimento);
    const computedAge = ageFromBirthDate(dataNascimentoDate);
    const hasValidBirthDate = dataNascimentoDate && computedAge !== "" && computedAge >= 0 && computedAge <= 99;
    const dataNascimento = hasValidBirthDate ? isoDate(dataNascimentoDate) : "";
    const idade = hasValidBirthDate ? computedAge : null;
    const activityText = cleanCell(normalizedRow.atividadescj2026 || normalizedRow.atividade || normalizedRow.atividades);
    const activities = splitLegacyList(activityText);
    const responsavel = cleanCell(normalizedRow.nomedospaisouresponsavelcasosejademenorde18anos || normalizedRow.responsavel);
    const telefone = cleanCell(normalizedRow.whatsappdocontatodoalunoa || normalizedRow.contato || normalizedRow.telefone);
    const contatoResponsavel = cleanCell(normalizedRow.contatodospaisfixooucelularsepossivelwhatsapp);
    const telefoneOriginal = telefone || contatoResponsavel;
    const telefoneCadastro = normalizeLegacyPhone(telefoneOriginal);
    const bairro = cleanCell(normalizedRow.bairro);
    const documentosLinks = splitLegacyList(normalizedRow.documentos);
    const healthFlag = cleanCell(normalizedRow.oalunoaapresentaalgumadoencafisicaoupsicologicacasotenhadevetraarlaudomedico);
    const healthText = cleanCell(normalizedRow.casoapresentedescrevaqualadoencanocampoabaixo);
    const possuiDeficiencia = normalizeHeader(healthFlag) === "sim" || !isNoLike(healthText);
    const deficienciaDescricao = possuiDeficiencia && !isNoLike(healthText) ? healthText : "";

    if (!rawNome || rawNome.length < 3) importAlerts.push("Nome ausente ou incompleto na planilha original.");
    if (!hasValidBirthDate) importAlerts.push("Data de nascimento/idade inválida na planilha original.");
    if (telefoneOriginal && telefoneCadastro !== telefoneOriginal) importAlerts.push(`Telefone ajustado da planilha original: ${telefoneOriginal}.`);
    if (!activities.length) {
      importAlerts.push("Atividade/turma vazia na planilha original.");
    }

    const oficinaIds = [];
    const oficinaNames = [];
    const unmapped = [];
    for (const activity of activities) {
      const officeName = legacyOfficeName(activity);
      if (!officeName) {
        unmapped.push(activity);
        continue;
      }
      const office = await ensureOffice(officeName, activity);
      if (office?.id) oficinaIds.push(office.id);
      if (office?.nome) oficinaNames.push(office.nome);
    }

    if (!oficinaIds.length) {
      importAlerts.push(`Não foi possível identificar oficina para: ${activities.join(", ") || "vazia"}.`);
    }
    if (unmapped.length) {
      importAlerts.push(`Turma não mapeada e ignorada: ${unmapped.join(", ")}.`);
    }

    const payload = {
      nome,
      cpf: "",
      idade,
      telefone: telefoneCadastro,
      responsavel,
      email: "",
      dataNascimento,
      bairro,
      oficinaIds: Array.from(new Set(oficinaIds)),
      oficinaId: oficinaIds[0],
      turmas: activities,
      documentosLinks,
      possuiDeficiencia,
      deficienciaDescricao,
      status: "ativo",
      documentosPendentes: documentosLinks.length === 0,
      advertencias: importAlerts.length ? `ALERTA IMPORTACAO linha ${line}: ${importAlerts.join(" ")}` : "",
      observacoes: [
        "Importado da planilha INSCRITOS CJ 2026.",
        importAlerts.length ? `ALERTA IMPORTACAO linha ${line}: ${importAlerts.join(" ")}` : "",
        telefoneOriginal && telefoneCadastro !== telefoneOriginal ? `Telefone original: ${telefoneOriginal}.` : "",
        contatoResponsavel ? `Contato do responsável: ${contatoResponsavel}.` : "",
        !documentosLinks.length ? "Sem link de documentos na planilha original." : ""
      ].filter(Boolean).join(" "),
      origem: "google_forms_2026"
    };

    const duplicateKey = normalizePersonKey(nome, dataNascimento, payload.telefone);
    const existing = existingByKey.get(duplicateKey);
    if (preview) {
      (existing ? updated : imported).push({ linha: line, nome, oficinas: Array.from(new Set(oficinaNames)) });
      if (!existing) existingByKey.set(duplicateKey, { nome, dataNascimento, telefone: payload.telefone, oficinaIds: payload.oficinaIds });
      importAlerts.forEach((erro) => errors.push({ linha: line, nome, erro }));
      continue;
    }

    try {
      let aluno;
      if (existing) {
        aluno = await Aluno.update(existing.id, {
          ...existing,
          ...payload,
          oficinaIds: Array.from(new Set([...(existing.oficinaIds || []), ...payload.oficinaIds])),
          oficinaId: existing.oficinaId || payload.oficinaId,
          turmas: Array.from(new Set([...(existing.turmas || []), ...payload.turmas])),
          documentosLinks: Array.from(new Set([...(existing.documentosLinks || []), ...payload.documentosLinks])),
          documentosPendentes: existing.documentosPendentes && payload.documentosPendentes,
          advertencias: [existing.advertencias, payload.advertencias].filter(Boolean).join("\n")
        });
        updated.push({ linha: line, id: aluno.id, nome: aluno.nome });
      } else {
        aluno = await Aluno.create(payload);
        existingByKey.set(duplicateKey, aluno);
        imported.push({ linha: line, id: aluno.id, nome: aluno.nome });
      }
      importAlerts.forEach((erro) => errors.push({ linha: line, nome, erro }));
    } catch (error) {
      errors.push({ linha: line, nome, erro: error.message });
    }
  }

  if (!preview) {
    for (const [officeId, turmas] of officeTurmas.entries()) {
      const office = oficinas.find((item) => item.id === officeId);
      if (!office) continue;
      await Oficina.update(officeId, { ...office, turmas });
    }
  }

  const plannedTurmas = Array.from(officeTurmas.values()).reduce((total, list) => total + list.length, 0);
  return res.status(preview || imported.length || updated.length ? 200 : 400).json({
    message: preview
      ? `Prévia concluída: ${imported.length} novo(s), ${updated.length} atualização(ões), ${errors.length} alerta(s).`
      : `${imported.length} aluno(s) criado(s), ${updated.length} ficha(s) atualizada(s).${errors.length ? ` ${errors.length} linha(s) com alerta/erro.` : ""}`,
    preview,
    totalRows: rows.length,
    processedStart: startIndex,
    processedCount: rowsToProcess.length,
    importedCount: imported.length,
    updatedCount: updated.length,
    errorCount: errors.length,
    plannedOffices: Array.from(plannedOffices),
    createdOffices: Array.from(createdOffices),
    plannedTurmas,
    errors: errors.slice(0, 40)
  });
}

async function list(req, res) {
  const result = await Aluno.findPage(req.validated.query);
  return res.json({
    alunos: result.alunos.map(safeStudentListResponse),
    pagination: result.pagination
  });
}

async function detail(req, res) {
  const aluno = await Aluno.findById(req.validated.params.id);
  if (!aluno) return res.status(404).json({ message: "Aluno nÃ£o encontrado." });
  return res.json({ aluno: safeStudentResponse(aluno) });
}

async function create(req, res) {
  const aluno = await Aluno.create(req.validated.body);
  return res.status(201).json({ message: "Aluno cadastrado com sucesso.", aluno: safeStudentResponse(aluno) });
}

async function update(req, res) {
  const aluno = await Aluno.update(req.validated.params.id, req.validated.body);
  if (!aluno) return res.status(404).json({ message: "Aluno não encontrado." });
  return res.json({ message: "Aluno atualizado com sucesso.", aluno: safeStudentResponse(aluno) });
}

async function remove(req, res) {
  const removed = await Aluno.remove(req.validated.params.id);
  if (!removed) return res.status(404).json({ message: "Aluno não encontrado." });
  return res.status(204).send();
}

async function matriculaWhatsapp(req, res) {
  const aluno = await Aluno.findById(req.validated.params.id);
  if (!aluno) return res.status(404).json({ message: "Aluno não encontrado." });
  if (!aluno.matricula) {
    return res.status(409).json({ message: "Este aluno ainda não possui matrícula gerada. Atualize a lista e tente novamente." });
  }
  const phone = normalizeWhatsAppPhone(aluno.telefone);
  if (!phone) {
    return res.status(400).json({ message: "Não há telefone ou WhatsApp cadastrado para este aluno ou responsável." });
  }
  const texto = whatsappMatriculaMessage(aluno);
  return res.json({
    message: "Mensagem de matrícula pronta para envio pelo WhatsApp.",
    aluno: {
      id: aluno.id,
      nome: aluno.nome,
      matricula: aluno.matricula
    },
    texto,
    whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(texto)}`
  });
}

async function revokeSessions(req, res) {
  const aluno = await Aluno.revokeSessions(req.validated.params.id);
  if (!aluno) return res.status(404).json({ message: "Aluno não encontrado." });
  return res.json({
    message: "Sessões do aluno encerradas. O próximo acesso exigirá CPF e matrícula novamente.",
    aluno: safeStudentResponse(aluno)
  });
}

module.exports = {
  list,
  detail,
  create,
  update,
  remove,
  matriculaWhatsapp,
  revokeSessions,
  importFromSpreadsheet,
  importLegacySpreadsheet
};
