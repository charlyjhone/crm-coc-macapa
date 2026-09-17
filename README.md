# CRM COC Macapá Norte

CRM escolar para captação, atendimento e acompanhamento de famílias interessadas no COC Macapá Norte.

## Escopo

- Recebimento de contatos por WhatsApp e e-mail
- Triagem inicial de matrícula, currículo, horário e localização
- Encaminhamento para a secretaria quando a conversa exigir atendimento humano
- Histórico unificado de mensagens
- Gestão de oportunidades e pendências
- Indicadores de atendimento e conversão

## Arquitetura

- Frontend: React, TypeScript e Vite
- Backend: Supabase (PostgreSQL, Auth, Storage e Edge Functions)
- WhatsApp: Z-API
- E-mail: Resend
- IA: gateway configurável para triagem e apoio ao atendimento
- Transcrição: OpenAI/ElevenLabs, conforme secrets configurados

## Segurança

As Edge Functions privilegiadas exigem autenticação. Nunca registre chaves no repositório.

Secrets necessários incluem:

- `INTERNAL_FUNCTION_SECRET`
- `MCP_SERVER_TOKEN`
- `ZAPI_WEBHOOK_SECRET`
- `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`
- `LOVABLE_API_KEY`
- `OPENAI_API_KEY` quando a transcrição OpenAI estiver ativa
- `RESEND_API_KEY`

Buckets com documentos e anexos devem permanecer privados e usar URLs assinadas.

## Desenvolvimento

```sh
npm install
npm run lint
npm run build
```

O projeto principal está no Supabase identificado em `supabase/config.toml`. Alterações de banco devem ser versionadas em `supabase/migrations`.

## Implantação

Antes de publicar:

1. revisar e aplicar as migrações;
2. cadastrar os secrets;
3. confirmar a autenticação dos webhooks;
4. validar RLS e acesso aos buckets;
5. executar os testes de WhatsApp, e-mail, triagem e transferência humana.
