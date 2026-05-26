const crypto = require("crypto");
const config = require("../config/env");

function credentialFingerprint(namespace, ...values) {
  const normalized = values
    .map((value) => String(value || "").trim().toLowerCase().replace(/\s+/g, ""))
    .join("|")
    .slice(0, 320);
  return crypto
    .createHmac("sha256", config.rateLimitKeyPepper)
    .update(`${namespace}:${normalized || "empty"}`)
    .digest("hex");
}

function limiterKey(namespace, ...values) {
  return `${namespace}:${credentialFingerprint(namespace, ...values)}`;
}

module.exports = {
  credentialFingerprint,
  limiterKey
};
