const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const validate = require("../middlewares/validate.middleware");
const upload = require("../middlewares/upload.middleware");
const { requireAuth, authorizeRoles } = require("../middlewares/auth.middleware");
const { requireCsrf, issueCsrfToken } = require("../middlewares/csrf.middleware");
const { auditAction } = require("../middlewares/audit.middleware");
const { aiLimiter, inscriptionLimiter, loginLimiter, statusLookupLimiter } = require("../middlewares/rateLimit.middleware");
const InscricaoController = require("../controllers/inscricao.controller");
const AiController = require("../controllers/ai.controller");
const AuthController = require("../controllers/auth.controller");
const AdminUserController = require("../controllers/admin-user.controller");
const AuditController = require("../controllers/audit.controller");
const DashboardController = require("../controllers/dashboard.controller");
const OficinaController = require("../controllers/oficina.controller");
const GaleriaController = require("../controllers/galeria.controller");
const ColaboradorController = require("../controllers/colaborador.controller");
const DepoimentoController = require("../controllers/depoimento.controller");
const AlunoController = require("../controllers/aluno.controller");
const BolsistaController = require("../controllers/bolsista.controller");
const CalendarioController = require("../controllers/calendario.controller");
const ChamadaController = require("../controllers/chamada.controller");
const CaptchaController = require("../controllers/captcha.controller");
const {
  inscriptionSchema,
  updateInscriptionSchema,
  loginSchema,
  listQuerySchema,
  idParamSchema,
  adminListQuerySchema,
  oficinaSchema,
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
  chamadaSchema,
  statusLookupSchema,
  aiChatSchema,
  adminStudentAssistSchema
} = require("../utils/validators");

const router = express.Router();
const adminOnly = [requireAuth, authorizeRoles("admin", "master")];
const masterOnly = [requireAuth, authorizeRoles("master")];

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

router.get("/csrf-token", issueCsrfToken);
router.get("/captcha/challenge", asyncHandler(CaptchaController.challenge));

router.get("/oficinas", asyncHandler(OficinaController.list));
router.get("/galeria", asyncHandler(GaleriaController.list));
router.get("/colaboradores", asyncHandler(ColaboradorController.list));
router.get("/depoimentos", asyncHandler(DepoimentoController.list));
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
  upload.rejectLargeMultipart(16 * 1024 * 1024),
  upload.array("documentos", 8),
  upload.validateUploadedFiles,
  validate(inscriptionSchema),
  asyncHandler(InscricaoController.create)
);

router.post(
  "/inscricoes/status",
  statusLookupLimiter,
  validate(statusLookupSchema),
  asyncHandler(InscricaoController.status)
);

router.post(
  "/ai/chat",
  aiLimiter,
  validate(aiChatSchema),
  asyncHandler(AiController.chat)
);

router.post(
  "/auth/login",
  loginLimiter,
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

router.get(
  "/admin/logs",
  ...adminOnly,
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

router.get(
  "/inscricoes",
  ...adminOnly,
  validate(listQuerySchema, "query"),
  asyncHandler(InscricaoController.list)
);

router.get(
  "/inscricoes/export/csv",
  ...adminOnly,
  validate(listQuerySchema, "query"),
  asyncHandler(InscricaoController.exportCsv)
);

router.get(
  "/inscricoes/documentos.zip",
  ...adminOnly,
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
  validate(idParamSchema, "params"),
  asyncHandler(InscricaoController.downloadInscricaoDocumentsZip)
);

router.get(
  "/inscricoes/documentos/:id/download",
  ...adminOnly,
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
  ...adminOnly,
  validate(adminListQuerySchema, "query"),
  asyncHandler(OficinaController.list)
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
  "/chamadas",
  ...adminOnly,
  validate(chamadaQuerySchema, "query"),
  asyncHandler(ChamadaController.get)
);

router.get(
  "/chamadas/historico",
  ...adminOnly,
  validate(chamadaHistoryQuerySchema, "query"),
  asyncHandler(ChamadaController.history)
);

router.post(
  "/chamadas",
  ...adminOnly,
  requireCsrf,
  validate(chamadaSchema),
  auditAction("create", "chamada"),
  asyncHandler(ChamadaController.save)
);

module.exports = router;
