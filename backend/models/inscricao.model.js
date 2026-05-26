const crypto = require("crypto");
const path = require("path");
const db = require("../database/pool");
const config = require("../config/env");
const { normalizeCpf } = require("../utils/cpf");
const Turma = require("./turma.model");

const memory = [];
const CONFIRMED_STATUS = "confirmada";
const WAITLIST_STATUS = "lista_espera";
let schemaEnsured = false;

async function ensureSchema() {
  if (schemaEnsured || !db.hasDatabase || !config.runtimeDatabaseSetup) return;
  schemaEnsured = true;
  await Turma.summaryByOffice().catch(() => {});
  await db.query(`
    ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS data_nascimento DATE;
    ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS possui_deficiencia BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS deficiencia_descricao TEXT;
    ALTER TABLE inscricoes DROP CONSTRAINT IF EXISTS inscricoes_idade_check;
    ALTER TABLE inscricoes ADD CONSTRAINT inscricoes_idade_check CHECK (idade BETWEEN 0 AND 99);
  `);
}

function normalizeOficinas(payload = {}) {
  const values = Array.isArray(payload.oficinas)
    ? payload.oficinas
    : [payload.oficinas || payload.oficina];
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
}

function mergeOficinas(current = [], incoming = []) {
  return Array.from(new Set([...current, ...incoming].map((item) => String(item || "").trim()).filter(Boolean)));
}

function detailsForOficinas(oficinas = [], createdAt, source = "inscricao", statusByOficina = {}, turmaByOficina = {}) {
  return oficinas.map((oficina) => ({
    oficina,
    createdAt,
    source,
    status: statusByOficina[oficina] || CONFIRMED_STATUS,
    turmaId: turmaByOficina[oficina]?.id || turmaByOficina[oficina]?.turmaId || "",
    turmaNome: turmaByOficina[oficina]?.nome || turmaByOficina[oficina]?.turmaNome || ""
  }));
}

function normalizeOficinaDetalhes(row, oficinas) {
  const rawDetails = Array.isArray(row.oficina_detalhes)
    ? row.oficina_detalhes
    : Array.isArray(row.oficinaDetalhes)
      ? row.oficinaDetalhes
      : [];

  return oficinas.map((oficina) => {
    const detail = rawDetails.find((item) => item.oficina === oficina) || {};
    return {
      oficina,
      createdAt: detail.createdAt || detail.created_at || row.created_at,
      updatedAt: detail.updatedAt || detail.updated_at || row.updated_at,
      source: detail.source || "inscricao",
      status: detail.status || CONFIRMED_STATUS,
      turmaId: detail.turmaId || detail.turma_id || row.turma_id || row.turmaId || "",
      turmaNome: detail.turmaNome || detail.turma_nome || row.turma_nome || row.turmaNome || ""
    };
  });
}

function mergeOficinaDetalhes(currentDetails = [], currentOficinas = [], incomingOficinas = [], now = new Date().toISOString(), statusByOficina = {}, turmaByOficina = {}) {
  const current = normalizeOficinaDetalhes({
    oficina_detalhes: currentDetails,
    created_at: now,
    updated_at: now
  }, currentOficinas);
  const mergedOficinas = mergeOficinas(currentOficinas, incomingOficinas);

  return mergedOficinas.map((oficina) => (
    current.find((detail) => detail.oficina === oficina)
    || {
      oficina,
      createdAt: now,
      updatedAt: now,
      source: "inscricao",
      status: statusByOficina[oficina] || CONFIRMED_STATUS,
      turmaId: turmaByOficina[oficina]?.id || turmaByOficina[oficina]?.turmaId || "",
      turmaNome: turmaByOficina[oficina]?.nome || turmaByOficina[oficina]?.turmaNome || ""
    }
  ));
}

function duplicateCpfError() {
  const error = new Error("Este CPF já possui cadastro para a(s) oficina(s) selecionada(s). Para alterar dados, procure a equipe do Centro da Juventude.");
  error.statusCode = 409;
  return error;
}

function toPublic(row) {
  const documentosCount = Number(row.documentos_count ?? row.documentosCount ?? (row.documentos || []).length ?? 0);
  const oficinas = Array.isArray(row.oficinas) && row.oficinas.length
    ? row.oficinas
    : [row.oficina].filter(Boolean);
  const oficinaDetalhes = normalizeOficinaDetalhes(row, oficinas);
  const listaEspera = oficinaDetalhes
    .filter((detail) => detail.status === WAITLIST_STATUS)
    .map((detail) => detail.oficina);
  const confirmadas = oficinaDetalhes
    .filter((detail) => detail.status !== WAITLIST_STATUS)
    .map((detail) => detail.oficina);

  return {
    id: row.id,
    nome: row.nome,
    cpf: row.cpf || "",
    dataNascimento: row.data_nascimento || row.dataNascimento || "",
    idade: Number(row.idade),
    telefone: row.telefone,
    responsavel: row.responsavel || "",
    email: row.email || "",
    oficina: oficinas.join(", "),
    oficinas,
    oficinaDetalhes,
    turmaId: row.turma_id || row.turmaId || oficinaDetalhes.find((detail) => detail.turmaId)?.turmaId || "",
    turma: row.turma_nome || row.turmaNome || oficinaDetalhes.find((detail) => detail.turmaNome)?.turmaNome || "",
    confirmadas,
    listaEspera,
    emListaEspera: listaEspera.length > 0,
    possuiDeficiencia: Boolean(row.possui_deficiencia ?? row.possuiDeficiencia),
    deficienciaDescricao: row.deficiencia_descricao || row.deficienciaDescricao || "",
    observacoes: row.observacoes || "",
    documentosCount,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function documentFromFile(file, inscricaoId, now = new Date().toISOString()) {
  return {
    id: crypto.randomUUID(),
    inscricao_id: inscricaoId,
    originalName: path.basename(file.originalname || "documento"),
    storedName: file.storedName || `${crypto.randomUUID()}${path.extname(file.originalname || "").toLowerCase()}`,
    mimeType: file.mimetype,
    sizeBytes: Number(file.size || 0),
    storagePath: "postgres",
    fileContent: file.buffer || file.fileContent || null,
    created_at: now
  };
}

function toDocument(row) {
  return {
    id: row.id,
    inscricaoId: row.inscricao_id,
    originalName: row.original_name,
    storedName: row.stored_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    storagePath: row.storage_path,
    fileContent: row.file_content || row.fileContent,
    created_at: row.created_at,
    downloadPath: `/inscricoes/documentos/${row.id}/download`
  };
}

async function waitlistStatusForMemory(oficinas) {
  const Oficina = require("./oficina.model");
  const oficinasCadastradas = await Oficina.findAll({ includeInactive: true });
  return oficinas.reduce((acc, oficina) => {
    const capacidade = oficinasCadastradas.find((item) => item.nome === oficina)?.capacidade || 30;
    const ocupadas = memory.filter((item) => {
      const detalhes = item.oficinaDetalhes || [];
      return detalhes.some((detail) => detail.oficina === oficina && detail.status !== WAITLIST_STATUS);
    }).length;
    acc[oficina] = ocupadas >= capacidade ? WAITLIST_STATUS : CONFIRMED_STATUS;
    return acc;
  }, {});
}

async function enrollmentDecisionForMemory(oficinas, payload = {}) {
  const turmaId = String(payload.turmaId || payload.turma_id || "").trim();
  if (!turmaId) {
    return { statusByOficina: await waitlistStatusForMemory(oficinas), turmaByOficina: {}, turma: null };
  }
  if (oficinas.length !== 1) {
    const error = new Error("Selecione uma unica oficina ao escolher uma turma.");
    error.statusCode = 400;
    throw error;
  }
  const decision = await Turma.validateEnrollment({
    oficinaNome: oficinas[0],
    turmaId,
    idade: payload.idade
  });
  return {
    statusByOficina: { [oficinas[0]]: decision.status },
    turmaByOficina: { [oficinas[0]]: decision.turma },
    turma: decision.turma
  };
}

async function waitlistStatusForDatabase(client, oficinas) {
  if (!oficinas.length) return {};

  const officeResult = await client.query(
    `SELECT nome, capacidade
     FROM oficinas
     WHERE nome = ANY($1)
     FOR UPDATE`,
    [oficinas]
  );
  const capacities = new Map(officeResult.rows.map((row) => [row.nome, Number(row.capacidade || 30)]));
  const statusByOficina = {};

  for (const oficina of oficinas) {
    const capacity = capacities.get(oficina) || 30;
    const occupancy = await client.query(
      `SELECT COUNT(DISTINCT pessoa_key)::int AS total
       FROM (
         SELECT COALESCE(NULLIF(i.cpf, ''), i.id::text) AS pessoa_key
         FROM inscricoes i
         WHERE ($1 = ANY(i.oficinas) OR i.oficina = $1)
           AND NOT EXISTS (
             SELECT 1
             FROM jsonb_array_elements(COALESCE(i.oficina_detalhes, '[]'::jsonb)) AS detalhe
             WHERE detalhe->>'oficina' = $1
               AND detalhe->>'status' = $2
           )
           AND NOT EXISTS (
             SELECT 1
             FROM aluno_oficina_cancelamentos cancelamento
             INNER JOIN alunos cancelado ON cancelado.id = cancelamento.aluno_id
             INNER JOIN oficinas oficina_cancelada ON oficina_cancelada.id = cancelamento.oficina_id
             WHERE cancelado.cpf = REGEXP_REPLACE(COALESCE(i.cpf, ''), '\\D', '', 'g')
               AND oficina_cancelada.nome = $1
           )
         UNION ALL
         SELECT COALESCE(NULLIF(a.cpf, ''), a.id::text) AS pessoa_key
         FROM alunos a
         INNER JOIN aluno_oficinas ao ON ao.aluno_id = a.id
         INNER JOIN oficinas o ON o.id = ao.oficina_id
         WHERE o.nome = $1 AND a.status = 'ativo'
       ) ocupacao`,
      [oficina, WAITLIST_STATUS]
    );
    statusByOficina[oficina] = Number(occupancy.rows[0]?.total || 0) >= capacity
      ? WAITLIST_STATUS
      : CONFIRMED_STATUS;
  }

  return statusByOficina;
}

async function enrollmentDecisionForDatabase(client, oficinas, payload = {}) {
  const turmaId = String(payload.turmaId || payload.turma_id || "").trim();
  if (!turmaId) {
    return { statusByOficina: await waitlistStatusForDatabase(client, oficinas), turmaByOficina: {}, turma: null };
  }
  if (oficinas.length !== 1) {
    const error = new Error("Selecione uma unica oficina ao escolher uma turma.");
    error.statusCode = 400;
    throw error;
  }
  const decision = await Turma.validateEnrollment({
    oficinaNome: oficinas[0],
    turmaId,
    idade: payload.idade
  }, client);
  return {
    statusByOficina: { [oficinas[0]]: decision.status },
    turmaByOficina: { [oficinas[0]]: decision.turma },
    turma: decision.turma
  };
}

async function create(payload, files = []) {
  await ensureSchema();
  const cpf = normalizeCpf(payload.cpf);
  const oficinas = normalizeOficinas(payload);

  if (!db.hasDatabase) {
    const now = new Date().toISOString();
    const existing = memory.find((item) => item.cpf === cpf);

    if (existing) {
      const currentOficinas = existing.oficinas || [existing.oficina].filter(Boolean);
      const newOficinas = oficinas.filter((oficina) => !currentOficinas.includes(oficina));
      if (!newOficinas.length) throw duplicateCpfError();

      const decision = await enrollmentDecisionForMemory(newOficinas, payload);
      const detalhes = mergeOficinaDetalhes(
        existing.oficinaDetalhes,
        currentOficinas,
        oficinas,
        now,
        decision.statusByOficina,
        decision.turmaByOficina
      );
      existing.oficinas = mergeOficinas(currentOficinas, oficinas);
      existing.oficina = existing.oficinas.join(", ");
      existing.oficinaDetalhes = detalhes;
      existing.turmaId = decision.turma?.id || existing.turmaId || "";
      existing.turma = decision.turma?.nome || existing.turma || "";
      existing.nome = payload.nome;
      existing.dataNascimento = payload.dataNascimento || payload.data_nascimento || existing.dataNascimento || "";
      existing.idade = payload.idade;
      existing.telefone = payload.telefone;
      existing.responsavel = payload.responsavel || "";
      existing.email = payload.email || "";
      existing.possuiDeficiencia = payload.possuiDeficiencia ?? payload.possui_deficiencia ?? existing.possuiDeficiencia ?? false;
      existing.deficienciaDescricao = payload.deficienciaDescricao || payload.deficiencia_descricao || existing.deficienciaDescricao || "";
      existing.observacoes = payload.observacoes || existing.observacoes || "";
      existing.updated_at = now;
      const documentos = files.map((file) => documentFromFile(file, existing.id, now));
      existing.documentos = [...(existing.documentos || []), ...documentos];
      existing.documentosCount = existing.documentos.length;
      return toPublic(existing);
    }

    const id = crypto.randomUUID();
    const documentos = files.map((file) => documentFromFile(file, id, now));
    const decision = await enrollmentDecisionForMemory(oficinas, payload);
    const record = toPublic({
      id,
      ...payload,
      cpf,
      oficina: oficinas[0],
      oficinas,
      turmaId: decision.turma?.id || "",
      turma: decision.turma?.nome || "",
      oficinaDetalhes: detailsForOficinas(oficinas, now, "inscricao", decision.statusByOficina, decision.turmaByOficina),
      documentos,
      created_at: now,
      updated_at: now
    });
    record.documentos = documentos;
    memory.unshift(record);
    return record;
  }

  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT id, oficinas, oficina, oficina_detalhes, created_at, updated_at
       FROM inscricoes
       WHERE cpf = $1
       FOR UPDATE`,
      [cpf]
    );

    let row;
    if (existing.rows[0]) {
      const currentOficinas = existing.rows[0].oficinas?.length
        ? existing.rows[0].oficinas
        : [existing.rows[0].oficina].filter(Boolean);
      const newOficinas = oficinas.filter((oficina) => !currentOficinas.includes(oficina));
      if (!newOficinas.length) throw duplicateCpfError();

      const mergedOficinas = mergeOficinas(currentOficinas, oficinas);
      const decision = await enrollmentDecisionForDatabase(client, newOficinas, payload);
      const detalhes = mergeOficinaDetalhes(
        existing.rows[0].oficina_detalhes,
        currentOficinas,
        oficinas,
        new Date().toISOString(),
        decision.statusByOficina,
        decision.turmaByOficina
      );
      const result = await client.query(
        `UPDATE inscricoes
         SET nome = $1,
             data_nascimento = $2,
             idade = $3,
             telefone = $4,
             responsavel = $5,
             email = $6,
             oficina = $7,
             oficinas = $8,
             oficina_detalhes = $9,
             observacoes = $10,
             possui_deficiencia = $11,
             deficiencia_descricao = $12,
             turma_id = COALESCE($13, turma_id),
             updated_at = NOW()
         WHERE id = $14
         RETURNING id, nome, cpf, data_nascimento, idade, telefone, responsavel, email, oficina, oficinas, oficina_detalhes, turma_id, possui_deficiencia, deficiencia_descricao, observacoes, created_at, updated_at`,
        [
          payload.nome,
          payload.dataNascimento || payload.data_nascimento || null,
          payload.idade,
          payload.telefone,
          payload.responsavel || null,
          payload.email || null,
          mergedOficinas[0],
          mergedOficinas,
          JSON.stringify(detalhes),
          payload.observacoes || null,
          payload.possuiDeficiencia ?? payload.possui_deficiencia ?? false,
          payload.deficienciaDescricao || payload.deficiencia_descricao || null,
          decision.turma?.id || null,
          existing.rows[0].id
        ]
      );
      row = result.rows[0];
    } else {
      const decision = await enrollmentDecisionForDatabase(client, oficinas, payload);
      const result = await client.query(
        `INSERT INTO inscricoes
          (nome, cpf, data_nascimento, idade, telefone, responsavel, email, oficina, oficinas, oficina_detalhes, turma_id, observacoes, possui_deficiencia, deficiencia_descricao)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id, nome, cpf, data_nascimento, idade, telefone, responsavel, email, oficina, oficinas, oficina_detalhes, turma_id, possui_deficiencia, deficiencia_descricao, observacoes, created_at, updated_at`,
        [
          payload.nome,
          cpf,
          payload.dataNascimento || payload.data_nascimento || null,
          payload.idade,
          payload.telefone,
          payload.responsavel || null,
          payload.email || null,
          oficinas[0],
          oficinas,
          JSON.stringify(detailsForOficinas(oficinas, new Date().toISOString(), "inscricao", decision.statusByOficina, decision.turmaByOficina)),
          decision.turma?.id || null,
          payload.observacoes || null,
          payload.possuiDeficiencia ?? payload.possui_deficiencia ?? false,
          payload.deficienciaDescricao || payload.deficiencia_descricao || null
        ]
      );
      row = result.rows[0];
    }

    for (const file of files) {
      const storedName = `${crypto.randomUUID()}${path.extname(file.originalname || "").toLowerCase()}`;
      await client.query(
        `INSERT INTO inscricao_documentos
          (inscricao_id, original_name, stored_name, mime_type, size_bytes, storage_path, file_content)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          row.id,
          path.basename(file.originalname || "documento"),
          storedName,
          file.mimetype,
          file.size,
          "postgres",
          file.buffer
        ]
      );
    }

    await client.query("COMMIT");
    const documentosCount = await db.query(
      "SELECT COUNT(*)::int AS total FROM inscricao_documentos WHERE inscricao_id = $1",
      [row.id]
    );
    return toPublic({ ...row, documentos_count: documentosCount.rows[0].total });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505" && String(error.constraint || "").includes("cpf")) {
      throw duplicateCpfError();
    }
    throw error;
  } finally {
    client.release();
  }
}

async function findAll(filters = {}) {
  await ensureSchema();
  const search = String(filters.search || "").toLowerCase();
  const oficina = String(filters.oficina || "");

  if (!db.hasDatabase) {
    const normalizedSearchPhone = search.replace(/\D/g, "");
    return memory
      .filter((item) => {
        const matchesSearch = !search
          || item.nome.toLowerCase().includes(search)
          || (normalizedSearchPhone && String(item.cpf || "").includes(normalizedSearchPhone))
          || item.email.toLowerCase().includes(search)
          || (normalizedSearchPhone && item.telefone.replace(/\D/g, "").includes(normalizedSearchPhone));
        const matchesOficina = !oficina || (item.oficinas || [item.oficina]).includes(oficina);
        return matchesSearch && matchesOficina;
      })
      .map(toPublic);
  }

  const where = [];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    const index = params.length;
    where.push(`(
      LOWER(inscricoes.nome) LIKE $${index}
      OR inscricoes.cpf LIKE REGEXP_REPLACE($${index}, '\\D', '', 'g')
      OR LOWER(COALESCE(inscricoes.email, '')) LIKE $${index}
      OR LOWER(COALESCE(turma_atual.nome, '')) LIKE $${index}
      OR REGEXP_REPLACE(inscricoes.telefone, '\\D', '', 'g') LIKE REGEXP_REPLACE($${index}, '\\D', '', 'g')
    )`);
  }

  if (oficina) {
    params.push(oficina);
    where.push(`($${params.length} = ANY(oficinas) OR oficina = $${params.length})`);
  }

  const sql = `
    SELECT
      inscricoes.id,
      inscricoes.nome,
      inscricoes.cpf,
      inscricoes.data_nascimento,
      inscricoes.idade,
      inscricoes.telefone,
      inscricoes.responsavel,
      inscricoes.email,
      inscricoes.oficina,
      inscricoes.oficinas,
      inscricoes.oficina_detalhes,
      inscricoes.turma_id,
      turma_atual.nome AS turma_nome,
      inscricoes.possui_deficiencia,
      inscricoes.deficiencia_descricao,
      inscricoes.observacoes,
      inscricoes.created_at,
      inscricoes.updated_at,
      COALESCE((
        SELECT COUNT(*)::int
        FROM inscricao_documentos documentos
        WHERE documentos.inscricao_id = inscricoes.id
      ), 0) AS documentos_count
    FROM inscricoes
    LEFT JOIN turmas turma_atual ON turma_atual.id = inscricoes.turma_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY inscricoes.created_at DESC
    LIMIT 500
  `;

  const result = await db.query(sql, params);
  return result.rows.map(toPublic);
}

async function update(id, payload) {
  await ensureSchema();
  const cpf = payload.cpf === undefined ? undefined : normalizeCpf(payload.cpf);
  const oficinas = normalizeOficinas(payload);
  const turmaId = String(payload.turmaId || payload.turma_id || "").trim();

  if (!db.hasDatabase) {
    const index = memory.findIndex((item) => item.id === id);
    if (index === -1) return null;
    if (cpf && memory.some((item) => item.id !== id && item.cpf === cpf)) {
      throw duplicateCpfError();
    }
    const decision = turmaId ? await enrollmentDecisionForMemory(oficinas.length ? oficinas : memory[index].oficinas || [], payload) : { statusByOficina: {}, turmaByOficina: {}, turma: null };
    memory[index] = toPublic({
      ...memory[index],
      ...payload,
      cpf: cpf || memory[index].cpf || "",
      oficina: oficinas[0] || memory[index].oficina,
      oficinas: oficinas.length ? oficinas : memory[index].oficinas,
      oficinaDetalhes: oficinas.length
        ? mergeOficinaDetalhes(memory[index].oficinaDetalhes, memory[index].oficinas, oficinas, new Date().toISOString(), decision.statusByOficina, decision.turmaByOficina)
        : memory[index].oficinaDetalhes,
      turmaId: decision.turma?.id || memory[index].turmaId || "",
      turma: decision.turma?.nome || memory[index].turma || "",
      documentosCount: memory[index].documentosCount || 0,
      updated_at: new Date().toISOString()
    });
    return memory[index];
  }

  let result;
  try {
    const existing = await db.query(
      "SELECT oficinas, oficina, oficina_detalhes FROM inscricoes WHERE id = $1",
      [id]
    );
    const existingOficinas = existing.rows[0]?.oficinas?.length
      ? existing.rows[0].oficinas
      : [existing.rows[0]?.oficina].filter(Boolean);
    const nextOficinas = oficinas.length ? oficinas : [payload.oficina].filter(Boolean);
    const decision = turmaId ? await enrollmentDecisionForDatabase(db, nextOficinas, payload) : { statusByOficina: {}, turmaByOficina: {}, turma: null };
    const detalhes = mergeOficinaDetalhes(
      existing.rows[0]?.oficina_detalhes || [],
      existingOficinas,
      nextOficinas,
      new Date().toISOString(),
      decision.statusByOficina,
      decision.turmaByOficina
    );

    result = await db.query(
      `UPDATE inscricoes
       SET nome = $1,
           cpf = COALESCE($2, cpf),
           data_nascimento = COALESCE($3, data_nascimento),
           idade = $4,
           telefone = $5,
           responsavel = $6,
           email = $7,
           oficina = $8,
           oficinas = $9,
           oficina_detalhes = $10,
           observacoes = $11,
           possui_deficiencia = $12,
           deficiencia_descricao = $13,
           turma_id = COALESCE($14, turma_id),
           updated_at = NOW()
       WHERE id = $15
       RETURNING
         id,
         nome,
         cpf,
          data_nascimento,
         idade,
         telefone,
         responsavel,
         email,
         oficina,
         oficinas,
         oficina_detalhes,
         turma_id,
         possui_deficiencia,
         deficiencia_descricao,
         observacoes,
         created_at,
         updated_at,
         COALESCE((
           SELECT COUNT(*)::int
           FROM inscricao_documentos documentos
           WHERE documentos.inscricao_id = inscricoes.id
         ), 0) AS documentos_count`,
      [
        payload.nome,
        cpf || null,
        payload.dataNascimento || payload.data_nascimento || null,
        payload.idade,
        payload.telefone,
        payload.responsavel || null,
        payload.email || null,
        nextOficinas[0] || payload.oficina,
        nextOficinas,
        JSON.stringify(detalhes),
        payload.observacoes || null,
        payload.possuiDeficiencia ?? payload.possui_deficiencia ?? false,
        payload.deficienciaDescricao || payload.deficiencia_descricao || null,
        decision.turma?.id || null,
        id
      ]
    );
  } catch (error) {
    if (error.code === "23505" && String(error.constraint || "").includes("cpf")) {
      throw duplicateCpfError();
    }
    throw error;
  }

  return result.rows[0] ? toPublic(result.rows[0]) : null;
}

async function remove(id) {
  if (!db.hasDatabase) {
    const index = memory.findIndex((item) => item.id === id);
    if (index === -1) return false;
    memory.splice(index, 1);
    return true;
  }

  const result = await db.query("DELETE FROM inscricoes WHERE id = $1", [id]);

  return result.rowCount > 0;
}

async function findDocuments(inscricaoId) {
  if (!db.hasDatabase) {
    return memory
      .find((item) => item.id === inscricaoId)
      ?.documentos
      ?.map((item) => toDocument({
        id: item.id,
        inscricao_id: item.inscricao_id,
        original_name: item.originalName,
        stored_name: item.storedName,
        mime_type: item.mimeType,
        size_bytes: item.sizeBytes,
        storage_path: item.storagePath,
        file_content: item.fileContent,
        created_at: item.created_at
      })) || [];
  }

  const result = await db.query(
    `SELECT id, inscricao_id, original_name, stored_name, mime_type, size_bytes, storage_path, created_at
     FROM inscricao_documentos
     WHERE inscricao_id = $1
     ORDER BY created_at ASC`,
    [inscricaoId]
  );

  return result.rows.map(toDocument);
}

async function findDocument(documentId) {
  if (!db.hasDatabase) {
    const document = memory.flatMap((item) => item.documentos || []).find((item) => item.id === documentId);
    if (!document) return null;
    return toDocument({
      id: document.id,
      inscricao_id: document.inscricao_id,
      original_name: document.originalName,
      stored_name: document.storedName,
      mime_type: document.mimeType,
      size_bytes: document.sizeBytes,
      storage_path: document.storagePath,
      file_content: document.fileContent,
      created_at: document.created_at
    });
  }

  const result = await db.query(
    `SELECT id, inscricao_id, original_name, stored_name, mime_type, size_bytes, storage_path, file_content, created_at
     FROM inscricao_documentos
     WHERE id = $1`,
    [documentId]
  );

  return result.rows[0] ? toDocument(result.rows[0]) : null;
}

async function findDocumentsForArchive(filters = {}) {
  const search = String(filters.search || "").toLowerCase();
  const oficina = String(filters.oficina || "");
  const inscricaoId = String(filters.inscricaoId || "");

  if (!db.hasDatabase) {
    const normalizedSearchPhone = search.replace(/\D/g, "");
    return memory
      .filter((item) => {
        const matchesId = !inscricaoId || item.id === inscricaoId;
        const matchesSearch = !search
          || item.nome.toLowerCase().includes(search)
          || (normalizedSearchPhone && String(item.cpf || "").includes(normalizedSearchPhone))
          || item.email.toLowerCase().includes(search)
          || (normalizedSearchPhone && item.telefone.replace(/\D/g, "").includes(normalizedSearchPhone));
        const matchesOficina = !oficina || (item.oficinas || [item.oficina]).includes(oficina);
        return matchesId && matchesSearch && matchesOficina;
      })
      .flatMap((item) => (item.documentos || []).map((documento) => ({
        ...toDocument({
          id: documento.id,
          inscricao_id: item.id,
          original_name: documento.originalName,
          stored_name: documento.storedName,
          mime_type: documento.mimeType,
          size_bytes: documento.sizeBytes,
          storage_path: documento.storagePath,
          file_content: documento.fileContent,
          created_at: documento.created_at
        }),
        nome: item.nome,
        cpf: item.cpf,
        oficina: (item.oficinas || [item.oficina]).join(", ")
      })));
  }

  const where = ["d.file_content IS NOT NULL"];
  const params = [];

  if (inscricaoId) {
    params.push(inscricaoId);
    where.push(`i.id = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    const index = params.length;
    where.push(`(
      LOWER(i.nome) LIKE $${index}
      OR i.cpf LIKE REGEXP_REPLACE($${index}, '\\D', '', 'g')
      OR LOWER(COALESCE(i.email, '')) LIKE $${index}
      OR REGEXP_REPLACE(i.telefone, '\\D', '', 'g') LIKE REGEXP_REPLACE($${index}, '\\D', '', 'g')
    )`);
  }

  if (oficina) {
    params.push(oficina);
    where.push(`($${params.length} = ANY(i.oficinas) OR i.oficina = $${params.length})`);
  }

  const result = await db.query(
    `SELECT
       d.id, d.inscricao_id, d.original_name, d.stored_name, d.mime_type, d.size_bytes,
       d.storage_path, d.file_content, d.created_at,
       i.nome, i.cpf, COALESCE(NULLIF(array_to_string(i.oficinas, ', '), ''), i.oficina) AS oficina
     FROM inscricao_documentos d
     INNER JOIN inscricoes i ON i.id = d.inscricao_id
     WHERE ${where.join(" AND ")}
     ORDER BY i.nome ASC, d.created_at ASC
     LIMIT 800`,
    params
  );

  return result.rows.map((row) => ({
    ...toDocument(row),
    nome: row.nome,
    cpf: row.cpf,
    oficina: row.oficina
  }));
}

async function stats() {
  if (!db.hasDatabase) {
    const byOficina = memory.reduce((acc, item) => {
      acc[item.oficina] = (acc[item.oficina] || 0) + 1;
      return acc;
    }, {});
    return {
      total: memory.length,
      porOficina: Object.entries(byOficina).map(([oficina, total]) => ({ oficina, total })),
      recentes: memory.slice(0, 5).map(toPublic)
    };
  }

  const [total, porOficina, recentes] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS total FROM inscricoes"),
    db.query("SELECT oficina, COUNT(*)::int AS total FROM inscricoes GROUP BY oficina ORDER BY total DESC, oficina ASC"),
    db.query(`SELECT
                id,
                nome,
                cpf,
                data_nascimento,
                idade,
                telefone,
                responsavel,
                email,
                oficina,
                oficinas,
                oficina_detalhes,
                observacoes,
                created_at,
                updated_at,
                COALESCE((
                  SELECT COUNT(*)::int
                  FROM inscricao_documentos documentos
                  WHERE documentos.inscricao_id = inscricoes.id
                ), 0) AS documentos_count
              FROM inscricoes
              ORDER BY created_at DESC
              LIMIT 5`)
  ]);

  return {
    total: total.rows[0].total,
    porOficina: porOficina.rows,
    recentes: recentes.rows.map(toPublic)
  };
}

module.exports = {
  create,
  findAll,
  update,
  remove,
  findDocuments,
  findDocument,
  findDocumentsForArchive,
  stats
};
