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
  idade INTEGER CHECK (idade IS NULL OR idade BETWEEN 10 AND 99),
  telefone TEXT CHECK (telefone IS NULL OR char_length(telefone) <= 20),
  responsavel TEXT CHECK (responsavel IS NULL OR char_length(responsavel) <= 120),
  email TEXT CHECK (email IS NULL OR char_length(email) <= 160),
  oficina_id UUID REFERENCES oficinas(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  observacoes TEXT CHECK (observacoes IS NULL OR char_length(observacoes) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS dias_semana TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS periodo TEXT NOT NULL DEFAULT 'a definir';
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
ALTER TABLE galeria ADD COLUMN IF NOT EXISTS original_name TEXT;
ALTER TABLE galeria ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE galeria ADD COLUMN IF NOT EXISTS size_bytes INTEGER;
ALTER TABLE galeria ADD COLUMN IF NOT EXISTS file_content BYTEA;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS oficina_id UUID REFERENCES oficinas(id) ON DELETE SET NULL;
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

CREATE INDEX IF NOT EXISTS idx_oficinas_categoria ON oficinas (categoria);
CREATE INDEX IF NOT EXISTS idx_galeria_ordem ON galeria (ordem ASC);
CREATE INDEX IF NOT EXISTS idx_inscricao_documentos_inscricao ON inscricao_documentos (inscricao_id);
CREATE INDEX IF NOT EXISTS idx_inscricoes_cpf ON inscricoes (cpf);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alunos_cpf_unique ON alunos (cpf) WHERE cpf IS NOT NULL AND cpf <> '';
CREATE INDEX IF NOT EXISTS idx_alunos_oficina ON alunos (oficina_id);
CREATE INDEX IF NOT EXISTS idx_aluno_oficinas_oficina ON aluno_oficinas (oficina_id);
CREATE INDEX IF NOT EXISTS idx_chamadas_oficina_data ON chamadas (oficina_id, data_chamada DESC);
CREATE INDEX IF NOT EXISTS idx_presencas_chamada ON presencas (chamada_id);

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
