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
  const oficinaCreatedAts = row.oficina_created_ats || row.oficinaCreatedAts || [];
  const oficinaDetalhes = oficinas.map((oficina, index) => ({
    oficina,
    oficinaId: oficinaIds[index] || "",
    createdAt: oficinaCreatedAts[index] || row.created_at,
    source: "aluno"
  }));
  return {
    id: row.id,
    nome: row.nome,
    cpf: row.cpf || "",
    idade: row.idade === null || row.idade === undefined ? "" : Number(row.idade),
    dataNascimento: row.data_nascimento || row.dataNascimento || "",
    telefone: row.telefone || "",
    responsavel: row.responsavel || "",
    contatoResponsavel: row.contato_responsavel || row.contatoResponsavel || "",
    email: row.email || "",
    bairro: row.bairro || "",
    oficinaId: oficinaIds[0] || "",
    oficinaIds,
    oficina: oficinas[0] || "",
    oficinas,
    oficinaDetalhes,
    status: row.status || "ativo",
    documentosPendentes: Boolean(row.documentos_pendentes ?? row.documentosPendentes),
    documentosLinks: row.documentos_links || row.documentosLinks || [],
    condicaoSaude: row.condicao_saude || row.condicaoSaude || "",
    fichaAlerta: row.ficha_alerta || row.fichaAlerta || "",
    advertencias: row.advertencias || "",
    historicoOficinas: row.historico_oficinas || row.historicoOficinas || "",
    faltasUltimos30Dias: Number(row.faltas_ultimos_30_dias ?? row.faltasUltimos30Dias ?? 0),
    ultimasChamadas: Array.isArray(row.ultimas_chamadas) ? row.ultimas_chamadas : (row.ultimasChamadas || []),
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
          || item.email.toLowerCase().includes(search)
          || String(item.bairro || "").toLowerCase().includes(search)
          || String(item.responsavel || "").toLowerCase().includes(search);
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
      OR LOWER(COALESCE(a.bairro, '')) LIKE $${index}
      OR LOWER(COALESCE(a.responsavel, '')) LIKE $${index}
      OR REGEXP_REPLACE(COALESCE(a.telefone, ''), '\\D', '', 'g') LIKE REGEXP_REPLACE($${index}, '\\D', '', 'g')
      OR REGEXP_REPLACE(COALESCE(a.contato_responsavel, ''), '\\D', '', 'g') LIKE REGEXP_REPLACE($${index}, '\\D', '', 'g')
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
    `SELECT a.id, a.nome, a.idade, a.data_nascimento, a.telefone, a.responsavel, a.contato_responsavel, a.email, a.bairro, a.oficina_id,
            a.cpf, a.status, a.documentos_pendentes, a.documentos_links, a.condicao_saude, a.ficha_alerta, a.advertencias, a.historico_oficinas, a.observacoes, a.created_at, a.updated_at,
            (
              SELECT COUNT(*)::int
              FROM presencas p
              INNER JOIN chamadas c ON c.id = p.chamada_id
              WHERE p.aluno_id = a.id
                AND p.status = 'ausente'
                AND c.data_chamada >= CURRENT_DATE - INTERVAL '30 days'
            ) AS faltas_ultimos_30_dias,
            (
              SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'oficina', historico.oficina,
                'data', historico.data_chamada,
                'status', historico.status,
                'observacao', historico.observacao
              ) ORDER BY historico.data_chamada DESC), '[]'::jsonb)
              FROM (
                SELECT o2.nome AS oficina, c2.data_chamada, p2.status, COALESCE(p2.observacao, '') AS observacao
                FROM presencas p2
                INNER JOIN chamadas c2 ON c2.id = p2.chamada_id
                LEFT JOIN oficinas o2 ON o2.id = c2.oficina_id
                WHERE p2.aluno_id = a.id
                ORDER BY c2.data_chamada DESC
                LIMIT 8
              ) historico
            ) AS ultimas_chamadas,
            COALESCE(
              ARRAY_AGG(ao.oficina_id ORDER BY o.nome) FILTER (WHERE ao.oficina_id IS NOT NULL),
              ARRAY[]::uuid[]
            ) AS oficina_ids,
            COALESCE(
              ARRAY_AGG(o.nome ORDER BY o.nome) FILTER (WHERE o.nome IS NOT NULL),
              ARRAY[]::text[]
            ) AS oficinas,
            COALESCE(
              ARRAY_AGG(ao.created_at ORDER BY o.nome) FILTER (WHERE ao.created_at IS NOT NULL),
              ARRAY[]::timestamptz[]
            ) AS oficina_created_ats
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
        data_nascimento: payload.dataNascimento || null,
        telefone: payload.telefone || "",
        responsavel: payload.responsavel || "",
        contato_responsavel: payload.contatoResponsavel || "",
        email: payload.email || "",
        bairro: payload.bairro || "",
        oficina_id: oficinaIds[0] || memory[existingIndex].oficina_id || "",
        oficina_ids: Array.from(new Set([...(memory[existingIndex].oficina_ids || []), ...oficinaIds])),
        oficinas: Array.from(new Set([...(memory[existingIndex].oficinas || []), ...oficinas])),
        status: payload.status || "ativo",
        documentos_pendentes: payload.documentosPendentes ?? memory[existingIndex].documentos_pendentes ?? false,
        documentos_links: payload.documentosLinks || memory[existingIndex].documentos_links || [],
        condicao_saude: payload.condicaoSaude || memory[existingIndex].condicao_saude || "",
        ficha_alerta: payload.fichaAlerta || memory[existingIndex].ficha_alerta || "",
        advertencias: payload.advertencias || memory[existingIndex].advertencias || "",
        historico_oficinas: payload.historicoOficinas || payload.historico_oficinas || memory[existingIndex].historico_oficinas || "",
        observacoes: payload.observacoes || memory[existingIndex].observacoes || "",
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
      data_nascimento: payload.dataNascimento || null,
      telefone: payload.telefone || "",
      responsavel: payload.responsavel || "",
      contato_responsavel: payload.contatoResponsavel || "",
      email: payload.email || "",
      bairro: payload.bairro || "",
      oficina_id: oficinaIds[0] || "",
      oficina_ids: oficinaIds,
      oficinas,
      status: payload.status || "ativo",
      documentos_pendentes: payload.documentosPendentes === true,
      documentos_links: payload.documentosLinks || [],
      condicao_saude: payload.condicaoSaude || "",
      ficha_alerta: payload.fichaAlerta || "",
      advertencias: payload.advertencias || "",
      historico_oficinas: payload.historicoOficinas || payload.historico_oficinas || "",
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

    let alunoId = "";
    let mergedOfficeIds = oficinaIds;
    const existing = cpf
      ? await client.query("SELECT id FROM alunos WHERE cpf = $1 FOR UPDATE", [cpf])
      : { rows: [] };

    if (existing.rows[0]) {
      alunoId = existing.rows[0].id;
      const currentOffices = await client.query(
        "SELECT oficina_id FROM aluno_oficinas WHERE aluno_id = $1",
        [alunoId]
      );
      mergedOfficeIds = Array.from(new Set([
        ...currentOffices.rows.map((row) => row.oficina_id).filter(Boolean),
        ...oficinaIds
      ]));

      await client.query(
        `UPDATE alunos
         SET nome = $1,
             idade = $2,
             data_nascimento = $3,
             telefone = $4,
             responsavel = $5,
             contato_responsavel = $6,
             email = $7,
             bairro = $8,
             oficina_id = $9,
             status = $10,
             documentos_pendentes = $11,
             documentos_links = $12,
             condicao_saude = COALESCE(NULLIF($13, ''), condicao_saude),
             ficha_alerta = COALESCE(NULLIF($14, ''), ficha_alerta),
             advertencias = COALESCE(NULLIF($15, ''), advertencias),
             historico_oficinas = COALESCE(NULLIF($16, ''), historico_oficinas),
             observacoes = COALESCE(NULLIF($17, ''), observacoes),
             updated_at = NOW()
         WHERE id = $18`,
        [
          payload.nome,
          payload.idade || null,
          payload.dataNascimento || null,
          payload.telefone || null,
          payload.responsavel || null,
          payload.contatoResponsavel || null,
          payload.email || null,
          payload.bairro || null,
          mergedOfficeIds[0] || null,
          payload.status || "ativo",
          payload.documentosPendentes === true,
          payload.documentosLinks || [],
          payload.condicaoSaude || null,
          payload.fichaAlerta || null,
          payload.advertencias || null,
          payload.historicoOficinas || payload.historico_oficinas || null,
          payload.observacoes || null,
          alunoId
        ]
      );
    } else {
      const result = await client.query(
        `INSERT INTO alunos (nome, cpf, idade, data_nascimento, telefone, responsavel, contato_responsavel, email, bairro, oficina_id, status, documentos_pendentes, documentos_links, condicao_saude, ficha_alerta, advertencias, historico_oficinas, observacoes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING id`,
        [
          payload.nome,
          cpf || null,
          payload.idade || null,
          payload.dataNascimento || null,
          payload.telefone || null,
          payload.responsavel || null,
          payload.contatoResponsavel || null,
          payload.email || null,
          payload.bairro || null,
          mergedOfficeIds[0] || null,
          payload.status || "ativo",
          payload.documentosPendentes === true,
          payload.documentosLinks || [],
          payload.condicaoSaude || null,
          payload.fichaAlerta || null,
          payload.advertencias || null,
          payload.historicoOficinas || payload.historico_oficinas || null,
          payload.observacoes || null
        ]
      );
      alunoId = result.rows[0].id;
    }

    await attachOffices(client, alunoId, mergedOfficeIds);
    await client.query("COMMIT");
    return (await findAll({ search: payload.nome })).find((item) => item.id === alunoId);
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
      data_nascimento: payload.dataNascimento || null,
      telefone: payload.telefone || "",
      responsavel: payload.responsavel || "",
      contato_responsavel: payload.contatoResponsavel || "",
      email: payload.email || "",
      bairro: payload.bairro || "",
      oficina_id: oficinaIds[0] || "",
      oficina_ids: oficinaIds,
      oficinas,
      status: payload.status || "ativo",
      documentos_pendentes: payload.documentosPendentes === true,
      documentos_links: payload.documentosLinks || [],
      condicao_saude: payload.condicaoSaude || "",
      ficha_alerta: payload.fichaAlerta || "",
      advertencias: payload.advertencias || "",
      historico_oficinas: payload.historicoOficinas || payload.historico_oficinas || "",
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
           data_nascimento = $4,
           telefone = $5,
           responsavel = $6,
           contato_responsavel = $7,
           email = $8,
           bairro = $9,
           oficina_id = $10,
           status = $11,
           documentos_pendentes = $12,
           documentos_links = $13,
           condicao_saude = $14,
           ficha_alerta = $15,
           advertencias = $16,
           historico_oficinas = $17,
           observacoes = $18,
           updated_at = NOW()
       WHERE id = $19
       RETURNING id`,
      [
        payload.nome,
        cpf || null,
        payload.idade || null,
        payload.dataNascimento || null,
        payload.telefone || null,
        payload.responsavel || null,
        payload.contatoResponsavel || null,
        payload.email || null,
        payload.bairro || null,
        oficinaIds[0] || null,
        payload.status || "ativo",
        payload.documentosPendentes === true,
        payload.documentosLinks || [],
        payload.condicaoSaude || null,
        payload.fichaAlerta || null,
        payload.advertencias || null,
        payload.historicoOficinas || payload.historico_oficinas || null,
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

async function syncFromInscricoes(filters = {}) {
  const oficinaId = String(filters.oficinaId || "");
  const cpf = normalizeCpf(filters.cpf || "");

  if (!db.hasDatabase) {
    return { alunosCriados: 0, vinculosCriados: 0, fichasAtualizadas: 0 };
  }

  const params = ["lista_espera"];
  const where = ["NULLIF(REGEXP_REPLACE(COALESCE(i.cpf, ''), '\\D', '', 'g'), '') IS NOT NULL"];

  if (oficinaId) {
    params.push(oficinaId);
    where.push(`o.id = $${params.length}`);
  }

  if (cpf) {
    params.push(cpf);
    where.push(`REGEXP_REPLACE(COALESCE(i.cpf, ''), '\\D', '', 'g') = $${params.length}`);
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `WITH inscricao_oficinas AS (
         SELECT DISTINCT
                i.id AS inscricao_id,
                i.nome,
                REGEXP_REPLACE(COALESCE(i.cpf, ''), '\\D', '', 'g') AS cpf,
                i.idade,
                i.telefone,
                i.responsavel,
                i.email,
                i.observacoes,
                i.created_at,
                o.id AS oficina_id,
                o.nome AS oficina_nome,
                COALESCE((
                  SELECT COUNT(*)::int
                  FROM inscricao_documentos documentos
                  WHERE documentos.inscricao_id = i.id
                ), 0) AS documentos_count
         FROM inscricoes i
         CROSS JOIN LATERAL unnest(
           CASE
             WHEN cardinality(COALESCE(i.oficinas, ARRAY[]::text[])) > 0 THEN i.oficinas
             ELSE ARRAY[i.oficina]
           END
         ) AS oficina_nome(nome)
         INNER JOIN oficinas o ON o.nome = oficina_nome.nome
         WHERE ${where.join(" AND ")}
           AND NOT EXISTS (
             SELECT 1
             FROM jsonb_array_elements(COALESCE(i.oficina_detalhes, '[]'::jsonb)) AS detalhe
             WHERE detalhe->>'oficina' = o.nome
               AND detalhe->>'status' = $1
           )
       ),
       candidate_students AS (
         SELECT DISTINCT ON (cpf)
                nome,
                cpf,
                idade,
                telefone,
                responsavel,
                email,
                oficina_id,
                observacoes,
                documentos_count,
                created_at
         FROM inscricao_oficinas
         ORDER BY cpf, created_at ASC, inscricao_id
       ),
       new_students AS (
         INSERT INTO alunos (
           nome,
           cpf,
           idade,
           telefone,
           responsavel,
           email,
           oficina_id,
           status,
           documentos_pendentes,
           observacoes
         )
         SELECT
           nome,
           cpf,
           idade,
           telefone,
           responsavel,
           email,
           oficina_id,
           'ativo',
           documentos_count = 0,
           observacoes
         FROM candidate_students candidate
         WHERE NOT EXISTS (
           SELECT 1
           FROM alunos existing
           WHERE existing.cpf = candidate.cpf
         )
         RETURNING id, cpf
       ),
       all_students AS (
         SELECT a.id, a.cpf
         FROM alunos a
         WHERE a.cpf IN (SELECT cpf FROM inscricao_oficinas)
         UNION ALL
         SELECT id, cpf
         FROM new_students
       ),
       links AS (
         INSERT INTO aluno_oficinas (aluno_id, oficina_id)
         SELECT DISTINCT all_students.id, inscricao_oficinas.oficina_id
         FROM inscricao_oficinas
         INNER JOIN all_students ON all_students.cpf = inscricao_oficinas.cpf
         ON CONFLICT DO NOTHING
         RETURNING aluno_id
       ),
       primary_updates AS (
         UPDATE alunos a
         SET oficina_id = linked.oficina_id
         FROM (
           SELECT DISTINCT ON (all_students.id)
                  all_students.id AS aluno_id,
                  inscricao_oficinas.oficina_id
           FROM inscricao_oficinas
           INNER JOIN all_students ON all_students.cpf = inscricao_oficinas.cpf
           WHERE EXISTS (
             SELECT 1
             FROM links
             WHERE links.aluno_id = all_students.id
           )
           ORDER BY all_students.id, inscricao_oficinas.created_at ASC, inscricao_oficinas.oficina_nome ASC
         ) linked
         WHERE a.id = linked.aluno_id
           AND a.oficina_id IS NULL
         RETURNING a.id
       )
       SELECT
         (SELECT COUNT(*)::int FROM new_students) AS alunos_criados,
         (SELECT COUNT(*)::int FROM links) AS vinculos_criados,
         (SELECT COUNT(*)::int FROM primary_updates) AS fichas_atualizadas`,
      params
    );
    await client.query("COMMIT");
    const row = result.rows[0] || {};
    return {
      alunosCriados: Number(row.alunos_criados || 0),
      vinculosCriados: Number(row.vinculos_criados || 0),
      fichasAtualizadas: Number(row.fichas_atualizadas || 0)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  findAll,
  create,
  update,
  remove,
  syncFromInscricoes
};
