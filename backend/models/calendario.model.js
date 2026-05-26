const crypto = require("crypto");
const db = require("../database/pool");
const config = require("../config/env");
const Oficina = require("./oficina.model");
const Bolsista = require("./bolsista.model");

const memoryEvents = [];
let schemaPromise = null;

const dayKeys = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function normalizeMonth(month) {
  return /^\d{4}-\d{2}$/.test(String(month || "")) ? month : currentMonth();
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateString(year, monthIndex, day) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function normalizeDate(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function dayKeyForDate(value) {
  const date = new Date(`${value}T12:00:00Z`);
  return dayKeys[date.getUTCDay()];
}

function datePartsForMonth(month) {
  const normalized = normalizeMonth(month);
  const [year, monthNumber] = normalized.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const totalDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { normalized, year, monthIndex, totalDays };
}

async function ensureSchema() {
  if (!db.hasDatabase || !config.runtimeDatabaseSetup) return;
  await Bolsista.findAll({});
  if (!schemaPromise) {
    schemaPromise = db.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS calendario_eventos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        titulo TEXT NOT NULL CHECK (char_length(titulo) BETWEEN 2 AND 120),
        tipo TEXT NOT NULL CHECK (tipo IN ('aula', 'evento', 'reuniao', 'passeio', 'cancelamento', 'comunicado', 'formacao', 'outro')),
        data_evento DATE NOT NULL,
        horario_inicio TEXT CHECK (horario_inicio IS NULL OR horario_inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
        horario_fim TEXT CHECK (horario_fim IS NULL OR horario_fim ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
        local TEXT CHECK (local IS NULL OR char_length(local) <= 120),
        oficina_id UUID REFERENCES oficinas(id) ON DELETE SET NULL,
        descricao TEXT CHECK (descricao IS NULL OR char_length(descricao) <= 500),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS calendario_evento_bolsistas (
        evento_id UUID NOT NULL REFERENCES calendario_eventos(id) ON DELETE CASCADE,
        bolsista_id UUID NOT NULL REFERENCES bolsistas(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (evento_id, bolsista_id)
      );

      CREATE INDEX IF NOT EXISTS idx_calendario_eventos_data ON calendario_eventos (data_evento);
      CREATE INDEX IF NOT EXISTS idx_calendario_eventos_oficina ON calendario_eventos (oficina_id);
      CREATE INDEX IF NOT EXISTS idx_calendario_evento_bolsistas_bolsista ON calendario_evento_bolsistas (bolsista_id);
      ALTER TABLE calendario_eventos DROP CONSTRAINT IF EXISTS calendario_eventos_tipo_check;
      ALTER TABLE calendario_eventos ADD CONSTRAINT calendario_eventos_tipo_check CHECK (tipo IN ('aula', 'evento', 'reuniao', 'passeio', 'cancelamento', 'comunicado', 'formacao', 'outro'));

      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_calendario_eventos_updated_at ON calendario_eventos;
      CREATE TRIGGER trg_calendario_eventos_updated_at
      BEFORE UPDATE ON calendario_eventos
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

function eventToPublic(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    tipo: row.tipo,
    data: normalizeDate(row.data_evento || row.data),
    horarioInicio: row.horario_inicio || row.horarioInicio || "",
    horarioFim: row.horario_fim || row.horarioFim || "",
    local: row.local || "",
    oficinaId: row.oficina_id || row.oficinaId || "",
    oficina: row.oficina || "",
    descricao: row.descricao || "",
    bolsistaIds: row.bolsista_ids || row.bolsistaIds || [],
    bolsistas: row.bolsistas || [],
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function payloadToMemory(payload) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    titulo: payload.titulo,
    tipo: payload.tipo,
    data: normalizeDate(payload.data),
    horarioInicio: payload.horarioInicio || "",
    horarioFim: payload.horarioFim || "",
    local: payload.local || "",
    oficinaId: payload.oficinaId || "",
    descricao: payload.descricao || "",
    bolsistaIds: Array.from(new Set(payload.bolsistaIds || [])),
    created_at: now,
    updated_at: now
  };
}

function decorateMemoryEvent(event, oficinas, bolsistas) {
  const oficina = oficinas.find((item) => item.id === event.oficinaId);
  return eventToPublic({
    ...event,
    oficina: oficina?.nome || "",
    bolsistas: (event.bolsistaIds || [])
      .map((id) => bolsistas.find((bolsista) => bolsista.id === id)?.nome)
      .filter(Boolean)
  });
}

function monthRange(month) {
  const { normalized, year, monthIndex, totalDays } = datePartsForMonth(month);
  return {
    month: normalized,
    start: dateString(year, monthIndex, 1),
    end: dateString(year, monthIndex, totalDays)
  };
}

async function listEvents(month) {
  await ensureSchema();
  const range = monthRange(month);
  if (!db.hasDatabase) {
    const oficinas = await Oficina.findAll({ includeInactive: true });
    const bolsistas = await Bolsista.findAll({});
    return memoryEvents
      .filter((event) => event.data >= range.start && event.data <= range.end)
      .sort((a, b) => `${a.data}${a.horarioInicio}`.localeCompare(`${b.data}${b.horarioInicio}`))
      .map((event) => decorateMemoryEvent(event, oficinas, bolsistas));
  }

  const result = await db.query(
    `SELECT
       e.id,
       e.titulo,
       e.tipo,
       e.data_evento,
       e.horario_inicio,
       e.horario_fim,
       e.local,
       e.oficina_id,
       o.nome AS oficina,
       e.descricao,
       e.created_at,
       e.updated_at,
       COALESCE(array_agg(b.id::text ORDER BY b.nome) FILTER (WHERE b.id IS NOT NULL), '{}') AS bolsista_ids,
       COALESCE(array_agg(b.nome ORDER BY b.nome) FILTER (WHERE b.id IS NOT NULL), '{}') AS bolsistas
     FROM calendario_eventos e
     LEFT JOIN oficinas o ON o.id = e.oficina_id
     LEFT JOIN calendario_evento_bolsistas eb ON eb.evento_id = e.id
     LEFT JOIN bolsistas b ON b.id = eb.bolsista_id
     WHERE e.data_evento BETWEEN $1 AND $2
     GROUP BY e.id, o.nome
     ORDER BY e.data_evento ASC, e.horario_inicio ASC NULLS LAST, e.titulo ASC`,
    [range.start, range.end]
  );
  return result.rows.map(eventToPublic);
}

async function syncEventBolsistas(client, eventId, bolsistaIds = []) {
  await client.query("DELETE FROM calendario_evento_bolsistas WHERE evento_id = $1", [eventId]);
  for (const bolsistaId of Array.from(new Set(bolsistaIds.filter(Boolean)))) {
    await client.query(
      "INSERT INTO calendario_evento_bolsistas (evento_id, bolsista_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [eventId, bolsistaId]
    );
  }
}

async function findEvent(id) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const oficinas = await Oficina.findAll({ includeInactive: true });
    const bolsistas = await Bolsista.findAll({});
    const event = memoryEvents.find((item) => item.id === id);
    return event ? decorateMemoryEvent(event, oficinas, bolsistas) : null;
  }

  const result = await db.query(
    `SELECT
       e.id,
       e.titulo,
       e.tipo,
       e.data_evento,
       e.horario_inicio,
       e.horario_fim,
       e.local,
       e.oficina_id,
       o.nome AS oficina,
       e.descricao,
       e.created_at,
       e.updated_at,
       COALESCE(array_agg(b.id::text ORDER BY b.nome) FILTER (WHERE b.id IS NOT NULL), '{}') AS bolsista_ids,
       COALESCE(array_agg(b.nome ORDER BY b.nome) FILTER (WHERE b.id IS NOT NULL), '{}') AS bolsistas
     FROM calendario_eventos e
     LEFT JOIN oficinas o ON o.id = e.oficina_id
     LEFT JOIN calendario_evento_bolsistas eb ON eb.evento_id = e.id
     LEFT JOIN bolsistas b ON b.id = eb.bolsista_id
     WHERE e.id = $1
     GROUP BY e.id, o.nome`,
    [id]
  );
  return result.rows[0] ? eventToPublic(result.rows[0]) : null;
}

async function createEvent(payload) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const event = payloadToMemory(payload);
    memoryEvents.push(event);
    return findEvent(event.id);
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO calendario_eventos (titulo, tipo, data_evento, horario_inicio, horario_fim, local, oficina_id, descricao)
       VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, '')::uuid, NULLIF($8, ''))
       RETURNING id`,
      [
        payload.titulo,
        payload.tipo,
        normalizeDate(payload.data),
        payload.horarioInicio || "",
        payload.horarioFim || "",
        payload.local || "",
        payload.oficinaId || "",
        payload.descricao || ""
      ]
    );
    await syncEventBolsistas(client, result.rows[0].id, payload.bolsistaIds || []);
    await client.query("COMMIT");
    return findEvent(result.rows[0].id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateEvent(id, payload) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const index = memoryEvents.findIndex((item) => item.id === id);
    if (index === -1) return null;
    memoryEvents[index] = {
      ...memoryEvents[index],
      titulo: payload.titulo,
      tipo: payload.tipo,
      data: normalizeDate(payload.data),
      horarioInicio: payload.horarioInicio || "",
      horarioFim: payload.horarioFim || "",
      local: payload.local || "",
      oficinaId: payload.oficinaId || "",
      descricao: payload.descricao || "",
      bolsistaIds: Array.from(new Set(payload.bolsistaIds || [])),
      updated_at: new Date().toISOString()
    };
    return findEvent(id);
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE calendario_eventos
       SET titulo = $1,
           tipo = $2,
           data_evento = $3,
           horario_inicio = NULLIF($4, ''),
           horario_fim = NULLIF($5, ''),
           local = NULLIF($6, ''),
           oficina_id = NULLIF($7, '')::uuid,
           descricao = NULLIF($8, ''),
           updated_at = NOW()
       WHERE id = $9
       RETURNING id`,
      [
        payload.titulo,
        payload.tipo,
        normalizeDate(payload.data),
        payload.horarioInicio || "",
        payload.horarioFim || "",
        payload.local || "",
        payload.oficinaId || "",
        payload.descricao || "",
        id
      ]
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    await syncEventBolsistas(client, id, payload.bolsistaIds || []);
    await client.query("COMMIT");
    return findEvent(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function removeEvent(id) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const index = memoryEvents.findIndex((item) => item.id === id);
    if (index === -1) return false;
    memoryEvents.splice(index, 1);
    return true;
  }

  const result = await db.query("DELETE FROM calendario_eventos WHERE id = $1", [id]);
  return result.rowCount > 0;
}

async function buildAulas(month) {
  const { normalized, year, monthIndex, totalDays } = datePartsForMonth(month);
  const oficinas = await Oficina.findAll({ includeInactive: false });
  const bolsistas = await Bolsista.findAll({});
  const activeBolsistas = bolsistas.filter((bolsista) => bolsista.status === "ativo");
  const aulas = [];

  for (let day = 1; day <= totalDays; day += 1) {
    const data = dateString(year, monthIndex, day);
    const dayKey = dayKeyForDate(data);
    oficinas
      .filter((oficina) => (oficina.diasSemana || []).includes(dayKey))
      .forEach((oficina) => {
        const escala = activeBolsistas
          .filter((bolsista) => {
            const linked = (bolsista.oficinaIds || []).includes(oficina.id);
            const worksDay = (bolsista.diasSemana || []).includes(dayKey);
            return linked && worksDay;
          })
          .map((bolsista) => ({
            id: bolsista.id,
            nome: bolsista.nome,
            funcao: bolsista.funcao,
            tipoAtuacao: bolsista.tipoAtuacao
          }));

        aulas.push({
          id: `aula-${data}-${oficina.id}`,
          tipo: "aula",
          data,
          titulo: oficina.nome,
          oficinaId: oficina.id,
          oficina: oficina.nome,
          periodo: oficina.periodo,
          horario: oficina.horario,
          bolsistas: escala
        });
      });
  }

  return { mes: normalized, aulas };
}

async function monthView(month) {
  const normalized = normalizeMonth(month);
  const [{ aulas }, eventos] = await Promise.all([
    buildAulas(normalized),
    listEvents(normalized)
  ]);
  return {
    mes: normalized,
    aulas,
    eventos
  };
}

module.exports = {
  monthView,
  createEvent,
  updateEvent,
  removeEvent
};
