const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const config = require("../config/env");
const db = require("./pool");
const Admin = require("../models/admin.model");
const Audit = require("../models/audit.model");
const logger = require("../utils/logger");
const { defaultOficinas } = require("../services/oficina.service");
const { defaultColaboradores } = require("../models/colaborador.model");

let setupPromise = null;
let requiredSecuritySetupPromise = null;
const setupLockId = 20260509;
const purgeAuditMigrationId = "20260524_purge_historical_admin_audit_logs";

function initials(nome) {
  return nome
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

async function seedOficinas() {
  for (const oficina of defaultOficinas) {
    await db.query(
      `INSERT INTO oficinas (nome, categoria, descricao, faixa_etaria, dias_semana, periodo, horario, capacidade, imagem_url, initials, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
       ON CONFLICT (nome)
       DO UPDATE SET
         categoria = EXCLUDED.categoria,
         descricao = EXCLUDED.descricao,
         faixa_etaria = EXCLUDED.faixa_etaria,
         dias_semana = CASE WHEN oficinas.dias_semana = '{}' THEN EXCLUDED.dias_semana ELSE oficinas.dias_semana END,
         periodo = CASE WHEN oficinas.periodo = 'a definir' THEN EXCLUDED.periodo ELSE oficinas.periodo END,
         horario = EXCLUDED.horario,
         capacidade = COALESCE(oficinas.capacidade, EXCLUDED.capacidade),
         imagem_url = COALESCE(oficinas.imagem_url, EXCLUDED.imagem_url),
         initials = COALESCE(oficinas.initials, EXCLUDED.initials),
         ativo = true`,
      [
        oficina.nome,
        oficina.categoria,
        oficina.descricao,
        oficina.faixaEtaria,
        oficina.diasSemana || [],
        oficina.periodo || "a definir",
        oficina.horario,
        oficina.capacidade || 30,
        "/img/oficinas.png",
        initials(oficina.nome)
      ]
    );
  }
}

async function seedGaleria() {
  await db.query(
    `INSERT INTO galeria (titulo, descricao, imagem_url, alt, ordem, ativo)
     SELECT $1, $2, $3, $4, 1, true
     WHERE NOT EXISTS (SELECT 1 FROM galeria WHERE imagem_url = $3)
     UNION ALL
     SELECT $5, $6, $7, $8, 2, true
     WHERE NOT EXISTS (SELECT 1 FROM galeria WHERE imagem_url = $7)`,
    [
      "Oficinas disponíveis",
      "Quadro oficial com lista de oficinas do Centro da Juventude",
      "/img/oficinas.png",
      "Quadro oficial com lista de oficinas do Centro da Juventude",
      "Identidade oficial",
      "Logo oficial do Centro da Juventude Almirante Tamandare",
      "/img/logo.jpg",
      "Logo oficial do Centro da Juventude Almirante Tamandare"
    ]
  );
}

async function seedColaboradores() {
  for (const colaborador of defaultColaboradores) {
    await db.query(
      `INSERT INTO colaboradores (seed_key, nome, descricao, site_url, imagem_url, alt, ordem, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (seed_key) DO NOTHING`,
      [
        colaborador.seed_key,
        colaborador.nome,
        colaborador.descricao,
        colaborador.site_url,
        colaborador.imagem_url,
        colaborador.alt,
        colaborador.ordem
      ]
    );
  }
}

async function seedAdmin() {
  const code = String(config.adminRegistrationCode || "").replace(/\D/g, "");
  if (!code) return;
  if (!/^\d{6}$/.test(code)) {
    throw new Error("ADMIN_REGISTRATION_CODE deve ter exatamente 6 digitos.");
  }

  const registrationCodeHash = await bcrypt.hash(code, 12);
  if (config.adminResetAdmins) {
    await db.query("DELETE FROM admins");
  }
  await Admin.createAdmin({
    name: config.adminName,
    username: config.adminUsername,
    email: config.adminEmail,
    passwordHash: registrationCodeHash,
    registrationCodeHash,
    role: "master"
  });
}

async function purgeHistoricalAuditLogs() {
  const migration = await db.query(
    `INSERT INTO security_migrations (id)
     VALUES ($1)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [purgeAuditMigrationId]
  );
  if (!migration.rows[0]) return;
  const removed = await Audit.removeAll();
  logger.info("Historico de logs administrativos removido", {
    migrationId: purgeAuditMigrationId,
    removed
  });
}

async function runSetup() {
  const schema = fs.readFileSync(path.resolve(__dirname, "schema.sql"), "utf8");
  const contentSchema = fs.readFileSync(path.resolve(__dirname, "content-schema.sql"), "utf8");

  await db.query(schema);
  await db.query(contentSchema);
  await purgeHistoricalAuditLogs();
  await seedOficinas();
  await seedGaleria();
  await seedColaboradores();
  await db.query(
    `INSERT INTO aluno_oficinas (aluno_id, oficina_id)
     SELECT id, oficina_id
     FROM alunos
     WHERE oficina_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM aluno_oficina_cancelamentos cancelamento
         WHERE cancelamento.aluno_id = alunos.id
           AND cancelamento.oficina_id = alunos.oficina_id
       )
     ON CONFLICT DO NOTHING`
  );
  await seedAdmin();
}

async function runRequiredSecuritySetup() {
  await db.query("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS first_access_completed_at TIMESTAMPTZ");
  await db.query("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS access_guidance_sent_at TIMESTAMPTZ");
  await db.query("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS access_guidance_sent_by UUID REFERENCES admins(id) ON DELETE SET NULL");
  await db.query(`
    CREATE TABLE IF NOT EXISTS aluno_oficina_cancelamentos (
      aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
      oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
      cancelled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (aluno_id, oficina_id)
    );
    CREATE INDEX IF NOT EXISTS idx_aluno_oficina_cancelamentos_oficina
      ON aluno_oficina_cancelamentos (oficina_id, cancelled_at DESC);
    CREATE TABLE IF NOT EXISTS security_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
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
    );
    CREATE INDEX IF NOT EXISTS idx_access_guidance_events_aluno
      ON student_access_guidance_events (aluno_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_access_guidance_events_admin
      ON student_access_guidance_events (admin_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alunos_guidance_status
      ON alunos (first_access_completed_at, access_guidance_sent_at) WHERE status = 'ativo';
  `);
  await purgeHistoricalAuditLogs();
}

async function runSetupWithLock() {
  const client = await db.pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [setupLockId]);
    await runSetup();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [setupLockId]);
    } finally {
      client.release();
    }
  }
}

function ensureDatabase() {
  if (!db.hasDatabase) return Promise.resolve();
  if (!config.autoMigrate && !config.runtimeDatabaseSetup) return Promise.resolve();
  if (!config.autoMigrate) {
    if (!requiredSecuritySetupPromise) {
      requiredSecuritySetupPromise = runRequiredSecuritySetup().catch((error) => {
        requiredSecuritySetupPromise = null;
        throw error;
      });
    }
    return requiredSecuritySetupPromise;
  }
  if (!setupPromise) {
    setupPromise = runSetupWithLock().catch((error) => {
      setupPromise = null;
      throw error;
    });
  }
  return setupPromise;
}

module.exports = ensureDatabase;
