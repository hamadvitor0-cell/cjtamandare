const config = require("../config/env");
const Oficina = require("../models/oficina.model");
const InscricaoService = require("./inscricao.service");
const { isValidCpf, normalizeCpf } = require("../utils/cpf");

const contactText = "WhatsApp: (41) 3657-2117. Endereco: Rua Deputado Max Rosemann, 100, Almirante Tamandare, PR.";

function lastUserMessage(messages = []) {
  return [...messages].reverse().find((message) => message.role === "user")?.content || "";
}

function normalizeMessages(messages = []) {
  return messages
    .filter((message) => ["user", "assistant"].includes(message.role) && String(message.content || "").trim())
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: String(message.content).slice(0, 1400)
    }));
}

function extractCpf(value) {
  const candidates = String(value || "").match(/\d[\d.\-\s]{9,}\d/g) || [];
  return candidates
    .map(normalizeCpf)
    .find((cpf) => isValidCpf(cpf)) || "";
}

function vacancyLabel(workshop) {
  if (workshop.situacaoVagas === "lista_espera") return "lista de espera";
  if (workshop.situacaoVagas === "poucas_vagas") return `poucas vagas (${workshop.vagasDisponiveis})`;
  return `vagas abertas (${workshop.vagasDisponiveis ?? workshop.capacidade ?? "a confirmar"})`;
}

async function workshopSummaries(filter = "") {
  const query = String(filter || "").trim().toLowerCase();
  const oficinas = await Oficina.findAll();
  return oficinas
    .filter((workshop) => !query
      || workshop.nome.toLowerCase().includes(query)
      || workshop.categoria.toLowerCase().includes(query))
    .map((workshop) => ({
      nome: workshop.nome,
      categoria: workshop.categoria,
      faixaEtaria: workshop.faixaEtaria,
      diasSemana: workshop.diasSemana,
      periodo: workshop.periodo,
      horario: workshop.horario,
      capacidade: workshop.capacidade,
      vagasDisponiveis: workshop.vagasDisponiveis,
      situacao: vacancyLabel(workshop)
    }));
}

function statusToText(status) {
  if (!status?.encontrado) {
    return "Nao encontrei inscricao para este CPF. Confira os numeros digitados ou fale com a equipe pelo WhatsApp: (41) 3657-2117.";
  }

  const oficinas = (status.oficinas || [])
    .map((item) => `${item.oficina}: ${item.situacao}`)
    .join("; ");
  return [
    `Encontrei o cadastro de ${status.nomeParcial || "uma pessoa"} (${status.cpf}).`,
    `Situacao geral: ${status.situacao}.`,
    oficinas ? `Oficinas: ${oficinas}.` : "",
    status.documentosPendentes ? "Ha documentos pendentes ou ainda nao conferidos." : "Nao ha pendencias de documentos marcadas.",
    "Para ajustes, fale com a equipe pelo WhatsApp: (41) 3657-2117."
  ].filter(Boolean).join(" ");
}

async function fallbackChat({ messages, cpf }) {
  const normalized = normalizeMessages(messages);
  const last = lastUserMessage(normalized);
  const lower = last.toLowerCase();
  const messageCpf = cpf || extractCpf(last);

  if (messageCpf) {
    const status = await InscricaoService.publicStatusByCpf(messageCpf);
    return {
      message: statusToText(status),
      aiEnabled: false,
      fallback: true,
      status
    };
  }

  if (/(status|acompanhar|cpf|inscri[cç][aã]o|matr[ií]cula)/i.test(lower)) {
    return {
      message: "Para consultar o andamento da inscricao, informe o CPF no campo de acompanhamento ou envie o CPF aqui no chat. Eu retorno apenas oficinas, situacao, lista de espera e pendencias de documentos.",
      aiEnabled: false,
      fallback: true
    };
  }

  if (/(document|rg|comprovante|declara[cç][aã]o|cpf)/i.test(lower)) {
    return {
      message: "Documentos: maiores de 18 anos precisam de RG, CPF e comprovante de residencia. Menores precisam dos documentos do aluno e responsavel, declaracao escolar e comprovante de residencia.",
      aiEnabled: false,
      fallback: true
    };
  }

  if (/(contato|whats|telefone|endere[cç]o|instagram)/i.test(lower)) {
    return {
      message: contactText,
      aiEnabled: false,
      fallback: true
    };
  }

  if (/(oficina|atividade|vaga|hor[aá]rio|turma|curso)/i.test(lower)) {
    const oficinas = await workshopSummaries();
    const listed = oficinas.slice(0, 8).map((workshop) => `${workshop.nome} (${workshop.situacao})`).join("; ");
    const suffix = oficinas.length > 8 ? " Use a busca de oficinas para ver todas." : "";
    return {
      message: `Oficinas disponiveis: ${listed}.${suffix}`,
      aiEnabled: false,
      fallback: true,
      oficinas
    };
  }

  return {
    message: `Posso ajudar com oficinas, documentos, inscricao, lista de espera, status por CPF e contato. ${contactText}`,
    aiEnabled: false,
    fallback: true
  };
}

function baseAdminAssist(student = {}) {
  const details = Array.isArray(student.oficinaDetalhes) ? student.oficinaDetalhes : [];
  const oficinas = Array.isArray(student.oficinas) && student.oficinas.length
    ? student.oficinas
    : details.map((detail) => detail.oficina).filter(Boolean);
  const waitlist = Array.from(new Set([
    ...(Array.isArray(student.listaEspera) ? student.listaEspera : []),
    ...details.filter((detail) => detail.status === "lista_espera").map((detail) => detail.oficina)
  ].filter(Boolean)));
  const confirmed = Array.from(new Set([
    ...(Array.isArray(student.confirmadas) ? student.confirmadas : []),
    ...oficinas.filter((oficina) => !waitlist.includes(oficina))
  ].filter(Boolean)));
  const faltas = Number(student.faltasUltimos30Dias || 0);
  const docsPending = Boolean(student.documentosPendentes || Number(student.documentosCount || 0) === 0);
  const firstName = String(student.nome || "aluno").trim().split(/\s+/)[0] || "aluno";
  const officeText = oficinas.length ? oficinas.join(", ") : "oficinas vinculadas";
  const alerts = [
    docsPending ? "Documentos pendentes ou nao conferidos." : "",
    faltas > 2 ? `Alerta de frequencia: ${faltas} faltas nos ultimos 30 dias.` : "",
    waitlist.length ? `Lista de espera: ${waitlist.join(", ")}.` : "",
    String(student.observacoes || "").trim() ? "Ha observacoes registradas na ficha." : ""
  ].filter(Boolean);

  return {
    summary: `${student.nome || "Aluno"} esta vinculado a ${officeText}. ${confirmed.length ? `Confirmadas: ${confirmed.join(", ")}. ` : ""}${waitlist.length ? `Em lista de espera: ${waitlist.join(", ")}. ` : ""}${docsPending ? "Documentos pendentes. " : "Sem pendencias de documentos marcadas. "}${faltas ? `Faltas nos ultimos 30 dias: ${faltas}.` : "Sem faltas recentes registradas."}`,
    alerts,
    messages: {
      confirmacao: `Ola, ${firstName}! Sua inscricao no Centro da Juventude foi registrada para ${officeText}. A confirmacao final depende da conferencia da equipe e da disponibilidade de vagas.`,
      documentos: docsPending
        ? `Ola, ${firstName}! Para concluir sua matricula no Centro da Juventude, precisamos que voce entregue ou regularize os documentos pendentes. Em caso de duvida, responda esta mensagem.`
        : `Ola, ${firstName}! No momento nao ha pendencias de documentos marcadas no seu cadastro do Centro da Juventude.`,
      faltas: faltas > 0
        ? `Ola, ${firstName}! Identificamos ${faltas} falta(s) recente(s) nas atividades do Centro da Juventude. Procure a equipe para justificar ou regularizar a frequencia.`
        : `Ola, ${firstName}! Nao constam faltas recentes no seu acompanhamento do Centro da Juventude.`,
      listaEspera: waitlist.length
        ? `Ola, ${firstName}! Voce esta em lista de espera para ${waitlist.join(", ")}. A equipe avisara quando houver vaga disponivel.`
        : `Ola, ${firstName}! No momento nao ha oficinas em lista de espera marcadas no seu cadastro.`
    }
  };
}

function extractJson(text) {
  const clean = String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (error) {
    return null;
  }
}

function aiTimeout() {
  const value = Number(config.aiRequestTimeoutMs || 6500);
  return Number.isFinite(value) && value > 1000 ? value : 6500;
}

function withAiTimeout(work) {
  const timeoutMs = aiTimeout();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("AI request timeout")), timeoutMs);
  });

  return Promise.race([
    Promise.resolve().then(work),
    timeout
  ]).finally(() => clearTimeout(timer));
}

async function createAgent(tools = {}) {
  const { ToolLoopAgent, stepCountIs } = await import("ai");
  return new ToolLoopAgent({
    model: config.aiModel,
    stopWhen: stepCountIs(5),
    tools,
    instructions: [
      "Voce e o assistente virtual do Centro da Juventude Almirante Tamandare.",
      "Responda sempre em portugues do Brasil, com frases curtas e tom institucional.",
      "Use apenas dados retornados pelas ferramentas ou informacoes presentes no prompt.",
      "Nao exponha dados administrativos nem dados sensiveis. Para status por CPF, retorne somente oficinas, situacao, lista de espera, documentos pendentes e data.",
      "Nao tome decisoes finais. Oriente a pessoa a falar com a equipe quando houver duvida."
    ].join("\n")
  });
}

async function chat({ messages, cpf }) {
  if (!config.aiFeaturesEnabled) {
    return fallbackChat({ messages, cpf });
  }

  try {
    const result = await withAiTimeout(async () => {
      const { tool } = await import("ai");
      const { z } = await import("zod");
      const agent = await createAgent({
        listarOficinas: tool({
          description: "Lista oficinas publicas, horarios e situacao de vagas.",
          inputSchema: z.object({
            busca: z.string().optional().describe("Nome, categoria ou termo de busca opcional.")
          }),
          execute: async ({ busca }) => workshopSummaries(busca)
        }),
        consultarStatusCpf: tool({
          description: "Consulta status publico e minimo de uma inscricao por CPF.",
          inputSchema: z.object({
            cpf: z.string().describe("CPF com ou sem mascara.")
          }),
          execute: async ({ cpf: inputCpf }) => InscricaoService.publicStatusByCpf(inputCpf)
        })
      });
      return agent.generate({
        messages: normalizeMessages(messages),
        timeout: aiTimeout(),
        maxOutputTokens: 700
      });
    });

    return {
      message: result.text,
      aiEnabled: true,
      fallback: false,
      model: config.aiModel
    };
  } catch (error) {
    const fallback = await fallbackChat({ messages, cpf });
    return {
      ...fallback,
      message: `${fallback.message}\n\nA IA configurada nao respondeu agora; usei a orientacao segura do sistema.`,
      aiEnabled: false,
      fallback: true
    };
  }
}

async function adminStudentAssist({ student }) {
  const base = baseAdminAssist(student);

  if (!config.aiFeaturesEnabled) {
    return {
      ...base,
      aiEnabled: false,
      fallback: true
    };
  }

  try {
    const result = await withAiTimeout(async () => {
      const agent = await createAgent();
      return agent.generate({
        prompt: [
          "Voce esta ajudando um administrador do Centro da Juventude.",
          "Com base nos dados abaixo, gere um resumo operacional curto, alertas e mensagens prontas para WhatsApp.",
          "Nao invente informacoes. Nao diga que enviou mensagem. Retorne somente JSON valido no formato:",
          '{"summary":"texto","alerts":["texto"],"messages":{"confirmacao":"texto","documentos":"texto","faltas":"texto","listaEspera":"texto"}}',
          `Dados: ${JSON.stringify({ student, base }).slice(0, 9000)}`
        ].join("\n"),
        timeout: aiTimeout(),
        maxOutputTokens: 900
      });
    });
    const parsed = extractJson(result.text);

    return {
      ...base,
      ...parsed,
      messages: {
        ...base.messages,
        ...(parsed?.messages || {})
      },
      alerts: Array.isArray(parsed?.alerts) ? parsed.alerts : base.alerts,
      aiEnabled: true,
      fallback: !parsed
    };
  } catch (error) {
    return {
      ...base,
      aiEnabled: false,
      fallback: true
    };
  }
}

module.exports = {
  chat,
  adminStudentAssist,
  fallbackChat,
  baseAdminAssist
};
