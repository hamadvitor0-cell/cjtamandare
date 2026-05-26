const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const config = require("../config/env");
const { helmetOptions } = require("../config/security");
const { generalLimiter } = require("./rateLimit.middleware");

function parseOrigins() {
  const configured = config.corsOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!config.isProduction) {
    configured.push(
      `http://localhost:${config.port}`,
      `http://127.0.0.1:${config.port}`,
      "http://localhost:5500",
      "http://127.0.0.1:5500",
      "http://localhost:5501",
      "http://127.0.0.1:5501",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:8080",
      "http://127.0.0.1:8080"
    );
  }

  return Array.from(new Set(configured));
}

function applySecurity(app) {
  if (config.trustProxy || config.isProduction) {
    app.set("trust proxy", 1);
  }

  app.disable("x-powered-by");
  app.use(helmet(helmetOptions));
  app.use(cors({
    origin(origin, callback) {
      const allowed = parseOrigins();
      if (!origin || (!config.isProduction && origin === "null") || allowed.includes(origin)) return callback(null, true);
      const error = new Error("Origem não autorizada por CORS.");
      error.statusCode = 403;
      return callback(error);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token"]
  }));
  app.use(cookieParser(config.cookieSecret));
  app.use(express.json({ limit: "32kb" }));
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
  app.use(generalLimiter);
}

module.exports = applySecurity;
