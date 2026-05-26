const PDFDocument = require("pdfkit");
const Audit = require("../models/audit.model");
const FirstAccess = require("../models/first-access.model");

function noStore(res) {
  res.set("Cache-Control", "private, no-store, max-age=0");
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
}

async function auditEvent(req, action, entityId, eventAction, metadata = {}) {
  return Audit.create({
    admin: req.user,
    action,
    entityType: "first_access_guidance",
    entityId: entityId || "",
    metadata: { eventAction, ...metadata },
    ip: req.ip
  });
}

async function list(req, res) {
  const result = await FirstAccess.listStudents(req.validated.query);
  noStore(res);
  return res.json(result);
}

async function message(req, res) {
  const { id } = req.validated.params;
  const { actionType } = req.validated.body;
  const result = await FirstAccess.prepareMessage(id, req.user.sub, actionType);
  if (!result) return res.status(404).json({ message: "Aluno não encontrado." });
  await auditEvent(req, "send", id, actionType);
  noStore(res);
  return res.json(result);
}

async function markSent(req, res) {
  const { id } = req.validated.params;
  const result = await FirstAccess.markGuidanceSent(id, req.user.sub, req.validated.body.method);
  if (!result) return res.status(404).json({ message: "Aluno não encontrado." });
  await auditEvent(req, "update", id, "marked_access_guidance_sent", { method: req.validated.body.method });
  noStore(res);
  return res.json({ message: "Orientação marcada como enviada.", status: result });
}

async function unmarkSent(req, res) {
  const { id } = req.validated.params;
  const result = await FirstAccess.unmarkGuidanceSent(id, req.user.sub);
  if (!result) return res.status(404).json({ message: "Aluno não encontrado." });
  await auditEvent(req, "update", id, "unmarked_access_guidance_sent");
  noStore(res);
  return res.json({ message: "Marcação de orientação removida.", status: result });
}

async function history(req, res) {
  const result = await FirstAccess.history(req.validated.params.id);
  if (!result) return res.status(404).json({ message: "Aluno não encontrado." });
  noStore(res);
  return res.json({ events: result });
}

function renderCard(doc, student, y) {
  doc.roundedRect(40, y, 515, 148, 8).strokeColor("#b8c6d9").stroke();
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#122235").text("Centro da Juventude - Portal do Aluno", 54, y + 14);
  doc.font("Helvetica").fontSize(10).fillColor("#394b61").text(`Aluno: ${student.nome}`, 54, y + 37);
  doc.text(`Oficina/turma: ${(student.oficinas || []).join(", ") || "A confirmar"}${student.turmas?.length ? ` - ${student.turmas.join(", ")}` : ""}`, 54, y + 53, { width: 475 });
  doc.font("Helvetica-Bold").fillColor("#102b47").text(`Matrícula: ${student.matricula}`, 54, y + 73);
  doc.font("Helvetica").fillColor("#394b61").text("Acesse https://cjtamandare.vercel.app/portal usando seu CPF e esta matrícula.", 54, y + 94, { width: 475 });
  doc.text("Não compartilhe sua matrícula com outras pessoas.", 54, y + 115, { width: 475 });
}

async function pdf(req, res) {
  const students = await FirstAccess.studentsForPdf(req.validated.body);
  const document = new PDFDocument({ margin: 40, size: "A4", info: { Title: "Orientações de primeiro acesso - CJ Tamandaré" } });
  const chunks = [];
  document.on("data", (chunk) => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => {
    document.on("end", resolve);
    document.on("error", reject);
  });
  document.font("Helvetica-Bold").fontSize(16).fillColor("#102b47").text("Uso interno/entrega ao aluno - Primeiro Acesso");
  document.font("Helvetica").fontSize(10).fillColor("#52677e").text("Imprima e entregue cada cartão apenas ao aluno ou responsável autorizado.", { marginBottom: 18 });
  let y = 94;
  students.forEach((student) => {
    if (y + 148 > 790) {
      document.addPage();
      y = 45;
    }
    renderCard(document, student, y);
    y += 163;
  });
  if (!students.length) {
    document.font("Helvetica").fontSize(12).fillColor("#394b61").text("Nenhum aluno encontrado para os filtros selecionados.", 40, 98);
  }
  document.end();
  await completed;

  const safeMetadata = {
    count: students.length,
    oficinaId: req.validated.body.oficinaId || "",
    turmaFiltered: Boolean(req.validated.body.turma),
    somenteSemPrimeiroAcesso: req.validated.body.somenteSemPrimeiroAcesso,
    somenteNaoOrientados: req.validated.body.somenteNaoOrientados
  };
  await FirstAccess.recordEvent({
    adminId: req.user.sub,
    actionType: "generated_access_guidance_pdf",
    oficinaId: req.validated.body.oficinaId || null,
    metadata: safeMetadata
  });
  await auditEvent(req, "export", "", "generated_access_guidance_pdf", safeMetadata);
  noStore(res);
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": "attachment; filename=\"primeiro-acesso-cj.pdf\""
  });
  return res.send(Buffer.concat(chunks));
}

module.exports = {
  history,
  list,
  markSent,
  message,
  pdf,
  unmarkSent
};
