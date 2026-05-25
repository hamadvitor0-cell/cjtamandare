const db = require("./pool");

let ensurePromise = null;
const setupLockId = 20260509;

function ensureAttendanceColumns() {
  if (!db.hasDatabase) return Promise.resolve();
  if (!ensurePromise) {
    ensurePromise = db.query(`
      SELECT pg_advisory_xact_lock(${setupLockId});
      ALTER TABLE IF EXISTS chamadas ADD COLUMN IF NOT EXISTS observacoes TEXT;
      ALTER TABLE IF EXISTS presencas ADD COLUMN IF NOT EXISTS observacao TEXT;
    `).catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

module.exports = ensureAttendanceColumns;
