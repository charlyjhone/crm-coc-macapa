---
name: Susan proposal intent gating
description: Susan only sends automated proposals (with price) for publicidade leads. All other products are created silently for manual reply.
type: feature
---

`resend-inbound-webhook` → `generateAndSendProposal`:

1. AI extraction (tool calling) always returns `product_type` (publicidade | palestra | mentoria | consultoria | curso | outros). Classifier is conservative: speaker/keynote/palestra/evento → NEVER publicidade.

2. If new lead AND `product_type === 'publicidade'`:
   - Create lead with `valor=PROPOSAL_VALUE (US$ 3.000)`, `moeda=USD`, `produto='publicidade'`.
   - Generate + send Susan's standard publicidade proposal email.

3. If new lead AND `product_type !== 'publicidade'`:
   - Create lead with `produto=<product_type>`, `valor/moeda = NULL` (Miguel sets price manually).
   - Save inbound email.
   - RETURN with `email_sent: false`. Susan sends NOTHING.

4. For existing leads, the gate already exists later in the flow (only publicidade gets auto-proposal). Same principle applies.

Hard rule: Susan must NEVER quote a price in an automated email for non-publicidade products. The default US$ 3.000 value is publicidade-only.
