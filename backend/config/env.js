const crypto = require("crypto");
const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["true", "1", "yes", "sim"].includes(String(value).toLowerCase());
}

function parsePgSsl(value, databaseUrl) {
  const normalized = String(value || "auto").toLowerCase();
  if (["true", "1", "yes", "sim"].includes(normalized)) return "require";
  if (["false", "0", "no", "nao", "não"].includes(normalized)) return "disable";
  if (normalized !== "auto") {
    throw new Error("PGSSL deve ser auto, true ou false.");
  }

  if (!databaseUrl) return "disable";

  try {
    const host = new URL(databaseUrl).hostname;
    const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    return localHosts.has(host) ? "disable" : "require";
  } catch (error) {
    return "require";
  }
}

function readSecret(name) {
  const value = process.env[name];
  if (value) return value;

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} precisa estar definido em produção.`);
  }

  console.warn(`[security] ${name} ausente. Usando segredo temporário somente para desenvolvimento.`);
  return crypto.randomBytes(48).toString("hex");
}

const cookieSameSite = (process.env.COOKIE_SAME_SITE || "strict").toLowerCase();
if (!["strict", "lax", "none"].includes(cookieSameSite)) {
  throw new Error("COOKIE_SAME_SITE deve ser strict, lax ou none.");
}

const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || "",
  pgssl: parsePgSsl(process.env.PGSSL, process.env.DATABASE_URL || ""),
  useMemoryStore: bool(process.env.USE_MEMORY_STORE, false),
  jwtSecret: readSecret("JWT_SECRET"),
  cookieSecret: readSecret("COOKIE_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "2h",
  cookieSameSite,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  trustProxy: bool(process.env.TRUST_PROXY, false),
  logToFile: bool(process.env.LOG_TO_FILE, false),
  autoMigrate: bool(process.env.AUTO_MIGRATE, false),
  aiFeaturesEnabled: bool(process.env.AI_FEATURES_ENABLED, false),
  aiModel: process.env.AI_MODEL || "openai/gpt-5.4",
  adminName: process.env.ADMIN_NAME || "Administrador",
  adminEmail: process.env.ADMIN_EMAIL || "",
  adminPassword: process.env.ADMIN_PASSWORD || ""
};

config.isProduction = config.nodeEnv === "production";
config.hasDatabase = Boolean(config.databaseUrl) && !config.useMemoryStore;

if (config.isProduction && !config.hasDatabase) {
  throw new Error("DATABASE_URL é obrigatório em produção.");
}

module.exports = config;
