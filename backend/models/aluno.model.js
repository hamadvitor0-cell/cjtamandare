const crypto = require("crypto");
const db = require("../database/pool");
const config = require("../config/env");
const { normalizeCpf } = require("../utils/cpf");
const Turma = require("./turma.model");

const memory = [];
const memoryCancelledOffices = new Set();
let schemaEnsured = false;
const matriculaYear = Number(process.env.CJ_MATRICULA_YEAR || new Date().getFullYear());

function formatMatricula(sequence, year = matriculaYear) {
  return `CJ-${year}-${String(sequence).padStart(4, "0")}`;
}

function matriculaSequence(value) {
  const match = String(value || "").match(/^CJ-(\d{4})-(\d+)$/);
  return match ? Number(match[2]) : 0;
}

function ensureMemoryMatriculas() {
  let max = memory.reduce((highest, item) => Math.max(highest, matriculaSequence(item.matricula)), 0);
  memory
    .filter((item) => !item.matricula)
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.nome || "").localeCompare(String(b.nome || "")))
    .forEach((item) => {
      max += 1;
      item.matricula = formatMatricula(max);
    });
}

function nextMemoryMatricula() {
  ensureMemoryMatriculas();
  const max = memory.reduce((highest, item) => Math.max(highest, matriculaSequence(item.matricula)), 0);
  return formatMatricula(max + 1);
}

async function ensureDbMatriculas(client = db) {
  if (!db.hasDatabase) return;
  const prefix = `CJ-${matriculaYear}-`;
  await client.query("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS matricula TEXT");
  await client.query(
    `WITH current_max AS (
       SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(matricula, '^CJ-[0-9]{4}-', ''), '')::int), 0) AS value
       FROM alunos
       WHERE matricula ~ '^CJ-[0-9]{4}-[0-9]+$'
     ),
     missing AS (
       SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) + (SELECT value FROM current_max) AS sequence
       FROM alunos
       WHERE NULLIF(TRIM(COALESCE(matricula, '')), '') IS NULL
     )
     UPDATE alunos a
     SET matricula = $1 || LPAD(missing.sequence::text, 4, '0'),
         updated_at = NOW()
     FROM missing
     WHERE a.id = missing.id`,
    [prefix]
  );
  await client.query(`
    WITH current_max AS (
      SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(matricula, '^CJ-[0-9]{4}-', ''), '')::int), 0) AS value
      FROM alunos
      WHERE matricula ~ '^CJ-[0-9]{4}-[0-9]+$'
    ),
    duplicated AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) + (SELECT value FROM current_max) AS sequence
      FROM alunos
      WHERE matricula IN (
        SELECT matricula
        FROM alunos
        WHERE NULLIF(TRIM(COALESCE(matricula, '')), '') IS NOT NULL
        GROUP BY matricula
        HAVING COUNT(*) > 1
      )
      AND id NOT IN (
        SELECT DISTINCT ON (matricula) id
        FROM alunos
        WHERE NULLIF(TRIM(COALESCE(matricula, '')), '') IS NOT NULL
        ORDER BY matricula, created_at ASC, id ASC
      )
    )
    UPDATE alunos a
    SET matricula = $1 || LPAD(duplicated.sequence::text, 4, '0'),
        updated_at = NOW()
    FROM duplicated
    WHERE a.id = duplicated.id`,
    [prefix]
  );
  await client.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_alunos_matricula_unique ON alunos (matricula) WHERE matricula IS NOT NULL AND matricula <> ''");
  await client.query("CREATE INDEX IF NOT EXISTS idx_alunos_matricula_search ON alunos (matricula)");
}

async function nextDbMatricula(client) {
  const prefix = `CJ-${matriculaYear}-`;
  await client.query("SELECT pg_advisory_xact_lock(hashtext('cj_alunos_matricula'))");
  await ensureDbMatriculas(client);
  const result = await client.query(
    `SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(matricula, '^CJ-[0-9]{4}-', ''), '')::int), 0) AS max_sequence
     FROM alunos
     WHERE matricula ~ '^CJ-[0-9]{4}-[0-9]+$'`,
  );
  return `${prefix}${String(Number(result.rows[0]?.max_sequence || 0) + 1).padStart(4, "0")}`;
}

async function ensureSchema() {
  if (schemaEnsured || !db.hasDatabase || !config.runtimeDatabaseSetup) return;
  schemaEnsured = true;
  await Turma.summaryByOffice().catch(() => {});
  await db.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    ALTER TABLE alunos ADD COLUMN IF NOT EXISTS data_nascimento DATE;
    ALTER TABLE alunos ADD COLUMN IF NOT EXISTS matricula TEXT;
    ALTER TABLE alunos ADD COLUMN IF NOT EXISTS bairro TEXT;
    ALTER TABLE alunos ADD COLUMN IF NOT EXISTS turmas TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE alunos ADD COLUMN IF NOT EXISTS documentos_links TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE alunos ADD COLUMN IF NOT EXISTS possui_deficiencia BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE alunos ADD COLUMN IF NOT EXISTS deficiencia_descricao TEXT;
    ALTER TABLE alunos ADD COLUMN IF NOT EXISTS origem TEXT;
    ALTER TABLE alunos ADD COLUMN IF NOT EXISTS turma_id UUID REFERENCES turmas(id) ON DELETE SET NULL;
    ALTER TABLE alunos ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE alunos DROP CONSTRAINT IF EXISTS alunos_idade_check;
    ALTER TABLE alunos ADD CONSTRAINT alunos_idade_check CHECK (idade IS NULL OR idade BETWEEN 0 AND 99);
    CREATE TABLE IF NOT EXISTS aluno_oficina_cancelamentos (
      aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
      oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
      cancelled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (aluno_id, oficina_id)
    );
    CREATE TABLE IF NOT EXISTS aluno_turmas (
      aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
      turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (aluno_id, turma_id)
    );
    CREATE INDEX IF NOT EXISTS idx_aluno_turmas_turma ON aluno_turmas (turma_id, aluno_id);
  `);
  await ensureDbMatriculas();
}

function officeCancellationKey(alunoId, oficinaId) {
  return `${alunoId}:${oficinaId}`;
}

function normalizeTextArray(value = []) {
  if (Array.isArray(value)) return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
  return String(value || "")
    .split(/[\n;,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOfficeIds(payload = {}) {
  const ids = Array.isArray(payload.oficinaIds) ? payload.oficinaIds : [];
  if (!ids.length && payload.oficinaId) ids.push(payload.oficinaId);
  return Array.from(new Set(ids.filter(Boolean)));
}

function normalizeTurmaId(payload = {}) {
  return String(payload.turmaId || payload.turma_id || "").trim();
}

function normalizeTurmaIds(payload = {}) {
  const ids = Array.isArray(payload.turmaIds) ? payload.turmaIds : [];
  const primary = normalizeTurmaId(payload);
  if (primary) ids.unshift(primary);
  return Array.from(new Set(ids.map((item) => String(item || "").trim()).filter(Boolean)));
}

async function validateTurmaSelection(turmaId, oficinaIds = [], idade, client = db) {
  if (!turmaId) return null;
  const turma = await Turma.findById(turmaId, client);
  if (!turma) {
    const error = new Error("Turma nao encontrada.");
    error.statusCode = 404;
    throw error;
  }
  if (!turma.ativa) {
    const error = new Error("Esta turma esta inativa e nao aceita novos vinculos.");
    error.statusCode = 409;
    throw error;
  }
  if (oficinaIds.length && !oficinaIds.includes(turma.oficinaId)) {
    const error = new Error("A turma selecionada nao pertence a oficina informada.");
    error.statusCode = 400;
    throw error;
  }
  const idadeNumero = Number(idade);
  if (Number.isInteger(idadeNumero) && (idadeNumero < turma.idadeMinima || idadeNumero > turma.idadeMaxima)) {
    const error = new Error("A idade informada nao corresponde a faixa etaria desta turma.");
    error.statusCode = 400;
    throw error;
  }
  return turma;
}

async function validateTurmaSelections(turmaIds = [], oficinaIds = [], idade, client = db) {
  const turmas = [];
  const oficinaByTurma = new Map();
  for (const turmaId of turmaIds) {
    const turma = await validateTurmaSelection(turmaId, oficinaIds, idade, client);
    if (!turma) continue;
    if (oficinaByTurma.has(turma.oficinaId)) {
      const error = new Error("Selecione apenas uma turma por oficina.");
      error.statusCode = 400;
      throw error;
    }
    oficinaByTurma.set(turma.oficinaId, turma.id);
    turmas.push(turma);
  }
  return turmas;
}

async function requireTurmasForAvailableOffices(selectedTurmas = [], oficinaIds = [], idade, client = db) {
  if (!oficinaIds.length) return;
  const selectedOfficeIds = new Set(selectedTurmas.map((turma) => turma.oficinaId));
  const idadeNumero = Number(idade);
  const hasAge = Number.isInteger(idadeNumero);

  let availableOfficeIds = [];
  if (!db.hasDatabase) {
    const turmas = await Turma.findAll({ includeInactive: false });
    availableOfficeIds = Array.from(new Set(turmas
      .filter((turma) => oficinaIds.includes(turma.oficinaId))
      .filter((turma) => !hasAge || (idadeNumero >= turma.idadeMinima && idadeNumero <= turma.idadeMaxima))
      .map((turma) => turma.oficinaId)));
  } else {
    const result = await client.query(
      `SELECT DISTINCT oficina_id
       FROM turmas
       WHERE ativa = true
         AND oficina_id = ANY($1::uuid[])
         AND ($2::int IS NULL OR ($2::int BETWEEN idade_minima AND idade_maxima))`,
      [oficinaIds, hasAge ? idadeNumero : null]
    );
    availableOfficeIds = result.rows.map((row) => row.oficina_id);
  }

  const missing = availableOfficeIds.find((oficinaId) => !selectedOfficeIds.has(oficinaId));
  if (missing) {
    const error = new Error("Selecione uma turma compativel para cada oficina escolhida.");
    error.statusCode = 400;
    throw error;
  }
}

async function officeNamesForMemory(oficinaIds) {
  if (!oficinaIds.length) return [];
  const Oficina = require("./oficina.model");
  const oficinas = await Oficina.findAll({ includeInactive: true });
  return oficinaIds
    .map((oficinaId) => oficinas.find((oficina) => oficina.id === oficinaId)?.nome)
    .filter(Boolean);
}

function toPublic(row) {
  const oficinaIds = row.oficina_ids || row.oficinaIds || (row.oficina_id ? [row.oficina_id] : []);
  const oficinas = row.oficinas || (row.oficina_nome ? [row.oficina_nome] : []);
  const turmaAtual = row.turma_nome || row.turmaNome || "";
  const turmaIds = row.turma_ids || row.turmaIds || [];
  const turmaNomes = normalizeTextArray(row.turma_nomes || row.turmaNomes);
  const turmas = normalizeTextArray(row.turmas);
  const oficinaCreatedAts = row.oficina_created_ats || row.oficinaCreatedAts || [];
  const oficinaDetalhes = oficinas.map((oficina, index) => ({
    oficina,
    oficinaId: oficinaIds[index] || "",
    createdAt: oficinaCreatedAts[index] || row.created_at,
    source: "aluno"
  }));
  return {
    id: row.id,
    matricula: row.matricula || "",
    nome: row.nome,
    cpf: row.cpf || "",
    idade: row.idade === null || row.idade === undefined ? "" : Number(row.idade),
    telefone: row.telefone || "",
    responsavel: row.responsavel || "",
    email: row.email || "",
    dataNascimento: row.data_nascimento || row.dataNascimento || "",
    bairro: row.bairro || "",
    turmaId: row.turma_id || row.turmaId || "",
    turmaIds: turmaIds.length ? turmaIds : [row.turma_id || row.turmaId || ""].filter(Boolean),
    turmaNome: turmaAtual,
    turmas: turmaNomes.length ? turmaNomes : (turmas.length ? turmas : (turmaAtual ? [turmaAtual] : [])),
    documentosLinks: normalizeTextArray(row.documentos_links || row.documentosLinks),
    possuiDeficiencia: Boolean(row.possui_deficiencia ?? row.possuiDeficiencia),
    deficienciaDescricao: row.deficiencia_descricao || row.deficienciaDescricao || "",
    origem: row.origem || "",
    oficinaId: oficinaIds[0] || "",
    oficinaIds,
    oficina: oficinas[0] || "",
    oficinas,
    oficinaDetalhes,
    status: row.status || "ativo",
    tokenVersion: Number(row.token_version ?? row.tokenVersion ?? 0),
    documentosPendentes: Boolean(row.documentos_pendentes ?? row.documentosPendentes),
    advertencias: row.advertencias || "",
    historicoOficinas: row.historico_oficinas || row.historicoOficinas || "",
    faltasUltimos30Dias: Number(row.faltas_ultimos_30_dias ?? row.faltasUltimos30Dias ?? 0),
    ultimasChamadas: Array.isArray(row.ultimas_chamadas) ? row.ultimas_chamadas : (row.ultimasChamadas || []),
    observacoes: row.observacoes || "",
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function attachOffices(client, alunoId, oficinaIds) {
  if (oficinaIds.length) {
    await client.query(
      "DELETE FROM aluno_oficina_cancelamentos WHERE aluno_id = $1 AND oficina_id = ANY($2::uuid[])",
      [alunoId, oficinaIds]
    );
  }
  await client.query("DELETE FROM aluno_oficinas WHERE aluno_id = $1", [alunoId]);
  for (const oficinaId of oficinaIds) {
    await client.query(
      "INSERT INTO aluno_oficinas (aluno_id, oficina_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [alunoId, oficinaId]
    );
  }
  await client.query("UPDATE alunos SET oficina_id = $1 WHERE id = $2", [oficinaIds[0] || null, alunoId]);
}

async function findAll(filters = {}) {
  await ensureSchema();
  const search = String(filters.search || "").toLowerCase();
  const oficinaId = String(filters.oficinaId || filters.oficina_id || "");
  const id = String(filters.id || "");

  if (!db.hasDatabase) {
    ensureMemoryMatriculas();
    const normalizedSearchPhone = search.replace(/\D/g, "");
    return memory
      .filter((item) => {
        const matchesId = !id || item.id === id;
        const matchesSearch = !search
          || item.nome.toLowerCase().includes(search)
          || String(item.matricula || "").toLowerCase().includes(search)
          || (normalizedSearchPhone && String(item.cpf || "").includes(normalizedSearchPhone))
          || (normalizedSearchPhone && item.telefone.replace(/\D/g, "").includes(normalizedSearchPhone))
          || String(item.bairro || "").toLowerCase().includes(search)
          || String(item.responsavel || "").toLowerCase().includes(search)
          || normalizeTextArray(item.turmas).some((turma) => turma.toLowerCase().includes(search))
          || item.email.toLowerCase().includes(search);
        const matchesOficina = !oficinaId || item.oficina_ids.includes(oficinaId);
        return matchesId && matchesSearch && matchesOficina;
      })
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map(toPublic);
  }

  const where = [];
  const params = [];

  if (id) {
    params.push(id);
    where.push(`a.id = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    const index = params.length;
    where.push(`(
      LOWER(a.nome) LIKE $${index}
      OR LOWER(COALESCE(a.matricula, '')) LIKE $${index}
      OR a.cpf LIKE REGEXP_REPLACE($${index}, '\\D', '', 'g')
      OR LOWER(COALESCE(a.email, '')) LIKE $${index}
      OR LOWER(COALESCE(a.bairro, '')) LIKE $${index}
      OR LOWER(COALESCE(a.responsavel, '')) LIKE $${index}
      OR LOWER(COALESCE(turma_atual.nome, '')) LIKE $${index}
      OR EXISTS (
        SELECT 1
        FROM aluno_turmas busca_at
        INNER JOIN turmas busca_turma ON busca_turma.id = busca_at.turma_id
        WHERE busca_at.aluno_id = a.id AND LOWER(busca_turma.nome) LIKE $${index}
      )
      OR EXISTS (SELECT 1 FROM unnest(COALESCE(a.turmas, '{}')) AS turma WHERE LOWER(turma) LIKE $${index})
      OR REGEXP_REPLACE(COALESCE(a.telefone, ''), '\\D', '', 'g') LIKE REGEXP_REPLACE($${index}, '\\D', '', 'g')
    )`);
  }

  if (oficinaId) {
    params.push(oficinaId);
    where.push(`EXISTS (
      SELECT 1 FROM aluno_oficinas filtro
      WHERE filtro.aluno_id = a.id AND filtro.oficina_id = $${params.length}
    )`);
  }

  const result = await db.query(
    `SELECT a.id, a.matricula, a.nome, a.idade, a.telefone, a.responsavel, a.email, a.oficina_id,
            a.cpf, a.status, a.documentos_pendentes, a.advertencias, a.historico_oficinas, a.observacoes, a.created_at, a.updated_at,
            a.data_nascimento, a.bairro, a.turmas, a.turma_id, turma_atual.nome AS turma_nome,
            a.documentos_links, a.possui_deficiencia, a.deficiencia_descricao, a.origem, a.token_version,
            (
              SELECT COUNT(*)::int
              FROM presencas p
              INNER JOIN chamadas c ON c.id = p.chamada_id
              WHERE p.aluno_id = a.id
                AND p.status = 'ausente'
                AND c.data_chamada >= CURRENT_DATE - INTERVAL '30 days'
            ) AS faltas_ultimos_30_dias,
            (
              SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'oficina', historico.oficina,
                'data', historico.data_chamada,
                'status', historico.status,
                'observacao', historico.observacao
              ) ORDER BY historico.data_chamada DESC), '[]'::jsonb)
              FROM (
                SELECT o2.nome AS oficina, c2.data_chamada, p2.status, COALESCE(p2.observacao, '') AS observacao
                FROM presencas p2
                INNER JOIN chamadas c2 ON c2.id = p2.chamada_id
                LEFT JOIN oficinas o2 ON o2.id = c2.oficina_id
                WHERE p2.aluno_id = a.id
                ORDER BY c2.data_chamada DESC
                LIMIT 8
              ) historico
            ) AS ultimas_chamadas,
            COALESCE(
              ARRAY_AGG(ao.oficina_id ORDER BY o.nome) FILTER (WHERE ao.oficina_id IS NOT NULL),
              ARRAY[]::uuid[]
            ) AS oficina_ids,
            COALESCE(
              ARRAY_AGG(o.nome ORDER BY o.nome) FILTER (WHERE o.nome IS NOT NULL),
              ARRAY[]::text[]
            ) AS oficinas,
            COALESCE(
              ARRAY_AGG(ao.created_at ORDER BY o.nome) FILTER (WHERE ao.created_at IS NOT NULL),
              ARRAY[]::timestamptz[]
            ) AS oficina_created_ats,
            (
              SELECT COALESCE(ARRAY_AGG(at.turma_id ORDER BY turma_vinculada.nome), ARRAY[]::uuid[])
              FROM aluno_turmas at
              INNER JOIN turmas turma_vinculada ON turma_vinculada.id = at.turma_id
              WHERE at.aluno_id = a.id
            ) AS turma_ids,
            (
              SELECT COALESCE(ARRAY_AGG(turma_vinculada.nome ORDER BY turma_vinculada.nome), ARRAY[]::text[])
              FROM aluno_turmas at
              INNER JOIN turmas turma_vinculada ON turma_vinculada.id = at.turma_id
              WHERE at.aluno_id = a.id
            ) AS turma_nomes
     FROM alunos a
     LEFT JOIN turmas turma_atual ON turma_atual.id = a.turma_id
     LEFT JOIN aluno_oficinas ao ON ao.aluno_id = a.id
     LEFT JOIN oficinas o ON o.id = ao.oficina_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY a.id, turma_atual.nome
     ORDER BY a.nome ASC
     LIMIT 800`,
    params
  );

  return result.rows.map(toPublic);
}

async function findPage(filters = {}) {
  await ensureSchema();
  const page = Math.max(Number(filters.page || 1), 1);
  const limit = Math.min(Math.max(Number(filters.limit || 20), 1), 100);
  const search = String(filters.search || "").trim().toLowerCase();
  const oficinaId = String(filters.oficinaId || filters.oficina_id || "");
  const status = String(filters.status || "");
  const sort = String(filters.sort || "nome") === "recentes" ? "recentes" : "nome";

  if (!db.hasDatabase) {
    const rows = await findAll({ search, oficinaId });
    const filtered = status ? rows.filter((item) => item.status === status) : rows;
    if (sort === "recentes") filtered.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    const total = filtered.length;
    return {
      alunos: filtered.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) }
    };
  }

  const where = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    const index = params.length;
    where.push(`(
      LOWER(a.nome) LIKE $${index}
      OR LOWER(COALESCE(a.matricula, '')) LIKE $${index}
      OR a.cpf LIKE REGEXP_REPLACE($${index}, '\\D', '', 'g')
      OR REGEXP_REPLACE(COALESCE(a.telefone, ''), '\\D', '', 'g') LIKE REGEXP_REPLACE($${index}, '\\D', '', 'g')
      OR EXISTS (
        SELECT 1 FROM aluno_oficinas busca_ao
        INNER JOIN oficinas busca_o ON busca_o.id = busca_ao.oficina_id
        WHERE busca_ao.aluno_id = a.id AND LOWER(busca_o.nome) LIKE $${index}
      )
      OR EXISTS (
        SELECT 1 FROM aluno_turmas busca_at
        INNER JOIN turmas busca_t ON busca_t.id = busca_at.turma_id
        WHERE busca_at.aluno_id = a.id AND LOWER(busca_t.nome) LIKE $${index}
      )
    )`);
  }
  if (oficinaId) {
    params.push(oficinaId);
    where.push(`EXISTS (SELECT 1 FROM aluno_oficinas filtro WHERE filtro.aluno_id = a.id AND filtro.oficina_id = $${params.length})`);
  }
  if (status) {
    params.push(status);
    where.push(`a.status = $${params.length}`);
  }
  params.push(limit, (page - 1) * limit);
  const limitIndex = params.length - 1;
  const offsetIndex = params.length;
  const orderSql = sort === "recentes" ? "a.created_at DESC, a.nome ASC" : "a.nome ASC, a.created_at DESC";
  const result = await db.query(
    `SELECT a.id, a.matricula, a.nome, a.cpf, a.telefone, a.status, a.documentos_pendentes,
            a.created_at, a.updated_at, turma_atual.nome AS turma_nome,
            COALESCE((
              SELECT ARRAY_AGG(ao.oficina_id ORDER BY o.nome)
              FROM aluno_oficinas ao
              INNER JOIN oficinas o ON o.id = ao.oficina_id
              WHERE ao.aluno_id = a.id
            ), ARRAY[]::uuid[]) AS oficina_ids,
            COALESCE((
              SELECT ARRAY_AGG(o.nome ORDER BY o.nome)
              FROM aluno_oficinas ao
              INNER JOIN oficinas o ON o.id = ao.oficina_id
              WHERE ao.aluno_id = a.id
            ), ARRAY[]::text[]) AS oficinas,
            COALESCE((
              SELECT ARRAY_AGG(at.turma_id ORDER BY t.nome)
              FROM aluno_turmas at
              INNER JOIN turmas t ON t.id = at.turma_id
              WHERE at.aluno_id = a.id
            ), ARRAY[]::uuid[]) AS turma_ids,
            COUNT(*) OVER()::int AS total_count
     FROM alunos a
     LEFT JOIN turmas turma_atual ON turma_atual.id = a.turma_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ${orderSql}
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    params
  );
  const total = Number(result.rows[0]?.total_count || 0);
  return {
    alunos: result.rows.map(toPublic),
    pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) }
  };
}

async function create(payload) {
  await ensureSchema();
  const oficinaIds = normalizeOfficeIds(payload);
  const cpf = normalizeCpf(payload.cpf);
  const turmas = normalizeTextArray(payload.turmas);
  const turmaIds = normalizeTurmaIds(payload);
  const documentosLinks = normalizeTextArray(payload.documentosLinks || payload.documentos_links);
  const selectedTurmasMemory = !db.hasDatabase ? await validateTurmaSelections(turmaIds, oficinaIds, payload.idade) : [];
  if (!db.hasDatabase) await requireTurmasForAvailableOffices(selectedTurmasMemory, oficinaIds, payload.idade);
  const selectedTurmaMemory = selectedTurmasMemory[0] || null;
  const selectedTurmaNamesMemory = selectedTurmasMemory.map((turma) => turma.nome);

  if (!db.hasDatabase) {
    const existingIndex = cpf ? memory.findIndex((item) => item.cpf === cpf) : -1;
    if (existingIndex !== -1) {
      const oficinas = await officeNamesForMemory(oficinaIds);
      oficinaIds.forEach((oficinaId) => memoryCancelledOffices.delete(officeCancellationKey(memory[existingIndex].id, oficinaId)));
      memory[existingIndex] = {
        ...memory[existingIndex],
        matricula: memory[existingIndex].matricula || nextMemoryMatricula(),
        nome: payload.nome,
        idade: payload.idade || null,
        telefone: payload.telefone || "",
        responsavel: payload.responsavel || "",
        email: payload.email || "",
        data_nascimento: payload.dataNascimento || payload.data_nascimento || memory[existingIndex].data_nascimento || null,
        bairro: payload.bairro || memory[existingIndex].bairro || "",
        turma_id: selectedTurmaMemory?.id || "",
        turma_ids: selectedTurmasMemory.map((turma) => turma.id),
        turma_nome: selectedTurmaMemory?.nome || memory[existingIndex].turma_nome || "",
        turmas: Array.from(new Set([...(selectedTurmaNamesMemory.length ? selectedTurmaNamesMemory : turmas)].filter(Boolean))),
        documentos_links: Array.from(new Set([...(memory[existingIndex].documentos_links || []), ...documentosLinks])),
        possui_deficiencia: payload.possuiDeficiencia ?? payload.possui_deficiencia ?? memory[existingIndex].possui_deficiencia ?? false,
        deficiencia_descricao: payload.deficienciaDescricao || payload.deficiencia_descricao || memory[existingIndex].deficiencia_descricao || "",
        origem: payload.origem || memory[existingIndex].origem || "",
        oficina_id: oficinaIds[0] || memory[existingIndex].oficina_id || "",
        oficina_ids: Array.from(new Set([...(memory[existingIndex].oficina_ids || []), ...oficinaIds])),
        oficinas: Array.from(new Set([...(memory[existingIndex].oficinas || []), ...oficinas])),
        status: payload.status || "ativo",
        token_version: Number(memory[existingIndex].token_version || 0) + (
          memory[existingIndex].status !== (payload.status || "ativo") ? 1 : 0
        ),
        documentos_pendentes: payload.documentosPendentes ?? memory[existingIndex].documentos_pendentes ?? false,
        advertencias: payload.advertencias || memory[existingIndex].advertencias || "",
        historico_oficinas: payload.historicoOficinas || payload.historico_oficinas || memory[existingIndex].historico_oficinas || "",
        observacoes: payload.observacoes || memory[existingIndex].observacoes || "",
        updated_at: new Date().toISOString()
      };
      return toPublic(memory[existingIndex]);
    }

    const now = new Date().toISOString();
    const oficinas = await officeNamesForMemory(oficinaIds);
    const record = {
      id: crypto.randomUUID(),
      matricula: nextMemoryMatricula(),
      nome: payload.nome,
      cpf,
      idade: payload.idade || null,
      telefone: payload.telefone || "",
      responsavel: payload.responsavel || "",
      email: payload.email || "",
      data_nascimento: payload.dataNascimento || payload.data_nascimento || null,
      bairro: payload.bairro || "",
      turma_id: selectedTurmaMemory?.id || "",
      turma_ids: selectedTurmasMemory.map((turma) => turma.id),
      turma_nome: selectedTurmaMemory?.nome || "",
      turmas: Array.from(new Set([...(selectedTurmaNamesMemory.length ? selectedTurmaNamesMemory : turmas)].filter(Boolean))),
      documentos_links: documentosLinks,
      possui_deficiencia: payload.possuiDeficiencia ?? payload.possui_deficiencia ?? false,
      deficiencia_descricao: payload.deficienciaDescricao || payload.deficiencia_descricao || "",
      origem: payload.origem || "",
      oficina_id: oficinaIds[0] || "",
      oficina_ids: oficinaIds,
      oficinas,
      status: payload.status || "ativo",
      token_version: 0,
      documentos_pendentes: payload.documentosPendentes === true,
      advertencias: payload.advertencias || "",
      historico_oficinas: payload.historicoOficinas || payload.historico_oficinas || "",
      observacoes: payload.observacoes || "",
      created_at: now,
      updated_at: now
    };
    memory.push(record);
    return toPublic(record);
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    let alunoId = "";
    let mergedOfficeIds = oficinaIds;
    const existing = cpf
      ? await client.query("SELECT id, matricula FROM alunos WHERE cpf = $1 FOR UPDATE", [cpf])
      : { rows: [] };

    if (existing.rows[0]) {
      alunoId = existing.rows[0].id;
      const matricula = existing.rows[0].matricula || await nextDbMatricula(client);
      const currentOffices = await client.query(
        "SELECT oficina_id FROM aluno_oficinas WHERE aluno_id = $1",
        [alunoId]
      );
      mergedOfficeIds = Array.from(new Set([
        ...currentOffices.rows.map((row) => row.oficina_id).filter(Boolean),
        ...oficinaIds
      ]));
      const selectedTurmas = await validateTurmaSelections(turmaIds, mergedOfficeIds, payload.idade, client);
      await requireTurmasForAvailableOffices(selectedTurmas, mergedOfficeIds, payload.idade, client);
      const selectedTurma = selectedTurmas[0] || null;
      const selectedTurmaNames = selectedTurmas.map((turma) => turma.nome);
      const turmaTexts = selectedTurmaNames.length ? selectedTurmaNames : turmas;

      await client.query(
        `UPDATE alunos
         SET nome = $1,
             idade = $2,
             telefone = $3,
             responsavel = $4,
             email = $5,
             oficina_id = $6,
             status = $7,
             documentos_pendentes = $8,
             advertencias = COALESCE(NULLIF($9, ''), advertencias),
             historico_oficinas = COALESCE(NULLIF($10, ''), historico_oficinas),
             observacoes = COALESCE(NULLIF($11, ''), observacoes),
             data_nascimento = COALESCE($12, data_nascimento),
             bairro = COALESCE(NULLIF($13, ''), bairro),
             turmas = CASE WHEN cardinality($14::text[]) > 0 THEN (
               SELECT ARRAY(SELECT DISTINCT item FROM unnest(COALESCE(alunos.turmas, '{}') || $14::text[]) AS item WHERE item <> '')
             ) ELSE turmas END,
             documentos_links = CASE WHEN cardinality($15::text[]) > 0 THEN (
               SELECT ARRAY(SELECT DISTINCT item FROM unnest(COALESCE(alunos.documentos_links, '{}') || $15::text[]) AS item WHERE item <> '')
             ) ELSE documentos_links END,
             possui_deficiencia = COALESCE($16, possui_deficiencia),
             deficiencia_descricao = COALESCE(NULLIF($17, ''), deficiencia_descricao),
             origem = COALESCE(NULLIF($18, ''), origem),
             matricula = COALESCE(NULLIF($19, ''), matricula),
             turma_id = $20,
             token_version = token_version + CASE WHEN status IS DISTINCT FROM $7 THEN 1 ELSE 0 END,
             updated_at = NOW()
         WHERE id = $21`,
        [
          payload.nome,
          payload.idade || null,
          payload.telefone || null,
          payload.responsavel || null,
          payload.email || null,
          mergedOfficeIds[0] || null,
          payload.status || "ativo",
          payload.documentosPendentes === true,
          payload.advertencias || null,
          payload.historicoOficinas || payload.historico_oficinas || null,
          payload.observacoes || null,
          payload.dataNascimento || payload.data_nascimento || null,
          payload.bairro || null,
          turmaTexts,
          documentosLinks,
          payload.possuiDeficiencia ?? payload.possui_deficiencia ?? null,
          payload.deficienciaDescricao || payload.deficiencia_descricao || null,
          payload.origem || null,
          matricula,
          selectedTurma?.id || null,
          alunoId
        ]
      );
      await attachTurmas(client, alunoId, selectedTurmas.map((turma) => turma.id));
    } else {
      const matricula = await nextDbMatricula(client);
      const selectedTurmas = await validateTurmaSelections(turmaIds, mergedOfficeIds, payload.idade, client);
      await requireTurmasForAvailableOffices(selectedTurmas, mergedOfficeIds, payload.idade, client);
      const selectedTurma = selectedTurmas[0] || null;
      const selectedTurmaNames = selectedTurmas.map((turma) => turma.nome);
      const turmaTexts = selectedTurmaNames.length ? selectedTurmaNames : turmas;
      const result = await client.query(
        `INSERT INTO alunos (nome, cpf, matricula, idade, telefone, responsavel, email, oficina_id, status, documentos_pendentes, advertencias, historico_oficinas, observacoes, data_nascimento, bairro, turmas, documentos_links, possui_deficiencia, deficiencia_descricao, origem, turma_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         RETURNING id`,
        [
          payload.nome,
          cpf || null,
          matricula,
          payload.idade || null,
          payload.telefone || null,
          payload.responsavel || null,
          payload.email || null,
          mergedOfficeIds[0] || null,
          payload.status || "ativo",
          payload.documentosPendentes === true,
          payload.advertencias || null,
          payload.historicoOficinas || payload.historico_oficinas || null,
          payload.observacoes || null,
          payload.dataNascimento || payload.data_nascimento || null,
          payload.bairro || null,
          turmaTexts,
          documentosLinks,
          payload.possuiDeficiencia ?? payload.possui_deficiencia ?? false,
          payload.deficienciaDescricao || payload.deficiencia_descricao || null,
          payload.origem || null,
          selectedTurma?.id || null
        ]
      );
      alunoId = result.rows[0].id;
      await attachTurmas(client, alunoId, selectedTurmas.map((turma) => turma.id));
    }

    await attachOffices(client, alunoId, mergedOfficeIds);
    await client.query("COMMIT");
    return (await findAll({ search: payload.nome })).find((item) => item.id === alunoId);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505" && String(error.constraint || "").includes("cpf")) {
      const conflict = new Error("Este CPF já está vinculado a outro aluno.");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function attachTurmas(client, alunoId, turmaIds = []) {
  if (!db.hasDatabase) return;
  await client.query("DELETE FROM aluno_turmas WHERE aluno_id = $1", [alunoId]);
  for (const turmaId of turmaIds) {
    await client.query(
      `INSERT INTO aluno_turmas (aluno_id, turma_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [alunoId, turmaId]
    );
  }
}

async function update(id, payload) {
  await ensureSchema();
  const oficinaIds = normalizeOfficeIds(payload);
  const cpf = normalizeCpf(payload.cpf);
  const turmas = normalizeTextArray(payload.turmas);
  const turmaIds = normalizeTurmaIds(payload);
  const documentosLinks = normalizeTextArray(payload.documentosLinks || payload.documentos_links);

  if (!db.hasDatabase) {
    ensureMemoryMatriculas();
    const index = memory.findIndex((item) => item.id === id);
    if (index === -1) return null;
    if (cpf && memory.some((item) => item.id !== id && item.cpf === cpf)) {
      const error = new Error("Este CPF já está vinculado a outro aluno.");
      error.statusCode = 409;
      throw error;
    }
    const oficinas = await officeNamesForMemory(oficinaIds);
    const selectedTurmas = await validateTurmaSelections(turmaIds, oficinaIds, payload.idade);
    await requireTurmasForAvailableOffices(selectedTurmas, oficinaIds, payload.idade);
    const selectedTurma = selectedTurmas[0] || null;
    const selectedTurmaNames = selectedTurmas.map((turma) => turma.nome);
    oficinaIds.forEach((oficinaId) => memoryCancelledOffices.delete(officeCancellationKey(id, oficinaId)));
    memory[index] = {
      ...memory[index],
      matricula: memory[index].matricula || nextMemoryMatricula(),
      nome: payload.nome,
      cpf,
      idade: payload.idade || null,
      telefone: payload.telefone || "",
      responsavel: payload.responsavel || "",
      email: payload.email || "",
      data_nascimento: payload.dataNascimento || payload.data_nascimento || null,
      bairro: payload.bairro || "",
      turma_id: selectedTurma?.id || "",
      turma_ids: selectedTurmas.map((turma) => turma.id),
      turma_nome: selectedTurma?.nome || memory[index].turma_nome || "",
      turmas: Array.from(new Set([...(selectedTurmaNames.length ? selectedTurmaNames : turmas)].filter(Boolean))),
      documentos_links: documentosLinks,
      possui_deficiencia: payload.possuiDeficiencia ?? payload.possui_deficiencia ?? false,
      deficiencia_descricao: payload.deficienciaDescricao || payload.deficiencia_descricao || "",
      origem: payload.origem || "",
      oficina_id: oficinaIds[0] || "",
      oficina_ids: oficinaIds,
      oficinas,
      status: payload.status || "ativo",
      token_version: Number(memory[index].token_version || 0) + (
        memory[index].status !== (payload.status || "ativo") ? 1 : 0
      ),
      documentos_pendentes: payload.documentosPendentes === true,
      advertencias: payload.advertencias || "",
      historico_oficinas: payload.historicoOficinas || payload.historico_oficinas || "",
      observacoes: payload.observacoes || "",
      updated_at: new Date().toISOString()
    };
    return toPublic(memory[index]);
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const selectedTurmas = await validateTurmaSelections(turmaIds, oficinaIds, payload.idade, client);
    await requireTurmasForAvailableOffices(selectedTurmas, oficinaIds, payload.idade, client);
    const selectedTurma = selectedTurmas[0] || null;
    const selectedTurmaNames = selectedTurmas.map((turma) => turma.nome);
    const turmaTexts = selectedTurmaNames.length ? selectedTurmaNames : turmas;
    const result = await client.query(
      `UPDATE alunos
       SET nome = $1,
           cpf = $2,
           idade = $3,
           telefone = $4,
           responsavel = $5,
           email = $6,
           oficina_id = $7,
           status = $8,
           documentos_pendentes = $9,
           advertencias = $10,
           historico_oficinas = $11,
           observacoes = $12,
           data_nascimento = $13,
           bairro = $14,
           turmas = $15,
           documentos_links = $16,
           possui_deficiencia = $17,
           deficiencia_descricao = $18,
           origem = $19,
           turma_id = $20,
           token_version = token_version + CASE WHEN status IS DISTINCT FROM $8 THEN 1 ELSE 0 END,
           updated_at = NOW()
       WHERE id = $21
       RETURNING id`,
      [
        payload.nome,
        cpf || null,
        payload.idade || null,
        payload.telefone || null,
        payload.responsavel || null,
        payload.email || null,
        oficinaIds[0] || null,
        payload.status || "ativo",
        payload.documentosPendentes === true,
        payload.advertencias || null,
        payload.historicoOficinas || payload.historico_oficinas || null,
        payload.observacoes || null,
        payload.dataNascimento || payload.data_nascimento || null,
        payload.bairro || null,
        turmaTexts,
        documentosLinks,
        payload.possuiDeficiencia ?? payload.possui_deficiencia ?? false,
        payload.deficienciaDescricao || payload.deficiencia_descricao || null,
        payload.origem || null,
        selectedTurma?.id || null,
        id
      ]
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    await attachOffices(client, id, oficinaIds);
    await attachTurmas(client, id, selectedTurmas.map((turma) => turma.id));
    await client.query("COMMIT");
    return (await findAll({ search: payload.nome })).find((item) => item.id === id);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505" && String(error.constraint || "").includes("cpf")) {
      const conflict = new Error("Este CPF já está vinculado a outro aluno.");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function cancelOfficeEnrollment(id, oficinaId) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const student = memory.find((item) => item.id === id);
    if (!student || !(student.oficina_ids || []).includes(oficinaId)) return null;
    memoryCancelledOffices.add(officeCancellationKey(id, oficinaId));
    student.oficina_ids = (student.oficina_ids || []).filter((value) => value !== oficinaId);
    student.oficina_id = student.oficina_ids[0] || "";
    if (student.turma_id) {
      const turma = await Turma.findById(student.turma_id).catch(() => null);
      if (turma?.oficinaId === oficinaId) {
        student.turma_id = "";
        student.turma_nome = "";
      }
    }
    student.turma_ids = (student.turma_ids || []).filter((turmaId) => {
      const turma = (student.turma_details || []).find((item) => item.id === turmaId);
      return turma?.oficinaId !== oficinaId;
    });
    student.oficinas = await officeNamesForMemory(student.oficina_ids);
    student.updated_at = new Date().toISOString();
    return toPublic(student);
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const linked = await client.query(
      "SELECT 1 FROM aluno_oficinas WHERE aluno_id = $1 AND oficina_id = $2 FOR UPDATE",
      [id, oficinaId]
    );
    if (!linked.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      `INSERT INTO aluno_oficina_cancelamentos (aluno_id, oficina_id, cancelled_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (aluno_id, oficina_id) DO UPDATE SET cancelled_at = NOW()`,
      [id, oficinaId]
    );
    await client.query(
      "DELETE FROM aluno_oficinas WHERE aluno_id = $1 AND oficina_id = $2",
      [id, oficinaId]
    );
    await client.query(
      `DELETE FROM aluno_turmas at
       USING turmas t
       WHERE at.turma_id = t.id
         AND at.aluno_id = $1
         AND t.oficina_id = $2`,
      [id, oficinaId]
    );
    await client.query(
      `UPDATE alunos
       SET oficina_id = CASE
             WHEN oficina_id = $2 THEN (
               SELECT ao.oficina_id
               FROM aluno_oficinas ao
               WHERE ao.aluno_id = $1
               ORDER BY ao.created_at ASC
               LIMIT 1
             )
             ELSE oficina_id
           END,
           turma_id = CASE
             WHEN EXISTS (SELECT 1 FROM turmas turma_cancelada WHERE turma_cancelada.id = alunos.turma_id AND turma_cancelada.oficina_id = $2)
             THEN NULL
             ELSE turma_id
           END,
           updated_at = NOW()
       WHERE id = $1`,
      [id, oficinaId]
    );
    await client.query("COMMIT");
    return findById(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function remove(id) {
  if (!db.hasDatabase) {
    const index = memory.findIndex((item) => item.id === id);
    if (index === -1) return false;
    memory.splice(index, 1);
    return true;
  }

  const result = await db.query("DELETE FROM alunos WHERE id = $1", [id]);
  return result.rowCount > 0;
}

async function findById(id) {
  await ensureSchema();
  if (!db.hasDatabase) {
    ensureMemoryMatriculas();
    return toPublic(memory.find((item) => item.id === id));
  }
  const alunos = await findAll({ id });
  return alunos.find((aluno) => aluno.id === id) || null;
}

async function revokeSessions(id) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const student = memory.find((item) => item.id === id);
    if (!student) return null;
    student.token_version = Number(student.token_version || 0) + 1;
    student.updated_at = new Date().toISOString();
    return toPublic(student);
  }
  const result = await db.query(
    `UPDATE alunos
     SET token_version = token_version + 1, updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [id]
  );
  return result.rows[0] ? findById(id) : null;
}

async function syncFromInscricoes(filters = {}) {
  const oficinaId = String(filters.oficinaId || "");
  const cpf = normalizeCpf(filters.cpf || "");

  if (!db.hasDatabase) {
    return { alunosCriados: 0, vinculosCriados: 0, fichasAtualizadas: 0 };
  }

  const params = ["lista_espera"];
  const where = ["NULLIF(REGEXP_REPLACE(COALESCE(i.cpf, ''), '\\D', '', 'g'), '') IS NOT NULL"];

  if (oficinaId) {
    params.push(oficinaId);
    where.push(`o.id = $${params.length}`);
  }

  if (cpf) {
    params.push(cpf);
    where.push(`REGEXP_REPLACE(COALESCE(i.cpf, ''), '\\D', '', 'g') = $${params.length}`);
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `WITH inscricao_oficinas AS (
         SELECT DISTINCT
                i.id AS inscricao_id,
                 i.nome,
                 REGEXP_REPLACE(COALESCE(i.cpf, ''), '\\D', '', 'g') AS cpf,
                 i.data_nascimento,
                 i.idade,
                i.telefone,
                i.responsavel,
                i.email,
                i.observacoes,
                i.created_at,
                i.turma_id,
                o.id AS oficina_id,
                o.nome AS oficina_nome,
                COALESCE((
                  SELECT COUNT(*)::int
                  FROM inscricao_documentos documentos
                  WHERE documentos.inscricao_id = i.id
                ), 0) AS documentos_count
         FROM inscricoes i
         CROSS JOIN LATERAL unnest(
           CASE
             WHEN cardinality(COALESCE(i.oficinas, ARRAY[]::text[])) > 0 THEN i.oficinas
             ELSE ARRAY[i.oficina]
           END
         ) AS oficina_nome(nome)
         INNER JOIN oficinas o ON o.nome = oficina_nome.nome
         WHERE ${where.join(" AND ")}
           AND NOT EXISTS (
             SELECT 1
             FROM jsonb_array_elements(COALESCE(i.oficina_detalhes, '[]'::jsonb)) AS detalhe
             WHERE detalhe->>'oficina' = o.nome
               AND detalhe->>'status' = $1
           )
           AND NOT EXISTS (
             SELECT 1
             FROM aluno_oficina_cancelamentos cancelamento
             INNER JOIN alunos cancelado ON cancelado.id = cancelamento.aluno_id
             WHERE cancelado.cpf = REGEXP_REPLACE(COALESCE(i.cpf, ''), '\\D', '', 'g')
               AND cancelamento.oficina_id = o.id
           )
       ),
       candidate_students AS (
         SELECT DISTINCT ON (cpf)
                nome,
                 cpf,
                 data_nascimento,
                 idade,
                telefone,
                responsavel,
                email,
                oficina_id,
                turma_id,
                observacoes,
                documentos_count,
                 created_at
          FROM inscricao_oficinas
         ORDER BY cpf, created_at ASC, inscricao_id
       ),
       new_students AS (
         INSERT INTO alunos (
           nome,
            cpf,
            data_nascimento,
            idade,
           telefone,
           responsavel,
           email,
           oficina_id,
           turma_id,
           status,
           documentos_pendentes,
            observacoes
          )
          SELECT
            nome,
            cpf,
            data_nascimento,
            idade,
           telefone,
           responsavel,
           email,
           oficina_id,
           turma_id,
           'ativo',
           documentos_count = 0,
           observacoes
         FROM candidate_students candidate
         WHERE NOT EXISTS (
           SELECT 1
           FROM alunos existing
           WHERE existing.cpf = candidate.cpf
         )
         RETURNING id, cpf
       ),
       all_students AS (
         SELECT a.id, a.cpf
         FROM alunos a
         WHERE a.cpf IN (SELECT cpf FROM inscricao_oficinas)
         UNION ALL
         SELECT id, cpf
          FROM new_students
        ),
        student_data_updates AS (
          UPDATE alunos a
          SET data_nascimento = COALESCE(a.data_nascimento, candidate.data_nascimento),
              turma_id = COALESCE(a.turma_id, candidate.turma_id)
          FROM candidate_students candidate
          WHERE a.cpf = candidate.cpf
          RETURNING a.id
        ),
        links AS (
         INSERT INTO aluno_oficinas (aluno_id, oficina_id)
         SELECT DISTINCT all_students.id, inscricao_oficinas.oficina_id
         FROM inscricao_oficinas
         INNER JOIN all_students ON all_students.cpf = inscricao_oficinas.cpf
         ON CONFLICT DO NOTHING
         RETURNING aluno_id
       ),
       primary_updates AS (
         UPDATE alunos a
         SET oficina_id = linked.oficina_id
         FROM (
           SELECT DISTINCT ON (all_students.id)
                  all_students.id AS aluno_id,
                  inscricao_oficinas.oficina_id
           FROM inscricao_oficinas
           INNER JOIN all_students ON all_students.cpf = inscricao_oficinas.cpf
           WHERE EXISTS (
             SELECT 1
             FROM links
             WHERE links.aluno_id = all_students.id
           )
           ORDER BY all_students.id, inscricao_oficinas.created_at ASC, inscricao_oficinas.oficina_nome ASC
         ) linked
         WHERE a.id = linked.aluno_id
           AND a.oficina_id IS NULL
         RETURNING a.id
       )
       SELECT
         (SELECT COUNT(*)::int FROM new_students) AS alunos_criados,
         (SELECT COUNT(*)::int FROM links) AS vinculos_criados,
          ((SELECT COUNT(*)::int FROM primary_updates) + (SELECT COUNT(*)::int FROM student_data_updates)) AS fichas_atualizadas`,
      params
    );
    await ensureDbMatriculas(client);
    await client.query("COMMIT");
    const row = result.rows[0] || {};
    return {
      alunosCriados: Number(row.alunos_criados || 0),
      vinculosCriados: Number(row.vinculos_criados || 0),
      fichasAtualizadas: Number(row.fichas_atualizadas || 0)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  findAll,
  findPage,
  findById,
  create,
  update,
  remove,
  cancelOfficeEnrollment,
  revokeSessions,
  syncFromInscricoes
};
