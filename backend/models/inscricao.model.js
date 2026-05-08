const crypto = require("crypto");
const path = require("path");
const db = require("../database/pool");

const memory = [];

function toPublic(row) {
  const documentosCount = Number(row.documentos_count ?? row.documentosCount ?? (row.documentos || []).length ?? 0);

  return {
    id: row.id,
    nome: row.nome,
    idade: Number(row.idade),
    telefone: row.telefone,
    responsavel: row.responsavel || "",
    email: row.email || "",
    oficina: row.oficina,
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

async function create(payload, files = []) {
  if (!db.hasDatabase) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const documentos = files.map((file) => documentFromFile(file, id, now));
    const record = toPublic({
      id,
      ...payload,
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
    const result = await client.query(
      `INSERT INTO inscricoes
        (nome, idade, telefone, responsavel, email, oficina, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, nome, idade, telefone, responsavel, email, oficina, observacoes, created_at, updated_at`,
      [
        payload.nome,
        payload.idade,
        payload.telefone,
        payload.responsavel || null,
        payload.email || null,
        payload.oficina,
        payload.observacoes || null
      ]
    );

    const row = result.rows[0];
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
    return toPublic({ ...row, documentos_count: files.length });
  } catch (error) {
    await client.query("ROLLBACK");
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
          || item.email.toLowerCase().includes(search)
          || (normalizedSearchPhone && item.telefone.replace(/\D/g, "").includes(normalizedSearchPhone));
        const matchesOficina = !oficina || item.oficina === oficina;
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
      OR LOWER(COALESCE(email, '')) LIKE $${index}
      OR REGEXP_REPLACE(telefone, '\\D', '', 'g') LIKE REGEXP_REPLACE($${index}, '\\D', '', 'g')
    )`);
  }

  if (oficina) {
    params.push(oficina);
    where.push(`oficina = $${params.length}`);
  }

  const sql = `
    SELECT
      id,
      nome,
      idade,
      telefone,
      responsavel,
      email,
      oficina,
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
  if (!db.hasDatabase) {
    const index = memory.findIndex((item) => item.id === id);
    if (index === -1) return null;
    memory[index] = toPublic({
      ...memory[index],
      ...payload,
      documentosCount: memory[index].documentosCount || 0,
      updated_at: new Date().toISOString()
    });
    return memory[index];
  }

  const result = await db.query(
    `UPDATE inscricoes
     SET nome = $1,
         idade = $2,
         telefone = $3,
         responsavel = $4,
         email = $5,
         oficina = $6,
         observacoes = $7,
         updated_at = NOW()
     WHERE id = $8
     RETURNING
       id,
       nome,
       idade,
       telefone,
       responsavel,
       email,
       oficina,
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
      payload.idade,
      payload.telefone,
      payload.responsavel || null,
      payload.email || null,
      payload.oficina,
      payload.observacoes || null,
      id
    ]
  );

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
                idade,
                telefone,
                responsavel,
                email,
                oficina,
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
  stats
};
