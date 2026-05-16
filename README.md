# Centro da Juventude Almirante Tamandaré

Portal institucional full stack para divulgação de oficinas, inscrições online, agenda, galeria, contato e painel administrativo.

## Stack

- Frontend: HTML5, CSS3, JavaScript Vanilla com módulos ES.
- Backend: Node.js + Express.
- Banco: PostgreSQL, pronto para Supabase.
- Segurança: Helmet, CSP, CORS controlado, rate limit, bcrypt, JWT em cookie httpOnly assinado, CSRF para ações administrativas, validação Joi, sanitização, logs e queries parametrizadas.

## Estrutura

```txt
/frontend
  /css
  /js
  /img
  index.html
  admin.html
  admin-manual.html

/backend
  server.js
  app.js
  /routes
  /controllers
  /middlewares
  /models
  /services
  /database
  /config
  /utils

/api
  index.js
```

## Conteúdo oficial usado

- Logo oficial: `frontend/img/logo.jpg`.
- Quadro de oficinas: `frontend/img/oficinas.png`.
- Oficinas cadastradas: Futsal, Vôlei, Basquete, Muay Thai, Judô, Capoeira, Ginástica, Dança Ritmos, Ballet, Danças Urbanas, Violão, Canto Coral, Bateria e Percussão, Teclado, Flauta Doce, Inglês, Informática, Xadrez, Libras, Pintura em Tela e Teatro.
- Datas gerais de inscrição 2026 e documentação foram baseadas na notícia da Prefeitura de Almirante Tamandaré publicada em 05/02/2026.
- Redes sociais e links rápidos foram alinhados ao Linktree oficial: Instagram, WhatsApp e Programa Bolsa Agente de Cidadania 14-17 anos.

## Instalação local

1. Instale Node.js 20+ e npm.
2. Crie o arquivo `.env` a partir do exemplo:

```bash
cp .env.example .env
```

3. Instale dependências:

```bash
npm install
```

4. Configure o PostgreSQL/Supabase:

```bash
psql "$DATABASE_URL" -f backend/database/schema.sql
psql "$DATABASE_URL" -f backend/database/content-schema.sql
```

5. Carregue as oficinas e imagens iniciais:

```bash
npm run migrate:content
```

6. Crie o administrador inicial:

```bash
npm run seed:admin
```

7. Inicie:

```bash
npm run dev
```

O site ficará em `http://localhost:3000` e o painel em `http://localhost:3000/admin.html`.

## Variáveis de ambiente

Obrigatórias em produção:

- `DATABASE_URL`: conexão PostgreSQL/Supabase.
- `PGSSL`: use `auto` por padrão; `false` para PostgreSQL local sem SSL; `true` para Supabase.
- `JWT_SECRET`: segredo forte com 64+ caracteres.
- `COOKIE_SECRET`: segredo forte diferente do JWT.
- `CORS_ORIGIN`: domínio autorizado do frontend.
- `COOKIE_SAME_SITE`: use `strict` para mesmo domínio; use `none` somente se frontend e backend estiverem em domínios diferentes com HTTPS.
- `NODE_ENV=production`.
- `TRUST_PROXY=true` em Render, Railway, Vercel ou proxy HTTPS.
- `AUTO_MIGRATE=true` pode ser usado na Vercel para aplicar schema e dados iniciais de forma idempotente no primeiro acesso da API.

Administrador inicial:

- `ADMIN_NAME`
- `ADMIN_REGISTRATION_CODE`: codigo de cadastro do master com exatamente 6 digitos.
- `ADMIN_EMAIL`: opcional, apenas para atualizar um master antigo que ainda esteja ligado a um e-mail.

O formulário público usa um puzzle CAPTCHA próprio, assinado no backend, sem dependência de chaves externas.

## Banco de dados

Execute `backend/database/schema.sql` no SQL Editor do Supabase ou via `psql`.

Dados de demonstração opcionais:

```bash
psql "$DATABASE_URL" -f backend/database/sample-data.sql
```

## API

Público:

- `GET /health`
- `GET /oficinas`
- `GET /galeria`
- `GET /captcha/challenge`
- `POST /inscricao` com `multipart/form-data`, puzzle CAPTCHA e anexos opcionais em `documentos`

Administrativo:

- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `GET /dashboard`
- `GET /admin/oficinas`
- `POST /admin/oficinas`
- `PUT /admin/oficinas/:id`
- `DELETE /admin/oficinas/:id`
- `GET /admin/galeria`
- `POST /admin/galeria`
- `PUT /admin/galeria/:id`
- `DELETE /admin/galeria/:id`
- `GET /alunos`
- `POST /alunos`
- `PUT /alunos/:id`
- `DELETE /alunos/:id`
- `GET /chamadas`
- `POST /chamadas`
- `GET /chamadas/historico`
- `GET /inscricoes`
- `GET /inscricoes/export/csv`
- `GET /inscricoes/:id/documentos`
- `GET /inscricoes/documentos/:id/download`
- `PUT /inscricoes/:id`
- `DELETE /inscricoes/:id`

As rotas administrativas exigem cookie JWT válido. `PUT`, `DELETE` e logout exigem token CSRF.

## Segurança implementada

- SQL Injection: todas as queries usam parâmetros `$1`, `$2`, etc.
- NoSQL Injection: payloads com chaves iniciadas por `$` ou contendo `.` são descartados na sanitização.
- XSS: sanitização no backend e renderização segura no frontend com DOM APIs e `textContent`.
- CSRF: double-submit token assinado para mutações administrativas.
- Brute force: rate limit específico em login.
- Spam: rate limit em inscrição, honeypot `website` e puzzle CAPTCHA validado no servidor.
- Verificação humana: o frontend carrega um desafio visual de encaixe, envia a posição resolvida e o backend valida assinatura, expiração, fingerprint do navegador, tempo mínimo e margem de erro antes de gravar a inscrição.
- Codigos administrativos: bcrypt com custo 12.
- Sessão ADM: JWT assinado, com expiração, em cookie `httpOnly`, `SameSite=Strict` e `Secure` em produção.
- Headers: Helmet com CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` e HSTS em produção.
- Erros: resposta genérica em produção, sem stack trace para o cliente.
- Logs: acesso via Morgan e erros estruturados; arquivo opcional com `LOG_TO_FILE=true`.
- Upload: documentos de matrícula aceitam PDF/JPG/PNG/WEBP, limite de 5 MB por arquivo e 8 arquivos por inscrição; a pasta não é pública e downloads exigem sessão ADM.

## Deploy seguro

### Supabase

1. Crie um projeto Supabase.
2. Copie a connection string PostgreSQL.
3. Rode `backend/database/schema.sql`.
4. Configure `DATABASE_URL` no provedor do backend.
5. Rode `npm run seed:admin` em ambiente seguro ou crie o admin com script de release.

### Render ou Railway

- Build command: `npm install`
- Start command: `npm start`
- Root directory: raiz do projeto.
- Configure as variáveis de ambiente.
- Defina `NODE_ENV=production` e `TRUST_PROXY=true`.

### Vercel

O projeto inclui `vercel.json` com frontend estático em `/frontend` e API Express em `/api/index.js`.

Variáveis necessárias no painel da Vercel:

- `DATABASE_URL`
- `PGSSL=true`
- `JWT_SECRET`
- `COOKIE_SECRET`
- `COOKIE_SAME_SITE=strict`
- `CORS_ORIGIN=https://seu-dominio.vercel.app`
- `NODE_ENV=production`
- `TRUST_PROXY=true`
- `AUTO_MIGRATE=true`

Depois do deploy, valide:

- `https://seu-dominio.vercel.app/health`
- envio de inscrição pública
- login ADM
- listagem, edição, exclusão e exportação CSV

## Versionamento

Com Git disponível:

```bash
git init
git add .
git commit -m "feat: cria portal full stack do centro da juventude"
git branch -M main
```

Depois, crie um repositório no GitHub com um nome como `centro-da-juventude-almirante-tamandare` e publique:

```bash
git remote add origin https://github.com/SEU_USUARIO/centro-da-juventude-almirante-tamandare.git
git push -u origin main
```

## Manutenção

- Atualize oficinas e horários em `frontend/js/data.js` e `backend/services/oficina.service.js`.
- Oficinas e galeria também podem ser gerenciadas pelo ADM. O arquivo `frontend/js/data.js` fica como fallback se a API estiver indisponível.
- Cada oficina possui capacidade obrigatória. Quando a capacidade é atingida, novas inscrições online entram automaticamente em lista de espera.
- O CPF unifica a ficha do aluno: a mesma pessoa pode entrar em várias oficinas, mas aparece uma única vez em `Inscritos`.
- O manual para novos administradores fica em `/admin-manual.html` e exige sessão ADM ativa.
- Para usar chamada, cadastre alunos no ADM, vincule o mesmo aluno a uma ou mais oficinas, selecione oficina e data em `Chamada`, carregue a lista, marque as presenças e salve.
- A ficha fica destacada em laranja quando o aluno soma mais de 2 faltas nos últimos 30 dias. Advertências e documentos pendentes podem ser registrados na ficha do ADM.
- Atualize telefone, redes sociais e endereço em `frontend/index.html`.
- Se frontend e backend forem publicados em domínios separados, configure `window.CJ_API_BASE_URL` em `frontend/js/runtime-config.js`.
- Nunca commite `.env`.
- Rotacione `JWT_SECRET` e `COOKIE_SECRET` em caso de suspeita de vazamento.
- Use roles futuras expandindo `admins.role` e o middleware `authorizeRoles`.
