const crypto = require("crypto");
const db = require("../database/pool");
const { normalizeCpf } = require("../utils/cpf");

const memory = [];

function normalizeOfficeIds(payload = {}) {
  const ids = Array.isArray(payload.oficinaIds) ? payload.oficinaIds : [];
  if (!ids.length && payload.oficinaId) ids.push(payload.oficinaId);
  return Array.from(new Set(ids.filter(Boolean)));
}

async function officeNamesForMemory(oficinaIds) {
  if (!oficinaIds.length) return [];
  const Oficina = require("./oficina.model");
  const oficinas = await Oficina.findAll({ includeInactive: true });
  return oficinaIds
    .map((oficinaId) => oficinas.find((oficina) => oficina.id === oficinaId)?.nome)
    .filter(Boolean);
}

function toPublic(row) {
  const oficinaIds = row.oficina_ids || row.oficinaIds || (row.oficina_id ? [row.oficina_id] : []);
  const oficinas = row.oficinas || (row.oficina_nome ? [row.oficina_nome] : []);
  return {
    id: row.id,
    nome: row.nome,
    cpf: row.cpf || "",
    idade: row.idade === null || row.idade === undefined ? "" : Number(row.idade),
    telefone: row.telefone || "",
    responsavel: row.responsavel || "",
    email: row.email || "",
    oficinaId: oficinaIds[0] || "",
    oficinaIds,
    oficina: oficinas[0] || "",
    oficinas,
    status: row.status || "ativo",
    observacoes: row.observacoes || "",
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function attachOffices(client, alunoId, oficinaIds) {
  await client.query("DELETE FROM aluno_oficinas WHERE aluno_id = $1", [alunoId]);
  for (const oficinaId of oficinaIds) {
    await client.query(
      "INSERT INTO aluno_oficinas (aluno_id, oficina_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [alunoId, oficinaId]
    );
  }
  await client.query("UPDATE alunos SET oficina_id = $1 WHERE id = $2", [oficinaIds[0] || null, alunoId]);
}

async function findAll(filters = {}) {
  const search = String(filters.search || "").toLowerCase();
  const oficinaId = String(filters.oficinaId || filters.oficina_id || "");

  if (!db.hasDatabase) {
    const normalizedSearchPhone = search.replace(/\D/g, "");
    return memory
      .filter((item) => {
        const matchesSearch = !search
          || item.nome.toLowerCase().includes(search)
          || (normalizedSearchPhone && String(item.cpf || "").includes(normalizedSearchPhone))
          || (normalizedSearchPhone && item.telefone.replace(/\D/g, "").includes(normalizedSearchPhone))
          || item.email.toLowerCase().includes(search);
        const matchesOficina = !oficinaId || item.oficina_ids.includes(oficinaId);
        return matchesSearch && matchesOficina;
      })
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map(toPublic);
  }

  const where = [];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    const index = params.length;
    where.push(`(
      LOWER(a.nome) LIKE $${index}
      OR a.cpf LIKE REGEXP_REPLACE($${index}, '\\D', '', 'g')
      OR LOWER(COALESCE(a.email, '')) LIKE $${index}
      OR REGEXP_REPLACE(COALESCE(a.telefone, ''), '\\D', '', 'g') LIKE REGEXP_REPLACE($${index}, '\\D', '', 'g')
    )`);
  }

  if (oficinaId) {
    params.push(oficinaId);
    where.push(`EXISTS (
      SELECT 1 FROM aluno_oficinas filtro
      WHERE filtro.aluno_id = a.id AND filtro.oficina_id = $${params.length}
    )`);
  }

  const result = await db.query(
    `SELECT a.id, a.nome, a.idade, a.telefone, a.responsavel, a.email, a.oficina_id,
            a.cpf, a.status, a.observacoes, a.created_at, a.updated_at,
            COALESCE(
              ARRAY_AGG(ao.oficina_id ORDER BY o.nome) FILTER (WHERE ao.oficina_id IS NOT NULL),
              ARRAY[]::uuid[]
            ) AS oficina_ids,
            COALESCE(
              ARRAY_AGG(o.nome ORDER BY o.nome) FILTER (WHERE o.nome IS NOT NULL),
              ARRAY[]::text[]
            ) AS oficinas
     FROM alunos a
     LEFT JOIN aluno_oficinas ao ON ao.aluno_id = a.id
     LEFT JOIN oficinas o ON o.id = ao.oficina_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY a.id
     ORDER BY a.nome ASC
     LIMIT 800`,
    params
  );

  return result.rows.map(toPublic);
}

async function create(payload) {
  const oficinaIds = normalizeOfficeIds(payload);
  const cpf = normalizeCpf(payload.cpf);

  if (!db.hasDatabase) {
    const existingIndex = cpf ? memory.findIndex((item) => item.cpf === cpf) : -1;
    if (existingIndex !== -1) {
      const oficinas = await officeNamesForMemory(oficinaIds);
      memory[existingIndex] = {
        ...memory[existingIndex],
        nome: payload.nome,
        idade: payload.idade || null,
        telefone: payload.telefone || "",
        responsavel: payload.responsavel || "",
        email: payload.email || "",
        oficina_id: oficinaIds[0] || memory[existingIndex].oficina_id || "",
        oficina_ids: Array.from(new Set([...(memory[existingIndex].oficina_ids || []), ...oficinaIds])),
        oficinas: Array.from(new Set([...(memory[existingIndex].oficinas || []), ...oficinas])),
        status: payload.status || "ativo",
        observacoes: payload.observacoes || "",
        updated_at: new Date().toISOString()
      };
      return toPublic(memory[existingIndex]);
    }

    const now = new Date().toISOString();
    const oficinas = await officeNamesForMemory(oficinaIds);
    const record = {
      id: crypto.randomUUID(),
      nome: payload.nome,
      cpf,
      idade: payload.idade || null,
      telefone: payload.telefone || "",
      responsavel: payload.responsavel || "",
      email: payload.email || "",
      oficina_id: oficinaIds[0] || "",
      oficina_ids: oficinaIds,
      oficinas,
      status: payload.status || "ativo",
      observacoes: payload.observacoes || "",
      created_at: now,
      updated_at: now
    };
    memory.push(record);
    return toPublic(record);
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO alunos (nome, cpf, idade, telefone, responsavel, email, oficina_id, status, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (cpf)
       WHERE cpf IS NOT NULL AND cpf <> ''
       DO UPDATE SET
         nome = EXCLUDED.nome,
         idade = EXCLUDED.idade,
         telefone = EXCLUDED.telefone,
         responsavel = EXCLUDED.responsavel,
         email = EXCLUDED.email,
         status = EXCLUDED.status,
         observacoes = EXCLUDED.observacoes,
         updated_at = NOW()
       RETURNING id`,
      [
        payload.nome,
        cpf || null,
        payload.idade || null,
        payload.telefone || null,
        payload.responsavel || null,
        payload.email || null,
        oficinaIds[0] || null,
        payload.status || "ativo",
        payload.observacoes || null
      ]
    );
    await attachOffices(client, result.rows[0].id, oficinaIds);
    await client.query("COMMIT");
    return (await findAll({ search: payload.nome })).find((item) => item.id === result.rows[0].id);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505" && String(error.constraint || "").includes("cpf")) {
      const conflict = new Error("Este CPF ja esta vinculado a outro aluno.");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function update(id, payload) {
  const oficinaIds = normalizeOfficeIds(payload);
  const cpf = normalizeCpf(payload.cpf);

  if (!db.hasDatabase) {
    const index = memory.findIndex((item) => item.id === id);
    if (index === -1) return null;
    if (cpf && memory.some((item) => item.id !== id && item.cpf === cpf)) {
      const error = new Error("Este CPF ja esta vinculado a outro aluno.");
      error.statusCode = 409;
      throw error;
    }
    const oficinas = await officeNamesForMemory(oficinaIds);
    memory[index] = {
      ...memory[index],
      nome: payload.nome,
      cpf,
      idade: payload.idade || null,
      telefone: payload.telefone || "",
      responsavel: payload.responsavel || "",
      email: payload.email || "",
      oficina_id: oficinaIds[0] || "",
      oficina_ids: oficinaIds,
      oficinas,
      status: payload.status || "ativo",
      observacoes: payload.observacoes || "",
      updated_at: new Date().toISOString()
    };
    return toPublic(memory[index]);
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE alunos
       SET nome = $1,
           cpf = $2,
           idade = $3,
           telefone = $4,
           responsavel = $5,
           email = $6,
           oficina_id = $7,
           status = $8,
           observacoes = $9,
           updated_at = NOW()
       WHERE id = $10
       RETURNING id`,
      [
        payload.nome,
        cpf || null,
        payload.idade || null,
        payload.telefone || null,
        payload.responsavel || null,
        payload.email || null,
        oficinaIds[0] || null,
        payload.status || "ativo",
        payload.observacoes || null,
        id
      ]
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    await attachOffices(client, id, oficinaIds);
    await client.query("COMMIT");
    return (await findAll({ search: payload.nome })).find((item) => item.id === id);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505" && String(error.constraint || "").includes("cpf")) {
      const conflict = new Error("Este CPF ja esta vinculado a outro aluno.");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function remove(id) {
  if (!db.hasDatabase) {
    const index = memory.findIndex((item) => item.id === id);
    if (index === -1) return false;
    memory.splice(index, 1);
    return true;
  }

  const result = await db.query("DELETE FROM alunos WHERE id = $1", [id]);
  return result.rowCount > 0;
}

module.exports = {
  findAll,
  create,
  update,
  remove
};
