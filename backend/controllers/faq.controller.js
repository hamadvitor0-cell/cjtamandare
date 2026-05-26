const Faq = require("../models/faq.model");

async function listPublic(req, res) {
  const faq = await Faq.list();
  return res.json({ faq });
}

async function listAdmin(req, res) {
  const faq = await Faq.list({ includeInactive: true });
  return res.json({ faq });
}

async function create(req, res) {
  const faq = await Faq.create(req.validated.body);
  return res.status(201).json({ message: "Pergunta do FAQ adicionada com sucesso.", faq });
}

async function update(req, res) {
  const faq = await Faq.update(req.validated.params.id, req.validated.body);
  if (!faq) return res.status(404).json({ message: "Pergunta do FAQ não encontrada." });
  return res.json({ message: "Pergunta do FAQ atualizada com sucesso.", faq });
}

async function remove(req, res) {
  const removed = await Faq.remove(req.validated.params.id);
  if (!removed) return res.status(404).json({ message: "Pergunta do FAQ não encontrada." });
  return res.json({ message: "Pergunta do FAQ removida com sucesso." });
}

module.exports = {
  listPublic,
  listAdmin,
  create,
  update,
  remove
};
