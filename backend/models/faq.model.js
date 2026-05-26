const crypto = require("crypto");
const db = require("../database/pool");
const config = require("../config/env");

const defaultFaqs = [
  ["Como sei se fui confirmado?", "Acesse o Portal do Aluno com o CPF cadastrado para consultar turmas, avisos e chamados. A equipe também pode chamar pelo WhatsApp informado no cadastro.", 1],
  ["Se a turma estiver cheia?", "A inscrição pode ficar em lista de espera. Quando houver vaga, a equipe orienta os próximos passos.", 2],
  ["Posso escolher mais de uma oficina?", "Sim. O formulário permite selecionar mais de uma oficina para o mesmo CPF.", 3],
  ["A inscrição online já garante a vaga?", "A inscrição registra o interesse. A confirmação depende de vaga disponível e conferência da documentação.", 4],
  ["Quais documentos preciso enviar?", "Maiores de 18 anos enviam RG, CPF, comprovante de residência e termo assinado. Menores enviam documentos do aluno e do responsável, declaração escolar, comprovante de residência e termo assinado pelo responsável.", 5],
  ["Menor de idade pode se inscrever sozinho?", "Pode preencher o cadastro, mas a confirmação precisa dos dados e documentos do responsável, incluindo o termo assinado pelo responsável legal.", 6],
  ["Como envio o termo assinado?", "Baixe o termo no formulário, assine eletronicamente pelo gov.br e envie o arquivo em PDF no campo indicado. O arquivo precisa estar legível e completo.", 7],
  ["Posso corrigir dados depois de enviar?", "Sim. Entre em contato pelo WhatsApp do Centro da Juventude informando nome completo e CPF para a equipe orientar a correção.", 8],
  ["O que acontece se faltar documento?", "A inscrição pode ficar pendente até a regularização. Acompanhe as orientações da equipe pelo Portal do Aluno ou WhatsApp.", 9],
  ["Quando começam as aulas?", "O início depende da organização de cada turma. Depois da conferência da inscrição, a equipe informa horários, local e data de início pelos canais cadastrados.", 10],
  ["Preciso morar em Almirante Tamandaré?", "O atendimento prioriza o público do município e pode exigir comprovante de residência. Em caso de dúvida, fale com a equipe antes de enviar a inscrição.", 11],
  ["Posso mudar de oficina depois?", "A troca depende de vaga e avaliação da equipe. Solicite pelo WhatsApp, presencialmente ou por ticket no Portal do Aluno.", 12],
  ["Não tenho todos os documentos agora. Posso me inscrever?", "Você pode iniciar o cadastro, mas a confirmação só acontece quando a documentação obrigatória estiver correta e validada.", 13],
  ["Como abro um ticket de suporte?", "Primeiro leia o FAQ para verificar se sua dúvida já está respondida. Se ainda precisar de atendimento, entre no Portal do Aluno com o CPF cadastrado, confirme a leitura do FAQ e descreva o problema.", 14]
];

const memoryFaqs = defaultFaqs.map(([pergunta, resposta, ordem]) => ({
  id: crypto.randomUUID(),
  pergunta,
  resposta,
  ordem,
  ativo: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}));

let schemaPromise = null;

async function ensureSchema() {
  if (!db.hasDatabase || !config.runtimeDatabaseSetup) return;
  if (!schemaPromise) {
    schemaPromise = db.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS faq_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pergunta TEXT NOT NULL CHECK (char_length(pergunta) BETWEEN 3 AND 180),
        resposta TEXT NOT NULL CHECK (char_length(resposta) BETWEEN 5 AND 1600),
        ordem INTEGER NOT NULL DEFAULT 0,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_faq_items_public ON faq_items (ativo, ordem, created_at);

      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_faq_items_updated_at ON faq_items;
      CREATE TRIGGER trg_faq_items_updated_at
      BEFORE UPDATE ON faq_items
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `).then(async () => {
      const count = await db.query("SELECT COUNT(*)::int AS total FROM faq_items");
      if (!Number(count.rows[0]?.total || 0)) {
        for (const [pergunta, resposta, ordem] of defaultFaqs) {
          await db.query(
            "INSERT INTO faq_items (pergunta, resposta, ordem, ativo) VALUES ($1, $2, $3, true)",
            [pergunta, resposta, ordem]
          );
        }
      }
    }).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

function faqToPublic(row) {
  return {
    id: row.id,
    pergunta: row.pergunta,
    resposta: row.resposta,
    ordem: Number(row.ordem || 0),
    ativo: row.ativo !== false,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function list({ includeInactive = false } = {}) {
  await ensureSchema();
  if (!db.hasDatabase) {
    return memoryFaqs
      .filter((item) => includeInactive || item.ativo)
      .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
      .map(faqToPublic);
  }
  const result = await db.query(
    `SELECT id, pergunta, resposta, ordem, ativo, created_at, updated_at FROM faq_items
     WHERE ($1::boolean = true OR ativo = true)
     ORDER BY ordem ASC, created_at ASC`,
    [Boolean(includeInactive)]
  );
  return result.rows.map(faqToPublic);
}

async function create(payload) {
  await ensureSchema();
  const record = {
    id: crypto.randomUUID(),
    pergunta: payload.pergunta,
    resposta: payload.resposta,
    ordem: Number(payload.ordem || 0),
    ativo: payload.ativo !== false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (!db.hasDatabase) {
    memoryFaqs.push(record);
    return faqToPublic(record);
  }
  const result = await db.query(
    "INSERT INTO faq_items (pergunta, resposta, ordem, ativo) VALUES ($1, $2, $3, $4) RETURNING *",
    [record.pergunta, record.resposta, record.ordem, record.ativo]
  );
  return faqToPublic(result.rows[0]);
}

async function update(id, payload) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const item = memoryFaqs.find((faq) => faq.id === id);
    if (!item) return null;
    item.pergunta = payload.pergunta;
    item.resposta = payload.resposta;
    item.ordem = Number(payload.ordem || 0);
    item.ativo = payload.ativo !== false;
    item.updated_at = new Date().toISOString();
    return faqToPublic(item);
  }
  const result = await db.query(
    `UPDATE faq_items
     SET pergunta = $1, resposta = $2, ordem = $3, ativo = $4, updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [payload.pergunta, payload.resposta, Number(payload.ordem || 0), payload.ativo !== false, id]
  );
  return result.rows[0] ? faqToPublic(result.rows[0]) : null;
}

async function remove(id) {
  await ensureSchema();
  if (!db.hasDatabase) {
    const index = memoryFaqs.findIndex((item) => item.id === id);
    if (index === -1) return false;
    memoryFaqs.splice(index, 1);
    return true;
  }
  const result = await db.query("DELETE FROM faq_items WHERE id = $1", [id]);
  return result.rowCount > 0;
}

module.exports = {
  list,
  create,
  update,
  remove,
  defaultFaqs
};
