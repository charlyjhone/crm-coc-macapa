# CRM Colégio Conceito

Instalação independente autorizada por Renato em 16/10/2026. Organização Supabase: AE SYSTEM (`uailpmrcipmrlykdpyvd`). Projeto exclusivo: `xkcxvbagzxwwauofvlin`, atualmente chamado `CRM Escolas`; nome solicitado `CRM CONCEITO` ainda depende de alteração no painel. Região existente: `us-west-2`, mantida. Não foi criado outro projeto nem contratado plano pago.

O COC foi transferido para a mesma organização, mantendo o projeto `fenqnbzdjnyvgrmjczoi`, São Paulo, atualmente `crm-escola`; nome solicitado `CRM COC` ainda pendente. AIMEDU permanece fora desta instalação.

## Banco aplicado

- Baseline própria em `supabase/migrations/20261016152954_conceito_school_baseline.sql`, neste diretório de implantação. Não executar as migrations antigas da raiz no Conceito.
- 24 tabelas com RLS, visão de previsão com `security_invoker`, 51 funções públicas escolares/de compatibilidade, auditoria privada, políticas e bucket privado `school-materials`.
- Estrutura obtida do catálogo atual do COC e revisada; nenhuma linha, usuário, senha, secret, arquivo, cron ou callback do COC foi copiado. Excluídas tabelas de reuniões comerciais, workers, prompts antigos e Outlook. Tabelas auxiliares ainda referenciadas pelo frontend foram mantidas vazias.
- Agente e envio de folder desligados. Nome da escola `Colégio Conceito`; nome provisório do agente `Assistente`; informações e valores vazios.
- Trigger de triagem aponta somente para o projeto Conceito e verifica o agente ativo antes de qualquer chamada. Segredos de Vault ainda não configurados; nenhuma credencial foi copiada.
- Migration `20261016153113_conceito_restrict_platform_event_trigger.sql` restringe EXECUTE do event trigger `rls_auto_enable`, criado pela própria plataforma, para impedir exposição a clientes.
- Auditor: nenhuma tabela pública sem RLS; os avisos de RPC autenticada correspondem a funções com guardas de papel. As tabelas internas `ana_followups` e `crm_survey_claims` não têm políticas para cliente, intencionalmente.

## Backend publicado

Versão 1 ACTIVE de `admin-manage-users`, `complete-school-attendance`, `send-school-folder`, `send-whatsapp-message`, `zapi-webhook` e `school-triage`. Código da base escolar corrente; autenticação interna preservada. `complete-school-attendance` mantém verify_jwt=true; as demais verificam autenticação dentro do handler. Todas responderam HTTP 401 a POST sem autenticação. Isso não comprova integração WhatsApp ou login de operador.

## Interface pronta para publicação

Build: `npm ci && node scripts/build-conceito.mjs` a partir da raiz do repositório.

Diretório publicado: `dist-conceito`. Configurar rewrite SPA `/*` → `/index.html` no Render.

Serviço proposto: `crm-conceito`, Static Site, repositório `charlyjhone/crm-coc-macapa`, branch que contém esta entrega. Ainda não criado: o conector Render exige confirmação explícita do workspace. Disponíveis `CRM COC` e `AIM.Edu`; preferência proposta para `CRM COC`, aguardando Renato.

`public-config.json` contém somente identidade e chave publicável (não é secret). O script fixa URL/chave/referência do Conceito e não herda o banco COC da configuração da raiz. Teste do bundle confirmou ausência das referências COC/AIMEDU.

## Validação concluída

- Build Conceito, TypeScript, ESLint dos arquivos principais alterados e 13 testes locais aprovados.
- `verify-visits.sql`: usuário sintético sem senha/sessão, cadastro pelo serviço, agenda, repetição, confirmação, notas, reagendamento, conclusão, histórico, datas inválidas, etapas avançadas e bloqueio sem perfil. Tudo em rollback.
- Cadastro manual de família e auditoria também testados em rollback.
- Consulta posterior: zero contatos, responsáveis, alunos, visitas e usuários Auth. Nenhum WhatsApp enviado.

## Pendências para uso real

1. Renomear os dois projetos no painel Supabase; o conector não oferece atualização de nomes.
2. Confirmar workspace Render, publicar o Static Site e configurar rewrite SPA.
3. Criar primeiro usuário administrador pelo Auth com senha definida de forma segura; atribuir `admin` ao ID confirmado. Não abrir cadastro público nem criar conta automaticamente a partir de metadados editáveis.
4. Configurar Site URL e redirects Auth com o endereço publicado; validar login e cadastro pela interface.
5. Cadastrar informações oficiais, valores, séries, horários e nome final da atendente. A função corrente usa campanha 2027 e horário de Macapá; confirmar adequação com a escola antes de ativar.
6. Configurar secrets próprios `OPENAI_API_KEY`, `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`; gerar secrets exclusivos no Vault `school_triage_webhook_secret` e `zapi_webhook_secret`, respeitando os nomes esperados pelas RPCs.
7. Configurar callbacks na instância Z-API do Conceito somente após autorização de compartilhamento do novo segredo com o provedor. Testar número controlado, intervenção humana, pesquisa e entrega; só então ligar agente.

Não reconectar sincronização automática do GitHub/Supabase antes de revisar a pasta correta de migrations. Nunca reaplicar esta baseline no COC.
