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
  const current = await Admin.findById(req.validated.params.id);
  if (!current) return res.status(404).json({ message: "ADM não encontrado." });
  const removesActiveMaster = current.role === "master"
    && current.active
    && (req.validated.body.role !== "master" || req.validated.body.active === false);
  if (removesActiveMaster && await Admin.countActiveMasters() <= 1) {
    return res.status(409).json({ message: "Mantenha ao menos um usuário Master ativo." });
  }
  const admin = await Admin.update(req.validated.params.id, req.validated.body);
  return res.json({ message: "ADM atualizado com sucesso.", admin });
}

async function remove(req, res) {
  if (req.user?.sub === req.validated.params.id) {
    return res.status(400).json({ message: "Você não pode excluir seu próprio usuário." });
  }
  const removed = await Admin.remove(req.validated.params.id);
  if (!removed) return res.status(404).json({ message: "ADM não encontrado." });
  return res.status(204).send();
}

async function revokeSessions(req, res) {
  const admin = await Admin.revokeSessions(req.validated.params.id);
  if (!admin) return res.status(404).json({ message: "ADM não encontrado." });
  return res.json({ message: "Sessões administrativas encerradas.", admin });
}

module.exports = {
  list,
  create,
  update,
  remove,
  revokeSessions
};
