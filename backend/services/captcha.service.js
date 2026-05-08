const crypto = require("crypto");
const config = require("../config/env");
const logger = require("../utils/logger");

const TOKEN_VERSION = 1;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const POSITION_MAX = 1000;
const TOLERANCE = 42;
const MIN_SOLVE_TIME_MS = 450;

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload) {
  return crypto
    .createHmac("sha256", config.cookieSecret)
    .update(payload)
    .digest("base64url");
}

function fingerprint(req) {
  const userAgent = req.get("user-agent") || "";
  return crypto.createHash("sha256").update(userAgent).digest("hex").slice(0, 24);
}

function randomInt(min, max) {
  return crypto.randomInt(min, max + 1);
}

function createChallenge(req) {
  const now = Date.now();
  const payload = {
    v: TOKEN_VERSION,
    nonce: crypto.randomBytes(16).toString("base64url"),
    target: randomInt(180, 820),
    y: randomInt(34, 88),
    issuedAt: now,
    expiresAt: now + TOKEN_TTL_MS,
    fingerprint: fingerprint(req)
  };

  const encodedPayload = base64url(JSON.stringify(payload));
  const token = `${encodedPayload}.${sign(encodedPayload)}`;

  return {
    token,
    target: payload.target,
    y: payload.y,
    max: POSITION_MAX,
    tolerance: TOLERANCE,
    pieceSize: 46,
    expiresIn: Math.floor(TOKEN_TTL_MS / 1000)
  };
}

function captchaError(message = "Complete o puzzle anti-robô antes de enviar.") {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

function parseToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    throw captchaError();
  }

  const [encodedPayload, signature] = token.split(".");
  const expectedSignature = sign(encodedPayload);
  const signatureBuffer = Buffer.from(signature || "");
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length
    || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    logger.warn("Puzzle CAPTCHA com assinatura inválida.");
    throw captchaError("Não foi possível validar o puzzle. Atualize e tente novamente.");
  }

  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch (error) {
    throw captchaError("Não foi possível validar o puzzle. Atualize e tente novamente.");
  }
}

function verify({ token, position, moves }, req) {
  const payload = parseToken(token);
  const now = Date.now();
  const solvedPosition = Number(position);
  const movementCount = Number(moves);

  if (payload.v !== TOKEN_VERSION || payload.expiresAt < now) {
    throw captchaError("O puzzle expirou. Atualize a verificação e tente novamente.");
  }

  if (payload.fingerprint !== fingerprint(req)) {
    logger.warn("Puzzle CAPTCHA com navegador diferente do desafio emitido.");
    throw captchaError("Não foi possível validar o puzzle. Atualize e tente novamente.");
  }

  if (!Number.isFinite(solvedPosition) || solvedPosition < 0 || solvedPosition > POSITION_MAX) {
    throw captchaError();
  }

  if (!Number.isFinite(movementCount) || movementCount < 1) {
    throw captchaError("Arraste a peça do puzzle antes de enviar.");
  }

  if (now - payload.issuedAt < MIN_SOLVE_TIME_MS) {
    throw captchaError("A verificação foi rápida demais. Tente novamente com calma.");
  }

  if (Math.abs(solvedPosition - payload.target) > TOLERANCE) {
    throw captchaError("Encaixe a peça do puzzle antes de enviar.");
  }

  return true;
}

module.exports = {
  createChallenge,
  verify
};
