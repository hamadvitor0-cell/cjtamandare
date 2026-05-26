const Galeria = require("../models/galeria.model");

function hasImageInput(req) {
  return Boolean(req.file || req.validated.body.imagemUrl);
}

async function list(req, res) {
  const includeInactive = Boolean(req.validated?.query?.includeInactive);
  const galeria = await Galeria.findAll({ includeInactive });
  return res.json({ galeria });
}

async function create(req, res) {
  if (!hasImageInput(req)) {
    return res.status(400).json({ message: "Envie um arquivo de imagem ou informe uma URL." });
  }

  const item = await Galeria.create(req.validated.body, req.file);
  return res.status(201).json({ message: "Imagem adicionada com sucesso.", item });
}

async function update(req, res) {
  if (!hasImageInput(req)) {
    return res.status(400).json({ message: "Envie um arquivo de imagem ou informe uma URL." });
  }

  const item = await Galeria.update(req.validated.params.id, req.validated.body, req.file);
  if (!item) return res.status(404).json({ message: "Imagem não encontrada." });
  return res.json({ message: "Imagem atualizada com sucesso.", item });
}

async function remove(req, res) {
  const removed = await Galeria.remove(req.validated.params.id);
  if (!removed) return res.status(404).json({ message: "Imagem não encontrada." });
  return res.status(204).send();
}

async function image(req, res) {
  const file = await Galeria.findImage(req.validated.params.id);
  if (!file?.fileContent) {
    return res.status(404).json({ message: "Imagem não encontrada." });
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
