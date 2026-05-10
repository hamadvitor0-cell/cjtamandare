const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/admin.model");
const Audit = require("../models/audit.model");
const config = require("../config/env");
const logger = require("../utils/logger");

const tokenMaxAgeMs = 2 * 60 * 60 * 1000;

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

async function login({ email, password, ip }) {
  const admin = await Admin.findByLogin(email);
  const valid = admin && admin.active && await bcrypt.compare(password, admin.password_hash);

  if (!valid) {
    logger.warn("Tentativa de login inválida", { email, ip });
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
  logger.info("Login administrativo realizado", { email: admin.email, ip });

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
