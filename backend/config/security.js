const config = require("./env");

const allowedConnect = ["'self'"];
if (config.corsOrigin) {
  allowedConnect.push(...config.corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean));
}

const directives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "https://fonts.gstatic.com"],
  imgSrc: ["'self'", "data:", "https:"],
  connectSrc: allowedConnect,
  frameSrc: ["'self'", "https://www.google.com", "https://maps.google.com"],
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
