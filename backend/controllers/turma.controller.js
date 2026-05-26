const Turma = require("../models/turma.model");

async function list(req, res) {
  const turmas = await Turma.findAll(req.validated?.query || {});
  res.set("Cache-Control", "private, no-store");
  return res.json({ turmas });
}

async function listPublicByOficina(req, res) {
  const turmas = await Turma.listPublicByOficina(req.validated.params.id);
  return res.json({
    turmas: turmas.map(Turma.toPublicSafe)
  });
}

async function create(req, res) {
  const turma = await Turma.create(req.validated.body);
  return res.status(201).json({ message: "Turma criada com sucesso.", turma });
}

async function update(req, res) {
  const turma = await Turma.update(req.validated.params.id, req.validated.body);
  if (!turma) return res.status(404).json({ message: "Turma nao encontrada." });
  return res.json({ message: "Turma atualizada com sucesso.", turma });
}

async function setStatus(req, res) {
  const turma = await Turma.setStatus(req.validated.params.id, req.validated.body.ativa);
  if (!turma) return res.status(404).json({ message: "Turma nao encontrada." });
  return res.json({ message: turma.ativa ? "Turma ativada com sucesso." : "Turma inativada com sucesso.", turma });
}

async function remove(req, res) {
  const removed = await Turma.remove(req.validated.params.id);
  if (!removed) return res.status(404).json({ message: "Turma nao encontrada." });
  return res.status(204).send();
}

module.exports = {
  list,
  listPublicByOficina,
  create,
  update,
  setStatus,
  remove
};
