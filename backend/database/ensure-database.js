const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const config = require("../config/env");
const db = require("./pool");
const Admin = require("../models/admin.model");
const { defaultOficinas } = require("../services/oficina.service");

let setupPromise = null;

function initials(nome) {
  return nome
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

async function seedOficinas() {
  for (const oficina of defaultOficinas) {
    await db.query(
      `INSERT INTO oficinas (nome, categoria, descricao, faixa_etaria, dias_semana, periodo, horario, imagem_url, initials, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       ON CONFLICT (nome)
       DO UPDATE SET
         categoria = EXCLUDED.categoria,
         descricao = EXCLUDED.descricao,
         faixa_etaria = EXCLUDED.faixa_etaria,
         dias_semana = CASE WHEN oficinas.dias_semana = '{}' THEN EXCLUDED.dias_semana ELSE oficinas.dias_semana END,
         periodo = CASE WHEN oficinas.periodo = 'a definir' THEN EXCLUDED.periodo ELSE oficinas.periodo END,
         horario = EXCLUDED.horario,
         imagem_url = COALESCE(oficinas.imagem_url, EXCLUDED.imagem_url),
         initials = COALESCE(oficinas.initials, EXCLUDED.initials),
         ativo = true`,
      [
        oficina.nome,
        oficina.categoria,
        oficina.descricao,
        oficina.faixaEtaria,
        oficina.diasSemana || [],
        oficina.periodo || "a definir",
        oficina.horario,
        "/img/oficinas.png",
        initials(oficina.nome)
      ]
    );
  }
}

async function seedGaleria() {
  await db.query(
    `INSERT INTO galeria (titulo, descricao, imagem_url, alt, ordem, ativo)
     SELECT $1, $2, $3, $4, 1, true
     WHERE NOT EXISTS (SELECT 1 FROM galeria WHERE imagem_url = $3)
     UNION ALL
     SELECT $5, $6, $7, $8, 2, true
     WHERE NOT EXISTS (SELECT 1 FROM galeria WHERE imagem_url = $7)`,
    [
      "Oficinas disponiveis",
      "Quadro oficial com lista de oficinas do Centro da Juventude",
      "/img/oficinas.png",
      "Quadro oficial com lista de oficinas do Centro da Juventude",
      "Identidade oficial",
      "Logo oficial do Centro da Juventude Almirante Tamandare",
      "/img/logo.jpg",
      "Logo oficial do Centro da Juventude Almirante Tamandare"
    ]
  );
}

async function seedAdmin() {
  if (!config.adminEmail || !config.adminPassword) return;
  if (config.adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD deve ter pelo menos 12 caracteres.");
  }

  const passwordHash = await bcrypt.hash(config.adminPassword, 12);
  await Admin.createAdmin({
    name: config.adminName,
    email: config.adminEmail,
    passwordHash,
    role: "admin"
  });
}

async function runSetup() {
  const schema = fs.readFileSync(path.resolve(__dirname, "schema.sql"), "utf8");
  const contentSchema = fs.readFileSync(path.resolve(__dirname, "content-schema.sql"), "utf8");

  await db.query(schema);
  await db.query(contentSchema);
  await seedOficinas();
  await seedGaleria();
  await db.query(
    `INSERT INTO aluno_oficinas (aluno_id, oficina_id)
     SELECT id, oficina_id
     FROM alunos
     WHERE oficina_id IS NOT NULL
     ON CONFLICT DO NOTHING`
  );
  await seedAdmin();
}

function ensureDatabase() {
  if (!config.autoMigrate || !db.hasDatabase) return Promise.resolve();
  if (!setupPromise) setupPromise = runSetup();
  return setupPromise;
}

module.exports = ensureDatabase;
