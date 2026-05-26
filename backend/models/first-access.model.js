const crypto = require("crypto");
const db = require("../database/pool");
const config = require("../config/env");
const Aluno = require("./aluno.model");

const eventTypes = new Set([
  "copied_access_message",
  "opened_access_whatsapp",
  "marked_access_guidance_sent",
  "unmarked_access_guidance_sent",
  "generated_access_guidance_pdf"
]);
const guidanceMethods = new Set(["whatsapp_manual", "presencial", "telefone", "outro"]);
const memoryStatus = new Map();
const memoryEvents = [];
let schemaEnsured = false;

function privateError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function maskCpf(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 11 ? `***.***.***-${digits.slice(-2)}` : "";
}

function maskPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 4 ? `(--) *****-${digits.slice(-4)}` : "";
}

function whatsappPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(digits)) return digits;
  if (/^\d{10,11}$/.test(digits)) return `55${digits}`;
  return "";
}

function accessMessage(matricula) {
  return [
    "Olá! Este é um aviso do Centro da Juventude.",
    "",
    "Para acessar o Portal do Aluno, entre em:",
    "https://cjtamandare.vercel.app/portal",
    "",
    "Use seu CPF e a matrícula abaixo para entrar no portal.",
    "",
    `Sua matrícula é: ${matricula}`,
    "",
    "Não compartilhe sua matrícula com outras pessoas."
  ].join("\n");
}

async function ensureSchema() {
  if (schemaEnsured || !db.hasDatabase || !config.runtimeDatabaseSetup) return;
  schemaEnsured = true;
  await db.query("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS first_access_completed_at TIMESTAMPTZ");
  await db.query("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS access_guidance_sent_at TIMESTAMPTZ");
  await db.query("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS access_guidance_sent_by UUID REFERENCES admins(id) ON DELETE SET NULL");
  await db.query(`
    CREATE TABLE IF NOT EXISTS student_access_guidance_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      aluno_id UUID REFERENCES alunos(id) ON DELETE CASCADE,
      admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
      action_type TEXT NOT NULL CHECK (action_type IN (
        'copied_access_message',
        'opened_access_whatsapp',
        'marked_access_guidance_sent',
        'unmarked_access_guidance_sent',
        'generated_access_guidance_pdf'
      )),
      method TEXT CHECK (method IS NULL OR method IN ('whatsapp_manual', 'presencial', 'telefone', 'outro')),
      oficina_id UUID REFERENCES oficinas(id) ON DELETE SET NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query("CREATE INDEX IF NOT EXISTS idx_access_guidance_events_aluno ON student_access_guidance_events (aluno_id, created_at DESC)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_access_guidance_events_admin ON student_access_guidance_events (admin_id, created_at DESC)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_alunos_guidance_status ON alunos (first_access_completed_at, access_guidance_sent_at) WHERE status = 'ativo'");
}

function memoryStatusFor(alunoId) {
  if (!memoryStatus.has(alunoId)) {
    memoryStatus.set(alunoId, {
      firstAccessCompletedAt: "",
      accessGuidanceSentAt: "",
      accessGuidanceSentBy: ""
    });
  }
  return memoryStatus.get(alunoId);
}

function minimalStudent(student, status = {}) {
  const phone = whatsappPhone(student.telefone);
  return {
    id: student.id,
    nome: student.nome,
    matricula: student.matricula || "",
    cpfMascarado: maskCpf(student.cpf),
    telefoneMascarado: maskPhone(student.telefone),
    telefoneWhatsappDisponivel: Boolean(phone),
    oficinas: Array.isArray(student.oficinas) ? student.oficinas : [],
    oficinaIds: Array.isArray(student.oficinaIds) ? student.oficinaIds : [],
    turmas: Array.isArray(student.turmas) ? student.turmas : [],
    primeiroAcessoConcluido: Boolean(status.firstAccessCompletedAt || student.first_access_completed_at),
    primeiroAcessoConcluidoEm: status.firstAccessCompletedAt || student.first_access_completed_at || "",
    orientacaoEnviada: Boolean(status.accessGuidanceSentAt || student.access_guidance_sent_at),
    orientacaoEnviadaEm: status.accessGuidanceSentAt || student.access_guidance_sent_at || "",
    orientacaoEnviadaPorNome: status.accessGuidanceSentByName || student.guidance_admin_name || ""
  };
}

function firstAccessMatches(student, filter) {
  if (filter === "sem_primeiro_acesso") return !student.primeiroAcessoConcluido;
  if (filter === "com_primeiro_acesso") return student.primeiroAcessoConcluido;
  return true;
}

function guidanceMatches(student, filter) {
  if (filter === "pendente") return !student.orientacaoEnviada;
  if (filter === "enviada") return student.orientacaoEnviada;
  return true;
}

async function listMemory(filters) {
  const alunos = await Aluno.findAll({});
  const search = String(filters.search || "").trim().toLowerCase();
  const rows = alunos
    .filter((aluno) => aluno.status === "ativo")
    .map((aluno) => minimalStudent(aluno, memoryStatusFor(aluno.id)))
    .filter((aluno) => !filters.oficinaId || aluno.oficinaIds.includes(filters.oficinaId))
    .filter((aluno) => !filters.turma || aluno.turmas.includes(filters.turma))
    .filter((aluno) => !search || aluno.nome.toLowerCase().includes(search) || aluno.matricula.toLowerCase().includes(search))
    .filter((aluno) => firstAccessMatches(aluno, filters.statusPrimeiroAcesso))
    .filter((aluno) => guidanceMatches(aluno, filters.statusOrientacao))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const offset = (filters.page - 1) * filters.limit;
  return {
    alunos: rows.slice(offset, offset + filters.limit),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: rows.length,
      pages: Math.max(1, Math.ceil(rows.length / filters.limit))
    }
  };
}

async function listStudents(filters = {}) {
  await ensureSchema();
  const normalized = {
    oficinaId: String(filters.oficinaId || ""),
    turma: String(filters.turma || "").trim(),
    statusPrimeiroAcesso: String(filters.statusPrimeiroAcesso || "sem_primeiro_acesso"),
    statusOrientacao: String(filters.statusOrientacao || "todos"),
    search: String(filters.search || "").trim(),
    page: Math.max(1, Number(filters.page || 1)),
    limit: Math.min(100, Math.max(1, Number(filters.limit || 20)))
  };
  if (!db.hasDatabase) return listMemory(normalized);

  const result = await db.query(
    `SELECT
       a.id, a.nome, a.matricula, a.cpf, a.telefone, a.turmas,
       a.first_access_completed_at, a.access_guidance_sent_at,
       guidance_admin.name AS guidance_admin_name,
       COALESCE(office_data.oficina_ids, ARRAY[]::uuid[]) AS oficina_ids,
       COALESCE(office_data.oficinas, ARRAY[]::text[]) AS oficinas,
       COUNT(*) OVER()::int AS total_count
     FROM alunos a
     LEFT JOIN admins guidance_admin ON guidance_admin.id = a.access_guidance_sent_by
     LEFT JOIN LATERAL (
       SELECT
         ARRAY_AGG(o.id ORDER BY o.nome) AS oficina_ids,
         ARRAY_AGG(o.nome ORDER BY o.nome) AS oficinas
       FROM aluno_oficinas ao
       INNER JOIN oficinas o ON o.id = ao.oficina_id
       WHERE ao.aluno_id = a.id
     ) office_data ON true
     WHERE a.status = 'ativo'
       AND ($1::uuid IS NULL OR EXISTS (
         SELECT 1 FROM aluno_oficinas filtro
         WHERE filtro.aluno_id = a.id AND filtro.oficina_id = $1::uuid
       ))
       AND ($2::text = '' OR $2::text = ANY(COALESCE(a.turmas, ARRAY[]::text[])))
       AND ($3::text = '' OR LOWER(a.nome) LIKE LOWER($3) OR LOWER(COALESCE(a.matricula, '')) LIKE LOWER($3))
       AND (
         $4::text = 'todos'
         OR ($4::text = 'sem_primeiro_acesso' AND a.first_access_completed_at IS NULL)
         OR ($4::text = 'com_primeiro_acesso' AND a.first_access_completed_at IS NOT NULL)
       )
       AND (
         $5::text = 'todos'
         OR ($5::text = 'pendente' AND a.access_guidance_sent_at IS NULL)
         OR ($5::text = 'enviada' AND a.access_guidance_sent_at IS NOT NULL)
       )
     ORDER BY a.nome ASC
     LIMIT $6 OFFSET $7`,
    [
      normalized.oficinaId || null,
      normalized.turma,
      normalized.search ? `%${normalized.search}%` : "",
      normalized.statusPrimeiroAcesso,
      normalized.statusOrientacao,
      normalized.limit,
      (normalized.page - 1) * normalized.limit
    ]
  );
  const total = Number(result.rows[0]?.total_count || 0);
  return {
    alunos: result.rows.map((row) => minimalStudent({
      ...row,
      oficinaIds: row.oficina_ids,
      oficinas: row.oficinas
    })),
    pagination: {
      page: normalized.page,
      limit: normalized.limit,
      total,
      pages: Math.max(1, Math.ceil(total / normalized.limit))
    }
  };
}

async function findAuthorizedStudent(id) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const student = await Aluno.findById(id);
    return student && student.status === "ativo" ? student : null;
  }
  const result = await db.query(
    `SELECT a.id, a.nome, a.matricula, a.telefone, a.status, a.turmas,
            COALESCE(ARRAY_AGG(o.nome ORDER BY o.nome) FILTER (WHERE o.nome IS NOT NULL), ARRAY[]::text[]) AS oficinas
     FROM alunos a
     LEFT JOIN aluno_oficinas ao ON ao.aluno_id = a.id
     LEFT JOIN oficinas o ON o.id = ao.oficina_id
     WHERE a.id = $1 AND a.status = 'ativo'
     GROUP BY a.id`,
    [id]
  );
  return result.rows[0] || null;
}

async function recordEvent({ alunoId = null, adminId, actionType, method = null, oficinaId = null, metadata = {} }) {
  if (!eventTypes.has(actionType)) throw privateError("Ação de orientação inválida.");
  if (method && !guidanceMethods.has(method)) throw privateError("Método de orientação inválido.");
  const event = {
    id: crypto.randomUUID(),
    alunoId: alunoId || "",
    adminId: adminId || "",
    actionType,
    method: method || "",
    oficinaId: oficinaId || "",
    metadata,
    created_at: new Date().toISOString()
  };
  if (!db.hasDatabase) {
    memoryEvents.unshift(event);
    return event;
  }
  await ensureSchema();
  await db.query(
    `INSERT INTO student_access_guidance_events
       (aluno_id, admin_id, action_type, method, oficina_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [alunoId || null, adminId || null, actionType, method || null, oficinaId || null, JSON.stringify(metadata)]
  );
  return event;
}

async function prepareMessage(alunoId, adminId, actionType) {
  if (!["copied_access_message", "opened_access_whatsapp"].includes(actionType)) {
    throw privateError("Ação de mensagem inválida.");
  }
  const student = await findAuthorizedStudent(alunoId);
  if (!student) return null;
  if (!student.matricula) throw privateError("Este aluno ainda não possui matrícula disponível.", 409);
  const message = accessMessage(student.matricula);
  const phone = whatsappPhone(student.telefone);
  await recordEvent({ alunoId, adminId, actionType });
  return {
    message,
    whatsappUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : "",
    canOpenWhatsapp: Boolean(phone),
    warning: phone ? "" : "Telefone não cadastrado ou inválido. Copie a mensagem para orientar o aluno por outro meio."
  };
}

async function markGuidanceSent(alunoId, adminId, method) {
  const student = await findAuthorizedStudent(alunoId);
  if (!student) return null;
  if (!guidanceMethods.has(method)) throw privateError("Método de orientação inválido.");
  const now = new Date().toISOString();
  if (!db.hasDatabase) {
    const status = memoryStatusFor(alunoId);
    status.accessGuidanceSentAt = now;
    status.accessGuidanceSentBy = adminId;
    status.accessGuidanceSentByName = "Usuário administrativo";
  } else {
    await db.query(
      `UPDATE alunos
       SET access_guidance_sent_at = NOW(), access_guidance_sent_by = $2, updated_at = NOW()
       WHERE id = $1 AND status = 'ativo'`,
      [alunoId, adminId]
    );
  }
  await recordEvent({ alunoId, adminId, actionType: "marked_access_guidance_sent", method });
  return { alunoId, orientacaoEnviada: true, orientacaoEnviadaEm: now };
}

async function unmarkGuidanceSent(alunoId, adminId) {
  const student = await findAuthorizedStudent(alunoId);
  if (!student) return null;
  if (!db.hasDatabase) {
    const status = memoryStatusFor(alunoId);
    status.accessGuidanceSentAt = "";
    status.accessGuidanceSentBy = "";
    status.accessGuidanceSentByName = "";
  } else {
    await db.query(
      `UPDATE alunos
       SET access_guidance_sent_at = NULL, access_guidance_sent_by = NULL, updated_at = NOW()
       WHERE id = $1 AND status = 'ativo'`,
      [alunoId]
    );
  }
  await recordEvent({ alunoId, adminId, actionType: "unmarked_access_guidance_sent" });
  return { alunoId, orientacaoEnviada: false };
}

async function history(alunoId) {
  const student = await findAuthorizedStudent(alunoId);
  if (!student) return null;
  if (!db.hasDatabase) {
    return memoryEvents
      .filter((event) => event.alunoId === alunoId)
      .slice(0, 20)
      .map((event) => ({
        id: event.id,
        actionType: event.actionType,
        method: event.method,
        created_at: event.created_at,
        adminName: "Usuário administrativo"
      }));
  }
  const result = await db.query(
    `SELECT event.id, event.action_type, event.method, event.created_at, admin.name AS admin_name
     FROM student_access_guidance_events event
     LEFT JOIN admins admin ON admin.id = event.admin_id
     WHERE event.aluno_id = $1
     ORDER BY event.created_at DESC
     LIMIT 20`,
    [alunoId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    actionType: row.action_type,
    method: row.method || "",
    created_at: row.created_at,
    adminName: row.admin_name || "Usuário administrativo"
  }));
}

async function registerPortalAccess(alunoId) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const status = memoryStatusFor(alunoId);
    if (!status.firstAccessCompletedAt) status.firstAccessCompletedAt = new Date().toISOString();
    return;
  }
  await db.query(
    `UPDATE alunos
     SET first_access_completed_at = COALESCE(first_access_completed_at, NOW()), updated_at = NOW()
     WHERE id = $1 AND status = 'ativo'`,
    [alunoId]
  );
}

async function studentsForPdf(filters) {
  if (!filters.oficinaId && !filters.turma) {
    throw privateError("Selecione uma oficina ou turma para gerar o PDF.", 422);
  }
  const data = await listStudents({
    oficinaId: filters.oficinaId,
    turma: filters.turma,
    statusPrimeiroAcesso: filters.somenteSemPrimeiroAcesso ? "sem_primeiro_acesso" : "todos",
    statusOrientacao: filters.somenteNaoOrientados ? "pendente" : "todos",
    search: "",
    page: 1,
    limit: 100
  });
  if (data.pagination.total > 100) {
    throw privateError("O filtro retorna mais de 100 alunos. Restrinja a turma ou oficina para gerar o PDF.", 413);
  }
  if (data.pagination.total > 25 && !filters.confirmLarge) {
    const error = privateError("Confirme a geração do PDF para esta quantidade de alunos.", 409);
    error.count = data.pagination.total;
    throw error;
  }
  return data.alunos;
}

module.exports = {
  accessMessage,
  history,
  listStudents,
  markGuidanceSent,
  prepareMessage,
  recordEvent,
  registerPortalAccess,
  studentsForPdf,
  unmarkGuidanceSent
};
