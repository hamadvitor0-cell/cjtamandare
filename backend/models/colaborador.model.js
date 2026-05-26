const crypto = require("crypto");
const path = require("path");
const db = require("../database/pool");
const config = require("../config/env");

const defaultColaboradores = [
  {
    seed_key: "sesc-pr",
    nome: "SESC Paraná",
    descricao: "O Sesc Paraná atua em áreas como ação social, cultura, educação, esporte e lazer, saúde, alimentação e turismo, ampliando o acesso da comunidade a serviços e atividades formativas.",
    site_url: "https://www.sescpr.com.br/",
    imagem_url: "/img/sesc-parana.png",
    alt: "Logo do SESC Paraná",
    ordem: 1,
    ativo: true
  },
  {
    seed_key: "secretaria-cultura-turismo",
    nome: "Secretaria Municipal de Cultura e Turismo",
    descricao: "A Secretaria de Cultura e Turismo de Almirante Tamandaré promove o desenvolvimento cultural, protege o patrimônio local e incentiva ações de turismo, eventos e valorização do Circuito da Natureza.",
    site_url: "https://tamandare.pr.gov.br/secretarias/cultura-e-turismo",
    imagem_url: "",
    alt: "Secretaria Municipal de Cultura e Turismo de Almirante Tamandaré",
    ordem: 2,
    ativo: true
  }
].map((item) => ({
  id: crypto.randomUUID(),
  original_name: null,
  mime_type: null,
  size_bytes: null,
  file_content: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...item
}));

const memory = [...defaultColaboradores];
let setupPromise = null;

function imagePath(id) {
  return `/colaboradores/${id}/imagem`;
}

function toPublic(row) {
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao || "",
    siteUrl: row.site_url || "",
    imagemUrl: row.imagem_url || "",
    alt: row.alt || row.nome,
    ordem: Number(row.ordem || 0),
    ativo: row.ativo,
    hasUploadedFile: Boolean(row.file_content || row.has_uploaded_file),
    originalName: row.original_name || "",
    mimeType: row.mime_type || "",
    sizeBytes: Number(row.size_bytes || 0),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function filePayload(file) {
  if (!file) return null;
  return {
    originalName: path.basename(file.originalname || "imagem"),
    mimeType: file.mimetype,
    sizeBytes: Number(file.size || 0),
    fileContent: file.buffer
  };
}

async function ensureColaboradoresTable() {
  if (!db.hasDatabase || !config.runtimeDatabaseSetup) return;
  if (!setupPromise) {
    setupPromise = (async () => {
      await db.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

        CREATE TABLE IF NOT EXISTS colaboradores (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          seed_key TEXT UNIQUE,
          nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 120),
          descricao TEXT CHECK (descricao IS NULL OR char_length(descricao) <= 700),
          site_url TEXT NOT NULL CHECK (char_length(site_url) BETWEEN 1 AND 500),
          imagem_url TEXT NOT NULL DEFAULT '' CHECK (char_length(imagem_url) <= 500),
          alt TEXT CHECK (alt IS NULL OR char_length(alt) <= 180),
          ordem INTEGER NOT NULL DEFAULT 0,
          ativo BOOLEAN NOT NULL DEFAULT TRUE,
          original_name TEXT CHECK (original_name IS NULL OR char_length(original_name) <= 240),
          mime_type TEXT CHECK (mime_type IS NULL OR mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
          size_bytes INTEGER CHECK (size_bytes IS NULL OR (size_bytes > 0 AND size_bytes <= 5242880)),
          file_content BYTEA,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS seed_key TEXT;
        ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS original_name TEXT;
        ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS mime_type TEXT;
        ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS size_bytes INTEGER;
        ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS file_content BYTEA;
        CREATE INDEX IF NOT EXISTS idx_colaboradores_ordem ON colaboradores (ordem ASC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_colaboradores_seed_key_unique ON colaboradores (seed_key);

        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_colaboradores_updated_at ON colaboradores;
        CREATE TRIGGER trg_colaboradores_updated_at
        BEFORE UPDATE ON colaboradores
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();
      `);

      for (const colaborador of defaultColaboradores) {
        await db.query(
          `INSERT INTO colaboradores (seed_key, nome, descricao, site_url, imagem_url, alt, ordem, ativo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)
           ON CONFLICT (seed_key) DO NOTHING`,
          [
            colaborador.seed_key,
            colaborador.nome,
            colaborador.descricao,
            colaborador.site_url,
            colaborador.imagem_url,
            colaborador.alt,
            colaborador.ordem
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

  await ensureColaboradoresTable();
  const result = await db.query(
    `SELECT id, nome, descricao, site_url, imagem_url, alt, ordem, ativo,
            original_name, mime_type, size_bytes, file_content IS NOT NULL AS has_uploaded_file,
            created_at, updated_at
     FROM colaboradores
     ${includeInactive ? "" : "WHERE ativo = true"}
     ORDER BY ordem ASC, created_at DESC`
  );
  return result.rows.map(toPublic);
}

async function create(payload, file) {
  const imageFile = filePayload(file);
  const id = crypto.randomUUID();
  const imageUrl = imageFile ? imagePath(id) : payload.imagemUrl || "";

  if (!db.hasDatabase) {
    const now = new Date().toISOString();
    const record = {
      id,
      seed_key: null,
      nome: payload.nome,
      descricao: payload.descricao || "",
      site_url: payload.siteUrl || "",
      imagem_url: imageUrl,
      alt: payload.alt || payload.nome,
      ordem: payload.ordem || memory.length + 1,
      ativo: payload.ativo !== false,
      original_name: imageFile?.originalName || null,
      mime_type: imageFile?.mimeType || null,
      size_bytes: imageFile?.sizeBytes || null,
      file_content: imageFile?.fileContent || null,
      created_at: now,
      updated_at: now
    };
    memory.push(record);
    return toPublic(record);
  }

  await ensureColaboradoresTable();
  const result = await db.query(
    `INSERT INTO colaboradores
       (id, nome, descricao, site_url, imagem_url, alt, ordem, ativo, original_name, mime_type, size_bytes, file_content)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, nome, descricao, site_url, imagem_url, alt, ordem, ativo,
               original_name, mime_type, size_bytes, file_content IS NOT NULL AS has_uploaded_file,
               created_at, updated_at`,
    [
      id,
      payload.nome,
      payload.descricao || null,
      payload.siteUrl || "",
      imageUrl,
      payload.alt || payload.nome,
      payload.ordem || 0,
      payload.ativo !== false,
      imageFile?.originalName || null,
      imageFile?.mimeType || null,
      imageFile?.sizeBytes || null,
      imageFile?.fileContent || null
    ]
  );
  return toPublic(result.rows[0]);
}

async function update(id, payload, file) {
  const imageFile = filePayload(file);
  const imageUrl = imageFile ? imagePath(id) : payload.imagemUrl || "";
  const keepExistingFile = !imageFile && imageUrl === imagePath(id);

  if (!db.hasDatabase) {
    const index = memory.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const existing = memory[index];
    memory[index] = {
      ...existing,
      nome: payload.nome,
      descricao: payload.descricao || "",
      site_url: payload.siteUrl || "",
      imagem_url: imageUrl,
      alt: payload.alt || payload.nome,
      ordem: payload.ordem || 0,
      ativo: payload.ativo !== false,
      original_name: keepExistingFile ? existing.original_name : imageFile?.originalName || null,
      mime_type: keepExistingFile ? existing.mime_type : imageFile?.mimeType || null,
      size_bytes: keepExistingFile ? existing.size_bytes : imageFile?.sizeBytes || null,
      file_content: keepExistingFile ? existing.file_content : imageFile?.fileContent || null,
      updated_at: new Date().toISOString()
    };
    return toPublic(memory[index]);
  }

  await ensureColaboradoresTable();
  const result = await db.query(
    `UPDATE colaboradores
     SET nome = $1,
         descricao = $2,
         site_url = $3,
         imagem_url = $4,
         alt = $5,
         ordem = $6,
         ativo = $7,
         original_name = CASE WHEN $12 THEN original_name ELSE $8 END,
         mime_type = CASE WHEN $12 THEN mime_type ELSE $9 END,
         size_bytes = CASE WHEN $12 THEN size_bytes ELSE $10 END,
         file_content = CASE WHEN $12 THEN file_content ELSE $11 END,
         updated_at = NOW()
     WHERE id = $13
     RETURNING id, nome, descricao, site_url, imagem_url, alt, ordem, ativo,
               original_name, mime_type, size_bytes, file_content IS NOT NULL AS has_uploaded_file,
               created_at, updated_at`,
    [
      payload.nome,
      payload.descricao || null,
      payload.siteUrl || "",
      imageUrl,
      payload.alt || payload.nome,
      payload.ordem || 0,
      payload.ativo !== false,
      imageFile?.originalName || null,
      imageFile?.mimeType || null,
      imageFile?.sizeBytes || null,
      imageFile?.fileContent || null,
      keepExistingFile,
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

  await ensureColaboradoresTable();
  const result = await db.query("DELETE FROM colaboradores WHERE id = $1", [id]);
  return result.rowCount > 0;
}

async function findImage(id) {
  if (!db.hasDatabase) {
    const item = memory.find((record) => record.id === id);
    if (!item?.file_content) return null;
    return {
      originalName: item.original_name || "imagem",
      mimeType: item.mime_type,
      sizeBytes: Number(item.size_bytes || 0),
      fileContent: item.file_content
    };
  }

  await ensureColaboradoresTable();
  const result = await db.query(
    `SELECT original_name, mime_type, size_bytes, file_content
     FROM colaboradores
     WHERE id = $1 AND file_content IS NOT NULL`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    originalName: row.original_name || "imagem",
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    fileContent: row.file_content
  };
}

module.exports = {
  defaultColaboradores,
  findAll,
  create,
  update,
  remove,
  findImage
};
