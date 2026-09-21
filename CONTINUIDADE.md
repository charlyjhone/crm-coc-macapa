# CONTINUIDADE — CRM COC Macapá Norte

> **Documento vivo de continuidade do projeto.**
>
> Antes de alterar este repositório, leia este arquivo por completo. O objetivo é permitir que outra sessão, outra conta do ChatGPT ou outro agente continue o trabalho sem recomeçar do zero e sem reintroduzir componentes do CRM antigo.

## 1. Identidade e objetivo

Este repositório é o **CRM próprio e exclusivo do COC Macapá Norte**, voltado à captação e matrícula escolar.

O sistema anterior tinha regras e automações comerciais relacionadas a Susan, Miguel, publicidade, propostas, marcas, campanhas comerciais e outros fluxos que não pertencem ao CRM escolar. Esse legado está sendo removido de forma intencional.

**Não reintroduzir Susan, Miguel nem o cérebro comercial antigo sem uma solicitação explícita do responsável pelo projeto.**

## 2. Estado de referência

Branch principal: `main`.

Estado auditado para criação deste documento: commit `3c1c9348`, de 21/09/2026.

O responsável informou que o CRM estava funcional até sexta-feira, 18/09/2026. Depois disso foram realizados cinco commits de limpeza/adaptação:

1. `810db99e` — **Ana V0.1: corrigir fluxo de atendimento e remover legado crítico**
2. `24026836` — **Limpeza CRM COC: remover legado visível da Susan/Miguel**
3. `4c17eea2` — **Limpeza CRM COC: remover automações comerciais legadas**
4. `7a6c2449` — **CRM próprio: substituir oportunidades comerciais pelo funil escolar**
5. `3c1c9348` — **CRM próprio: remover cérebro e integrações do sistema antigo**

O ponto anterior às mudanças é o commit `7aa20ebd` (merge da fundação do CRM escolar). Ele serve como referência histórica e possibilidade de comparação, não como estado a restaurar automaticamente.

## 3. O que foi removido na limpeza de 21/09

A comparação `7aa20ebd..3c1c9348` confirma remoção significativa do CRM comercial antigo.

Entre os itens removidos estão:

- `AGENTS.md` antigo;
- `PROMPTS.md` antigo, com mais de 3 mil linhas de histórico;
- memórias Lovable de Susan, follow-up comercial, publicidade e regras do CRM antigo;
- `LeadCard.tsx` e componentes antigos de reuniões;
- páginas comerciais antigas, incluindo Leads, Opportunities, OpportunityDetail, Proposal, Insights, Archived, Unclassified e WorkerMode;
- templates de prompts comerciais e prioridade antiga de leads;
- funções de follow-up comercial/publicidade;
- geração e visualização de propostas;
- integrações Granola;
- funções e helpers relacionados a Miguel/Tiffany/audiência;
- worker antigo e outras automações comerciais.

Também foram alterados `src/App.tsx`, navegação, configurações, `school-triage`, `send-whatsapp-message` e `zapi-webhook`.

Essa limpeza foi proposital. **Não restaurar arquivos removidos apenas porque alguma documentação antiga os menciona.**

## 4. Arquitetura escolar atual

O frontend atual utiliza React + TypeScript + Vite, TanStack Query, Tailwind/shadcn e Supabase.

As rotas principais atualmente registradas em `src/App.tsx` são:

- `/` e `/captacao` — dashboard de captação;
- `/matriculas` — funil de matrículas;
- `/familias` — famílias/alunos;
- `/visitas` — visitas escolares;
- `/tarefas-captacao` — tarefas;
- `/origem-conversao` — origem/conversão;
- `/possibilidades` — possibilidades;
- `/inbox` — conversas;
- `/configuracoes` — configurações administrativas;
- `/usuarios` — usuários.

O CRM escolar deve evoluir em torno de **Responsável/Família → Aluno → Oportunidade de matrícula → Funil → Visita → Tarefa → Matrícula**, preservando histórico de conversas.

## 5. Ana — atendente virtual

A Ana é a atendente virtual escolar. O núcleo atual está em:

`supabase/functions/school-triage/index.ts`

A intenção da V0.1 é:

- receber mensagens inbound de WhatsApp e e-mail;
- identificar/criar o contato;
- consultar histórico recente;
- classificar o assunto;
- estimar interesse;
- responder automaticamente informações oficiais simples;
- responder matrícula somente dentro das informações cadastradas;
- transferir para a secretaria quando houver negociação, desconto, documentos, vaga específica, caso individual da criança, solicitação de humano ou informação desconhecida;
- registrar resumo, assunto, interesse e situação da triagem;
- nunca considerar uma resposta atendida se o envio automático falhar.

A identidade atual no prompt é: **Ana, assistente virtual oficial do COC Macapá Norte**.

### Situação importante

**A Ana ainda não está homologada como funcional.**

O responsável informou explicitamente que a atendente virtual não está funcionando. Portanto, qualquer marcação antiga no `roadmap.md` dizendo que o agente está concluído deve ser interpretada como “implementado em código”, não como “testado e funcionando em produção”.

Não presumir que a Ana funciona apenas porque `school-triage` existe.

## 6. Fluxo esperado da Ana

Fluxo conceitual:

`WhatsApp/Z-API ou e-mail → persistência da mensagem → trigger → school-triage → IA → decisão/resposta → send-whatsapp-message ou send-email → atualização do contato → activity_log → secretaria quando necessário`.

Para WhatsApp, `zapi-webhook` foi alterado para retirar comandos comerciais antigos. Para telefone novo, o webhook atualmente deixa a criação/classificação do contato escolar para a Ana após a mensagem inbound ser persistida.

A migration de triagem cria triggers em `whatsapp_messages` e `email_messages` para chamar `school-triage`.

## 7. Pontos que precisam ser auditados antes de afirmar que Ana funciona

Verificar no ambiente implantado, e não somente no GitHub:

- se a Edge Function `school-triage` está realmente publicada na versão atual;
- se os triggers de banco da migration de triagem estão instalados e ativos;
- se `escola_agente_ativo` está ligado;
- se as configurações `escola_nome`, `escola_info` e `escola_valores` estão corretas;
- se os secrets necessários existem;
- se o gateway/modelo de IA configurado responde;
- se `send-whatsapp-message` consegue entregar pela Z-API;
- se `send-email` funciona;
- se mensagens novas realmente disparam a triagem;
- se telefone/LID está sendo resolvido corretamente;
- se falhas estão gerando handoff para a secretaria em vez de “atendimento fantasma”;
- conferir logs das Edge Functions e do webhook durante um teste real.

**Não alterar a arquitetura da Ana antes de localizar o ponto real da falha.**

## 8. Inconsistência conhecida no frontend

Existe `src/pages/Atendimentos.tsx` e `src/hooks/useAtendimentos.ts`, mas no estado `3c1c9348` a página **não está registrada em `src/App.tsx`**.

O roadmap ainda marca a página “Atendimentos” como concluída. Auditar se ela deve voltar à navegação/rotas e se precisa ser adaptada ao modelo escolar atual antes disso.

## 9. Configurações da escola

`src/components/settings/SchoolSettingsTab.tsx` permite configurar:

- nome da escola;
- informações oficiais;
- valores de matrícula/mensalidade;
- liga/desliga do agente.

Enquanto os valores estiverem vazios, a Ana deve encaminhar perguntas de valores para a secretaria.

O roadmap registra como pendência o cadastro dos valores.

## 10. Regra de segurança para novas limpezas

O projeto passou por uma remoção grande de legado em 21/09/2026. A partir deste ponto:

1. não fazer outra limpeza em massa sem auditoria de dependências;
2. não apagar migrations antigas apenas porque contêm nomes do sistema anterior — migrations podem ser necessárias para reconstrução do banco;
3. distinguir “arquivo legado sem uso” de “estrutura antiga ainda utilizada pelo banco/WhatsApp”;
4. preservar a `main` funcional e preferir branch/PR para mudanças de risco;
5. antes de remover uma função Supabase, pesquisar chamadas no frontend, outras Edge Functions, migrations e banco implantado;
6. nunca expor secrets ou conteúdo sensível do ambiente em documentação ou commits.

## 11. Próxima auditoria recomendada

A prioridade não é adicionar funcionalidades novas. É validar o estado após a limpeza.

Ordem recomendada:

1. validar build/lint/testes do frontend no estado atual;
2. verificar referências quebradas deixadas pelos arquivos removidos;
3. validar navegação e páginas escolares;
4. auditar banco/migrations sem apagar histórico necessário;
5. testar Z-API inbound e outbound;
6. rastrear uma mensagem de teste ponta a ponta até `school-triage`;
7. corrigir e homologar a Ana;
8. restaurar/adaptar a página de Atendimentos se fizer sentido;
9. só depois continuar a limpeza de documentos e referências históricas restantes.

## 12. Regra de continuidade para qualquer agente

Ao iniciar uma nova sessão:

- leia este arquivo primeiro;
- confira os commits mais recentes da `main`, pois este documento pode estar atrasado;
- leia o código atual antes de propor restauração de qualquer legado;
- considere o CRM **escolar e exclusivo do COC Macapá Norte**;
- não recomece o projeto do zero;
- não reintroduza Susan/Miguel ou automações comerciais antigas;
- preserve funcionalidades escolares já existentes;
- trate a Ana como **em diagnóstico/homologação**, até haver teste real de ponta a ponta;
- após uma mudança estrutural importante, atualize este documento com estado, decisão, pendências e commit de referência.

## 13. Como continuar em outra conta do ChatGPT

Mensagem sugerida:

> Acesse o repositório `charlyjhone/crm-coc-macapa`. Antes de propor ou fazer qualquer alteração, leia `CONTINUIDADE.md`, confira os commits posteriores ao commit de referência informado nele e audite o estado atual. Este CRM é exclusivo do COC Macapá Norte. Não restaure o CRM comercial antigo. Continue exatamente das pendências registradas no documento.

## 14. Limpeza estrutural preparada em 21/09/2026

Foi criada uma branch específica para uma limpeza conservadora do repositório. A auditoria identificou e removeu somente itens sem uso comprovado no frontend escolar:

- arquivos e memórias da pasta `.lovable`;
- dependência `lovable-tagger` e sua configuração no Vite;
- armazenamento de autenticação exclusivo das prévias do Lovable;
- `.env` versionado, com proteção adicionada ao `.gitignore`;
- lockfiles do Bun, mantendo npm e `package-lock.json` como padrão;
- páginas antigas sem rota (`Index`, `Prompts` e `Pendentes`) e seus auxiliares exclusivos;
- editor de prompts comerciais quebrado, substituído pelas configurações da escola e da Ana;
- README do antigo migueSALES, substituído pela documentação do CRM escolar.

A auditoria também confirmou que a `main` não compilava antes da limpeza porque `PromptsTab.tsx` importava `src/data/promptTemplates`, arquivo já removido. A nova tela de configurações usa `SchoolSettingsTab` e `GeneralSettingsTab`.

As migrations e Edge Functions legadas não foram removidas nesta etapa. Elas ainda exigem comparação com o Supabase implantado, pois exclusão no GitHub não despublica funções e algumas estruturas antigas podem continuar participando de WhatsApp, e-mail ou banco.

---

Última atualização deste documento: **21/09/2026**.
Commit de código usado como referência antes da criação do documento: **`3c1c9348`**.
