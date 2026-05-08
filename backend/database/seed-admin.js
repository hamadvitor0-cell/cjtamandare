const bcrypt = require("bcryptjs");
const config = require("../config/env");
const Admin = require("../models/admin.model");
const { pool } = require("./pool");

async function run() {
  if (!config.adminEmail || !config.adminPassword) {
    throw new Error("Defina ADMIN_EMAIL e ADMIN_PASSWORD no .env antes de criar o administrador.");
  }

  if (config.adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD deve ter pelo menos 12 caracteres.");
  }

  const passwordHash = await bcrypt.hash(config.adminPassword, 12);
  const admin = await Admin.createAdmin({
    name: config.adminName,
    email: config.adminEmail,
    passwordHash,
    role: "admin"
  });

  console.log(`Administrador pronto: ${admin.email}`);
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (pool) await pool.end();
  });
