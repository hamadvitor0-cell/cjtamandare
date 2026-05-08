const InscricaoService = require("../services/inscricao.service");

async function overview(req, res) {
  const dashboard = await InscricaoService.dashboard();
  return res.json({ dashboard });
}

module.exports = {
  overview
};
