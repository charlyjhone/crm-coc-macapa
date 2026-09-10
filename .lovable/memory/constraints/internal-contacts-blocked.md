---
name: Internal contacts blocked from lead creation
description: Funcionários (telefone/e-mail) listados em _shared/internal-contacts.ts nunca viram lead. zapi-webhook descarta mensagens deles.
type: constraint
---

Funcionários da equipe NÃO podem ser cadastrados como leads/clientes.

Arquivo: `supabase/functions/_shared/internal-contacts.ts`
- `INTERNAL_PHONES`: telefones (somente dígitos, com DDI) — match por igualdade ou últimos 10 dígitos
- `INTERNAL_EMAILS`: e-mails em minúsculas
- Helpers: `isInternalPhone(phone)`, `isInternalEmail(email)`

Uso atual:
- `zapi-webhook/index.ts` — early-exit logo após normalizar o telefone; mensagem é descartada (não cria lead, não anexa, não salva como órfã).

Contatos atuais:
- Yuri Kimoro — 558898028762 (editor)

Para adicionar novo funcionário: editar a lista no arquivo compartilhado. Se aparecer um lead criado por engano, apagar manualmente (lead + whatsapp_messages + email_messages).
