const crypto = require("crypto");
const path = require("path");
const db = require("../database/pool");
const config = require("../config/env");
const Aluno = require("./aluno.model");
const Oficina = require("./oficina.model");
const Calendario = require("./calendario.model");
const FirstAccess = require("./first-access.model");
const { normalizeCpf } = require("../utils/cpf");

const memoryPosts = [];
const memoryTickets = [];
const memoryFeedbacks = [];
let schemaPromise = null;

const ticketCategories = new Set([
  "duvida",
  "erro_matricula",
  "alteracao_documentos",
  "problemas_cj",
  "problemas_site"
]);

function nowIso() {
  return new Date().toISOString();
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeDate(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function maskCpf(cpf = "") {
  const normalized = normalizeCpf(cpf);
  if (normalized.length !== 11) return "";
  return `***.***.***-${normalized.slice(-2)}`;
}

function normalizeMatricula(value) {
  return String(value || "").trim().toUpperCase();
}

function invalidPortalCredentials() {
  const error = new Error("CPF ou matrícula inválidos.");
  error.status = 401;
  return error;
}

function invalidStudentSession() {
  const error = new Error("Sessão do aluno expirada ou inválida.");
  error.status = 401;
  return error;
}

function ensureMatriculaMatches(student, matricula) {
  const registered = normalizeMatricula(student?.matricula);
  if (!registered || registered !== normalizeMatricula(matricula)) throw invalidPortalCredentials();
}

function ticketCode() {
  const date = new Date();
  const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `CJ-${stamp}-${random}`;
}

async function ensureSchema() {
  if (!db.hasDatabase || !config.runtimeDatabaseSetup) return;
  if (!schemaPromise) {
    schemaPromise = db.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS suporte_posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        target_type TEXT NOT NULL CHECK (target_type IN ('geral', 'oficina', 'aluno')),
        oficina_id UUID REFERENCES oficinas(id) ON DELETE CASCADE,
        aluno_id UUID REFERENCES alunos(id) ON DELETE CASCADE,
        tipo TEXT NOT NULL CHECK (tipo IN ('aviso', 'cancelamento', 'horario', 'professor', 'evento', 'institucional', 'notificacao')),
        prioridade TEXT NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('normal', 'importante', 'urgente')),
        titulo TEXT NOT NULL CHECK (char_length(titulo) BETWEEN 2 AND 140),
        mensagem TEXT NOT NULL CHECK (char_length(mensagem) BETWEEN 5 AND 1200),
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE suporte_posts ADD COLUMN IF NOT EXISTS prioridade TEXT NOT NULL DEFAULT 'normal';
      ALTER TABLE suporte_posts DROP CONSTRAINT IF EXISTS suporte_posts_prioridade_check;
      ALTER TABLE suporte_posts ADD CONSTRAINT suporte_posts_prioridade_check CHECK (prioridade IN ('normal', 'importante', 'urgente'));

      CREATE INDEX IF NOT EXISTS idx_suporte_posts_target ON suporte_posts (target_type, oficina_id, aluno_id, ativo, created_at DESC);

      CREATE TABLE IF NOT EXISTS suporte_tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        codigo TEXT NOT NULL UNIQUE,
        aluno_id UUID REFERENCES alunos(id) ON DELETE SET NULL,
        cpf TEXT NOT NULL CHECK (char_length(cpf) = 11),
        nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 120),
        categoria TEXT NOT NULL CHECK (categoria IN ('duvida', 'erro_matricula', 'alteracao_documentos', 'problemas_cj', 'problemas_site')),
        descricao TEXT NOT NULL CHECK (char_length(descricao) BETWEEN 10 AND 2000),
        status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_atendimento', 'respondido', 'encerrado')),
        resposta TEXT CHECK (resposta IS NULL OR char_length(resposta) <= 2000),
        respondido_por TEXT CHECK (respondido_por IS NULL OR char_length(respondido_por) <= 120),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_suporte_tickets_cpf ON suporte_tickets (cpf, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_suporte_tickets_expires ON suporte_tickets (expires_at);

      CREATE TABLE IF NOT EXISTS suporte_ticket_anexos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id UUID NOT NULL REFERENCES suporte_tickets(id) ON DELETE CASCADE,
        original_name TEXT NOT NULL CHECK (char_length(original_name) BETWEEN 1 AND 240),
        mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
        file_content BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_suporte_ticket_anexos_ticket ON suporte_ticket_anexos (ticket_id, created_at);

      CREATE TABLE IF NOT EXISTS oficina_feedbacks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        aluno_id UUID REFERENCES alunos(id) ON DELETE SET NULL,
        oficina_id UUID REFERENCES oficinas(id) ON DELETE SET NULL,
        cpf TEXT NOT NULL CHECK (char_length(cpf) = 11),
        aluno_nome TEXT NOT NULL CHECK (char_length(aluno_nome) BETWEEN 2 AND 120),
        oficina_nome TEXT NOT NULL CHECK (char_length(oficina_nome) BETWEEN 2 AND 120),
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comentario TEXT NOT NULL CHECK (char_length(comentario) BETWEEN 5 AND 1200),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_oficina_feedbacks_oficina ON oficina_feedbacks (oficina_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_oficina_feedbacks_rating ON oficina_feedbacks (rating, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_oficina_feedbacks_aluno ON oficina_feedbacks (aluno_id, created_at DESC);

      UPDATE suporte_tickets t
      SET aluno_id = a.id
      FROM alunos a
      WHERE t.aluno_id IS NULL AND t.cpf = a.cpf;

      UPDATE oficina_feedbacks f
      SET aluno_id = a.id
      FROM alunos a
      WHERE f.aluno_id IS NULL AND f.cpf = a.cpf;

      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_suporte_posts_updated_at ON suporte_posts;
      CREATE TRIGGER trg_suporte_posts_updated_at
      BEFORE UPDATE ON suporte_posts
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_suporte_tickets_updated_at ON suporte_tickets;
      CREATE TRIGGER trg_suporte_tickets_updated_at
      BEFORE UPDATE ON suporte_tickets
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

async function cleanupExpiredTickets() {
  await ensureSchema();
  if (!db.hasDatabase) {
    const now = Date.now();
    for (let index = memoryTickets.length - 1; index >= 0; index -= 1) {
      if (new Date(memoryTickets[index].expires_at).getTime() <= now) {
        memoryTickets.splice(index, 1);
      }
    }
    return;
  }
  await db.query("DELETE FROM suporte_tickets WHERE expires_at <= NOW()");
}

async function findStudentByCpf(cpf) {
  const normalized = normalizeCpf(cpf);
  if (!normalized) return null;
  const alunos = await Aluno.findAll({ search: normalized });
  return alunos.find((aluno) => normalizeCpf(aluno.cpf) === normalized && aluno.status !== "inativo") || null;
}

async function findStudentForSession(session) {
  if (!session?.sub) throw invalidStudentSession();
  const student = await Aluno.findById(session.sub);
  if (!student || student.status === "inativo") throw invalidStudentSession();
  return student;
}

function nextClassDates(workshops = [], events = []) {
  const dayMap = {
    domingo: 0,
    segunda: 1,
    terca: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sabado: 6
  };
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const generated = [];
  workshops.forEach((workshop) => {
    (workshop.diasSemana || []).forEach((day) => {
      const target = dayMap[day];
      if (target === undefined) return;
      for (let offset = 0; offset <= 21; offset += 1) {
        const date = new Date(today);
        date.setDate(today.getDate() + offset);
        if (date.getDay() === target) {
          generated.push({
            oficina: workshop.nome,
            data: date.toISOString().slice(0, 10),
            horario: workshop.horario || "Horário a definir",
            origem: "turma"
          });
          break;
        }
      }
    });
  });
  const eventClasses = events
    .filter((event) => event.oficinaId)
    .map((event) => ({
      oficina: event.oficina,
      data: event.data,
      horario: [event.horarioInicio, event.horarioFim].filter(Boolean).join(" - ") || "Horário a definir",
      origem: event.titulo || "Agenda"
    }));
  return [...eventClasses, ...generated]
    .sort((a, b) => `${a.data}${a.horario}`.localeCompare(`${b.data}${b.horario}`))
    .slice(0, 8);
}

function postToPublic(row, oficinas = [], alunos = []) {
  const oficinaId = row.oficina_id || row.oficinaId || "";
  const alunoId = row.aluno_id || row.alunoId || "";
  return {
    id: row.id,
    targetType: row.target_type || row.targetType,
    oficinaId,
    oficina: row.oficina || oficinas.find((item) => item.id === oficinaId)?.nome || "",
    alunoId,
    aluno: row.aluno || alunos.find((item) => item.id === alunoId)?.nome || "",
    tipo: row.tipo,
    prioridade: row.prioridade || "normal",
    titulo: row.titulo,
    mensagem: row.mensagem,
    ativo: row.ativo !== false,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function safeAttachmentName(name = "anexo") {
  const base = path.basename(String(name || "anexo")).replace(/[^\w.\-() ]+/g, "_").trim();
  return base.slice(0, 240) || "anexo";
}

function attachmentRecordFromFile(file, ticketId) {
  return {
    id: crypto.randomUUID(),
    ticket_id: ticketId,
    original_name: safeAttachmentName(file.originalname),
    mime_type: file.mimetype,
    size_bytes: file.size || file.buffer?.length || 0,
    file_content: file.buffer,
    created_at: nowIso()
  };
}

function attachmentToPublic(row, options = {}) {
  const ticketId = row.ticket_id || row.ticketId || "";
  const id = row.id || "";
  const prefix = options.admin ? "/admin/suporte" : "/suporte";
  return {
    id,
    ticketId,
    originalName: row.original_name || row.originalName || "anexo",
    mimeType: row.mime_type || row.mimeType || "",
    sizeBytes: Number(row.size_bytes || row.sizeBytes || 0),
    created_at: row.created_at,
    downloadPath: ticketId && id ? `${prefix}/tickets/${ticketId}/anexos/${id}` : ""
  };
}

async function rowsWithAttachments(rows) {
  if (!rows.length || !db.hasDatabase) return rows;
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (!ids.length) return rows;
  const result = await db.query(
    `SELECT id, ticket_id, original_name, mime_type, size_bytes, created_at
     FROM suporte_ticket_anexos
     WHERE ticket_id = ANY($1::uuid[])
     ORDER BY created_at ASC`,
    [ids]
  );
  const grouped = new Map();
  result.rows.forEach((attachment) => {
    const ticketId = attachment.ticket_id;
    if (!grouped.has(ticketId)) grouped.set(ticketId, []);
    grouped.get(ticketId).push(attachment);
  });
  return rows.map((row) => ({
    ...row,
    anexos: grouped.get(row.id) || []
  }));
}

function ticketToPublic(row) {
  return {
    id: row.id,
    codigo: row.codigo,
    alunoId: row.aluno_id || row.alunoId || "",
    cpf: row.cpf,
    nome: row.nome,
    categoria: row.categoria,
    descricao: row.descricao,
    status: row.status,
    resposta: row.resposta || "",
    respondidoPor: row.respondido_por || row.respondidoPor || "",
    expiresAt: row.expires_at || row.expiresAt,
    created_at: row.created_at,
    updated_at: row.updated_at,
    anexos: (row.anexos || row.attachments || []).map((attachment) => attachmentToPublic(attachment, { admin: true }))
  };
}

function ticketToStudent(row) {
  return {
    id: row.id,
    codigo: row.codigo,
    categoria: row.categoria,
    descricao: row.descricao,
    status: row.status,
    resposta: row.resposta || "",
    respondidoPor: row.respondido_por || row.respondidoPor || "",
    expiresAt: row.expires_at || row.expiresAt,
    created_at: row.created_at,
    updated_at: row.updated_at,
    anexos: (row.anexos || row.attachments || []).map((attachment) => attachmentToPublic(attachment))
  };
}

function feedbackToPublic(row) {
  return {
    id: row.id,
    alunoId: row.aluno_id || row.alunoId || "",
    aluno: row.aluno_nome || row.aluno || "Aluno",
    cpf: maskCpf(row.cpf || ""),
    oficinaId: row.oficina_id || row.oficinaId || "",
    oficina: row.oficina_nome || row.oficina || "Oficina",
    rating: Number(row.rating || 0),
    comentario: row.comentario || "",
    created_at: row.created_at
  };
}

function feedbackToStudent(row) {
  const feedback = feedbackToPublic(row);
  return {
    id: feedback.id,
    oficinaId: feedback.oficinaId,
    oficina: feedback.oficina,
    rating: feedback.rating,
    comentario: feedback.comentario,
    created_at: feedback.created_at
  };
}

function studentToPortalPublic(student) {
  return {
    id: student.id,
    matricula: student.matricula || "",
    nome: student.nome,
    cpf: maskCpf(student.cpf),
    idade: student.idade,
    bairro: student.bairro || "",
    status: student.status || "ativo",
    documentosPendentes: Boolean(student.documentosPendentes)
  };
}

async function visiblePostsForStudent(student) {
  await ensureSchema();
  const oficinaIds = new Set(student.oficinaIds || []);
  if (!db.hasDatabase) {
    const oficinas = await Oficina.findAll({ includeInactive: true });
    return memoryPosts
      .filter((post) => post.ativo !== false)
      .filter((post) => post.target_type === "geral" || post.aluno_id === student.id || oficinaIds.has(post.oficina_id))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((post) => postToPublic(post, oficinas, [student]));
  }
  const result = await db.query(
    `SELECT p.*, o.nome AS oficina, a.nome AS aluno
     FROM suporte_posts p
     LEFT JOIN oficinas o ON o.id = p.oficina_id
     LEFT JOIN alunos a ON a.id = p.aluno_id
     WHERE p.ativo = true
       AND (
         p.target_type = 'geral'
         OR p.aluno_id = $1
         OR p.oficina_id = ANY($2::uuid[])
       )
     ORDER BY p.created_at DESC
     LIMIT 80`,
    [student.id, Array.from(oficinaIds)]
  );
  return result.rows.map((post) => postToPublic(post));
}

async function ticketsForStudent(student) {
  await cleanupExpiredTickets();
  if (!db.hasDatabase) {
    return memoryTickets
      .filter((ticket) => ticket.aluno_id === student.id)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map(ticketToStudent);
  }
  const result = await db.query(
    `SELECT * FROM suporte_tickets
     WHERE aluno_id = $1
     ORDER BY created_at DESC
     LIMIT 80`,
    [student.id]
  );
  const rows = await rowsWithAttachments(result.rows);
  return rows.map(ticketToStudent);
}

async function feedbacksForStudent(student) {
  await ensureSchema();
  if (!db.hasDatabase) {
    return memoryFeedbacks
      .filter((feedback) => feedback.aluno_id === student.id)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 20)
      .map(feedbackToStudent);
  }
  const result = await db.query(
    `SELECT *
     FROM oficina_feedbacks
     WHERE aluno_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [student.id]
  );
  return result.rows.map(feedbackToStudent);
}

async function portalForStudent(student) {
  if (!student) {
    const error = new Error("CPF não encontrado entre alunos cadastrados.");
    error.status = 404;
    throw error;
  }
  const oficinas = await Oficina.findAll({ includeInactive: true });
  const studentOfficeIds = new Set(student.oficinaIds || []);
  const studentWorkshops = oficinas.filter((oficina) => studentOfficeIds.has(oficina.id));
  const month = new Date().toISOString().slice(0, 7);
  const calendar = await Calendario.monthView(month).catch(() => ({ eventos: [] }));
  const posts = await visiblePostsForStudent(student);
  const tickets = await ticketsForStudent(student);
  const feedbacks = await feedbacksForStudent(student);
  const recentCalls = student.ultimasChamadas || [];
  const totalCalls = recentCalls.length;
  const absences = Number(student.faltasUltimos30Dias || recentCalls.filter((call) => call.status === "ausente").length);
  const present = recentCalls.filter((call) => call.status === "presente").length;

  return {
    aluno: studentToPortalPublic(student),
    frequencia: {
      chamadasRecentes: totalCalls,
      presencasRecentes: present,
      faltasUltimos30Dias: absences,
      historico: recentCalls
    },
    turmas: studentWorkshops.map((oficina) => ({
      id: oficina.id,
      nome: oficina.nome,
      diasSemana: oficina.diasSemana || [],
      periodo: oficina.periodo,
      horario: oficina.horario,
      categoria: oficina.categoria
    })),
    proximasAulas: nextClassDates(studentWorkshops, calendar.eventos || []),
    murais: posts.filter((post) => post.tipo !== "notificacao"),
    notificacoes: posts.filter((post) => post.tipo === "notificacao"),
    tickets,
    feedbacks,
    ticketPolicy: {
      validadeDias: 30,
      aviso: "Tickets são excluídos automaticamente após 30 dias. O histórico não fica disponível depois desse prazo."
    }
  };
}

async function portalByCredentials(payload) {
  const student = await findStudentByCpf(payload.cpf);
  if (!student) throw invalidPortalCredentials();
  ensureMatriculaMatches(student, payload.matricula);
  await FirstAccess.registerPortalAccess(student.id);
  return {
    student: {
      id: student.id,
      tokenVersion: Number(student.tokenVersion || 0)
    },
    portal: await portalForStudent(student)
  };
}

async function portalBySession(session) {
  const student = await findStudentForSession(session);
  return portalForStudent(student);
}

async function ticketsForStudentSession(session) {
  const student = await findStudentForSession(session);
  return ticketsForStudent(student);
}

async function createTicketForStudent(session, payload, files = []) {
  const student = await findStudentForSession(session);
  const categoria = String(payload.categoria || "");
  if (!ticketCategories.has(categoria)) {
    const error = new Error("Categoria de ticket inválida.");
    error.status = 400;
    throw error;
  }
  await cleanupExpiredTickets();
  const now = new Date();
  const record = {
    id: crypto.randomUUID(),
    codigo: ticketCode(),
    aluno_id: student.id,
    cpf: normalizeCpf(student.cpf),
    nome: student.nome,
    categoria,
    descricao: payload.descricao,
    status: "aberto",
    resposta: "",
    respondido_por: "",
    expires_at: addDays(now, 30).toISOString(),
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };
  if (!db.hasDatabase) {
    record.anexos = files.map((file) => attachmentRecordFromFile(file, record.id));
    memoryTickets.push(record);
    return ticketToStudent(record);
  }
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO suporte_tickets (codigo, aluno_id, cpf, nome, categoria, descricao, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [record.codigo, record.aluno_id, record.cpf, record.nome, record.categoria, record.descricao, record.expires_at]
    );
    const ticket = result.rows[0];
    const anexos = [];
    for (const file of files) {
      const attachment = attachmentRecordFromFile(file, ticket.id);
      const insert = await client.query(
        `INSERT INTO suporte_ticket_anexos (id, ticket_id, original_name, mime_type, size_bytes, file_content, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, ticket_id, original_name, mime_type, size_bytes, created_at`,
        [
          attachment.id,
          attachment.ticket_id,
          attachment.original_name,
          attachment.mime_type,
          attachment.size_bytes,
          attachment.file_content,
          attachment.created_at
        ]
      );
      anexos.push(insert.rows[0]);
    }
    await client.query("COMMIT");
    return ticketToStudent({ ...ticket, anexos });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function createFeedbackForStudent(session, payload) {
  const student = await findStudentForSession(session);

  const oficinaId = String(payload.oficinaId || "");
  const oficinaIds = new Set(student.oficinaIds || []);
  if (!oficinaIds.has(oficinaId)) {
    const error = new Error("Selecione uma oficina em que o aluno está matriculado.");
    error.status = 403;
    throw error;
  }

  const oficinas = await Oficina.findAll({ includeInactive: true });
  const oficina = oficinas.find((item) => item.id === oficinaId);
  if (!oficina) {
    const error = new Error("Oficina não encontrada.");
    error.status = 404;
    throw error;
  }

  await ensureSchema();
  const record = {
    id: crypto.randomUUID(),
    aluno_id: student.id,
    oficina_id: oficina.id,
    cpf: normalizeCpf(student.cpf),
    aluno_nome: student.nome,
    oficina_nome: oficina.nome,
    rating: Number(payload.rating),
    comentario: payload.comentario,
    created_at: nowIso()
  };

  if (!db.hasDatabase) {
    memoryFeedbacks.push(record);
    return feedbackToStudent(record);
  }

  const result = await db.query(
    `INSERT INTO oficina_feedbacks (aluno_id, oficina_id, cpf, aluno_nome, oficina_nome, rating, comentario)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [record.aluno_id, record.oficina_id, record.cpf, record.aluno_nome, record.oficina_nome, record.rating, record.comentario]
  );
  return feedbackToStudent(result.rows[0]);
}

async function cancelEnrollmentForStudent(session, payload) {
  const student = await findStudentForSession(session);
  const oficinaId = String(payload.oficinaId || "");
  if (!(student.oficinaIds || []).includes(oficinaId)) {
    const error = new Error("Oficina não encontrada entre suas inscrições ativas.");
    error.status = 404;
    throw error;
  }
  const oficinas = await Oficina.findAll({ includeInactive: true });
  const oficina = oficinas.find((item) => item.id === oficinaId);
  if (!oficina) {
    const error = new Error("Oficina não encontrada entre suas inscrições ativas.");
    error.status = 404;
    throw error;
  }
  const updated = await Aluno.cancelOfficeEnrollment(student.id, oficinaId);
  if (!updated) {
    const error = new Error("Oficina não encontrada entre suas inscrições ativas.");
    error.status = 404;
    throw error;
  }
  return {
    oficina: {
      id: oficina.id,
      nome: oficina.nome
    }
  };
}

async function listFeedbacks(filters = {}) {
  await ensureSchema();
  const oficinaId = String(filters.oficinaId || "");
  const rating = Number(filters.rating || 0);

  if (!db.hasDatabase) {
    return memoryFeedbacks
      .filter((feedback) => !oficinaId || feedback.oficina_id === oficinaId)
      .filter((feedback) => !rating || Number(feedback.rating) === rating)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 300)
      .map(feedbackToPublic);
  }

  const params = [];
  const where = [];
  if (oficinaId) {
    params.push(oficinaId);
    where.push(`oficina_id = $${params.length}`);
  }
  if (rating) {
    params.push(rating);
    where.push(`rating = $${params.length}`);
  }

  const result = await db.query(
    `SELECT *
     FROM oficina_feedbacks
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC
     LIMIT 300`,
    params
  );
  return result.rows.map(feedbackToPublic);
}

async function listAdmin() {
  await cleanupExpiredTickets();
  await ensureSchema();
  if (!db.hasDatabase) {
    const [oficinas, alunos] = await Promise.all([
      Oficina.findAll({ includeInactive: true }),
      Aluno.findAll({})
    ]);
    return {
      tickets: memoryTickets.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map(ticketToPublic),
      posts: memoryPosts.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map((post) => postToPublic(post, oficinas, alunos))
    };
  }
  const [tickets, posts] = await Promise.all([
    db.query("SELECT * FROM suporte_tickets ORDER BY created_at DESC LIMIT 250"),
    db.query(`SELECT p.*, o.nome AS oficina, a.nome AS aluno
              FROM suporte_posts p
              LEFT JOIN oficinas o ON o.id = p.oficina_id
              LEFT JOIN alunos a ON a.id = p.aluno_id
              ORDER BY p.created_at DESC LIMIT 250`)
  ]);
  const ticketRows = await rowsWithAttachments(tickets.rows);
  return {
    tickets: ticketRows.map(ticketToPublic),
    posts: posts.rows.map((post) => postToPublic(post))
  };
}

async function respondTicket(id, payload, adminName = "") {
  await cleanupExpiredTickets();
  if (!db.hasDatabase) {
    const ticket = memoryTickets.find((item) => item.id === id);
    if (!ticket) return null;
    ticket.resposta = payload.resposta || "";
    ticket.status = payload.status || "respondido";
    ticket.respondido_por = adminName;
    ticket.updated_at = nowIso();
    return ticketToPublic(ticket);
  }
  const result = await db.query(
    `UPDATE suporte_tickets
     SET resposta = $1, status = $2, respondido_por = $3, updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [payload.resposta || null, payload.status || "respondido", adminName || null, id]
  );
  return result.rows[0] ? ticketToPublic(result.rows[0]) : null;
}

async function findAttachmentForStudent(session, ticketId, attachmentId) {
  await cleanupExpiredTickets();
  const student = await findStudentForSession(session);
  if (!db.hasDatabase) {
    const ticket = memoryTickets.find((item) => (
      item.id === ticketId
      && item.aluno_id === student.id
      && new Date(item.expires_at).getTime() > Date.now()
    ));
    if (!ticket) return null;
    return (ticket.anexos || []).find((attachment) => attachment.id === attachmentId) || null;
  }
  const result = await db.query(
    `SELECT a.id, a.ticket_id, a.original_name, a.mime_type, a.size_bytes, a.file_content, a.created_at
     FROM suporte_ticket_anexos a
     INNER JOIN suporte_tickets t ON t.id = a.ticket_id
     WHERE a.ticket_id = $1
       AND a.id = $2
       AND t.aluno_id = $3
       AND t.expires_at > NOW()
     LIMIT 1`,
    [ticketId, attachmentId, student.id]
  );
  return result.rows[0] || null;
}

async function findAttachmentForAdmin(ticketId, attachmentId) {
  await cleanupExpiredTickets();
  await ensureSchema();
  if (!db.hasDatabase) {
    const ticket = memoryTickets.find((item) => item.id === ticketId);
    return ticket ? (ticket.anexos || []).find((attachment) => attachment.id === attachmentId) || null : null;
  }
  const result = await db.query(
    `SELECT id, ticket_id, original_name, mime_type, size_bytes, file_content, created_at
     FROM suporte_ticket_anexos
     WHERE ticket_id = $1 AND id = $2
     LIMIT 1`,
    [ticketId, attachmentId]
  );
  return result.rows[0] || null;
}

async function createPost(payload) {
  await ensureSchema();
  const now = nowIso();
  const record = {
    id: crypto.randomUUID(),
    target_type: payload.targetType,
    oficina_id: payload.oficinaId || null,
    aluno_id: payload.alunoId || null,
    tipo: payload.tipo,
    prioridade: payload.prioridade || "normal",
    titulo: payload.titulo,
    mensagem: payload.mensagem,
    ativo: payload.ativo !== false,
    created_at: now,
    updated_at: now
  };
  if (!db.hasDatabase) {
    memoryPosts.push(record);
    const oficinas = await Oficina.findAll({ includeInactive: true });
    const alunos = await Aluno.findAll({});
    return postToPublic(record, oficinas, alunos);
  }
  const result = await db.query(
    `INSERT INTO suporte_posts (target_type, oficina_id, aluno_id, tipo, prioridade, titulo, mensagem, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [record.target_type, record.oficina_id, record.aluno_id, record.tipo, record.prioridade, record.titulo, record.mensagem, record.ativo]
  );
  return postToPublic(result.rows[0]);
}

async function updatePost(id, payload) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const index = memoryPosts.findIndex((item) => item.id === id);
    if (index === -1) return null;
    memoryPosts[index] = {
      ...memoryPosts[index],
      target_type: payload.targetType,
      oficina_id: payload.oficinaId || null,
      aluno_id: payload.alunoId || null,
      tipo: payload.tipo,
      prioridade: payload.prioridade || "normal",
      titulo: payload.titulo,
      mensagem: payload.mensagem,
      ativo: payload.ativo !== false,
      updated_at: nowIso()
    };
    const oficinas = await Oficina.findAll({ includeInactive: true });
    const alunos = await Aluno.findAll({});
    return postToPublic(memoryPosts[index], oficinas, alunos);
  }
  const result = await db.query(
    `UPDATE suporte_posts
     SET target_type = $1,
         oficina_id = $2,
         aluno_id = $3,
         tipo = $4,
         prioridade = $5,
         titulo = $6,
         mensagem = $7,
         ativo = $8,
         updated_at = NOW()
     WHERE id = $9
     RETURNING *`,
    [
      payload.targetType,
      payload.oficinaId || null,
      payload.alunoId || null,
      payload.tipo,
      payload.prioridade || "normal",
      payload.titulo,
      payload.mensagem,
      payload.ativo !== false,
      id
    ]
  );
  return result.rows[0] ? postToPublic(result.rows[0]) : null;
}

async function removePost(id) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const index = memoryPosts.findIndex((item) => item.id === id);
    if (index === -1) return false;
    memoryPosts.splice(index, 1);
    return true;
  }
  const result = await db.query("DELETE FROM suporte_posts WHERE id = $1", [id]);
  return result.rowCount > 0;
}

module.exports = {
  portalByCredentials,
  portalBySession,
  createTicketForStudent,
  createFeedbackForStudent,
  cancelEnrollmentForStudent,
  ticketsForStudentSession,
  listFeedbacks,
  listAdmin,
  respondTicket,
  findAttachmentForStudent,
  findAttachmentForAdmin,
  createPost,
  updatePost,
  removePost
};
