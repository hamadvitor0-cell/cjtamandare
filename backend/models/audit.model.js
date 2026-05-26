const crypto = require("crypto");
const db = require("../database/pool");
const config = require("../config/env");
const { redactSensitiveData } = require("../utils/redact");

const memoryLogs = [];
let ensured = false;
const privateEntityLabels = new Set([
  "aluno",
  "inscricao",
  "suporte_ticket",
  "aluno_matricula_whatsapp",
  "first_access_guidance",
  "bolsista",
  "aluno_sessao",
  "oficina_feedback"
]);

function cleanMetadata(value = {}) {
  return redactSensitiveData(value);
}

function toPublic(row) {
  const entityType = row.entity_type || row.entityType;
  return {
    id: row.id,
    adminId: row.admin_id || row.adminId || "",
    adminName: row.admin_id || row.adminId ? "Usuário administrativo" : "Sistema",
    adminEmail: "",
    adminRole: row.admin_role || row.adminRole || "",
    action: row.action,
    entityType,
    entityId: row.entity_id || row.entityId || "",
    entityLabel: privateEntityLabels.has(entityType) ? "" : (row.entity_label || row.entityLabel || ""),
    metadata: cleanMetadata(row.metadata || {}),
    ip: row.ip || "",
    created_at: row.created_at
  };
}

function dateOnly(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

async function ensureAuditTable() {
  if (ensured || !db.hasDatabase || !config.runtimeDatabaseSetup) return;
  ensured = true;
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id TEXT,
      admin_name TEXT NOT NULL,
      admin_email TEXT,
      admin_role TEXT,
      action TEXT NOT NULL CHECK (action IN ('login', 'create', 'update', 'delete', 'send', 'export', 'denied')),
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      entity_label TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit_logs (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_logs (admin_email, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_entity ON admin_audit_logs (entity_type, created_at DESC);
    ALTER TABLE admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_action_check;
    ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_action_check CHECK (action IN ('login', 'create', 'update', 'delete', 'send', 'export', 'denied'));
  `);
}

async function create(payload = {}) {
  const actorId = payload.adminId || payload.admin?.sub || payload.admin?.id || "";
  const row = {
    id: crypto.randomUUID(),
    admin_id: actorId,
    admin_name: actorId ? "Usuário administrativo" : "Sistema",
    admin_email: "",
    admin_role: payload.adminRole || payload.admin?.role || "",
    action: payload.action,
    entity_type: payload.entityType,
    entity_id: payload.entityId || "",
    entity_label: payload.entityLabel || "",
    metadata: cleanMetadata(payload.metadata || {}),
    ip: payload.ip || "",
    created_at: new Date().toISOString()
  };

  if (!db.hasDatabase) {
    memoryLogs.unshift(row);
    return toPublic(row);
  }

  await ensureAuditTable();
  const result = await db.query(
    `INSERT INTO admin_audit_logs
      (admin_id, admin_name, admin_email, admin_role, action, entity_type, entity_id, entity_label, metadata, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      row.admin_id,
      row.admin_name,
      row.admin_email,
      row.admin_role,
      row.action,
      row.entity_type,
      row.entity_id,
      row.entity_label,
      JSON.stringify(row.metadata),
      row.ip
    ]
  );
  return toPublic(result.rows[0]);
}

async function list(filters = {}) {
  const limit = Math.min(Number(filters.limit || 120) || 120, 300);
  const action = String(filters.action || "");
  const entityType = String(filters.entityType || filters.entity_type || "");
  const usuario = String(filters.usuario || "").trim().toLowerCase();
  const dataInicio = dateOnly(filters.dataInicio);
  const dataFim = dateOnly(filters.dataFim);
  const search = String(filters.search || "").trim().toLowerCase();

  if (!db.hasDatabase) {
    return memoryLogs
      .filter((item) => !action || item.action === action)
      .filter((item) => !entityType || item.entity_type === entityType)
      .filter((item) => !usuario || item.admin_id.toLowerCase().includes(usuario) || item.admin_name.toLowerCase().includes(usuario) || item.admin_email.toLowerCase().includes(usuario))
      .filter((item) => !dataInicio || String(item.created_at).slice(0, 10) >= dataInicio)
      .filter((item) => !dataFim || String(item.created_at).slice(0, 10) <= dataFim)
      .filter((item) => !search
        || item.admin_id.toLowerCase().includes(search)
        || item.admin_name.toLowerCase().includes(search)
        || item.admin_email.toLowerCase().includes(search)
        || item.entity_label.toLowerCase().includes(search)
        || String(item.entity_type || "").toLowerCase().includes(search)
        || JSON.stringify(item.metadata || {}).toLowerCase().includes(search))
      .slice(0, limit)
      .map(toPublic);
  }

  await ensureAuditTable();
  const where = [];
  const params = [];
  if (action) {
    params.push(action);
    where.push(`action = $${params.length}`);
  }
  if (entityType) {
    params.push(entityType);
    where.push(`entity_type = $${params.length}`);
  }
  if (usuario) {
    params.push(`%${usuario}%`);
    const index = params.length;
    where.push(`(LOWER(COALESCE(admin_id, '')) LIKE $${index} OR LOWER(admin_name) LIKE $${index} OR LOWER(COALESCE(admin_email, '')) LIKE $${index})`);
  }
  if (dataInicio) {
    params.push(dataInicio);
    where.push(`created_at::date >= $${params.length}::date`);
  }
  if (dataFim) {
    params.push(dataFim);
    where.push(`created_at::date <= $${params.length}::date`);
  }
  if (search) {
    params.push(`%${search}%`);
    const index = params.length;
    where.push(`(
      LOWER(COALESCE(admin_id, '')) LIKE $${index}
      OR LOWER(admin_name) LIKE $${index}
      OR LOWER(COALESCE(admin_email, '')) LIKE $${index}
      OR LOWER(COALESCE(entity_label, '')) LIKE $${index}
      OR LOWER(COALESCE(entity_type, '')) LIKE $${index}
      OR LOWER(COALESCE(metadata::text, '')) LIKE $${index}
    )`);
  }
  params.push(limit);
  const result = await db.query(
    `SELECT *
     FROM admin_audit_logs
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows.map(toPublic);
}

async function removeAll() {
  if (!db.hasDatabase) {
    const removed = memoryLogs.length;
    memoryLogs.splice(0, memoryLogs.length);
    return removed;
  }
  await ensureAuditTable();
  const result = await db.query("DELETE FROM admin_audit_logs");
  return result.rowCount;
}

module.exports = {
  create,
  list,
  ensureAuditTable,
  removeAll
};
