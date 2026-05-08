const Inscricao = require("../models/inscricao.model");

async function create(data, documentos = []) {
  return Inscricao.create(data, documentos);
}

async function list(filters) {
  return Inscricao.findAll(filters);
}

async function update(id, data) {
  return Inscricao.update(id, data);
}

async function remove(id) {
  return Inscricao.remove(id);
}

async function dashboard() {
  return Inscricao.stats();
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
