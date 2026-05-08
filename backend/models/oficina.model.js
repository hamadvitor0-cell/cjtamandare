const crypto = require("crypto");
const db = require("../database/pool");
const { defaultOficinas } = require("../services/oficina.service");

const memory = defaultOficinas.map((oficina) => ({
  id: crypto.randomUUID(),
  nome: oficina.nome,
  categoria: oficina.categoria,
  descricao: oficina.descricao,
  faixa_etaria: oficina.faixaEtaria,
  dias_semana: oficina.diasSemana || [],
  periodo: oficina.periodo || "a definir",
  horario: oficina.horario,
  imagem_url: "/img/oficinas.png",
  initials: oficina.nome.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
  ativo: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}));

function toPublic(row) {
  return {
    id: row.id,
    nome: row.nome,
    categoria: row.categoria,
    descricao: row.descricao,
    faixaEtaria: row.faixa_etaria,
    diasSemana: row.dias_semana || [],
    periodo: row.periodo || "a definir",
    horario: row.horario,
    imagemUrl: row.imagem_url || "/img/oficinas.png",
    initials: row.initials || row.nome.slice(0, 2).toUpperCase(),
    ativo: row.ativo,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function findAll({ includeInactive = false } = {}) {
  if (!db.hasDatabase) {
    return memory
      .filter((item) => includeInactive || item.ativo)
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map(toPublic);
  }

  const result = await db.query(
    `SELECT id, nome, categoria, descricao, faixa_etaria, dias_semana, periodo, horario, imagem_url, initials, ativo, created_at, updated_at
     FROM oficinas
     ${includeInactive ? "" : "WHERE ativo = true"}
     ORDER BY categoria ASC, nome ASC`
  );
  return result.rows.map(toPublic);
}

async function create(payload) {
  if (!db.hasDatabase) {
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      nome: payload.nome,
      categoria: payload.categoria,
      descricao: payload.descricao,
      faixa_etaria: payload.faixaEtaria,
      dias_semana: payload.diasSemana || [],
      periodo: payload.periodo || "a definir",
      horario: payload.horario,
      imagem_url: payload.imagemUrl || "/img/oficinas.png",
      initials: payload.initials,
      ativo: payload.ativo !== false,
      created_at: now,
      updated_at: now
    };
    memory.push(record);
    return toPublic(record);
  }

  const result = await db.query(
    `INSERT INTO oficinas (nome, categoria, descricao, faixa_etaria, dias_semana, periodo, horario, imagem_url, initials, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, nome, categoria, descricao, faixa_etaria, dias_semana, periodo, horario, imagem_url, initials, ativo, created_at, updated_at`,
    [
      payload.nome,
      payload.categoria,
      payload.descricao,
      payload.faixaEtaria,
      payload.diasSemana || [],
      payload.periodo || "a definir",
      payload.horario,
      payload.imagemUrl || "/img/oficinas.png",
      payload.initials,
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
      categoria: payload.categoria,
      descricao: payload.descricao,
      faixa_etaria: payload.faixaEtaria,
      dias_semana: payload.diasSemana || [],
      periodo: payload.periodo || "a definir",
      horario: payload.horario,
      imagem_url: payload.imagemUrl || "/img/oficinas.png",
      initials: payload.initials,
      ativo: payload.ativo !== false,
      updated_at: new Date().toISOString()
    };
    return toPublic(memory[index]);
  }

  const result = await db.query(
    `UPDATE oficinas
     SET nome = $1,
         categoria = $2,
         descricao = $3,
         faixa_etaria = $4,
         dias_semana = $5,
         periodo = $6,
         horario = $7,
         imagem_url = $8,
         initials = $9,
         ativo = $10,
         updated_at = NOW()
     WHERE id = $11
     RETURNING id, nome, categoria, descricao, faixa_etaria, dias_semana, periodo, horario, imagem_url, initials, ativo, created_at, updated_at`,
    [
      payload.nome,
      payload.categoria,
      payload.descricao,
      payload.faixaEtaria,
      payload.diasSemana || [],
      payload.periodo || "a definir",
      payload.horario,
      payload.imagemUrl || "/img/oficinas.png",
      payload.initials,
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

  const result = await db.query("DELETE FROM oficinas WHERE id = $1", [id]);
  return result.rowCount > 0;
}

module.exports = {
  findAll,
  create,
  update,
  remove
};
