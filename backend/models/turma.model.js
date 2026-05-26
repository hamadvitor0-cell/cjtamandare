const crypto = require("crypto");
const db = require("../database/pool");
const config = require("../config/env");

const memory = [];
let schemaEnsured = false;

const dayAllowlist = new Set(["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]);
const periodAllowlist = new Set(["manha", "tarde", "noite", "integral"]);
const legacyPeriodMap = {
  matutino: "manha",
  vespertino: "tarde",
  noturno: "noite",
  integral: "integral"
};

function normalizeDias(value = []) {
  const list = Array.isArray(value)
    ? value
    : String(value || "").split(/[\n;,|]/);
  return Array.from(new Set(list.map((item) => String(item || "").trim()).filter((item) => dayAllowlist.has(item))));
}

function normalizePeriodo(value = "") {
  const current = String(value || "").trim().toLowerCase();
  return legacyPeriodMap[current] || (periodAllowlist.has(current) ? current : "integral");
}

function normalizeTime(value = "") {
  const match = String(value || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function parseAgeRange(text = "") {
  const numbers = String(text || "").match(/\d+/g)?.map(Number).filter((item) => Number.isInteger(item)) || [];
  if (!numbers.length) return { min: 0, max: 99 };
  if (numbers.length === 1) return { min: numbers[0], max: 99 };
  return { min: Math.min(numbers[0], numbers[1]), max: Math.max(numbers[0], numbers[1]) };
}

function isDefaultAgeRange(range) {
  return Number(range.min) === 0 && Number(range.max) === 99;
}

function periodLabel(periodo = "") {
  return {
    manha: "Manha",
    tarde: "Tarde",
    noite: "Noite",
    integral: "Integral"
  }[periodo] || "A definir";
}

function vacancyStatus(vagasTotal, vagasOcupadas) {
  const disponiveis = Math.max(Number(vagasTotal || 0) - Number(vagasOcupadas || 0), 0);
  if (Number(vagasTotal || 0) <= 0) return "sem_vagas";
  return disponiveis > 0 ? "vagas_abertas" : "lista_espera";
}

function toPublic(row = {}) {
  const vagasTotal = Number(row.vagas_total ?? row.vagasTotal ?? 0);
  const vagasOcupadas = Number(row.vagas_ocupadas ?? row.vagasOcupadas ?? 0);
  const vagasDisponiveis = Math.max(vagasTotal - vagasOcupadas, 0);
  const horarioInicio = String(row.horario_inicio || row.horarioInicio || "").slice(0, 5);
  const horarioFim = String(row.horario_fim || row.horarioFim || "").slice(0, 5);

  return {
    id: row.id,
    oficinaId: row.oficina_id || row.oficinaId || "",
    oficina: row.oficina_nome || row.oficina || "",
    nome: row.nome || "",
    diasSemana: normalizeDias(row.dias_semana || row.diasSemana || []),
    periodo: normalizePeriodo(row.periodo),
    periodoLabel: periodLabel(normalizePeriodo(row.periodo)),
    horarioInicio,
    horarioFim,
    horario: horarioInicio && horarioFim ? `${horarioInicio} as ${horarioFim}` : "A definir",
    idadeMinima: Number(row.idade_minima ?? row.idadeMinima ?? 0),
    idadeMaxima: Number(row.idade_maxima ?? row.idadeMaxima ?? 99),
    vagasTotal,
    vagasOcupadas,
    vagasDisponiveis,
    situacaoVagas: vacancyStatus(vagasTotal, vagasOcupadas),
    bolsistaId: row.bolsista_id || row.bolsistaId || "",
    bolsista: row.bolsista_nome || row.bolsista || "",
    local: row.local || "",
    observacoes: row.observacoes || "",
    ativa: row.ativa !== false,
    podeExcluir: row.pode_excluir ?? row.podeExcluir ?? vagasOcupadas === 0,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function toPublicSafe(row = {}) {
  const turma = toPublic(row);
  return {
    id: turma.id,
    oficinaId: turma.oficinaId,
    oficina: turma.oficina,
    nome: turma.nome,
    diasSemana: turma.diasSemana,
    periodo: turma.periodo,
    periodoLabel: turma.periodoLabel,
    horarioInicio: turma.horarioInicio,
    horarioFim: turma.horarioFim,
    horario: turma.horario,
    idadeMinima: turma.idadeMinima,
    idadeMaxima: turma.idadeMaxima,
    vagasTotal: turma.vagasTotal,
    vagasOcupadas: turma.vagasOcupadas,
    vagasDisponiveis: turma.vagasDisponiveis,
    situacaoVagas: turma.situacaoVagas,
    responsavel: turma.bolsista || "",
    local: turma.local || "",
    ativa: turma.ativa
  };
}

async function ensureSchema() {
  if (schemaEnsured || !db.hasDatabase || !config.runtimeDatabaseSetup) return;
  schemaEnsured = true;
  await db.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await db.query(`
    CREATE TABLE IF NOT EXISTS turmas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
      nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 160),
      dias_semana TEXT[] NOT NULL DEFAULT '{}',
      periodo TEXT NOT NULL CHECK (periodo IN ('manha', 'tarde', 'noite', 'integral')),
      horario_inicio TEXT,
      horario_fim TEXT,
      idade_minima INTEGER NOT NULL DEFAULT 0 CHECK (idade_minima >= 0 AND idade_minima <= 99),
      idade_maxima INTEGER NOT NULL DEFAULT 99 CHECK (idade_maxima >= 0 AND idade_maxima <= 99),
      vagas_total INTEGER NOT NULL DEFAULT 30 CHECK (vagas_total > 0 AND vagas_total <= 10000),
      bolsista_id UUID REFERENCES bolsistas(id) ON DELETE SET NULL,
      local TEXT CHECK (local IS NULL OR char_length(local) <= 120),
      observacoes TEXT CHECK (observacoes IS NULL OR char_length(observacoes) <= 1000),
      ativa BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (idade_minima <= idade_maxima),
      CHECK (horario_inicio IS NULL OR horario_inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
      CHECK (horario_fim IS NULL OR horario_fim ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    )
  `);
  await db.query("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS turma_id UUID REFERENCES turmas(id) ON DELETE SET NULL");
  await db.query("ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS turma_id UUID REFERENCES turmas(id) ON DELETE SET NULL");
  await db.query("ALTER TABLE chamadas ADD COLUMN IF NOT EXISTS turma_id UUID REFERENCES turmas(id) ON DELETE SET NULL");
  await db.query(`
    CREATE TABLE IF NOT EXISTS aluno_turmas (
      aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
      turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (aluno_id, turma_id)
    )
  `);
  await db.query("CREATE INDEX IF NOT EXISTS idx_turmas_oficina ON turmas (oficina_id, ativa, nome)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_turmas_bolsista ON turmas (bolsista_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_alunos_turma ON alunos (turma_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_aluno_turmas_turma ON aluno_turmas (turma_id, aluno_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_inscricoes_turma ON inscricoes (turma_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_chamadas_turma_id ON chamadas (turma_id, data_chamada DESC)");
  await backfillLegacyOffices();
  await repairLegacyAgeRanges();
}

async function backfillLegacyOffices() {
  if (!db.hasDatabase) return;
  const result = await db.query(`
    SELECT id, nome, faixa_etaria, dias_semana, periodo, capacidade, turmas, ativo
    FROM oficinas o
    WHERE NOT EXISTS (SELECT 1 FROM turmas t WHERE t.oficina_id = o.id)
  `);
  for (const row of result.rows) {
    const legacyTurmas = Array.isArray(row.turmas)
      ? row.turmas
      : Array.isArray(row.turmas?.value)
        ? row.turmas.value
        : [];
    const firstLegacy = legacyTurmas.map((item) => String(item || "").trim()).find(Boolean);
    const faixaFromLegacy = parseAgeRange(firstLegacy || "");
    const faixaFromOffice = parseAgeRange(row.faixa_etaria);
    const faixa = !isDefaultAgeRange(faixaFromLegacy) ? faixaFromLegacy : faixaFromOffice;
    await db.query(
      `INSERT INTO turmas
        (oficina_id, nome, dias_semana, periodo, horario_inicio, horario_fim, idade_minima, idade_maxima, vagas_total, ativa, observacoes)
       VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6, $7, $8, $9)`,
      [
        row.id,
        firstLegacy ? `${row.nome} - ${firstLegacy}` : `${row.nome} - Turma geral`,
        normalizeDias(row.dias_semana || []),
        normalizePeriodo(row.periodo),
        faixa.min,
        faixa.max,
        Number(row.capacidade || 30),
        row.ativo !== false,
        "Turma criada a partir do cadastro legado da oficina. Revise horario, faixa etaria, bolsista e vagas no ADM."
      ]
    );
  }
}

async function repairLegacyAgeRanges() {
  if (!db.hasDatabase) return;
  const result = await db.query(
    `SELECT id, nome
     FROM turmas
     WHERE idade_minima = 0
       AND idade_maxima = 99
       AND observacoes ILIKE '%cadastro legado%'`
  );
  for (const turma of result.rows) {
    const faixa = parseAgeRange(turma.nome);
    if (isDefaultAgeRange(faixa)) continue;
    await db.query(
      "UPDATE turmas SET idade_minima = $1, idade_maxima = $2, updated_at = NOW() WHERE id = $3",
      [faixa.min, faixa.max, turma.id]
    );
  }
}

function occupancySql(alias = "t") {
  return `
    SELECT COUNT(DISTINCT pessoa_key)::int AS total
    FROM (
      SELECT COALESCE(NULLIF(i.cpf, ''), i.id::text) AS pessoa_key
      FROM inscricoes i
      WHERE i.turma_id = ${alias}.id
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(i.oficina_detalhes, '[]'::jsonb)) AS detalhe
          WHERE detalhe->>'status' = 'lista_espera'
        )
      UNION ALL
      SELECT COALESCE(NULLIF(a.cpf, ''), a.id::text) AS pessoa_key
      FROM alunos a
      WHERE a.turma_id = ${alias}.id
        AND a.status = 'ativo'
      UNION ALL
      SELECT COALESCE(NULLIF(a.cpf, ''), a.id::text) AS pessoa_key
      FROM alunos a
      INNER JOIN aluno_turmas at ON at.aluno_id = a.id
      WHERE at.turma_id = ${alias}.id
        AND a.status = 'ativo'
    ) ocupacao
  `;
}

function publicOccupancyJoinSql() {
  return `
    LEFT JOIN (
      SELECT turma_id, COUNT(DISTINCT pessoa_key)::int AS total
      FROM (
        SELECT i.turma_id, COALESCE(NULLIF(i.cpf, ''), i.id::text) AS pessoa_key
        FROM inscricoes i
        WHERE i.turma_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(i.oficina_detalhes, '[]'::jsonb)) AS detalhe
            WHERE detalhe->>'status' = 'lista_espera'
          )
        UNION ALL
        SELECT a.turma_id, COALESCE(NULLIF(a.cpf, ''), a.id::text) AS pessoa_key
        FROM alunos a
        WHERE a.turma_id IS NOT NULL AND a.status = 'ativo'
        UNION ALL
        SELECT at.turma_id, COALESCE(NULLIF(a.cpf, ''), a.id::text) AS pessoa_key
        FROM aluno_turmas at
        INNER JOIN alunos a ON a.id = at.aluno_id
        WHERE a.status = 'ativo'
      ) registros
      GROUP BY turma_id
    ) ocupacao ON ocupacao.turma_id = t.id
  `;
}

async function findAll(filters = {}) {
  await ensureSchema();
  const includeInactive = Boolean(filters.includeInactive);
  const publicOnly = Boolean(filters.publicOnly);
  const oficinaId = String(filters.oficinaId || filters.oficina_id || "");
  const bolsistaId = String(filters.bolsistaId || filters.bolsista_id || "");
  const periodo = String(filters.periodo || "");
  const status = String(filters.status || "");
  const search = String(filters.search || "").trim().toLowerCase();

  if (!db.hasDatabase) {
    return memory
      .filter((item) => includeInactive || item.ativa)
      .filter((item) => !oficinaId || item.oficina_id === oficinaId)
      .filter((item) => !bolsistaId || item.bolsista_id === bolsistaId)
      .filter((item) => !periodo || item.periodo === periodo)
      .filter((item) => status !== "ativa" || item.ativa)
      .filter((item) => status !== "inativa" || !item.ativa)
      .filter((item) => !search || [item.nome, item.oficina_nome, item.periodo].some((value) => String(value || "").toLowerCase().includes(search)))
      .map((item) => toPublic({ ...item, vagas_ocupadas: item.vagas_ocupadas || 0 }));
  }

  const where = [];
  const params = [];
  if (!includeInactive) where.push("t.ativa = true");
  if (publicOnly) where.push("o.ativo = true");
  if (oficinaId) {
    params.push(oficinaId);
    where.push(`t.oficina_id = $${params.length}`);
  }
  if (bolsistaId) {
    params.push(bolsistaId);
    where.push(`t.bolsista_id = $${params.length}`);
  }
  if (periodo) {
    params.push(normalizePeriodo(periodo));
    where.push(`t.periodo = $${params.length}`);
  }
  if (status === "ativa") where.push("t.ativa = true");
  if (status === "inativa") where.push("t.ativa = false");
  if (search) {
    params.push(`%${search}%`);
    where.push(`(LOWER(t.nome) LIKE $${params.length} OR LOWER(o.nome) LIKE $${params.length})`);
  }

  const selectFields = publicOnly
    ? `t.id, t.oficina_id, t.nome, t.dias_semana, t.periodo, t.horario_inicio, t.horario_fim,
       t.idade_minima, t.idade_maxima, t.vagas_total, t.bolsista_id, t.local, t.ativa,
       t.created_at, t.updated_at,
       o.nome AS oficina_nome,
       b.nome AS bolsista_nome,
       COALESCE(ocupacao.total, 0) AS vagas_ocupadas`
    : `t.*,
       o.nome AS oficina_nome,
       b.nome AS bolsista_nome,
       COALESCE(ocupacao.total, 0) AS vagas_ocupadas,
       NOT EXISTS (SELECT 1 FROM alunos a WHERE a.turma_id = t.id)
       AND NOT EXISTS (SELECT 1 FROM aluno_turmas at WHERE at.turma_id = t.id)
       AND NOT EXISTS (SELECT 1 FROM inscricoes i WHERE i.turma_id = t.id)
       AND NOT EXISTS (SELECT 1 FROM chamadas c WHERE c.turma_id = t.id) AS pode_excluir`;
  const occupancyJoin = publicOnly
    ? publicOccupancyJoinSql()
    : `LEFT JOIN LATERAL (${occupancySql("t")}) ocupacao ON true`;
  const result = await db.query(
    `SELECT
       ${selectFields}
     FROM turmas t
     INNER JOIN oficinas o ON o.id = t.oficina_id
     LEFT JOIN bolsistas b ON b.id = t.bolsista_id
     ${occupancyJoin}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY o.nome ASC, t.periodo ASC, t.horario_inicio ASC NULLS LAST, t.nome ASC
     LIMIT 1000`,
    params
  );
  return result.rows.map(toPublic);
}

async function findById(id, client = db) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const record = memory.find((item) => item.id === id);
    return record ? toPublic(record) : null;
  }
  const result = await client.query(
    `SELECT
       t.*,
       o.nome AS oficina_nome,
       b.nome AS bolsista_nome,
       COALESCE(ocupacao.total, 0) AS vagas_ocupadas
     FROM turmas t
     INNER JOIN oficinas o ON o.id = t.oficina_id
     LEFT JOIN bolsistas b ON b.id = t.bolsista_id
     LEFT JOIN LATERAL (${occupancySql("t")}) ocupacao ON true
     WHERE t.id = $1
     LIMIT 1`,
    [id]
  );
  return result.rows[0] ? toPublic(result.rows[0]) : null;
}

async function listPublicByOficina(oficinaId) {
  return findAll({ oficinaId, includeInactive: false, publicOnly: true });
}

function payloadToRow(payload) {
  return {
    oficina_id: payload.oficinaId,
    nome: payload.nome,
    dias_semana: normalizeDias(payload.diasSemana),
    periodo: normalizePeriodo(payload.periodo),
    horario_inicio: normalizeTime(payload.horarioInicio),
    horario_fim: normalizeTime(payload.horarioFim),
    idade_minima: Number(payload.idadeMinima),
    idade_maxima: Number(payload.idadeMaxima),
    vagas_total: Number(payload.vagasTotal),
    bolsista_id: payload.bolsistaId || null,
    local: payload.local || "",
    observacoes: payload.observacoes || "",
    ativa: payload.ativa !== false
  };
}

async function create(payload) {
  await ensureSchema();
  const row = payloadToRow(payload);
  if (!db.hasDatabase) {
    const now = new Date().toISOString();
    const record = { id: crypto.randomUUID(), ...row, created_at: now, updated_at: now, vagas_ocupadas: 0 };
    memory.push(record);
    return toPublic(record);
  }
  const result = await db.query(
    `INSERT INTO turmas
      (oficina_id, nome, dias_semana, periodo, horario_inicio, horario_fim, idade_minima, idade_maxima, vagas_total, bolsista_id, local, observacoes, ativa)
     VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), $7, $8, $9, $10, NULLIF($11, ''), NULLIF($12, ''), $13)
     RETURNING id`,
    [
      row.oficina_id,
      row.nome,
      row.dias_semana,
      row.periodo,
      row.horario_inicio,
      row.horario_fim,
      row.idade_minima,
      row.idade_maxima,
      row.vagas_total,
      row.bolsista_id,
      row.local,
      row.observacoes,
      row.ativa
    ]
  );
  return findById(result.rows[0].id);
}

async function update(id, payload) {
  await ensureSchema();
  const row = payloadToRow(payload);
  if (!db.hasDatabase) {
    const index = memory.findIndex((item) => item.id === id);
    if (index === -1) return null;
    memory[index] = { ...memory[index], ...row, updated_at: new Date().toISOString() };
    return toPublic(memory[index]);
  }
  const result = await db.query(
    `UPDATE turmas
     SET oficina_id = $1,
         nome = $2,
         dias_semana = $3,
         periodo = $4,
         horario_inicio = NULLIF($5, ''),
         horario_fim = NULLIF($6, ''),
         idade_minima = $7,
         idade_maxima = $8,
         vagas_total = $9,
         bolsista_id = $10,
         local = NULLIF($11, ''),
         observacoes = NULLIF($12, ''),
         ativa = $13,
         updated_at = NOW()
     WHERE id = $14
     RETURNING id`,
    [
      row.oficina_id,
      row.nome,
      row.dias_semana,
      row.periodo,
      row.horario_inicio,
      row.horario_fim,
      row.idade_minima,
      row.idade_maxima,
      row.vagas_total,
      row.bolsista_id,
      row.local,
      row.observacoes,
      row.ativa,
      id
    ]
  );
  return result.rows[0] ? findById(id) : null;
}

async function setStatus(id, ativa) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const record = memory.find((item) => item.id === id);
    if (!record) return null;
    record.ativa = Boolean(ativa);
    record.updated_at = new Date().toISOString();
    return toPublic(record);
  }
  const result = await db.query(
    "UPDATE turmas SET ativa = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
    [Boolean(ativa), id]
  );
  return result.rows[0] ? findById(id) : null;
}

async function linkedCount(id) {
  await ensureSchema();
  if (!db.hasDatabase) return 0;
  const result = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM alunos WHERE turma_id = $1)
       + (SELECT COUNT(*)::int FROM inscricoes WHERE turma_id = $1)
       + (SELECT COUNT(*)::int FROM chamadas WHERE turma_id = $1) AS total`,
    [id]
  );
  return Number(result.rows[0]?.total || 0);
}

async function remove(id) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const index = memory.findIndex((item) => item.id === id);
    if (index === -1) return false;
    memory.splice(index, 1);
    return true;
  }
  const total = await linkedCount(id);
  if (total > 0) {
    const error = new Error("Esta turma possui alunos, inscricoes ou chamadas vinculadas. Inative a turma em vez de excluir.");
    error.statusCode = 409;
    throw error;
  }
  const result = await db.query("DELETE FROM turmas WHERE id = $1", [id]);
  return result.rowCount > 0;
}

async function activeCountForOffice({ oficinaId = "", oficinaNome = "" } = {}, client = db) {
  await ensureSchema();
  if (!db.hasDatabase) {
    return memory.filter((item) => item.ativa && (item.oficina_id === oficinaId || item.oficina_nome === oficinaNome)).length;
  }
  const params = [];
  const where = ["t.ativa = true"];
  if (oficinaId) {
    params.push(oficinaId);
    where.push(`t.oficina_id = $${params.length}`);
  }
  if (oficinaNome) {
    params.push(oficinaNome);
    where.push(`o.nome = $${params.length}`);
  }
  const result = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM turmas t
     INNER JOIN oficinas o ON o.id = t.oficina_id
     WHERE ${where.join(" AND ")}`,
    params
  );
  return Number(result.rows[0]?.total || 0);
}

async function validateEnrollment({ oficinaNome = "", oficinaId = "", turmaId = "", idade }, client = db) {
  await ensureSchema();
  const activeTotal = await activeCountForOffice({ oficinaId, oficinaNome }, client);
  if (!activeTotal) {
    const error = new Error("No momento nao ha turmas disponiveis para esta oficina.");
    error.statusCode = 409;
    throw error;
  }
  if (!turmaId) {
    const error = new Error("Selecione uma turma disponivel para concluir a inscricao.");
    error.statusCode = 400;
    throw error;
  }

  let turma;
  if (!db.hasDatabase) {
    turma = memory.find((item) => item.id === turmaId);
    if (!turma) {
      const error = new Error("Turma nao encontrada.");
      error.statusCode = 404;
      throw error;
    }
    turma = toPublic(turma);
  } else {
    const result = await client.query(
      `SELECT t.*, o.nome AS oficina_nome, COALESCE(ocupacao.total, 0) AS vagas_ocupadas
       FROM turmas t
       INNER JOIN oficinas o ON o.id = t.oficina_id
       LEFT JOIN LATERAL (${occupancySql("t")}) ocupacao ON true
       WHERE t.id = $1
       FOR UPDATE OF t`,
      [turmaId]
    );
    if (!result.rows[0]) {
      const error = new Error("Turma nao encontrada.");
      error.statusCode = 404;
      throw error;
    }
    turma = toPublic(result.rows[0]);
  }

  if (!turma.ativa) {
    const error = new Error("Esta turma nao esta recebendo novas inscricoes.");
    error.statusCode = 409;
    throw error;
  }
  if ((oficinaId && turma.oficinaId !== oficinaId) || (oficinaNome && turma.oficina !== oficinaNome)) {
    const error = new Error("A turma selecionada nao pertence a oficina informada.");
    error.statusCode = 400;
    throw error;
  }
  const studentAge = Number(idade);
  if (Number.isInteger(studentAge) && (studentAge < turma.idadeMinima || studentAge > turma.idadeMaxima)) {
    const error = new Error("A idade informada nao corresponde a faixa etaria desta turma. Selecione outra turma ou procure a equipe do Centro da Juventude.");
    error.statusCode = 400;
    throw error;
  }
  return {
    turma,
    status: turma.vagasDisponiveis > 0 ? "confirmada" : "lista_espera"
  };
}

async function summaryByOffice() {
  await ensureSchema();
  if (!db.hasDatabase) {
    return memory.reduce((acc, item) => {
      const current = acc.get(item.oficina_id) || { turmasAtivas: 0, capacidadeTotal: 0, ocupadasTotal: 0 };
      if (item.ativa) {
        current.turmasAtivas += 1;
        current.capacidadeTotal += Number(item.vagas_total || 0);
        current.ocupadasTotal += Number(item.vagas_ocupadas || 0);
      }
      acc.set(item.oficina_id, current);
      return acc;
    }, new Map());
  }
  const result = await db.query(
    `SELECT
       t.oficina_id,
       COUNT(*) FILTER (WHERE t.ativa = true)::int AS turmas_ativas,
       COALESCE(SUM(t.vagas_total) FILTER (WHERE t.ativa = true), 0)::int AS capacidade_total,
       COALESCE(SUM(ocupacao.total) FILTER (WHERE t.ativa = true), 0)::int AS ocupadas_total
     FROM turmas t
     LEFT JOIN LATERAL (${occupancySql("t")}) ocupacao ON true
     GROUP BY t.oficina_id`
  );
  return new Map(result.rows.map((row) => [row.oficina_id, {
    turmasAtivas: Number(row.turmas_ativas || 0),
    capacidadeTotal: Number(row.capacidade_total || 0),
    ocupadasTotal: Number(row.ocupadas_total || 0)
  }]));
}

module.exports = {
  findAll,
  findById,
  listPublicByOficina,
  toPublicSafe,
  create,
  update,
  setStatus,
  remove,
  linkedCount,
  activeCountForOffice,
  validateEnrollment,
  summaryByOffice,
  normalizeDias,
  normalizePeriodo,
  normalizeTime,
  periodAllowlist
};
