const logger = require("../utils/logger");
const config = require("../config/env");

function notFound(req, res, next) {
  const error = new Error("Rota não encontrada.");
  error.statusCode = 404;
  next(error);
}

function errorHandler(error, req, res, next) {
  let status = error.statusCode || error.status || 500;
  let safeMessage = error.message || "Erro inesperado.";

  if (error.name === "MulterError") {
    status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    safeMessage = error.code === "LIMIT_FILE_SIZE"
      ? "Cada documento deve ter no máximo 5 MB."
      : "Não foi possível receber os documentos enviados.";
  }

  const logMeta = {
    status,
    path: req.originalUrl,
    method: req.method,
    errorMessage: error.message,
    errorCode: error.code,
    constraint: error.constraint
  };

  if (status >= 500) {
    logger.error("Erro na API", {
      ...logMeta,
      stack: error.stack
    });
  } else {
    logger.warn("Requisicao recusada", logMeta);
  }

  if (res.headersSent) return next(error);

  const message = status >= 500 && config.isProduction
    ? "Não foi possível concluir a solicitação."
    : safeMessage;

  return res.status(status).json({
    message
  });
}

module.exports = {
  notFound,
  errorHandler
};
