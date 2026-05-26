const Joi = require("joi");
const { isValidCpf, normalizeCpf } = require("./cpf");
const phonePattern = /^[0-9()+\-\s]{10,20}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeImageUrlPattern = /^(\/|https?:\/\/)/i;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const cpfField = Joi.string().custom((value, helpers) => {
  const cpf = normalizeCpf(value);
  if (!isValidCpf(cpf)) return helpers.message("CPF inválido.");
  return cpf;
});

const optionalCpfField = Joi.string().allow("").custom((value, helpers) => {
  if (!value) return "";
  const cpf = normalizeCpf(value);
  if (!isValidCpf(cpf)) return helpers.message("CPF inválido.");
  return cpf;
});

const birthDateField = Joi.date().iso().max("now").required().messages({
  "any.required": "Informe a data de nascimento cadastrada.",
  "date.base": "Informe uma data de nascimento válida.",
  "date.max": "A data de nascimento não pode ser futura."
});

const matriculaField = Joi.string()
  .trim()
  .uppercase()
  .pattern(/^CJ-\d{4}-\d{4,8}$/)
  .required()
  .messages({
    "any.required": "Informe a matrícula do aluno.",
    "string.empty": "Informe a matrícula do aluno.",
    "string.pattern.base": "Informe a matrícula no formato CJ-2026-0001."
  });

const inscriptionSchema = Joi.object({
  nome: Joi.string().min(3).max(120).required().messages({
    "any.required": "Nome completo é obrigatório.",
    "string.min": "Informe o nome completo."
  }),
  cpf: cpfField.required(),
  dataNascimento: birthDateField,
  idade: Joi.number().integer().min(0).max(99).required(),
  telefone: Joi.string().pattern(phonePattern).required(),
  responsavel: Joi.string().allow("").max(120),
  email: Joi.string().email({ tlds: { allow: false } }).allow("").max(160),
  oficina: Joi.string().min(2).max(100),
  oficinas: Joi.array().items(Joi.string().min(2).max(100)).single().min(1).max(20),
  turmaId: Joi.string().allow("").pattern(uuidPattern),
  possuiDeficiencia: Joi.boolean().truthy("true").truthy("sim").truthy("1").falsy("false").falsy("nao").falsy("não").falsy("0").required(),
  deficienciaDescricao: Joi.when("possuiDeficiencia", {
    is: true,
    then: Joi.string().trim().min(2).max(500).required().messages({
      "any.required": "Descreva qual deficiencia foi informada.",
      "string.empty": "Descreva qual deficiencia foi informada."
    }),
    otherwise: Joi.string().allow("").max(500)
  }),
  observacoes: Joi.string().allow("").max(500),
  website: Joi.string().allow("").max(120),
  captchaToken: Joi.string().required().max(2048),
  captchaX: Joi.number().min(0).max(1000).required(),
  captchaMoves: Joi.number().integer().min(1).max(5000).required()
}).or("oficina", "oficinas");

const updateInscriptionSchema = inscriptionSchema
  .keys({ cpf: optionalCpfField })
  .fork(["cpf", "dataNascimento", "website", "captchaToken", "captchaX", "captchaMoves"], (field) => field.optional())
  .unknown(false);

const loginSchema = Joi.object({
  username: Joi.string().pattern(/^[a-zA-Z0-9._-]{3,40}$/).required(),
  registrationCode: Joi.string().pattern(/^\d{6}$/).required()
});

const listQuerySchema = Joi.object({
  search: Joi.string().allow("").max(120),
  oficina: Joi.string().allow("").max(100)
});

const idParamSchema = Joi.object({
  id: Joi.string().pattern(uuidPattern).required()
});

const supportAttachmentParamSchema = Joi.object({
  ticketId: Joi.string().pattern(uuidPattern).required(),
  attachmentId: Joi.string().pattern(uuidPattern).required()
});

const adminListQuerySchema = Joi.object({
  search: Joi.string().allow("").max(120),
  oficinaId: Joi.string().allow("").pattern(uuidPattern),
  oficina_id: Joi.string().allow("").pattern(uuidPattern),
  includeInactive: Joi.boolean().truthy("true").falsy("false"),
  status: Joi.string().allow("").valid("", "ativo", "inativo"),
  sort: Joi.string().allow("").valid("", "nome", "recentes").default("nome"),
  page: Joi.number().integer().min(1).max(100000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});

const turmaListQuerySchema = Joi.object({
  search: Joi.string().allow("").max(120),
  oficinaId: Joi.string().allow("").pattern(uuidPattern),
  oficina_id: Joi.string().allow("").pattern(uuidPattern),
  bolsistaId: Joi.string().allow("").pattern(uuidPattern),
  periodo: Joi.string().allow("").valid("", "manha", "tarde", "noite", "integral"),
  status: Joi.string().allow("").valid("", "ativa", "inativa", "todas"),
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
  turmas: Joi.array().items(Joi.string().trim().min(2).max(180)).max(200).default([]),
  imagemUrl: Joi.string().allow("").pattern(safeImageUrlPattern).max(400),
  initials: Joi.string().min(1).max(4).required(),
  ativo: Joi.boolean().truthy("true").falsy("false")
});

const turmaSchema = Joi.object({
  oficinaId: Joi.string().pattern(uuidPattern).required(),
  nome: Joi.string().trim().min(2).max(160).required(),
  diasSemana: Joi.array().items(Joi.string().valid(
    "segunda",
    "terca",
    "quarta",
    "quinta",
    "sexta",
    "sabado",
    "domingo"
  )).min(1).max(7).required(),
  periodo: Joi.string().valid("manha", "tarde", "noite", "integral").required(),
  horarioInicio: Joi.string().pattern(timePattern).required(),
  horarioFim: Joi.string().pattern(timePattern).required(),
  idadeMinima: Joi.number().integer().min(0).max(99).required(),
  idadeMaxima: Joi.number().integer().min(0).max(99).required(),
  vagasTotal: Joi.number().integer().min(1).max(10000).required(),
  bolsistaId: Joi.string().allow("").pattern(uuidPattern),
  local: Joi.string().allow("").max(120),
  observacoes: Joi.string().allow("").max(1000),
  ativa: Joi.boolean().truthy("true").falsy("false").default(true)
}).custom((value, helpers) => {
  if (value.horarioInicio >= value.horarioFim) {
    return helpers.message("O horario de inicio deve ser menor que o horario de termino.");
  }
  if (Number(value.idadeMinima) > Number(value.idadeMaxima)) {
    return helpers.message("A idade minima nao pode ser maior que a idade maxima.");
  }
  return value;
});

const turmaStatusSchema = Joi.object({
  ativa: Joi.boolean().truthy("true").falsy("false").required()
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

const depoimentoSchema = Joi.object({
  nome: Joi.string().min(2).max(120).required(),
  vinculo: Joi.string().allow("").max(120),
  texto: Joi.string().min(10).max(700).required(),
  oficina: Joi.string().allow("").max(120),
  ordem: Joi.number().integer().min(0).max(9999),
  ativo: Joi.boolean().truthy("true").falsy("false")
});

const adminUserSchema = Joi.object({
  name: Joi.string().min(2).max(120).required(),
  username: Joi.string().pattern(/^[a-zA-Z0-9._-]{3,40}$/).required(),
  registrationCode: Joi.string().pattern(/^\d{6}$/).required(),
  role: Joi.string().valid("master", "admin", "chamadas").default("admin"),
  active: Joi.boolean().truthy("true").falsy("false").default(true)
});

const adminUserUpdateSchema = adminUserSchema.keys({
  registrationCode: Joi.string().allow("").pattern(/^\d{6}$/)
});

const auditLogQuerySchema = Joi.object({
  search: Joi.string().allow("").max(120),
  action: Joi.string().allow("").valid("", "login", "create", "update", "delete", "send", "export", "denied"),
  entityType: Joi.string().allow("").max(80),
  entity_type: Joi.string().allow("").max(80),
  usuario: Joi.string().allow("").max(120),
  dataInicio: Joi.string().allow("").pattern(/^\d{4}-\d{2}-\d{2}$/),
  dataFim: Joi.string().allow("").pattern(/^\d{4}-\d{2}-\d{2}$/),
  limit: Joi.number().integer().min(1).max(300)
});

const alunoSchema = Joi.object({
  nome: Joi.string().min(3).max(120).required(),
  cpf: optionalCpfField,
  idade: Joi.number().integer().min(0).max(99).allow("", null),
  telefone: Joi.string().allow("").pattern(phonePattern),
  responsavel: Joi.string().allow("").max(120),
  email: Joi.string().email({ tlds: { allow: false } }).allow("").max(160),
  dataNascimento: Joi.date().iso().allow("", null),
  bairro: Joi.string().allow("").max(120),
  turmas: Joi.array().items(Joi.string().trim().min(2).max(180)).max(200).default([]),
  turmaIds: Joi.array().items(Joi.string().pattern(uuidPattern)).max(20).default([]),
  documentosLinks: Joi.array().items(Joi.string().trim().max(600)).max(40).default([]),
  possuiDeficiencia: Joi.boolean().truthy("true").truthy("sim").truthy("1").falsy("false").falsy("nao").falsy("não").falsy("0").default(false),
  deficienciaDescricao: Joi.string().allow("").max(500),
  origem: Joi.string().allow("").max(80),
  oficinaId: Joi.string().allow("").pattern(uuidPattern),
  turmaId: Joi.string().allow("").pattern(uuidPattern),
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
  tipo: Joi.string().valid("aula", "evento", "reuniao", "passeio", "cancelamento", "comunicado", "formacao", "outro").required(),
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
  turmaId: Joi.string().allow("").pattern(uuidPattern),
  turma: Joi.string().allow("").max(180),
  data: Joi.date().iso().required()
});

const chamadaHistoryQuerySchema = Joi.object({
  oficinaId: Joi.string().allow("").pattern(uuidPattern),
  turmaId: Joi.string().allow("").pattern(uuidPattern),
  turma: Joi.string().allow("").max(180)
});

const chartAnalyticsQuerySchema = Joi.object({
  periodo: Joi.string().valid("", "geral", "mes", "semana").allow("").default("geral"),
  mes: Joi.string().allow("").pattern(/^\d{4}-\d{2}$/),
  semana: Joi.string().allow("").pattern(/^\d{4}-W\d{2}$/),
  sort: Joi.string().valid(
    "inscritos_desc",
    "inscritos_asc",
    "frequencia_desc",
    "frequencia_asc",
    "presencas_desc",
    "presencas_asc",
    "faltas_desc",
    "faltas_asc",
    "justificadas_desc",
    "justificadas_asc",
    "chamadas_desc",
    "chamadas_asc"
  ).default("inscritos_desc")
});

const chamadaSchema = Joi.object({
  oficinaId: Joi.string().pattern(uuidPattern).required(),
  turmaId: Joi.string().allow("").pattern(uuidPattern),
  turma: Joi.string().allow("").max(180).default(""),
  data: Joi.date().iso().required(),
  observacoes: Joi.string().allow("").max(500),
  presencas: Joi.array().items(Joi.object({
    alunoId: Joi.string().pattern(uuidPattern).required(),
    status: Joi.string().valid("presente", "ausente", "justificado").required(),
    observacao: Joi.string().allow("").max(240)
  })).max(500).required()
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

const supportPortalSchema = Joi.object({
  cpf: cpfField.required(),
  matricula: matriculaField
});

const supportTicketSchema = Joi.object({
  categoria: Joi.string().valid("duvida", "erro_matricula", "alteracao_documentos", "problemas_cj", "problemas_site").required(),
  descricao: Joi.string().trim().min(10).max(2000).required()
});

const supportTicketQuerySchema = Joi.object({});

const workshopFeedbackSchema = Joi.object({
  oficinaId: Joi.string().pattern(uuidPattern).required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comentario: Joi.string().trim().min(5).max(1200).required()
});

const enrollmentCancellationSchema = Joi.object({
  oficinaId: Joi.string().pattern(uuidPattern).required(),
  confirmacao: Joi.boolean().valid(true).required()
});

const firstAccessListQuerySchema = Joi.object({
  oficinaId: Joi.string().allow("").pattern(uuidPattern),
  turma: Joi.string().allow("").trim().max(180).default(""),
  statusPrimeiroAcesso: Joi.string().valid("todos", "sem_primeiro_acesso", "com_primeiro_acesso").default("sem_primeiro_acesso"),
  statusOrientacao: Joi.string().valid("todos", "pendente", "enviada").default("todos"),
  search: Joi.string().allow("").trim().max(100).default(""),
  page: Joi.number().integer().min(1).max(100000).default(1),
  limit: Joi.number().integer().valid(20, 50, 100).default(20)
});

const firstAccessMessageSchema = Joi.object({
  actionType: Joi.string().valid("copied_access_message", "opened_access_whatsapp").required()
});

const firstAccessGuidanceSchema = Joi.object({
  method: Joi.string().valid("whatsapp_manual", "presencial", "telefone", "outro").required()
});

const firstAccessPdfSchema = Joi.object({
  oficinaId: Joi.string().allow("").pattern(uuidPattern).default(""),
  turma: Joi.string().allow("").trim().max(180).default(""),
  somenteSemPrimeiroAcesso: Joi.boolean().default(true),
  somenteNaoOrientados: Joi.boolean().default(true),
  formato: Joi.string().valid("cards", "lista_interna").default("cards"),
  confirmLarge: Joi.boolean().default(false)
}).custom((value, helpers) => {
  if (!value.oficinaId && !value.turma) {
    return helpers.message("Selecione uma oficina ou turma para gerar o PDF.");
  }
  return value;
});

const workshopFeedbackQuerySchema = Joi.object({
  oficinaId: Joi.string().allow("").pattern(uuidPattern),
  rating: Joi.number().integer().min(1).max(5).allow("")
});

const supportTicketResponseSchema = Joi.object({
  status: Joi.string().valid("aberto", "em_atendimento", "respondido", "encerrado").required(),
  resposta: Joi.string().trim().min(2).max(2000).required()
});

const supportPostSchema = Joi.object({
  targetType: Joi.string().valid("geral", "oficina", "aluno").required(),
  oficinaId: Joi.when("targetType", {
    is: "oficina",
    then: Joi.string().pattern(uuidPattern).required(),
    otherwise: Joi.string().allow("").pattern(uuidPattern)
  }),
  alunoId: Joi.when("targetType", {
    is: "aluno",
    then: Joi.string().pattern(uuidPattern).required(),
    otherwise: Joi.string().allow("").pattern(uuidPattern)
  }),
  tipo: Joi.string().valid("aviso", "cancelamento", "horario", "professor", "evento", "institucional", "notificacao").required(),
  prioridade: Joi.string().valid("normal", "importante", "urgente").default("normal"),
  titulo: Joi.string().trim().min(2).max(140).required(),
  mensagem: Joi.string().trim().min(5).max(1200).required(),
  ativo: Joi.boolean().truthy("true").falsy("false").default(true)
});

const faqSchema = Joi.object({
  pergunta: Joi.string().trim().min(3).max(180).required(),
  resposta: Joi.string().trim().min(5).max(1600).required(),
  ordem: Joi.number().integer().min(0).max(9999).default(0),
  ativo: Joi.boolean().truthy("true").falsy("false").default(true)
});

const adminMessageAssistSchema = Joi.object({
  tipo: Joi.string().valid("cancelamento", "inicio_turma", "encerramento_turma", "alteracao_horario", "comunicado_geral", "evento").required(),
  oficina: Joi.string().allow("").max(120),
  data: Joi.string().allow("").max(40),
  horario: Joi.string().allow("").max(80),
  observacoes: Joi.string().allow("").max(500)
});

module.exports = {
  inscriptionSchema,
  updateInscriptionSchema,
  loginSchema,
  listQuerySchema,
  idParamSchema,
  adminListQuerySchema,
  turmaListQuerySchema,
  oficinaSchema,
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
};
