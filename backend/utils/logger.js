const fs = require("fs");
const path = require("path");
const config = require("../config/env");

const logDir = path.resolve(__dirname, "..", "logs");
const accessLog = path.join(logDir, "access.log");
const errorLog = path.join(logDir, "error.log");

function writeFile(file, message) {
  if (!config.logToFile) return;
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFile(file, `${message}\n`, () => {});
}

function format(level, message, meta) {
  return JSON.stringify({
    level,
    message,
    meta,
    timestamp: new Date().toISOString()
  });
}

function info(message, meta = {}) {
  const line = format("info", message, meta);
  console.log(line);
  writeFile(accessLog, line);
}

function warn(message, meta = {}) {
  const line = format("warn", message, meta);
  console.warn(line);
  writeFile(errorLog, line);
}

function error(message, meta = {}) {
  const safeMeta = { ...meta };
  if (config.isProduction) {
    delete safeMeta.stack;
  }
  const line = format("error", message, safeMeta);
  console.error(line);
  writeFile(errorLog, line);
}

module.exports = {
  info,
  warn,
  error,
  morganStream: {
    write(message) {
      info(message.trim());
    }
  }
};
