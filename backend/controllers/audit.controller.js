const Audit = require("../models/audit.model");

async function list(req, res) {
  const logs = await Audit.list(req.validated.query);
  return res.json({ logs });
}

module.exports = {
  list
};
