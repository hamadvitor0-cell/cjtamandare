const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../database/pool");
const config = require("../config/env");

const memoryAdmins = [];
let ensured = false;

function toAdmin(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username || "",
    email: row.email,
    password_hash: row.password_hash,
    role: row.role,
    active: row.active,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function publicAdmin(admin) {
  if (!admin) return null;
  const { password_hash: _passwordHash, ...safe } = admin;
  return safe;
}

function duplicateAdminError() {
  const error = new Error("Ja existe ADM com este usuario ou e-mail.");
  error.statusCode = 409;
  return error;
}

function seedMemoryAdmin() {
  if (memoryAdmins.length || !config.adminEmail || !config.adminPassword) return;
  memoryAdmins.push(toAdmin({
    id: "memory-admin",
    name: config.adminName,
    username: "master",
    email: config.adminEmail.toLowerCase(),
    password_hash: bcrypt.hashSync(config.adminPassword, 12),
    role: "master",
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));
}

async function ensureAdminTable() {
  if (ensured || !db.hasDatabase) return;
  ensured = true;
  await db.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
      username TEXT UNIQUE CHECK (username IS NULL OR username ~ '^[a-zA-Z0-9._-]{3,40}$'),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE admins ADD COLUMN IF NOT EXISTS username TEXT;
    ALTER TABLE admins ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE admins ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;
    ALTER TABLE admins ADD CONSTRAINT admins_role_check CHECK (role IN ('master', 'admin'));
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_username ON admins (username) WHERE username IS NOT NULL AND username <> '';
    CREATE INDEX IF NOT EXISTS idx_admins_email ON admins (email);
  `);
  if (config.adminEmail) {
    await db.query(
      `UPDATE admins
       SET role = 'master',
           username = COALESCE(NULLIF(username, ''), 'master'),
           active = true,
           updated_at = NOW()
       WHERE LOWER(email) = LOWER($1)`,
      [config.adminEmail]
    );
  }
}

async function findByLogin(identifier) {
  const normalized = String(identifier || "").trim().toLowerCase();

  if (!db.hasDatabase) {
    seedMemoryAdmin();
    return memoryAdmins.find((admin) => admin.email === normalized || admin.username === normalized) || null;
  }

  await ensureAdminTable();
  const result = await db.query(
    `SELECT id, name, username, email, password_hash, role, active, last_login_at, created_at, updated_at
     FROM admins
     WHERE LOWER(email) = $1 OR LOWER(COALESCE(username, '')) = $1
     LIMIT 1`,
    [normalized]
  );

  return toAdmin(result.rows[0]);
}

async function findByEmail(email) {
  return findByLogin(email);
}

async function findById(id) {
  if (!db.hasDatabase) {
    seedMemoryAdmin();
    return memoryAdmins.find((admin) => admin.id === id) || null;
  }
  await ensureAdminTable();
  const result = await db.query(
    `SELECT id, name, username, email, password_hash, role, active, last_login_at, created_at, updated_at
     FROM admins
     WHERE id = $1`,
    [id]
  );
  return toAdmin(result.rows[0]);
}

async function list() {
  if (!db.hasDatabase) {
    seedMemoryAdmin();
    return memoryAdmins.map(publicAdmin);
  }
  await ensureAdminTable();
  const result = await db.query(
    `SELECT id, name, username, email, role, active, last_login_at, created_at, updated_at
     FROM admins
     ORDER BY role DESC, name ASC`
  );
  return result.rows.map(toAdmin).map(publicAdmin);
}

async function create({ name, username, email, password, role = "admin", active = true }) {
  const passwordHash = await bcrypt.hash(String(password), 12);
  const normalizedUsername = String(username || "").trim().toLowerCase();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!db.hasDatabase) {
    seedMemoryAdmin();
    const existing = memoryAdmins.find((admin) => admin.email === normalizedEmail || admin.username === normalizedUsername);
    if (existing) {
      throw duplicateAdminError();
    }
    const admin = toAdmin({
      id: crypto.randomUUID(),
      name,
      username: normalizedUsername,
      email: normalizedEmail,
      password_hash: passwordHash,
      role,
      active,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    memoryAdmins.push(admin);
    return publicAdmin(admin);
  }

  await ensureAdminTable();
  let result;
  try {
    result = await db.query(
      `INSERT INTO admins (name, username, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, username, email, role, active, last_login_at, created_at, updated_at`,
      [name, normalizedUsername, normalizedEmail, passwordHash, role, active]
    );
  } catch (error) {
    if (error.code === "23505") throw duplicateAdminError();
    throw error;
  }

  return publicAdmin(toAdmin(result.rows[0]));
}

async function createAdmin({ name, email, passwordHash, role = "master" }) {
  if (!db.hasDatabase) {
    throw new Error("Seed de administrador exige DATABASE_URL.");
  }
  await ensureAdminTable();
  const result = await db.query(
    `INSERT INTO admins (name, username, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email)
     DO UPDATE SET
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       username = COALESCE(admins.username, EXCLUDED.username),
       active = true,
       updated_at = NOW()
     RETURNING id, name, username, email, role, active, created_at, updated_at`,
    [name, "master", email.toLowerCase(), passwordHash, role]
  );

  return publicAdmin(toAdmin(result.rows[0]));
}

async function update(id, payload) {
  if (!db.hasDatabase) {
    seedMemoryAdmin();
    const index = memoryAdmins.findIndex((admin) => admin.id === id);
    if (index === -1) return null;
    const current = memoryAdmins[index];
    memoryAdmins[index] = {
      ...current,
      name: payload.name,
      username: String(payload.username || "").trim().toLowerCase(),
      email: String(payload.email || "").trim().toLowerCase(),
      role: payload.role || "admin",
      active: payload.active !== false,
      password_hash: payload.password ? await bcrypt.hash(String(payload.password), 12) : current.password_hash,
      updated_at: new Date().toISOString()
    };
    return publicAdmin(memoryAdmins[index]);
  }

  await ensureAdminTable();
  const passwordHash = payload.password ? await bcrypt.hash(String(payload.password), 12) : null;
  let result;
  try {
    result = await db.query(
      `UPDATE admins
       SET name = $1,
           username = $2,
           email = $3,
           role = $4,
           active = $5,
           password_hash = COALESCE($6, password_hash),
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, name, username, email, role, active, last_login_at, created_at, updated_at`,
      [
        payload.name,
        String(payload.username || "").trim().toLowerCase(),
        String(payload.email || "").trim().toLowerCase(),
        payload.role || "admin",
        payload.active !== false,
        passwordHash,
        id
      ]
    );
  } catch (error) {
    if (error.code === "23505") throw duplicateAdminError();
    throw error;
  }
  return result.rows[0] ? publicAdmin(toAdmin(result.rows[0])) : null;
}

async function remove(id) {
  if (!db.hasDatabase) {
    seedMemoryAdmin();
    const index = memoryAdmins.findIndex((admin) => admin.id === id);
    if (index === -1) return false;
    memoryAdmins.splice(index, 1);
    return true;
  }
  await ensureAdminTable();
  const result = await db.query("DELETE FROM admins WHERE id = $1", [id]);
  return result.rowCount > 0;
}

async function updateLastLogin(id) {
  if (!db.hasDatabase || id === "memory-admin") return;
  await ensureAdminTable();
  await db.query("UPDATE admins SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1", [id]);
}

module.exports = {
  ensureAdminTable,
  list,
  findByLogin,
  findByEmail,
  findById,
  create,
  createAdmin,
  update,
  remove,
  updateLastLogin
};
