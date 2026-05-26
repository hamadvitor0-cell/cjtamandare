const bcrypt = require("bcryptjs");
const config = require("../config/env");
const Admin = require("../models/admin.model");
const { pool } = require("./pool");

async function run() {
  const code = String(config.adminRegistrationCode || "").replace(/\D/g, "");
  if (!code) {
    throw new Error("Defina ADMIN_REGISTRATION_CODE com 6 digitos no .env antes de criar o administrador.");
  }

  if (!/^\d{6}$/.test(code)) {
    throw new Error("ADMIN_REGISTRATION_CODE deve ter exatamente 6 digitos.");
  }

  const registrationCodeHash = await bcrypt.hash(code, 12);
  const admin = await Admin.createAdmin({
    name: config.adminName,
    username: config.adminUsername,
    email: config.adminEmail,
    passwordHash: registrationCodeHash,
    registrationCodeHash,
    role: "master",
    overwriteExisting: true
  });

  console.log(`Administrador pronto: ${admin.username || "master"}`);
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (pool) await pool.end();
  });
