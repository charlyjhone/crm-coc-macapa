# Auditoria do AE CRM — 01/10/2026

Escopo: `charlyjhone/crm-coc-macapa` na `main` (`d5675b5`), site público do Render e projeto Supabase `crm-escola` (`fenqnbzdjnyvgrmjczoi`). Inspeção somente leitura de código, esquema, políticas e funções publicadas. Não foram enviados WhatsApps/e-mails, criados cadastros, alteradas permissões ou feitos testes ofensivos.

## Estado verificado

- O site respondeu HTTP 200 e serviu o frontend atualizado de origem da pesquisa. `school-triage` v53, `send-whatsapp-message` v11, `zapi-webhook` v13 e `admin-manage-users` v4 estavam ativos.
- `npm run build` e `npx tsc --noEmit` passaram. `npm run lint` falhou com 240 erros e 13 avisos em arquivos existentes; ainda não há uma base limpa para usar lint como gate global.
- Banco: 59 contatos; zero responsáveis, alunos, oportunidades, visitas e tarefas escolares; quatro registros na auditoria; três usuários com papel (dois administradores e um usuário operacional). Pesquisa: uma resposta de origem e uma nota.
- Todas as tabelas `public` consultadas tinham RLS habilitado. `ana_followups`, `outlook_subscriptions` e `outlook_sync_state` sem políticas são intencionalmente inacessíveis ao cliente comum; revisar seu uso antes de mudar.

## Segurança — prioridade imediata

1. **Webhook Z-API aceita chamadas sem autenticação.** A função publicada `zapi-webhook` v13 está com `verify_jwt=false`, lê JSON sem validar segredo/assinatura e usa `SUPABASE_SERVICE_ROLE_KEY` para gravar mensagens e contatos. Um terceiro que alcance a URL pode simular eventos e acionar a triagem. Configurar segredo de callback na Z-API, validá-lo antes de processar o payload e testar com webhook legítimo antes de publicar. A URL/segredo não devem aparecer no frontend.
2. **Webhook legado de e-mail ainda ativo.** `resend-inbound-webhook` v5 está publicado com `verify_jwt=false`, não valida assinatura/segredo no início e contém automações Susan/Miguel, inclusive lógica comercial. Conferir se existe callback Resend apontando para ele e se segredos necessários estão presentes. Desativar o callback legado ou substituí-lo por fluxo escolar com assinatura validada. Não retirar a função às cegas antes de verificar dependências.
3. **Gerador de resposta de e-mail exposto.** `generate-email-reply` v8 está ativo com `verify_jwt=false`, não autentica o chamador e usa `OPENAI_API_KEY` quando configurada. Restringir a usuários operacionais válidos ou despublicar se não há fluxo escolar de e-mail.
4. **Função de acesso permissiva.** `public.user_can_access_lead(_user_id,_lead_id)` retorna apenas `_user_id IS NOT NULL`, ignora o contato e é usada em políticas de notas, anexos, entregas, reuniões e follow-ups. Qualquer conta autenticada pode atravessar essas políticas; substituir por regra explícita de papel/atribuição e testar as políticas antes de alterar.

## Segurança — prioridade alta

5. O assessor do Supabase apontou 12 funções `SECURITY DEFINER` executáveis por `authenticated`. Algumas verificam apenas `auth.uid() IS NOT NULL`; `recompute_all_enrollment_scores()` pode recalcular todas as oportunidades. Revisar cada RPC, aplicar verificação de papel no banco e revogar `EXECUTE` quando o cliente não precisar dela. `register_ana_enrollment`, `set_crm_user_role` e `verify_school_triage_secret` estavam corretamente restritas ao `service_role`.
6. `school_capacity` tem política `ALL TO authenticated USING (true) WITH CHECK (true)`; qualquer conta autenticada pode alterar/excluir a capacidade. `leads` e mensagens também permitem leitura/alteração a qualquer sessão autenticada, sem validar um papel operacional. Definir se o acesso de secretaria será global por escola; exigir papel válido e, ao oferecer instâncias compartilhadas, isolamento por escola. Nunca usar apenas a proteção da rota React como autorização.
7. A proteção contra senhas vazadas aparece **desativada** no assessor de segurança do Supabase. Ativar no Auth e revisar política de senha/MFA para administradores. O frontend mantém sessão persistente com renovação automática, sem expiração por inatividade configurada pelo aplicativo; definir política para computadores da secretaria.
8. `notify-lead-status-change` v10 permanece público (`verify_jwt=false`) e lê `lead_id`/status do corpo sem autenticação no início. O gatilho `trg_notify_status_change_email` ainda está presente em `leads`. Verificar se o fluxo antigo está em uso e exigir autenticação interna antes de qualquer efeito externo.

## Funcionalidade e manutenção

1. **Funil ainda não homologado:** zero registros de família/aluno/oportunidade/visita/tarefa. Testar cadastro pela Ana com confirmação, idempotência, handoff humano, cadastro manual, mudança de etapa, visita, tarefa e matrícula usando um contato de teste autorizado.
2. A pesquisa de origem/nota teve um teste real antes da troca das opções. Testar a lista nova no WhatsApp, o fallback em texto, reenvio/duplicatas, e conferir as quatro categorias no gráfico em sessão autenticada. A página limita cada consulta a 1.000 eventos; planejar paginação/agregação quando o volume crescer.
3. O repositório mantém páginas e funções legadas de Susan/Miguel (`Inbox`, `PromptsTab`, `resend-inbound-webhook` etc.). Algumas não estão nas rotas, porém funções publicadas e gatilhos ainda podem executar. Mapear dependências antes de remover; não reintroduzir automações comerciais.
4. Não há script `test` em `package.json`, nem verificação automática de ponta a ponta visível nesta auditoria. Criar um gate mínimo de build, TypeScript, lint dos arquivos novos e testes de permissão/fluxos críticos. Corrigir gradualmente os 240 erros atuais do lint.
5. A instalação ainda é específica do COC. Para vender a outras escolas, definir provisionamento separado de Supabase/Render, credenciais, webhooks, templates, marca, políticas, backup/restauração e teste de isolamento. Não reutilizar o banco atual para outra escola.

## Limites desta auditoria

Não foi possível observar a tela autenticada do Render nesta sessão, nem confirmar configuração externa do callback Z-API/Resend, backups, MFA, política real de sessão no Auth ou entrega real de e-mail/WhatsApp após as mudanças. A presença de código legado publicado indica superfície de risco, mas não prova que o callback esteja configurado ou que houve exploração. Não foram examinados todos os componentes históricos do repositório nem feito pentest.

## Ordem proposta

1. Proteger os webhooks e funções públicas; validar callbacks reais.
2. Corrigir `user_can_access_lead`, políticas abertas e RPCs privilegiadas com testes de papel.
3. Ativar proteção de senhas vazadas; decidir MFA e timeout para administradores/secretaria.
4. Homologar o fluxo escolar e a pesquisa com dados de teste próprios.
5. Desativar fluxos legados comprovadamente sem uso e estabelecer testes/backup para expansão.
