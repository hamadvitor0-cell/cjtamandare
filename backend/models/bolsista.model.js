const crypto = require("crypto");
const db = require("../database/pool");
const Oficina = require("./oficina.model");

const MAX_BOLSISTAS = 40;
const memory = [];
let schemaPromise = null;

function limitError() {
  const error = new Error("O limite de 40 bolsistas do programa foi atingido.");
  error.statusCode = 409;
  return error;
}

function normalizeOfficeIds(payload = {}) {
  const values = Array.isArray(payload.oficinaIds)
    ? payload.oficinaIds
    : [payload.oficinaId].filter(Boolean);
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeDays(payload = {}) {
  return Array.from(new Set((payload.diasSemana || []).filter(Boolean))).slice(0, 2);
}

async function ensureSchema() {
  if (!db.hasDatabase) return;
  if (!schemaPromise) {
    schemaPromise = db.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS bolsistas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 3 AND 120),
        cpf TEXT CHECK (cpf IS NULL OR cpf = '' OR cpf ~ '^[0-9]{11}$'),
        idade INTEGER NOT NULL CHECK (idade BETWEEN 14 AND 24),
        telefone TEXT CHECK (telefone IS NULL OR char_length(telefone) <= 20),
        email TEXT CHECK (email IS NULL OR char_length(email) <= 160),
        funcao TEXT NOT NULL CHECK (funcao IN ('adm', 'social_media', 'professor', 'ajudante_professor')),
        tipo_atuacao TEXT NOT NULL DEFAULT 'apoio' CHECK (tipo_atuacao IN ('aula', 'ajuda', 'apoio', 'sem_vinculo')),
        dias_semana TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(dias_semana) <= 2),
        status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
        observacoes TEXT CHECK (observacoes IS NULL OR char_length(observacoes) <= 1000),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bolsista_oficinas (
        bolsista_id UUID NOT NULL REFERENCES bolsistas(id) ON DELETE CASCADE,
        oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (bolsista_id, oficina_id)
      );

      ALTER TABLE bolsistas ADD COLUMN IF NOT EXISTS dias_semana TEXT[] NOT NULL DEFAULT '{}';
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'bolsistas_dias_semana_check'
        ) THEN
          ALTER TABLE bolsistas ADD CONSTRAINT bolsistas_dias_semana_check CHECK (
            cardinality(dias_semana) <= 2
            AND dias_semana <@ ARRAY['segunda','terca','quarta','quinta','sexta','sabado','domingo']::text[]
          );
        END IF;
      END $$;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_bolsistas_cpf_unique ON bolsistas (cpf) WHERE cpf IS NOT NULL AND cpf <> '';
      CREATE INDEX IF NOT EXISTS idx_bolsistas_status ON bolsistas (status);
      CREATE INDEX IF NOT EXISTS idx_bolsista_oficinas_oficina ON bolsista_oficinas (oficina_id);

      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_bolsistas_updated_at ON bolsistas;
      CREATE TRIGGER trg_bolsistas_updated_at
      BEFORE UPDATE ON bolsistas
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

async function officeNamesForMemory(oficinaIds = []) {
  const oficinas = await Oficina.findAll({ includeInactive: true });
  return oficinaIds
    .map((oficinaId) => oficinas.find((oficina) => oficina.id === oficinaId)?.nome)
    .filter(Boolean);
}

function toPublic(row) {
  return {
    id: row.id,
    nome: row.nome,
    cpf: row.cpf || "",
    idade: row.idade,
    telefone: row.telefone || "",
    email: row.email || "",
    funcao: row.funcao,
    tipoAtuacao: row.tipo_atuacao || row.tipoAtuacao || "apoio",
    diasSemana: row.dias_semana || row.diasSemana || [],
    status: row.status || "ativo",
    observacoes: row.observacoes || "",
    oficinaIds: row.oficina_ids || row.oficinaIds || [],
    oficinas: row.oficinas || [],
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function findById(id) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const record = memory.find((item) => item.id === id);
    return record ? toPublic(record) : null;
  }

  const result = await db.query(
    `SELECT
       b.id,
       b.nome,
       b.cpf,
       b.idade,
       b.telefone,
       b.email,
       b.funcao,
       b.tipo_atuacao,
       b.dias_semana,
       b.status,
       b.observacoes,
       b.created_at,
       b.updated_at,
       COALESCE(array_agg(o.id::text ORDER BY o.nome) FILTER (WHERE o.id IS NOT NULL), '{}') AS oficina_ids,
       COALESCE(array_agg(o.nome ORDER BY o.nome) FILTER (WHERE o.id IS NOT NULL), '{}') AS oficinas
     FROM bolsistas b
     LEFT JOIN bolsista_oficinas bo ON bo.bolsista_id = b.id
     LEFT JOIN oficinas o ON o.id = bo.oficina_id
     WHERE b.id = $1
     GROUP BY b.id`,
    [id]
  );
  return result.rows[0] ? toPublic(result.rows[0]) : null;
}

async function findAll({ search = "", oficinaId = "" } = {}) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const term = String(search || "").toLowerCase();
    return memory
      .filter((item) => {
        const matchesSearch = !term || [item.nome, item.cpf, item.email, item.telefone, item.funcao]
          .some((value) => String(value || "").toLowerCase().includes(term));
        const matchesOffice = !oficinaId || (item.oficinaIds || []).includes(oficinaId);
        return matchesSearch && matchesOffice;
      })
      .sort((a, b) => (a.status === b.status ? a.nome.localeCompare(b.nome) : a.status === "ativo" ? -1 : 1))
      .map(toPublic);
  }

  const where = [];
  const params = [];
  if (search) {
    params.push(`%${String(search).toLowerCase()}%`);
    where.push(`(
      lower(b.nome) LIKE $${params.length}
      OR lower(COALESCE(b.cpf, '')) LIKE $${params.length}
      OR lower(COALESCE(b.email, '')) LIKE $${params.length}
      OR lower(COALESCE(b.telefone, '')) LIKE $${params.length}
      OR lower(b.funcao) LIKE $${params.length}
    )`);
  }
  if (oficinaId) {
    params.push(oficinaId);
    where.push(`EXISTS (
      SELECT 1
      FROM bolsista_oficinas filtro
      WHERE filtro.bolsista_id = b.id AND filtro.oficina_id = $${params.length}
    )`);
  }

  const result = await db.query(
    `SELECT
       b.id,
       b.nome,
       b.cpf,
       b.idade,
       b.telefone,
       b.email,
       b.funcao,
       b.tipo_atuacao,
       b.dias_semana,
       b.status,
       b.observacoes,
       b.created_at,
       b.updated_at,
       COALESCE(array_agg(o.id::text ORDER BY o.nome) FILTER (WHERE o.id IS NOT NULL), '{}') AS oficina_ids,
       COALESCE(array_agg(o.nome ORDER BY o.nome) FILTER (WHERE o.id IS NOT NULL), '{}') AS oficinas
     FROM bolsistas b
     LEFT JOIN bolsista_oficinas bo ON bo.bolsista_id = b.id
     LEFT JOIN oficinas o ON o.id = bo.oficina_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY b.id
     ORDER BY CASE WHEN b.status = 'ativo' THEN 0 ELSE 1 END, b.nome ASC`,
    params
  );
  return result.rows.map(toPublic);
}

async function syncOffices(client, bolsistaId, oficinaIds = []) {
  await client.query("DELETE FROM bolsista_oficinas WHERE bolsista_id = $1", [bolsistaId]);
  for (const oficinaId of oficinaIds) {
    await client.query(
      "INSERT INTO bolsista_oficinas (bolsista_id, oficina_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [bolsistaId, oficinaId]
    );
  }
}

async function create(payload) {
  const oficinaIds = normalizeOfficeIds(payload);
  const diasSemana = normalizeDays(payload);
  await ensureSchema();

  if (!db.hasDatabase) {
    if (memory.length >= MAX_BOLSISTAS) throw limitError();
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      nome: payload.nome,
      cpf: payload.cpf || "",
      idade: Number(payload.idade),
      telefone: payload.telefone || "",
      email: payload.email || "",
      funcao: payload.funcao,
      tipo_atuacao: payload.tipoAtuacao || "apoio",
      dias_semana: diasSemana,
      status: payload.status || "ativo",
      observacoes: payload.observacoes || "",
      oficinaIds,
      oficinas: await officeNamesForMemory(oficinaIds),
      created_at: now,
      updated_at: now
    };
    memory.push(record);
    return toPublic(record);
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const total = await client.query("SELECT COUNT(*)::int AS total FROM bolsistas");
    if (Number(total.rows[0]?.total || 0) >= MAX_BOLSISTAS) throw limitError();

    const result = await client.query(
      `INSERT INTO bolsistas (nome, cpf, idade, telefone, email, funcao, tipo_atuacao, dias_semana, status, observacoes)
       VALUES ($1, NULLIF($2, ''), $3, NULLIF($4, ''), NULLIF($5, ''), $6, $7, $8, $9, NULLIF($10, ''))
       RETURNING id`,
      [
        payload.nome,
        payload.cpf || "",
        Number(payload.idade),
        payload.telefone || "",
        payload.email || "",
        payload.funcao,
        payload.tipoAtuacao || "apoio",
        diasSemana,
        payload.status || "ativo",
        payload.observacoes || ""
      ]
    );
    await syncOffices(client, result.rows[0].id, oficinaIds);
    await client.query("COMMIT");
    return findById(result.rows[0].id);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      const conflict = new Error("Ja existe um bolsista cadastrado com este CPF.");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function update(id, payload) {
  const oficinaIds = normalizeOfficeIds(payload);
  const diasSemana = normalizeDays(payload);
  await ensureSchema();

  if (!db.hasDatabase) {
    const index = memory.findIndex((item) => item.id === id);
    if (index === -1) return null;
    memory[index] = {
      ...memory[index],
      nome: payload.nome,
      cpf: payload.cpf || "",
      idade: Number(payload.idade),
      telefone: payload.telefone || "",
      email: payload.email || "",
      funcao: payload.funcao,
      tipo_atuacao: payload.tipoAtuacao || "apoio",
      dias_semana: diasSemana,
      status: payload.status || "ativo",
      observacoes: payload.observacoes || "",
      oficinaIds,
      oficinas: await officeNamesForMemory(oficinaIds),
      updated_at: new Date().toISOString()
    };
    return toPublic(memory[index]);
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE bolsistas
       SET nome = $1,
           cpf = NULLIF($2, ''),
           idade = $3,
           telefone = NULLIF($4, ''),
           email = NULLIF($5, ''),
           funcao = $6,
           tipo_atuacao = $7,
           dias_semana = $8,
           status = $9,
           observacoes = NULLIF($10, ''),
           updated_at = NOW()
       WHERE id = $11
       RETURNING id`,
      [
        payload.nome,
        payload.cpf || "",
        Number(payload.idade),
        payload.telefone || "",
        payload.email || "",
        payload.funcao,
        payload.tipoAtuacao || "apoio",
        diasSemana,
        payload.status || "ativo",
        payload.observacoes || "",
        id
      ]
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    await syncOffices(client, id, oficinaIds);
    await client.query("COMMIT");
    return findById(id);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      const conflict = new Error("Ja existe um bolsista cadastrado com este CPF.");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function remove(id) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const index = memory.findIndex((item) => item.id === id);
    if (index === -1) return false;
    memory.splice(index, 1);
    return true;
  }

  const result = await db.query("DELETE FROM bolsistas WHERE id = $1", [id]);
  return result.rowCount > 0;
}

module.exports = {
  MAX_BOLSISTAS,
  findAll,
  create,
  update,
  remove
};
