# ATUALIZAÇÃO — CONTINUIDADE E PRÉ-OPERAÇÃO

> Documento oficial de continuidade do CRM COC Macapá Norte. Atualizar após cada etapa relevante. Este documento é exclusivo do CRM COC; CRM Conceito e AIMEDU são projetos separados.

## Última atualização

**Data:** 17/10/2026 — 16h58, horário de Macapá  
**Objetivo atual:** auditar o que já existe, validar o mínimo indispensável e preparar o CRM para uso real sem abrir uma reforma interminável.

## Ambiente confirmado

- Repositório: `charlyjhone/crm-coc-macapa`.
- Branch: `main`.
- Render: serviço `crm-escola`, URL https://crm-escola-s8jg.onrender.com.
- Render está com auto-deploy por commit habilitado. O repositório também alimenta o serviço separado `crm-conceito`; alterações neste documento não alteram a lógica escolar, mas podem disparar builds nos dois sites.
- Supabase COC: projeto `crm-escola`, ref `fenqnbzdjnyvgrmjczoi`, status anteriormente confirmado `ACTIVE_HEALTHY`.
- Não alterar o banco, os usuários, as credenciais ou os dados do COC para resolver pendências do Conceito. Nunca misturar configurações, contatos ou segredos entre as escolas.

## Funcionalidades já implementadas

### Captação, famílias e matrículas
- Cadastro de responsável, aluno e oportunidade de matrícula.
- Edição de dados do responsável e dos alunos em **Captação → Famílias e alunos**.
- Funil de matrícula com etapas como novo interessado, tentativa de contato, contato realizado, qualificado, visita agendada/realizada, condições apresentadas, documentação pendente, matrícula em conclusão, matriculado, nutrição e perdido.
- Próxima ação e data de acompanhamento na oportunidade; há campos de responsável atribuído.
- Histórico de mudança de etapa e funções de banco para criar/concluir tarefas.
- Área **Tarefas e follow-ups** com prioridade, prazo, tarefas atrasadas/para hoje/próximas/sem prazo e possibilidade de agendar a próxima ação ao concluir uma tarefa.
- Área **Visitas escolares** com agendamento, status, reagendamento e registro da impressão da família, objeções e notas de acompanhamento.

### WhatsApp, Ana e atendimento humano
- Ana coleta nome do responsável, nome do aluno e série pretendida; quando os dados estão completos, envia resumo e só grava após confirmação explícita. Correções devem gerar novo resumo; confirmação do cadastro não equivale à confirmação da visita.
- Fluxo de visita exige data e horário explicitamente informados; a escola ainda precisa confirmar disponibilidade. A visita não deve ser duplicada.
- O CRM permite enviar mensagem manual e identificar o atendente.
- A tela **Atendimentos** tem filtros para urgentes, atenção, novos, aguardando secretaria, matrículas, respondidos pelo agente, resolvidos e todos.
- A Ana pode encaminhar para a secretaria, continuar respondendo dúvidas autônomas enquanto a família aguarda e evitar repetir mensagens de encaminhamento. Há lógica para retomar depois de 4 horas sem resposta humana; validar o comportamento no WhatsApp real antes de depender dele em produção.
- O sistema possui fluxo de pesquisa de satisfação/origem após encerramento e uma ação **Verificar pesquisa**. A existência do fluxo no código não comprova entrega real no WhatsApp.
- O envio manual do folder foi relatado como funcionando em teste. Isso não comprova, por si só, que o envio automático pela Ana esteja habilitado.

### Versões de backend verificadas no Supabase COC
- `school-triage`: v66, ACTIVE.
- `zapi-webhook`: v19, ACTIVE.
- `send-whatsapp-message`: v13, ACTIVE.
- `complete-school-attendance`: v3, ACTIVE.
- `send-school-folder`: v1, ACTIVE.

## Fotografia técnica do banco — 17/10/2026

Consulta somente de leitura; contagens agregadas, sem expor dados pessoais.

| Item | Contagem observada |
|---|---:|
| Responsáveis (`guardians`) | 2 |
| Alunos (`students`) | 2 |
| Oportunidades de matrícula | 2 |
| Visitas escolares | 0 |
| Tarefas de captação | 0 |
| Mensagens WhatsApp históricas | 2.750 |
| Mensagens recebidas | 1.202 |
| Mensagens enviadas | 1.548 |
| Follow-ups da Ana | 120 |
| Follow-ups com status enviado | 37 |
| Follow-ups cancelados | 83 |
| Registros de reivindicação de pesquisa | 6, todos com status enviado |
| Registros em `delivery_logs` | 0 |
| Histórico de etapas do funil escolar | 0 |
| Logs de auditoria | 59 |

As duas oportunidades escolares estão na etapa `novo_interessado`. Os totais de mensagens/follow-ups incluem o histórico legado; não representam, por si só, comprovação de que cada mensagem foi entregue ou respondida. As contagens são uma fotografia de momento e devem ser atualizadas após a homologação.

A tabela legada `leads` contém 176 contatos não arquivados no momento da consulta: 29 com `aguardando_secretaria`, 44 com `respondido_agente` e 103 com `resolvido`. Uma consulta preliminar encontrou 51 contatos cuja última mensagem recebida é posterior à última enviada: 6 estão em `aguardando_secretaria`, 38 em `resolvido` e 7 em `respondido_agente`. Isso **não significa automaticamente 51 mensagens sem resposta** — o estado, a pesquisa e o histórico precisam ser cruzados. Os 29 casos em `aguardando_secretaria` continuam exigindo revisão, mesmo quando a última saída parece posterior à entrada.

## Achados da auditoria inicial

1. **O CRM já tem base para acompanhar tarefas e prazos.** As telas e funções existem, mas há zero tarefas cadastradas; precisamos testar o fluxo completo pela interface.
2. **A atribuição ainda precisa de validação operacional.** Existem campos de responsável nas oportunidades/tarefas, mas a distribuição e reatribuição entre atendentes e a visibilidade de cada responsável ainda não foram homologadas.
3. **Há contatos em handoff que precisam ser revisados.** Os 29 casos em `aguardando_secretaria` não devem ser simplesmente encerrados em massa. Identificar quais ainda exigem retorno e atribuir um responsável.
4. **Correção da fila “Pendentes de resposta” publicada em 17/10.** O hook `src/hooks/usePendingLeads.ts` agora considera mensagens WhatsApp com `lead_id` ou relacionadas por telefone/variantes e identificadores `@lid`, pagina o histórico além do limite de 1.000 linhas e não exclui contatos apenas por status ou classificação. O commit `34e54d7c0265a9b57c01462fa9e48f88891a9e80` foi implantado com sucesso no Render COC. A validação visual autenticada e o teste controlado com mensagens reais ainda são necessários; telefones compartilhados entre registros podem aparecer em mais de um contato e devem ser observados.
5. **Não declarar WhatsApp homologado só porque existem mensagens no banco.** Há histórico de mensagens recebidas/enviadas, mas `delivery_logs` está vazio. Precisamos confirmar a entrada do webhook, o envio no aparelho, o retorno de entrega e o registro do resultado.
6. **Configurações da Ana verificadas no banco.** Estão presentes `escola_nome=COC Macapá Norte`, `escola_agente_nome=Ana`, `escola_agente_ativo=true`, `escola_folder_ativo=true` e `escola_info`. `escola_valores` e `media_kit_link` estão vazios. Portanto, a Ana não deve informar preços sem fonte oficial, e o caminho de envio do folder precisa ser confirmado no WhatsApp real mesmo com a opção ligada.
7. **A triagem atual ainda é ampla.** O esquema da Ana classifica principalmente matrícula, financeiro, currículo, horário, localização e outros. Ainda não há uma fila setorial comprovadamente homologada para secretaria, coordenação, transferência, reclamações e demais solicitações de famílias atuais.
8. **Há duas camadas que precisam continuar sincronizadas:** o contato/conversa na tabela legada `leads` e o cadastro escolar de responsável, aluno e oportunidade. A confirmação da família deve gerar um cadastro único, sem duplicação, e a equipe deve conseguir localizar o histórico da conversa a partir do cadastro escolar.
9. **A pesquisa de satisfação está implementada, mas falta comprovar o ciclo real.** Os seis registros com status enviado não provam que a família recebeu e respondeu. Validar uma conversa controlada, a pesquisa de origem, a nota e o encerramento.
10. **Não implementar novos painéis antes de validar os dados de base.** Indicadores de conversão, tempo de primeira resposta, pendências por setor e desempenho por atendente só serão confiáveis quando as mensagens, responsáveis, tarefas e encerramentos estiverem consistentes.

## Plano de entrada em operação — sem atrasar o lançamento

### P0 — Antes de liberar o atendimento real
1. Corrigir a fila **Pendentes de resposta** para considerar mensagens WhatsApp sem `lead_id`, com vínculo seguro por telefone e sem duplicar contatos. Validar a contagem antes/depois com casos controlados.
2. Confirmar no Render que a versão do frontend está `live` após o último commit. Não confundir o deploy do site Conceito com o deploy do COC.
3. Revisar os 29 atendimentos em `aguardando_secretaria` e cruzar a fila preliminar de 51 contatos com última entrada posterior à última saída. Não apagar nem encerrar em lote.
4. Conferir no WhatsApp real a resposta da Ana e o envio do folder. O banco confirma nome, informações da escola e agente/folder habilitados; valores e `media_kit_link` estão vazios. Confirmar campanha/ano letivo e origem do arquivo do folder sem inventar valores.
5. Fazer um teste controlado com número autorizado: mensagem recebida → registro no CRM → resposta da Ana → resposta humana → retomada sem duplicidade → encerramento → pesquisa de satisfação. Confirmar no próprio WhatsApp, não apenas no retorno técnico.
6. Testar cadastro de família/aluno/oportunidade com confirmação explícita e um caso de correção antes da confirmação; verificar que não há duplicidade.
7. Testar agendamento, confirmação separada, reagendamento e conclusão de visita.
8. Criar uma tarefa real de teste, atribuir responsável, definir prazo, concluir e agendar a próxima ação. Verificar que aparece na fila correta.
9. Confirmar que a secretaria sabe localizar mensagens pendentes, assumir um contato, registrar o atendente e concluir o atendimento.

### P1 — Melhorias de curto prazo, após estabilizar o básico
- Atribuição e reatribuição explícita de conversas, oportunidades e tarefas a atendentes.
- Fila de pendências com responsável, prazo, tempo de espera e alertas de atraso.
- Classificação por assunto/setor: matrícula, secretaria/documentos/transferência, financeiro de famílias já matriculadas, coordenação, reclamação, visita e outros.
- Regra de transferência: explicar o procedimento oficial aprovado pela escola e encaminhar à secretaria; não inventar exceções nem afirmar que o pedido foi concluído pelo WhatsApp.
- Garantir que cada handoff tenha responsável e próximo passo. Uma mensagem automática de “a secretaria vai responder” não pode ser considerada atendimento concluído.

### P2 — Melhorias depois do início do uso
- Painel de gestão: primeira resposta, contatos sem retorno, pendências vencidas, visitas marcadas/realizadas, conversão por etapa, motivos de perda, origem do contato, satisfação e reaberturas.
- Análise de dúvidas recorrentes por setor para melhorar comunicação, FAQ e processos internos.
- Regras de SLA configuráveis por tipo de solicitação e horário de atendimento.
- Revisão contínua de LGPD, consentimento de WhatsApp/marketing, retenção e exclusão de dados, com cuidado especial com dados de menores.

## Critério para liberar o uso

O CRM não precisa estar perfeito para começar; precisa estar **confiável no essencial**. A liberação deve ocorrer depois de validar login/permissões, entrada e saída de mensagens, fila de pendências, cadastro sem duplicidade, visitas, atribuição mínima e encerramento/pesquisa. Começar com acompanhamento próximo da secretaria e revisar diariamente os contatos sem retorno na primeira semana.

Não ativar automações novas nem alterar em lote contatos existentes durante essa validação. Preservar o histórico e os registros atuais.

## Próximo passo exato

**Próxima etapa:** abrir a fila publicada com uma sessão autenticada e conferir mensagens órfãs por telefone; depois revisar manualmente os 29 atendimentos em `aguardando_secretaria`. A consulta agregada encontrou 6 casos em que a última entrada é posterior à última saída ou não há saída registrada. Isso é sinal para revisar o histórico, não autorização para enviar mensagens ou encerrar casos automaticamente.

Em seguida, fazer uma homologação controlada no WhatsApp com número autorizado: recebimento → Ana → resposta humana → retomada/encerramento → pesquisa. Não enviar mensagens reais nem alterar status em lote sem confirmação do responsável. Testar cadastro, visita e tarefa pela interface antes de liberar a operação diária.
