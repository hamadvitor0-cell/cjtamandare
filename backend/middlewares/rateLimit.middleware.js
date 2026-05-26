const rateLimit = require("express-rate-limit");
const { Redis } = require("@upstash/redis");
const { Ratelimit } = require("@upstash/ratelimit");
const config = require("../config/env");
const db = require("../database/pool");
const { limiterKey } = require("../utils/security-key");

const standardMessage = {
  message: "Muitas requisições em pouco tempo. Tente novamente mais tarde."
};
const authenticationMessage = {
  message: "Não foi possível autenticar agora. Aguarde alguns minutos."
};

let redisClient = null;
let postgresSchemaPromise = null;
const sharedLimiters = new Map();

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function redis() {
  if (!redisClient) {
    redisClient = new Redis({
      url: config.upstashRedisRestUrl,
      token: config.upstashRedisRestToken
    });
  }
  return redisClient;
}

function windowText(windowMs) {
  if (windowMs % (60 * 60 * 1000) === 0) return `${windowMs / (60 * 60 * 1000)} h`;
  if (windowMs % (60 * 1000) === 0) return `${windowMs / (60 * 1000)} m`;
  return `${Math.ceil(windowMs / 1000)} s`;
}

function sharedLimiter(namespace, limit, windowMs) {
  const name = `${namespace}:${limit}:${windowMs}`;
  if (!sharedLimiters.has(name)) {
    sharedLimiters.set(name, new Ratelimit({
      redis: redis(),
      prefix: "cj:ratelimit",
      limiter: Ratelimit.slidingWindow(limit, windowText(windowMs)),
      analytics: false
    }));
  }
  return sharedLimiters.get(name);
}

async function ensurePostgresStore() {
  if (!postgresSchemaPromise) {
    postgresSchemaPromise = db.query(`
      CREATE TABLE IF NOT EXISTS security_rate_limits (
        key_hash TEXT NOT NULL,
        window_start BIGINT NOT NULL,
        counter INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (key_hash, window_start)
      );
      CREATE INDEX IF NOT EXISTS idx_security_rate_limits_expires_at
        ON security_rate_limits (expires_at);
    `).catch((error) => {
      postgresSchemaPromise = null;
      throw error;
    });
  }
  await postgresSchemaPromise;
}

async function postgresLimit(keyHash, limit, windowMs) {
  await ensurePostgresStore();
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const reset = windowStart + windowMs;
  const result = await db.query(
    `INSERT INTO security_rate_limits (key_hash, window_start, counter, expires_at)
     VALUES ($1, $2, 1, $3)
     ON CONFLICT (key_hash, window_start)
     DO UPDATE SET counter = security_rate_limits.counter + 1, expires_at = EXCLUDED.expires_at
     RETURNING counter`,
    [keyHash, windowStart, new Date(reset)]
  );
  if (Math.random() < 0.01) {
    db.query("DELETE FROM security_rate_limits WHERE expires_at < NOW() - INTERVAL '1 day'").catch(() => {});
  }
  const counter = Number(result.rows[0]?.counter || 0);
  return {
    success: counter <= limit,
    limit,
    remaining: Math.max(limit - counter, 0),
    reset
  };
}

function writeHeaders(res, result) {
  res.set("RateLimit-Limit", String(result.limit));
  res.set("RateLimit-Remaining", String(Math.max(Number(result.remaining || 0), 0)));
  if (result.reset) res.set("RateLimit-Reset", String(Math.ceil(Number(result.reset) / 1000)));
}

function createSensitiveLimiter({
  namespace,
  productionLimit,
  developmentLimit,
  windowMs,
  identity,
  message = standardMessage
}) {
  const configuredLimit = config.isProduction ? productionLimit : developmentLimit;
  const testLimit = Number(process.env.RATE_LIMIT_TEST_LIMIT || 0);
  const limit = config.nodeEnv === "test" && namespace !== "portal-ip" && Number.isInteger(testLimit) && testLimit > 0
    ? Math.min(configuredLimit, testLimit)
    : configuredLimit;

  if (config.rateLimitStore === "memory") {
    return rateLimit({
      windowMs,
      limit,
      keyGenerator: (req) => limiterKey(namespace, identity(req)),
      standardHeaders: true,
      legacyHeaders: false,
      message
    });
  }

  return async function distributedRateLimit(req, res, next) {
    try {
      const keyHash = limiterKey(namespace, identity(req));
      const result = config.rateLimitStore === "redis"
        ? await sharedLimiter(namespace, limit, windowMs).limit(keyHash)
        : await postgresLimit(keyHash, limit, windowMs);
      writeHeaders(res, result);
      if (!result.success) return res.status(429).json(message);
      return next();
    } catch (error) {
      // Sensitive operations fail closed if the distributed abuse-control store is unavailable.
      return res.status(503).json({
        message: "Serviço temporariamente indisponível. Tente novamente mais tarde."
      });
    }
  };
}

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: standardMessage
});

const inscriptionLimiter = createSensitiveLimiter({
  namespace: "inscription-ip",
  windowMs: 10 * 60 * 1000,
  productionLimit: 8,
  developmentLimit: 100,
  identity: clientIp
});

const loginLimiter = createSensitiveLimiter({
  namespace: "admin-login-ip",
  windowMs: config.isProduction ? 15 * 60 * 1000 : 60 * 1000,
  productionLimit: 5,
  developmentLimit: 100,
  identity: clientIp,
  message: authenticationMessage
});

const adminCredentialLimiter = createSensitiveLimiter({
  namespace: "admin-login-credential",
  windowMs: config.isProduction ? 15 * 60 * 1000 : 60 * 1000,
  productionLimit: 5,
  developmentLimit: 100,
  identity: (req) => req.body?.username,
  message: authenticationMessage
});

const statusLookupLimiter = createSensitiveLimiter({
  namespace: "portal-ip",
  windowMs: 10 * 60 * 1000,
  productionLimit: 15,
  developmentLimit: 120,
  identity: clientIp,
  message: {
    message: "Muitas consultas em pouco tempo. Tente novamente em alguns minutos."
  }
});

const portalCredentialLimiter = createSensitiveLimiter({
  namespace: "portal-cpf",
  windowMs: config.isProduction ? 15 * 60 * 1000 : 60 * 1000,
  productionLimit: 5,
  developmentLimit: 100,
  identity: (req) => String(req.body?.cpf || "").replace(/\D/g, ""),
  message: authenticationMessage
});

const portalMatriculaLimiter = createSensitiveLimiter({
  namespace: "portal-matricula",
  windowMs: config.isProduction ? 15 * 60 * 1000 : 60 * 1000,
  productionLimit: 5,
  developmentLimit: 100,
  identity: (req) => String(req.body?.matricula || "").trim().toUpperCase(),
  message: authenticationMessage
});

const legacyCredentialLimiter = createSensitiveLimiter({
  namespace: "legacy-status-cpf",
  windowMs: 15 * 60 * 1000,
  productionLimit: 3,
  developmentLimit: 100,
  identity: (req) => String(req.body?.cpf || "").replace(/\D/g, ""),
  message: standardMessage
});

const ticketIpLimiter = createSensitiveLimiter({
  namespace: "ticket-ip",
  windowMs: 10 * 60 * 1000,
  productionLimit: 8,
  developmentLimit: 100,
  identity: clientIp
});

const ticketLimiter = createSensitiveLimiter({
  namespace: "ticket-student",
  windowMs: 10 * 60 * 1000,
  productionLimit: 5,
  developmentLimit: 100,
  identity: (req) => req.student?.sub || "anonymous"
});

const enrollmentCancellationLimiter = createSensitiveLimiter({
  namespace: "enrollment-cancellation-student",
  windowMs: 10 * 60 * 1000,
  productionLimit: 5,
  developmentLimit: 100,
  identity: (req) => req.student?.sub || "anonymous"
});

const attachmentLimiter = createSensitiveLimiter({
  namespace: "ticket-attachment-student",
  windowMs: 10 * 60 * 1000,
  productionLimit: 30,
  developmentLimit: 120,
  identity: (req) => req.student?.sub || "anonymous"
});

const sensitiveIpLimiter = createSensitiveLimiter({
  namespace: "admin-sensitive-ip",
  windowMs: 10 * 60 * 1000,
  productionLimit: 20,
  developmentLimit: 120,
  identity: clientIp
});

const sensitiveActionLimiter = createSensitiveLimiter({
  namespace: "admin-sensitive-user",
  windowMs: 10 * 60 * 1000,
  productionLimit: 10,
  developmentLimit: 120,
  identity: (req) => req.user?.sub || "anonymous"
});

const exportLimiter = createSensitiveLimiter({
  namespace: "admin-export-user",
  windowMs: 10 * 60 * 1000,
  productionLimit: 10,
  developmentLimit: 100,
  identity: (req) => req.user?.sub || "anonymous"
});

const exportIpLimiter = createSensitiveLimiter({
  namespace: "admin-export-ip",
  windowMs: 10 * 60 * 1000,
  productionLimit: 20,
  developmentLimit: 120,
  identity: clientIp
});

const matriculaSendLimiter = createSensitiveLimiter({
  namespace: "matricula-send-user",
  windowMs: 10 * 60 * 1000,
  productionLimit: 10,
  developmentLimit: 100,
  identity: (req) => req.user?.sub || "anonymous"
});

const matriculaSendIpLimiter = createSensitiveLimiter({
  namespace: "matricula-send-ip",
  windowMs: 10 * 60 * 1000,
  productionLimit: 20,
  developmentLimit: 120,
  identity: clientIp
});

const firstAccessListLimiter = createSensitiveLimiter({
  namespace: "first-access-list-user",
  windowMs: 10 * 60 * 1000,
  productionLimit: 80,
  developmentLimit: 150,
  identity: (req) => req.user?.sub || "anonymous"
});

const firstAccessIpLimiter = createSensitiveLimiter({
  namespace: "first-access-ip",
  windowMs: 10 * 60 * 1000,
  productionLimit: 100,
  developmentLimit: 200,
  identity: clientIp
});

const firstAccessActionLimiter = createSensitiveLimiter({
  namespace: "first-access-action-user",
  windowMs: 10 * 60 * 1000,
  productionLimit: 30,
  developmentLimit: 100,
  identity: (req) => req.user?.sub || "anonymous"
});

const firstAccessPdfLimiter = createSensitiveLimiter({
  namespace: "first-access-pdf-user",
  windowMs: 10 * 60 * 1000,
  productionLimit: 5,
  developmentLimit: 20,
  identity: (req) => req.user?.sub || "anonymous"
});

const aiLimiter = createSensitiveLimiter({
  namespace: "ai-ip",
  windowMs: 10 * 60 * 1000,
  productionLimit: 20,
  developmentLimit: 120,
  identity: clientIp,
  message: {
    message: "Muitas consultas de IA em pouco tempo. Tente novamente em alguns minutos."
  }
});

module.exports = {
  generalLimiter,
  inscriptionLimiter,
  loginLimiter,
  adminCredentialLimiter,
  portalCredentialLimiter,
  portalMatriculaLimiter,
  legacyCredentialLimiter,
  ticketIpLimiter,
  ticketLimiter,
  enrollmentCancellationLimiter,
  attachmentLimiter,
  sensitiveIpLimiter,
  sensitiveActionLimiter,
  exportIpLimiter,
  exportLimiter,
  matriculaSendIpLimiter,
  matriculaSendLimiter,
  firstAccessListLimiter,
  firstAccessIpLimiter,
  firstAccessActionLimiter,
  firstAccessPdfLimiter,
  aiLimiter,
  statusLookupLimiter,
  limiterKey
};
