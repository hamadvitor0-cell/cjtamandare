INSERT INTO inscricoes (nome, cpf, idade, telefone, responsavel, email, oficina, oficinas, observacoes)
VALUES
  ('Ana Souza', '52998224725', 14, '(41) 99999-0001', 'Maria Souza', 'ana@example.com', 'Informática', ARRAY['Informática'], 'Interesse em tecnologia.'),
  ('Lucas Pereira', '39053344705', 16, '(41) 99999-0002', 'Carlos Pereira', 'lucas@example.com', 'Futsal', ARRAY['Futsal'], ''),
  ('Bruna Oliveira', '15350946056', 15, '(41) 99999-0003', 'Patricia Oliveira', 'bruna@example.com', 'Teatro', ARRAY['Teatro'], 'Disponível no período da tarde.')
ON CONFLICT DO NOTHING;
