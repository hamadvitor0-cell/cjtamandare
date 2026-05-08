const crypto = require("crypto");
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: crypto.randomUUID(),
    titulo: "Identidade oficial",
    descricao: "Logo oficial do Centro da Juventude Almirante Tamandaré",
    imagem_url: "/img/logo.jpg",
    alt: "Logo oficial do Centro da Juventude Almirante Tamandaré",
    ordem: 2,
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

function toPublic(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao || "",
    imagemUrl: row.imagem_url,
    alt: row.alt || row.titulo,
    ordem: Number(row.ordem || 0),
    ativo: row.ativo,
    created_at: row.created_at,
    updated_at: row.updated_at
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
    `SELECT id, titulo, descricao, imagem_url, alt, ordem, ativo, created_at, updated_at
     FROM galeria
     ${includeInactive ? "" : "WHERE ativo = true"}
     ORDER BY ordem ASC, created_at DESC`
  );
  return result.rows.map(toPublic);
}

async function create(payload) {
  if (!db.hasDatabase) {
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      titulo: payload.titulo,
      descricao: payload.descricao || "",
      imagem_url: payload.imagemUrl,
      alt: payload.alt || payload.titulo,
      ordem: payload.ordem || memory.length + 1,
      ativo: payload.ativo !== false,
      created_at: now,
      updated_at: now
    };
    memory.push(record);
    return toPublic(record);
  }

  const result = await db.query(
    `INSERT INTO galeria (titulo, descricao, imagem_url, alt, ordem, ativo)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, titulo, descricao, imagem_url, alt, ordem, ativo, created_at, updated_at`,
    [
      payload.titulo,
      payload.descricao || null,
      payload.imagemUrl,
      payload.alt || payload.titulo,
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
      titulo: payload.titulo,
      descricao: payload.descricao || "",
      imagem_url: payload.imagemUrl,
      alt: payload.alt || payload.titulo,
      ordem: payload.ordem || 0,
      ativo: payload.ativo !== false,
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
         updated_at = NOW()
     WHERE id = $7
     RETURNING id, titulo, descricao, imagem_url, alt, ordem, ativo, created_at, updated_at`,
    [
      payload.titulo,
      payload.descricao || null,
      payload.imagemUrl,
      payload.alt || payload.titulo,
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

  const result = await db.query("DELETE FROM galeria WHERE id = $1", [id]);
  return result.rowCount > 0;
}

module.exports = {
  findAll,
  create,
  update,
  remove
};
