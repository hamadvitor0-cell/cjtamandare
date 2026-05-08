const Chamada = require("../models/chamada.model");

function normalizeDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function get(req, res) {
  const data = await Chamada.getByOficinaAndDate(
    req.validated.query.oficinaId,
    normalizeDate(req.validated.query.data)
  );
  return res.json(data);
}

async function save(req, res) {
  const payload = {
    ...req.validated.body,
    data: normalizeDate(req.validated.body.data)
  };
  const result = await Chamada.save(payload);
  return res.json({ message: "Chamada salva com sucesso.", ...result });
}

async function history(req, res) {
  const chamadas = await Chamada.history(req.validated.query);
  return res.json({ chamadas });
}

module.exports = {
  get,
  save,
  history
};
