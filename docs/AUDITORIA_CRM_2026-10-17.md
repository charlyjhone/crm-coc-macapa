# Auditoria do CRM Escolar COC — 17/10/2026

## Escopo

- Código revisado na referência main em 27bde84, incluindo fluxo da Ana, atendimento manual, agenda, tarefas, cadastro de famílias, papéis, auditoria e Edge Functions.
- Banco COC crm-escola (fenqnbzdjnyvgrmjczoi); nenhuma alteração aplicada ao projeto separado do Colégio Conceito.
- Render não foi inspecionado nesta rodada: há mais de um workspace disponível e a seleção precisa ser confirmada antes de abrir serviços ou fazer qualquer alteração.

## Correções aplicadas no banco

Migration 20261017130455_crm_school_write_path_hardening aplicada no COC.

- Tabelas de famílias, alunos, vínculos, oportunidades, visitas e tarefas passaram a permitir leitura pela equipe autenticada, mas as gravações são feitas pelas RPCs validadas. Isso evita contornar regras do funil, agenda e tarefas via REST direto.
- Histórico de atendimento, mensagens de WhatsApp/e-mail, anexos e logs de entrega passaram a ser somente leitura pelo cliente; as gravações ficam nas Edge Functions confiáveis com service_role.
- Corrigido o trigger de pontuação da visita: a exclusão em cascata de uma oportunidade não tenta recalcular uma oportunidade que já foi removida.
- Revogado EXECUTE do cliente na função de trigger, que é executada pelo PostgreSQL e não precisa ser chamada por RPC.

### Teste transacional após a migration

Aprovado com rollback:

- leitura legítima continua permitida;
- privilégios de escrita direta foram removidos das tabelas protegidas;
- cadastro manual via create_school_enrollment continuou funcionando;
- agendamento via schedule_school_visit continuou funcionando;
- exclusão da oportunidade com visita em cascata concluiu sem erro;
- os dados sintéticos foram revertidos, sem alteração persistente.

Estado do conjunto escolar após a limpeza: 2 responsáveis, 2 alunos, 2 oportunidades, 0 visitas e 0 tarefas. Não foram encontrados alunos sem responsável, oportunidades sem responsável/aluno, visitas/tarefas órfãs, telefones duplicados entre responsáveis ou oportunidades ativas sem próxima ação.

## Segurança e privacidade

- As tabelas do CRM têm RLS; as políticas principais exigem perfil admin ou user (Secretaria). A amostra de funções SECURITY DEFINER revisada verifica o papel necessário. O advisor ainda lista 13 funções privilegiadas executáveis por usuários autenticados; são RPCs/helper functions usados pelo CRM e devem continuar sendo revisadas por assinatura e autorização, não revogadas em bloco.
- A proteção de senhas comprometidas do Supabase Auth está desativada. Ativar no painel de Auth se a opção estiver disponível no plano.
- A trilha de auditoria administrativa é somente leitura pelo cliente; a gravação é feita por triggers.
- O webhook Z-API já valida segredo antes de processar payloads. Após a mesclagem do PR #47, as Edge Functions zapi-webhook v19, send-whatsapp-message v13 e school-triage v64 estão ACTIVE no COC. Os logs foram sanitizados para não imprimir mensagens, números, nomes, e-mails, LIDs ou objetos de erro com dados pessoais. Nenhuma mensagem foi enviada durante a publicação.
- delivery_logs continua vazio. Aceitação de envio pelo provedor não comprova entrega no aparelho; o callback precisa ser validado com um teste controlado.

## Desempenho e manutenção

Avisos atuais do advisor após a correção: 26 casos de inicialização repetida de funções Auth em políticas RLS, 13 chaves estrangeiras sem índice de cobertura, 2 pares de índices duplicados, 13 índices sem uso observado e 4 conjuntos de políticas permissivas sobrepostas. Não remover índices apenas por falta de uso; revisar carga real e impacto antes de qualquer remoção. As sobreposições em capacidade/unidades e a otimização das políticas RLS podem ser tratadas em uma rodada separada.

## Lacunas funcionais a priorizar

1. Testar no WhatsApp real a sequência: coleta dos dados → resumo → confirmação explícita → cadastro único no CRM; testar também uma correção antes da confirmação.
2. Enviar uma mensagem manual pelo CRM e conferir no aparelho a assinatura com o nome do atendente. Testar pesquisa de satisfação após concluir atendimento.
3. Confirmar recebimento do callback de entrega Z-API; não declarar homologação completa antes disso.
4. Implementar edição segura dos dados de responsável/aluno; atualmente a tela lista famílias e permite criar, mas não oferece um fluxo completo de edição.
5. Adicionar atribuição/reatribuição explícita de oportunidades e tarefas entre atendentes, com visão de responsável e carga de trabalho.
6. Definir perfis adicionais além de admin e user/Secretaria para a futura oferta SaaS, se necessário.
7. Formalizar processo LGPD: registro da origem/base de contato, retirada de consentimento, retenção/exportação e exclusão de dados, especialmente de menores.
8. Ativar proteção contra senhas comprometidas e confirmar política de MFA/recuperação de conta.
9. Otimizar índices e políticas após coletar métricas; preservar a separação de banco, Auth, Storage, secrets e WhatsApp por escola.

## Pendências operacionais

- Renato deve executar o teste controlado de WhatsApp, pois envolve conversa real e validação no aparelho.
- Antes de consultar o estado de deploy, confirmar se o workspace Render a usar é CRM COC (e não AIM.Edu).
- O frontend não foi alterado nesta rodada; a migration de segurança foi aplicada diretamente ao banco COC e está registrada em supabase/migrations/.
