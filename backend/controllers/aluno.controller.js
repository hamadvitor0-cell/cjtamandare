const Aluno = require("../models/aluno.model");

async function list(req, res) {
  const alunos = await Aluno.findAll(req.validated.query);
  return res.json({ alunos });
}

async function create(req, res) {
  const aluno = await Aluno.create(req.validated.body);
  return res.status(201).json({ message: "Aluno cadastrado com sucesso.", aluno });
}

async function update(req, res) {
  const aluno = await Aluno.update(req.validated.params.id, req.validated.body);
  if (!aluno) return res.status(404).json({ message: "Aluno não encontrado." });
  return res.json({ message: "Aluno atualizado com sucesso.", aluno });
}

async function remove(req, res) {
  const removed = await Aluno.remove(req.validated.params.id);
  if (!removed) return res.status(404).json({ message: "Aluno não encontrado." });
  return res.status(204).send();
}

module.exports = {
  list,
  create,
  update,
  remove
};
