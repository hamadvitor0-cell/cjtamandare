# Notas de Migracao de Seguranca - 2026-05-24

## Fluxo Legado do Portal

`POST /inscricoes/status`, que anteriormente aceitava CPF e data de nascimento, esta aposentado. A rota permanece somente como resposta compativel e retorna `410 Gone` sem consultar ou expor cadastro:

```json
{ "message": "Consulta indisponivel. Acesse o Portal do Aluno com CPF e matricula." }
```

O unico fluxo oficial para dados do Portal e `POST /suporte/login`, usando CPF e matricula.

## Versao de Sessao

As tabelas `admins` e `alunos` passam a ter a coluna `token_version INTEGER NOT NULL DEFAULT 0`. A aplicacao inclui a versao no JWT (`ver`) e a valida no servidor em cada requisicao autenticada.

Consequencias esperadas:

- tokens antigos sem `ver` deixam de acessar ADM/Portal apos o deploy;
- troca de papel, inativacao ou troca de codigo de ADM invalida sessoes emitidas;
- o endpoint Master `POST /admin/usuarios/:id/revogar-sessoes` encerra as sessoes administrativas do usuario;
- o endpoint ADM/Master `POST /alunos/:id/revogar-sessoes` encerra as sessoes do aluno;
- logout normal continua removendo o cookie no navegador.

O seed executado automaticamente por `AUTO_MIGRATE` apenas cria o Master ausente e nao regrava credenciais existentes em cada instancia serverless. Para uma rotacao intencional do codigo Master, execute `npm run seed:admin` em ambiente controlado; a operacao atualiza o codigo e incrementa `token_version`.

## Redacao de Logs Historicos

Antes de executar em producao, obtenha backup do banco ou snapshot conforme a politica operacional. O script nao imprime os dados pessoais: apenas a quantidade analisada/alterada.

Dry-run em PowerShell, com variaveis de banco ja carregadas no ambiente:

```powershell
$env:DRY_RUN="true"
npm run migrate:audit-redaction
Remove-Item Env:DRY_RUN
```

Aplicacao definitiva:

```powershell
npm run migrate:audit-redaction
```

O script e idempotente. Ele:

- limpa identificacao textual/e-mail antigo do ator, preservando `admin_id`;
- redige campos sensiveis em objetos e arrays aninhados de metadata;
- preserva acao, papel, timestamp, status e IDs internos;
- pode ser executado novamente sem corromper registros previamente redigidos.

Validacao posterior:

1. Consultar a tela/API de logs com perfil Master.
2. Pesquisar amostras historicas que antes continham CPF, telefone, matricula ou mensagem.
3. Confirmar que somente valores mascarados ou `[redacted]` sao retornados.

## Store Distribuido de Rate Limit

O codigo suporta Upstash Redis (`RATE_LIMIT_STORE=redis`) e PostgreSQL/Neon (`RATE_LIMIT_STORE=postgres`). A instalacao automatica do Upstash requer que o titular aceite os termos do Marketplace Vercel; ate esse aceite, o store PostgreSQL permite ativar rate limiting distribuido no banco ja conectado sem usar memoria de instancia.

## Distribuicao Manual de Matriculas

A area administrativa `Primeiro Acesso` adiciona as colunas:

- `alunos.first_access_completed_at`
- `alunos.access_guidance_sent_at`
- `alunos.access_guidance_sent_by`

E cria a tabela `student_access_guidance_events`, contendo somente IDs internos, tipo de acao, metodo e metadata operacional minimizada. A tabela nao armazena CPF, telefone, matricula, nome ou mensagem enviada.

O primeiro login valido atualmente disponivel (`CPF + matricula`) preenche `first_access_completed_at`. Para alunos existentes, o campo nasce vazio e indica acessos registrados apos esta implantacao; nao ha reconstrucao de acessos historicos anteriores. A aplicacao ainda nao possui criacao ou autenticacao por senha do aluno; por isso as mensagens geradas orientam somente o fluxo realmente ativo.

Operacao:

1. ADM ou Master acessa `Primeiro Acesso`.
2. Filtra por oficina/turma/status.
3. Copia a mensagem ou abre um link individual do WhatsApp para envio humano.
4. Marca a orientacao somente depois do contato.
5. Para entrega presencial, gera PDF apenas com filtro de turma/oficina e trata o arquivo como informacao restrita.

As rotas do modulo exigem sessao administrativa, rejeitam o perfil `Chamadas`, usam rate limit compartilhado existente, CSRF nas mutacoes e resposta privada `no-store`.

## Manual ADM Integrado

O manual administrativo deixou de ser um documento HTML separado. O painel agora possui a secao interna `Manual ADM`, cujo conteudo e solicitado por `GET /admin/manual` apenas depois da autenticacao e somente para perfis `ADM` e `Master`.

Comportamento da rota antiga:

- `/admin-manual.html` e `/admin-manual` nao entregam mais o documento antigo;
- sem sessao, a resposta e `401`;
- com sessao ADM/Master, a rota redireciona para `/admin.html#manual`;
- o perfil `Chamadas` recebe `403` e permanece limitado ao modulo de frequencia.

O manual integrado documenta a operacao segura de `Primeiro Acesso`, inclusive contato manual individual e cuidado com PDFs de matriculas. Ele descreve apenas o fluxo atual do Portal (`CPF + matricula`) e nao promete autenticacao por senha do aluno, que ainda nao existe nesta aplicacao.

## Turmas por Oficina e Vagas por Turma

O modulo de turmas passa a ser a fonte principal para vagas publicas e inscricoes:

- nova tabela `turmas` com oficina, nome, dias da semana, periodo, horarios, faixa etaria, vagas, bolsista, local, observacoes e status;
- colunas opcionais `turma_id` em `inscricoes`, `alunos` e `chamadas`;
- tabela `aluno_turmas` para permitir que um aluno participe de varias oficinas, com no maximo uma turma escolhida por oficina no formulario ADM;
- oficinas antigas recebem uma turma geral criada a partir do cadastro legado quando ainda nao possuem turmas detalhadas;
- inscricoes antigas sem turma continuam validas e aparecem como `Turma nao definida` ate a equipe vincular manualmente;
- o campo legado de vagas da oficina fica apenas como compatibilidade. A exibicao publica usa a soma das vagas das turmas ativas.

Regras novas:

1. ADM/Master cria ou edita turmas em `Turmas`.
2. A inscricao publica exige turma quando a oficina possui turmas ativas.
3. O backend valida oficina, turma ativa, faixa etaria e ocupacao antes de salvar.
4. Turma lotada entra como `lista_espera`.
5. Chamadas usam `turma_id` quando disponivel e rejeitam alunos fora da turma.
6. No cadastro de alunos, a selecao de turmas e feita por cards filtrados pelas oficinas escolhidas e pela idade informada; o backend valida novamente a faixa etaria e impede mais de uma turma por oficina.

## Otimizacao de Leitura Publica e ADM

As rotinas de leitura foram separadas das rotinas de preparacao do banco:

- `RUNTIME_DATABASE_SETUP=false` impede DDL e backfills no caminho normal de requisicoes de producao;
- `/oficinas` agrega a ocupacao das turmas a partir de uma unica consulta de turmas publicas, sem repetir a contagem legada por oficina;
- a home renderiza skeleton imediatamente, reutiliza cache local apenas de conteudo publico e revalida APIs em segundo plano;
- o ADM carrega a pagina ativa sob demanda em vez de buscar todos os modulos no login;
- `/alunos` passa a ser listagem paginada leve, e `GET /alunos/:id` carrega a ficha completa apenas quando o ADM solicita edicao.

Indice adicionado para aplicacao em migracao controlada:

- `idx_alunos_status_created (status, created_at DESC)` para filtros e ordenacao da lista administrativa;
- `idx_alunos_nome_lower (LOWER(nome))` para ordenacao/busca basica.

Nao execute migracoes automaticamente em requests da Vercel. Em um ambiente novo, aplique primeiro o schema/migracoes e confirme as tabelas de turmas antes de manter `RUNTIME_DATABASE_SETUP=false`.
