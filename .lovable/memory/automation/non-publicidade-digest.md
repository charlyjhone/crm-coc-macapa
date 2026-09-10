---
name: Digest diário não-publicidade
description: Edge function non-publicidade-digest envia ao Miguel resumo HTML de leads palestra/consultoria/mentoria/treinamento/curso/outros em aberto, agendado 09h BR seg-sex
type: feature
---

`supabase/functions/non-publicidade-digest/index.ts`:

- Susan NÃO faz follow-up automático para produtos não-publicidade. Em vez disso, gera digest diário ao Miguel.
- Critério: `status IN (em_aberto, em_negociacao)`, `archived=false`, `unclassified=false`, `produto IN (palestra, consultoria, mentoria, treinamento, curso, outros)` ou `produto IS NULL`. Exclui explicitamente publicidade.
- Para cada lead busca a última interação (email ou whatsapp, qualquer direção) e mostra: canal, direção (🟢 Cliente / 🔵 Miguel), data/hora BR, "X dias atrás", preview ≤240 chars.
- Inclui `ai_close_probability` colorido (verde ≥60, amarelo ≥30, cinza <30), `ai_diagnosis_reason` (truncado 280), `ai_next_step` (truncado 220), valor + moeda + status.
- Agrupa por produto, ordena por probabilidade desc dentro do grupo.
- From: Susan; To: `miguel@inventormiguel.com` (ou `settings.company_email`).
- Aceita body `{dry_run:true}` (não envia, retorna stats) e `{to:"..."}` para override de destinatário.
- Cron `non-publicidade-digest-daily`: `0 12 * * 1-5` (09h BR seg-sex) via pg_cron + pg_net.
