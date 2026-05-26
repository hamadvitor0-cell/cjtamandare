CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS inscricoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 3 AND 120),
  cpf TEXT UNIQUE CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
  data_nascimento DATE,
  idade INTEGER NOT NULL CHECK (idade BETWEEN 0 AND 99),
  telefone TEXT NOT NULL CHECK (char_length(telefone) BETWEEN 10 AND 20),
  responsavel TEXT CHECK (responsavel IS NULL OR char_length(responsavel) <= 120),
  email TEXT CHECK (email IS NULL OR char_length(email) <= 160),
  oficina TEXT NOT NULL CHECK (char_length(oficina) BETWEEN 2 AND 80),
  oficinas TEXT[] NOT NULL DEFAULT '{}',
  oficina_detalhes JSONB NOT NULL DEFAULT '[]'::jsonb,
  possui_deficiencia BOOLEAN NOT NULL DEFAULT FALSE,
  deficiencia_descricao TEXT CHECK (deficiencia_descricao IS NULL OR char_length(deficiencia_descricao) <= 500),
  observacoes TEXT CHECK (observacoes IS NULL OR char_length(observacoes) <= 500),
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

CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  username TEXT UNIQUE CHECK (username IS NULL OR username ~ '^[a-zA-Z0-9._-]{3,40}$'),
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  registration_code_hash TEXT,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('master', 'admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  token_version INTEGER NOT NULL DEFAULT 0,
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

CREATE INDEX IF NOT EXISTS idx_inscricoes_oficina ON inscricoes (oficina);
CREATE INDEX IF NOT EXISTS idx_inscricoes_created_at ON inscricoes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inscricao_documentos_inscricao ON inscricao_documentos (inscricao_id);
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins (email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_username ON admins (username) WHERE username IS NOT NULL AND username <> '';
ALTER TABLE admins ADD COLUMN IF NOT EXISTS registration_code_hash TEXT;
ALTER TABLE admins ALTER COLUMN email DROP NOT NULL;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_depoimentos_ordem ON depoimentos (ordem ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_depoimentos_seed_key_unique ON depoimentos (seed_key);

ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS oficinas TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS oficina_detalhes JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS possui_deficiencia BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS deficiencia_descricao TEXT;
ALTER TABLE inscricoes DROP CONSTRAINT IF EXISTS inscricoes_idade_check;
ALTER TABLE inscricoes ADD CONSTRAINT inscricoes_idade_check CHECK (idade BETWEEN 0 AND 99);
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

CREATE INDEX IF NOT EXISTS idx_inscricoes_cpf ON inscricoes (cpf);

ALTER TABLE inscricao_documentos ADD COLUMN IF NOT EXISTS file_content BYTEA;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check CHECK (role IN ('master', 'admin', 'chamadas'));

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id TEXT,
  admin_name TEXT NOT NULL,
  admin_email TEXT,
  admin_role TEXT,
  action TEXT NOT NULL CHECK (action IN ('login', 'create', 'update', 'delete', 'send', 'export')),
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

DROP TRIGGER IF EXISTS trg_inscricoes_updated_at ON inscricoes;
CREATE TRIGGER trg_inscricoes_updated_at
BEFORE UPDATE ON inscricoes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_admins_updated_at ON admins;
CREATE TRIGGER trg_admins_updated_at
BEFORE UPDATE ON admins
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_depoimentos_updated_at ON depoimentos;
CREATE TRIGGER trg_depoimentos_updated_at
BEFORE UPDATE ON depoimentos
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
