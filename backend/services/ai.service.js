const config = require("../config/env");
const Oficina = require("../models/oficina.model");
const { isValidCpf, normalizeCpf } = require("../utils/cpf");

const contactText = [
  "Contato do Centro da Juventude:",
  "\u2022 WhatsApp: (41) 3657-2117",
  "\u2022 Endere\u00e7o: Rua Deputado Max Rosemann, 100, Almirante Tamandar\u00e9, PR"
].join("\n");

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

async function fallbackChat({ messages, cpf }) {
  const normalized = normalizeMessages(messages);
  const last = lastUserMessage(normalized);
  const lower = last.toLowerCase();
  const messageCpf = cpf || extractCpf(last);

  if (messageCpf) {
    return {
      message: [
        "Para proteger os dados do aluno, a consulta por CPF agora deve ser feita pelo Portal do Aluno.",
        "",
        "Acesse o Portal do Aluno e informe CPF junto com a matrícula.",
        "Se não conseguir acessar, fale com a equipe pelo WhatsApp: (41) 3657-2117."
      ].join("\n"),
      aiEnabled: false,
      fallback: true
    };
  }

  if (lower.includes("falta") || lower.includes("frequ") || lower.includes("presen") || lower.includes("aula") || lower.includes("chamada") || /(status|acompanhar|cpf|inscri)/i.test(lower)) {
    return {
      message: [
        "Para consultar andamento, faltas e aulas recentes, use o Portal do Aluno com CPF e matrícula.",
        "",
        "Por seguran\u00e7a, eu mostro apenas:",
        "\u2022 oficinas vinculadas",
        "\u2022 situa\u00e7\u00e3o da inscri\u00e7\u00e3o",
        "\u2022 documentos pendentes",
        "\u2022 quantidade de faltas",
        "\u2022 aulas registradas recentemente"
      ].join("\n"),
      aiEnabled: false,
      fallback: true
    };
  }

  if (/(document|rg|comprovante|declara[cç][aã]o|cpf)/i.test(lower)) {
    return {
      message: [
        "Documentos necess\u00e1rios:",
        "",
        "Maiores de 18 anos:",
        "\u2022 RG",
        "\u2022 CPF",
        "\u2022 comprovante de resid\u00eancia",
        "",
        "Menores de idade:",
        "\u2022 documentos do aluno",
        "\u2022 documentos do respons\u00e1vel",
        "\u2022 declara\u00e7\u00e3o escolar",
        "\u2022 comprovante de resid\u00eancia"
      ].join("\n"),
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
    const listed = oficinas.slice(0, 8).map((workshop) => `\u2022 ${workshop.nome}: ${workshop.situacao}`).join("\n");
    const suffix = oficinas.length > 8 ? "\n\nUse a busca de oficinas no site para ver todas as atividades." : "";
    return {
      message: `Oficinas dispon\u00edveis:\n${listed}${suffix}`,
      aiEnabled: false,
      fallback: true,
      oficinas
    };
  }

  return {
    message: [
      "Posso ajudar com:",
      "\u2022 oficinas e vagas",
      "\u2022 documentos necess\u00e1rios",
      "\u2022 lista de espera",
      "\u2022 status por CPF",
      "\u2022 faltas e aulas recentes",
      "\u2022 contato da equipe",
      "",
      contactText
    ].join("\n"),
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
    docsPending ? "Documentos pendentes ou n\u00e3o conferidos." : "",
    faltas > 2 ? `Alerta de frequ\u00eancia: ${faltas} faltas nos \u00faltimos 30 dias.` : "",
    waitlist.length ? `Lista de espera: ${waitlist.join(", ")}.` : "",
    String(student.observacoes || "").trim() ? "H\u00e1 observa\u00e7\u00f5es registradas na ficha." : ""
  ].filter(Boolean);

  return {
    summary: `${student.nome || "Aluno"} est\u00e1 vinculado a ${officeText}. ${confirmed.length ? `Confirmadas: ${confirmed.join(", ")}. ` : ""}${waitlist.length ? `Em lista de espera: ${waitlist.join(", ")}. ` : ""}${docsPending ? "Documentos pendentes. " : "Sem pend\u00eancias de documentos marcadas. "}${faltas ? `Faltas nos \u00faltimos 30 dias: ${faltas}.` : "Sem faltas recentes registradas."}`,
    alerts,
    messages: {
      confirmacao: `Ol\u00e1, ${firstName}! Sua inscri\u00e7\u00e3o no Centro da Juventude foi registrada para ${officeText}. A confirma\u00e7\u00e3o final depende da confer\u00eancia da equipe e da disponibilidade de vagas.`,
      documentos: docsPending
        ? `Ol\u00e1, ${firstName}! Para concluir sua matr\u00edcula no Centro da Juventude, precisamos que voc\u00ea entregue ou regularize os documentos pendentes. Em caso de d\u00favida, responda esta mensagem.`
        : `Ol\u00e1, ${firstName}! No momento n\u00e3o h\u00e1 pend\u00eancias de documentos marcadas no seu cadastro do Centro da Juventude.`,
      faltas: faltas > 0
        ? `Ol\u00e1, ${firstName}! Identificamos ${faltas} falta(s) recente(s) nas atividades do Centro da Juventude. Procure a equipe para justificar ou regularizar a frequ\u00eancia.`
        : `Ol\u00e1, ${firstName}! N\u00e3o constam faltas recentes no seu acompanhamento do Centro da Juventude.`,
      listaEspera: waitlist.length
        ? `Ol\u00e1, ${firstName}! Voc\u00ea est\u00e1 em lista de espera para ${waitlist.join(", ")}. A equipe avisar\u00e1 quando houver vaga dispon\u00edvel.`
        : `Ol\u00e1, ${firstName}! No momento n\u00e3o h\u00e1 oficinas em lista de espera marcadas no seu cadastro.`
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
      "Voc\u00ea e o assistente virtual do Centro da Juventude Almirante Tamandar\u00e9.",
      "Responda sempre em portugu\u00eas do Brasil, com frases curtas e tom institucional.",
      "Use apenas dados retornados pelas ferramentas ou informa\u00e7\u00f5es presentes no prompt.",
      "N\u00e3o exponha dados administrativos nem dados sens\u00edveis. Para status por CPF, retorne somente oficinas, situa\u00e7\u00e3o, lista de espera, documentos pendentes e data.",
      "N\u00e3o tome decis\u00f5es finais. Oriente a pessoa a falar com a equipe quando houver d\u00favida."
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
          description: "Lista oficinas p\u00fablicas, hor\u00e1rios e situa\u00e7\u00e3o de vagas.",
          inputSchema: z.object({
            busca: z.string().optional().describe("Nome, categoria ou termo de busca opcional.")
          }),
          execute: async ({ busca }) => workshopSummaries(busca)
        }),
        orientarConsultaPortal: tool({
          description: "Orienta a pessoa a consultar dados pessoais somente pelo Portal do Aluno.",
          inputSchema: z.object({}),
          execute: async () => ({
            message: "Por segurança, dados de matrícula, frequência e chamados só podem ser consultados no Portal do Aluno com CPF e matrícula."
          })
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
      message: `${fallback.message}\n\nA IA configurada n\u00e3o respondeu agora; usei a orienta\u00e7\u00e3o segura do sistema.`,
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
          "Voc\u00ea est\u00e1 ajudando um administrador do Centro da Juventude.",
          "Com base nos dados abaixo, gere um resumo operacional curto, alertas e mensagens prontas para WhatsApp.",
          "N\u00e3o invente informa\u00e7\u00f5es. N\u00e3o diga que enviou mensagem. Retorne somente JSON v\u00e1lido no formato:",
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

function adminMessageAssist({ tipo, oficina = "", data = "", horario = "", observacoes = "" }) {
  const officeText = oficina ? ` da turma ${oficina}` : "";
  const dateText = data ? ` em ${data}` : "";
  const timeText = horario ? `, no horário ${horario}` : "";
  const noteText = observacoes ? `\n\nObservação: ${observacoes}` : "";
  const templates = {
    cancelamento: {
      titulo: `Cancelamento de aula${officeText}`,
      mensagem: `Informamos que a aula${officeText}${dateText}${timeText} foi cancelada. A equipe do Centro da Juventude avisará sobre reposição ou nova orientação assim que possível.${noteText}`
    },
    inicio_turma: {
      titulo: `Início de turma${officeText}`,
      mensagem: `A turma${officeText} terá início${dateText}${timeText}. Pedimos que os alunos cheguem com antecedência e acompanhem os próximos avisos pela plataforma do CJ.${noteText}`
    },
    encerramento_turma: {
      titulo: `Encerramento de turma${officeText}`,
      mensagem: `Comunicamos o encerramento da turma${officeText}${dateText}. Agradecemos a participação dos alunos e orientamos que acompanhem novos ciclos e oportunidades nos canais oficiais do CJ.${noteText}`
    },
    alteracao_horario: {
      titulo: `Alteração de horário${officeText}`,
      mensagem: `Atenção: houve alteração no horário da turma${officeText}. Novo horário: ${horario || "a confirmar pela equipe"}.${data ? ` A alteração vale a partir de ${data}.` : ""}${noteText}`
    },
    comunicado_geral: {
      titulo: "Comunicado geral do CJ",
      mensagem: `O Centro da Juventude informa um comunicado importante para alunos e responsáveis. Pedimos que todos acompanhem as orientações e procurem a equipe em caso de dúvida.${noteText}`
    },
    evento: {
      titulo: `Aviso de evento${dateText}`,
      mensagem: `O Centro da Juventude realizará um evento${dateText}${timeText}. A participação dos alunos será orientada pela equipe e novas informações serão divulgadas nos canais oficiais.${noteText}`
    }
  };
  return {
    aiEnabled: false,
    fallback: true,
    ...templates[tipo]
  };
}

module.exports = {
  chat,
  adminStudentAssist,
  adminMessageAssist,
  fallbackChat,
  baseAdminAssist
};
