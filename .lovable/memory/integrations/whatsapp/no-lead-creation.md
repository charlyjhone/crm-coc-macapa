---
name: WhatsApp lead creation rules
description: zapi-webhook só cria lead via comando explícito /palestra,/publicidade,etc. Sem comando, mensagens ficam órfãs (lead_id=null).
type: constraint
---

Política Miguel (jun/2026, revisada): **WhatsApp só cria lead quando Miguel envia um comando explícito de produto.**


Regras aplicadas em `supabase/functions/zapi-webhook/index.ts`:

1. **Telefone já vinculado a algum lead existente** (qualquer status, inclusive `entregue`):
   - Mensagem é salva com `lead_id=null` e `phone` normalizado.
   - Cache do lead é recalculado por trigger via `recompute_lead_whatsapp_cache` (associação por telefone).
   - NÃO clona "oportunidade recorrente" mesmo quando o cliente está `entregue`.

2. **Telefone totalmente novo** (nenhum lead existente):
   - Mensagem é salva como órfã (`lead_id=null`, `phone` preservado).
   - **NÃO cria lead `unclassified`** automaticamente.
   - Miguel cria lead manualmente quando quiser; ao adicionar o telefone ao lead, as mensagens já existentes aparecem automaticamente (arquitetura phone-based).

3. **Eventos @lid sem match**: mensagem salva como órfã (`lead_id=null`) para reconciliação posterior via `reconcile-whatsapp-orphans`.

4. **Exceção — comando de produto enviado pelo Miguel** (STEP 8.7): se a mensagem `outbound` contém `/palestra`, `/publicidade`, `/consultoria`, `/mentoria`, `/treinamento` ou `/documentario`:
   - Se NÃO existe lead → CRIA lead com `produto` = comando, `status=em_aberto`, telefone normalizado e dispara `triggerAutoDescription`.
   - Se existe lead não classificado → classifica com o produto.
   - Se já classificado → apenas remove o comando do texto.
   - Este é o ÚNICO caminho de criação de lead via webhook WhatsApp.

