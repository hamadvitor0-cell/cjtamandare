const logger = require("../utils/logger");
const { redactUrl, sensitiveQueryKeys } = require("../utils/redact");

const adminEntryPattern = /^\/admin(?:\.html)?\/?$/;
const honeytrapPatterns = [
  /^\/(?:api\/)?admin\/(?:debug-login|backup|exportar-banco|chave-mestra|config|seed)(?:\/|$)/i,
  /^\/(?:\.env|wp-admin|phpmyadmin|adminer|debug-admin)(?:\/|$)/i
];
const loginTrapFields = ["website", "adminKey", "accessToken", "debugToken", "masterPassword"];

function noStoreAdminHeaders(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
}

function queryKeys(originalUrl) {
  try {
    const url = new URL(originalUrl, "https://local.invalid");
    return sensitiveQueryKeys.filter((key) => url.searchParams.has(key));
  } catch (error) {
    return [];
  }
}

function adminEntryGuard(req, res, next) {
  if (!adminEntryPattern.test(req.path)) return next();

  noStoreAdminHeaders(res);
  const keys = queryKeys(req.originalUrl);
  if (!keys.length) return next();

  logger.warn("Credenciais removidas da URL administrativa", {
    path: req.path,
    queryKeys: keys,
    ip: req.ip,
    userAgent: req.get("user-agent")
  });

  return res.redirect(303, req.path.replace(/\/$/, "") || "/admin");
}

function delayResponse(res, status, body) {
  const delayMs = 350 + Math.floor(Math.random() * 550);
  setTimeout(() => {
    if (!res.headersSent) {
      res.status(status).json(body);
    }
  }, delayMs);
}

function adminHoneytrap(req, res, next) {
  if (!honeytrapPatterns.some((pattern) => pattern.test(req.path))) return next();

  noStoreAdminHeaders(res);
  logger.warn("Isca administrativa acionada", {
    path: redactUrl(req.originalUrl),
    method: req.method,
    ip: req.ip,
    userAgent: req.get("user-agent")
  });

  return delayResponse(res, 404, {
    message: "Modulo administrativo legado indisponivel."
  });
}

function loginHoneypot(req, res, next) {
  const filledFields = loginTrapFields.filter((field) => String(req.body?.[field] || "").trim());
  if (!filledFields.length) return next();

  logger.warn("Honeypot de login acionado", {
    fields: filledFields,
    ip: req.ip,
    userAgent: req.get("user-agent")
  });

  return delayResponse(res, 401, {
    message: "Credenciais invalidas."
  });
}

module.exports = {
  adminEntryGuard,
  adminHoneytrap,
  loginHoneypot,
  noStoreAdminHeaders
};
