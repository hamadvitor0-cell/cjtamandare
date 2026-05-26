process.env.NODE_ENV = "test";
process.env.USE_MEMORY_STORE = "true";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-with-enough-length-for-security-smoke";
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || "test-cookie-secret-with-enough-length-for-security-smoke";
process.env.RATE_LIMIT_STORE = "memory";
process.env.RATE_LIMIT_KEY_PEPPER = "test-rate-limit-pepper-never-use-in-production";
process.env.RATE_LIMIT_TEST_LIMIT = "5";
process.env.CORS_ORIGIN = "http://localhost:3000";
process.env.ADMIN_REGISTRATION_CODE = "123456";

const assert = require("assert/strict");
const jwt = require("jsonwebtoken");
const app = require("../backend/app");
const Aluno = require("../backend/models/aluno.model");
const Oficina = require("../backend/models/oficina.model");
const Turma = require("../backend/models/turma.model");
const Chamada = require("../backend/models/chamada.model");
const Audit = require("../backend/models/audit.model");
const Admin = require("../backend/models/admin.model");
const Auth = require("../backend/services/auth.service");
const Csv = require("../backend/services/csv.service");
const { sanitizeObject } = require("../backend/utils/sanitize");
const { limiterKey } = require("../backend/middlewares/rateLimit.middleware");
const { redactUrl } = require("../backend/utils/redact");
const { sanitizeHistoricalAuditRow } = require("./redact-audit-logs");

const TEST_CPF = "52998224725";
const OTHER_CPF = "39053344705";

function splitSetCookie(value = "") {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,]+=)/g).map((item) => item.trim()).filter(Boolean);
}

function mergeCookies(current = "", response) {
  const cookies = new Map(
    current
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), part.slice(index + 1)];
      })
  );
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : splitSetCookie(response.headers.get("set-cookie") || "");
  setCookies.forEach((cookie) => {
    const pair = cookie.split(";")[0];
    const index = pair.indexOf("=");
    if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
  });
  return Array.from(cookies.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
}

async function main() {
  const oficinaA = await Oficina.create({
    nome: "Seguranca A",
    categoria: "Teste",
    descricao: "Turma de teste de seguranca.",
    faixaEtaria: "12 a 18 anos",
    horario: "10h",
    capacidade: 20,
    turmas: ["A"],
    ativo: true
  });
  const oficinaB = await Oficina.create({
    nome: "Seguranca B",
    categoria: "Teste",
    descricao: "Turma distinta para teste.",
    faixaEtaria: "12 a 18 anos",
    horario: "11h",
    capacidade: 20,
    turmas: ["B"],
    ativo: true
  });
  const turmaA = await Turma.create({
    oficinaId: oficinaA.id,
    nome: "Seguranca A - Manha",
    diasSemana: ["segunda", "quarta"],
    periodo: "manha",
    horarioInicio: "09:00",
    horarioFim: "10:00",
    idadeMinima: 12,
    idadeMaxima: 18,
    vagasTotal: 20,
    ativa: true
  });
  const turmaB = await Turma.create({
    oficinaId: oficinaB.id,
    nome: "Seguranca B - Tarde",
    diasSemana: ["terca", "quinta"],
    periodo: "tarde",
    horarioInicio: "14:00",
    horarioFim: "15:00",
    idadeMinima: 12,
    idadeMaxima: 18,
    vagasTotal: 20,
    ativa: true
  });
  const aluno = await Aluno.create({
    nome: "Aluno Segurança",
    cpf: TEST_CPF,
    dataNascimento: "2008-01-10",
    idade: 18,
    telefone: "(41) 99999-9999",
    responsavel: "Responsável Teste",
    email: "aluno@example.test",
    bairro: "Centro",
    oficinaIds: [oficinaA.id, oficinaB.id],
    turmaIds: [turmaA.id, turmaB.id],
    turmaId: turmaA.id,
    turmas: [turmaA.nome, turmaB.nome],
    status: "ativo",
    documentosPendentes: false
  });
  assert.match(aluno.matricula, /^CJ-\d{4}-\d{4,8}$/, "student creation must generate matricula");
  const outsider = await Aluno.create({
    nome: "Aluno Outra Turma",
    cpf: OTHER_CPF,
    idade: 17,
    telefone: "(41) 98888-8888",
    oficinaIds: [oficinaB.id],
    turmaId: turmaB.id,
    turmas: [turmaB.nome],
    status: "ativo",
    documentosPendentes: false
  });

  const studentTokenPayload = jwt.decode(Auth.signStudentToken(aluno));
  assert.equal(studentTokenPayload.cpf, undefined, "student token must not contain CPF");
  assert.equal(studentTokenPayload.matricula, undefined, "student token must not contain matricula");
  assert.equal(studentTokenPayload.nome, undefined, "student token must not contain name");
  assert.equal(studentTokenPayload.ver, aluno.tokenVersion, "student token must carry only its revocable version claim");
  const cpfLimiterKey = limiterKey("portal-cpf", TEST_CPF);
  const matriculaLimiterKey = limiterKey("portal-matricula", aluno.matricula);
  assert.doesNotMatch(cpfLimiterKey, new RegExp(TEST_CPF), "rate-limit keys must not expose CPF");
  assert.doesNotMatch(matriculaLimiterKey, new RegExp(aluno.matricula), "rate-limit keys must not expose matricula");
  assert.doesNotMatch(
    redactUrl(`/admin/primeiro-acesso/alunos?search=${encodeURIComponent(aluno.matricula)}`),
    new RegExp(aluno.matricula),
    "HTTP log URL redaction must remove searches that may contain matricula"
  );

  await assert.rejects(
    Chamada.save({
      oficinaId: oficinaA.id,
      turmaId: turmaA.id,
      turma: turmaA.nome,
      data: "2026-05-24",
      observacoes: "",
      presencas: [{ alunoId: outsider.id, status: "ausente", observacao: "" }]
    }),
    (error) => error.statusCode === 403,
    "attendance must reject a student outside the selected class"
  );
  await Chamada.save({
    oficinaId: oficinaA.id,
    turmaId: turmaA.id,
    turma: turmaA.nome,
    data: "2026-05-24",
    observacoes: "",
    presencas: [{ alunoId: aluno.id, status: "presente", observacao: "" }]
  });

  const redactedLog = await Audit.create({
    action: "update",
    entityType: "aluno",
    metadata: {
      body: { nome: aluno.nome, cpf: TEST_CPF, telefone: "(41) 99999-9999", matricula: aluno.matricula }
    }
  });
  assert.equal(redactedLog.metadata.body.cpf, "***.***.***-25", "audit must mask CPF");
  assert.equal(redactedLog.metadata.body.telefone, "*****-9999", "audit must mask phone");
  assert.equal(redactedLog.metadata.body.matricula, "[redacted]", "audit must redact matricula");
  assert.equal(redactedLog.metadata.body.nome, "[redacted]", "audit must redact student name");
  const historicalLog = sanitizeHistoricalAuditRow({
    admin_id: "operator-id",
    admin_name: "Nome Operador",
    admin_email: "operador@example.test",
    entity_type: "aluno",
    entity_label: aluno.nome,
    metadata: {
      items: [{ studentName: aluno.nome, guardian: "Responsável Teste", celular: "(41) 99999-9999" }],
      enrollment: aluno.matricula
    }
  });
  assert.equal(historicalLog.adminName, "Usuário administrativo", "historical log migration must remove actor PII");
  assert.equal(historicalLog.adminEmail, "", "historical log migration must remove actor email");
  assert.equal(historicalLog.entityLabel, "", "historical log migration must remove private labels");
  assert.equal(historicalLog.metadata.items[0].studentName, "[redacted]", "nested names must be redacted");
  assert.equal(historicalLog.metadata.items[0].guardian, "[redacted]", "nested guardian must be redacted");
  assert.equal(historicalLog.metadata.items[0].celular, "*****-9999", "nested phone aliases must be masked");
  assert.equal(historicalLog.metadata.enrollment, "[redacted]", "enrollment aliases must be redacted");
  const removedHistoricalLogs = await Audit.removeAll();
  assert.ok(removedHistoricalLogs >= 1, "historical audit log purge must remove prior entries");
  assert.equal((await Audit.list({})).length, 0, "audit purge must leave no historical logs");
  ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "<svg onload=alert(1)>"].forEach((payload) => {
    const sanitized = sanitizeObject({ texto: payload }).texto;
    assert.doesNotMatch(sanitized, /<script\b/i, "text sanitizer must remove executable script tags");
    if (/<(?:img|svg)\b/i.test(sanitized)) {
      assert.doesNotMatch(sanitized, /onerror|onload|javascript:/i, "real rendered tags must not retain active handlers");
    }
    assert.notEqual(sanitized, payload, "text sanitizer must transform active XSS payloads");
  });
  const maliciousCsv = Csv.inscricoesToCsv([{ nome: "=IMPORTXML(\"https://example.test\")" }]);
  assert.match(maliciousCsv, /'=IMPORTXML/, "CSV export must neutralize spreadsheet formulas");

  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (cookie) headers.set("Cookie", cookie);
    if (options.body && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body
    });
    cookie = mergeCookies(cookie, response);
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : await response.text();
    return { response, data };
  }

  try {
    let result = await request("/health");
    assert.equal(result.response.status, 200, "health endpoint must remain available");
    assert.match(result.response.headers.get("content-security-policy") || "", /frame-ancestors 'none'/, "CSP must prevent framing");
    assert.equal(result.response.headers.get("x-frame-options"), "DENY", "frameguard header must be enabled");
    assert.equal(result.response.headers.get("x-content-type-options"), "nosniff", "MIME sniffing must be disabled");

    const forbiddenCors = await fetch(`${baseUrl}/health`, {
      headers: { Origin: "https://not-authorized.example" }
    });
    assert.equal(forbiddenCors.status, 403, "untrusted CORS origins must be rejected");
    assert.equal(forbiddenCors.headers.get("access-control-allow-origin"), null, "untrusted origin must not receive CORS permission");

    result = await request("/suporte/tickets");
    assert.equal(result.response.status, 401, "ticket history must require student session");

    result = await request("/alunos");
    assert.equal(result.response.status, 401, "administrative student list must require admin session");
    result = await request("/admin/turmas");
    assert.equal(result.response.status, 401, "administrative class list must require admin session");
    result = await request("/admin/primeiro-acesso/alunos");
    assert.equal(result.response.status, 401, "first-access distribution list must require admin session");
    result = await request("/admin-manual.html");
    assert.equal(result.response.status, 401, "administrative manual HTML must not be delivered without a session");
    result = await request("/admin/manual");
    assert.equal(result.response.status, 401, "internal administrative manual content must require an administrative session");

    result = await request("/suporte/tickets", {
      method: "POST",
      body: { categoria: "duvida", descricao: "Tentativa sem sessão do aluno." }
    });
    assert.equal(result.response.status, 401, "ticket creation must require student session");

    result = await request("/suporte/login", {
      method: "POST",
      body: { cpf: TEST_CPF, matricula: "CJ-2026-9999" }
    });
    assert.equal(result.response.status, 401, "portal login must reject wrong matricula");
    assert.equal(result.data.message, "CPF ou matrícula inválidos.", "portal login must use a generic credential message");

    result = await request("/inscricoes/status", {
      method: "POST",
      body: { cpf: TEST_CPF }
    });
    assert.equal(result.response.status, 410, "legacy CPF/birthdate status route must be retired");

    result = await request("/inscricoes/status", {
      method: "POST",
      body: { cpf: TEST_CPF, dataNascimento: "2009-01-10" }
    });
    assert.equal(result.response.status, 410, "legacy credentials must never return private status");
    assert.equal(result.data.status, undefined, "legacy status route must not return student data");

    result = await request(`/oficinas/${oficinaA.id}/turmas`);
    assert.equal(result.response.status, 200, "public workshop classes must be readable without exposing student data");
    assert.equal(result.data.turmas[0].id, turmaA.id, "public classes must include active class options");
    assert.equal(result.data.turmas[0].observacoes, undefined, "public classes must not expose internal notes");
    assert.equal(result.data.turmas[0].bolsista, undefined, "public classes must not expose internal staff by default");

    result = await request("/suporte/login", {
      method: "POST",
      body: { cpf: TEST_CPF, matricula: aluno.matricula }
    });
    assert.equal(result.response.status, 200, "portal login with CPF and matricula must work");
    assert.equal(result.data.portal.aluno.cpf, "***.***.***-25");
    assert.equal(result.data.portal.aluno.telefone, undefined, "portal must not expose phone in aluno payload");
    assert.equal(result.data.portal.aluno.email, undefined, "portal must not expose email in aluno payload");
    assert.equal(result.data.portal.aluno.responsavel, undefined, "portal must not expose guardian when not required");
    assert.match(cookie, /student_access_token=/, "portal login must set http-only student cookie");

    result = await request("/suporte/tickets", {
      method: "POST",
      body: { categoria: "duvida", descricao: "Tentativa autenticada sem token CSRF." }
    });
    assert.equal(result.response.status, 403, "ticket creation must require CSRF after student login");

    result = await request("/csrf-token");
    assert.equal(result.response.status, 200);
    const csrfToken = result.data.csrfToken;

    result = await request("/suporte/inscricoes/cancelar", {
      method: "POST",
      body: { oficinaId: oficinaB.id, confirmacao: true }
    });
    assert.equal(result.response.status, 403, "enrollment cancellation must require CSRF");

    result = await request("/suporte/inscricoes/cancelar", {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
      body: { oficinaId: oficinaB.id, confirmacao: false }
    });
    assert.equal(result.response.status, 422, "enrollment cancellation must require explicit confirmation");

    result = await request("/suporte/inscricoes/cancelar", {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
      body: { oficinaId: oficinaB.id, confirmacao: true }
    });
    assert.equal(result.response.status, 200, "student must be able to cancel an enrolled workshop");
    assert.equal(result.data.oficina.id, oficinaB.id, "cancellation response must identify only the cancelled workshop");
    result = await request("/suporte/portal");
    assert.equal(result.response.status, 200);
    assert.ok(result.data.portal.turmas.some((turma) => turma.id === oficinaA.id), "other enrollment must be preserved");
    assert.ok(!result.data.portal.turmas.some((turma) => turma.id === oficinaB.id), "cancelled enrollment must disappear from portal");

    result = await request("/suporte/tickets", {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
      body: {
        cpf: OTHER_CPF,
        categoria: "duvida",
        descricao: "<script>alert(1)</script> Preciso de atendimento pelo portal."
      }
    });
    assert.equal(result.response.status, 201, "valid session and CSRF should create ticket");
    assert.equal(result.data.ticket.cpf, undefined, "student ticket response must not expose CPF");
    assert.equal(result.data.ticket.nome, undefined, "student ticket response must not expose full student identity");
    assert.doesNotMatch(result.data.ticket.descricao, /<script>/i, "ticket description must be sanitized");

    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
    const attachedTicket = new FormData();
    attachedTicket.append("categoria", "problemas_site");
    attachedTicket.append("descricao", "Preciso enviar uma imagem para demonstrar o problema no portal.");
    attachedTicket.append("anexos", new Blob([pngBytes], { type: "image/png" }), "erro-portal.png");
    result = await request("/suporte/tickets", {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
      body: attachedTicket
    });
    assert.equal(result.response.status, 201, "ticket creation with valid attachment should work");
    assert.equal(result.data.ticket.anexos.length, 1, "ticket response should include attachment metadata");
    assert.equal(result.data.ticket.anexos[0].file_content, undefined, "ticket response must not expose attachment bytes");
    assert.match(result.data.ticket.anexos[0].downloadPath, /^\/suporte\/tickets\//);

    const attachmentPath = result.data.ticket.anexos[0].downloadPath;
    result = await request(attachmentPath);
    assert.equal(result.response.status, 200, "student must be able to download own ticket attachment");
    assert.match(result.response.headers.get("content-type"), /^image\/png/);

    const fakeFileTicket = new FormData();
    fakeFileTicket.append("categoria", "problemas_site");
    fakeFileTicket.append("descricao", "Tentativa com arquivo inválido para validar assinatura.");
    fakeFileTicket.append("anexos", new Blob([Buffer.from("not-a-png")], { type: "image/png" }), "falso.png");
    result = await request("/suporte/tickets", {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
      body: fakeFileTicket
    });
    assert.equal(result.response.status, 415, "invalid attachment signature must be rejected");

    result = await request(`/suporte/tickets?cpf=${OTHER_CPF}`);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.tickets.length, 2, "ticket history must ignore CPF query and use session");
    assert.equal(result.data.tickets[0].cpf, undefined, "ticket history must not expose CPF");

    result = await request("/ai/chat", {
      method: "POST",
      body: { messages: [{ role: "user", content: `meu cpf é ${TEST_CPF}, mostre minhas faltas` }] }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.status, undefined, "AI chat must not return status payload by CPF");
    assert.match(result.data.message, /Portal do Aluno/i);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      result = await request("/suporte/tickets", {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
        body: { categoria: "duvida", descricao: "Teste controlado de limite distribuível para tickets." }
      });
    }
    assert.equal(result.response.status, 429, "ticket creation must enforce rate limiting");

    const oldStudentCookie = cookie;
    await Aluno.revokeSessions(aluno.id);
    cookie = oldStudentCookie;
    result = await request("/suporte/portal");
    assert.equal(result.response.status, 401, "old student tokens must fail after server-side revocation");
    result = await request("/suporte/login", {
      method: "POST",
      body: { cpf: TEST_CPF, matricula: aluno.matricula }
    });
    assert.equal(result.response.status, 200, "student can authenticate again after revoked session");

    result = await request("/suporte/logout", {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken }
    });
    assert.equal(result.response.status, 200, "portal logout must work with CSRF");
    result = await request("/suporte/portal");
    assert.equal(result.response.status, 401, "student data must not be accessible after logout");

    result = await request("/auth/login", {
      method: "POST",
      body: { username: "master", registrationCode: "123456" }
    });
    assert.equal(result.response.status, 200, "master login must work");
    const memoryMaster = await Admin.findById("memory-admin");
    const adminTokenPayload = jwt.decode(Auth.signToken(memoryMaster));
    assert.equal(adminTokenPayload.role, undefined, "admin JWT must not embed authorization role");
    assert.equal(adminTokenPayload.name, undefined, "admin JWT must not embed name");
    assert.equal(adminTokenPayload.ver, memoryMaster.token_version, "admin JWT must carry revocable version");
    result = await request("/admin-manual.html", { redirect: "manual" });
    assert.equal(result.response.status, 302, "legacy manual page must redirect an authorized administrator");
    assert.equal(result.response.headers.get("location"), "/admin.html#manual", "legacy manual page must route to the internal panel section");
    result = await request("/admin/manual");
    assert.equal(result.response.status, 200, "master must load the protected internal manual content");
    assert.equal(result.response.headers.get("cache-control"), "private, no-store, max-age=0", "manual API response must not be cached");
    assert.equal(result.data.manual.title, "Manual do Administrador", "protected manual must provide the new internal guide");
    assert.ok(result.data.manual.sections.some((section) => section.id === "primeiro-acesso"), "manual must explain first-access operations");
    assert.match(JSON.stringify(result.data.manual), /Atualmente não existe login por senha do aluno/, "manual must not promise an unavailable student password flow");
    assert.doesNotMatch(JSON.stringify(result.data.manual), /529[.\s-]*982[.\s-]*247[.\s-]*25/, "manual must not contain the test CPF");
    result = await request("/admin.html");
    assert.match(result.data, /href="#manual" data-admin-page-link="manual"/, "admin menu must expose the internal manual section");
    assert.doesNotMatch(result.data, /Aluno esqueceu a matrícula/, "protected manual instructions must not be embedded in the public login shell");
    result = await request("/csrf-token");
    const adminCsrf = result.data.csrfToken;

    result = await request("/alunos?page=1&limit=1&sort=nome");
    assert.equal(result.response.status, 200, "master must load the paginated student list");
    assert.equal(result.data.pagination.limit, 1, "student list must honor a constrained page size");
    assert.ok(result.data.alunos.length <= 1, "student list must not return more records than requested");
    const listedStudent = result.data.alunos[0];
    assert.equal(listedStudent.cpf, undefined, "student list must not expose raw CPF");
    assert.equal(listedStudent.telefone, undefined, "student list must not expose raw phone");
    assert.ok(Object.prototype.hasOwnProperty.call(listedStudent, "cpfMascarado"), "student list must expose only a masked CPF reference");
    result = await request(`/alunos/${aluno.id}`);
    assert.equal(result.response.status, 200, "authorized detail load must work on demand");
    assert.equal(result.data.aluno.id, aluno.id, "on-demand detail must return the selected student");

    result = await request("/admin/primeiro-acesso/alunos?statusPrimeiroAcesso=todos&statusOrientacao=todos&limit=20");
    assert.equal(result.response.status, 200, "master must access first-access distribution list");
    const distributedStudent = result.data.alunos.find((item) => item.id === aluno.id);
    assert.ok(distributedStudent, "authorized list must include the selected active student");
    assert.equal(distributedStudent.cpfMascarado, "***.***.***-25", "first-access list must expose only masked CPF");
    assert.equal(distributedStudent.cpf, undefined, "first-access list must not expose raw CPF");
    assert.equal(distributedStudent.telefone, undefined, "first-access list must not expose raw phone");
    assert.equal(distributedStudent.responsavel, undefined, "first-access list must not expose guardian");
    assert.equal(distributedStudent.documentosLinks, undefined, "first-access list must not expose documents");
    assert.equal(distributedStudent.primeiroAcessoConcluido, true, "successful portal login must mark first access as completed");
    assert.equal(result.data.pagination.limit, 20, "first-access list must apply constrained pagination");

    result = await request(`/admin/primeiro-acesso/alunos/${aluno.id}/mensagem`, {
      method: "POST",
      headers: { "X-CSRF-Token": adminCsrf },
      body: { actionType: "copied_access_message" }
    });
    assert.equal(result.response.status, 200, "authorized operator must generate one manual access message");
    assert.match(result.data.message, new RegExp(aluno.matricula), "manual message must contain only the selected student's matricula");
    assert.doesNotMatch(result.data.message, /senha/i, "message must not promise a password flow that is not implemented");
    assert.equal(result.data.canOpenWhatsapp, true, "valid registered phone must allow a single manual WhatsApp link");
    assert.match(result.data.whatsappUrl, /^https:\/\/wa\.me\/55\d+\?text=/, "WhatsApp URL must be individual and encoded");

    result = await request(`/admin/primeiro-acesso/alunos/${aluno.id}/marcar-enviado`, {
      method: "POST",
      headers: { "X-CSRF-Token": adminCsrf },
      body: { method: "whatsapp_manual" }
    });
    assert.equal(result.response.status, 200, "operator must mark a manual orientation as sent");
    result = await request(`/admin/primeiro-acesso/alunos/${aluno.id}/historico`);
    assert.equal(result.response.status, 200, "operator must load minimal orientation history");
    assert.ok(result.data.events.some((event) => event.actionType === "marked_access_guidance_sent"), "history must include marked orientation");
    assert.equal(result.data.events[0].matricula, undefined, "history must not expose matricula");
    result = await request(`/admin/primeiro-acesso/alunos/${aluno.id}/desmarcar-enviado`, {
      method: "POST",
      headers: { "X-CSRF-Token": adminCsrf },
      body: {}
    });
    assert.equal(result.response.status, 200, "operator must be able to remove an orientation marker");
    const guidanceLogs = await Audit.list({ entityType: "first_access_guidance" });
    const guidanceAuditContent = JSON.stringify(guidanceLogs);
    assert.doesNotMatch(guidanceAuditContent, new RegExp(aluno.matricula), "orientation audit must not contain matricula");
    assert.doesNotMatch(guidanceAuditContent, new RegExp(TEST_CPF), "orientation audit must not contain CPF");
    assert.doesNotMatch(guidanceAuditContent, /99999-9999/, "orientation audit must not contain phone");

    result = await request("/admin/primeiro-acesso/pdf", {
      method: "POST",
      headers: { "X-CSRF-Token": adminCsrf },
      body: { somenteSemPrimeiroAcesso: false, somenteNaoOrientados: false, formato: "cards", confirmLarge: true }
    });
    assert.equal(result.response.status, 422, "first-access PDF must reject unrestricted generation");
    result = await request("/admin/primeiro-acesso/pdf", {
      method: "POST",
      headers: { "X-CSRF-Token": adminCsrf },
      body: { oficinaId: oficinaA.id, somenteSemPrimeiroAcesso: false, somenteNaoOrientados: false, formato: "cards", confirmLarge: true }
    });
    assert.equal(result.response.status, 200, "authorized filtered PDF generation must work");
    assert.match(result.response.headers.get("content-type") || "", /^application\/pdf/, "filtered guidance output must be a PDF");

    for (let attempt = 0; attempt < 8; attempt += 1) {
      result = await request(`/admin/primeiro-acesso/alunos/${aluno.id}/mensagem`, {
        method: "POST",
        headers: { "X-CSRF-Token": adminCsrf },
        body: { actionType: "opened_access_whatsapp" }
      });
    }
    assert.equal(result.response.status, 429, "individual access-message preparation must be rate limited");

    for (let attempt = 0; attempt < 8; attempt += 1) {
      result = await request(`/alunos/${aluno.id}/matricula-whatsapp`, {
        method: "POST",
        headers: { "X-CSRF-Token": adminCsrf }
      });
    }
    assert.equal(result.response.status, 429, "matricula WhatsApp generation must enforce rate limiting");

    for (let attempt = 0; attempt < 8; attempt += 1) {
      result = await request("/inscricoes/export/csv");
    }
    assert.equal(result.response.status, 429, "exports must enforce rate limiting");

    const fakeSpreadsheet = new FormData();
    fakeSpreadsheet.append("planilha", new Blob([Buffer.from("not-an-xlsx")], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }), "alunos.xlsx");
    result = await request("/alunos/importar", {
      method: "POST",
      headers: { "X-CSRF-Token": adminCsrf },
      body: fakeSpreadsheet
    });
    assert.equal(result.response.status, 415, "spreadsheet import must reject invalid XLSX signature");

    const secretaria = await Admin.create({
      name: "Secretaria Administrativa",
      username: "secretaria",
      registrationCode: "135790",
      role: "admin",
      active: true
    });
    cookie = `access_token=${Auth.signToken(secretaria)}`;
    result = await request("/admin/manual");
    assert.equal(result.response.status, 200, "ADM must access the internal manual");

    await Admin.create({
      name: "Professor Chamada",
      username: "presenca",
      registrationCode: "654321",
      role: "chamadas",
      active: true
    });
    result = await request("/auth/login", {
      method: "POST",
      body: { username: "presenca", registrationCode: "654321" }
    });
    assert.equal(result.response.status, 200, "attendance role login must work");
    result = await request(`/chamadas?oficinaId=${oficinaA.id}&turma=A&data=2026-05-24`);
    assert.equal(result.response.status, 200, "attendance role can load selected class");
    assert.equal(result.data.alunos[0].nome, aluno.nome, "attendance role needs student name");
    assert.equal(result.data.alunos[0].cpf, undefined, "attendance role must not receive CPF");
    assert.equal(result.data.alunos[0].telefone, undefined, "attendance role must not receive phone");
    assert.equal(result.data.alunos[0].responsavel, undefined, "attendance role must not receive guardian data");
    result = await request("/admin/primeiro-acesso/alunos?statusPrimeiroAcesso=todos");
    assert.equal(result.response.status, 403, "attendance role must not access first-access matricula distribution");
    result = await request("/admin/manual");
    assert.equal(result.response.status, 403, "attendance role must not access the complete administrative manual");
    result = await request("/admin-manual.html", { redirect: "manual" });
    assert.equal(result.response.status, 403, "attendance role must not use the retired manual route to bypass access");
    result = await request("/admin/logs");
    assert.equal(result.response.status, 403, "attendance role must not access audit logs");
    await new Promise((resolve) => setImmediate(resolve));
    const deniedLogs = await Audit.list({ action: "denied" });
    assert.ok(deniedLogs.length >= 1, "denied administrative access must create an audit record");

    const secondMaster = await Admin.create({
      name: "Master Secundario",
      username: "master2",
      registrationCode: "456789",
      role: "master",
      active: true
    });
    result = await request("/auth/login", {
      method: "POST",
      body: { username: "master2", registrationCode: "456789" }
    });
    assert.equal(result.response.status, 200, "second master login must work");
    await Admin.update(secondMaster.id, {
      name: secondMaster.name,
      username: secondMaster.username,
      role: "chamadas",
      active: true
    });
    result = await request("/admin/logs");
    assert.equal(result.response.status, 401, "issued token must be invalid after a role downgrade");
    await Admin.update(secondMaster.id, {
      name: secondMaster.name,
      username: secondMaster.username,
      role: "master",
      active: true
    });
    result = await request("/auth/login", {
      method: "POST",
      body: { username: "master2", registrationCode: "456789" }
    });
    assert.equal(result.response.status, 200, "restored master login must work");
    await Admin.update(secondMaster.id, {
      name: secondMaster.name,
      username: secondMaster.username,
      role: "master",
      active: false
    });
    result = await request("/admin/logs");
    assert.equal(result.response.status, 401, "issued token must be invalid after administrator inactivation");
    await Admin.update(secondMaster.id, {
      name: secondMaster.name,
      username: secondMaster.username,
      role: "master",
      active: true
    });
    result = await request("/auth/login", {
      method: "POST",
      body: { username: "master2", registrationCode: "456789" }
    });
    assert.equal(result.response.status, 200, "reactivated master can authenticate again");
    result = await request("/csrf-token");
    const masterCsrf = result.data.csrfToken;
    await Admin.update("memory-admin", {
      name: "Administrador",
      username: "master",
      role: "master",
      active: false
    });
    result = await request(`/admin/usuarios/${secondMaster.id}`, {
      method: "PUT",
      headers: { "X-CSRF-Token": masterCsrf },
      body: {
        name: secondMaster.name,
        username: secondMaster.username,
        registrationCode: "",
        role: "admin",
        active: true
      }
    });
    assert.equal(result.response.status, 409, "the final active Master must not be demoted");
    await Admin.revokeSessions(secondMaster.id);
    result = await request("/admin/logs");
    assert.equal(result.response.status, 401, "global administrative session revocation must invalidate an issued token");

    for (let attempt = 0; attempt < 8; attempt += 1) {
      result = await request("/suporte/login", {
        method: "POST",
        body: { cpf: TEST_CPF, matricula: "CJ-2026-9999" }
      });
    }
    assert.equal(result.response.status, 429, "repeated portal credential attempts must be rate limited");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main()
  .then(() => {
    console.log("Security smoke tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
