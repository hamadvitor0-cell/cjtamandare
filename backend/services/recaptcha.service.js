const config = require("../config/env");
const logger = require("../utils/logger");

function recaptchaConfigError() {
  const error = new Error("reCAPTCHA não configurado.");
  error.statusCode = 500;
  return error;
}

function recaptchaValidationError(message = "Não foi possível validar o reCAPTCHA. Tente novamente.") {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

function requireToken(token) {
  if (!token) {
    throw recaptchaValidationError("Confirme o reCAPTCHA antes de enviar a inscrição.");
  }
}

function validateAssessmentResult({ success, action, score, errorCodes = [], expectedAction }) {
  if (!success) {
    logger.warn("Falha na validação do reCAPTCHA", {
      errors: errorCodes
    });
    throw recaptchaValidationError();
  }

  if (action && action !== expectedAction) {
    logger.warn("Ação inesperada no reCAPTCHA", {
      expectedAction,
      action
    });
    throw recaptchaValidationError("Não foi possível validar a verificação anti-robô. Tente novamente.");
  }

  if (typeof score === "number" && score < config.recaptchaMinScore) {
    logger.warn("Score baixo no reCAPTCHA", {
      score,
      threshold: config.recaptchaMinScore,
      action
    });
    throw recaptchaValidationError("Não foi possível confirmar que o envio é humano. Tente novamente.");
  }
}

async function verifyEnterprise(token, remoteIp, expectedAction) {
  const endpoint = new URL(`https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(config.recaptchaEnterpriseProjectId)}/assessments`);
  endpoint.searchParams.set("key", config.recaptchaEnterpriseApiKey);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      event: {
        token,
        siteKey: config.recaptchaSiteKey,
        expectedAction,
        userIpAddress: remoteIp
      }
    })
  });

  const result = await response.json();
  if (!response.ok) {
    logger.warn("Erro ao criar assessment no reCAPTCHA Enterprise", {
      status: response.status,
      message: result.error?.message,
      reason: result.error?.status
    });
    throw recaptchaValidationError();
  }

  validateAssessmentResult({
    success: Boolean(result.tokenProperties?.valid),
    action: result.tokenProperties?.action,
    score: result.riskAnalysis?.score,
    errorCodes: result.tokenProperties?.invalidReason ? [result.tokenProperties.invalidReason] : [],
    expectedAction
  });

  return true;
}

async function verifyClassic(token, remoteIp, expectedAction) {
  if (!config.recaptchaSecretKey) {
    if (config.isProduction) {
      throw recaptchaConfigError();
    }

    logger.warn("reCAPTCHA sem chave secreta. Verificação ignorada somente em desenvolvimento.");
    return true;
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
  validateAssessmentResult({
    success: Boolean(result.success),
    action: result.action,
    score: result.score,
    errorCodes: result["error-codes"] || [],
    expectedAction
  });

  return true;
}

async function verify(token, remoteIp, expectedAction = "inscricao") {
  requireToken(token);

  if (config.recaptchaEnterpriseProjectId && config.recaptchaEnterpriseApiKey) {
    return verifyEnterprise(token, remoteIp, expectedAction);
  }

  return verifyClassic(token, remoteIp, expectedAction);
}

module.exports = {
  verify
};
