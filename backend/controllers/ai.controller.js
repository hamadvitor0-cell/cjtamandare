const AiService = require("../services/ai.service");

async function chat(req, res) {
  const result = await AiService.chat(req.validated.body);
  return res.json(result);
}

async function adminStudentAssist(req, res) {
  const result = await AiService.adminStudentAssist(req.validated.body);
  return res.json(result);
}

async function adminMessageAssist(req, res) {
  const result = await AiService.adminMessageAssist(req.validated.body);
  return res.json(result);
}

module.exports = {
  chat,
  adminStudentAssist,
  adminMessageAssist
};
