# Reconciliação do CRM — 24/09/2026

## Fontes verificadas
- main: d5fbc3f (21/09).
- Branch publicada de continuidade: cleanup/remove-unused-legacy-files, 051afbe.
- Produção: crm-escola. Ana v46, envio WhatsApp v9, webhook Z-API v11.
- Nova branch: fix/reconcile-crm-continuity.

## Código recuperado e corrigido
- Restaurada rota protegida /atendimentos e item Fila da secretaria.
- Removidos SidebarTrigger sem provider e link para /opportunity/:id inexistente.
- zapi-webhook sincronizado com o código da v11 obtido do Supabase, sem republicar função.
- school-triage do GitHub comparado com a v46: mesmo conteúdo (desconsiderando newline final).
- Aplicada migration 20260924222929_restrict_system_settings_writes_to_admin.
- Mantida leitura autenticada; INSERT e UPDATE exigem is_admin(auth.uid()).
- Teste real das policies com papéis authenticated/admin e authenticated/user: admin insere/atualiza; user não insere, não atualiza e não faz upsert. ROLLBACK integral; zero linhas técnicas restantes.

## Migrations: comparação material, sem reexecutar histórico
| Arquivo local | Evidência em produção | Histórico remoto |
| --- | --- | --- |
| 20260922090000_remove_school_triage_trigger_credential | Substituída posteriormente pelo trigger protegido | Registrada sob 20260922124525 |
| 20260922180000_align_ana_v41_phone_and_rules | Zero mensagens identificadas como Ana sem sender_type=ana; não prova todos os efeitos históricos | Ausente |
| 20260922183000_ana_handoff_followups | Tabela, colunas, constraints, RLS e restrição de acesso presentes; cron foi substituído pela versão protegida | Ausente |
| 20260922184500_harden_trigger_function_permissions | Nenhuma função SECURITY DEFINER pública executável por anon; triggers internos restritos | Ausente |
| 20260922203000_secure_school_triage_ingress | Funções verificadas, trigger com header interno e cron protegido ativos | Ausente |
| 20260922210000_resolve_handoff_on_human_reply | Corpo da função e trigger presentes; anon/authenticated sem EXECUTE | Ausente |
| 20260924222929_restrict_system_settings_writes_to_admin | Aplicada e testada nesta sessão | Presente |

Os timestamps da fundação escolar também divergem entre arquivos e histórico remoto.
Não se alterou schema_migrations para declarar falsamente que arquivos locais foram executados.
Não executar db push em produção nem recriar ambientes a partir desta pasta sem preparar uma baseline revisada. A reconciliação completa do histórico antigo permanece pendente; a nova correção está registrada com o mesmo timestamp no GitHub e no banco.

## Documentação que não corresponde ao código recuperável
A atualização 051afbe contém descrições de alterações locais de 23/09, mas não contém seus commits de implementação. O commit 23c9112 não existe nos objetos/branches recuperados.
- Fila da Secretaria: reconstruída nesta sessão.
- Proteção administrativa: reconstruída, aplicada e testada nesta sessão.
- Webhook v11: recuperado da produção nesta sessão.
- Identidade VITE_SCHOOL_*, workflow de CI, validação de build para publicação e docs/ARQUITETURA_MULTI_ESCOLA.md: não constavam na branch remota. Não considerar implementados; recuperar os arquivos originais ou implementar em uma etapa própria.
- A main permanece antiga até a revisão e merge do PR. Este trabalho não publica o frontend.

## Evidência operacional de WhatsApp
Consulta agregada, sem ler mensagens nem enviar WhatsApp:
- 46 callbacks humanos nos últimos sete dias.
- 7 conversas com resposta humana.
- 2 dessas conversas tiveram inbound nas quatro horas após a última resposta humana.
- Nenhuma das 7 teve outbound marcado como Ana nesse intervalo após a última resposta humana.
A amostra é compatível com a pausa, mas não comprova todos os cenários de handoff, cancelamento e retomada. Manter teste controlado completo pendente.

## Validação e limites
- Build: 3.461 módulos, aprovado.
- ESLint direcionado: App, AppTopNav e Atendimentos aprovados.
- Teste transacional de RLS aprovado; dados escolares preservados.
- Advisor: permanecem avisos prévios de funções SECURITY DEFINER, tabelas internas sem policies e proteção contra senhas vazadas. Não houve revogação em massa.
- Interface autenticada não testada nesta sessão.
- Repositório ainda público; privacidade, proteção da main e rotação de credencial antiga continuam pendentes.

Referências oficiais dos avisos:
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/auth/password-security

## Atualização em 25/09/2026

Foram corrigidos localmente: preview sem efeitos colaterais, ausência de configuração oficial, falhas técnicas com handoff, qualificação de matrícula, pausa humana, follow-up, autorização de envio, fila com histórico/resposta, Inbox sem rota comercial e deduplicação de telefone. As migrations de follow-up manual e telefone foram aplicadas e o fluxo escolar transacional passou com rollback.

As republicações posteriores das Edge Functions não puderam ser executadas porque a revisão automática atingiu o limite de uso. As versões já ativas continuam funcionando; o PR contém o código corrigido para a próxima publicação autorizada.
