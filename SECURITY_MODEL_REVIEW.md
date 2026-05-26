# Revisao de Seguranca dos Models - CJ Tamandare

Data: 2026-05-24

Escopo: revisao das queries, exposicao de dados, ownership, filtros e limites dos models priorizados apos o hardening.

| Arquivo | Achado e risco | Correcao ou controle validado | Teste/validacao | Status |
| --- | --- | --- | --- | --- |
| `backend/models/support.model.js` | Tickets, feedbacks e anexos antigos aceitavam fallback por CPF; havia risco de ownership baseado em dado pessoal reutilizavel. | Consultas do Portal agora vinculam somente `aluno_id`; registros legados recebem backfill controlado por aluno; listagens administrativas sao limitadas. | Smoke test cria ticket/anexo, consulta pela sessao e revoga sessao; busca textual de fallback removida. | Corrigido |
| `backend/models/aluno.model.js` | A validacao de sessao dependia de listagem limitada e nao possuia versao revogavel. | `findById` usa filtro parametrizado por ID; `token_version` foi adicionado; criacao/atualizacao mantem matricula unica e revogacao explicita foi criada. | Smoke test invalida token antigo apos `revokeSessions`. | Corrigido |
| `backend/models/inscricao.model.js` | A rota publica antiga podia consumir dados privados por CPF/nascimento fora do model. | Queries seguem parametrizadas; documentos sao vinculados a inscricao e downloads exigem ADM; o fluxo publico legado foi bloqueado antes de consultar dados. | Smoke test valida `410` em `/inscricoes/status` e upload invalido. | Corrigido |
| `backend/models/oficina.model.js` | Nenhum dado pessoal retornado nas leituras publicas; contagem usa CPF apenas internamente para deduplicacao. | Queries parametrizadas e mutacoes protegidas pelas rotas administrativas. | Revisao estatica das queries e rotas. | Validado |
| `backend/models/galeria.model.js` | Conteudo/imagem e publico; risco principal e upload indevido. | Mutacoes e leitura binaria administrativa protegidas; upload passa por allowlist e assinatura de arquivo. | Smoke test geral de upload inseguro e revisao de rotas. | Validado |
| `backend/models/colaborador.model.js` | URL externa cadastrada por ADM poderia ser vetor de esquema inseguro. | Validacao de URL aceita somente HTTP/HTTPS; queries parametrizadas e upload validado. | Revisao de validator e model. | Validado |
| `backend/models/depoimento.model.js` | Texto exibido publicamente pode transportar payload XSS se renderizado incorretamente. | Entradas sao validadas/sanitizadas e a interface usa conteudo textual; queries parametrizadas. | Teste de sanitizacao cobre payloads de script/event handler. | Validado |
| `backend/models/faq.model.js` | Perguntas/respostas publicas possuem o mesmo risco de conteudo ativo. | CRUD administrativo protegido, valores parametrizados e exibicao textual/sanitizada. | Teste de sanitizacao e revisao estatica. | Validado |
| `backend/models/calendario.model.js` | Eventos sao exibidos a usuarios e poderiam aceitar tipo/data arbitrarios. | Queries parametrizadas; tipos, datas e campos limitados pelos validators; mutacao exige perfil administrativo. | Revisao de model, validators e rotas. | Validado |
| `backend/models/bolsista.model.js` | Contem CPF/telefone/email e exige acesso restrito. | Toda a superficie e administrativa; queries parametrizadas; o cadastro possui limite operacional de 40 registros e CPF unico. | Revisao estatica de rotas e model. | Validado |
| `backend/models/first-access.model.js` | Distribuicao de matriculas exige visualizar um segredo operacional e poderia virar exportacao massiva/registro de PII. | Acesso apenas ADM/Master, listagem paginada e mascarada, mensagem/WhatsApp individual, PDF somente com filtro, eventos por IDs internos e `no-store`. | Smoke test cobre RBAC, campos retornados, auditoria minimizada, PDF filtrado e rate limit. | Corrigido |
| `backend/models/turma.model.js` | Vagas e turma selecionada nao podem ser decididas pelo frontend. Sem validacao server-side haveria risco de inscricao em turma errada, fora da idade ou acima da ocupacao. | Model centraliza criacao/edicao de turmas, valida oficina, periodo, horario, idade, vagas e vinculos; inscricao e chamada validam `turma_id` no backend. | Smoke test cobre listagem publica sem PII e chamada rejeitando aluno fora da turma. | Corrigido |

## Observacoes Residuais

- CPF, telefone e nome continuam armazenados nos cadastros administrativos quando necessarios ao atendimento. A protecao aplicada e controle de acesso, resposta minima no Portal e redacao em auditoria, nao exclusao dos dados operacionais.
- O armazenamento privado de documentos depende da configuracao de banco/storage e das politicas de backup e retencao da operacao. Essas politicas devem ser confirmadas antes de carregar dados reais adicionais.
- Listagens administrativas ainda retornam PII completa para `ADM`/`Master`, pois essas funcoes operam cadastros. Revisoes futuras podem separar permissoes de leitura e exportacao caso a equipe necessite de menor privilegio.
- A matricula aparece de forma intencional apenas na nova area autorizada e nos cartoes PDF destinados a entrega; o procedimento operacional deve evitar compartilhamento de PDF ou mensagem fora do aluno/responsavel correto.
