const Bolsista = require("../models/bolsista.model");

async function list(req, res) {
  const bolsistas = await Bolsista.findAll(req.validated.query);
  return res.json({
    bolsistas,
    limite: Bolsista.MAX_BOLSISTAS,
    total: bolsistas.length
  });
}

async function create(req, res) {
  const bolsista = await Bolsista.create(req.validated.body);
  return res.status(201).json({ message: "Bolsista cadastrado com sucesso.", bolsista });
}

async function update(req, res) {
  const bolsista = await Bolsista.update(req.validated.params.id, req.validated.body);
  if (!bolsista) return res.status(404).json({ message: "Bolsista nao encontrado." });
  return res.json({ message: "Bolsista atualizado com sucesso.", bolsista });
}

async function remove(req, res) {
  const removed = await Bolsista.remove(req.validated.params.id);
  if (!removed) return res.status(404).json({ message: "Bolsista nao encontrado." });
  return res.status(204).send();
}

module.exports = {
  list,
  create,
  update,
  remove
};
