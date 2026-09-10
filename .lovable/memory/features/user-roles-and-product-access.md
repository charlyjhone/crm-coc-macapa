---
name: User roles & product access
description: Multi-user with role (admin/user) + per-product access; admin-only pages; RLS by product
type: feature
---
- `app_role` enum: `admin`, `user`. Tabela `user_roles` (user_id, role), `user_product_access` (user_id, produto).
- Admin único inicial: `miguel@inventosdigitais.com.br` (id `6111a728-695c-4a2e-bf1d-6618d769dfc0`).
- Função `is_admin(uuid)` + `user_can_access_lead(uuid, lead_id)` (SECURITY DEFINER).
- RLS: leads + tabelas relacionadas (whatsapp_messages, email_messages, lead_notes, meetings, activity_log, worker_actions, scheduled_followups, delivery_logs, email_attachments) liberam SELECT/UPDATE só para admin OU lead.produto ∈ produtos do usuário.
- Leads sem produto: somente admin enxerga.
- Edge function `admin-manage-users` (verify_jwt=false, valida JWT manualmente + `is_admin`): actions `list`, `create`, `update_products`, `update_password`, `delete`. Service role para `auth.admin.*`. Senhas fracas são aceitas (não há validação extra).
- Páginas admin-only: `/configuracoes`, `/insights`, `/unclassified`, `/usuarios` (envoltas em `<AdminRoute>`).
- Sidebar usa `useUserRole()` para esconder itens com `adminOnly`.
- Inbox e Worker Mode dependem das queries de leads/mensagens — RLS já filtra automaticamente por produto.
- Produtos disponíveis: publicidade, consultoria, palestra, mentoria, treinamento.
