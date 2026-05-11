const Depoimento = require("../models/depoimento.model");

async function list(req, res) {
  const includeInactive = Boolean(req.validated?.query?.includeInactive);
  const depoimentos = await Depoimento.findAll({ includeInactive });
  return res.json({ depoimentos });
}

async function create(req, res) {
  const item = await Depoimento.create(req.validated.body);
  return res.status(201).json({ message: "Depoimento adicionado com sucesso.", item });
}

async function update(req, res) {
  const item = await Depoimento.update(req.validated.params.id, req.validated.body);
  if (!item) return res.status(404).json({ message: "Depoimento não encontrado." });
  return res.json({ message: "Depoimento atualizado com sucesso.", item });
}

async function remove(req, res) {
  const removed = await Depoimento.remove(req.validated.params.id);
  if (!removed) return res.status(404).json({ message: "Depoimento não encontrado." });
  return res.status(204).send();
}

module.exports = {
  list,
  create,
  update,
  remove
};
