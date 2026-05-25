CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS oficinas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE CHECK (char_length(nome) BETWEEN 2 AND 100),
  categoria TEXT NOT NULL CHECK (char_length(categoria) BETWEEN 2 AND 80),
  descricao TEXT NOT NULL CHECK (char_length(descricao) BETWEEN 8 AND 500),
  faixa_etaria TEXT NOT NULL CHECK (char_length(faixa_etaria) BETWEEN 2 AND 80),
  dias_semana TEXT[] NOT NULL DEFAULT '{}',
  periodo TEXT NOT NULL DEFAULT 'a definir' CHECK (periodo IN ('matutino', 'vespertino', 'noturno', 'integral', 'a definir')),
  horario TEXT NOT NULL CHECK (char_length(horario) BETWEEN 2 AND 120),
  capacidade INTEGER NOT NULL DEFAULT 30 CHECK (capacidade BETWEEN 1 AND 10000),
  imagem_url TEXT NOT NULL DEFAULT '/img/oficinas.png',
  initials TEXT NOT NULL CHECK (char_length(initials) BETWEEN 1 AND 4),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS galeria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL CHECK (char_length(titulo) BETWEEN 2 AND 120),
  descricao TEXT CHECK (descricao IS NULL OR char_length(descricao) <= 300),
  imagem_url TEXT NOT NULL CHECK (char_length(imagem_url) <= 500),
  alt TEXT CHECK (alt IS NULL OR char_length(alt) <= 180),
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  original_name TEXT CHECK (original_name IS NULL OR char_length(original_name) <= 240),
  mime_type TEXT CHECK (mime_type IS NULL OR mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes INTEGER CHECK (size_bytes IS NULL OR (size_bytes > 0 AND size_bytes <= 5242880)),
  file_content BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS colaboradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_key TEXT UNIQUE,
  nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 120),
  descricao TEXT CHECK (descricao IS NULL OR char_length(descricao) <= 700),
  site_url TEXT NOT NULL CHECK (char_length(site_url) BETWEEN 1 AND 500),
  imagem_url TEXT NOT NULL DEFAULT '' CHECK (char_length(imagem_url) <= 500),
  alt TEXT CHECK (alt IS NULL OR char_length(alt) <= 180),
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  original_name TEXT CHECK (original_name IS NULL OR char_length(original_name) <= 240),
  mime_type TEXT CHECK (mime_type IS NULL OR mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes INTEGER CHECK (size_bytes IS NULL OR (size_bytes > 0 AND size_bytes <= 5242880)),
  file_content BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inscricao_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inscricao_id UUID NOT NULL REFERENCES inscricoes(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL CHECK (char_length(original_name) BETWEEN 1 AND 240),
  stored_name TEXT NOT NULL UNIQUE CHECK (char_length(stored_name) BETWEEN 1 AND 120),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  storage_path TEXT NOT NULL CHECK (char_length(storage_path) BETWEEN 1 AND 260),
  file_content BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alunos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 3 AND 120),
  cpf TEXT CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
  idade INTEGER CHECK (idade IS NULL OR idade BETWEEN 0 AND 120),
  data_nascimento DATE,
  telefone TEXT CHECK (telefone IS NULL OR char_length(telefone) <= 20),
  responsavel TEXT CHECK (responsavel IS NULL OR char_length(responsavel) <= 120),
  contato_responsavel TEXT CHECK (contato_responsavel IS NULL OR char_length(contato_responsavel) <= 40),
  email TEXT CHECK (email IS NULL OR char_length(email) <= 160),
  bairro TEXT CHECK (bairro IS NULL OR char_length(bairro) <= 120),
  oficina_id UUID REFERENCES oficinas(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  documentos_pendentes BOOLEAN NOT NULL DEFAULT FALSE,
  documentos_links TEXT[] NOT NULL DEFAULT '{}',
  condicao_saude TEXT CHECK (condicao_saude IS NULL OR char_length(condicao_saude) <= 500),
  ficha_alerta TEXT CHECK (ficha_alerta IS NULL OR char_length(ficha_alerta) <= 500),
  import_source TEXT CHECK (import_source IS NULL OR char_length(import_source) <= 80),
  import_row_number INTEGER,
  import_row_hash TEXT CHECK (import_row_hash IS NULL OR char_length(import_row_hash) <= 80),
  advertencias TEXT CHECK (advertencias IS NULL OR char_length(advertencias) <= 1000),
  historico_oficinas TEXT CHECK (historico_oficinas IS NULL OR char_length(historico_oficinas) <= 1000),
  observacoes TEXT CHECK (observacoes IS NULL OR char_length(observacoes) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS dias_semana TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS periodo TEXT NOT NULL DEFAULT 'a definir';
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS capacidade INTEGER NOT NULL DEFAULT 30;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'oficinas_capacidade_check'
  ) THEN
    ALTER TABLE oficinas ADD CONSTRAINT oficinas_capacidade_check CHECK (capacidade BETWEEN 1 AND 10000);
  END IF;
END $$;
ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS contato_responsavel TEXT;
ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS possui_doenca BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS condicao_saude TEXT;
ALTER TABLE inscricoes DROP CONSTRAINT IF EXISTS inscricoes_idade_check;
ALTER TABLE inscricoes ADD CONSTRAINT inscricoes_idade_check CHECK (idade BETWEEN 0 AND 120);
ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS oficinas TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS oficina_detalhes JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE inscricoes SET oficinas = ARRAY[oficina] WHERE oficinas = '{}' AND oficina IS NOT NULL;
UPDATE inscricoes
SET oficina_detalhes = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('oficina', oficina_nome, 'createdAt', created_at, 'source', 'inscricao')), '[]'::jsonb)
  FROM unnest(oficinas) AS oficina_nome
)
WHERE oficina_detalhes = '[]'::jsonb AND cardinality(oficinas) > 0;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inscricoes_cpf_key'
  ) THEN
    ALTER TABLE inscricoes ADD CONSTRAINT inscricoes_cpf_key UNIQUE (cpf);
  END IF;
END $$;
ALTER TABLE galeria ADD COLUMN IF NOT EXISTS original_name TEXT;
ALTER TABLE galeria ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE galeria ADD COLUMN IF NOT EXISTS size_bytes INTEGER;
ALTER TABLE galeria ADD COLUMN IF NOT EXISTS file_content BYTEA;
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS seed_key TEXT;
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS original_name TEXT;
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS size_bytes INTEGER;
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS file_content BYTEA;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS contato_responsavel TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS oficina_id UUID REFERENCES oficinas(id) ON DELETE SET NULL;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS documentos_pendentes BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS documentos_links TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS condicao_saude TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS ficha_alerta TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS import_source TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS import_row_number INTEGER;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS import_row_hash TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS advertencias TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS historico_oficinas TEXT;
ALTER TABLE alunos DROP CONSTRAINT IF EXISTS alunos_idade_check;
ALTER TABLE alunos ADD CONSTRAINT alunos_idade_check CHECK (idade IS NULL OR idade BETWEEN 0 AND 120);
ALTER TABLE inscricao_documentos ADD COLUMN IF NOT EXISTS file_content BYTEA;

CREATE TABLE IF NOT EXISTS aluno_oficinas (
  aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (aluno_id, oficina_id)
);

CREATE TABLE IF NOT EXISTS chamadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  data_chamada DATE NOT NULL,
  observacoes TEXT CHECK (observacoes IS NULL OR char_length(observacoes) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (oficina_id, data_chamada)
);

CREATE TABLE IF NOT EXISTS presencas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chamada_id UUID NOT NULL REFERENCES chamadas(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('presente', 'ausente', 'justificado')),
  observacao TEXT CHECK (observacao IS NULL OR char_length(observacao) <= 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chamada_id, aluno_id)
);

ALTER TABLE chamadas ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE presencas ADD COLUMN IF NOT EXISTS observacao TEXT;

CREATE TABLE IF NOT EXISTS bolsistas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 3 AND 120),
  cpf TEXT CHECK (cpf IS NULL OR cpf = '' OR cpf ~ '^[0-9]{11}$'),
  idade INTEGER NOT NULL CHECK (idade BETWEEN 14 AND 24),
  telefone TEXT CHECK (telefone IS NULL OR char_length(telefone) <= 20),
  email TEXT CHECK (email IS NULL OR char_length(email) <= 160),
  funcao TEXT NOT NULL CHECK (funcao IN ('adm', 'social_media', 'professor', 'ajudante_professor')),
  tipo_atuacao TEXT NOT NULL DEFAULT 'apoio' CHECK (tipo_atuacao IN ('aula', 'ajuda', 'apoio', 'sem_vinculo')),
  dias_semana TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(dias_semana) <= 2),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  observacoes TEXT CHECK (observacoes IS NULL OR char_length(observacoes) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bolsista_oficinas (
  bolsista_id UUID NOT NULL REFERENCES bolsistas(id) ON DELETE CASCADE,
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bolsista_id, oficina_id)
);

CREATE TABLE IF NOT EXISTS calendario_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL CHECK (char_length(titulo) BETWEEN 2 AND 120),
  tipo TEXT NOT NULL CHECK (tipo IN ('reuniao', 'passeio', 'evento', 'formacao', 'outro')),
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

CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  username TEXT UNIQUE CHECK (username IS NULL OR username ~ '^[a-zA-Z0-9._-]{3,40}$'),
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  registration_code_hash TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS depoimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_key TEXT UNIQUE,
  nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 120),
  vinculo TEXT CHECK (vinculo IS NULL OR char_length(vinculo) <= 120),
  texto TEXT NOT NULL CHECK (char_length(texto) BETWEEN 10 AND 700),
  oficina TEXT CHECK (oficina IS NULL OR char_length(oficina) <= 120),
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE depoimentos ADD COLUMN IF NOT EXISTS seed_key TEXT;

ALTER TABLE admins ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS registration_code_hash TEXT;
ALTER TABLE admins ALTER COLUMN email DROP NOT NULL;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check CHECK (role IN ('master', 'admin'));

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id TEXT,
  admin_name TEXT NOT NULL,
  admin_email TEXT,
  admin_role TEXT,
  action TEXT NOT NULL CHECK (action IN ('login', 'create', 'update', 'delete')),
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bolsistas ADD COLUMN IF NOT EXISTS dias_semana TEXT[] NOT NULL DEFAULT '{}';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bolsistas_dias_semana_check'
  ) THEN
    ALTER TABLE bolsistas ADD CONSTRAINT bolsistas_dias_semana_check CHECK (
      cardinality(dias_semana) <= 2
      AND dias_semana <@ ARRAY['segunda','terca','quarta','quinta','sexta','sabado','domingo']::text[]
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_oficinas_categoria ON oficinas (categoria);
CREATE INDEX IF NOT EXISTS idx_galeria_ordem ON galeria (ordem ASC);
CREATE INDEX IF NOT EXISTS idx_colaboradores_ordem ON colaboradores (ordem ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_colaboradores_seed_key_unique ON colaboradores (seed_key);
CREATE INDEX IF NOT EXISTS idx_depoimentos_ordem ON depoimentos (ordem ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_depoimentos_seed_key_unique ON depoimentos (seed_key);
CREATE INDEX IF NOT EXISTS idx_inscricao_documentos_inscricao ON inscricao_documentos (inscricao_id);
CREATE INDEX IF NOT EXISTS idx_inscricoes_cpf ON inscricoes (cpf);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alunos_cpf_unique ON alunos (cpf) WHERE cpf IS NOT NULL AND cpf <> '';
CREATE INDEX IF NOT EXISTS idx_alunos_oficina ON alunos (oficina_id);
CREATE INDEX IF NOT EXISTS idx_alunos_nome_lower ON alunos (LOWER(nome));
CREATE INDEX IF NOT EXISTS idx_alunos_bairro_lower ON alunos (LOWER(COALESCE(bairro, '')));
CREATE INDEX IF NOT EXISTS idx_alunos_import_source_row ON alunos (import_source, import_row_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alunos_import_row_hash_unique ON alunos (import_row_hash) WHERE import_row_hash IS NOT NULL AND import_row_hash <> '';
CREATE INDEX IF NOT EXISTS idx_aluno_oficinas_oficina ON aluno_oficinas (oficina_id);
CREATE INDEX IF NOT EXISTS idx_chamadas_oficina_data ON chamadas (oficina_id, data_chamada DESC);
CREATE INDEX IF NOT EXISTS idx_presencas_chamada ON presencas (chamada_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bolsistas_cpf_unique ON bolsistas (cpf) WHERE cpf IS NOT NULL AND cpf <> '';
CREATE INDEX IF NOT EXISTS idx_bolsistas_status ON bolsistas (status);
CREATE INDEX IF NOT EXISTS idx_bolsista_oficinas_oficina ON bolsista_oficinas (oficina_id);
CREATE INDEX IF NOT EXISTS idx_calendario_eventos_data ON calendario_eventos (data_evento);
CREATE INDEX IF NOT EXISTS idx_calendario_eventos_oficina ON calendario_eventos (oficina_id);
CREATE INDEX IF NOT EXISTS idx_calendario_evento_bolsistas_bolsista ON calendario_evento_bolsistas (bolsista_id);
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins (email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_username ON admins (username) WHERE username IS NOT NULL AND username <> '';
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_logs (admin_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_entity ON admin_audit_logs (entity_type, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_oficinas_updated_at ON oficinas;
CREATE TRIGGER trg_oficinas_updated_at
BEFORE UPDATE ON oficinas
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_galeria_updated_at ON galeria;
CREATE TRIGGER trg_galeria_updated_at
BEFORE UPDATE ON galeria
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_colaboradores_updated_at ON colaboradores;
CREATE TRIGGER trg_colaboradores_updated_at
BEFORE UPDATE ON colaboradores
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_depoimentos_updated_at ON depoimentos;
CREATE TRIGGER trg_depoimentos_updated_at
BEFORE UPDATE ON depoimentos
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_alunos_updated_at ON alunos;
CREATE TRIGGER trg_alunos_updated_at
BEFORE UPDATE ON alunos
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_chamadas_updated_at ON chamadas;
CREATE TRIGGER trg_chamadas_updated_at
BEFORE UPDATE ON chamadas
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_presencas_updated_at ON presencas;
CREATE TRIGGER trg_presencas_updated_at
BEFORE UPDATE ON presencas
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_bolsistas_updated_at ON bolsistas;
CREATE TRIGGER trg_bolsistas_updated_at
BEFORE UPDATE ON bolsistas
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_calendario_eventos_updated_at ON calendario_eventos;
CREATE TRIGGER trg_calendario_eventos_updated_at
BEFORE UPDATE ON calendario_eventos
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
