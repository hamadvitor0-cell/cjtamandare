const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const validate = require("../middlewares/validate.middleware");
const upload = require("../middlewares/upload.middleware");
const { requireAuth, authorizeRoles } = require("../middlewares/auth.middleware");
const { requireCsrf, issueCsrfToken } = require("../middlewares/csrf.middleware");
const { aiLimiter, inscriptionLimiter, loginLimiter, statusLookupLimiter } = require("../middlewares/rateLimit.middleware");
const InscricaoController = require("../controllers/inscricao.controller");
const AiController = require("../controllers/ai.controller");
const AuthController = require("../controllers/auth.controller");
const DashboardController = require("../controllers/dashboard.controller");
const OficinaController = require("../controllers/oficina.controller");
const GaleriaController = require("../controllers/galeria.controller");
const AlunoController = require("../controllers/aluno.controller");
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
  alunoSchema,
  chamadaQuerySchema,
  chamadaHistoryQuerySchema,
  chamadaSchema,
  statusLookupSchema,
  aiChatSchema,
  adminStudentAssistSchema
} = require("../utils/validators");

const router = express.Router();
const adminOnly = [requireAuth, authorizeRoles("admin")];

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
router.get(
  "/galeria/:id/imagem",
  validate(idParamSchema, "params"),
  asyncHandler(GaleriaController.image)
);

router.post(
  "/inscricao",
  inscriptionLimiter,
  upload.array("documentos", 8),
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
  "/inscricoes/:id/documentos",
  ...adminOnly,
  validate(idParamSchema, "params"),
  asyncHandler(InscricaoController.listDocuments)
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
  asyncHandler(InscricaoController.update)
);

router.delete(
  "/inscricoes/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
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
  asyncHandler(OficinaController.create)
);

router.put(
  "/admin/oficinas/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  validate(oficinaSchema),
  asyncHandler(OficinaController.update)
);

router.delete(
  "/admin/oficinas/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  asyncHandler(OficinaController.remove)
);

router.post(
  "/admin/galeria",
  ...adminOnly,
  requireCsrf,
  upload.imageUpload.single("imagemArquivo"),
  validate(galeriaSchema),
  asyncHandler(GaleriaController.create)
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
  upload.imageUpload.single("imagemArquivo"),
  validate(idParamSchema, "params"),
  validate(galeriaSchema),
  asyncHandler(GaleriaController.update)
);

router.delete(
  "/admin/galeria/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  asyncHandler(GaleriaController.remove)
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
  asyncHandler(AlunoController.create)
);

router.put(
  "/alunos/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  validate(alunoSchema),
  asyncHandler(AlunoController.update)
);

router.delete(
  "/alunos/:id",
  ...adminOnly,
  requireCsrf,
  validate(idParamSchema, "params"),
  asyncHandler(AlunoController.remove)
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
  asyncHandler(ChamadaController.save)
);

module.exports = router;
