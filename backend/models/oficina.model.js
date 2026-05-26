const crypto = require("crypto");
const db = require("../database/pool");
const config = require("../config/env");
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
  capacidade: oficina.capacidade || 30,
  imagem_url: "/img/oficinas.png",
  initials: oficina.nome.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
  turmas: oficina.turmas || [],
  ativo: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}));

let schemaEnsured = false;

async function ensureSchema() {
  if (schemaEnsured || !db.hasDatabase || !config.runtimeDatabaseSetup) return;
  schemaEnsured = true;
  await db.query("ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS turmas JSONB NOT NULL DEFAULT '[]'::jsonb");
}

function normalizeTurmas(value = []) {
  const list = Array.isArray(value)
    ? value
    : String(value || "").split(/[\n;,|]/);
  return Array.from(new Set(list.map((item) => String(item || "").trim()).filter(Boolean)));
}

function toPublic(row) {
  const legacyCapacidade = Number(row.capacidade || 30);
  const capacidade = Number(row.capacidade_total ?? row.capacidadeTotal ?? legacyCapacidade);
  const inscritosConfirmados = Number(row.inscritos_confirmados ?? row.inscritosConfirmados ?? row.ocupadas_total ?? row.ocupadasTotal ?? 0);
  const vagasDisponiveis = Math.max(capacidade - inscritosConfirmados, 0);
  const turmasAtivas = Number(row.turmas_ativas ?? row.turmasAtivas ?? 0);
  const situacaoVagas = vagasDisponiveis <= 0
    ? "lista_espera"
    : vagasDisponiveis <= 3
      ? "poucas_vagas"
      : "vagas_abertas";

  return {
    id: row.id,
    nome: row.nome,
    categoria: row.categoria,
    descricao: row.descricao,
    faixaEtaria: row.faixa_etaria,
    diasSemana: row.dias_semana || [],
    periodo: row.periodo || "a definir",
    horario: row.horario,
    capacidade,
    capacidadeLegada: legacyCapacidade,
    turmas: normalizeTurmas(row.turmas || []),
    turmasAtivas,
    inscritosConfirmados,
    vagasDisponiveis,
    situacaoVagas,
    imagemUrl: row.imagem_url || "/img/oficinas.png",
    initials: row.initials || row.nome.slice(0, 2).toUpperCase(),
    ativo: row.ativo,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function applyTurmaSummaries(oficinas = []) {
  try {
    const Turma = require("./turma.model");
    const turmas = await Turma.findAll({ includeInactive: false, publicOnly: true });
    const turmasByOffice = turmas.reduce((acc, turma) => {
      const current = acc.get(turma.oficinaId) || [];
      current.push(Turma.toPublicSafe(turma));
      acc.set(turma.oficinaId, current);
      return acc;
    }, new Map());
    return oficinas.map((oficina) => {
      const turmasDisponiveis = turmasByOffice.get(oficina.id) || [];
      if (!turmasDisponiveis.length) return {
        ...oficina,
        turmasDisponiveis
      };
      const capacidade = turmasDisponiveis.reduce((total, turma) => total + Number(turma.vagasTotal || 0), 0);
      const inscritosConfirmados = turmasDisponiveis.reduce((total, turma) => total + Number(turma.vagasOcupadas || 0), 0);
      const vagasDisponiveis = Math.max(capacidade - inscritosConfirmados, 0);
      return {
        ...oficina,
        capacidade,
        inscritosConfirmados,
        vagasDisponiveis,
        situacaoVagas: vagasDisponiveis <= 0
          ? "lista_espera"
          : vagasDisponiveis <= 3
            ? "poucas_vagas"
            : "vagas_abertas",
        capacidadeTotal: capacidade,
        ocupadasTotal: inscritosConfirmados,
        turmasAtivas: turmasDisponiveis.length,
        turmasDisponiveis
      };
    });
  } catch (error) {
    return oficinas;
  }
}

async function findAll({ includeInactive = false } = {}) {
  await ensureSchema();

  if (!db.hasDatabase) {
    return applyTurmaSummaries(memory
      .filter((item) => includeInactive || item.ativo)
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map(toPublic));
  }

  const result = await db.query(
    `SELECT
       o.id,
       o.nome,
       o.categoria,
       o.descricao,
       o.faixa_etaria,
       o.dias_semana,
       o.periodo,
       o.horario,
       o.capacidade,
       o.turmas,
       o.imagem_url,
       o.initials,
       o.ativo,
       o.created_at,
       o.updated_at
     FROM oficinas o
     ${includeInactive ? "" : "WHERE o.ativo = true"}
     ORDER BY categoria ASC, nome ASC`
  );
  return applyTurmaSummaries(result.rows.map(toPublic));
}

async function create(payload) {
  await ensureSchema();
  const turmas = normalizeTurmas(payload.turmas);

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
      capacidade: Number(payload.capacidade || 30),
      turmas,
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
    `INSERT INTO oficinas (nome, categoria, descricao, faixa_etaria, dias_semana, periodo, horario, capacidade, turmas, imagem_url, initials, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, nome, categoria, descricao, faixa_etaria, dias_semana, periodo, horario, capacidade, turmas, imagem_url, initials, ativo, created_at, updated_at`,
    [
      payload.nome,
      payload.categoria,
      payload.descricao,
      payload.faixaEtaria,
      payload.diasSemana || [],
      payload.periodo || "a definir",
      payload.horario,
      Number(payload.capacidade || 30),
      JSON.stringify(turmas),
      payload.imagemUrl || "/img/oficinas.png",
      payload.initials,
      payload.ativo !== false
    ]
  );
  return toPublic(result.rows[0]);
}

async function update(id, payload) {
  await ensureSchema();
  const turmas = normalizeTurmas(payload.turmas);

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
      capacidade: Number(payload.capacidade || 30),
      turmas,
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
         capacidade = $8,
         turmas = $9,
         imagem_url = $10,
         initials = $11,
         ativo = $12,
         updated_at = NOW()
     WHERE id = $13
     RETURNING id, nome, categoria, descricao, faixa_etaria, dias_semana, periodo, horario, capacidade, turmas, imagem_url, initials, ativo, created_at, updated_at`,
    [
      payload.nome,
      payload.categoria,
      payload.descricao,
      payload.faixaEtaria,
      payload.diasSemana || [],
      payload.periodo || "a definir",
      payload.horario,
      Number(payload.capacidade || 30),
      JSON.stringify(turmas),
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
