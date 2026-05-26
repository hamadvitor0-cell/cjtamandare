# Ambiente de Seguranca - CJ Tamandare

## Rate Limit Distribuido

Operacoes sensiveis exigem store compartilhado em producao. Upstash Redis e a opcao preferida; PostgreSQL/Neon e suportado como fallback distribuido quando a instalacao do Marketplace ainda depende de aceite operacional. O processo recusa `memory` em producao, evitando protecao parcial em instancias serverless.

Variaveis esperadas:

| Variavel | Obrigatoria em producao | Uso |
| --- | --- | --- |
| `RATE_LIMIT_STORE=redis` ou `postgres` | Sim | Ativa o store distribuido. Redis e preferido; Postgres usa o banco ja conectado. |
| `UPSTASH_REDIS_REST_URL` | Somente se `redis`, ou alias Vercel | URL REST do Upstash. |
| `UPSTASH_REDIS_REST_TOKEN` | Somente se `redis`, ou alias Vercel | Token REST secreto do Upstash. |
| `RATE_LIMIT_KEY_PEPPER` | Recomendado como obrigatorio operacional | Pepper secreto usado no HMAC das chaves. |

A integracao Upstash do Vercel pode injetar `KV_REST_API_URL` e `KV_REST_API_TOKEN`. A aplicacao aceita esses nomes como aliases das variaveis `UPSTASH_REDIS_REST_*`.

Com `RATE_LIMIT_STORE=postgres`, a aplicacao usa a tabela `security_rate_limits` com incremento atomico e expiracao por janela. Em desenvolvimento/testes, use `RATE_LIMIT_STORE=memory`; isso nao e adequado para producao.

O store PostgreSQL falha fechado: se o banco estiver indisponivel ou exceder timeout, a operacao sensivel retorna `503` em vez de permitir tentativa sem limite. Monitorar latencia de cold start; migrar para Upstash Redis reduz o acoplamento do login ao banco operacional.

## Chaves de Limite

CPF, matricula e nome nunca compoem a chave persistida em texto puro. A chave e gerada com HMAC-SHA256 e `RATE_LIMIT_KEY_PEPPER`. Defina um pepper exclusivo, longo e nao reutilizado em outro sistema.

Endpoints sensiveis cobertos incluem:

- login ADM por IP e credencial;
- login Portal por IP, CPF e matricula;
- rota legada aposentada;
- criacao de tickets e anexos;
- exportacoes/documentos administrativos;
- envio de matricula por WhatsApp.

## Deploy Vercel

1. Preferencialmente, aceitar os termos do Upstash no Marketplace e provisionar a integracao Redis/KV no projeto de producao.
2. Para ativacao imediata sem o Marketplace, definir `RATE_LIMIT_STORE=postgres` usando o Neon existente.
3. Com Redis, confirmar as variaveis REST e definir `RATE_LIMIT_STORE=redis`; em ambos os stores, definir `RATE_LIMIT_KEY_PEPPER`.
4. Executar o deploy somente depois dessas variaveis estarem disponiveis.
5. Validar `429` em tentativas repetidas de login usando dados de teste, sem registrar CPF/matricula em logs.

Nao publique valores reais de token, pepper, URL de banco ou segredos em arquivos do repositorio ou mensagens de suporte.

## Setup de Banco e Performance Serverless

`RUNTIME_DATABASE_SETUP` controla a execucao de DDL, indices e backfills que antes podiam ocorrer durante requisicoes normais. Em producao, mantenha:

```env
AUTO_MIGRATE=false
RUNTIME_DATABASE_SETUP=false
```

Com essa configuracao, leituras da home, login e abertura do ADM nao tentam alterar schema a cada instancia fria da Vercel. Para banco novo ou migracao planejada:

1. Fazer backup/snapshot do banco.
2. Executar a migracao em janela controlada com a configuracao apropriada, ou habilitar `RUNTIME_DATABASE_SETUP=true` apenas durante a operacao validada.
3. Confirmar tabelas/indices e retornar `RUNTIME_DATABASE_SETUP=false` antes do uso normal.

O cache de oficinas, galeria, colaboradores, depoimentos e FAQ e feito somente no navegador com respostas publicas. Nenhum dado administrativo ou dado pessoal deve ser gravado nesse cache.
