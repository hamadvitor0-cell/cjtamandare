# Checklist de Segurança - CJ Tamandare

Data da revisao: 2026-05-24

Este documento registra controles validados no codigo e verificacoes que devem ser executadas antes de uso com dados reais.

## Classificacao de Rotas

| Superficie | Acesso esperado | Controle principal |
| --- | --- | --- |
| `/`, oficinas, galeria, FAQ, inscricao | Publico | validacao, sanitizacao, CAPTCHA/rate limit e upload allowlist |
| `/portal` | Pagina publica de login; dados internos exigem aluno autenticado | cookie HttpOnly + CPF/matricula |
| `/suporte/portal`, tickets, anexos, feedback | Somente o proprio aluno | `requireStudentAuth` e vinculacao por `sub` |
| `/admin`, `/dashboard`, alunos, suporte, mural, relatorios | ADM ou Master | `requireAuth` + `authorizeRoles` |
| `/admin/manual` | ADM ou Master | `requireAuth` + `authorizeRoles`; conteudo interno `no-store` |
| `/admin-manual.html` | Rota aposentada | Sem sessao `401`; ADM/Master redireciona para `#manual`; Chamadas `403` |
| `/admin/logs`, `/admin/usuarios` | Master | `masterOnly` |
| `/chamadas` | Chamadas, ADM ou Master | `attendanceOnly`; resposta reduzida para Chamadas |

## Validacao Manual

| Area | O que testar | Resultado esperado | Status | Observacoes |
| --- | --- | --- | --- | --- |
| Login Portal | CPF e matricula corretos | Entra somente no proprio portal | Automatizado | `npm run security:test` |
| Login Portal | CPF correto e matricula errada; CPF errado | Mensagem unica: `CPF ou matricula invalidos.` | Automatizado | Evita enumeracao |
| Login Portal | Muitas tentativas para o mesmo CPF/matricula | Retorna HTTP 429 temporariamente | Automatizado | Em producao usa store distribuido Postgres ou Redis |
| Rate limit producao | Repetir rota legada aposentada sem dado real | Respostas `410,410,410,429` pelo store compartilhado | Validado em producao | Store PostgreSQL ativo; primeiro cold start pode falhar fechado |
| Sessao Portal | Logout e nova consulta ao portal | Retorna HTTP 401 e nao entrega dados | Automatizado | Verificar tambem botao Voltar no navegador real |
| Dados Portal | Resposta do aluno | CPF mascarado; token sem CPF/matricula/nome | Automatizado | Matricula visivel apenas ao proprio aluno |
| ADM | Abrir endpoint administrativo sem login | Retorna HTTP 401 | Automatizado | |
| RBAC Chamadas | Abrir logs/alunos/tickets por URL ou request manual | Retorna HTTP 403 | Parcialmente automatizado | Logs cobertos; testar telas restantes |
| RBAC Master | Rebaixar ultimo Master ativo | Operacao recusada com HTTP 409 | Automatizado | |
| Sessao ADM | Rebaixar ou revogar usuario com token ja emitido | Proxima requisicao retorna HTTP 401 | Automatizado | `token_version` e conferido no servidor |
| Chamada | Enviar ID de aluno fora da turma | Retorna HTTP 403 e nao grava presenca | Automatizado | |
| Chamada | Perfil Chamadas carrega turma | Recebe nome/status/presenca, sem CPF/telefone/responsavel | Automatizado | |
| XSS | Enviar `<script>`, `<img onerror>`, `<svg onload>` em ticket/aviso/FAQ | Conteudo nao executa script | Parcialmente automatizado | Ticket coberto; validar telas ADM no browser |
| CSRF | POST administrativo ou do portal sem token | Retorna HTTP 403 | Automatizado | Ticket coberto; repetir para alteracoes ADM |
| Upload anexo | PNG valido e arquivo falso com MIME PNG | Valido funciona; falso retorna HTTP 415 | Automatizado | |
| Upload planilha | XLSX com extensao correta e conteudo falso | Retorna HTTP 415 | Automatizado | Testar XLSX real na operacao |
| WhatsApp | Telefone vazio/invalido; telefone valido | Falha amigavel; URL apenas para ADM/Master | Manual | Resposta nao deve conter CPF |
| Primeiro Acesso | Acessar `/admin/primeiro-acesso/alunos` sem sessao ou como Chamadas | Retorna HTTP 401/403 sem matrículas | Automatizado | Somente ADM/Master |
| Primeiro Acesso | Listar, copiar mensagem e marcar orientacao | CPF/telefone mascarados; evento sem mensagem, CPF, telefone ou matrícula | Automatizado | Contato permanece manual e individual |
| Primeiro Acesso | Gerar PDF sem filtro e com filtro de oficina/turma | Sem filtro retorna 422; filtrado gera PDF privado | Automatizado | PDF deve ser guardado e entregue com controle |
| Manual ADM | Abrir `/admin/manual` sem sessao ou como Chamadas | Retorna HTTP 401/403 sem entregar o guia completo | Automatizado | Manual interno apenas para ADM/Master |
| Manual ADM | Abrir `/admin-manual.html` autenticado e nao autenticado | ADM/Master redireciona para `#manual`; sem sessao retorna 401 | Automatizado | HTML externo aposentado |
| Turmas ADM | Criar/editar/inativar/excluir turma | Exige ADM/Master, CSRF e validacao backend de oficina, horario, idade e vagas | Automatizado parcial | Exclusao bloqueia quando ha vinculos |
| Inscricao por turma | Enviar inscricao manipulando `turmaId` | Backend valida que a turma pertence a oficina, esta ativa e aceita a idade informada | Automatizado parcial | Turma lotada entra em lista de espera |
| Chamada por turma | Enviar presenca de aluno fora da turma | Retorna 403 e nao salva chamada adulterada | Automatizado | Valida `turma_id` quando disponivel |
| Manual ADM | Buscar e expandir secoes dentro do painel | Filtra localmente, sem enviar termos ao backend ou aos logs | Manual | Conteudo sem dados reais de alunos |
| Logs | Criar/alterar aluno ou ticket | Log sem CPF/telefone/matricula/nome em metadata | Automatizado/Manual | Confirmar no banco real apos migracao historica |
| Logs antigos | Executar script em dry-run e aplicacao | Metadata historica redigida sem apagar rastreabilidade | Codigo testado/Operacional pendente | `npm run migrate:audit-redaction` |
| Exportacao CSV | Campo iniciando em `=`, `+`, `-`, `@` | Valor neutralizado na planilha | Codigo revisado | Criar arquivo de teste antes de uso real |
| Headers | Abrir resposta de producao | CSP, HSTS, frame denial, nosniff, policy presentes | Validado em producao | Deploy de 2026-05-24 |
| Indexacao | Abrir `/admin` e `/portal` | `X-Robots-Tag: noindex` e Portal com meta noindex | Validado em producao | Portal com `no-store` |
| CORS | Requisicao com origem externa nao autorizada | Bloqueada com HTTP 403 e sem permissao CORS | Validado em producao | |
| Secrets | Revisar Vercel Environment Variables | Segredos fortes, sem preview em banco real | Manual obrigatorio | Nunca compartilhar valores |
| Dependencias | Executar auditoria npm | Nenhuma vulnerabilidade alta/critica sem plano | Automatizado | `npm audit --json` |

## Controles Implementados

- Sessao administrativa recarrega usuario e papel atuais do servidor antes de autorizar cada endpoint.
- JWT do Portal contem apenas identificador interno, papel de aluno e versao revogavel.
- Sessao do aluno consulta os dados pelo identificador autenticado; CPF recebido do cliente nao escolhe o registro.
- CPF exibido no Portal e feedbacks e mascarado.
- Logs aplicam redacao recursiva de CPF, telefone, matricula, nome, mensagens e documentos.
- Tentativas autenticadas de acesso a modulo proibido geram registro de auditoria `denied`.
- Perfil `Chamadas` recebe somente os campos necessarios para frequencia.
- Gravacao de chamada rejeita IDs fora da turma/oficina selecionada.
- O ultimo Master ativo nao pode ser rebaixado ou inativado.
- A rota legada `/inscricoes/status` foi aposentada e responde `410` sem consultar dados por CPF/nascimento.
- Login Portal e ADM possuem limite por IP e por identificador; tickets, anexos, exportacoes e envio de matricula possuem limites dedicados.
- O rate limit sensivel usa Redis/Upstash quando `RATE_LIMIT_STORE=redis` ou PostgreSQL/Neon compartilhado quando `RATE_LIMIT_STORE=postgres`; `memory` e recusado em producao.
- Tokens administrativos e do aluno possuem `token_version` validado no servidor e endpoints administrativos de revogacao.
- Upload de documentos valida assinatura; importacoes validam assinatura XLSX ou formato CSV basico.
- Resposta de WhatsApp nao retorna CPF e aceita somente numeros normalizados validos.
- A ferramenta `Primeiro Acesso` permite orientar alunos manualmente, com listagem paginada, mensagem individual e PDF filtrado; perfil `Chamadas` permanece sem acesso.
- Eventos de orientacao registram apenas IDs internos, tipo de acao, metodo e filtros minimizados; nao armazenam mensagem, CPF, telefone ou matricula.
- Um login valido no Portal marca `first_access_completed_at`; neste codigo o acesso efetivamente ativo permanece `CPF + matricula`, sem promessa de senha ainda inexistente.
- O `Manual ADM` e carregado por endpoint protegido somente para ADM/Master; o HTML externo foi aposentado e redireciona sessoes autorizadas para a secao interna.
- O conteudo do manual nao inclui dados reais de alunos e explica o fluxo efetivamente ativo do Portal (`CPF + matricula`).
- Paginas privadas recebem politica de nao indexacao/cache; deploy define headers de seguranca adicionais.
- `.env.example` nao oferece codigo Master padrao pronto para uso.
- O cache de carregamento rapido da home armazena apenas conteudo publico; listagens administrativas continuam `no-store` e nao usam armazenamento persistente no navegador.
- O schema/backfill nao executa em requisicoes normais de producao quando `RUNTIME_DATABASE_SETUP=false`, reduzindo custo e evitando mutacao inesperada no caminho de leitura.

## Pendencias Operacionais para Producao Real

- Definir um `RATE_LIMIT_KEY_PEPPER` forte no Vercel; o store distribuido pode ser ativado imediatamente via Neon (`RATE_LIMIT_STORE=postgres`).
- Para migrar do fallback PostgreSQL para a opcao preferida Redis, o titular deve aceitar os termos do Upstash no Marketplace e definir `RATE_LIMIT_STORE=redis` com as variaveis REST.
- Fazer backup/snapshot do banco e executar `DRY_RUN=true npm run migrate:audit-redaction`, seguido da aplicacao definitiva para logs historicos.
- Confirmar politicas de backup, retencao e acesso ao banco/storage de documentos conforme LGPD.
- Revisar separacao de banco para previews da Vercel antes de carregar dados reais.
- Definir procedimento interno de custodia e descarte dos PDFs de orientacao, pois eles contem matriculas destinadas a entrega individual.

## Cobertura OWASP Top 10

| Categoria | Status | Evidencia principal |
| --- | --- | --- |
| A01 Broken Access Control | Corrigido | RBAC servidor, ownership por ID interno e fluxo legado aposentado |
| A02 Cryptographic Failures | Corrigido parcialmente | cookies seguros/JWT minimizado e revogavel; retencao/storage dependem da operacao |
| A03 Injection | Corrigido | validacao/sanitizacao existente e CSV injection neutralizado |
| A04 Insecure Design | Corrigido | matricula/portal, ultimo Master, revogacao e rota legada bloqueada |
| A05 Security Misconfiguration | Corrigido | headers, noindex, env exemplo seguro, CORS allowlist |
| A06 Vulnerable Components | Validado | auditoria npm sem vulnerabilidades registradas na revisao |
| A07 Identification/Auth Failures | Corrigido em codigo; ativacao no deploy | Store distribuido Postgres/Redis e credenciais genericas; exige pepper Vercel |
| A08 Software/Data Integrity | Corrigido parcialmente | lockfile/auditoria e validacao de upload; revisar CI/deploy continuamente |
| A09 Logging/Monitoring Failures | Corrigido em codigo; migracao pendente | auditoria redigida, script historico e Master-only; executar no banco real |
| A10 SSRF | Nao aplicavel identificado | Integracao IA usa destino configurado, sem URL arbitraria de usuario |
