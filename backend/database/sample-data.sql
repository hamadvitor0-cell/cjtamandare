INSERT INTO inscricoes (nome, idade, telefone, responsavel, email, oficina, observacoes)
VALUES
  ('Ana Souza', 14, '(41) 99999-0001', 'Maria Souza', 'ana@example.com', 'Informática', 'Interesse em tecnologia.'),
  ('Lucas Pereira', 16, '(41) 99999-0002', 'Carlos Pereira', 'lucas@example.com', 'Futsal', ''),
  ('Bruna Oliveira', 15, '(41) 99999-0003', 'Patricia Oliveira', 'bruna@example.com', 'Teatro', 'Disponível no período da tarde.')
ON CONFLICT DO NOTHING;
