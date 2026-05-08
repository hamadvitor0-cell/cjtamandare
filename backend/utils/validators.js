const Joi = require("joi");
const phonePattern = /^[0-9()+\-\s]{10,20}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeImageUrlPattern = /^(\/|https?:\/\/)/i;

const inscriptionSchema = Joi.object({
  nome: Joi.string().min(3).max(120).required().messages({
    "any.required": "Nome completo é obrigatório.",
    "string.min": "Informe o nome completo."
  }),
  idade: Joi.number().integer().min(10).max(99).required(),
  telefone: Joi.string().pattern(phonePattern).required(),
  responsavel: Joi.string().allow("").max(120),
  email: Joi.string().email({ tlds: { allow: false } }).allow("").max(160),
  oficina: Joi.string().min(2).max(100).required(),
  observacoes: Joi.string().allow("").max(500),
  website: Joi.string().allow("").max(120),
  captchaToken: Joi.string().required().max(2048),
  captchaX: Joi.number().min(0).max(1000).required(),
  captchaMoves: Joi.number().integer().min(1).max(5000).required()
});

const updateInscriptionSchema = inscriptionSchema
  .fork(["website", "captchaToken", "captchaX", "captchaMoves"], (field) => field.optional())
  .unknown(false);

const loginSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).max(160).required(),
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
  imagemUrl: Joi.string().allow("").pattern(safeImageUrlPattern).max(400),
  initials: Joi.string().min(1).max(4).required(),
  ativo: Joi.boolean().truthy("true").falsy("false")
});

const galeriaSchema = Joi.object({
  titulo: Joi.string().min(2).max(120).required(),
  descricao: Joi.string().allow("").max(300),
  imagemUrl: Joi.string().pattern(safeImageUrlPattern).max(500).required(),
  alt: Joi.string().allow("").max(180),
  ordem: Joi.number().integer().min(0).max(9999),
  ativo: Joi.boolean().truthy("true").falsy("false")
});

const alunoSchema = Joi.object({
  nome: Joi.string().min(3).max(120).required(),
  idade: Joi.number().integer().min(10).max(99).allow("", null),
  telefone: Joi.string().allow("").pattern(phonePattern),
  responsavel: Joi.string().allow("").max(120),
  email: Joi.string().email({ tlds: { allow: false } }).allow("").max(160),
  oficinaId: Joi.string().allow("").pattern(uuidPattern),
  oficinaIds: Joi.array().items(Joi.string().pattern(uuidPattern)).min(1).max(20).required(),
  status: Joi.string().valid("ativo", "inativo").required(),
  observacoes: Joi.string().allow("").max(500)
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

module.exports = {
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
  chamadaSchema
};
