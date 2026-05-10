const Joi = require("joi");
const { isValidCpf, normalizeCpf } = require("./cpf");
const phonePattern = /^[0-9()+\-\s]{10,20}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeImageUrlPattern = /^(\/|https?:\/\/)/i;

const cpfField = Joi.string().custom((value, helpers) => {
  const cpf = normalizeCpf(value);
  if (!isValidCpf(cpf)) return helpers.message("CPF invalido.");
  return cpf;
});

const optionalCpfField = Joi.string().allow("").custom((value, helpers) => {
  if (!value) return "";
  const cpf = normalizeCpf(value);
  if (!isValidCpf(cpf)) return helpers.message("CPF invalido.");
  return cpf;
});

const inscriptionSchema = Joi.object({
  nome: Joi.string().min(3).max(120).required().messages({
    "any.required": "Nome completo é obrigatório.",
    "string.min": "Informe o nome completo."
  }),
  cpf: cpfField.required(),
  idade: Joi.number().integer().min(10).max(99).required(),
  telefone: Joi.string().pattern(phonePattern).required(),
  responsavel: Joi.string().allow("").max(120),
  email: Joi.string().email({ tlds: { allow: false } }).allow("").max(160),
  oficina: Joi.string().min(2).max(100),
  oficinas: Joi.array().items(Joi.string().min(2).max(100)).single().min(1).max(20),
  observacoes: Joi.string().allow("").max(500),
  website: Joi.string().allow("").max(120),
  captchaToken: Joi.string().required().max(2048),
  captchaX: Joi.number().min(0).max(1000).required(),
  captchaMoves: Joi.number().integer().min(1).max(5000).required()
}).or("oficina", "oficinas");

const updateInscriptionSchema = inscriptionSchema
  .keys({ cpf: optionalCpfField })
  .fork(["cpf", "website", "captchaToken", "captchaX", "captchaMoves"], (field) => field.optional())
  .unknown(false);

const loginSchema = Joi.object({
  email: Joi.string().min(3).max(160).required(),
  password: Joi.string().min(8).max(160).required()
});

const listQuerySchema = Joi.object({
  search: Joi.string().allow("").max(120),
  oficina: Joi.string().allow("").max(100)
});

const idParamSchema = Joi.object({
  id: Joi.string().pattern(uuidPattern).required()
});

const adminListQuerySchema = Joi.object({
  search: Joi.string().allow("").max(120),
  oficinaId: Joi.string().allow("").pattern(uuidPattern),
  oficina_id: Joi.string().allow("").pattern(uuidPattern),
  includeInactive: Joi.boolean().truthy("true").falsy("false")
});

const oficinaSchema = Joi.object({
  nome: Joi.string().min(2).max(100).required(),
  categoria: Joi.string().min(2).max(80).required(),
  descricao: Joi.string().min(8).max(500).required(),
  faixaEtaria: Joi.string().min(2).max(80).required(),
  diasSemana: Joi.array().items(Joi.string().valid(
    "segunda",
    "terca",
    "quarta",
    "quinta",
    "sexta",
    "sabado",
    "domingo"
  )).max(7).default([]),
  periodo: Joi.string().valid("matutino", "vespertino", "noturno", "integral", "a definir").required(),
  horario: Joi.string().min(2).max(120).required(),
  capacidade: Joi.number().integer().min(1).max(10000).required(),
  imagemUrl: Joi.string().allow("").pattern(safeImageUrlPattern).max(400),
  initials: Joi.string().min(1).max(4).required(),
  ativo: Joi.boolean().truthy("true").falsy("false")
});

const galeriaSchema = Joi.object({
  titulo: Joi.string().min(2).max(120).required(),
  descricao: Joi.string().allow("").max(300),
  imagemUrl: Joi.string().allow("").pattern(safeImageUrlPattern).max(500),
  alt: Joi.string().allow("").max(180),
  ordem: Joi.number().integer().min(0).max(9999),
  ativo: Joi.boolean().truthy("true").falsy("false")
});

const colaboradorSchema = Joi.object({
  nome: Joi.string().min(2).max(120).required(),
  descricao: Joi.string().allow("").max(700),
  siteUrl: Joi.string().uri({ scheme: ["http", "https"] }).max(500).required(),
  imagemUrl: Joi.string().allow("").pattern(safeImageUrlPattern).max(500),
  alt: Joi.string().allow("").max(180),
  ordem: Joi.number().integer().min(0).max(9999),
  ativo: Joi.boolean().truthy("true").falsy("false")
});

const adminUserSchema = Joi.object({
  name: Joi.string().min(2).max(120).required(),
  username: Joi.string().pattern(/^[a-zA-Z0-9._-]{3,40}$/).required(),
  email: Joi.string().email({ tlds: { allow: false } }).max(160).required(),
  password: Joi.string().min(8).max(160).required(),
  role: Joi.string().valid("master", "admin").default("admin"),
  active: Joi.boolean().truthy("true").falsy("false").default(true)
});

const adminUserUpdateSchema = adminUserSchema.keys({
  password: Joi.string().allow("").min(8).max(160)
});

const auditLogQuerySchema = Joi.object({
  search: Joi.string().allow("").max(120),
  action: Joi.string().allow("").valid("", "login", "create", "update", "delete"),
  entityType: Joi.string().allow("").max(80),
  entity_type: Joi.string().allow("").max(80),
  limit: Joi.number().integer().min(1).max(300)
});

const alunoSchema = Joi.object({
  nome: Joi.string().min(3).max(120).required(),
  cpf: optionalCpfField,
  idade: Joi.number().integer().min(10).max(99).allow("", null),
  telefone: Joi.string().allow("").pattern(phonePattern),
  responsavel: Joi.string().allow("").max(120),
  email: Joi.string().email({ tlds: { allow: false } }).allow("").max(160),
  oficinaId: Joi.string().allow("").pattern(uuidPattern),
  oficinaIds: Joi.array().items(Joi.string().pattern(uuidPattern)).min(1).max(20).required(),
  status: Joi.string().valid("ativo", "inativo").required(),
  documentosPendentes: Joi.boolean().truthy("true").falsy("false"),
  advertencias: Joi.string().allow("").max(1000),
  historicoOficinas: Joi.string().allow("").max(1000),
  observacoes: Joi.string().allow("").max(500)
});

const bolsistaSchema = Joi.object({
  nome: Joi.string().min(3).max(120).required(),
  cpf: optionalCpfField,
  idade: Joi.number().integer().min(14).max(24).required(),
  telefone: Joi.string().allow("").pattern(phonePattern),
  email: Joi.string().email({ tlds: { allow: false } }).allow("").max(160),
  funcao: Joi.string().valid("adm", "social_media", "professor", "ajudante_professor").required(),
  tipoAtuacao: Joi.string().valid("aula", "ajuda", "apoio", "sem_vinculo").required(),
  diasSemana: Joi.array().items(Joi.string().valid(
    "segunda",
    "terca",
    "quarta",
    "quinta",
    "sexta",
    "sabado",
    "domingo"
  )).max(2).default([]),
  oficinaId: Joi.string().allow("").pattern(uuidPattern),
  oficinaIds: Joi.array().items(Joi.string().pattern(uuidPattern)).max(20).default([]),
  status: Joi.string().valid("ativo", "inativo").required(),
  observacoes: Joi.string().allow("").max(1000)
});

const calendarQuerySchema = Joi.object({
  mes: Joi.string().pattern(/^\d{4}-\d{2}$/)
});

const calendarEventSchema = Joi.object({
  titulo: Joi.string().min(2).max(120).required(),
  tipo: Joi.string().valid("reuniao", "passeio", "evento", "formacao", "outro").required(),
  data: Joi.date().iso().required(),
  horarioInicio: Joi.string().allow("").pattern(/^([01]\d|2[0-3]):[0-5]\d$/),
  horarioFim: Joi.string().allow("").pattern(/^([01]\d|2[0-3]):[0-5]\d$/),
  local: Joi.string().allow("").max(120),
  oficinaId: Joi.string().allow("").pattern(uuidPattern),
  bolsistaIds: Joi.array().items(Joi.string().pattern(uuidPattern)).max(40).default([]),
  descricao: Joi.string().allow("").max(500)
});

const chamadaQuerySchema = Joi.object({
  oficinaId: Joi.string().pattern(uuidPattern).required(),
  data: Joi.date().iso().required()
});

const chamadaHistoryQuerySchema = Joi.object({
  oficinaId: Joi.string().allow("").pattern(uuidPattern)
});

const chamadaSchema = Joi.object({
  oficinaId: Joi.string().pattern(uuidPattern).required(),
  data: Joi.date().iso().required(),
  observacoes: Joi.string().allow("").max(500),
  presencas: Joi.array().items(Joi.object({
    alunoId: Joi.string().pattern(uuidPattern).required(),
    status: Joi.string().valid("presente", "ausente", "justificado").required(),
    observacao: Joi.string().allow("").max(240)
  })).max(500).required()
});

const statusLookupSchema = Joi.object({
  cpf: cpfField.required()
});

const aiChatSchema = Joi.object({
  messages: Joi.array().items(Joi.object({
    role: Joi.string().valid("user", "assistant").required(),
    content: Joi.string().trim().min(1).max(1400).required()
  })).min(1).max(12).required(),
  cpf: optionalCpfField.optional()
});

const adminStudentAssistSchema = Joi.object({
  mode: Joi.string().valid("full", "summary", "messages").default("full"),
  student: Joi.object().unknown(true).required()
});

module.exports = {
  inscriptionSchema,
  updateInscriptionSchema,
  loginSchema,
  listQuerySchema,
  idParamSchema,
  adminListQuerySchema,
  oficinaSchema,
  galeriaSchema,
  colaboradorSchema,
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
};
