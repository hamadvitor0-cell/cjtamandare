const Galeria = require("../models/galeria.model");

async function list(req, res) {
  const includeInactive = Boolean(req.validated?.query?.includeInactive);
  const galeria = await Galeria.findAll({ includeInactive });
  return res.json({ galeria });
}

async function create(req, res) {
  const item = await Galeria.create(req.validated.body);
  return res.status(201).json({ message: "Imagem adicionada com sucesso.", item });
}

async function update(req, res) {
  const item = await Galeria.update(req.validated.params.id, req.validated.body);
  if (!item) return res.status(404).json({ message: "Imagem não encontrada." });
  return res.json({ message: "Imagem atualizada com sucesso.", item });
}

async function remove(req, res) {
  const removed = await Galeria.remove(req.validated.params.id);
  if (!removed) return res.status(404).json({ message: "Imagem não encontrada." });
  return res.status(204).send();
}

module.exports = {
  list,
  create,
  update,
  remove
};
