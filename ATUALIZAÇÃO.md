# ATUALIZAÇÃO

> Arquivo oficial de continuidade do projeto CRM COC Macapá. Atualizar este documento após cada etapa relevante.

## Última atualização

**Data:** 17/10/2026  
**Projeto em foco:** somente CRM COC Macapá Norte.

## Ambiente confirmado

- Repositório: `charlyjhone/crm-coc-macapa`.
- Branch de produção: `main`.
- Render workspace: `CRM COC`.
- Serviço de produção: `crm-escola`.
- URL: https://crm-escola-s8jg.onrender.com
- Supabase COC: projeto `crm-escola`, ref `fenqnbzdjnyvgrmjczoi`, status `ACTIVE_HEALTHY`.
- Última versão de frontend verificada como `live`: commit `93ef6ca8`, em 17/10/2026 às 14:13 UTC.
- AIMEDU e o projeto separado CRM Escolas/Conceito não fazem parte desta execução.

## Alterações concluídas

- Ana: fluxo de coleta de dados, resumo e confirmação explícita antes do cadastro; envio do folder e agendamento de visita implementados.
- Identificação do atendente nas mensagens manuais e correções recentes das funções WhatsApp.
- Publicadas as Edge Functions `school-triage` v64, `send-whatsapp-message` v13 e `zapi-webhook` v19.
- Restrições de escrita direta no banco: famílias, alunos, vínculos, oportunidades, visitas e tarefas usam RPCs validadas; logs e históricos sensíveis ficam somente para leitura pelo navegador.
- Logs das funções sanitizados para não expor conteúdo de mensagens nem dados pessoais.
- Tela **Captação → Famílias e alunos** agora inclui **Editar cadastro**.
- A edição permite corrigir dados do responsável (nome, nome de preferência, telefone, e-mail, autorização de WhatsApp e observações) e dos alunos (nome, nome de preferência, nascimento, escola atual e observações).
- RPC `update_school_family` aplicada no Supabase COC, com verificação de papel, validação do vínculo entre aluno e família, prevenção de telefone duplicado e registro pela trilha de auditoria.
- Teste transacional da RPC aprovado com dados sintéticos; os registros de teste foram removidos.
- PR #50 mesclado; build do Render concluído e deploy marcado como `live`.

## Estado dos dados

Após a limpeza dos registros sintéticos, o conjunto escolar de teste tem 2 responsáveis, 2 alunos, 2 oportunidades, 0 visitas e 0 tarefas. Preservar os dados reais; não criar dados fictícios persistentes.

## Pendências prioritárias

1. Renato confirmar na interface que o botão **Editar cadastro** aparece e abre o formulário; não é necessário enviar captura de tela.
2. Validar uma edição completa com um registro sintético temporário ou um registro autorizado para teste, sem modificar dados reais por engano.
3. Testar no WhatsApp real: coleta de dados pela Ana → resumo → confirmação → cadastro único; incluir um teste de correção antes da confirmação.
4. Enviar mensagem manual pelo CRM e confirmar no aparelho que aparece o nome do atendente.
5. Testar a pesquisa de satisfação após encerramento e confirmar o callback de entrega da Z-API. Não declarar o fluxo homologado até confirmar a entrega real.
6. Implementar atribuição/reatribuição de oportunidades e tarefas entre atendentes.
7. Revisar painel de configuração da Ana, permissões de Direção/Secretaria, proteção contra senhas comprometidas e política de MFA.
8. Formalizar processo LGPD para origem/base legal, retirada de consentimento, retenção/exportação e exclusão, especialmente de dados de menores.
9. Revisar índices e políticas RLS com métricas reais, sem remover índices apenas por aparecerem como não utilizados.

## Próximo passo exato

Pedir ao Renato para abrir **Captação → Famílias e alunos**, clicar em **Editar cadastro** em um dos registros e confirmar se o formulário abre e exibe os dados. Pode fechar com **Cancelar**; não precisa salvar alterações em uma família real. Depois seguir para a validação controlada do fluxo WhatsApp/Z-API e da pesquisa de satisfação.


- Ana v65 publicada no Supabase COC: usa até quatro respostas humanas recentes e anonimizadas como referência de estilo e conteúdo escolar geral, priorizando assunto semelhante; informações oficiais sempre prevalecem.
- Corrigido o fluxo em que a família diz que prefere esclarecer dúvidas no dia da visita: Ana continua a coleta de interesse enquanto a secretaria ainda não respondeu, sem criar visita duplicada.
- Testes de regressão da Ana: 15 aprovados, 0 falhas no GitHub Actions.
