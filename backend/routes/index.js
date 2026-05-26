const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const validate = require("../middlewares/validate.middleware");
const upload = require("../middlewares/upload.middleware");
const { requireAuth, requireStudentAuth, authorizeRoles } = require("../middlewares/auth.middleware");
const { requireCsrf, issueCsrfToken } = require("../middlewares/csrf.middleware");
const { auditAction } = require("../middlewares/audit.middleware");
const { loginHoneypot } = require("../middlewares/admin-security.middleware");
const {
  aiLimiter,
  inscriptionLimiter,
  loginLimiter,
  adminCredentialLimiter,
  portalCredentialLimiter,
  portalMatriculaLimiter,
  legacyCredentialLimiter,
  ticketIpLimiter,
  ticketLimiter,
  enrollmentCancellationLimiter,
  attachmentLimiter,
  sensitiveIpLimiter,
  sensitiveActionLimiter,
  exportIpLimiter,
  exportLimiter,
  matriculaSendIpLimiter,
  matriculaSendLimiter,
  firstAccessListLimiter,
  firstAccessIpLimiter,
  firstAccessActionLimiter,
  firstAccessPdfLimiter,
  statusLookupLimiter
} = require("../middlewares/rateLimit.middleware");
const InscricaoController = require("../controllers/inscricao.controller");
const AiController = require("../controllers/ai.controller");
const AuthController = require("../controllers/auth.controller");
const AdminUserController = require("../controllers/admin-user.controller");
const AuditController = require("../controllers/audit.controller");
const DashboardController = require("../controllers/dashboard.controller");
const OficinaController = require("../controllers/oficina.controller");
const TurmaController = require("../controllers/turma.controller");
const GaleriaController = require("../controllers/galeria.controller");
const ColaboradorController = require("../controllers/colaborador.controller");
const DepoimentoController = require("../controllers/depoimento.controller");
const AlunoController = require("../controllers/aluno.controller");
const BolsistaController = require("../controllers/bolsista.controller");
const CalendarioController = require("../controllers/calendario.controller");
const ChamadaController = require("../controllers/chamada.controller");
const CaptchaController = require("../controllers/captcha.controller");
const SupportController = require("../controllers/support.controller");
const FaqController = require("../controllers/faq.controller");
const FirstAccessController = require("../controllers/first-access.controller");
const AdminManualController = require("../controllers/admin-manual.controller");
const {
  inscriptionSchema,
  updateInscriptionSchema,
  loginSchema,
  listQuerySchema,
  idParamSchema,
  adminListQuerySchema,
  oficinaSchema,
  turmaListQuerySchema,
  turmaSchema,
  turmaStatusSchema,
  galeriaSchema,
  colaboradorSchema,
  depoimentoSchema,
  adminUserSchema,
  adminUserUpdateSchema,
  auditLogQuerySchema,
  alunoSchema,
  bolsistaSchema,
  calendarQuerySchema,
  calendarEventSchema,
  chamadaQuerySchema,
  chamadaHistoryQuerySchema,
  chartAnalyticsQuerySchema,
  chamadaSchema,
  aiChatSchema,
  adminStudentAssistSchema,
  supportPortalSchema,
  supportTicketSchema,
  supportTicketQuerySchema,
  workshopFeedbackSchema,
  enrollmentCancellationSchema,
  firstAccessListQuerySchema,
  firstAccessMessageSchema,
  firstAccessGuidanceSchema,
  firstAccessPdfSchema,
  workshopFeedbackQuerySchema,
  supportAttachmentParamSchema,
  supportTicketResponseSchema,
  supportPostSchema,
  faqSchema,
  adminMessageAssistSchema
} = require("../utils/validators");

const router = express.Router();

function publicDataCache(req, res, next) {
  res.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  next();
}
const adminOnly = [requireAuth, authorizeRoles("admin", "master")];
const attendanceOnly = [requireAuth, authorizeRoles("chamadas", "admin", "master")];
const masterOnly = [requireAuth, authorizeRoles("master")];

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

router.get("/csrf-token", issueCsrfToken);
router.get("/captcha/challenge", asyncHandler(CaptchaController.challenge));

router.get(["/admin-manual", "/admin-manual.html"], ...adminOnly, (req, res) => {
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return res.redirect(302, "/admin.html#manual");
});

router.get("/oficinas", publicDataCache, asyncHandler(OficinaController.list));
router.get(
  "/oficinas/:id/turmas",
  publicDataCache,
  validate(idParamSchema, "params"),
  asyncHandler(TurmaController.listPublicByOficina)
);
router.get("/galeria", publicDataCache, asyncHandler(GaleriaController.list));
router.get("/colaboradores", publicDataCache, asyncHandler(ColaboradorController.list));
router.get("/depoimentos", publicDataCache, asyncHandler(DepoimentoController.list));
router.get("/faq", publicDataCache, asyncHandler(FaqController.listPublic));
router.get(
  "/galeria/:id/imagem",
  validate(idParamSchema, "params"),
  asyncHandler(GaleriaController.image)
);
router.get(
  "/colaboradores/:id/imagem",
  validate(idParamSchema, "params"),
  asyncHandler(ColaboradorController.image)
);

router.post(
  "/inscricao",
  inscriptionLimiter,
  upload.rejectLargeMultipart(21 * 1024 * 1024),
  upload.inscriptionUpload.fields([
    { name: "documentos", maxCount: 8 },
    { name: "termoAssinado", maxCount: 1 }
  ]),
  upload.validateUploadedFiles,
  validate(inscriptionSchema),
  asyncHandler(InscricaoController.create)
);

router.post(
  "/inscricoes/status",
  statusLookupLimiter,
  legacyCredentialLimiter,
  asyncHandler(InscricaoController.legacyStatusRetired)
);

router.post(
  "/ai/chat",
  aiLimiter,
  validate(aiChatSchema),
  asyncHandler(AiController.chat)
);

router.post(
  "/suporte/login",
  statusLookupLimiter,
  portalCredentialLimiter,
  portalMatriculaLimiter,
  validate(supportPortalSchema),
  asyncHandler(SupportController.portal)
);

router.get(
  "/suporte/portal",
  requireStudentAuth,
  asyncHandler(SupportController.portalSession)
);

router.post(
  "/suporte/logout",
  requireStudentAuth,
  requireCsrf,
  asyncHandler(SupportController.logout)
);

router.get(
  "/suporte/tickets",
  statusLookupLimiter,
  requireStudentAuth,
  validate(supportTicketQuerySchema, "query"),
  asyncHandler(SupportController.ticketHistory)
);

router.post(
  "/suporte/tickets",
  requireStudentAuth,
  ticketIpLimiter,
  ticketLimiter,
  requireCsrf,
  upload.rejectLargeMultipart(22 * 1024 * 1024),
  upload.array("anexos", 4),
  upload.validateUploadedFiles,
  validate(supportTicketSchema),
  asyncHandler(SupportController.createTicket)
);

router.post(
  "/suporte/feedback",
  statusLookupLimiter,
  requireStudentAuth,
  requireCsrf,
  validate(workshopFeedbackSchema),
  asyncHandler(SupportController.createFeedback)
);

router.post(
  "/suporte/inscricoes/cancelar",
  requireStudentAuth,
  enrollmentCancellationLimiter,
  requireCsrf,
  validate(enrollmentCancellationSchema),
  asyncHandler(SupportController.cancelEnrollment)
);

router.get(
  "/suporte/tickets/:ticketId/anexos/:attachmentId",
  requireStudentAuth,
  attachmentLimiter,
  validate(supportAttachmentParamSchema, "params"),
  asyncHandler(SupportController.downloadAttachment)
);

router.post(
  "/auth/login",
  loginLimiter,
  adminCredentialLimiter,
  loginHoneypot,
  validate(loginSchema),
  asyncHandler(AuthController.login)
);
router.get("/auth/me", requireAuth, AuthController.me);
router.post("/auth/logout", requireAuth, requireCsrf, AuthController.logout);

router.get(
  "/admin/usuarios",
  ...masterOnly,
  asyncHandler(AdminUserController.list)
);

router.post(
  "/admin/usuarios",
  ...masterOnly,
  requireCsrf,
  validate(adminUserSchema),
  auditAction("create", "admin_usuario"),
  asyncHandler(AdminUserController.create)
);

router.put(
  "/admin/usuarios/:id",
  ...masterOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  validate(adminUserUpdateSchema),
  auditAction("update", "admin_usuario"),
  asyncHandler(AdminUserController.update)
);

router.delete(
  "/admin/usuarios/:id",
  ...masterOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  auditAction("delete", "admin_usuario"),
  asyncHandler(AdminUserController.remove)
);

router.post(
  "/admin/usuarios/:id/revogar-sessoes",
  ...masterOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  auditAction("update", "admin_usuario_sessao"),
  asyncHandler(AdminUserController.revokeSessions)
);

router.get(
  "/admin/logs",
  ...masterOnly,
  validate(auditLogQuerySchema, "query"),
  asyncHandler(AuditController.list)
);

router.post(
  "/ai/admin/student-assist",
  aiLimiter,
  ...adminOnly,
  requireCsrf,
  validate(adminStudentAssistSchema),
  asyncHandler(AiController.adminStudentAssist)
);

router.post(
  "/ai/admin/message-assist",
  aiLimiter,
  ...adminOnly,
  requireCsrf,
  validate(adminMessageAssistSchema),
  asyncHandler(AiController.adminMessageAssist)
);

router.get(
  "/admin/suporte",
  ...adminOnly,
  asyncHandler(SupportController.adminList)
);

router.get(
  "/admin/feedbacks",
  ...adminOnly,
  validate(workshopFeedbackQuerySchema, "query"),
  asyncHandler(SupportController.adminFeedbacks)
);

router.get(
  "/admin/primeiro-acesso/alunos",
  ...adminOnly,
  firstAccessListLimiter,
  validate(firstAccessListQuerySchema, "query"),
  asyncHandler(FirstAccessController.list)
);

router.get(
  "/admin/manual",
  ...adminOnly,
  asyncHandler(AdminManualController.content)
);

router.get(
  "/admin/primeiro-acesso/alunos/:id/historico",
  ...adminOnly,
  firstAccessListLimiter,
  validate(idParamSchema, "params"),
  asyncHandler(FirstAccessController.history)
);

router.post(
  "/admin/primeiro-acesso/alunos/:id/mensagem",
  ...adminOnly,
  firstAccessIpLimiter,
  firstAccessActionLimiter,
  requireCsrf,
  validate(idParamSchema, "params"),
  validate(firstAccessMessageSchema),
  asyncHandler(FirstAccessController.message)
);

router.post(
  "/admin/primeiro-acesso/alunos/:id/marcar-enviado",
  ...adminOnly,
  firstAccessIpLimiter,
  firstAccessActionLimiter,
  requireCsrf,
  validate(idParamSchema, "params"),
  validate(firstAccessGuidanceSchema),
  asyncHandler(FirstAccessController.markSent)
);

router.post(
  "/admin/primeiro-acesso/alunos/:id/desmarcar-enviado",
  ...adminOnly,
  firstAccessIpLimiter,
  firstAccessActionLimiter,
  requireCsrf,
  validate(idParamSchema, "params"),
  asyncHandler(FirstAccessController.unmarkSent)
);

router.post(
  "/admin/primeiro-acesso/pdf",
  ...adminOnly,
  firstAccessIpLimiter,
  firstAccessPdfLimiter,
  requireCsrf,
  validate(firstAccessPdfSchema),
  asyncHandler(FirstAccessController.pdf)
);

router.post(
  "/admin/suporte/tickets/:id/responder",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  validate(supportTicketResponseSchema),
  auditAction("update", "suporte_ticket"),
  asyncHandler(SupportController.respondTicket)
);

router.get(
  "/admin/suporte/tickets/:ticketId/anexos/:attachmentId",
  ...adminOnly,
  sensitiveIpLimiter,
  sensitiveActionLimiter,
  validate(supportAttachmentParamSchema, "params"),
  asyncHandler(SupportController.adminDownloadAttachment)
);

router.post(
  "/admin/suporte/murais",
  ...adminOnly,
  requireCsrf,
  validate(supportPostSchema),
  auditAction("create", "suporte_mural"),
  asyncHandler(SupportController.createPost)
);

router.put(
  "/admin/suporte/murais/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  validate(supportPostSchema),
  auditAction("update", "suporte_mural"),
  asyncHandler(SupportController.updatePost)
);

router.delete(
  "/admin/suporte/murais/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  auditAction("delete", "suporte_mural"),
  asyncHandler(SupportController.removePost)
);

router.get(
  "/admin/faq",
  ...adminOnly,
  asyncHandler(FaqController.listAdmin)
);

router.post(
  "/admin/faq",
  ...adminOnly,
  requireCsrf,
  validate(faqSchema),
  auditAction("create", "faq"),
  asyncHandler(FaqController.create)
);

router.put(
  "/admin/faq/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  validate(faqSchema),
  auditAction("update", "faq"),
  asyncHandler(FaqController.update)
);

router.delete(
  "/admin/faq/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  auditAction("delete", "faq"),
  asyncHandler(FaqController.remove)
);

router.get(
  "/inscricoes",
  ...adminOnly,
  validate(listQuerySchema, "query"),
  asyncHandler(InscricaoController.list)
);

router.get(
  "/inscricoes/export/csv",
  ...adminOnly,
  exportIpLimiter,
  exportLimiter,
  validate(listQuerySchema, "query"),
  asyncHandler(InscricaoController.exportCsv)
);

router.get(
  "/inscricoes/documentos.zip",
  ...adminOnly,
  exportIpLimiter,
  exportLimiter,
  validate(listQuerySchema, "query"),
  asyncHandler(InscricaoController.downloadDocumentsZip)
);

router.get(
  "/inscricoes/:id/documentos",
  ...adminOnly,
  validate(idParamSchema, "params"),
  asyncHandler(InscricaoController.listDocuments)
);

router.get(
  "/inscricoes/:id/documentos.zip",
  ...adminOnly,
  exportIpLimiter,
  exportLimiter,
  validate(idParamSchema, "params"),
  asyncHandler(InscricaoController.downloadInscricaoDocumentsZip)
);

router.get(
  "/inscricoes/documentos/:id/download",
  ...adminOnly,
  exportIpLimiter,
  exportLimiter,
  validate(idParamSchema, "params"),
  asyncHandler(InscricaoController.downloadDocument)
);

router.put(
  "/inscricoes/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  validate(updateInscriptionSchema),
  auditAction("update", "inscricao"),
  asyncHandler(InscricaoController.update)
);

router.delete(
  "/inscricoes/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  auditAction("delete", "inscricao"),
  asyncHandler(InscricaoController.remove)
);

router.get(
  "/dashboard",
  ...adminOnly,
  asyncHandler(DashboardController.overview)
);

router.get(
  "/admin/oficinas",
  ...attendanceOnly,
  validate(adminListQuerySchema, "query"),
  asyncHandler(OficinaController.list)
);

router.get(
  "/admin/turmas",
  ...attendanceOnly,
  validate(turmaListQuerySchema, "query"),
  asyncHandler(TurmaController.list)
);

router.post(
  "/admin/turmas",
  ...adminOnly,
  requireCsrf,
  validate(turmaSchema),
  auditAction("create", "turma"),
  asyncHandler(TurmaController.create)
);

router.put(
  "/admin/turmas/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  validate(turmaSchema),
  auditAction("update", "turma"),
  asyncHandler(TurmaController.update)
);

router.patch(
  "/admin/turmas/:id/status",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  validate(turmaStatusSchema),
  auditAction("update", "turma"),
  asyncHandler(TurmaController.setStatus)
);

router.delete(
  "/admin/turmas/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  auditAction("delete", "turma"),
  asyncHandler(TurmaController.remove)
);

router.post(
  "/admin/oficinas",
  ...adminOnly,
  requireCsrf,
  validate(oficinaSchema),
  auditAction("create", "oficina"),
  asyncHandler(OficinaController.create)
);

router.put(
  "/admin/oficinas/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  validate(oficinaSchema),
  auditAction("update", "oficina"),
  asyncHandler(OficinaController.update)
);

router.delete(
  "/admin/oficinas/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  auditAction("delete", "oficina"),
  asyncHandler(OficinaController.remove)
);

router.post(
  "/admin/galeria",
  ...adminOnly,
  requireCsrf,
  upload.rejectLargeMultipart(6 * 1024 * 1024),
  upload.imageUpload.single("imagemArquivo"),
  upload.validateUploadedFiles,
  validate(galeriaSchema),
  auditAction("create", "galeria"),
  asyncHandler(GaleriaController.create)
);

router.get(
  "/admin/depoimentos",
  ...adminOnly,
  validate(adminListQuerySchema, "query"),
  asyncHandler(DepoimentoController.list)
);

router.post(
  "/admin/depoimentos",
  ...adminOnly,
  requireCsrf,
  validate(depoimentoSchema),
  auditAction("create", "depoimento"),
  asyncHandler(DepoimentoController.create)
);

router.put(
  "/admin/depoimentos/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  validate(depoimentoSchema),
  auditAction("update", "depoimento"),
  asyncHandler(DepoimentoController.update)
);

router.delete(
  "/admin/depoimentos/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  auditAction("delete", "depoimento"),
  asyncHandler(DepoimentoController.remove)
);

router.get(
  "/admin/galeria",
  ...adminOnly,
  validate(adminListQuerySchema, "query"),
  asyncHandler(GaleriaController.list)
);

router.put(
  "/admin/galeria/:id",
  ...adminOnly,
  requireCsrf,
  upload.rejectLargeMultipart(6 * 1024 * 1024),
  upload.imageUpload.single("imagemArquivo"),
  upload.validateUploadedFiles,
  validate(idParamSchema, "params"),
  validate(galeriaSchema),
  auditAction("update", "galeria"),
  asyncHandler(GaleriaController.update)
);

router.delete(
  "/admin/galeria/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  auditAction("delete", "galeria"),
  asyncHandler(GaleriaController.remove)
);

router.post(
  "/admin/colaboradores",
  ...adminOnly,
  requireCsrf,
  upload.rejectLargeMultipart(6 * 1024 * 1024),
  upload.imageUpload.single("imagemArquivo"),
  upload.validateUploadedFiles,
  validate(colaboradorSchema),
  auditAction("create", "colaborador"),
  asyncHandler(ColaboradorController.create)
);

router.get(
  "/admin/colaboradores",
  ...adminOnly,
  validate(adminListQuerySchema, "query"),
  asyncHandler(ColaboradorController.list)
);

router.put(
  "/admin/colaboradores/:id",
  ...adminOnly,
  requireCsrf,
  upload.rejectLargeMultipart(6 * 1024 * 1024),
  upload.imageUpload.single("imagemArquivo"),
  upload.validateUploadedFiles,
  validate(idParamSchema, "params"),
  validate(colaboradorSchema),
  auditAction("update", "colaborador"),
  asyncHandler(ColaboradorController.update)
);

router.delete(
  "/admin/colaboradores/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  auditAction("delete", "colaborador"),
  asyncHandler(ColaboradorController.remove)
);

router.get(
  "/alunos",
  ...adminOnly,
  validate(adminListQuerySchema, "query"),
  asyncHandler(AlunoController.list)
);

router.post(
  "/alunos",
  ...adminOnly,
  requireCsrf,
  validate(alunoSchema),
  auditAction("create", "aluno"),
  asyncHandler(AlunoController.create)
);

router.post(
  "/alunos/importar",
  ...adminOnly,
  requireCsrf,
  upload.rejectLargeMultipart(8 * 1024 * 1024),
  upload.spreadsheetUpload.single("planilha"),
  upload.validateUploadedSpreadsheet,
  auditAction("create", "aluno_importacao"),
  asyncHandler(AlunoController.importFromSpreadsheet)
);

router.post(
  "/alunos/importar-legado",
  ...adminOnly,
  requireCsrf,
  upload.rejectLargeMultipart(8 * 1024 * 1024),
  upload.spreadsheetUpload.single("planilha"),
  upload.validateUploadedSpreadsheet,
  auditAction("create", "aluno_importacao_legado"),
  asyncHandler(AlunoController.importLegacySpreadsheet)
);

router.get(
  "/alunos/:id",
  ...adminOnly,
  validate(idParamSchema, "params"),
  asyncHandler(AlunoController.detail)
);

router.put(
  "/alunos/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  validate(alunoSchema),
  auditAction("update", "aluno"),
  asyncHandler(AlunoController.update)
);

router.delete(
  "/alunos/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  auditAction("delete", "aluno"),
  asyncHandler(AlunoController.remove)
);

router.post(
  "/alunos/:id/matricula-whatsapp",
  ...adminOnly,
  matriculaSendIpLimiter,
  matriculaSendLimiter,
  requireCsrf,
  validate(idParamSchema, "params"),
  auditAction("send", "aluno_matricula_whatsapp"),
  asyncHandler(AlunoController.matriculaWhatsapp)
);

router.post(
  "/alunos/:id/revogar-sessoes",
  ...adminOnly,
  sensitiveIpLimiter,
  sensitiveActionLimiter,
  requireCsrf,
  validate(idParamSchema, "params"),
  auditAction("update", "aluno_sessao"),
  asyncHandler(AlunoController.revokeSessions)
);

router.get(
  "/admin/bolsistas",
  ...adminOnly,
  validate(adminListQuerySchema, "query"),
  asyncHandler(BolsistaController.list)
);

router.post(
  "/admin/bolsistas",
  ...adminOnly,
  requireCsrf,
  validate(bolsistaSchema),
  auditAction("create", "bolsista"),
  asyncHandler(BolsistaController.create)
);

router.put(
  "/admin/bolsistas/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  validate(bolsistaSchema),
  auditAction("update", "bolsista"),
  asyncHandler(BolsistaController.update)
);

router.delete(
  "/admin/bolsistas/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  auditAction("delete", "bolsista"),
  asyncHandler(BolsistaController.remove)
);

router.get(
  "/admin/calendario",
  ...adminOnly,
  validate(calendarQuerySchema, "query"),
  asyncHandler(CalendarioController.month)
);

router.post(
  "/admin/calendario/eventos",
  ...adminOnly,
  requireCsrf,
  validate(calendarEventSchema),
  auditAction("create", "calendario_evento"),
  asyncHandler(CalendarioController.createEvent)
);

router.put(
  "/admin/calendario/eventos/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  validate(calendarEventSchema),
  auditAction("update", "calendario_evento"),
  asyncHandler(CalendarioController.updateEvent)
);

router.delete(
  "/admin/calendario/eventos/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  auditAction("delete", "calendario_evento"),
  asyncHandler(CalendarioController.removeEvent)
);

router.get(
  "/chamadas/turmas",
  ...attendanceOnly,
  asyncHandler(ChamadaController.turmas)
);

router.get(
  "/chamadas",
  ...attendanceOnly,
  validate(chamadaQuerySchema, "query"),
  asyncHandler(ChamadaController.get)
);

router.get(
  "/chamadas/historico",
  ...attendanceOnly,
  validate(chamadaHistoryQuerySchema, "query"),
  asyncHandler(ChamadaController.history)
);

router.get(
  "/admin/graficos",
  ...adminOnly,
  validate(chartAnalyticsQuerySchema, "query"),
  asyncHandler(ChamadaController.analytics)
);

router.post(
  "/chamadas",
  ...attendanceOnly,
  requireCsrf,
  validate(chamadaSchema),
  auditAction("create", "chamada"),
  asyncHandler(ChamadaController.save)
);

module.exports = router;
