const { Pool } = require("pg");
const config = require("../config/env");

let pool = null;

function connectionStringWithoutSslMode(connectionString) {
  try {
    const parsedUrl = new URL(connectionString);
    parsedUrl.searchParams.delete("sslmode");
    return parsedUrl.toString();
  } catch (error) {
    return connectionString;
  }
}

if (config.hasDatabase) {
  pool = new Pool({
    connectionString: connectionStringWithoutSslMode(config.databaseUrl),
    ssl: config.pgssl === "require" ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
} else {
  console.warn("[database] DATABASE_URL ausente ou USE_MEMORY_STORE=true. Usando armazenamento em memória para demonstração local.");
}

async function query(text, params = []) {
  if (!pool) {
    throw new Error("Banco PostgreSQL não configurado.");
  }

  try {
    return await pool.query(text, params);
  } catch (error) {
    if (
      config.nodeEnv !== "production"
      && config.pgssl === "require"
      && /server does not support ssl connections/i.test(error.message)
    ) {
      throw new Error("O banco PostgreSQL configurado não aceita SSL. Em desenvolvimento/local, defina PGSSL=false ou PGSSL=auto no .env. Para Supabase, mantenha PGSSL=true.");
    }
    throw error;
  }
}

module.exports = {
  pool,
  query,
  hasDatabase: Boolean(pool)
};
