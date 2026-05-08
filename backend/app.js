const path = require("path");
const express = require("express");
const morgan = require("morgan");
const applySecurity = require("./middlewares/security.middleware");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middlewares/error.middleware");
const logger = require("./utils/logger");
const config = require("./config/env");

const app = express();
const frontendPath = path.resolve(__dirname, "..", "frontend");

applySecurity(app);
app.use(morgan(config.isProduction ? "combined" : "dev", { stream: logger.morganStream }));

app.use("/api", routes);
app.use("/api", notFound);
app.use("/", routes);

app.use(express.static(frontendPath, {
  extensions: ["html"],
  maxAge: config.isProduction ? "1d" : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store");
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
