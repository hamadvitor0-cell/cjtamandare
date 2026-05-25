const crypto = require("crypto");
const db = require("../database/pool");
const ensureAttendanceColumns = require("../database/ensure-attendance-columns");
const Aluno = require("./aluno.model");

const memoryChamadas = [];

function toPublic(row) {
  return {
    id: row.id,
    oficinaId: row.oficina_id,
    oficina: row.oficina || row.oficina_nome || "",
    data: row.data_chamada || row.data,
    observacoes: row.observacoes || "",
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function getByOficinaAndDate(oficinaId, data) {
  if (!db.hasDatabase) {
    const chamada = memoryChamadas.find((item) => item.oficina_id === oficinaId && item.data_chamada === data);
    const alunos = await Aluno.findAll({ oficinaId });
    return {
      chamada: chamada ? toPublic(chamada) : null,
      alunos: alunos.map((aluno) => {
        const presenca = chamada?.presencas.find((item) => item.aluno_id === aluno.id);
        return {
          ...aluno,
          presenca: presenca?.status || "presente",
          observacaoPresenca: presenca?.observacao || ""
        };
      })
    };
  }

  await ensureAttendanceColumns();
  await Aluno.syncFromInscricoes({ oficinaId });

  const chamadaResult = await db.query(
    `SELECT c.id, c.oficina_id, o.nome AS oficina_nome, c.data_chamada, c.observacoes, c.created_at, c.updated_at
     FROM chamadas c
     LEFT JOIN oficinas o ON o.id = c.oficina_id
     WHERE c.oficina_id = $1 AND c.data_chamada = $2
     LIMIT 1`,
    [oficinaId, data]
  );
  const chamada = chamadaResult.rows[0] || null;

  const alunosResult = await db.query(
    `SELECT a.id, a.nome, a.idade, a.telefone, a.responsavel, a.email, a.oficina_id,
            o.nome AS oficina_nome, a.status, a.observacoes, a.created_at, a.updated_at,
            COALESCE(p.status, 'presente') AS presenca,
            COALESCE(p.observacao, '') AS observacao_presenca
     FROM alunos a
     INNER JOIN aluno_oficinas ao ON ao.aluno_id = a.id AND ao.oficina_id = $1
     LEFT JOIN oficinas o ON o.id = ao.oficina_id
     LEFT JOIN presencas p ON p.aluno_id = a.id AND p.chamada_id = $2
     WHERE a.status = 'ativo'
     ORDER BY a.nome ASC`,
    [oficinaId, chamada?.id || null]
  );

  return {
    chamada: chamada ? toPublic(chamada) : null,
    alunos: alunosResult.rows.map((row) => ({
      id: row.id,
      nome: row.nome,
      idade: row.idade === null ? "" : Number(row.idade),
      telefone: row.telefone || "",
      responsavel: row.responsavel || "",
      email: row.email || "",
      oficinaId: row.oficina_id,
      oficina: row.oficina_nome || "",
      status: row.status,
      observacoes: row.observacoes || "",
      presenca: row.presenca,
      observacaoPresenca: row.observacao_presenca,
      created_at: row.created_at,
      updated_at: row.updated_at
    }))
  };
}

async function save(payload) {
  if (!db.hasDatabase) {
    let chamada = memoryChamadas.find((item) => item.oficina_id === payload.oficinaId && item.data_chamada === payload.data);
    const now = new Date().toISOString();
    if (!chamada) {
      chamada = {
        id: crypto.randomUUID(),
        oficina_id: payload.oficinaId,
        data_chamada: payload.data,
        observacoes: payload.observacoes || "",
        presencas: [],
        created_at: now,
        updated_at: now
      };
      memoryChamadas.push(chamada);
    }
    chamada.observacoes = payload.observacoes || "";
    chamada.updated_at = now;
    chamada.presencas = payload.presencas.map((item) => ({
      aluno_id: item.alunoId,
      status: item.status,
      observacao: item.observacao || ""
    }));
    return getByOficinaAndDate(payload.oficinaId, payload.data);
  }

  await ensureAttendanceColumns();
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const chamadaResult = await client.query(
      `INSERT INTO chamadas (oficina_id, data_chamada, observacoes)
       VALUES ($1, $2, $3)
       ON CONFLICT (oficina_id, data_chamada)
       DO UPDATE SET observacoes = EXCLUDED.observacoes, updated_at = NOW()
       RETURNING id`,
      [payload.oficinaId, payload.data, payload.observacoes || null]
    );
    const chamadaId = chamadaResult.rows[0].id;

    for (const item of payload.presencas) {
      await client.query(
        `INSERT INTO presencas (chamada_id, aluno_id, status, observacao)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (chamada_id, aluno_id)
         DO UPDATE SET status = EXCLUDED.status, observacao = EXCLUDED.observacao, updated_at = NOW()`,
        [chamadaId, item.alunoId, item.status, item.observacao || null]
      );
    }

    await client.query("COMMIT");
    return getByOficinaAndDate(payload.oficinaId, payload.data);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function history(filters = {}) {
  if (!db.hasDatabase) {
    return memoryChamadas
      .filter((item) => !filters.oficinaId || item.oficina_id === filters.oficinaId)
      .sort((a, b) => String(b.data_chamada).localeCompare(String(a.data_chamada)))
      .slice(0, 60)
      .map((item) => ({
        ...toPublic(item),
        total: item.presencas.length,
        presentes: item.presencas.filter((presence) => presence.status === "presente").length,
        ausentes: item.presencas.filter((presence) => presence.status === "ausente").length,
        justificados: item.presencas.filter((presence) => presence.status === "justificado").length
      }));
  }

  await ensureAttendanceColumns();
  const params = [];
  const where = [];
  if (filters.oficinaId) {
    params.push(filters.oficinaId);
    where.push(`c.oficina_id = $${params.length}`);
  }

  const result = await db.query(
    `SELECT c.id, c.oficina_id, o.nome AS oficina_nome, c.data_chamada, c.observacoes, c.created_at, c.updated_at,
            COUNT(p.id)::int AS total,
            COUNT(*) FILTER (WHERE p.status = 'presente')::int AS presentes,
            COUNT(*) FILTER (WHERE p.status = 'ausente')::int AS ausentes,
            COUNT(*) FILTER (WHERE p.status = 'justificado')::int AS justificados
     FROM chamadas c
     LEFT JOIN oficinas o ON o.id = c.oficina_id
     LEFT JOIN presencas p ON p.chamada_id = c.id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY c.id, o.nome
     ORDER BY c.data_chamada DESC
     LIMIT 60`,
    params
  );

  return result.rows.map((row) => ({
    ...toPublic(row),
    total: row.total,
    presentes: row.presentes,
    ausentes: row.ausentes,
    justificados: row.justificados
  }));
}

module.exports = {
  getByOficinaAndDate,
  save,
  history
};
