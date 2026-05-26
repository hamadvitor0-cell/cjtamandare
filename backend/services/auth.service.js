const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/admin.model");
const Audit = require("../models/audit.model");
const config = require("../config/env");
const logger = require("../utils/logger");
const { credentialFingerprint } = require("../utils/security-key");

const tokenMaxAgeMs = 2 * 60 * 60 * 1000;
const studentTokenMaxAgeMs = 2 * 60 * 60 * 1000;
const dummyRegistrationCodeHash = bcrypt.hashSync("000000", 12);

function signToken(admin) {
  return jwt.sign(
    {
      sub: admin.id,
      ver: Number(admin.token_version || 0)
    },
    config.jwtSecret,
    {
      expiresIn: config.jwtExpiresIn,
      issuer: "centro-da-juventude-api",
      audience: "centro-da-juventude-admin"
    }
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, {
    issuer: "centro-da-juventude-api",
    audience: "centro-da-juventude-admin"
  });
}

function signStudentToken(student) {
  return jwt.sign(
    {
      sub: student.id,
      role: "student",
      ver: Number(student.tokenVersion || student.token_version || 0)
    },
    config.jwtSecret,
    {
      expiresIn: "2h",
      issuer: "centro-da-juventude-api",
      audience: "centro-da-juventude-student"
    }
  );
}

function verifyStudentToken(token) {
  const payload = jwt.verify(token, config.jwtSecret, {
    issuer: "centro-da-juventude-api",
    audience: "centro-da-juventude-student"
  });
  if (payload.role !== "student") {
    const error = new Error("Sessão inválida.");
    error.statusCode = 401;
    throw error;
  }
  return payload;
}

async function login({ username, registrationCode, ip }) {
  const identifier = username;
  const code = String(registrationCode || "").replace(/\D/g, "").slice(0, 6);
  const admin = await Admin.findByLogin(identifier);
  const storedSecret = admin?.registration_code_hash || admin?.password_hash || dummyRegistrationCodeHash;
  const codeLooksValid = /^\d{6}$/.test(code);
  const secretMatches = await bcrypt.compare(codeLooksValid ? code : "000000", storedSecret);
  const valid = Boolean(admin && admin.active && codeLooksValid && secretMatches);

  if (!valid) {
    logger.warn("Tentativa de login invalida", { credentialHash: credentialFingerprint("admin-auth", identifier), ip });
    const error = new Error("Credenciais inválidas.");
    error.statusCode = 401;
    throw error;
  }

  await Admin.updateLastLogin(admin.id);
  await Audit.create({
    adminId: admin.id,
    adminName: admin.name,
    adminEmail: admin.email,
    adminRole: admin.role,
    action: "login",
    entityType: "auth",
    entityId: admin.id,
    entityLabel: admin.name,
    ip
  }).catch(() => {});
  logger.info("Login administrativo realizado", { adminId: admin.id, ip });

  return {
    token: signToken(admin),
    admin: {
      id: admin.id,
      name: admin.name,
      username: admin.username,
      email: admin.email,
      role: admin.role
    }
  };
}

module.exports = {
  login,
  signToken,
  verifyToken,
  signStudentToken,
  verifyStudentToken,
  tokenMaxAgeMs,
  studentTokenMaxAgeMs
};
