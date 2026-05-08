const Inscricao = require("../models/inscricao.model");
const Aluno = require("../models/aluno.model");

function asTimestamp(value) {
  return value ? new Date(value).getTime() : 0;
}

function alunoToInscricaoRows(aluno) {
  const oficinas = Array.isArray(aluno.oficinas) && aluno.oficinas.length ? aluno.oficinas : ["Sem oficina"];

  return {
    id: `aluno:${aluno.id}`,
    source: "aluno",
    sourceId: aluno.id,
    nome: aluno.nome,
    cpf: aluno.cpf || "",
    idade: aluno.idade === "" ? "" : Number(aluno.idade),
    telefone: aluno.telefone || "",
    responsavel: aluno.responsavel || "",
    email: aluno.email || "",
    oficina: oficinas.join(", "),
    oficinas,
    observacoes: aluno.observacoes || "",
    documentosCount: 0,
    status: aluno.status || "ativo",
    created_at: aluno.created_at,
    updated_at: aluno.updated_at
  };
}

function inscriptionToRow(inscricao) {
  return {
    ...inscricao,
    source: "inscricao",
    sourceId: inscricao.id,
    status: "inscrito"
  };
}

function filterRows(rows, filters = {}) {
  const search = String(filters.search || "").toLowerCase();
  const normalizedSearchPhone = search.replace(/\D/g, "");
  const oficina = String(filters.oficina || "");

  return rows.filter((item) => {
    const oficinas = Array.isArray(item.oficinas) && item.oficinas.length ? item.oficinas : [item.oficina];
    const matchesSearch = !search
      || item.nome.toLowerCase().includes(search)
      || (normalizedSearchPhone && String(item.cpf || "").includes(normalizedSearchPhone))
      || item.email.toLowerCase().includes(search)
      || (normalizedSearchPhone && item.telefone.replace(/\D/g, "").includes(normalizedSearchPhone));
    const matchesOficina = !oficina || oficinas.includes(oficina);
    return matchesSearch && matchesOficina;
  });
}

async function combinedRows(filters = {}) {
  const [inscricoes, alunos] = await Promise.all([
    Inscricao.findAll(filters),
    Aluno.findAll({ search: filters.search || "" })
  ]);

  return filterRows([
    ...inscricoes.map(inscriptionToRow),
    ...alunos.map(alunoToInscricaoRows)
  ], filters)
    .sort((a, b) => asTimestamp(b.created_at) - asTimestamp(a.created_at));
}

function uniquePersonRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = row.cpf ? `cpf:${row.cpf}` : `${row.source}:${row.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function create(data, documentos = []) {
  return Inscricao.create(data, documentos);
}

async function list(filters) {
  return combinedRows(filters);
}

async function update(id, data) {
  return Inscricao.update(id, data);
}

async function remove(id) {
  return Inscricao.remove(id);
}

async function dashboard() {
  const rows = uniquePersonRows(await combinedRows());
  const byOficina = rows.reduce((acc, item) => {
    const oficinas = Array.isArray(item.oficinas) && item.oficinas.length ? item.oficinas : [item.oficina];
    oficinas.forEach((oficina) => {
      if (!oficina || oficina === "Sem oficina") return;
      acc[oficina] = (acc[oficina] || 0) + 1;
    });
    return acc;
  }, {});

  const porOficina = Object.entries(byOficina)
    .map(([oficina, total]) => ({ oficina, total }))
    .sort((a, b) => b.total - a.total || a.oficina.localeCompare(b.oficina));

  return {
    total: rows.length,
    porOficina,
    recentes: rows.slice(0, 5)
  };
}

async function listDocuments(inscricaoId) {
  return Inscricao.findDocuments(inscricaoId);
}

async function getDocument(documentId) {
  return Inscricao.findDocument(documentId);
}

module.exports = {
  create,
  list,
  update,
  remove,
  dashboard,
  listDocuments,
  getDocument
};
