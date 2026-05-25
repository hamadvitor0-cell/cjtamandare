const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../database/pool");
const config = require("../config/env");

const memoryAdmins = [];
let ensured = false;
let ensurePromise = null;
// Shared with database bootstrapping so request-time schema checks cannot race migrations.
const setupLockId = 20260509;

function toAdmin(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username || "",
    email: row.email || "",
    password_hash: row.password_hash,
    registration_code_hash: row.registration_code_hash || "",
    role: row.role,
    active: row.active,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function publicAdmin(admin) {
  if (!admin) return null;
  const { password_hash: _passwordHash, registration_code_hash: _registrationCodeHash, ...safe } = admin;
  return safe;
}

function duplicateAdminError() {
  const error = new Error("Ja existe ADM com este usuario.");
  error.statusCode = 409;
  return error;
}

function normalizeRegistrationCode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

async function hashRegistrationCode(value) {
  const code = normalizeRegistrationCode(value);
  if (!/^\d{6}$/.test(code)) {
    const error = new Error("O codigo de cadastro deve ter 6 digitos.");
    error.statusCode = 400;
    throw error;
  }
  return bcrypt.hash(code, 12);
}

function masterSeedCode() {
  const code = normalizeRegistrationCode(config.adminRegistrationCode);
  if (/^\d{6}$/.test(code)) return code;
  const legacyPasswordCode = normalizeRegistrationCode(config.adminPassword);
  return /^\d{6}$/.test(legacyPasswordCode) ? legacyPasswordCode : "";
}

function seedMemoryAdmin() {
  const code = masterSeedCode();
  if (memoryAdmins.length || !code) return;
  const codeHash = bcrypt.hashSync(code, 12);
  memoryAdmins.push(toAdmin({
    id: "memory-admin",
    name: config.adminName,
    username: "master",
    email: "",
    password_hash: codeHash,
    registration_code_hash: codeHash,
    role: "master",
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));
}

async function ensureAdminTable() {
  if (ensured || !db.hasDatabase) return;
  if (!ensurePromise) {
    ensurePromise = db.query(`
      SELECT pg_advisory_xact_lock(${setupLockId});
      CREATE TABLE IF NOT EXISTS admins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
        username TEXT UNIQUE CHECK (username IS NULL OR username ~ '^[a-zA-Z0-9._-]{3,40}$'),
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        registration_code_hash TEXT,
        role TEXT NOT NULL DEFAULT 'admin',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE admins ADD COLUMN IF NOT EXISTS username TEXT;
      ALTER TABLE admins ADD COLUMN IF NOT EXISTS registration_code_hash TEXT;
      ALTER TABLE admins ALTER COLUMN email DROP NOT NULL;
      ALTER TABLE admins ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE admins ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
      ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;
      ALTER TABLE admins ADD CONSTRAINT admins_role_check CHECK (role IN ('master', 'admin'));
      CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_username ON admins (username) WHERE username IS NOT NULL AND username <> '';
      CREATE INDEX IF NOT EXISTS idx_admins_email ON admins (email);
    `)
      .then(() => {
        ensured = true;
      })
      .finally(() => {
        ensurePromise = null;
      });
  }
  await ensurePromise;
  if (config.adminEmail || config.adminRegistrationCode) {
    const registrationCodeHash = masterSeedCode()
      ? await hashRegistrationCode(masterSeedCode())
      : null;
    await db.query(
      `UPDATE admins
       SET role = 'master',
           username = COALESCE(NULLIF(username, ''), 'master'),
           registration_code_hash = COALESCE($2, registration_code_hash),
           active = true,
           updated_at = NOW()
       WHERE LOWER(email) = LOWER($1) OR LOWER(COALESCE(username, '')) = 'master'`,
      [config.adminEmail || "", registrationCodeHash]
    );
  }
}

async function findByLogin(identifier) {
  const normalized = String(identifier || "").trim().toLowerCase();

  if (!db.hasDatabase) {
    seedMemoryAdmin();
    return memoryAdmins.find((admin) => admin.username === normalized || admin.email === normalized) || null;
  }

  await ensureAdminTable();
  const result = await db.query(
    `SELECT id, name, username, email, password_hash, registration_code_hash, role, active, last_login_at, created_at, updated_at
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
    `SELECT id, name, username, email, password_hash, registration_code_hash, role, active, last_login_at, created_at, updated_at
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

async function create({ name, username, registrationCode, password, role = "admin", active = true }) {
  const code = registrationCode || password;
  const registrationCodeHash = await hashRegistrationCode(code);
  const normalizedUsername = String(username || "").trim().toLowerCase();

  if (!db.hasDatabase) {
    seedMemoryAdmin();
    const existing = memoryAdmins.find((admin) => admin.username === normalizedUsername);
    if (existing) {
      throw duplicateAdminError();
    }
    const admin = toAdmin({
      id: crypto.randomUUID(),
      name,
      username: normalizedUsername,
      email: "",
      password_hash: registrationCodeHash,
      registration_code_hash: registrationCodeHash,
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
      `INSERT INTO admins (name, username, email, password_hash, registration_code_hash, role, active)
       VALUES ($1, $2, NULL, $3, $3, $4, $5)
       RETURNING id, name, username, email, role, active, last_login_at, created_at, updated_at`,
      [name, normalizedUsername, registrationCodeHash, role, active]
    );
  } catch (error) {
    if (error.code === "23505") throw duplicateAdminError();
    throw error;
  }

  return publicAdmin(toAdmin(result.rows[0]));
}

async function createAdmin({ name, username = "master", email, passwordHash, registrationCodeHash, role = "master" }) {
  if (!db.hasDatabase) {
    throw new Error("Seed de administrador exige DATABASE_URL.");
  }
  await ensureAdminTable();
  const loginEmail = email ? email.toLowerCase() : null;
  const normalizedUsername = String(username || "master").trim().toLowerCase();
  const codeHash = registrationCodeHash || passwordHash;
  if (loginEmail) {
    const existing = await db.query(
      `UPDATE admins
       SET name = $1,
           username = $2,
           password_hash = $3,
           registration_code_hash = $3,
           role = $4,
           active = true,
           updated_at = NOW()
       WHERE LOWER(email) = LOWER($5)
       RETURNING id, name, username, email, role, active, created_at, updated_at`,
      [name, normalizedUsername, codeHash, role, loginEmail]
    );
    if (existing.rows[0]) return publicAdmin(toAdmin(existing.rows[0]));
  }
  let result;
  try {
    result = await db.query(
      `INSERT INTO admins (name, username, email, password_hash, registration_code_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, username, email, role, active, created_at, updated_at`,
      [name, normalizedUsername, loginEmail, codeHash, codeHash, role]
    );
  } catch (error) {
    if (error.code !== "23505") throw error;
    result = await db.query(
      `UPDATE admins
       SET name = $1,
           email = COALESCE($2, email),
           password_hash = $3,
           registration_code_hash = $3,
           role = $4,
           active = true,
           updated_at = NOW()
       WHERE LOWER(COALESCE(username, '')) = LOWER($5)
       RETURNING id, name, username, email, role, active, created_at, updated_at`,
      [name, loginEmail, codeHash, role, normalizedUsername]
    );
  }

  return publicAdmin(toAdmin(result.rows[0]));
}

async function update(id, payload) {
  if (!db.hasDatabase) {
    seedMemoryAdmin();
    const index = memoryAdmins.findIndex((admin) => admin.id === id);
    if (index === -1) return null;
    const current = memoryAdmins[index];
    const registrationCodeHash = payload.registrationCode ? await hashRegistrationCode(payload.registrationCode) : null;
    memoryAdmins[index] = {
      ...current,
      name: payload.name,
      username: String(payload.username || "").trim().toLowerCase(),
      email: current.email || "",
      role: payload.role || "admin",
      active: payload.active !== false,
      password_hash: registrationCodeHash || current.password_hash,
      registration_code_hash: registrationCodeHash || current.registration_code_hash,
      updated_at: new Date().toISOString()
    };
    return publicAdmin(memoryAdmins[index]);
  }

  await ensureAdminTable();
  const registrationCodeHash = payload.registrationCode ? await hashRegistrationCode(payload.registrationCode) : null;
  let result;
  try {
    result = await db.query(
      `UPDATE admins
       SET name = $1,
           username = $2,
           role = $3,
           active = $4,
           password_hash = COALESCE($5, password_hash),
           registration_code_hash = COALESCE($5, registration_code_hash),
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, name, username, email, role, active, last_login_at, created_at, updated_at`,
      [
        payload.name,
        String(payload.username || "").trim().toLowerCase(),
        payload.role || "admin",
        payload.active !== false,
        registrationCodeHash,
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
