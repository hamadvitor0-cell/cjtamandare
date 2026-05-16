const crypto = require("crypto");
const path = require("path");
const db = require("../database/pool");
const { normalizeCpf } = require("../utils/cpf");

const memory = [];
const CONFIRMED_STATUS = "confirmada";
const WAITLIST_STATUS = "lista_espera";

function normalizeOficinas(payload = {}) {
  const values = Array.isArray(payload.oficinas)
    ? payload.oficinas
    : [payload.oficinas || payload.oficina];
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
}

function mergeOficinas(current = [], incoming = []) {
  return Array.from(new Set([...current, ...incoming].map((item) => String(item || "").trim()).filter(Boolean)));
}

function detailsForOficinas(oficinas = [], createdAt, source = "inscricao", statusByOficina = {}) {
  return oficinas.map((oficina) => ({
    oficina,
    createdAt,
    source,
    status: statusByOficina[oficina] || CONFIRMED_STATUS
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
      status: detail.status || CONFIRMED_STATUS
    };
  });
}

function mergeOficinaDetalhes(currentDetails = [], currentOficinas = [], incomingOficinas = [], now = new Date().toISOString(), statusByOficina = {}) {
  const current = normalizeOficinaDetalhes({
    oficina_detalhes: currentDetails,
    created_at: now,
    updated_at: now
  }, currentOficinas);
  const mergedOficinas = mergeOficinas(currentOficinas, incomingOficinas);

  return mergedOficinas.map((oficina) => (
    current.find((detail) => detail.oficina === oficina)
    || { oficina, createdAt: now, updatedAt: now, source: "inscricao", status: statusByOficina[oficina] || CONFIRMED_STATUS }
  ));
}

function duplicateCpfError() {
  const error = new Error("Este CPF ja possui cadastro para a(s) oficina(s) selecionada(s). Para alterar dados, procure a equipe do Centro da Juventude.");
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
    idade: Number(row.idade),
    telefone: row.telefone,
    responsavel: row.responsavel || "",
    contatoResponsavel: row.contato_responsavel || row.contatoResponsavel || "",
    email: row.email || "",
    dataNascimento: row.data_nascimento || row.dataNascimento || "",
    bairro: row.bairro || "",
    possuiDoenca: Boolean(row.possui_doenca ?? row.possuiDoenca),
    condicaoSaude: row.condicao_saude || row.condicaoSaude || "",
    oficina: oficinas.join(", "),
    oficinas,
    oficinaDetalhes,
    confirmadas,
    listaEspera,
    emListaEspera: listaEspera.length > 0,
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

async function create(payload, files = []) {
  const cpf = normalizeCpf(payload.cpf);
  const oficinas = normalizeOficinas(payload);

  if (!db.hasDatabase) {
    const now = new Date().toISOString();
    const existing = memory.find((item) => item.cpf === cpf);

    if (existing) {
      const currentOficinas = existing.oficinas || [existing.oficina].filter(Boolean);
      const newOficinas = oficinas.filter((oficina) => !currentOficinas.includes(oficina));
      if (!newOficinas.length) throw duplicateCpfError();

      const statusByOficina = await waitlistStatusForMemory(newOficinas);
      const detalhes = mergeOficinaDetalhes(existing.oficinaDetalhes, currentOficinas, oficinas, now, statusByOficina);
      existing.oficinas = mergeOficinas(currentOficinas, oficinas);
      existing.oficina = existing.oficinas.join(", ");
      existing.oficinaDetalhes = detalhes;
      existing.nome = payload.nome;
      existing.idade = payload.idade;
      existing.telefone = payload.telefone;
      existing.responsavel = payload.responsavel || "";
      existing.contatoResponsavel = payload.contatoResponsavel || "";
      existing.email = payload.email || "";
      existing.dataNascimento = payload.dataNascimento || "";
      existing.bairro = payload.bairro || "";
      existing.possuiDoenca = payload.possuiDoenca === true;
      existing.condicaoSaude = payload.condicaoSaude || "";
      existing.observacoes = payload.observacoes || existing.observacoes || "";
      existing.updated_at = now;
      const documentos = files.map((file) => documentFromFile(file, existing.id, now));
      existing.documentos = [...(existing.documentos || []), ...documentos];
      existing.documentosCount = existing.documentos.length;
      return toPublic(existing);
    }

    const id = crypto.randomUUID();
    const documentos = files.map((file) => documentFromFile(file, id, now));
    const statusByOficina = await waitlistStatusForMemory(oficinas);
    const record = toPublic({
      id,
      ...payload,
      cpf,
      oficina: oficinas[0],
      oficinas,
      oficinaDetalhes: detailsForOficinas(oficinas, now, "inscricao", statusByOficina),
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
      const statusByOficina = await waitlistStatusForDatabase(client, newOficinas);
      const detalhes = mergeOficinaDetalhes(
        existing.rows[0].oficina_detalhes,
        currentOficinas,
        oficinas,
        new Date().toISOString(),
        statusByOficina
      );
      const result = await client.query(
        `UPDATE inscricoes
         SET nome = $1,
             idade = $2,
             data_nascimento = $3,
             telefone = $4,
             responsavel = $5,
             contato_responsavel = $6,
             email = $7,
             bairro = $8,
             oficina = $9,
             oficinas = $10,
             oficina_detalhes = $11,
             possui_doenca = $12,
             condicao_saude = $13,
             observacoes = $14,
             updated_at = NOW()
         WHERE id = $15
         RETURNING id, nome, cpf, idade, data_nascimento, telefone, responsavel, contato_responsavel, email, bairro, oficina, oficinas, oficina_detalhes, possui_doenca, condicao_saude, observacoes, created_at, updated_at`,
        [
          payload.nome,
          payload.idade,
          payload.dataNascimento || null,
          payload.telefone,
          payload.responsavel || null,
          payload.contatoResponsavel || null,
          payload.email || null,
          payload.bairro || null,
          mergedOficinas[0],
          mergedOficinas,
          JSON.stringify(detalhes),
          payload.possuiDoenca === true,
          payload.condicaoSaude || null,
          payload.observacoes || null,
          existing.rows[0].id
        ]
      );
      row = result.rows[0];
    } else {
      const statusByOficina = await waitlistStatusForDatabase(client, oficinas);
      const result = await client.query(
        `INSERT INTO inscricoes
          (nome, cpf, idade, data_nascimento, telefone, responsavel, contato_responsavel, email, bairro, oficina, oficinas, oficina_detalhes, possui_doenca, condicao_saude, observacoes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id, nome, cpf, idade, data_nascimento, telefone, responsavel, contato_responsavel, email, bairro, oficina, oficinas, oficina_detalhes, possui_doenca, condicao_saude, observacoes, created_at, updated_at`,
        [
          payload.nome,
          cpf,
          payload.idade,
          payload.dataNascimento || null,
          payload.telefone,
          payload.responsavel || null,
          payload.contatoResponsavel || null,
          payload.email || null,
          payload.bairro || null,
          oficinas[0],
          oficinas,
          JSON.stringify(detailsForOficinas(oficinas, new Date().toISOString(), "inscricao", statusByOficina)),
          payload.possuiDoenca === true,
          payload.condicaoSaude || null,
          payload.observacoes || null
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
      LOWER(nome) LIKE $${index}
      OR cpf LIKE REGEXP_REPLACE($${index}, '\\D', '', 'g')
      OR LOWER(COALESCE(email, '')) LIKE $${index}
      OR REGEXP_REPLACE(telefone, '\\D', '', 'g') LIKE REGEXP_REPLACE($${index}, '\\D', '', 'g')
    )`);
  }

  if (oficina) {
    params.push(oficina);
    where.push(`($${params.length} = ANY(oficinas) OR oficina = $${params.length})`);
  }

  const sql = `
    SELECT
      id,
      nome,
      cpf,
      idade,
      telefone,
      responsavel,
      contato_responsavel,
      email,
      data_nascimento,
      bairro,
      oficina,
      oficinas,
      oficina_detalhes,
      possui_doenca,
      condicao_saude,
      observacoes,
      created_at,
      updated_at,
      COALESCE((
        SELECT COUNT(*)::int
        FROM inscricao_documentos documentos
        WHERE documentos.inscricao_id = inscricoes.id
      ), 0) AS documentos_count
    FROM inscricoes
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC
    LIMIT 500
  `;

  const result = await db.query(sql, params);
  return result.rows.map(toPublic);
}

async function update(id, payload) {
  const cpf = payload.cpf === undefined ? undefined : normalizeCpf(payload.cpf);
  const oficinas = normalizeOficinas(payload);

  if (!db.hasDatabase) {
    const index = memory.findIndex((item) => item.id === id);
    if (index === -1) return null;
    if (cpf && memory.some((item) => item.id !== id && item.cpf === cpf)) {
      throw duplicateCpfError();
    }
    memory[index] = toPublic({
      ...memory[index],
      ...payload,
      cpf: cpf || memory[index].cpf || "",
      oficina: oficinas[0] || memory[index].oficina,
      oficinas: oficinas.length ? oficinas : memory[index].oficinas,
      oficinaDetalhes: oficinas.length
        ? mergeOficinaDetalhes(memory[index].oficinaDetalhes, memory[index].oficinas, oficinas, new Date().toISOString())
        : memory[index].oficinaDetalhes,
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
    const detalhes = mergeOficinaDetalhes(
      existing.rows[0]?.oficina_detalhes || [],
      existingOficinas,
      nextOficinas,
      new Date().toISOString()
    );

    result = await db.query(
      `UPDATE inscricoes
       SET nome = $1,
           cpf = COALESCE($2, cpf),
           idade = $3,
           data_nascimento = $4,
           telefone = $5,
           responsavel = $6,
           contato_responsavel = $7,
           email = $8,
           bairro = $9,
           oficina = $10,
           oficinas = $11,
           oficina_detalhes = $12,
           possui_doenca = $13,
           condicao_saude = $14,
           observacoes = $15,
           updated_at = NOW()
       WHERE id = $16
       RETURNING
         id,
         nome,
         cpf,
         idade,
         data_nascimento,
         telefone,
         responsavel,
         contato_responsavel,
         email,
         bairro,
         oficina,
         oficinas,
         oficina_detalhes,
         possui_doenca,
         condicao_saude,
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
        payload.idade,
        payload.dataNascimento || null,
        payload.telefone,
        payload.responsavel || null,
        payload.contatoResponsavel || null,
        payload.email || null,
        payload.bairro || null,
        nextOficinas[0] || payload.oficina,
        nextOficinas,
        JSON.stringify(detalhes),
        payload.possuiDoenca === true,
        payload.condicaoSaude || null,
        payload.observacoes || null,
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
                idade,
                data_nascimento,
                telefone,
                responsavel,
                contato_responsavel,
                email,
                bairro,
                oficina,
                oficinas,
                oficina_detalhes,
                possui_doenca,
                condicao_saude,
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
