const Inscricao = require("../models/inscricao.model");
const Aluno = require("../models/aluno.model");
const Oficina = require("../models/oficina.model");
const db = require("../database/pool");
const { maskCpf, normalizeCpf } = require("../utils/cpf");

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
    oficinaDetalhes: aluno.oficinaDetalhes || oficinas.map((oficina) => ({
      oficina,
      createdAt: aluno.created_at,
      source: "aluno"
    })),
    advertencias: aluno.advertencias || "",
    historicoOficinas: aluno.historicoOficinas || "",
    documentosPendentes: aluno.documentosPendentes || false,
    faltasUltimos30Dias: Number(aluno.faltasUltimos30Dias || 0),
    ultimasChamadas: aluno.ultimasChamadas || [],
    observacoes: aluno.observacoes || "",
    documentosCount: 0,
    status: aluno.status || "ativo",
    created_at: aluno.created_at,
    updated_at: aluno.updated_at
  };
}

function sourceLabel(source) {
  return source === "aluno" ? "Aluno ADM" : "Inscricao online";
}

function uniqueValues(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function sourceRecord(row) {
  const oficinas = Array.isArray(row.oficinas) && row.oficinas.length ? row.oficinas : [row.oficina].filter(Boolean);
  return {
    source: row.source,
    sourceLabel: sourceLabel(row.source),
    sourceId: row.sourceId,
    id: row.id,
    nome: row.nome,
    cpf: row.cpf || "",
    idade: row.idade,
    telefone: row.telefone || "",
    responsavel: row.responsavel || "",
    email: row.email || "",
    oficinas,
    oficina: oficinas.join(", "),
    oficinaDetalhes: row.oficinaDetalhes || oficinas.map((oficina) => ({
      oficina,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      source: row.source
    })),
    documentosCount: Number(row.documentosCount || 0),
    observacoes: row.observacoes || "",
    status: row.status || "",
    advertencias: row.advertencias || "",
    historicoOficinas: row.historicoOficinas || "",
    documentosPendentes: row.documentosPendentes || false,
    faltasUltimos30Dias: Number(row.faltasUltimos30Dias || 0),
    ultimasChamadas: row.ultimasChamadas || [],
    listaEspera: row.listaEspera || [],
    confirmadas: row.confirmadas || [],
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function personRows(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const key = row.cpf ? `cpf:${row.cpf}` : `${row.source}:${row.sourceId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  return Array.from(groups.entries()).map(([key, group]) => {
    const sources = group.map(sourceRecord);
    const sortedByActivity = [...sources].sort((a, b) => asTimestamp(b.updated_at || b.created_at) - asTimestamp(a.updated_at || a.created_at));
    const primary = sortedByActivity[0] || sources[0];
    const online = sources.find((item) => item.source === "inscricao");
    const aluno = sources.find((item) => item.source === "aluno");
    const oficinas = uniqueValues(sources.flatMap((item) => item.oficinas));
    const oficinaDetalhes = sources
      .flatMap((item) => item.oficinaDetalhes.map((detail) => ({
        ...detail,
        source: detail.source || item.source,
        sourceLabel: sourceLabel(detail.source || item.source),
        sourceId: item.sourceId
      })))
      .sort((a, b) => asTimestamp(a.createdAt || a.created_at) - asTimestamp(b.createdAt || b.created_at));
    const firstCreated = sources
      .map((item) => item.created_at)
      .filter(Boolean)
      .sort((a, b) => asTimestamp(a) - asTimestamp(b))[0] || primary.created_at;

    return {
      id: key,
      source: "pessoa",
      sourceId: primary.sourceId,
      primarySource: primary.source,
      primarySourceId: primary.sourceId,
      inscricaoId: online?.sourceId || "",
      alunoId: aluno?.sourceId || "",
      nome: primary.nome,
      cpf: primary.cpf,
      idade: primary.idade,
      telefone: uniqueValues(sources.map((item) => item.telefone)).join(" / "),
      responsavel: uniqueValues(sources.map((item) => item.responsavel)).join(" / "),
      email: uniqueValues(sources.map((item) => item.email)).join(" / "),
      oficina: oficinas.join(", "),
      oficinas,
      oficinaDetalhes,
      sourceSummary: uniqueValues(sources.map((item) => item.sourceLabel)).join(" + "),
      sources,
      documentosCount: sources.reduce((total, item) => total + Number(item.documentosCount || 0), 0),
      documentSources: sources.filter((item) => item.source === "inscricao" && item.documentosCount > 0)
        .map((item) => ({ sourceId: item.sourceId, documentosCount: item.documentosCount, sourceLabel: item.sourceLabel })),
      status: aluno?.status || online?.status || primary.status || "",
      advertencias: aluno?.advertencias || "",
      historicoOficinas: aluno?.historicoOficinas || "",
      documentosPendentes: aluno?.documentosPendentes || false,
      faltasUltimos30Dias: Number(aluno?.faltasUltimos30Dias || 0),
      fichaAlerta: Number(aluno?.faltasUltimos30Dias || 0) > 2,
      ultimasChamadas: aluno?.ultimasChamadas || [],
      listaEspera: uniqueValues(oficinaDetalhes.filter((detail) => detail.status === "lista_espera").map((detail) => detail.oficina)),
      confirmadas: uniqueValues(oficinaDetalhes.filter((detail) => detail.status !== "lista_espera").map((detail) => detail.oficina)),
      observacoes: uniqueValues(sources.map((item) => item.observacoes)).join("\n\n"),
      created_at: firstCreated,
      updated_at: primary.updated_at || primary.created_at
    };
  }).sort((a, b) => asTimestamp(b.updated_at || b.created_at) - asTimestamp(a.updated_at || a.created_at));
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
      || (normalizedSearchPhone && String(item.telefone || "").replace(/\D/g, "").includes(normalizedSearchPhone));
    const matchesOficina = !oficina || oficinas.includes(oficina);
    return matchesSearch && matchesOficina;
  });
}

async function combinedRows(filters = {}) {
  const [inscricoes, alunos] = await Promise.all([
    Inscricao.findAll({ search: filters.search || "" }),
    Aluno.findAll({ search: filters.search || "" })
  ]);

  return [
    ...inscricoes.map(inscriptionToRow),
    ...alunos.map(alunoToInscricaoRows)
  ].sort((a, b) => asTimestamp(b.created_at) - asTimestamp(a.created_at));
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

function publicName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].slice(0, 1).toUpperCase()}.`;
}

function publicStatusLabel(status) {
  return status === "lista_espera" ? "Lista de espera" : "Confirmada";
}

function uniquePublicDetails(person) {
  const detalhes = person.oficinaDetalhes?.length
    ? person.oficinaDetalhes
    : (person.oficinas || [person.oficina].filter(Boolean)).map((oficina) => ({
      oficina,
      status: person.status === "lista_espera" ? "lista_espera" : "confirmada",
      createdAt: person.created_at
    }));

  const byOffice = new Map();
  detalhes.forEach((detail) => {
    if (!detail.oficina) return;
    const current = byOffice.get(detail.oficina);
    if (!current || asTimestamp(detail.updatedAt || detail.createdAt) >= asTimestamp(current.updatedAt || current.createdAt)) {
      byOffice.set(detail.oficina, detail);
    }
  });

  return Array.from(byOffice.values());
}

function publicStatusFromPerson(person) {
  const detalhes = uniquePublicDetails(person);
  const documentosPendentes = Boolean(person.documentosPendentes || Number(person.documentosCount || 0) === 0);
  const hasWaitlist = detalhes.some((detail) => detail.status === "lista_espera");
  const ultimasChamadas = (person.ultimasChamadas || [])
    .slice(0, 8)
    .map((call) => ({
      oficina: call.oficina || "Oficina",
      data: call.data || call.data_chamada || "",
      status: call.status || "",
      observacao: call.observacao || ""
    }));
  const aulasUltimos30Dias = ultimasChamadas.filter((call) => {
    const date = new Date(`${String(call.data).slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return false;
    const limit = new Date();
    limit.setDate(limit.getDate() - 30);
    return date >= limit;
  });
  const oficinas = detalhes.map((detail) => ({
    oficina: detail.oficina,
    situacao: publicStatusLabel(detail.status),
    dataInscricao: detail.createdAt || detail.created_at || person.created_at
  }));

  return {
    encontrado: true,
    nomeParcial: publicName(person.nome),
    cpf: maskCpf(person.cpf),
    situacao: hasWaitlist ? "Lista de espera" : documentosPendentes ? "Documentos pendentes" : "Confirmada",
    oficinas,
    documentosPendentes,
    documentos: documentosPendentes
      ? "Documentos pendentes ou ainda nao conferidos pela equipe."
      : "Sem pendencias marcadas no cadastro.",
    frequencia: {
      faltasUltimos30Dias: Number(person.faltasUltimos30Dias || 0),
      aulasUltimos30Dias,
      ultimasChamadas
    },
    dataInscricao: person.created_at,
    ultimaAtualizacao: person.updated_at
  };
}

async function syncCreatedInscricaoToAluno(inscricao) {
  if (!inscricao?.cpf) return;

  const confirmadas = inscricao.confirmadas?.length
    ? inscricao.confirmadas
    : (inscricao.oficinas || [inscricao.oficina].filter(Boolean))
      .filter((oficina) => !(inscricao.listaEspera || []).includes(oficina));
  if (!confirmadas.length) return;

  if (db.hasDatabase) {
    await Aluno.syncFromInscricoes({ cpf: inscricao.cpf });
    return;
  }

  const oficinas = await Oficina.findAll({ includeInactive: true });
  const oficinaIds = oficinas
    .filter((oficina) => confirmadas.includes(oficina.nome))
    .map((oficina) => oficina.id);
  if (!oficinaIds.length) return;

  await Aluno.create({
    nome: inscricao.nome,
    cpf: inscricao.cpf,
    idade: inscricao.idade || "",
    telefone: inscricao.telefone || "",
    responsavel: inscricao.responsavel || "",
    email: inscricao.email || "",
    oficinaIds,
    oficinaId: oficinaIds[0],
    status: "ativo",
    documentosPendentes: Number(inscricao.documentosCount || 0) === 0,
    observacoes: inscricao.observacoes || ""
  });
}

async function create(data, documentos = []) {
  const inscricao = await Inscricao.create(data, documentos);
  await syncCreatedInscricaoToAluno(inscricao);
  return inscricao;
}

async function list(filters) {
  return filterRows(personRows(await combinedRows(filters)), filters);
}

async function publicStatusByCpf(cpfInput) {
  const cpf = normalizeCpf(cpfInput);
  const rows = await combinedRows({ search: cpf });
  const person = personRows(rows).find((item) => item.cpf === cpf);

  if (!person) {
    return {
      encontrado: false,
      message: "Nenhuma inscricao encontrada para este CPF."
    };
  }

  return publicStatusFromPerson(person);
}

async function update(id, data) {
  return Inscricao.update(id, data);
}

async function remove(id) {
  return Inscricao.remove(id);
}

async function dashboard() {
  const rows = personRows(await combinedRows());
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

async function documentsArchive(filters = {}) {
  return Inscricao.findDocumentsForArchive(filters);
}

module.exports = {
  create,
  list,
  update,
  remove,
  dashboard,
  publicStatusByCpf,
  listDocuments,
  getDocument,
  documentsArchive
};
