const rateLimit = require("express-rate-limit");
const config = require("../config/env");

const standardMessage = {
  message: "Muitas requisições em pouco tempo. Tente novamente mais tarde."
};

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: standardMessage
});

const inscriptionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: standardMessage
});

const loginLimiter = rateLimit({
  windowMs: config.isProduction ? 15 * 60 * 1000 : 60 * 1000,
  limit: config.isProduction ? 5 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Não foi possível autenticar agora. Aguarde alguns minutos."
  }
});

module.exports = {
  generalLimiter,
  inscriptionLimiter,
  loginLimiter
};
