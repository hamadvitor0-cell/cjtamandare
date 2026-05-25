const crypto = require("crypto");
const path = require("path");
const db = require("../database/pool");

const memory = [
  {
    id: crypto.randomUUID(),
    titulo: "Oficinas disponíveis",
    descricao: "Quadro oficial com lista de oficinas do Centro da Juventude",
    imagem_url: "/img/oficinas.png",
    alt: "Quadro oficial com lista de oficinas do Centro da Juventude",
    ordem: 1,
    ativo: true,
    original_name: null,
    mime_type: null,
    size_bytes: null,
    file_content: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: crypto.randomUUID(),
    titulo: "Identidade oficial",
    descricao: "Logo oficial do Centro da Juventude Almirante Tamandare",
    imagem_url: "/img/LOGO_CJ.png",
    alt: "Logo oficial do Centro da Juventude Almirante Tamandare",
    ordem: 2,
    ativo: true,
    original_name: null,
    mime_type: null,
    size_bytes: null,
    file_content: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

function imagePath(id) {
  return `/galeria/${id}/imagem`;
}

function toPublic(row) {
  const imagemUrl = row.imagem_url === "/img/logo.jpg" ? "/img/LOGO_CJ.png" : row.imagem_url;
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao || "",
    imagemUrl,
    alt: row.alt || row.titulo,
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

async function findAll({ includeInactive = false } = {}) {
  if (!db.hasDatabase) {
    return memory
      .filter((item) => includeInactive || item.ativo)
      .sort((a, b) => a.ordem - b.ordem)
      .map(toPublic);
  }

  const result = await db.query(
    `SELECT id, titulo, descricao, imagem_url, alt, ordem, ativo,
            original_name, mime_type, size_bytes, file_content IS NOT NULL AS has_uploaded_file,
            created_at, updated_at
     FROM galeria
     ${includeInactive ? "" : "WHERE ativo = true"}
     ORDER BY ordem ASC, created_at DESC`
  );
  return result.rows.map(toPublic);
}

async function create(payload, file) {
  const imageFile = filePayload(file);
  const id = crypto.randomUUID();
  const imageUrl = imageFile ? imagePath(id) : payload.imagemUrl;

  if (!db.hasDatabase) {
    const now = new Date().toISOString();
    const record = {
      id,
      titulo: payload.titulo,
      descricao: payload.descricao || "",
      imagem_url: imageUrl,
      alt: payload.alt || payload.titulo,
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

  const result = await db.query(
    `INSERT INTO galeria
       (id, titulo, descricao, imagem_url, alt, ordem, ativo, original_name, mime_type, size_bytes, file_content)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, titulo, descricao, imagem_url, alt, ordem, ativo,
               original_name, mime_type, size_bytes, file_content IS NOT NULL AS has_uploaded_file,
               created_at, updated_at`,
    [
      id,
      payload.titulo,
      payload.descricao || null,
      imageUrl,
      payload.alt || payload.titulo,
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
  const imageUrl = imageFile ? imagePath(id) : payload.imagemUrl;
  const keepExistingFile = !imageFile && imageUrl === imagePath(id);

  if (!db.hasDatabase) {
    const index = memory.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const existing = memory[index];
    memory[index] = {
      ...existing,
      titulo: payload.titulo,
      descricao: payload.descricao || "",
      imagem_url: imageUrl,
      alt: payload.alt || payload.titulo,
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

  const result = await db.query(
    `UPDATE galeria
     SET titulo = $1,
         descricao = $2,
         imagem_url = $3,
         alt = $4,
         ordem = $5,
         ativo = $6,
         original_name = CASE WHEN $11 THEN original_name ELSE $7 END,
         mime_type = CASE WHEN $11 THEN mime_type ELSE $8 END,
         size_bytes = CASE WHEN $11 THEN size_bytes ELSE $9 END,
         file_content = CASE WHEN $11 THEN file_content ELSE $10 END,
         updated_at = NOW()
     WHERE id = $12
     RETURNING id, titulo, descricao, imagem_url, alt, ordem, ativo,
               original_name, mime_type, size_bytes, file_content IS NOT NULL AS has_uploaded_file,
               created_at, updated_at`,
    [
      payload.titulo,
      payload.descricao || null,
      imageUrl,
      payload.alt || payload.titulo,
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

  const result = await db.query("DELETE FROM galeria WHERE id = $1", [id]);
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

  const result = await db.query(
    `SELECT original_name, mime_type, size_bytes, file_content
     FROM galeria
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
  findAll,
  create,
  update,
  remove,
  findImage
};
