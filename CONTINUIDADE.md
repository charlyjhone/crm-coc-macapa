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

## 14. Verificação de 28/09/2026 — novo CRM escolar

- Projeto Supabase correto: `crm-escola` (`fenqnbzdjnyvgrmjczoi`), ativo. A `main` tinha um `.env` apontando para outro projeto; corrigido no commit `2fb5a6e`. Confirmar se o Render sobrescreve as variáveis `VITE_*` no build.
- A `main` falhava no build por importar `src/data/promptTemplates`, arquivo removido. A tela `/configuracoes` agora usa `SchoolSettingsTab`, e o build local passou com 3.457 módulos (commit `6d9f250`). O lint completo ainda acusa erros legados.
- Banco: 39 contatos, 585 mensagens WhatsApp, 20 follow-ups da Ana; tabelas novas de responsáveis, alunos, oportunidades, visitas e tarefas ainda sem registros. As migrations escolares estão aplicadas, mas o fluxo novo precisa de teste pela interface com usuário autorizado.
- `school-triage` publicada está ativa na versão 47 e diverge bastante do arquivo anterior da `main`. A versão publicada inclui autenticação interna, OpenAI, captura de nome, handoff e retomada. Não republicar o arquivo antigo.
- PR #10 (`fix/sync-ana-2027`) sincroniza a fonte da versão 47 publicada e adiciona a orientação sobre valores de 2027 apenas no prompt. Fora do prompt, a fonte preparada foi comparada e está idêntica à função publicada. A PR não foi mesclada nem a função republicada.
- O envio da pesquisa continua fora do fluxo homologado. Manter desativado até validação.
- Render `crm-escola` (`srv-dahehcifngtc73961ueg`): site público `https://crm-escola-s8jg.onrender.com/` abre login, mas a versão Live é rollback do commit `4c17eea` de 21/09. O último deploy de `705f23b` falhou precisamente por `src/data/promptTemplates` ausente. Auto-Deploy está desligado. Build `npm install && npm run build`, publicação `dist`, rewrite `/* → /index.html`, branch `main`; variáveis `VITE_SUPABASE_PROJECT_ID` e `VITE_SUPABASE_URL` apontam corretamente para `crm-escola`. Em 28/09/2026, com autorização do responsável, o commit `b18f94a` foi publicado manualmente: deploy `dep-dat69op7lnhs73br2bc0`, status `Deploy succeeded | Live`, build Vite de 3.457 módulos. A URL pública abre a tela de login. Falta homologar os fluxos autenticados e a Ana; Auto-Deploy continua desligado.\n- Para colocar o novo CRM em uso: publicar build corrigido, testar login/permissões, cadastrar uma família e aluno de teste, avançar oportunidade, visita e tarefa, validar WhatsApp inbound/outbound e Ana com secretaria, e só então liberar usuários.
- A função publicada e as mensagens recentes mostram atividade no atendimento antigo/triagem, mas isso não homologa o fluxo escolar completo.

## 15. Publicação da fila escolar em 28/09/2026

- A PR #11 foi mesclada no commit `e6044a5` e publicada manualmente no Render como deploy `dep-dat6kv3bc2fs73bdauog` (`Deploy succeeded | Live`). Auto-Deploy permanece desligado.
- A navegação **Atendimento → Atendimentos da escola** abre `/atendimentos`; a antiga `/inbox` foi retirada. A busca da fila e o histórico de WhatsApp foram verificados na sessão autenticada de Atendimento, sem enviar mensagem nem alterar um contato. Na verificação, a fila tinha 39 contatos, 16 aguardando secretaria.
- A página permite resposta humana pelo WhatsApp usando a função `send-whatsapp-message` já publicada e concluir um atendimento. O envio real e a alteração de status ainda precisam de homologação com um contato de teste autorizado.
- O botão de pesquisa de satisfação continua desativado, conforme decisão do responsável. A PR #10 da Ana para a resposta sobre valores de 2027 continua pendente de mesclagem e publicação da Edge Function; nunca substituir a versão 47 publicada pela fonte antiga da `main`.
- O funil escolar de famílias/alunos/oportunidades ainda está vazio. Próxima validação: criar registros de teste autorizados, percorrer matrícula, visita e tarefa, e verificar inbound/outbound e o handoff da Ana de ponta a ponta.

---

Última atualização deste documento: **21/09/2026**.
Commit de código usado como referência antes da criação do documento: **`3c1c9348`**.

## 17. Preparação para outras escolas (28/09/2026)

- O responsável pretende vender o CRM para outras escolas, cada uma com seu próprio banco de dados. A instalação atual ainda é única e específica do COC. Para a primeira expansão, usar um projeto Supabase e uma implantação Render separados por escola, com credenciais, Auth, Z-API, configurações e backups próprios; não apontar duas escolas para o mesmo banco atual.
- A configuração proposta `escola_agente_nome` em `system_settings` usa `Ana` como padrão. A fonte de `school-triage` sincronizada da versão 47 passa a usar o nome em prompt, identificação das respostas e follow-ups; o identificador técnico `senderType: "ana"` e a tabela `ana_followups` continuam por compatibilidade. As mensagens antigas preservam a assinatura original.
- O formulário deixa de pré-preencher o endereço e e-mail do COC quando a informação oficial ainda não foi cadastrada em uma instalação nova. A configuração existente do COC no banco não é alterada.
- Ainda há marca COC e rótulos Ana fixos em telas e outros pontos do código. Antes de clonar para clientes, revisar marca, textos, dados iniciais, integrações, RLS, migrations, domínio e políticas de acesso; parametrizar o provisionamento e testar isolamento entre escolas. Não afirmar que o produto já está pronto para múltiplas escolas.
- **Pendência de publicação:** a mudança da função deve ser conferida contra a versão 47 implantada e homologada com um teste controlado antes de expor o campo no site. A PR #10 de 2027 está incorporada na fonte proposta, mas o texto ainda não foi publicado na função. O botão de pesquisa continua desativado.

## 16. Painel e perfil operacional — 28/09/2026

- PR #12 mesclada em `3890fcf` e publicada no Render como `dep-dat71t59fdbs73fv74h0` (Live). O painel agora mostra separadamente os contatos de atendimento: 39 ativos, 16 aguardando secretaria, 8 respondidos pela Ana na verificação. Atualiza a cada 30 segundos e ao voltar à janela. Matrículas, oportunidades e vagas seguem zeradas porque as tabelas escolares ainda estão vazias; não converter contatos automaticamente em matrículas.
- A criação de usuários pela área Equipe usa o papel operacional `user` já existente no banco, agora apresentado como **Secretaria**. Esse papel acessa atendimentos e telas escolares, mas não Equipe nem Configurações da Ana. Não existe ainda um enum `secretaria` independente ou outras especializações de permissão; nenhuma conta de funcionário foi criada na validação.
- Sessão do frontend usa armazenamento persistente no navegador (`persistSession`) e renovação automática (`autoRefreshToken`); o aplicativo não configura logout por tempo de inatividade. Avaliar política institucional de tempo de sessão antes de mudar Auth em produção.

## 18. Publicação do nome configurável (28/09/2026)

- PR #13 mesclada no commit `dcc0ffb`. Edge Function `school-triage` publicada no projeto `crm-escola` como versão 48, ativa, preservando `verify_jwt=false` e autenticação interna por `x-school-triage-secret`.
- Render `crm-escola` publicado manualmente no deploy `dep-dat7n6gjo6nc73ej7a00` do mesmo commit, status `Deploy succeeded | Live`. Auto-Deploy permanece desligado.
- A tela autenticada de administrador exibe “Nome da atendente virtual”; salvamento com `Ana` foi conferido na tabela `system_settings` (`escola_agente_nome=Ana`). O nome da escola permanece COC Macapá Norte e o agente ativo. Nenhuma mensagem foi enviada a famílias para testar esta mudança.
- A função usa o nome configurado no prompt, assinatura do WhatsApp, resposta para áudio e follow-up; `senderType=ana` e `ana_followups` seguem como identificadores técnicos. Para outra escola, configurar um banco e uma implantação separados e revisar a marca e a base oficial antes do uso.
- PR #10 de valores de 2027 foi incorporada pela #13 e seu texto está na versão 48 publicada; a PR #10 pendente pode ser fechada como substituída.

## 19. Rótulos dinâmicos publicados (28/09/2026)

- PR #14 mesclada no commit `0bd5537`; deploy Render `dep-dat7qkrtqb8s73a45t6g` concluído com `Deploy succeeded | Live`.
- Dashboard e fila de Atendimentos agora leem `escola_agente_nome` para seus rótulos; o cabeçalho de captação lê `escola_nome`. A consulta é invalidada após salvar as configurações.
- Verificados na sessão autenticada: painel mostra “Respondidos por Ana”, fila mostra “Respondidos por Ana (8)” e o valor `Ana` persiste no banco. Não foi feito teste de mensagem real com nome alternativo; a configuração COC foi mantida como Ana.
- Antes de implantar para outra escola, parametrizar também a marca fixa `COC.CRM` do menu, o título do navegador e textos próprios da instituição. A alteração do nome da atendente não equivale à preparação completa multi escola.

## 20. Identidade visual AE CRM (28/09/2026)

- A marca AE CRM usa SVGs em `public/brand/`: logo principal, versão para fundo escuro e ícone para favicon.
- A navegação principal e a tela de login exibem a logo; título, descrição, metadados de compartilhamento e favicon usam o nome AE CRM, mantendo o COC Macapá Norte identificado como a escola atendida.
- Validação desta alteração sobre a `main` atual: `npm run build` aprovado com 2.627 módulos, ESLint direcionado para `AppTopNav.tsx` e `Auth.tsx` aprovado, `git diff --check` e leitura XML dos três SVGs aprovados.
- A implantação do Render `crm-escola` usa a branch `main`, publicação manual e Auto-Deploy desativado. Mudanças de frontend não alteraram Supabase, migrations, configurações nem integrações da Ana.
- PR #15 incorporada à `main` no commit `1277b35`; deploy Render `dep-dat9cf0473hc73f9bcfg` finalizado como `Deploy succeeded | Live` em 28/09/2026.
- O título público passou a `AE CRM · COC Macapá Norte` e o SVG `/brand/ae-crm-logo.svg` foi confirmado acessível no site.
- AIMEDU permanece separado e fora desta publicação.

## 21. Abertura dos atendimentos pelo painel (28/09/2026)

- Na branch local `fix/dashboard-attendances-navigation`, baseada em `origin/main` `f9f215d`, os três indicadores de atendimentos do painel passam a ser links visíveis para `/atendimentos` com o filtro correspondente (`todos`, `aguardando_secretaria` ou `respondido_agente`).
- A fila lê o filtro da URL, destaca o primeiro atendimento correspondente e abre o histórico; a lista continua disponível para selecionar outro contato. Os botões de filtro da própria fila também atualizam a URL.
- Validação local aprovada: `npm run build`, ESLint direcionado para `CaptacaoDashboard.tsx` e `Atendimentos.tsx`, e `git diff --check`. A mudança é somente no frontend; não altera banco, Supabase, permissões, mensagens ou dados de produção. Ainda não foi mesclada nem publicada.
