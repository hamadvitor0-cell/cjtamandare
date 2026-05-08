CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS inscricoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 3 AND 120),
  cpf TEXT UNIQUE CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
  idade INTEGER NOT NULL CHECK (idade BETWEEN 10 AND 99),
  telefone TEXT NOT NULL CHECK (char_length(telefone) BETWEEN 10 AND 20),
  responsavel TEXT CHECK (responsavel IS NULL OR char_length(responsavel) <= 120),
  email TEXT CHECK (email IS NULL OR char_length(email) <= 160),
  oficina TEXT NOT NULL CHECK (char_length(oficina) BETWEEN 2 AND 80),
  oficinas TEXT[] NOT NULL DEFAULT '{}',
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
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inscricoes_oficina ON inscricoes (oficina);
CREATE INDEX IF NOT EXISTS idx_inscricoes_created_at ON inscricoes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inscricoes_cpf ON inscricoes (cpf);
CREATE INDEX IF NOT EXISTS idx_inscricao_documentos_inscricao ON inscricao_documentos (inscricao_id);
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins (email);

ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS oficinas TEXT[] NOT NULL DEFAULT '{}';
UPDATE inscricoes SET oficinas = ARRAY[oficina] WHERE oficinas = '{}' AND oficina IS NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inscricoes_cpf_key'
  ) THEN
    ALTER TABLE inscricoes ADD CONSTRAINT inscricoes_cpf_key UNIQUE (cpf);
  END IF;
END $$;

ALTER TABLE inscricao_documentos ADD COLUMN IF NOT EXISTS file_content BYTEA;

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
