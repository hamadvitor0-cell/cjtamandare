const fs = require("fs");
const path = require("path");
const db = require("./pool");
const { defaultOficinas } = require("../services/oficina.service");

function initials(nome) {
  return nome
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function defaultDays(oficina) {
  return oficina.diasSemana || [];
}

async function run() {
  if (!db.hasDatabase) {
    console.log("DATABASE_URL ausente. Nada para migrar.");
    return;
  }

  const sql = fs.readFileSync(path.resolve(__dirname, "content-schema.sql"), "utf8");
  await db.query(sql);

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
        defaultDays(oficina),
        oficina.periodo || "a definir",
        oficina.horario,
        "/img/oficinas.png",
        initials(oficina.nome)
      ]
    );
  }

  await db.query(
    `INSERT INTO galeria (titulo, descricao, imagem_url, alt, ordem, ativo)
     SELECT $1, $2, $3, $4, 1, true
     WHERE NOT EXISTS (SELECT 1 FROM galeria WHERE imagem_url = $3)
     UNION ALL
     SELECT $5, $6, $7, $8, 2, true
     WHERE NOT EXISTS (SELECT 1 FROM galeria WHERE imagem_url = $7)`,
    [
      "Oficinas disponíveis",
      "Quadro oficial com lista de oficinas do Centro da Juventude",
      "/img/oficinas.png",
      "Quadro oficial com lista de oficinas do Centro da Juventude",
      "Identidade oficial",
      "Logo oficial do Centro da Juventude Almirante Tamandaré",
      "/img/logo.jpg",
      "Logo oficial do Centro da Juventude Almirante Tamandaré"
    ]
  );

  await db.query(
    `INSERT INTO aluno_oficinas (aluno_id, oficina_id)
     SELECT id, oficina_id
     FROM alunos
     WHERE oficina_id IS NOT NULL
     ON CONFLICT DO NOTHING`
  );

  console.log("Migração de conteúdo concluída.");
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (db.pool) await db.pool.end();
  });
