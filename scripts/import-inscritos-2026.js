const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const db = require("../backend/database/pool");

const IMPORT_SOURCE = "google_forms_cj_2026";
const CAPACITY = 200;
const DEFAULT_CSV = "C:\\Users\\Hamad\\Downloads\\INSCRITOS CJ - 2026 - (Inicio 02_02_26) - Respostas ao formulário 1.csv";

const excludedActivityPatterns = [
  /agendamento\s*da\s*quadra/i,
  /desenho\s*anime/i,
  /jazz/i,
  /grafite/i,
  /v[oô]lei\s*c[aâ]mbio/i,
  /volei\s*cambio/i
];

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    csvPath: args.find((arg) => !arg.startsWith("--")) || DEFAULT_CSV,
    dryRun: args.includes("--dry-run")
  };
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

function parseCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = parseCsvLine(lines.shift() || "");
  return lines.map((line, index) => {
    const cells = parseCsvLine(line);
    return {
      line: index + 2,
      malformed: cells.length !== headers.length,
      row: Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] || ""]))
    };
  });
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function cleanSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function titleCase(value) {
  const keepUpper = new Set(["CJ", "A", "B", "C", "I", "II", "III"]);
  return cleanSpaces(value)
    .toLowerCase()
    .split(" ")
    .map((part) => {
      const raw = part.replace(/[^a-z0-9]/gi, "").toUpperCase();
      if (keepUpper.has(raw)) return part.toUpperCase();
      return part ? `${part[0].toUpperCase()}${part.slice(1)}` : part;
    })
    .join(" ")
    .replace(/\bMasc\b/g, "Masc.")
    .replace(/\bFem\b/g, "Fem.")
    .replace(/\bManha\b/g, "Manhã")
    .replace(/\bTarde\b/g, "Tarde")
    .replace(/\bNoite\b/g, "Noite")
    .replace(/\bJudo\b/g, "Judô")
    .replace(/\bVolei\b/g, "Vôlei")
    .replace(/\bViolao\b/g, "Violão")
    .replace(/\bIngles\b/g, "Inglês")
    .replace(/\bBasicos\b/g, "Básicos")
    .replace(/\bPecussao\b/g, "Percussão");
}

function isExcludedActivity(value) {
  return excludedActivityPatterns.some((pattern) => pattern.test(value));
}

function splitActivities(value) {
  return String(value || "")
    .split(",")
    .map(cleanSpaces)
    .filter(Boolean)
    .filter((item) => !isExcludedActivity(item));
}

function extractAge(activity) {
  const patterns = [
    /\b(\d{1,2})\s*a\s*(\d{1,2})\s*anos?\b/i,
    /\b(\d{1,2})\s*a\s*(\d{1,2})\b/i,
    /\b(\d{1,2})\s*anos?\s*ou\s*(?:\+|mais)\b/i,
    /\b(\d{1,2})\s*anos?\s*ou\b/i,
    /\b(\d{1,2})\s*anos?\b/i
  ];

  for (const pattern of patterns) {
    const match = activity.match(pattern);
    if (!match) continue;
    if (match[2]) {
      return {
        faixaEtaria: `${match[1]} a ${match[2]} anos`,
        withoutAge: cleanSpaces(activity.replace(pattern, ""))
      };
    }
    return {
      faixaEtaria: `${match[1]} anos ou mais`,
      withoutAge: cleanSpaces(activity.replace(pattern, ""))
    };
  }

  return { faixaEtaria: "A definir", withoutAge: activity };
}

function normalizeOffice(activity) {
  const { faixaEtaria, withoutAge } = extractAge(activity);
  let nome = withoutAge
    .replace(/\s*-\s*$/g, "")
    .replace(/\(\s*TARDE\s*\)/gi, "(Tarde)")
    .replace(/\(\s*MANHA\s*\)/gi, "(Manhã)")
    .replace(/\(\s*NOITE\s*\)/gi, "(Noite)")
    .replace(/\bEns\.?\s*B[aá]sicos\b/gi, "Ens. Básicos")
    .replace(/\bManuten[cç][aã]o\b/gi, "Manutenção")
    .replace(/\bPecuss[aã]o\b/gi, "Percussão");

  nome = titleCase(nome)
    .replace(/\s+-\s+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!nome) nome = titleCase(activity);

  return {
    original: activity,
    nome,
    faixaEtaria
  };
}

function categoryFor(name) {
  const key = normalize(name);
  if (/futsal|volei|muaytai|judo|capoeira/.test(key)) return "Esportes";
  if (/bale|ritmos|movedance|dancaurbanas|ginastica/.test(key)) return "Dança e Movimento";
  if (/violao|teclado|bateria|percussao|canto|coral|flauta/.test(key)) return "Música";
  if (/ingles|informatica|libras/.test(key)) return "Educação";
  if (/xadrez/.test(key)) return "Jogos";
  if (/pintura|teatro/.test(key)) return "Artes e Cultura";
  return "Oficinas";
}

function periodFor(name) {
  const key = normalize(name);
  if (/manha/.test(key)) return "matutino";
  if (/tarde/.test(key)) return "vespertino";
  if (/noite/.test(key)) return "noturno";
  return "a definir";
}

function initials(name) {
  return cleanSpaces(name)
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function parseBirthDate(value) {
  const match = String(value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return { iso: null, age: null };
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const birth = new Date(Date.UTC(year, month - 1, day, 12));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) {
    return { iso: null, age: null };
  }
  const reference = new Date(Date.UTC(2026, 1, 2, 12));
  let age = reference.getUTCFullYear() - year;
  const birthdayThisYear = new Date(Date.UTC(reference.getUTCFullYear(), month - 1, day, 12));
  if (reference < birthdayThisYear) age -= 1;
  return {
    iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    age
  };
}

function normalizePhone(value) {
  const raw = cleanSpaces(value);
  const digits = raw.replace(/\D/g, "");
  const valid = digits.length === 10 || digits.length === 11;
  return {
    raw,
    value: valid ? digits : raw.slice(0, 20),
    valid
  };
}

function documentLinks(value) {
  return String(value || "")
    .split(",")
    .map(cleanSpaces)
    .filter((item) => /^https?:\/\//i.test(item));
}

function hasHealthCondition(row) {
  const answer = normalize(row["O Aluno(a) apresenta alguma doença Física ou Psicológica? (Caso tenha deve trazer laudo médico)"]);
  const detail = normalize(row["Caso apresente, descreva qual a doença no campo abaixo."]);
  return Boolean((answer && !/^nao/.test(answer)) || (detail && !/^nao$/.test(detail)));
}

function buildObservations(row) {
  const parts = [];
  const bairro = cleanSpaces(row.Bairro);
  const docs = documentLinks(row.Documentos);
  if (bairro) parts.push(`Bairro: ${bairro}`);
  if (docs.length) parts.push(`Documentos Google Drive: ${docs.join(" | ")}`);
  return parts.join("\n");
}

function buildRows(rows) {
  const officeByKey = new Map();
  const students = [];
  const errors = [];

  rows.forEach(({ row, line, malformed }) => {
    const nome = cleanSpaces(row["Nome Completo:"]);
    const activityParts = splitActivities(row["ATIVIDADES CJ 2026"]);
    const offices = [];
    const alerts = [];
    const phone = normalizePhone(row["Whatsapp do Contato do Aluno (a)"]);
    const responsiblePhone = normalizePhone(row["Contato dos Pais - Fixo ou Celular / *Se possível whatsapp."]);
    const birth = parseBirthDate(row["Data de nascimento"]);
    const health = hasHealthCondition(row);
    const healthDetail = cleanSpaces(row["Caso apresente, descreva qual a doença no campo abaixo."]);

    if (malformed) alerts.push(`Linha ${line}: quantidade de colunas diferente do cabeçalho; confira os dados importados.`);
    if (!nome) errors.push({ line, error: "Nome vazio; aluno nao importado." });
    if (!activityParts.length) alerts.push("Atividade original removida ou sem oficina ativa no site.");
    if (!birth.iso) alerts.push("Data de nascimento invalida ou ausente.");
    if (birth.age !== null && (birth.age < 0 || birth.age > 120)) alerts.push(`Idade calculada fora do esperado: ${birth.age}.`);
    if (phone.raw && !phone.valid) alerts.push(`Numero do aluno possivelmente incorreto: ${phone.raw}.`);
    if (responsiblePhone.raw && !responsiblePhone.valid) alerts.push(`Numero do responsavel possivelmente incorreto: ${responsiblePhone.raw}.`);
    if (health && !healthDetail) alerts.push("Aluno marcou problema de saude, mas nao descreveu qual.");

    activityParts.forEach((activity) => {
      const office = normalizeOffice(activity);
      const key = `${normalize(office.nome)}|${normalize(office.faixaEtaria)}`;
      if (!officeByKey.has(key)) {
        officeByKey.set(key, {
          ...office,
          categoria: categoryFor(office.nome),
          periodo: periodFor(office.nome),
          horario: "Horários definidos pela secretaria",
          capacidade: CAPACITY,
          descricao: `Turma importada da planilha oficial CJ 2026: ${office.original}.`,
          initials: initials(office.nome)
        });
      }
      offices.push(key);
    });

    if (!nome) return;

    const isMinor = birth.age !== null && birth.age < 18;
    const hash = crypto
      .createHash("sha256")
      .update(`${IMPORT_SOURCE}|${line}|${nome}|${row["Data de nascimento"]}|${row["ATIVIDADES CJ 2026"]}`)
      .digest("hex");

    students.push({
      line,
      hash,
      nome,
      idade: birth.age,
      dataNascimento: birth.iso,
      telefone: phone.value,
      responsavel: cleanSpaces(row["Nome dos Pais ou Responsável (Caso seja de Menor de 18 anos)"]),
      contatoResponsavel: isMinor ? responsiblePhone.value : "",
      bairro: cleanSpaces(row.Bairro),
      documentosLinks: documentLinks(row.Documentos),
      condicaoSaude: health ? (healthDetail || "Problema de saúde informado na planilha.") : "",
      fichaAlerta: alerts.join("\n"),
      observacoes: buildObservations(row),
      officeKeys: Array.from(new Set(offices))
    });
  });

  return {
    offices: Array.from(officeByKey.entries()).map(([key, value]) => ({ key, ...value })),
    students,
    errors
  };
}

async function importData(data, dryRun = false) {
  if (!db.hasDatabase) {
    throw new Error("DATABASE_URL nao configurado. Configure o banco antes de importar.");
  }

  await db.query(fs.readFileSync(path.resolve(__dirname, "..", "backend", "database", "schema.sql"), "utf8"));
  await db.query(fs.readFileSync(path.resolve(__dirname, "..", "backend", "database", "content-schema.sql"), "utf8"));

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    await client.query("UPDATE oficinas SET ativo = false");

    const officeIds = new Map();
    for (const office of data.offices) {
      const result = await client.query(
        `INSERT INTO oficinas (nome, categoria, descricao, faixa_etaria, dias_semana, periodo, horario, capacidade, imagem_url, initials, ativo)
         VALUES ($1, $2, $3, $4, '{}', $5, $6, $7, '/img/oficinas.png', $8, true)
         ON CONFLICT (nome) DO UPDATE SET
           categoria = EXCLUDED.categoria,
           descricao = EXCLUDED.descricao,
           faixa_etaria = EXCLUDED.faixa_etaria,
           periodo = EXCLUDED.periodo,
           horario = EXCLUDED.horario,
           capacidade = EXCLUDED.capacidade,
           imagem_url = EXCLUDED.imagem_url,
           initials = EXCLUDED.initials,
           ativo = true,
           updated_at = NOW()
         RETURNING id`,
        [
          office.nome,
          office.categoria,
          office.descricao,
          office.faixaEtaria,
          office.periodo,
          office.horario,
          office.capacidade,
          office.initials || "CJ"
        ]
      );
      officeIds.set(office.key, result.rows[0].id);
    }

    let imported = 0;
    let links = 0;
    for (const student of data.students) {
      const result = await client.query(
        `INSERT INTO alunos (
           nome, idade, data_nascimento, telefone, responsavel, contato_responsavel, email, bairro,
           oficina_id, status, documentos_pendentes, documentos_links, condicao_saude, ficha_alerta,
           observacoes, import_source, import_row_number, import_row_hash
         )
         VALUES ($1, $2, $3, $4, $5, $6, '', $7, $8, 'ativo', false, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (import_row_hash) WHERE import_row_hash IS NOT NULL AND import_row_hash <> ''
         DO UPDATE SET
           nome = EXCLUDED.nome,
           idade = EXCLUDED.idade,
           data_nascimento = EXCLUDED.data_nascimento,
           telefone = EXCLUDED.telefone,
           responsavel = EXCLUDED.responsavel,
           contato_responsavel = EXCLUDED.contato_responsavel,
           bairro = EXCLUDED.bairro,
           documentos_links = EXCLUDED.documentos_links,
           condicao_saude = EXCLUDED.condicao_saude,
           ficha_alerta = EXCLUDED.ficha_alerta,
           observacoes = EXCLUDED.observacoes,
           updated_at = NOW()
         RETURNING id`,
        [
          student.nome,
          student.idade,
          student.dataNascimento,
          student.telefone || null,
          student.responsavel || null,
          student.contatoResponsavel || null,
          student.bairro || null,
          null,
          student.documentosLinks,
          student.condicaoSaude || null,
          student.fichaAlerta || null,
          student.observacoes || null,
          IMPORT_SOURCE,
          student.line,
          student.hash
        ]
      );
      const alunoId = result.rows[0].id;
      const studentOfficeIds = student.officeKeys.map((key) => officeIds.get(key)).filter(Boolean);
      await client.query("DELETE FROM aluno_oficinas WHERE aluno_id = $1", [alunoId]);
      for (const oficinaId of studentOfficeIds) {
        await client.query(
          "INSERT INTO aluno_oficinas (aluno_id, oficina_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [alunoId, oficinaId]
        );
        links += 1;
      }
      await client.query("UPDATE alunos SET oficina_id = $1 WHERE id = $2", [studentOfficeIds[0] || null, alunoId]);
      imported += 1;
    }

    if (dryRun) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }

    return { imported, links, activeOffices: data.offices.length, dryRun };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const { csvPath, dryRun } = parseArgs();
  const rows = parseCsv(path.resolve(csvPath));
  const data = buildRows(rows);

  console.log(JSON.stringify({
    csvPath,
    dryRun,
    parsedRows: rows.length,
    offices: data.offices.length,
    students: data.students.length,
    skipped: data.errors.length,
    firstErrors: data.errors.slice(0, 20)
  }, null, 2));

  if (dryRun && !db.hasDatabase) return;

  const result = await importData(data, dryRun);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (db.pool) await db.pool.end();
  });
