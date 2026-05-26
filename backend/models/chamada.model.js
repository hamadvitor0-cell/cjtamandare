const crypto = require("crypto");
const db = require("../database/pool");
const config = require("../config/env");
const Aluno = require("./aluno.model");
const Oficina = require("./oficina.model");
const Turma = require("./turma.model");
const spreadsheetAnalytics = require("../data/chamadas-2026-analytics.json");

const memoryChamadas = [];
let schemaEnsured = false;

function normalizeTurma(value) {
  return String(value || "").trim();
}

function normalizeCompare(value) {
  return normalizeTurma(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

async function ensureSchema() {
  if (schemaEnsured || !db.hasDatabase || !config.runtimeDatabaseSetup) return;
  schemaEnsured = true;
  await Turma.summaryByOffice().catch(() => {});
  await db.query(`
    ALTER TABLE chamadas ADD COLUMN IF NOT EXISTS turma TEXT NOT NULL DEFAULT '';
    ALTER TABLE chamadas ADD COLUMN IF NOT EXISTS turma_id UUID REFERENCES turmas(id) ON DELETE SET NULL;
    UPDATE chamadas SET turma = '' WHERE turma IS NULL;
    ALTER TABLE chamadas ALTER COLUMN turma SET NOT NULL;
    ALTER TABLE chamadas DROP CONSTRAINT IF EXISTS chamadas_oficina_id_data_chamada_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chamadas_oficina_turma_data_unique ON chamadas (oficina_id, turma, data_chamada);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chamadas_turma_id_data_unique ON chamadas (turma_id, data_chamada) WHERE turma_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_chamadas_turma ON chamadas (turma, data_chamada DESC);
  `);
}

function toPublic(row) {
  return {
    id: row.id,
    oficinaId: row.oficina_id,
    oficina: row.oficina || row.oficina_nome || "",
    turmaId: row.turma_id || row.turmaId || "",
    turma: row.turma || "",
    turmaLabel: [row.oficina || row.oficina_nome || "", row.turma || ""].filter(Boolean).join(" · "),
    data: row.data_chamada || row.data,
    observacoes: row.observacoes || "",
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function studentMatchesTurma(aluno, turma) {
  const normalized = normalizeCompare(turma);
  if (!normalized) return true;
  const turmas = aluno.turmas || [];
  return turmas.some((item) => {
    const current = normalizeCompare(item);
    return current === normalized || current.includes(normalized) || normalized.includes(current);
  });
}

async function turmaOptions() {
  const turmasDetalhadas = await Turma.findAll({ includeInactive: false });
  if (turmasDetalhadas.length) {
    return turmasDetalhadas.map((turma) => ({
      id: `${turma.oficinaId}::${turma.id}::${encodeURIComponent(normalizeTurma(turma.nome))}`,
      turmaId: turma.id,
      oficinaId: turma.oficinaId,
      oficina: turma.oficina,
      turma: normalizeTurma(turma.nome),
      label: [turma.oficina, normalizeTurma(turma.nome)].filter(Boolean).join(" Â· "),
      horario: turma.horario || "",
      periodo: turma.periodoLabel || turma.periodo || "",
      faixaEtaria: `${turma.idadeMinima} a ${turma.idadeMaxima} anos`,
      vagas: `${turma.vagasOcupadas}/${turma.vagasTotal}`
    }));
  }
  const oficinas = await Oficina.findAll({ includeInactive: true });
  return oficinas.flatMap((oficina) => {
    const turmas = Array.isArray(oficina.turmas) && oficina.turmas.length ? oficina.turmas : [""];
    return turmas.map((turma) => ({
      id: `${oficina.id}::${encodeURIComponent(normalizeTurma(turma))}`,
      oficinaId: oficina.id,
      oficina: oficina.nome,
      turma: normalizeTurma(turma),
      label: [oficina.nome, normalizeTurma(turma)].filter(Boolean).join(" · "),
      horario: oficina.horario || "",
      periodo: oficina.periodo || ""
    }));
  });
}

async function getByTurmaAndDate(oficinaId, turma, data, turmaId = "") {
  let turmaNome = normalizeTurma(turma);
  const selectedTurmaId = String(turmaId || "").trim();
  let selectedTurma = null;
  if (selectedTurmaId) {
    selectedTurma = await Turma.findById(selectedTurmaId);
    if (!selectedTurma || selectedTurma.oficinaId !== oficinaId) {
      const error = new Error("Turma invalida para a oficina selecionada.");
      error.statusCode = 400;
      throw error;
    }
    turmaNome = selectedTurma.nome;
  }
  if (!db.hasDatabase) {
    const chamada = memoryChamadas.find((item) => item.oficina_id === oficinaId
      && (!selectedTurmaId || item.turma_id === selectedTurmaId)
      && normalizeTurma(item.turma) === turmaNome
      && item.data_chamada === data);
    const allAlunos = await Aluno.findAll({ oficinaId });
    let alunos = selectedTurmaId
      ? allAlunos.filter((aluno) => aluno.turmaId === selectedTurmaId || (aluno.turmaIds || []).includes(selectedTurmaId))
      : allAlunos.filter((aluno) => studentMatchesTurma(aluno, turmaNome));
    const fallbackTurma = Boolean(!selectedTurmaId && turmaNome && !alunos.length && allAlunos.length);
    if (fallbackTurma) alunos = allAlunos;
    return {
      chamada: chamada ? toPublic(chamada) : null,
      turmaId: selectedTurmaId,
      turma: turmaNome,
      fallbackTurma,
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

  await ensureSchema();
  await Aluno.syncFromInscricoes({ oficinaId });

  const chamadaResult = await db.query(
    `SELECT c.id, c.oficina_id, c.turma_id, c.turma, o.nome AS oficina_nome, c.data_chamada, c.observacoes, c.created_at, c.updated_at
     FROM chamadas c
     LEFT JOIN oficinas o ON o.id = c.oficina_id
     WHERE c.oficina_id = $1
       AND c.data_chamada = $3
       AND (
         ($4::uuid IS NOT NULL AND c.turma_id = $4::uuid)
         OR ($4::uuid IS NULL AND c.turma = $2)
       )
     LIMIT 1`,
    [oficinaId, turmaNome, data, selectedTurmaId || null]
  );
  const chamada = chamadaResult.rows[0] || null;

  async function loadStudents(applyTurmaFilter) {
    const turmaCondition = selectedTurmaId
      ? `AND (
          a.turma_id = $3
          OR EXISTS (
            SELECT 1
            FROM aluno_turmas at
            WHERE at.aluno_id = a.id AND at.turma_id = $3
          )
        )`
      : applyTurmaFilter
      ? `AND EXISTS (
          SELECT 1
          FROM unnest(COALESCE(a.turmas, '{}')) AS turma_aluno
          WHERE LOWER(turma_aluno) = LOWER($3)
             OR LOWER(turma_aluno) LIKE '%' || LOWER($3) || '%'
             OR LOWER($3) LIKE '%' || LOWER(turma_aluno) || '%'
        )`
      : "";
    return db.query(
      `SELECT a.id, a.matricula, a.nome, a.cpf, a.idade, a.telefone, a.responsavel, a.email, a.oficina_id,
              o.nome AS oficina_nome, a.turmas, a.status, a.observacoes, a.created_at, a.updated_at,
            a.turma_id, turma_atual.nome AS turma_nome,
            COALESCE(p.status, 'presente') AS presenca,
            COALESCE(p.observacao, '') AS observacao_presenca
     FROM alunos a
     INNER JOIN aluno_oficinas ao ON ao.aluno_id = a.id AND ao.oficina_id = $1
     LEFT JOIN oficinas o ON o.id = ao.oficina_id
     LEFT JOIN turmas turma_atual ON turma_atual.id = a.turma_id
     LEFT JOIN presencas p ON p.aluno_id = a.id AND p.chamada_id = $2
     WHERE a.status = 'ativo'
       ${turmaCondition}
      ORDER BY a.nome ASC`,
      (applyTurmaFilter || selectedTurmaId) ? [oficinaId, chamada?.id || null, selectedTurmaId || turmaNome] : [oficinaId, chamada?.id || null]
    );
  }

  let alunosResult = await loadStudents(Boolean(turmaNome) || Boolean(selectedTurmaId));
  const fallbackTurma = Boolean(!selectedTurmaId && turmaNome && !alunosResult.rows.length);
  if (fallbackTurma) alunosResult = await loadStudents(false);

  return {
    chamada: chamada ? toPublic(chamada) : null,
    turmaId: selectedTurmaId,
    turma: turmaNome,
    fallbackTurma,
    alunos: alunosResult.rows.map((row) => ({
      id: row.id,
      matricula: row.matricula || "",
      nome: row.nome,
      cpf: row.cpf || "",
      idade: row.idade === null ? "" : Number(row.idade),
      telefone: row.telefone || "",
      responsavel: row.responsavel || "",
      email: row.email || "",
      oficinaId: row.oficina_id,
      oficina: row.oficina_nome || "",
      turmaId: row.turma_id || "",
      turmaNome: row.turma_nome || "",
      turmas: row.turmas?.length ? row.turmas : (row.turma_nome ? [row.turma_nome] : []),
      status: row.status,
      observacoes: row.observacoes || "",
      presenca: row.presenca,
      observacaoPresenca: row.observacao_presenca,
      created_at: row.created_at,
      updated_at: row.updated_at
    }))
  };
}

async function getByOficinaAndDate(oficinaId, data) {
  return getByTurmaAndDate(oficinaId, "", data);
}

async function assertSubmittedStudentsBelongToTurma(payload, turmaNome, turmaId = "") {
  const roster = await getByTurmaAndDate(payload.oficinaId, turmaNome, payload.data, turmaId);
  const allowedIds = new Set(roster.alunos.map((aluno) => aluno.id));
  const submittedIds = payload.presencas.map((item) => item.alunoId);
  const hasDuplicate = new Set(submittedIds).size !== submittedIds.length;
  const hasOutsider = submittedIds.some((alunoId) => !allowedIds.has(alunoId));

  if (hasDuplicate || hasOutsider) {
    const error = new Error("A chamada contém aluno inválido para a turma selecionada.");
    error.statusCode = 403;
    throw error;
  }
}

async function save(payload) {
  const turmaId = String(payload.turmaId || payload.turma_id || "").trim();
  let turmaNome = normalizeTurma(payload.turma);
  if (turmaId) {
    const selectedTurma = await Turma.findById(turmaId);
    if (!selectedTurma || selectedTurma.oficinaId !== payload.oficinaId) {
      const error = new Error("Turma invalida para a oficina selecionada.");
      error.statusCode = 400;
      throw error;
    }
    turmaNome = selectedTurma.nome;
  }
  // The posted roster is untrusted; bind every attendance write to the selected class.
  await assertSubmittedStudentsBelongToTurma(payload, turmaNome, turmaId);
  if (!db.hasDatabase) {
    let chamada = memoryChamadas.find((item) => item.oficina_id === payload.oficinaId
      && (!turmaId || item.turma_id === turmaId)
      && normalizeTurma(item.turma) === turmaNome
      && item.data_chamada === payload.data);
    const updatedExisting = Boolean(chamada);
    const now = new Date().toISOString();
    if (!chamada) {
      chamada = {
        id: crypto.randomUUID(),
        oficina_id: payload.oficinaId,
        turma_id: turmaId || "",
        turma: turmaNome,
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
    return { ...(await getByTurmaAndDate(payload.oficinaId, turmaNome, payload.data, turmaId)), updatedExisting };
  }

  await ensureSchema();
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT id
       FROM chamadas
       WHERE oficina_id = $1
         AND data_chamada = $3
         AND (
           ($4::uuid IS NOT NULL AND turma_id = $4::uuid)
           OR ($4::uuid IS NULL AND turma = $2)
         )
       LIMIT 1`,
      [payload.oficinaId, turmaNome, payload.data, turmaId || null]
    );
    const updatedExisting = Boolean(existing.rows[0]);
    let chamadaId = existing.rows[0]?.id || "";
    if (chamadaId) {
      await client.query(
        "UPDATE chamadas SET turma_id = COALESCE($1, turma_id), turma = $2, observacoes = $3, updated_at = NOW() WHERE id = $4",
        [turmaId || null, turmaNome, payload.observacoes || null, chamadaId]
      );
    } else {
      const chamadaResult = await client.query(
        `INSERT INTO chamadas (oficina_id, turma_id, turma, data_chamada, observacoes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [payload.oficinaId, turmaId || null, turmaNome, payload.data, payload.observacoes || null]
      );
      chamadaId = chamadaResult.rows[0].id;
    }
    const alunoIds = payload.presencas.map((item) => item.alunoId);

    for (const item of payload.presencas) {
      await client.query(
        `INSERT INTO presencas (chamada_id, aluno_id, status, observacao)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (chamada_id, aluno_id)
         DO UPDATE SET status = EXCLUDED.status, observacao = EXCLUDED.observacao, updated_at = NOW()`,
        [chamadaId, item.alunoId, item.status, item.observacao || null]
      );
    }
    if (alunoIds.length) {
      await client.query(
        "DELETE FROM presencas WHERE chamada_id = $1 AND NOT (aluno_id = ANY($2::uuid[]))",
        [chamadaId, alunoIds]
      );
    }

    await client.query("COMMIT");
    return { ...(await getByTurmaAndDate(payload.oficinaId, turmaNome, payload.data, turmaId)), updatedExisting };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function history(filters = {}) {
  const turmaNome = normalizeTurma(filters.turma);
  const turmaId = String(filters.turmaId || filters.turma_id || "").trim();
  if (!db.hasDatabase) {
    return memoryChamadas
      .filter((item) => !filters.oficinaId || item.oficina_id === filters.oficinaId)
      .filter((item) => !turmaId || item.turma_id === turmaId)
      .filter((item) => turmaId || !turmaNome || normalizeTurma(item.turma) === turmaNome)
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

  await ensureSchema();
  const params = [];
  const where = [];
  if (filters.oficinaId) {
    params.push(filters.oficinaId);
    where.push(`c.oficina_id = $${params.length}`);
  }
  if (turmaNome) {
    params.push(turmaNome);
    where.push(`c.turma = $${params.length}`);
  }
  if (turmaId) {
    params.push(turmaId);
    where.push(`c.turma_id = $${params.length}`);
  }

  const result = await db.query(
    `SELECT c.id, c.oficina_id, c.turma_id, c.turma, o.nome AS oficina_nome, c.data_chamada, c.observacoes, c.created_at, c.updated_at,
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

function topBy(rows, key) {
  return rows
    .slice()
    .sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0) || a.oficina.localeCompare(b.oficina))
    .slice(0, 12);
}

const sortMap = {
  inscritos_desc: ["inscritos", "desc", "Inscritos - maior para menor"],
  inscritos_asc: ["inscritos", "asc", "Inscritos - menor para maior"],
  frequencia_desc: ["frequenciaPercentual", "desc", "Maior frequência"],
  frequencia_asc: ["frequenciaPercentual", "asc", "Menor frequência"],
  presencas_desc: ["presencas", "desc", "Mais presenças"],
  presencas_asc: ["presencas", "asc", "Menos presenças"],
  faltas_desc: ["faltas", "desc", "Mais faltas"],
  faltas_asc: ["faltas", "asc", "Menos faltas"],
  justificadas_desc: ["justificadas", "desc", "Mais faltas justificadas"],
  justificadas_asc: ["justificadas", "asc", "Menos faltas justificadas"],
  chamadas_desc: ["chamadas", "desc", "Mais chamadas"],
  chamadas_asc: ["chamadas", "asc", "Menos chamadas"]
};

function sortRows(rows = [], sort = "inscritos_desc") {
  const [key, direction] = sortMap[sort] || sortMap.inscritos_desc;
  const factor = direction === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const diff = Number(a[key] || 0) - Number(b[key] || 0);
    return diff ? diff * factor : a.oficina.localeCompare(b.oficina);
  });
}

function totalsFor(rows = []) {
  return rows.reduce((acc, row) => {
    acc.inscritos += row.inscritos;
    acc.chamadas += row.chamadas;
    acc.presencas += row.presencas;
    acc.faltas += row.faltas;
    acc.justificadas += row.justificadas;
    acc.totalPresencas += row.totalPresencas;
    return acc;
  }, { inscritos: 0, chamadas: 0, presencas: 0, faltas: 0, justificadas: 0, totalPresencas: 0 });
}

function periodOptions() {
  const months = spreadsheetAnalytics?.periods?.months || [];
  const weeks = spreadsheetAnalytics?.periods?.weeks || [];
  return {
    months: months.map((item) => ({ key: item.key, label: item.label })),
    weeks: weeks.map((item) => ({ key: item.key, label: item.label }))
  };
}

function buildAnalyticsResult(rows = [], filters = {}, extra = {}) {
  const sort = filters.sort || "inscritos_desc";
  const [rankingKey,, rankingTitle] = sortMap[sort] || sortMap.inscritos_desc;
  const sortedRows = sortRows(rows, sort);
  return {
    ...extra,
    filters: {
      periodo: filters.periodo || "geral",
      mes: filters.mes || "",
      semana: filters.semana || "",
      sort
    },
    periodOptions: periodOptions(),
    totals: totalsFor(rows),
    byOficina: sortedRows,
    rankingKey,
    rankingTitle,
    ranking: sortedRows.slice(0, 12),
    topInscritos: topBy(rows, "inscritos"),
    topPresencas: topBy(rows, "presencas"),
    topFaltas: topBy(rows, "faltas"),
    topJustificadas: topBy(rows, "justificadas")
  };
}

function selectedSpreadsheetAnalytics(filters = {}) {
  const periodo = filters.periodo || "geral";
  const periods = spreadsheetAnalytics?.periods || {};
  let selected = spreadsheetAnalytics;
  if (periodo === "mes" && filters.mes) {
    selected = (periods.months || []).find((item) => item.key === filters.mes) || null;
  }
  if (periodo === "semana" && filters.semana) {
    selected = (periods.weeks || []).find((item) => item.key === filters.semana) || null;
  }
  if (!selected) {
    return buildAnalyticsResult([], filters, {
      source: spreadsheetAnalytics.source,
      files: spreadsheetAnalytics.files,
      generatedAt: spreadsheetAnalytics.generatedAt
    });
  }
  return buildAnalyticsResult(selected.byOficina || [], filters, {
    source: spreadsheetAnalytics.source,
    generatedAt: spreadsheetAnalytics.generatedAt,
    sourceDir: spreadsheetAnalytics.sourceDir,
    files: spreadsheetAnalytics.files,
    periodLabel: selected.label || "",
    periodKey: selected.key || ""
  });
}

function shouldUseSpreadsheetAnalytics(totals = {}, spreadsheetResult = spreadsheetAnalytics) {
  const spreadsheetTotal = Number(spreadsheetResult?.totals?.totalPresencas || 0);
  const currentTotal = Number(totals.totalPresencas || 0);
  return spreadsheetTotal > currentTotal;
}

function isoWeekStart(weekKey) {
  const match = String(weekKey || "").match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7, 12));
  const day = simple.getUTCDay() || 7;
  simple.setUTCDate(simple.getUTCDate() - day + 1);
  return simple.toISOString().slice(0, 10);
}

function addDaysToDate(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateRange(filters = {}) {
  if (filters.periodo === "mes" && filters.mes) {
    return { start: `${filters.mes}-01`, end: addDaysToDate(`${filters.mes}-01`, 32).slice(0, 8) + "01" };
  }
  if (filters.periodo === "semana" && filters.semana) {
    const start = isoWeekStart(filters.semana);
    if (start) return { start, end: addDaysToDate(start, 7) };
  }
  return { start: "", end: "" };
}

function inRange(date, range) {
  if (!range.start || !range.end) return true;
  const value = String(date || "").slice(0, 10);
  return value >= range.start && value < range.end;
}

async function analytics(filters = {}) {
  const spreadsheetResult = selectedSpreadsheetAnalytics(filters);
  const range = dateRange(filters);
  if (!db.hasDatabase) {
    const [oficinas, alunos] = await Promise.all([
      Oficina.findAll({ includeInactive: true }),
      Aluno.findAll({})
    ]);
    const rows = oficinas.map((oficina) => {
      const chamadas = memoryChamadas.filter((chamada) => chamada.oficina_id === oficina.id && inRange(chamada.data_chamada, range));
      const presencas = chamadas.flatMap((chamada) => chamada.presencas || []);
      const inscritos = new Set(
        alunos
          .filter((aluno) => aluno.status !== "inativo" && (aluno.oficinaIds || []).includes(oficina.id))
          .map((aluno) => aluno.cpf || aluno.id)
      ).size;
      const presentes = presencas.filter((presence) => presence.status === "presente").length;
      const ausentes = presencas.filter((presence) => presence.status === "ausente").length;
      const justificados = presencas.filter((presence) => presence.status === "justificado").length;
      const totalPresencas = presentes + ausentes + justificados;
      return {
        oficinaId: oficina.id,
        oficina: oficina.nome,
        categoria: oficina.categoria,
        inscritos,
        chamadas: chamadas.length,
        presencas: presentes,
        faltas: ausentes,
        justificadas: justificados,
        totalPresencas,
        frequenciaPercentual: totalPresencas ? Math.round((presentes / totalPresencas) * 100) : 0
      };
    }).filter((row) => row.inscritos || row.chamadas || row.totalPresencas);
    const result = buildAnalyticsResult(rows, filters);
    return shouldUseSpreadsheetAnalytics(result.totals, spreadsheetResult) ? spreadsheetResult : result;
  }

  await ensureSchema();
  const params = [];
  const dateWhere = [];
  if (range.start && range.end) {
    params.push(range.start, range.end);
    dateWhere.push(`c.data_chamada >= $${params.length - 1}::date AND c.data_chamada < $${params.length}::date`);
  }

  const result = await db.query(`
    WITH pessoas_por_oficina AS (
      SELECT o.id AS oficina_id, COALESCE(NULLIF(i.cpf, ''), i.id::text) AS pessoa_key
      FROM oficinas o
      INNER JOIN inscricoes i ON (o.nome = ANY(i.oficinas) OR i.oficina = o.nome)
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(i.oficina_detalhes, '[]'::jsonb)) AS detalhe
        WHERE detalhe->>'oficina' = o.nome
          AND detalhe->>'status' = 'lista_espera'
      )
        AND NOT EXISTS (
          SELECT 1
          FROM aluno_oficina_cancelamentos cancelamento
          INNER JOIN alunos cancelado ON cancelado.id = cancelamento.aluno_id
          WHERE cancelado.cpf = REGEXP_REPLACE(COALESCE(i.cpf, ''), '\\D', '', 'g')
            AND cancelamento.oficina_id = o.id
        )
      UNION
      SELECT ao.oficina_id, COALESCE(NULLIF(a.cpf, ''), a.id::text) AS pessoa_key
      FROM aluno_oficinas ao
      INNER JOIN alunos a ON a.id = ao.aluno_id
      WHERE a.status = 'ativo'
    ),
    inscritos AS (
      SELECT oficina_id, COUNT(DISTINCT pessoa_key)::int AS inscritos
      FROM pessoas_por_oficina
      GROUP BY oficina_id
    ),
    frequencia AS (
      SELECT c.oficina_id,
             COUNT(DISTINCT c.id)::int AS chamadas,
             COUNT(p.id) FILTER (WHERE p.status = 'presente')::int AS presencas,
             COUNT(p.id) FILTER (WHERE p.status = 'ausente')::int AS faltas,
             COUNT(p.id) FILTER (WHERE p.status = 'justificado')::int AS justificadas,
             COUNT(p.id)::int AS total_presencas
      FROM chamadas c
      LEFT JOIN presencas p ON p.chamada_id = c.id
      ${dateWhere.length ? `WHERE ${dateWhere.join(" AND ")}` : ""}
      GROUP BY c.oficina_id
    )
    SELECT o.id AS oficina_id,
           o.nome AS oficina,
           o.categoria,
           COALESCE(i.inscritos, 0) AS inscritos,
           COALESCE(f.chamadas, 0) AS chamadas,
           COALESCE(f.presencas, 0) AS presencas,
           COALESCE(f.faltas, 0) AS faltas,
           COALESCE(f.justificadas, 0) AS justificadas,
           COALESCE(f.total_presencas, 0) AS total_presencas
    FROM oficinas o
    LEFT JOIN inscritos i ON i.oficina_id = o.id
    LEFT JOIN frequencia f ON f.oficina_id = o.id
    WHERE o.ativo = true
       OR COALESCE(i.inscritos, 0) > 0
       OR COALESCE(f.total_presencas, 0) > 0
    ORDER BY inscritos DESC, o.nome ASC
  `, params);

  const rows = result.rows.map((row) => {
    const totalPresencas = Number(row.total_presencas || 0);
    const presencas = Number(row.presencas || 0);
    return {
      oficinaId: row.oficina_id,
      oficina: row.oficina,
      categoria: row.categoria,
      inscritos: Number(row.inscritos || 0),
      chamadas: Number(row.chamadas || 0),
      presencas,
      faltas: Number(row.faltas || 0),
      justificadas: Number(row.justificadas || 0),
      totalPresencas,
      frequenciaPercentual: totalPresencas ? Math.round((presencas / totalPresencas) * 100) : 0
    };
  });
  const analyticsResult = buildAnalyticsResult(rows, filters);
  return shouldUseSpreadsheetAnalytics(analyticsResult.totals, spreadsheetResult) ? spreadsheetResult : analyticsResult;
}

module.exports = {
  turmaOptions,
  getByOficinaAndDate,
  getByTurmaAndDate,
  save,
  history,
  analytics
};
