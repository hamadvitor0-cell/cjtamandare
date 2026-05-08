const crypto = require("crypto");
const config = require("../config/env");

function csrfCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction || config.cookieSameSite === "none",
    sameSite: config.cookieSameSite,
    signed: true,
    path: "/",
    maxAge: 2 * 60 * 60 * 1000
  };
}

function issueCsrfToken(req, res) {
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie("csrf_token", token, csrfCookieOptions());
  res.json({ csrfToken: token });
}

function requireCsrf(req, res, next) {
  const cookieToken = req.signedCookies.csrf_token;
  const headerToken = req.get("X-CSRF-Token");

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ message: "Requisição recusada por validação de segurança." });
  }

  return next();
}

module.exports = {
  issueCsrfToken,
  requireCsrf
};
