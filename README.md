# CRM COC Macapá Norte

Sistema próprio de captação e matrículas do COC Macapá Norte.

## Escopo

- famílias, responsáveis e alunos;
- funil e oportunidades de matrícula;
- visitas e tarefas de captação;
- histórico de WhatsApp e e-mail;
- configurações escolares;
- atendente virtual Ana, ainda em diagnóstico e homologação.

## Desenvolvimento

Requisitos: Node.js e npm.

```sh
npm ci
npm run dev
```

Validação antes de publicar:

```sh
npm run build
npm run lint
```

O frontend é React, TypeScript e Vite. O Supabase fornece autenticação, banco e Edge Functions. Variáveis locais devem ficar em `.env` e nunca devem ser versionadas.

Antes de alterar a arquitetura, leia `AGENTS.md` e `CONTINUIDADE.md`.
