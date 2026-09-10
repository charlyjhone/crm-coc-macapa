---
name: Follow-up Engine
description: followup-engine restrito a produto=publicidade, 72h dias úteis, classifica inbound (waiting/responsive/declined) via IA
type: feature
---

`supabase/functions/followup-engine/index.ts`:

- **APENAS** `produto = 'publicidade'` (filtro `.eq("produto", "publicidade")` na query). Susan não automatiza follow-up para palestra/consultoria/mentoria/curso/outros — esses ficam para Miguel responder manualmente.
- Status elegíveis: `em_aberto`, `em_negociacao`. Ignora archived/unclassified.
- Intervalo: 72h corridas desde a âncora, pulando sábado/domingo (reagenda para segunda 09:00 BR).
- Âncora = última outbound OU última inbound classificada como `waiting`.
- Classifica inbound via Gemini Flash em `waiting` / `responsive` / `declined`:
  - `responsive` → skip (bola está conosco, Miguel responde)
  - `declined` → skip permanente
  - `waiting` → segue esteira
- Máx 7 follow-ups consecutivos sem resposta real → marca `scheduled_followups.completed`.
- `force_all=true` ignora gate de 72h e fim de semana.
- `lead_id=<uuid>` permite rodar para um lead específico (mas ainda exige `produto=publicidade`).
