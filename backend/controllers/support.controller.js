const Support = require("../models/support.model");
const AuthService = require("../services/auth.service");
const config = require("../config/env");

function studentCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction || config.cookieSameSite === "none",
    sameSite: config.cookieSameSite,
    path: "/",
    maxAge: AuthService.studentTokenMaxAgeMs
  };
}

async function portal(req, res) {
  const { portal: portalData, student } = await Support.portalByCredentials(req.validated.body);
  res.cookie("student_access_token", AuthService.signStudentToken(student), studentCookieOptions());
  res.set("Cache-Control", "no-store");
  return res.json({ portal: portalData });
}

async function portalSession(req, res) {
  const portalData = await Support.portalBySession(req.student);
  res.set("Cache-Control", "no-store");
  return res.json({ portal: portalData });
}

async function logout(req, res) {
  const { maxAge, ...clearOptions } = studentCookieOptions();
  res.clearCookie("student_access_token", clearOptions);
  return res.json({ message: "Sessão do aluno encerrada." });
}

async function createTicket(req, res) {
  const files = Array.isArray(req.files) ? req.files : [];
  const ticket = await Support.createTicketForStudent(req.student, req.validated.body, files);
  return res.status(201).json({
    message: `Chamado ${ticket.codigo} aberto com sucesso. Ele será excluído automaticamente após 30 dias.`,
    ticket
  });
}

async function createFeedback(req, res) {
  const feedback = await Support.createFeedbackForStudent(req.student, req.validated.body);
  return res.status(201).json({
    message: "Avaliação enviada com sucesso. Obrigado pelo feedback.",
    feedback
  });
}

async function cancelEnrollment(req, res) {
  const cancellation = await Support.cancelEnrollmentForStudent(req.student, req.validated.body);
  res.set("Cache-Control", "no-store");
  return res.json({
    message: `Inscrição em ${cancellation.oficina.nome} cancelada com sucesso.`,
    oficina: cancellation.oficina
  });
}

async function ticketHistory(req, res) {
  const tickets = await Support.ticketsForStudentSession(req.student);
  return res.json({ tickets });
}

async function adminList(req, res) {
  const support = await Support.listAdmin();
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return res.json({ support });
}

async function adminFeedbacks(req, res) {
  const feedbacks = await Support.listFeedbacks(req.validated.query);
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return res.json({ feedbacks });
}

async function respondTicket(req, res) {
  const ticket = await Support.respondTicket(req.validated.params.id, req.validated.body, req.user?.name || req.user?.username || "ADM");
  if (!ticket) return res.status(404).json({ message: "Ticket não encontrado ou expirado." });
  return res.json({ message: "Resposta do ticket salva com sucesso.", ticket });
}

function sendAttachment(res, attachment) {
  if (!attachment) return res.status(404).json({ message: "Anexo não encontrado." });
  const filename = String(attachment.original_name || "anexo").replace(/["\r\n]/g, "_");
  res.set({
    "Content-Type": attachment.mime_type || "application/octet-stream",
    "Content-Length": String(attachment.size_bytes || attachment.file_content?.length || 0),
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store"
  });
  return res.send(attachment.file_content);
}

async function downloadAttachment(req, res) {
  const attachment = await Support.findAttachmentForStudent(
    req.student,
    req.validated.params.ticketId,
    req.validated.params.attachmentId
  );
  return sendAttachment(res, attachment);
}

async function adminDownloadAttachment(req, res) {
  const attachment = await Support.findAttachmentForAdmin(
    req.validated.params.ticketId,
    req.validated.params.attachmentId
  );
  return sendAttachment(res, attachment);
}

async function createPost(req, res) {
  const post = await Support.createPost(req.validated.body);
  return res.status(201).json({ message: "Mensagem publicada com sucesso.", post });
}

async function updatePost(req, res) {
  const post = await Support.updatePost(req.validated.params.id, req.validated.body);
  if (!post) return res.status(404).json({ message: "Mensagem não encontrada." });
  return res.json({ message: "Mensagem atualizada com sucesso.", post });
}

async function removePost(req, res) {
  const removed = await Support.removePost(req.validated.params.id);
  if (!removed) return res.status(404).json({ message: "Mensagem não encontrada." });
  return res.json({ message: "Mensagem removida com sucesso." });
}

module.exports = {
  portal,
  portalSession,
  logout,
  createTicket,
  createFeedback,
  cancelEnrollment,
  ticketHistory,
  downloadAttachment,
  adminList,
  adminFeedbacks,
  respondTicket,
  adminDownloadAttachment,
  createPost,
  updatePost,
  removePost
};
