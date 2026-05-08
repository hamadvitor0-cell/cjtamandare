const config = require("./env");

const recaptchaOrigins = [
  "https://www.google.com",
  "https://www.gstatic.com",
  "https://recaptcha.google.com",
  "https://www.recaptcha.net"
];
const recaptchaApiOrigins = ["https://recaptchaenterprise.googleapis.com"];

const allowedConnect = ["'self'", ...recaptchaOrigins, ...recaptchaApiOrigins, "https://vlibras.gov.br"];
if (config.corsOrigin) {
  allowedConnect.push(...config.corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean));
}

const directives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-eval'", ...recaptchaOrigins, "https://vlibras.gov.br"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "https://fonts.gstatic.com", "https://vlibras.gov.br"],
  imgSrc: ["'self'", "data:", "https:"],
  connectSrc: allowedConnect,
  frameSrc: ["'self'", ...recaptchaOrigins, "https://maps.google.com", "https://vlibras.gov.br"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"]
};

if (config.isProduction) {
  directives.upgradeInsecureRequests = [];
}

module.exports = {
  helmetOptions: {
    contentSecurityPolicy: {
      useDefaults: true,
      directives
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.isProduction
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        }
      : false,
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin"
    },
    frameguard: {
      action: "deny"
    }
  },
  cookieOptions: {
    httpOnly: true,
    secure: config.isProduction || config.cookieSameSite === "none",
    sameSite: config.cookieSameSite,
    signed: false,
    path: "/"
  }
};
