const crypto = require("crypto");
const db = require("../database/pool");

const memoryLogs = [];
let ensured = false;

function cleanMetadata(value = {}) {
  const clone = { ...value };
  delete clone.password;
  delete clone.passwordHash;
  delete clone.registrationCode;
  delete clone.registration_code_hash;
  delete clone.file;
  delete clone.imagemArquivo;
  delete clone.documentos;
  return clone;
}

function toPublic(row) {
  return {
    id: row.id,
    adminId: row.admin_id || row.adminId || "",
    adminName: row.admin_name || row.adminName || "Sistema",
    adminEmail: row.admin_email || row.adminEmail || "",
    adminRole: row.admin_role || row.adminRole || "",
    action: row.action,
    entityType: row.entity_type || row.entityType,
    entityId: row.entity_id || row.entityId || "",
    entityLabel: row.entity_label || row.entityLabel || "",
    metadata: row.metadata || {},
    ip: row.ip || "",
    created_at: row.created_at
  };
}

async function ensureAuditTable() {
  if (ensured || !db.hasDatabase) return;
  ensured = true;
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id TEXT,
      admin_name TEXT NOT NULL,
      admin_email TEXT,
      admin_role TEXT,
      action TEXT NOT NULL CHECK (action IN ('login', 'create', 'update', 'delete')),
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
  `);
}

async function create(payload = {}) {
  const row = {
    id: crypto.randomUUID(),
    admin_id: payload.adminId || payload.admin?.sub || payload.admin?.id || "",
    admin_name: payload.adminName || payload.admin?.name || "Sistema",
    admin_email: payload.adminEmail || payload.admin?.email || "",
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
  const search = String(filters.search || "").trim().toLowerCase();

  if (!db.hasDatabase) {
    return memoryLogs
      .filter((item) => !action || item.action === action)
      .filter((item) => !entityType || item.entity_type === entityType)
      .filter((item) => !search
        || item.admin_name.toLowerCase().includes(search)
        || item.admin_email.toLowerCase().includes(search)
        || item.entity_label.toLowerCase().includes(search))
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
  if (search) {
    params.push(`%${search}%`);
    const index = params.length;
    where.push(`(LOWER(admin_name) LIKE $${index} OR LOWER(COALESCE(admin_email, '')) LIKE $${index} OR LOWER(COALESCE(entity_label, '')) LIKE $${index})`);
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

module.exports = {
  create,
  list,
  ensureAuditTable
};
