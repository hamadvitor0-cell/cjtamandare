const Oficina = require("../models/oficina.model");

async function list(req, res) {
  const includeInactive = Boolean(req.validated?.query?.includeInactive);
  const oficinas = await Oficina.findAll({ includeInactive });
  const categorias = ["Todas", ...Array.from(new Set(oficinas.map((item) => item.categoria)))];
  return res.json({ oficinas, categorias });
}

async function create(req, res) {
  const oficina = await Oficina.create(req.validated.body);
  return res.status(201).json({ message: "Oficina criada com sucesso.", oficina });
}

async function update(req, res) {
  const oficina = await Oficina.update(req.validated.params.id, req.validated.body);
  if (!oficina) return res.status(404).json({ message: "Oficina não encontrada." });
  return res.json({ message: "Oficina atualizada com sucesso.", oficina });
}

async function remove(req, res) {
  const removed = await Oficina.remove(req.validated.params.id);
  if (!removed) return res.status(404).json({ message: "Oficina não encontrada." });
  return res.status(204).send();
}

module.exports = {
  list,
  create,
  update,
  remove
};
