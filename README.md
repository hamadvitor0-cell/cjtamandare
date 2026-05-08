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
- `RECAPTCHA_SITE_KEY`: chave de site do Google reCAPTCHA v3.
- `RECAPTCHA_SECRET_KEY`: legacy secret key correspondente, usada somente no backend quando a validação for pelo `siteverify`.
- `RECAPTCHA_ENTERPRISE_PROJECT_ID`: ID do projeto Google Cloud quando a validação for pela API Enterprise.
- `RECAPTCHA_ENTERPRISE_API_KEY`: API key de servidor com acesso ao reCAPTCHA Enterprise, quando usada a API Enterprise.
- `RECAPTCHA_MIN_SCORE`: score mínimo aceito no reCAPTCHA v3, por padrão `0.5`.
- `NODE_ENV=production`.
- `TRUST_PROXY=true` em Render, Railway, Vercel ou proxy HTTPS.
- `AUTO_MIGRATE=true` pode ser usado na Vercel para aplicar schema e dados iniciais de forma idempotente no primeiro acesso da API.

Administrador inicial:

- `ADMIN_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

No painel do Google reCAPTCHA, autorize os domínios em que o site será aberto, incluindo `localhost` e `127.0.0.1` para teste local e o domínio final de produção.

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
- `POST /inscricao` com `multipart/form-data`, reCAPTCHA e anexos opcionais em `documentos`

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
- Spam: rate limit em inscrição, honeypot `website` e Google reCAPTCHA v3 validado no servidor.
- Verificação humana: o frontend gera o token invisível do reCAPTCHA na ação `inscricao` e o backend confirma `success`, `action` e `score` diretamente com o Google antes de gravar a inscrição. Para chaves Google Cloud reCAPTCHA Enterprise, configure `RECAPTCHA_ENTERPRISE_PROJECT_ID` e `RECAPTCHA_ENTERPRISE_API_KEY`; para integrações legadas, use a `RECAPTCHA_SECRET_KEY`.
- Senhas: bcrypt com custo 12.
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
- `RECAPTCHA_SITE_KEY`
- `RECAPTCHA_SECRET_KEY`
- `RECAPTCHA_ENTERPRISE_PROJECT_ID` e `RECAPTCHA_ENTERPRISE_API_KEY` se estiver usando chave Enterprise sem legacy secret key
- `RECAPTCHA_MIN_SCORE=0.5`
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
- O manual para novos administradores fica em `/admin-manual.html` e exige sessão ADM ativa.
- Para usar chamada, cadastre alunos no ADM, vincule o mesmo aluno a uma ou mais oficinas, selecione oficina e data em `Chamada`, carregue a lista, marque as presenças e salve.
- Atualize telefone, redes sociais e endereço em `frontend/index.html`.
- Se frontend e backend forem publicados em domínios separados, configure `window.CJ_API_BASE_URL` em `frontend/js/runtime-config.js`.
- Nunca commite `.env`.
- Rotacione `JWT_SECRET` e `COOKIE_SECRET` em caso de suspeita de vazamento.
- Use roles futuras expandindo `admins.role` e o middleware `authorizeRoles`.
