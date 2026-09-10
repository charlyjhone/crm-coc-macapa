---
name: Follow-up sequence counting and guards
description: Rules for when followup-publicidade may send. Avoids duplicates over active conversations.
type: feature
---

`followup-publicidade` checks BEFORE sending:

1. **Inbound recente (48h)**: se houve qualquer email inbound do cliente nas últimas 48h → cancela `scheduled_followups` e pula. Evita follow-up automático sobre conversa viva.
2. **Último email inbound**: se o último email do thread é inbound → cancela e pula (bola está com a gente, não com o cliente).
3. **unansweredCount == 0**: cliente já respondeu desde o último outbound → cancela e pula.
4. **Último outbound < 24h**: pula (intervalo mínimo).
5. **unansweredCount >= MAX_FOLLOWUPS (7)**: marca completed.

Aplicado em ambos os modos: `force_all` (streaming + non-streaming) e `queue` normal.

Manual forwards do Miguel não são contados separadamente — qualquer outbound após o último inbound entra em `unansweredCount`.
