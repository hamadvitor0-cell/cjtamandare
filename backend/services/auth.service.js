const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/admin.model");
const Audit = require("../models/audit.model");
const config = require("../config/env");
const logger = require("../utils/logger");

const tokenMaxAgeMs = 2 * 60 * 60 * 1000;
const dummyRegistrationCodeHash = bcrypt.hashSync("000000", 12);

function signToken(admin) {
  return jwt.sign(
    {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      name: admin.name,
      username: admin.username
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

async function login({ username, registrationCode, ip }) {
  const identifier = username;
  const code = String(registrationCode || "").replace(/\D/g, "").slice(0, 6);
  const admin = await Admin.findByLogin(identifier);
  const storedSecret = admin?.registration_code_hash || admin?.password_hash || dummyRegistrationCodeHash;
  const codeLooksValid = /^\d{6}$/.test(code);
  const secretMatches = await bcrypt.compare(codeLooksValid ? code : "000000", storedSecret);
  const valid = Boolean(admin && admin.active && codeLooksValid && secretMatches);

  if (!valid) {
    logger.warn("Tentativa de login invalida", { username: identifier, ip });
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
  logger.info("Login administrativo realizado", { username: admin.username, ip });

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
  verifyToken,
  tokenMaxAgeMs
};
