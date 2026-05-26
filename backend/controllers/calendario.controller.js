const Calendario = require("../models/calendario.model");

async function month(req, res) {
  const calendario = await Calendario.monthView(req.validated.query.mes);
  return res.json({ calendario });
}

async function createEvent(req, res) {
  const evento = await Calendario.createEvent(req.validated.body);
  return res.status(201).json({ message: "Evento cadastrado com sucesso.", evento });
}

async function updateEvent(req, res) {
  const evento = await Calendario.updateEvent(req.validated.params.id, req.validated.body);
  if (!evento) return res.status(404).json({ message: "Evento não encontrado." });
  return res.json({ message: "Evento atualizado com sucesso.", evento });
}

async function removeEvent(req, res) {
  const removed = await Calendario.removeEvent(req.validated.params.id);
  if (!removed) return res.status(404).json({ message: "Evento não encontrado." });
  return res.status(204).send();
}

module.exports = {
  month,
  createEvent,
  updateEvent,
  removeEvent
};
