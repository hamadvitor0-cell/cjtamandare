const app = require("./app");
const config = require("./config/env");
const logger = require("./utils/logger");
const { pool } = require("./database/pool");

const server = app.listen(config.port, () => {
  logger.info(`Servidor iniciado em http://localhost:${config.port}`);
});

function shutdown(signal) {
  logger.info(`Encerrando servidor`, { signal });
  server.close(async () => {
    if (pool) {
      await pool.end();
    }
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
