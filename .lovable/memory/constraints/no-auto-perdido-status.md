---
name: No Auto Perdido Status
description: Status 'perdido' é EXCLUSIVAMENTE manual — nenhuma automação (webhook, IA, worker, follow-up) pode alterar status para perdido
type: constraint
---

**REGRA PERMANENTE E INEGOCIÁVEL:** Nenhum código automático (edge functions, webhooks de e-mail/WhatsApp, worker de IA, follow-up engine, MCP tools chamadas pela IA, triggers SQL) pode alterar `leads.status` para `'perdido'`.

- Cancelamento de reunião, "não temos interesse", "vamos passar", silêncio, rejeição de orçamento → **não** marcam perdido automaticamente.
- Se a IA detectar sinal de desistência/cancelamento, deve **apenas** inserir uma nota em `lead_notes` com prefixo `[IA]` para avaliação manual do Miguel.
- Aplica-se a todos os produtos (palestra, consultoria, publicidade, mentoria, curso, outros).
- `status = 'perdido'` só é definido via UI/ação manual do usuário ou via MCP quando explicitamente comandado pelo Miguel no chat.

**Why:** Perda de leads reais por classificação automática errada (ex: cancelamento de reunião confundido com fim do deal). Custo de falso positivo é altíssimo; custo de manter aberto é zero.

**How to apply:** Ao criar/editar qualquer função que processe e-mails ou mensagens, se houver detecção de decline/cancelamento → gerar nota, nunca `update({ status: 'perdido' })`.
