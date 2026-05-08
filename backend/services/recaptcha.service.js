const config = require("../config/env");
const logger = require("../utils/logger");

async function verify(token, remoteIp) {
  if (!config.recaptchaSecretKey) {
    if (config.isProduction) {
      const error = new Error("reCAPTCHA não configurado.");
      error.statusCode = 500;
      throw error;
    }

    logger.warn("reCAPTCHA sem chave secreta. Verificação ignorada somente em desenvolvimento.");
    return true;
  }

  if (!token) {
    const error = new Error("Confirme o reCAPTCHA antes de enviar a inscrição.");
    error.statusCode = 403;
    throw error;
  }

  const body = new URLSearchParams({
    secret: config.recaptchaSecretKey,
    response: token
  });

  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const result = await response.json();
  if (!result.success) {
    logger.warn("Falha na validação do reCAPTCHA", {
      errors: result["error-codes"] || []
    });
    const error = new Error("Não foi possível validar o reCAPTCHA. Tente novamente.");
    error.statusCode = 403;
    throw error;
  }

  return true;
}

module.exports = {
  verify
};
