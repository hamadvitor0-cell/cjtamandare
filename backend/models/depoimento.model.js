const crypto = require("crypto");
const db = require("../database/pool");

const defaultDepoimentos = [
  {
    seed_key: "aluno-cj",
    nome: "Aluno do CJ",
    vinculo: "Participante das oficinas",
    texto: "O Centro da Juventude me ajudou a conhecer novas atividades, fazer amizades e participar mais da comunidade.",
    oficina: "Oficinas do CJ",
    ordem: 1,
    ativo: true
  },
  {
    seed_key: "familia-participante",
    nome: "Família participante",
    vinculo: "Comunidade",
    texto: "As oficinas criam oportunidades importantes para os jovens e aproximam as famílias dos serviços públicos.",
    oficina: "Atividades comunitárias",
    ordem: 2,
    ativo: true
  }
].map((item) => ({
  id: crypto.randomUUID(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...item
}));

const memory = [...defaultDepoimentos];
let setupPromise = null;

function toPublic(row) {
  return {
    id: row.id,
    nome: row.nome,
    vinculo: row.vinculo || "",
    texto: row.texto || "",
    oficina: row.oficina || "",
    ordem: Number(row.ordem || 0),
    ativo: row.ativo,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function ensureDepoimentosTable() {
  if (!db.hasDatabase) return;
  if (!setupPromise) {
    setupPromise = (async () => {
      await db.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

        CREATE TABLE IF NOT EXISTS depoimentos (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          seed_key TEXT UNIQUE,
          nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 120),
          vinculo TEXT CHECK (vinculo IS NULL OR char_length(vinculo) <= 120),
          texto TEXT NOT NULL CHECK (char_length(texto) BETWEEN 10 AND 700),
          oficina TEXT CHECK (oficina IS NULL OR char_length(oficina) <= 120),
          ordem INTEGER NOT NULL DEFAULT 0,
          ativo BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE depoimentos ADD COLUMN IF NOT EXISTS seed_key TEXT;
        CREATE INDEX IF NOT EXISTS idx_depoimentos_ordem ON depoimentos (ordem ASC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_depoimentos_seed_key_unique ON depoimentos (seed_key);

        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_depoimentos_updated_at ON depoimentos;
        CREATE TRIGGER trg_depoimentos_updated_at
        BEFORE UPDATE ON depoimentos
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();
      `);

      for (const depoimento of defaultDepoimentos) {
        await db.query(
          `INSERT INTO depoimentos (seed_key, nome, vinculo, texto, oficina, ordem, ativo)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           ON CONFLICT (seed_key) DO NOTHING`,
          [
            depoimento.seed_key,
            depoimento.nome,
            depoimento.vinculo,
            depoimento.texto,
            depoimento.oficina,
            depoimento.ordem
          ]
        );
      }
    })().catch((error) => {
      setupPromise = null;
      throw error;
    });
  }
  return setupPromise;
}

async function findAll({ includeInactive = false } = {}) {
  if (!db.hasDatabase) {
    return memory
      .filter((item) => includeInactive || item.ativo)
      .sort((a, b) => a.ordem - b.ordem)
      .map(toPublic);
  }

  await ensureDepoimentosTable();
  const result = await db.query(
    `SELECT id, nome, vinculo, texto, oficina, ordem, ativo, created_at, updated_at
     FROM depoimentos
     ${includeInactive ? "" : "WHERE ativo = true"}
     ORDER BY ordem ASC, created_at DESC`
  );
  return result.rows.map(toPublic);
}

async function create(payload) {
  const id = crypto.randomUUID();

  if (!db.hasDatabase) {
    const now = new Date().toISOString();
    const record = {
      id,
      nome: payload.nome,
      vinculo: payload.vinculo || "",
      texto: payload.texto,
      oficina: payload.oficina || "",
      ordem: payload.ordem || memory.length + 1,
      ativo: payload.ativo !== false,
      created_at: now,
      updated_at: now
    };
    memory.push(record);
    return toPublic(record);
  }

  await ensureDepoimentosTable();
  const result = await db.query(
    `INSERT INTO depoimentos (id, nome, vinculo, texto, oficina, ordem, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, nome, vinculo, texto, oficina, ordem, ativo, created_at, updated_at`,
    [
      id,
      payload.nome,
      payload.vinculo || null,
      payload.texto,
      payload.oficina || null,
      payload.ordem || 0,
      payload.ativo !== false
    ]
  );
  return toPublic(result.rows[0]);
}

async function update(id, payload) {
  if (!db.hasDatabase) {
    const index = memory.findIndex((item) => item.id === id);
    if (index === -1) return null;
    memory[index] = {
      ...memory[index],
      nome: payload.nome,
      vinculo: payload.vinculo || "",
      texto: payload.texto,
      oficina: payload.oficina || "",
      ordem: payload.ordem || 0,
      ativo: payload.ativo !== false,
      updated_at: new Date().toISOString()
    };
    return toPublic(memory[index]);
  }

  await ensureDepoimentosTable();
  const result = await db.query(
    `UPDATE depoimentos
     SET nome = $1,
         vinculo = $2,
         texto = $3,
         oficina = $4,
         ordem = $5,
         ativo = $6,
         updated_at = NOW()
     WHERE id = $7
     RETURNING id, nome, vinculo, texto, oficina, ordem, ativo, created_at, updated_at`,
    [
      payload.nome,
      payload.vinculo || null,
      payload.texto,
      payload.oficina || null,
      payload.ordem || 0,
      payload.ativo !== false,
      id
    ]
  );
  return result.rows[0] ? toPublic(result.rows[0]) : null;
}

async function remove(id) {
  if (!db.hasDatabase) {
    const index = memory.findIndex((item) => item.id === id);
    if (index === -1) return false;
    memory.splice(index, 1);
    return true;
  }

  await ensureDepoimentosTable();
  const result = await db.query("DELETE FROM depoimentos WHERE id = $1", [id]);
  return result.rowCount > 0;
}

module.exports = {
  defaultDepoimentos,
  findAll,
  create,
  update,
  remove
};
