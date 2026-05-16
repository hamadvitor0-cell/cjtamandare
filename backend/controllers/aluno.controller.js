const Aluno = require("../models/aluno.model");
const Oficina = require("../models/oficina.model");
const ExcelJS = require("exceljs");
const path = require("path");
const { normalizeCpf, isValidCpf } = require("../utils/cpf");

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

function normalizeStatus(value) {
  const normalized = normalizeHeader(value);
  if (["inativo", "inativa", "desligado", "desligada"].includes(normalized)) return "inativo";
  return "ativo";
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

function parseCsv(buffer) {
  const lines = buffer.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const headers = parseCsvLine(lines.shift() || "");
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
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
    return res.status(400).json({ message: "A planilha nao possui linhas para importar." });
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
      errors.push({ linha: line, erro: "Nome obrigatorio." });
      continue;
    }
    if (cpf && !isValidCpf(cpf)) {
      errors.push({ linha: line, erro: "CPF invalido." });
      continue;
    }
    if (idade !== "" && (!Number.isInteger(idade) || idade < 0 || idade > 120)) {
      errors.push({ linha: line, erro: "Idade invalida." });
      continue;
    }
    if (!oficinaIds.length) {
      errors.push({ linha: line, erro: `Oficina nao encontrada: ${officeNames.join(", ") || "vazia"}.` });
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

async function list(req, res) {
  const alunos = await Aluno.findAll(req.validated.query);
  return res.json({ alunos });
}

async function create(req, res) {
  const aluno = await Aluno.create(req.validated.body);
  return res.status(201).json({ message: "Aluno cadastrado com sucesso.", aluno });
}

async function update(req, res) {
  const aluno = await Aluno.update(req.validated.params.id, req.validated.body);
  if (!aluno) return res.status(404).json({ message: "Aluno não encontrado." });
  return res.json({ message: "Aluno atualizado com sucesso.", aluno });
}

async function remove(req, res) {
  const removed = await Aluno.remove(req.validated.params.id);
  if (!removed) return res.status(404).json({ message: "Aluno não encontrado." });
  return res.status(204).send();
}

module.exports = {
  list,
  create,
  update,
  remove,
  importFromSpreadsheet
};
