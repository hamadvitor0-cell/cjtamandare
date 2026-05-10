const Admin = require("../models/admin.model");

async function list(req, res) {
  const admins = await Admin.list();
  return res.json({ admins });
}

async function create(req, res) {
  const admin = await Admin.create(req.validated.body);
  return res.status(201).json({ message: "ADM criado com sucesso.", admin });
}

async function update(req, res) {
  const admin = await Admin.update(req.validated.params.id, req.validated.body);
  if (!admin) return res.status(404).json({ message: "ADM nao encontrado." });
  return res.json({ message: "ADM atualizado com sucesso.", admin });
}

async function remove(req, res) {
  if (req.user?.sub === req.validated.params.id) {
    return res.status(400).json({ message: "Voce nao pode excluir seu proprio usuario." });
  }
  const removed = await Admin.remove(req.validated.params.id);
  if (!removed) return res.status(404).json({ message: "ADM nao encontrado." });
  return res.status(204).send();
}

module.exports = {
  list,
  create,
  update,
  remove
};
