const path = require("path");
const express = require("express");
const morgan = require("morgan");
const applySecurity = require("./middlewares/security.middleware");
const { adminEntryGuard, adminHoneytrap, noStoreAdminHeaders } = require("./middlewares/admin-security.middleware");
const routes = require("./routes");
const ensureDatabase = require("./database/ensure-database");
const { notFound, errorHandler } = require("./middlewares/error.middleware");
const logger = require("./utils/logger");
const config = require("./config/env");
const { redactUrl } = require("./utils/redact");

const app = express();
const frontendPath = path.resolve(__dirname, "..", "frontend");

applySecurity(app);
app.use(adminEntryGuard);
app.use(adminHoneytrap);
app.use(morgan((tokens, req, res) => [
  tokens.method(req, res),
  redactUrl(req.originalUrl),
  tokens.status(req, res),
  tokens.res(req, res, "content-length") || "-",
  `${tokens["response-time"](req, res)} ms`
].join(" "), { stream: logger.morganStream }));
app.use(async (req, res, next) => {
  try {
    await ensureDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

app.use("/api", routes);
app.use("/api", notFound);
app.use("/", routes);

app.use((req, res, next) => {
  const apiLikePath = /^\/(?:ai|inscricao|inscricoes|auth|csrf-token|captcha|dashboard|oficinas|galeria|colaboradores|depoimentos|faq|alunos|chamadas|suporte|health)(?:\/|$)/.test(req.path)
    || /^\/admin\/.+/.test(req.path);
  if (!apiLikePath) return next();
  return res.status(404).json({ message: "Rota não encontrada." });
});

app.use(express.static(frontendPath, {
  extensions: ["html"],
  maxAge: config.isProduction ? "1d" : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store");
    }
    if (filePath.endsWith("admin.html")) {
      noStoreAdminHeaders(res);
    }
  }
}));

app.get("/admin", (req, res) => {
  res.sendFile(path.join(frontendPath, "admin.html"));
});

app.get("*", (req, res) => {
  if (req.accepts("html")) {
    return res.sendFile(path.join(frontendPath, "index.html"));
  }

  return res.status(404).json({ message: "Rota não encontrada." });
});

app.use(errorHandler);

module.exports = app;
