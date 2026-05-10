const Colaborador = require("../models/colaborador.model");

async function list(req, res) {
  const includeInactive = Boolean(req.validated?.query?.includeInactive);
  const colaboradores = await Colaborador.findAll({ includeInactive });
  return res.json({ colaboradores });
}

async function create(req, res) {
  const item = await Colaborador.create(req.validated.body, req.file);
  return res.status(201).json({ message: "Colaborador adicionado com sucesso.", item });
}

async function update(req, res) {
  const item = await Colaborador.update(req.validated.params.id, req.validated.body, req.file);
  if (!item) return res.status(404).json({ message: "Colaborador nao encontrado." });
  return res.json({ message: "Colaborador atualizado com sucesso.", item });
}

async function remove(req, res) {
  const removed = await Colaborador.remove(req.validated.params.id);
  if (!removed) return res.status(404).json({ message: "Colaborador nao encontrado." });
  return res.status(204).send();
}

async function image(req, res) {
  const file = await Colaborador.findImage(req.validated.params.id);
  if (!file?.fileContent) {
    return res.status(404).json({ message: "Imagem nao encontrada." });
  }

  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Length", file.sizeBytes);
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.send(file.fileContent);
}

module.exports = {
  list,
  create,
  update,
  remove,
  image
};
