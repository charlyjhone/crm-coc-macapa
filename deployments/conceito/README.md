# CRM Colégio Conceito

Instalação independente autorizada por Renato em 16/10/2026. Projeto Supabase exclusivo: `xkcxvbagzxwwauofvlin`, atualmente chamado `CRM Escolas`, na organização AE SYSTEM, região `us-west-2`. O projeto COC continua separado em `fenqnbzdjnyvgrmjczoi`. AIMEDU permanece fora desta instalação.

## Banco e segurança

- Baseline exclusiva em `deployments/conceito/supabase/migrations/20261016152954_conceito_school_baseline.sql`. Não reaplicar migrations antigas da raiz no Conceito.
- 24 tabelas públicas com RLS, visão de previsão com `security_invoker`, funções escolares, auditoria e bucket privado `school-materials`.
- Nenhum contato, usuário, senha, secret, arquivo, cron ou callback do COC foi copiado.
- Em 17/10/2026 foram aplicadas e registradas as migrations `concept_crm_school_write_path_hardening`, `concept_crm_lead_column_permissions` e `concept_update_school_family_rpc`. Elas alinham as gravações escolares a RPCs/Edge Functions validadas, restringem escritas diretas do navegador e habilitam edição segura de famílias e alunos.
- A auditoria Supabase não aponta tabelas públicas sem RLS. As tabelas internas `ana_followups` e `crm_survey_claims` não têm políticas para clientes, intencionalmente. Os avisos de funções `SECURITY DEFINER` devem continuar sendo revistos conforme as funções forem habilitadas.
- Validação após as migrations: privilégios diretos do papel `authenticated` limitados a SELECT nas tabelas escolares protegidas; RPC `update_school_family` executável por autenticados e protegida por papel; RPCs de cadastro da Ana e alteração de perfil não executáveis por `anon` nem `authenticated`.

## Backend

Estão ACTIVE no Supabase Conceito: `admin-manage-users`, `complete-school-attendance`, `send-school-folder`, `send-whatsapp-message`, `zapi-webhook` e `school-triage`. As funções foram verificadas sem autenticação e recusam chamadas não autorizadas. Isso não comprova uma integração real com o WhatsApp.

## Interface publicada

- URL: https://crm-conceito.onrender.com
- Render Static Site: `crm-conceito`
- Repositório: `charlyjhone/crm-coc-macapa`, branch `main`
- Build: `npm ci && node scripts/build-conceito.mjs`
- Diretório publicado: `dist-conceito`
- Configuração pública aponta para o projeto `xkcxvbagzxwwauofvlin`, não para o banco COC.

O deploy inicial foi concluído e a publicação da atualização de segurança em 17/10/2026 ficou LIVE. Ainda é necessário configurar no painel Render o rewrite SPA `/*` → `/index.html`, para que a atualização direta de páginas internas funcione.

## Estado da configuração escolar

- Nome: `Colégio Conceito`.
- Nome provisório da atendente: `Assistente`.
- Informações institucionais e valores: ainda vazios.
- Atendente virtual e envio automático do folder: desativados.
- Folder PDF: ainda não enviado ao bucket privado.
- Segredos exclusivos de WhatsApp/Vault: ainda não configurados.
- Usuários Auth: zero. Nenhuma conta administrativa foi criada ainda.

A função `school-triage` ainda contém campanha de matrícula 2027 e horário de Macapá como valores padrão. Confirmar ano letivo, fuso horário, etapas e turnos do Conceito antes de ativar a atendente.

## Pendências para uso real

1. No Render, adicionar rewrite SPA `/*` → `/index.html`.
2. Criar o primeiro usuário em Supabase → Authentication → Users, com senha definida pelo próprio administrador e e-mail confirmado. Depois, atribuir o papel `admin` ao usuário correto. Não abrir cadastro público nem criar contas a partir de metadados editáveis.
3. Criar `charlyjhone77@gmail.com` como segundo usuário e atribuir também `admin`; confirmar ambos os perfis antes do uso.
4. Configurar Site URL e redirects Auth para `https://crm-conceito.onrender.com` e validar login.
5. Cadastrar informações oficiais do Conceito: endereço, etapas/turnos, horários, diferenciais, calendário e política de valores; definir o nome final da atendente.
6. Enviar o PDF final do folder (até 18 MiB) ao bucket privado e só depois ativar o envio.
7. Configurar os secrets exclusivos de IA e das RPCs/Vault do Conceito, incluindo `OPENAI_API_KEY` quando necessário; nunca reutilizar credenciais do COC.
8. Configurar secrets próprios `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`, `zapi_webhook_secret` e `REQUIRE_ZAPI_INSTANCE_ID=true` antes de configurar callbacks; nunca reutilizar credenciais do COC.
9. Configurar os callbacks de entrada e de mensagens enviadas pelo próprio aparelho na instância Z-API do Conceito, mantendo o callback de entrega separado; testar mensagens de entrada/saída, cadastro de interesse, visita, atendimento humano, pesquisa e envio do folder com número controlado; só então ativar a atendente.
10. O webhook recusa `instanceId` ausente ou divergente quando a validação é obrigatória/configurada e responde `503` se `REQUIRE_ZAPI_INSTANCE_ID=true` sem `ZAPI_INSTANCE_ID`.

Nunca reaplicar a baseline do Conceito no COC. Antes de ativar automações, confirmar que todos os segredos e callbacks apontam exclusivamente para o projeto do Conceito.
