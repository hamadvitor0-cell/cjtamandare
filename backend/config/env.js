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
    const parsedUrl = new URL(databaseUrl);
    const sslMode = parsedUrl.searchParams.get("sslmode");
    if (sslMode === "disable") return "disable";
    if (sslMode) return "require";

    const host = parsedUrl.hostname;
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

const nodeEnv = process.env.NODE_ENV || "development";
const jwtSecret = readSecret("JWT_SECRET");
const cookieSecret = readSecret("COOKIE_SECRET");
const rateLimitStore = String(process.env.RATE_LIMIT_STORE || (nodeEnv === "production" ? "redis" : "memory")).toLowerCase();
if (!["memory", "redis", "postgres"].includes(rateLimitStore)) {
  throw new Error("RATE_LIMIT_STORE deve ser memory, redis ou postgres.");
}

const config = {
  nodeEnv,
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || "",
  pgssl: parsePgSsl(process.env.PGSSL, process.env.DATABASE_URL || ""),
  useMemoryStore: bool(process.env.USE_MEMORY_STORE, false),
  jwtSecret,
  cookieSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "2h",
  cookieSameSite,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  trustProxy: bool(process.env.TRUST_PROXY, false),
  logToFile: bool(process.env.LOG_TO_FILE, false),
  autoMigrate: bool(process.env.AUTO_MIGRATE, false),
  runtimeDatabaseSetup: bool(process.env.RUNTIME_DATABASE_SETUP, nodeEnv !== "production"),
  aiFeaturesEnabled: bool(process.env.AI_FEATURES_ENABLED, false),
  aiModel: process.env.AI_MODEL || "openai/gpt-5.4",
  aiRequestTimeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS || 6500),
  adminName: process.env.ADMIN_NAME || "Administrador",
  adminUsername: process.env.ADMIN_USERNAME || "master",
  adminResetAdmins: bool(process.env.ADMIN_RESET_ADMINS, false),
  adminEmail: process.env.ADMIN_EMAIL || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  adminRegistrationCode: process.env.ADMIN_REGISTRATION_CODE || process.env.ADMIN_CODE || "",
  rateLimitStore,
  rateLimitKeyPepper: process.env.RATE_LIMIT_KEY_PEPPER || cookieSecret,
  upstashRedisRestUrl: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "",
  upstashRedisRestToken: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || ""
};

config.isProduction = config.nodeEnv === "production";
config.hasDatabase = Boolean(config.databaseUrl) && !config.useMemoryStore;

if (config.isProduction && !config.hasDatabase) {
  throw new Error("DATABASE_URL é obrigatório em produção.");
}

if (config.isProduction && config.rateLimitStore === "memory") {
  throw new Error("RATE_LIMIT_STORE deve usar redis ou postgres em produção para proteger endpoints sensíveis.");
}

if (config.isProduction && config.rateLimitStore === "redis" && (!config.upstashRedisRestUrl || !config.upstashRedisRestToken)) {
  throw new Error("Redis/Upstash não configurado em produção. Defina UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN.");
}

module.exports = config;
