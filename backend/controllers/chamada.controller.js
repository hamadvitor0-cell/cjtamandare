const Chamada = require("../models/chamada.model");

function normalizeDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function attendanceResponseForRole(data, role) {
  if (role !== "chamadas" || !Array.isArray(data?.alunos)) return data;
  return {
    ...data,
    alunos: data.alunos.map((aluno) => ({
      id: aluno.id,
      nome: aluno.nome,
      oficinaId: aluno.oficinaId,
      oficina: aluno.oficina,
      turmas: aluno.turmas || [],
      status: aluno.status,
      presenca: aluno.presenca,
      observacaoPresenca: aluno.observacaoPresenca || ""
    }))
  };
}

async function get(req, res) {
  const data = await Chamada.getByTurmaAndDate(
    req.validated.query.oficinaId,
    req.validated.query.turma || "",
    normalizeDate(req.validated.query.data),
    req.validated.query.turmaId || ""
  );
  return res.json(attendanceResponseForRole(data, req.user?.role));
}

async function turmas(req, res) {
  const turmasDisponiveis = await Chamada.turmaOptions();
  return res.json({ turmas: turmasDisponiveis });
}

async function save(req, res) {
  const payload = {
    ...req.validated.body,
    data: normalizeDate(req.validated.body.data)
  };
  const result = await Chamada.save(payload);
  return res.json({ message: "Chamada salva com sucesso.", ...attendanceResponseForRole(result, req.user?.role) });
}

async function history(req, res) {
  const chamadas = await Chamada.history(req.validated.query);
  return res.json({ chamadas });
}

async function analytics(req, res) {
  const graficos = await Chamada.analytics(req.validated.query);
  res.set("Cache-Control", "no-store");
  return res.json({ graficos });
}

module.exports = {
  turmas,
  get,
  save,
  history,
  analytics
};
