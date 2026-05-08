const bcrypt = require("bcryptjs");
const db = require("../database/pool");
const config = require("../config/env");

function toAdmin(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password_hash: row.password_hash,
    role: row.role,
    active: row.active,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function findByEmail(email) {
  const normalized = String(email).toLowerCase();

  if (!db.hasDatabase) {
    if (!config.adminEmail || !config.adminPassword) return null;
    if (normalized !== config.adminEmail.toLowerCase()) return null;
    return toAdmin({
      id: "memory-admin",
      name: config.adminName,
      email: config.adminEmail.toLowerCase(),
      password_hash: bcrypt.hashSync(config.adminPassword, 12),
      role: "admin",
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  const result = await db.query(
    `SELECT id, name, email, password_hash, role, active, last_login_at, created_at, updated_at
     FROM admins
     WHERE email = $1
     LIMIT 1`,
    [normalized]
  );

  return toAdmin(result.rows[0]);
}

async function createAdmin({ name, email, passwordHash, role = "admin" }) {
  if (!db.hasDatabase) {
    throw new Error("Seed de administrador exige DATABASE_URL.");
  }

  const result = await db.query(
    `INSERT INTO admins (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email)
     DO UPDATE SET
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       active = true,
       updated_at = NOW()
     RETURNING id, name, email, role, active, created_at, updated_at`,
    [name, email.toLowerCase(), passwordHash, role]
  );

  return result.rows[0];
}

async function updateLastLogin(id) {
  if (!db.hasDatabase || id === "memory-admin") return;
  await db.query("UPDATE admins SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1", [id]);
}

module.exports = {
  findByEmail,
  createAdmin,
  updateLastLogin
};
