const db = require("../backend/database/pool");
const Audit = require("../backend/models/audit.model");
const { redactSensitiveData } = require("../backend/utils/redact");

const privateEntityLabels = new Set([
  "aluno",
  "inscricao",
  "suporte_ticket",
  "aluno_matricula_whatsapp",
  "bolsista",
  "aluno_sessao",
  "oficina_feedback"
]);

function safeActorName(row) {
  return row.admin_id ? "Usuário administrativo" : "Sistema";
}

function sanitizeHistoricalAuditRow(row) {
  const entityType = row.entity_type || "";
  return {
    adminName: safeActorName(row),
    adminEmail: "",
    entityLabel: privateEntityLabels.has(entityType) ? "" : (row.entity_label || ""),
    metadata: redactSensitiveData(row.metadata || {})
  };
}

function differs(row, sanitized) {
  return String(row.admin_name || "") !== sanitized.adminName
    || String(row.admin_email || "") !== sanitized.adminEmail
    || String(row.entity_label || "") !== sanitized.entityLabel
    || JSON.stringify(row.metadata || {}) !== JSON.stringify(sanitized.metadata);
}

async function run() {
  const dryRun = ["true", "1", "yes", "sim"].includes(String(process.env.DRY_RUN || "").toLowerCase());
  if (!db.hasDatabase) {
    console.log("DATABASE_URL ausente. Nenhum log foi processado.");
    return { examined: 0, changed: 0, dryRun };
  }

  await Audit.ensureAuditTable();
  const result = await db.query(
    `SELECT id, admin_id, admin_name, admin_email, entity_type, entity_label, metadata
     FROM admin_audit_logs
     ORDER BY created_at ASC, id ASC`
  );

  let changed = 0;
  for (const row of result.rows) {
    const sanitized = sanitizeHistoricalAuditRow(row);
    if (!differs(row, sanitized)) continue;
    changed += 1;
    if (!dryRun) {
      await db.query(
        `UPDATE admin_audit_logs
         SET admin_name = $1, admin_email = NULLIF($2, ''), entity_label = $3, metadata = $4
         WHERE id = $5`,
        [sanitized.adminName, sanitized.adminEmail, sanitized.entityLabel, JSON.stringify(sanitized.metadata), row.id]
      );
    }
  }

  console.log(`Redação de logs: ${result.rows.length} registro(s) analisado(s), ${changed} alteração(ões) ${dryRun ? "identificada(s) em dry-run" : "aplicada(s)"}.`);
  return { examined: result.rows.length, changed, dryRun };
}

if (require.main === module) {
  run()
    .then(() => {
      if (db.pool) return db.pool.end();
      return undefined;
    })
    .catch((error) => {
      console.error("Falha ao redigir logs históricos.");
      if (db.pool) db.pool.end().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = {
  sanitizeHistoricalAuditRow,
  run
};
