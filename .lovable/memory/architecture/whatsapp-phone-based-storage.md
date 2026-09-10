---
name: WhatsApp Phone-Based Architecture
description: Mensagens de WhatsApp pertencem a um número, não a um lead; cache recalculado por trigger, UI busca por variantes de telefone
type: feature
---
Mensagens de WhatsApp são associadas EXCLUSIVAMENTE a um número de telefone (`phone`), nunca a um `lead_id`. O lead "vê" as mensagens cujo phone bate com alguma variante dos seus telefones (`leads.phone` + `leads.phones[]`).

**Banco:**
- `whatsapp_phone_variants(text)` → gera variantes (com/sem 55, com/sem 9º dígito).
- `resolve_lead_ids_by_phone(text)` → leads que possuem aquele telefone.
- `recompute_lead_whatsapp_cache(uuid)` → recalcula `whatsapp_inbound_count`, `whatsapp_outbound_count`, `last_inbound_message[_at]`, `last_outbound_message[_at]`.
- Trigger único `whatsapp_message_recompute_caches_trigger` (AFTER INSERT/UPDATE/DELETE) chama recompute para cada lead que casa.
- `log_whatsapp_message` e `trigger_detect_lead_language` resolvem lead via telefone.
- `purge_unclassified_lead` deleta WA por telefone, preservando variantes compartilhadas.

**Frontend:**
- Helpers em `src/lib/whatsappPhone.ts`.
- Queries de mensagens usam SEMPRE `.in('phone', variants)`, nunca `.eq('lead_id', ...)`.
- `OpportunityDetail` chama `supabase.rpc('recompute_lead_whatsapp_cache', { p_lead_id })` on-mount.

**Edge functions:**
- `send-whatsapp-message`, `zapi-webhook` inserem com `lead_id: null`.
- Coluna `whatsapp_messages.lead_id` mantida só por compatibilidade — não usar.
