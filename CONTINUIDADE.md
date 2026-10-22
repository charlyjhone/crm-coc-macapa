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

### Melhoria implementada — aprendizado contextual com respostas da secretaria

- A função `school-triage` recupera as mensagens recentes do próprio CRM COC e usa no máximo quatro respostas humanas como exemplos contextuais.
- As mensagens da família são usadas somente para classificar o assunto em uma categoria ampla; o texto original da família não é inserido nos exemplos enviados ao modelo.
- Respostas com indicadores de dados sensíveis, identificadores ou conteúdo financeiro são descartadas; os rótulos do operador e nomes mais comuns são removidos. Se a anonimização não for segura, o exemplo não é usado.
- A Ana usa os exemplos para aproximar tom e padrões de resposta, além de conteúdo escolar geral. As informações oficiais de `system_settings` sempre prevalecem; exemplos antigos não autorizam valores, datas, prazos ou promessas.
- Isso é recuperação contextual por mensagem, não treinamento permanente ou fine-tuning do modelo.
- Regra de matrícula/visita: se a família disser que prefere esclarecer dúvidas no dia da visita, a Ana deve continuar a coleta de interesse com uma pergunta por vez, se a secretaria ainda não assumiu. Não deve criar uma segunda visita sem data/horário explícitos nem pressionar quem disser que só quer encerrar.
- Os testes `node --test scripts/test-ana-visits.mjs` passaram no GitHub Actions: 15 aprovados, 0 falhas.
- PR #51 incorporada na `main`; Edge Function `school-triage` publicada no Supabase COC como versão 65 ACTIVE. A validação final de conversa real e a confirmação de cadastro no funil ainda precisam ser feitas no WhatsApp.

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

Última atualização deste documento: **28/09/2026**.
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

- PR #17 foi mesclada à `main` no commit `3bddefe` e publicada manualmente no Render `crm-escola` pelo deploy `dep-datb83t9fdbs73b2girg`, com status `Deploy succeeded | Live`.
- Os três indicadores de atendimentos do painel são links visíveis para `/atendimentos` com o filtro correspondente (`todos`, `aguardando_secretaria` ou `respondido_agente`).
- A fila lê o filtro da URL, destaca o primeiro atendimento correspondente e abre o histórico; a lista continua disponível para selecionar outro contato. Os botões de filtro da própria fila também atualizam a URL.
- Validação local aprovada: `npm run build`, ESLint direcionado para `CaptacaoDashboard.tsx` e `Atendimentos.tsx`, e `git diff --check`. Após o deploy, a sessão autenticada confirmou os três links no painel e a abertura da fila pelo filtro `aguardando_secretaria`; nenhuma mensagem foi enviada nem registro alterado durante o teste.
- A mudança é somente no frontend; não altera banco, Supabase, permissões, mensagens ou dados de produção.

## 22. Perfil e trilha de auditoria (28/09/2026)

- Esta mudança adiciona `/perfil` para cada usuário editar seu nome de exibição e senha; o e-mail de acesso permanece somente leitura. A senha nova exige pelo menos oito caracteres.
- A tela `/auditoria` e o link de navegação são exclusivos para Administrador. A tabela `public.audit_logs` usa RLS: somente administradores autenticados podem ler os eventos; os usuários do CRM não podem inserir, alterar ou excluir essa trilha diretamente.
- A migration instala gatilhos nas tabelas públicas atuais para registrar operações feitas com JWT de usuário: usuário, e-mail de autoria, horário, tabela, chave do registro e nomes dos campos afetados. Não copia valores de mensagens, contatos, alunos, responsáveis nem configurações. `user_presence` fica fora para não registrar cada ping de navegação; em `activity_log`, apenas edições e exclusões são duplicadas na auditoria.
- Criação, alteração de nome/e-mail/senha e exclusão de contas via `admin-manage-users` são registradas explicitamente com resultado iniciado, concluído ou falho. Exclusões continuam exigindo confirmação na tela de Equipe.
- Escopo: alterações feitas no CRM com sessão autenticada e ações de conta feitas pela função `admin-manage-users`. Operações automáticas com `service_role`, SQL direto no painel Supabase e mudanças no esquema feitas fora do CRM não identificam a pessoa e não entram nesta trilha. Novas tabelas públicas devem receber o gatilho nas migrations futuras. A trilha não recupera eventos anteriores à instalação.
- A implementação foi reaplicada sobre a `main` atual (`b693a59`), mantendo a correção recente da navegação dos atendimentos.
- Validação nesta base: `npm run build` (2.629 módulos), `tsc --noEmit`, ESLint direcionado para as rotas/telas alteradas e `admin-manage-users/index.ts`, além de `git diff --check`; tudo aprovado.
- A migration `20260928191018_add_profile_audit_logs.sql` foi aplicada ao Supabase `crm-escola` e registrada no projeto com a mesma versão `20260928191018`. A tabela começa vazia, sem eventos retroativos.
- O pré-voo `supabase/tests/20260928_audit_log_preflight.sql` foi executado após a migration e passou: RLS, privilégios e gatilhos confirmados.
- PR #18 foi mesclada por squash na `main`, commit `2fd06c7`.
- A migration `20260928191018_add_profile_audit_logs.sql` está aplicada no Supabase `crm-escola`, versão `20260928191018`; o pré-voo RLS/privilégios/gatilhos passou.
- A Edge Function `admin-manage-users` está publicada como versão 3 e ativa. `verify_jwt=false` foi preservado; a função autentica o token e valida permissões administrativas antes das operações.
- O Render `crm-escola` recebeu o deploy manual `dep-datbpkmk1f9s73flh8mg` do commit `2fd06c7`, status `Deploy succeeded | Live`; Auto-Deploy continua desligado.
- Em sessão autenticada de administrador, `/perfil` e `/auditoria` foram abertas no site publicado. A auditoria está vazia no início da coleta (0 registros), sem histórico retroativo; nenhum dado do perfil ou senha foi alterado durante a verificação.

## 23. Andamento dos contatos e funis distintos (30/09/2026)

- O responsável observou que faltava escolher o andamento na conversa e que o funil no painel estava zerado. Consulta ao `crm-escola` encontrou 56 contatos ativos, mas nenhum `guardian`, `student` ou `enrollment_opportunity`. Os dois conjuntos têm significados diferentes: contato/atendimento é uma pessoa/conversa, oportunidade de matrícula pertence a um aluno e ciclo.
- A tela de Atendimentos passa a mostrar e editar `leads.status`: novo, em atendimento, em negociação, matrícula confirmada, não convertido e resolvido. O assunto `matricula` permanece uma classificação de interesse, sem significar matrícula concluída. Marcar resolvido também encerra `triage_status`; reabrir um contato resolvido restaura a fila, com `resolved_at` limpo. A auditoria existente registra o usuário autenticado e os campos alterados.
- O painel passa a mostrar um funil de contatos com contagens reais por `leads.status` e links filtrados para Atendimentos. Os indicadores e o funil de matrículas cadastradas continuam usando `enrollment_opportunities`, com explicação e link para Famílias e alunos quando ainda vazios. Não converter automaticamente os 56 contatos em matrículas ou alunos sem dados da família.
- Validação local: Vite build, TypeScript, ESLint direcionado e `git diff --check` aprovados. A transição real de status não foi aplicada a um contato de produção durante a verificação; `matriculado` e `nao_convertido` podem disparar a notificação interna de status já existente no banco. O teste com um contato próprio controlado permanece pendente.

## 24. Cadastro de interesse pela Ana (30/09/2026)

- O responsável confirmou que a Ana também deve cadastrar famílias e alunos interessados. Antes desta alteração, `school-triage` só criava/atualizava `leads`; o funil escolar permanecia vazio mesmo com contatos de matrícula.
- A proposta nesta branch acrescenta a coleta estruturada de nome completo do responsável, nome do aluno, ano letivo e série; turno é opcional. A Ana apresenta os dados no WhatsApp e só grava depois de confirmação explícita da família na resposta seguinte. Prévia não escreve. Casos de negociação, vaga específica e atendimento humano permanecem com a secretaria.
- `register_ana_enrollment` é uma operação atômica no banco, executável apenas pelo `service_role` da Edge Function. Ela vincula responsável e oportunidade ao contato original, reaproveita o mesmo aluno/oportunidade ao repetir uma mensagem e abre a etapa `novo_interessado`, sem presumir matrícula concluída nem consentimento de marketing/WhatsApp.
- **Pendente para publicação:** revisar e aplicar a migration `20260930161958_ana_enrollment_registration.sql`, publicar a nova `school-triage`, testar em contato controlado o pedido de dados, confirmação, repetição e repasse à secretaria. Não publicar somente o frontend: a função depende da nova RPC. Nenhum cadastro real de família deve ser criado como teste sem dados próprios autorizados.

- PR #19 mesclada na `main` no commit `b7d1778`. Publicação Render ainda pendente: a página do serviço retornou 502 Bad Gateway ao tentar abrir o painel em 30/09, e Auto-Deploy está desligado. Não afirmar que esta mudança está Live antes de conferir o deploy.

- PR #20 mesclada à `main` no commit `92d1677`. Migration aplicada no `crm-escola` como versão `20260930161958`; conferidos EXECUTE para `service_role`, bloqueio para `authenticated` e zero oportunidades criadas na validação. `school-triage` publicada como versão 49, ativa, preservando autenticação interna e `verify_jwt=false`. A implementação não alterou o frontend do Render. Falta um teste real, autorizado, com conversa WhatsApp controlada e confirmação da família; a lógica de confirmação foi verificada localmente sem criar dados de produção.

## 25. Perfis da equipe (30/09/2026)

- O responsável observou que a criação de usuário era fixa em Secretaria e a edição permitia só nome/e-mail. O banco já contém `app_role` com `admin` e `user` (Secretaria); não criar novo enum nesta mudança.
- A proposta adiciona escolha de Administrador/Secretaria ao criar usuário e ação separada de troca do perfil na lista. O próprio administrador não pode mudar seu perfil por essa tela.
- `set_crm_user_role` troca o papel em uma transação, serializa mudanças, impede remover o último administrador e é executável apenas pelo `service_role` da função `admin-manage-users`. A função registra o autor e resultado na auditoria. A escrita direta de `user_roles` pelo papel `authenticated` é revogada; leitura do próprio perfil e leitura administrativa permanecem.
- Validação local: build Vite e ESLint direcionado aprovados; `tsc --noEmit` completo ainda falha em arquivos antigos fora desta alteração (`AppSidebar`, `PromptsTab`, `Inbox` e tipos legados de leads). Migration validada dentro de transação com rollback: `service_role` pode executar, `authenticated` não pode executar nem fazer UPDATE direto. Nenhum perfil real foi alterado durante os testes.
- Pendências: publicar `admin-manage-users`, implantar o frontend manualmente no Render e testar a interface autenticada sem modificar usuários reais.

- PR #21 mesclada na `main` no commit `a1abf71`. Migration aplicada como versão `20260930165744`; função `admin-manage-users` publicada como versão 4, ativa, com `verify_jwt=false` e autenticação interna mantida. O Render realizou Auto-Deploy `dep-dauk0cbncjis73cgubv0`, exibido como **Live** para `a1abf71`. Nenhum perfil de usuário foi trocado no teste. Validar o seletor na interface autenticada antes de criar/alterar contas reais.
- Para testar a Ana a pedido do responsável, um contato de teste foi zerado no banco: removidos 74 mensagens WhatsApp, 109 eventos de atividade, um follow-up, um registro de auditoria e o contato vinculado. A consulta posterior confirmou zero contato, mensagem, follow-up e família para aquele número. Não houve oportunidade escolar a remover. O provedor externo de WhatsApp pode conservar histórico próprio; esta operação limpou o CRM.

## 26. Tom da Ana, encerramento e pesquisa (30/09/2026)

- No teste controlado do responsável, a Ana não saudou com boa tarde, prometeu registrar interesse sem o nome do aluno e continuou depois de “No momento é só isso”. A conversa mostrou apenas responsável/série/turno/ano, sem nome do aluno; não havia dados suficientes para criar a oportunidade. O formulário de satisfação nunca tinha sido configurado e seguia desativado.
- A proposta acrescenta saudação determinística pelo horário de Macapá (America/Belem) na primeira resposta ou após oito horas sem mensagem da escola, com nome quando conhecido; orienta a IA a responder de modo acolhedor e natural sem repetir aberturas a cada mensagem.
- Encerramentos explícitos passam a receber resposta de despedida, cancelam follow-up e marcam o contato resolvido. Respostas curtas como “ok” só encerram quando a Ana acabou de perguntar se pode ajudar em algo mais. Repetição de encerramento não envia outra mensagem. A oportunidade escolar, quando existir, permanece separada.
- A resposta da IA que alegar cadastro sem dados/confirmação é substituída por pergunta pelo dado faltante ou aviso de que a secretaria continuará, sem afirmar que houve registro.
- Configurações da escola ganha `escola_pesquisa_url` para um link HTTPS. Quando configurado, o link é anexado à despedida em encerramento explícito; sem link, nenhuma pesquisa é enviada. Não há URL de formulário cadastrada atualmente; o responsável precisa fornecer/configurar uma. Não adicionar telefone ou dados pessoais à URL.
- Validação local: casos de horário, frases de encerramento e confirmação de saudação; build Vite aprovado. ESLint direcionado ainda acusa ocorrências antigas de `any`/escapes nos arquivos, não relacionadas ao novo fluxo. Falta implantar função e frontend e testar encerramento/URL com conversa autorizada.

## 27. Pesquisa dentro da conversa e origem declarada (30/09/2026)

- A pedido do responsável, a pesquisa pós-encerramento passa a usar lista selecionável da Z-API no WhatsApp, sem link externo. Primeiro pergunta como a família conheceu a escola (Instagram, Facebook, Google, indicação, site, já conhecia, outro); depois pede nota de atendimento de 1 a 5. Se a lista falhar, tenta enviar a pergunta como texto com opções digitáveis; nenhum envio é registrado como sucesso sem confirmação do provedor.
- `send-whatsapp-message` aceita lista apenas com `service_role`, valida as opções e grava `survey_step` no `raw_data` da mensagem enviada. `zapi-webhook` extrai o título/id de resposta interativa quando não vier em texto comum. A Ana reconhece respostas da pesquisa antes de chamar a IA e mantém o atendimento resolvido.
- A origem e a nota ficam no `activity_log` associadas ao contato; a origem declarada substitui somente `source_channel=ana_whatsapp` nas oportunidades vinculadas, preservando origem humana anterior. Cadastros da Ana posteriores reaproveitam a origem respondida. A página Origem e conversão mostra contagem por origem declarada, inclusive para contatos sem oportunidade.
- O antigo campo de URL saiu das Configurações e não é usado no fluxo novo; um valor antigo no banco não é apagado. A pesquisa é enviada somente quando a Ana reconhece um encerramento explícito no WhatsApp. As listas interativas dependem da versão e da conta WhatsApp conectada à Z-API; **teste real com número controlado ainda é obrigatório** para confirmar o clique e o retorno do webhook.
- Validação local: build Vite, transpile sintático das três Edge Functions e `git diff --check` aprovados. O lint dirigido do frontend ainda aponta dois problemas preexistentes em `SchoolSettingsTab.tsx` (uso de `any`, escape de colchete). Nenhuma resposta de pesquisa real foi criada na validação local.
- Durante a publicação foi detectado que as versões ativas de `send-whatsapp-message` (v10) e `zapi-webhook` (v12) continham correções de autorização, privacidade e normalização de telefone ausentes da `main`. A fonte foi sincronizada dessas versões implantadas e a pesquisa foi reaplicada sobre elas, incluindo `_shared/authorize-school-request.ts` e `_shared/whatsapp-phone.ts`. O helper `_shared/internal-contacts.ts` também foi alinhado ao estado ativo (listas vazias do CRM escolar). Não publicar uma versão antiga dessas funções por cima das versões ativas.
- PR #23 incorporada em `a02a060`; sincronização de segurança pela PR #24 incorporada em `e346c93`. Render Auto-Deploy `dep-daul100ae00c73eugac0` confirmou `e346c93` como Live. Supabase: `send-whatsapp-message` v11, `zapi-webhook` v13 e `school-triage` v51, todas ACTIVE com `verify_jwt=false` preservado e autenticação interna da função de envio mantida. Falta teste real controlado da lista e resposta via WhatsApp; as contagens no relatório começam vazias.

- PR #22 mesclada na `main` no commit `d5a8aa6`; Edge Function `school-triage` publicada como versão 50, ativa, `verify_jwt=false` e segredo interno preservados. Render publicou automaticamente `dep-daukg60ae00c73etm66g`, exibido como **Live** para `d5a8aa6`. A URL da pesquisa ainda não foi fornecida nem cadastrada; o campo fica vazio e nenhum link será enviado. Falta teste real de encerramento e da pesquisa após configurar um formulário HTTPS.

## 28. Encerramento após atendimento humano (30/09/2026)

- O teste do responsável mostrou a secretaria respondendo pelo celular às 15h40min53s; a mensagem da família às 15h41min20s foi persistida, mas a Ana ficou silenciosa pelo bloqueio de quatro horas após resposta humana. Antes deste ajuste, o bloqueio ocorria antes de qualquer reconhecimento de encerramento ou resposta à pesquisa.
- Durante o atendimento humano recente, a Ana permanece sem responder às dúvidas e não chama a IA. Quando uma mensagem **posterior à resposta humana** expressa encerramento explícito (ex.: “No momento é só isso” ou “Obrigado, era só isso”), envia somente a lista de origem da pesquisa, marca o atendimento resolvido e cancela follow-ups pendentes. Respostas às listas de origem e nota são processadas antes do bloqueio humano, sem retomar a conversa. Uma mensagem como “Seria agora às 16h, obrigado!” não é encerramento.
- A pesquisa depende de uma frase explícita da família; silêncio, um “obrigado” isolado e atualização manual do status não disparam envio automático. Não analisar retroativamente a conversa durante a pausa. Teste real da lista interativa e webhook permanece pendente.
- Validação local: transpile sintático da Edge Function, quatro casos de classificação de encerramento e `git diff --check` aprovados.
- PR #25 incorporada na `main` como `89891f2`; `school-triage` publicada como versão 52, ACTIVE, com `verify_jwt=false` e segredo interno preservados. Teste real de encerramento humano e cliques nas listas ainda pendente; a publicação não processa retroativamente mensagens anteriores.

## 29. Gráficos da pesquisa (30/09/2026)

- O teste real do responsável confirmou o fluxo completo: encerramento após resposta humana, escolha de Instagram e nota 5/5, com duas atividades de pesquisa persistidas e agradecimento enviado. Nenhuma família/oportunidade foi criada apenas pela pesquisa.
- A página `/origem-conversao` passa a apresentar dois gráficos separados: **De onde nos encontrou?** (origem declarada por contato) e **Avaliação do atendimento** (distribuição de notas 1 a 5, total e média). Consulta `activity_log` por tipo de resposta, retém a resposta mais recente por contato em cada pergunta e mantém os indicadores de matrícula baseados apenas nas oportunidades.
- Validação local: build Vite, ESLint direcionado e `git diff --check` aprovados. Conferir o resultado visual com o teste real no site após o deploy.

## 30. Categorias da origem da pesquisa (30/09/2026)

- A lista enviada pela Ana passa a oferecer quatro respostas: Redes sociais, Indicação, Panfletagem/outdoor e Outros. A nota de atendimento continua de 1 a 5.
- O gráfico “De onde nos encontrou?” agrupa respostas novas e antigas nas quatro categorias. Instagram e Facebook antigos entram em Redes sociais; Indicação continua separada; Google, Site da escola, Já conhecia e Outro antigos entram em Outros. O histórico bruto permanece intacto, inclusive a origem técnica de oportunidades já registradas. A Ana ainda aceita respostas a uma lista antiga que tenha sido enviada antes da publicação.
- Publicar `school-triage` no Supabase `crm-escola` e o frontend no Render após mesclar a branch. Confirmar uma nova lista no WhatsApp e a atualização do gráfico em sessão autenticada.

## 31. Auditoria de segurança e prontidão (01/10/2026)

- Relatório detalhado em `AUDITORIA_2026-10-01.md`. A análise foi somente leitura; não houve alteração de segurança no ambiente nem novos envios.
- O risco prioritário é proteger o `zapi-webhook` publicado, que não valida assinatura/segredo; há também funções públicas legadas de e-mail/IA e políticas/RPCs excessivamente amplas. Validar configurações dos provedores antes de mudar callbacks ou desativar funções.
- Build e TypeScript passaram, lint global falha; o funil escolar ainda tem zero responsáveis, alunos, oportunidades, visitas e tarefas. A interface autenticada, backups e fluxos novos precisam de homologação controlada.

## 32. Correções de segurança parciais (01/10/2026)

- Migration aplicada no `crm-escola` como versão `20261001033936` (`harden_crm_access`): papéis do CRM exigidos para contatos, mensagens, atividades e configurações; leitura de capacidade/unidades para equipe e escrita apenas para admin; histórico de etapas sem escrita direta do cliente; `user_can_access_lead` deixa de conceder acesso a qualquer ID. Teste transacional mostrou secretaria vendo 59 contatos e identidade sem papel vendo zero. O gatilho comercial `trg_notify_status_change_email` foi removido. Segredo separado para callback Z-API foi criado no Vault, sem divulgação em código ou documentação.
- Três funções comerciais foram neutralizadas no ambiente, retornando HTTP 410: `generate-email-reply` v9, `notify-lead-status-change` v11 e `resend-inbound-webhook` v6. O banco não possuía mensagens de e-mail; a funcionalidade de e-mail escolar ainda precisará ser construída/homologada.
- O endpoint interno `configure-zapi-webhook` v1 foi implantado com autenticação pelo segredo interno e consulta de configuração. A leitura da Z-API mostrou callbacks de mensagem recebida e presença apontando para este CRM; callback de entrega em outro destino, preservado. **A ação de atualizar a Z-API foi rejeitada pela revisão automática**, pois compartilharia o segredo dedicado com o provedor e mudaria callbacks em produção sem autorização explícita específica. Não tentar contornar. A tentativa de neutralizar o endpoint de configuração após a rejeição também foi barrada; ele permanece ativo, exigindo o segredo interno, e não foi usado para atualizar callbacks.
- A nova checagem de segredo em `zapi-webhook` existe apenas como código preparado, **não foi implantada**. A função publicada continua v13 sem autenticação na entrada para preservar o WhatsApp até a coordenação com a Z-API. É necessária autorização explícita para enviar o segredo dedicado à Z-API e trocar somente os callbacks de mensagem recebida e presença, seguida da publicação imediata do webhook com validação e teste real.
- Inspeção adicional encontrou `detect-lead-language`, `extract-lead-info`, `generate-whatsapp-message` e `get-whatsapp-lid` ativos com `verify_jwt=false` e sem guarda de autenticação visível. Não há chamadas encontradas no frontend/fluxo escolar atual; revisar e neutralizar antes de considerar a superfície segura. As RPCs `SECURITY DEFINER` e proteção de senhas vazadas continuam pendentes.

## 33. Proteção do callback Z-API (01/10/2026)

- Após autorização explícita do responsável, o configurador atualizou na Z-API somente `receivedCallbackUrl` e `presenceChatCallbackUrl` com o segredo dedicado guardado no Vault. A resposta confirmou `verified=true`; a inspeção posterior confirmou ambos apontando para este CRM e o callback de entrega continuou apontando para outro destino, sem alteração. `receiveCallbackSentByMe` permaneceu ativo.
- `zapi-webhook` foi publicado como v14, ACTIVE, com autenticação pelo segredo no callback. Requisição sem chave retornou 401; evento de label inofensivo com a chave válida retornou 200 e foi ignorado conforme esperado. Nenhuma mensagem real foi disparada para a família durante a verificação. Teste de uma mensagem WhatsApp real e da resposta interativa continua pendente.
- O configurador temporário foi retirado de operação como v2, retornando 410. Sua fonte no repositório foi reduzida ao mesmo stub. As quatro funções legadas sem autenticação, revisão de `SECURITY DEFINER` e proteção contra senhas vazadas permanecem pendentes.

## 34. Aposentadoria de funções legadas (01/10/2026)

- A busca no código não encontrou chamadas atuais a `detect-lead-language`, `extract-lead-info`, `generate-whatsapp-message` ou `get-whatsapp-lid`, mas identificou no banco dois gatilhos (`trg_detect_language_email` e `trg_detect_language_whatsapp`) que ainda chamavam o detector de idioma sem autenticação. A migration `retire_legacy_language_trigger` removeu ambos e a função de gatilho antes da desativação do endpoint. A detecção automática de idioma do legado deixa de ocorrer; a Ana escolar não depende dela.
- As quatro funções foram publicadas como stubs HTTP 410: versões 12, 10, 9 e 8, respectivamente. Quatro chamadas sem autenticação retornaram 410. O recebimento real de WhatsApp ainda precisa de teste controlado após a alteração.
- O linter de segurança ainda aponta 12 funções `SECURITY DEFINER` executáveis por usuários autenticados e a proteção de senhas vazadas desativada no Auth. As funções do funil são usadas pela interface e exigem revisão de autorização por papel sem interromper a secretaria. As tabelas `ana_followups`, `outlook_subscriptions` e `outlook_sync_state` têm RLS sem políticas, impedindo acesso comum; isso é informativo.

## 35. Autorização das RPCs de matrícula (01/10/2026)

- A migration `guard_enrollment_rpcs_by_crm_role` adicionou verificação de perfil `admin` ou `user` às oito funções `SECURITY DEFINER` de criação de família, progresso, visitas, tarefas e cálculo de pontuação. Antes elas aceitavam qualquer login autenticado, embora as tabelas tivessem RLS mais restritiva. A migration preserva as assinaturas e privilégios para a interface da Secretaria.
- Testes transacionais: uma identidade autenticada sem perfil foi recusada em `recompute_all_enrollment_scores`; um usuário real de Secretaria executou a mesma RPC com retorno 0. Ambos os testes encerraram em rollback; nenhuma oportunidade foi alterada.
- O linter ainda pode listar essas funções por serem `SECURITY DEFINER` executáveis por `authenticated`; agora a checagem do perfil ocorre dentro delas. As funções auxiliares `has_role`, `is_admin`, `user_can_access_lead` e `user_can_access_produto` precisam de revisão própria de exposição por RPC. A proteção de senhas vazadas do Supabase Auth continua desativada e requer configuração de Auth.

## 36. Consultas de permissões por usuário (01/10/2026)

- `has_role` e `user_can_access_produto` agora só respondem para o próprio `auth.uid()` em chamadas de usuários comuns. O `service_role` mantém consulta de outros usuários para `admin-manage-users`; `is_admin` herda essa restrição via `has_role`. `user_can_access_lead` já exigia coincidência com `auth.uid()`.
- Duas migrations foram aplicadas: `limit_permission_helpers_to_self` e `normalize_permission_helper_result` (a segunda normaliza JWT sem claim de papel para retornar `false`). Teste transacional: Secretaria consulta o próprio papel (`true`), outro admin/produto (`false`); service role ainda consulta um admin (`true`). Sem escrita em dados de famílias.
- O aviso genérico do linter para `SECURITY DEFINER` pode persistir mesmo com verificações internas; a revisão de assinaturas/execução e um teste pela interface autenticada continuam importantes. A proteção contra senhas vazadas no Supabase Auth ainda precisa ser ativada. O teste real do WhatsApp após mudanças de callback e gatilho ainda falta.

## 37. Incidente: mensagens recebidas não entram no CRM (01/10/2026)

- Responsável relatou várias mensagens chegando ao WhatsApp da escola sem resposta da Ana. Banco não registrou nenhuma mensagem em `whatsapp_messages` em 01/10 até o início da investigação, embora `escola_agente_ativo=true`, `school-triage` e os gatilhos estejam ativos.
- Logs do `zapi-webhook` mostraram callbacks completos de mensagem (payloads ~750–1350 bytes) retornando 401 sem query string, enquanto callbacks curtos de presença (~140 bytes) chegavam com a chave na query e retornavam 200. A Z-API `/me` indicava a URL configurada com chave, mas o callback real de mensagens não a incluía. Não desligar a autenticação para contornar.
- `zapi-webhook` v16 aceita a chave dedicada também como segmento final do caminho; teste interno de evento inofensivo nesse caminho retornou 200, e antes da correção do parser retornara 401. O configurador atualizou somente os callbacks de recebimento e presença na Z-API para o caminho com chave e confirmou `verified=true`; callback de entrega permaneceu preservado. Configurador temporário retirado novamente (v5, HTTP 410).
- **Ainda falta homologação ponta a ponta:** após a troca, aguardar uma mensagem real nova de número controlado, conferir entrada no banco, invocação da `school-triage` e resposta da Ana. Mensagens perdidas anteriormente não foram importadas nem respondidas retroativamente. Evitar registrar a URL completa com a chave em relatórios ou tickets.

## 38. Mensagem real ainda recusada após troca de URL (01/10/2026)

- Renato enviou mensagem de teste por volta de 12h22 (America/Sao_Paulo). O callback completo (~800 bytes) chegou a `/functions/v1/zapi-webhook` sem segmento de chave e retornou 401; eventos curtos de presença chegaram ao novo caminho com chave e retornaram 200. Nenhuma entrada foi gravada em `whatsapp_messages` nesse dia até a verificação.
- Diagnóstico temporário na v17 registrou somente metadados booleanos: `instanceMatches=true` e `receivedMessage=true` para callback recusado. Logo, a mesma instância Z-API ainda usa a rota antiga para mensagens apesar de `/me` confirmar a nova URL. O log temporário foi retirado na v18, equivalente à v16 do repositório.
- A instância foi reiniciada pelo endpoint oficial `/restart` (HTTP 200) por volta de 12h26, sem nova mensagem real após o reinício até a checagem. O configurador temporário voltou ao stub HTTP 410 (v7). **Não considerar resolvido:** pedir nova mensagem controlada depois do reinício e verificar status, caminho, persistência e resposta. Se continuar na rota antiga, investigar suporte Z-API/configuração no painel; não liberar webhook sem autenticação. Mensagens anteriores precisam de atendimento manual ou recuperação coordenada.

## 39. Callback combinado de mensagens da Z-API (01/10/2026)

- Teste real após reinício ainda chegou à rota antiga e retornou 401; o problema foi introduzido pela checagem de segredo implantada no dia anterior. A revisão automática rejeitou uma tentativa de exceção sem segredo baseada só no ID da instância, pois permitiria injeção de mensagens; essa versão **não foi implantada**. `zapi-webhook` permanece v18, exigindo o segredo dedicado.
- Inspeção completa de `/me` descobriu `receivedAndDeliveryCallbackUrl`, não considerado pelo configurador inicial. A chamada documentada `/update-webhook-received-delivery` atualizou o callback combinado para o caminho protegido; `/me` agora mostra `receivedCallbackUrl`, `receivedAndDeliveryCallbackUrl` e `presenceChatCallbackUrl` com chave no caminho. `deliveryCallbackUrl` foi comparado antes/depois e preservado. `receiveCallbackSentByMe=true` permanece. O configurador temporário foi neutralizado outra vez como v11 HTTP 410.
- **Pendente:** uma mensagem WhatsApp real *nova após essa alteração* para confirmar que mensagens passam a chegar com chave, são gravadas no CRM e geram resposta. Retries antigos ainda podem usar a URL capturada anteriormente. A secretaria atende manualmente as conversas não registradas; não há importação retroativa.

## 40. Recebimento da Ana recuperado; confirmação de entrega pendente (01/10/2026)

- Novo teste do responsável às 12h50 (America/Sao_Paulo), após atualizar `receivedAndDeliveryCallbackUrl`: mensagem inbound registrada no CRM às 15:50:52 UTC, no número controlado do responsável; `school-triage` retornou 200. Resposta outbound com `source=school-triage` gravada às 15:50:57 UTC; `send-whatsapp-message` só grava após a Z-API devolver identificador de mensagem. Isso confirma entrada, processamento e aceitação do envio pelo provedor, sem provar entrega no aparelho.
- Um callback posterior de ~201 bytes chegou a um caminho longo sob `/functions/v1/zapi-webhook` e recebeu 404. Não houve registro novo em `delivery_logs`. A URL de `deliveryCallbackUrl` foi preservada nas mudanças anteriores, mas esse retorno de entrega merece investigação separada, sem alterar o callback às cegas. Confirmar com o responsável se a resposta apareceu no WhatsApp.
- Mensagens recebidas enquanto o webhook retornava 401 não foram importadas retroativamente; secretaria precisa revisar e atender as conversas pendentes. A proteção do webhook permanece ativa (v18); a tentativa de fallback sem segredo foi rejeitada e não implantada.

## 41. Revisão pré-publicação e fila urgente (15/10/2026)

- Auditoria de leitura: 163 contatos; 43 mensagens inbound e 43 outbound nas últimas 24 horas; cinco pesquisas de origem enviadas, três respostas de origem e três avaliações registradas. Há 21 contatos abertos cuja última mensagem da família está sem resposta registrada há mais de quatro horas. `school-triage` ativa é v55, posterior à fonte da `main` (v53); não substituí-la pela cópia antiga.
- O botão de concluir e a opção de andamento resolvido em Atendimentos antes apenas atualizavam o contato: não enviavam a pesquisa. A nova função `complete-school-attendance` autentica o usuário, verifica acesso sob RLS, conclui o contato, confere WhatsApp inbound recente, evita pesquisa repetida, reserva um envio por ciclo e usa a mesma lista de origem da Ana. Falhas de envio ficam disponíveis para nova tentativa no botão Verificar pesquisa. Migration `20261015140000_claim_crm_surveys.sql` é necessária antes de publicar a função.
- A fila mostra Urgentes em vermelho, explica o motivo e ordena por prioridade. Há alerta para termos explícitos de risco na última mensagem sem resposta e para quatro horas sem resposta; após uma hora há aviso intermediário. É uma triagem por regras, sujeita a falsos positivos e dependente dos timestamps registrados.
- Alertas do Supabase: 12 RPCs SECURITY DEFINER acessíveis a authenticated (algumas têm guardas internas; revisar individualmente), proteção de senhas vazadas desativada e três tabelas internas com RLS sem política. O último caso parece intencional. Persistem a verificação do callback de entrega Z-API e a homologação real de conclusão manual/pesquisa.
- Código preparado em branch/PR, sem aplicar migration, publicar função ou provocar envio WhatsApp durante esta revisão. Build, TypeScript e lint direcionado foram executados; conferir resultados e fazer teste ponta a ponta antes da liberação.

## 42. Folder digital sob demanda (15/10/2026)

- Encontrado `FOLDER DIGITAL.pdf` na Library (08/10, 3,6 MB, oito páginas). O texto ainda menciona uma novidade de 2026; não usar automaticamente em uma campanha 2027 sem revisão da escola.
- A administração ganha upload privado de PDF (até 15 MB) e chave de ativação. Migration `20261015150000_school_folder_storage.sql` cria bucket privado e políticas de upload/leitura apenas para admin. O envio fica desligado até um PDF aprovado ser carregado e a chave ativada.
- `send-school-folder` usa link assinado de cinco minutos para a Z-API enviar como documento PDF, confirma ID do provedor, registra a mensagem, confere telefone do contato e limita reenvio em 24 horas. A Ana v55 publicada foi preservada como base para a nova versão; após resposta a pedido explícito de folder ou mais informações da escola, invoca o envio somente quando ativo e sem resposta humana concorrente. Não sobrescrever a versão ativa por cópia antiga.
- Ajuste no envio da pesquisa: conferir duplicidade por telefone porque a função WhatsApp persiste mensagens outbound com `lead_id` nulo. Ainda faltam publicação, PDF final aprovado e teste real controlado de recebimento do documento e da pesquisa.

## 43. Implantação técnica (15/10/2026)

- PR #38 incorporada à `main` em `31dc394`; Render publicou a nova versão às 14h24 UTC. O HTML e o bundle de Atendimentos foram conferidos: contém Urgentes e Verificar pesquisa.
- Supabase: migrations `claim_crm_surveys` e `school_folder_storage` aplicadas; `complete-school-attendance` v3, `send-school-folder` v1 e `school-triage` v56 ativas. Corrigida a busca da conversa de entrada pelo número, inclusive mensagens sem `lead_id` por reconciliação incompleta.
- O usuário enviará o PDF atualizado mais tarde. O bucket está vazio e `escola_folder_ativo` ausente (equivale a desligado). Nenhum folder foi enviado.
- Testes locais: build, TypeScript, lint direcionado e transpile de funções passaram. Sem login de operador no browser desta revisão, não foi possível clicar Concluir no CRM e verificar recebimento da pesquisa; fazer teste real controlado. Advisor de segurança permanece com proteção de senha vazada desativada e 12 avisos de SECURITY DEFINER (guardas internas presentes nas amostras consultadas); quatro tabelas internas com RLS sem política são intencionalmente bloqueadas ao cliente. Callback de entrega não gravou eventos em `delivery_logs` nas últimas 24 horas.

## 44. Encerramento por inatividade (15/10/2026)

- O frontend encerra a sessão local após 40 minutos sem interação do usuário. A última atividade é compartilhada entre abas do CRM no mesmo navegador; clique, teclado, toque, rolagem e movimento do mouse atualizam o horário, sem contar atualizações automáticas ou aba oculta. A verificação ocorre periodicamente e ao voltar para a aba; uma interação depois do prazo encerra a sessão antes de poder renová-la.
- Sessões existentes sem um horário de atividade registrado são encerradas na primeira abertura após a publicação. O usuário volta à tela de login e informa email e senha; lembrar email não guarda a senha.
- Este controle no navegador não substitui uma política de expiração imposta pelo servidor. O timeout de inatividade do Supabase Auth baseia-se na renovação do token e pode efetivar-se apenas após o prazo mais a validade do JWT. Não afirmar revogação imediata de access tokens já emitidos.
- TypeScript, build e ESLint direcionado verificados localmente. Falta o teste manual com conta de operador e passagem real de 40 minutos após o deploy.

## 45. Prioridade por contexto e andamento de matrícula (15/10/2026)

- Os prints mostraram falso positivo: TIM, mensagem externa com áudio não transcrito, ficava vermelha após 481 horas; uma família sobre matrícula esperava havia 693 horas e merece urgência. O prazo isolado deixou de pintar toda a fila de vermelho.
- Migration `20261015160000_school_attention_priority.sql` aplicada ao `crm-escola`: `attention_level` e `attention_reason` no contato. `school-triage` v57 inclui a classificação do teor pela Ana (`urgente`, `atencao`, `normal`, `externo`) e motivo; urgência força encaminhamento humano. A interface usa o resultado da IA e o contexto escolar; demandas de matrícula, documentos ou vagas aguardando a equipe por quatro horas tornam-se urgentes, outros atrasos relevantes recebem Atenção e contatos com status Novo criados nas últimas 48 horas recebem Novo. Contatos externos não são promovidos só pelo tempo.
- A opção de definir `matriculado` diretamente pelo menu do contato foi removida. Para confirmar uma matrícula, a equipe registra/move a oportunidade de um aluno para `Matriculado` no funil escolar; status legado matriculado continua visível. O assunto `documento_declaracao` agora é apresentado com nome legível.
- Validação local: TypeScript, ESLint direcionado, build, transpile da função e três cenários de classificação (TIM=normal, família=urgente, risco=urgente) aprovados. Sem novo envio WhatsApp de teste. A classificação da Ana depende da próxima mensagem recebida; contatos antigos sem `attention_level` usam regras de contexto. Revisar resultados reais na fila após publicação.

## 46. Cadastro automático da família pela Ana (15/10/2026)

- O funil escolar ainda tinha zero responsáveis, alunos e oportunidades: a Ana coletava dados, mas exigia uma confirmação adicional por mensagem antes de chamar `register_ana_enrollment`. A v58 de `school-triage` removeu esse bloqueio para novos interesses: a IA marca `cadastro_interesse` somente quando a família quer nova matrícula e forneceu dados para acompanhamento. Com nome completo do responsável, nome do aluno e série válida, a Edge Function registra a família, o aluno e a oportunidade mesmo durante um encaminhamento à secretaria. O ano padrão da campanha é 2027, salvo ano explicitamente diferente; turno é opcional. A matrícula não é confirmada por esse cadastro.
- Confirmações antigas após o resumo anterior ainda são aceitas. RPC existente continua restrita ao service role e idempotente; a migration `20261015170000_ana_enrollment_dedupe_shift.sql` reaproveita a mesma oportunidade se o turno for informado depois. Repetições com oportunidade existente não substituem a resposta normal da Ana por aviso de novo cadastro. Uma nova oportunidade põe o contato em atendimento e encaminha a secretaria para os próximos passos.
- Migration aplicada e função v58 ACTIVE. Verificação de definição e privilégios da RPC: service role autorizado, authenticated negado. TypeScript, transpile e casos locais de dados completos/incompletos aprovados. **Não houve cadastro real de teste nem envio WhatsApp nesta revisão**; testar com família/número controlado e conferir as três tabelas e o funil, sem marcar matrícula confirmada.

## 47. Pedido de visita pela Ana (15/10/2026)

- Preparada a integração de visita ao mesmo funil da secretaria. A Ana coleta os dados de responsável, aluno e série para a oportunidade, além de data e horário exatos informados pela família (Macapá, UTC-3). A família responde SIM à proposta de horário antes de gravar a visita; a Ana não promete disponibilidade nem confirmação da escola.
- A RPC `register_ana_school_visit` só é executável pelo service role, vincula a visita à oportunidade do contato, rejeita oportunidade fechada e data passada, não duplica visita ativa e avança para `visita_agendada` com próxima ação imediata para a secretaria confirmar disponibilidade. A secretaria continua podendo criar e atualizar visitas pelo CRM.
- Código recuperado em 16/10 a partir do commit local `5e9c399`, sobre `0bed284`. A fonte da Ana v58 ativa foi comparada à base e é idêntica. A agenda do CRM mostra `Agendada` até a secretaria conferir e marcar `Confirmada`.
- Ajustes de 16/10: confirmação da visita exige SIM e usa a oportunidade vinculada à proposta enviada, registrada em `activity_log`, sem depender de um novo nome inferido pela IA; cadastro durante coleta da visita não dispara repasse/follow-up antecipado; dados ausentes e horários inválidos recebem pergunta objetiva. Intervenção humana, pedido de pessoa e falhas de consulta têm prioridade. Falha no envio não registra proposta entregue.
- `node --test scripts/test-ana-visits.mjs`: dez cenários do handler real aprovados com banco/HTTP em memória, sem chamadas externas. Incluem cadastro → proposta → confirmação → visita, duplicação, aluno diferente inferido pela IA, datas inválidas, dados incompletos, prioridade humana, falha de envio e preview sem escrita.
- Identificado e reproduzido no banco um bloqueio anterior ao agendamento: `register_ana_enrollment` disparava o cálculo de pontuação, cuja guarda exigia usuário humano e recusava a chamada legítima do serviço da Ana (`Usuário não autenticado`). A migration de visitas também ajusta essa guarda para aceitar exclusivamente o papel interno `service_role`, mantendo a exigência de admin/Secretaria para usuários comuns. Nenhum dado sintético do teste foi mantido.
- Build Vite aprovado (2.630 módulos). A checagem TypeScript completa ainda apresenta os erros legados já existentes em AppSidebar, Prompts/PromptsTab, Inbox e tipos antigos de status; os arquivos de frontend não foram alterados nesta entrega. Não registrar TypeScript global como aprovado.
- Publicação em 16/10: migration `ana_school_visit` aplicada como `20261016124040` (arquivo renomeado para coincidir com o registro do banco). `school-triage` v102 ACTIVE, mantendo `verify_jwt=false` e verificação do segredo interno. O frontend existente já consulta `school_visits`; nenhum serviço novo foi criado.
- `supabase/tests/20261016_ana_visits_transaction.sql` executado com sucesso no banco real usando o papel de serviço: cadastro, turno informado depois, repetição, visita, avanço do funil, histórico único, data passada/infinita, vínculo incorreto e oportunidade encerrada. Confirmado EXECUTE permitido só ao service role na RPC de visita; usuário sem perfil continua recusado na pontuação. Tudo em transação com rollback; consulta posterior confirmou zero contatos sintéticos, responsáveis, oportunidades e visitas deixados pelo teste.
- Advisor mantém os avisos anteriores: 12 funções SECURITY DEFINER acessíveis a authenticated com guardas internas, proteção de senhas vazadas desativada no plano Free e quatro tabelas internas sem política RLS (bloqueadas ao cliente). Nenhuma nova RPC de visita exposta. Referências: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable e https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Pendente de homologação real: Renato iniciar conversa com seu número controlado, informar responsável/aluno/série e data/horário, responder SIM, conferir Famílias/Funil/Visitas e confirmar a chegada da resposta no aparelho. Nenhuma mensagem WhatsApp foi disparada por esta sessão. O callback de entrega e as pendências de produção anteriores permanecem fora desta atualização.

## 48. Próximo cliente — instalação separada (16/10/2026)

- Renato informou um futuro cliente e pediu avançar na finalização. A recomendação mantém um projeto Supabase e uma publicação por escola, usando a mesma base de código e credenciais/dados separados. Roteiro em `docs/INSTALACAO_NOVA_ESCOLA.md`.
- A organização CHARLY está em Free com CRM e AIMEDU ativos. O novo cliente foi identificado em 16/10 como **Colégio Conceito**, escola parceira. Organização de destino e custo aprovado ainda faltam antes de criar o projeto. Nenhum recurso novo foi criado. O código ainda precisa revisar marca, textos, fuso e ano fixos para outra escola; não anunciar provisionamento multi-escola completo.
- Renato perguntou sobre migrar para Hostinger. Recomendado manter Supabase gerenciado nesta fase; hospedar apenas a interface é separável da migração de Postgres/Auth/Storage/Functions. VPS com Supabase exige operação própria de segurança, atualizações, monitoramento e recuperação. Não houve contratação/migração.

## 49. Agenda da secretaria e verificação TypeScript (16/10/2026)

- Base desta rodada: `c8c8377`, PR #42 mesclado na main. Corrigidas falhas confirmadas na agenda: alteração de status apagava todas as anotações; opção Reagendada não solicitava data; agendamento aceitava data passada e duplicatas; atualização de visita realizada repetia histórico/prazo e podia regredir oportunidade já avançada ou matriculada.
- Migration `school_visit_secretary_workflow` aplicada como `20261016132306`; arquivo criado pelo CLI e renomeado para corresponder ao histórico remoto. As duas RPCs anteriores preservam as assinaturas. Nova `reschedule_school_visit` exige perfil admin/Secretaria, data futura finita e oportunidade ativa. Mesma ordem de locks (oportunidade → visita). Agendamento repetido retorna a visita existente; outro horário ativo exige reagendamento. RLS preservada; função não executável por anon.
- Notas não enviadas (`null`) são preservadas; string vazia limpa somente o campo explicitamente editado. A edição de anotações de visita realizada não muda a conclusão ou o prazo do retorno. Visita realizada não é reaberta; uma nova visita pode ser agendada. Etapas avançadas do funil não regridem com conclusão de visita.
- Interface carrega notas existentes, oferece nova data ao reagendar, mostra notas de próximo contato e atualiza agenda a cada 30 segundos, ao voltar à janela e pelo botão Atualizar. Erros de consulta recebem aviso de falha real, sem dizer incorretamente que falta migration. Horários da agenda usam o fuso da escola, padrão `America/Belem`, configurável por `VITE_SCHOOL_TIME_ZONE`.
- Verificação TypeScript global voltou a passar. Enum `lead_status` alinhado aos seis valores consultados no banco; removidos apenas `AppSidebar`, `PromptsTab` e `pages/Prompts`, sem imports/rotas/dependentes após busca em src, Functions, migrations e scripts. Não restaurar os templates antigos já excluídos. Não foi regenerado todo o arquivo de tipos.
- Validação: 13 testes locais (10 do handler da Ana + 3 de data/fuso) passaram; teste de data repetido em outro fuso do processo, ESLint direcionado, TypeScript e build Vite aprovados. Build mantém os avisos anteriores de tamanho de bundle e Browserslist.
- `supabase/tests/20261016_secretary_visits_transaction.sql` aprovado no banco real em transação com rollback e papel authenticated de secretaria/admin: agenda/repetição, confirmação, preservação e limpeza explícita de notas, novo horário, conclusão/repetição, histórico, datas passadas/infinitas, etapa avançada/matriculada e recusa/leitura negada para identidade sem perfil. Não gerou sessão de login, mensagem ou credencial.
- Publicação: PR #43 mesclado em `c9b4836`. Frontend público retornou HTTP 200; o bundle servido da agenda contém o reagendamento e a atualização automática. O navegador autenticado também mostrou os novos controles e textos.
- Renato concluiu login pelo formulário seguro, sem expor credenciais ao agente. Homologação visual com perfil administrador: cadastro de responsável/aluno/oportunidade; agendamento para 23/10 às 15h; confirmação; reagendamento para 26/10 às 16h30; conclusão; reabertura do formulário com as três anotações preservadas. Banco confirmou horário 19h30 UTC, etapa `visita_realizada`, próxima ação de retorno e um único histórico de conclusão. Nenhum telefone/email/opt-in associado ao teste, nenhum WhatsApp enviado.
- **Limpeza visual pendente:** a família fictícia `TESTE TEMPORARIO CRM 1610` (um responsável, aluno, oportunidade e visita) permaneceu após duas tentativas de exclusão pelo conector retornarem `Invalid or expired requestState`. Consulta posterior confirmou os registros presentes. Script restrito aos IDs e nomes exatos em `supabase/tests/20261016_secretary_ui_cleanup.sql`. Não apagar dados reais nem ocultar a pendência. Os testes SQL anteriores com rollback não deixaram registros; esta pendência é apenas do teste visual posterior. Tentativas de captura de evidência visual também falharam por timeout do navegador; nenhum arquivo de screenshot foi entregue.
- Continua pendente o teste real de WhatsApp com número controlado e confirmação da chegada no aparelho. Tráfego recente de entrada/saída observado não comprova cadastro/visita reais pela Ana. `delivery_logs` continua vazio; confirmação de entrega permanece pendente. Não afirmar homologação total do CRM.

## 50. Transferência e instalação independente do Colégio Conceito (16/10/2026)

- Renato criou nova conta Supabase, organização **AE SYSTEM** (`uailpmrcipmrlykdpyvd`, Free). Realizou convite entre contas, desconectou a integração GitHub do projeto e transferiu o COC pelo painel. A reconexão do Supabase neste chat confirmou `crm-escola` (`fenqnbzdjnyvgrmjczoi`) ativo na AE SYSTEM, com 168 contatos acessíveis. AIMEDU não foi transferido nesta tarefa.
- A nova conta já tinha o projeto vazio `CRM Escolas` (`xkcxvbagzxwwauofvlin`, us-west-2). Renato autorizou usá-lo para o Conceito, manter escolas separadas e renomear para **CRM COC** / **CRM CONCEITO**. Os nomes ainda não foram alterados: essa operação não existe no conector; requer painel. Não afirmar que foram renomeados.
- Instalação do Conceito em `deployments/conceito/`: baseline exclusiva aplicada como `20261016152954_conceito_school_baseline`, 24 tabelas RLS, visão invoker, funções escolares, auditoria e bucket privado. Estrutura revisada do catálogo atual; nenhuma linha, usuário, credencial, arquivo, cron ou callback do COC copiado. Migration adicional `20261016153113_conceito_restrict_platform_event_trigger` retirou acesso cliente ao event trigger gerado pela plataforma. Nunca executar a pasta legada da raiz no novo projeto.
- Falha inicial `Invalid or expired requestState` não gravou tabelas/migrations. Segunda tentativa apontou a visão `enrollment_forecast` ausente; baseline corrigida para incluí-la com security_invoker e aplicada com sucesso. Histórico remoto conferido; arquivos renomeados para refletir os timestamps aplicados.
- Configuração inicial: Colégio Conceito, agente provisório Assistente, agente/folder desligados, informações e valores vazios. Publicadas seis Edge Functions v1 ACTIVE: admin-manage-users, complete-school-attendance, send-school-folder, send-whatsapp-message, zapi-webhook e school-triage. Todas recusaram chamada sem autenticação com 401. Secrets de IA/Z-API/Vault ainda faltam; nenhum envio realizado.
- Validação SQL real em rollback com identidade sintética sem senha/sessão: cadastro, agenda, notas, reagendamento, conclusão, histórico, datas inválidas e permissões; cadastro manual/auditoria também aprovados. Consulta posterior confirmou zero usuários Auth e registros de famílias/contatos/visitas. Todas as 24 tabelas têm RLS.
- Interface compartilhada parametrizada por VITE_SCHOOL_NAME, identidade do menu e login; build normal mantém COC como padrão. `scripts/build-conceito.mjs` fixa o projeto exclusivo e gera dist-conceito; chave publicável em public-config.json. Build, TypeScript, lint direcionado, 13 testes e isolamento do bundle aprovados. Fonte preparada em branch/PR; não afirmar publicação do frontend do Conceito.
- Próximo passo: workspace Render precisa de escolha explícita (disponíveis CRM COC e AIM.Edu); serviço proposto crm-conceito, Static Site, build `npm ci && node scripts/build-conceito.mjs`, diretório dist-conceito, rewrite /* → /index.html. Nenhum serviço criado. Nomes no Supabase ainda pendentes, primeiro admin/Auth URLs, informações oficiais e integrações próprias também. Roteiro detalhado em deployments/conceito/README.md.
- Pendências do COC da seção 49 permanecem: teste WhatsApp real e limpeza do cadastro fictício. Esta rodada não alterou dados do COC nem resolveu aquelas pendências.

## 51. Folder de até 18 MB (16/10/2026)

- Renato informou PDF de 16,5 MB e autorizou limite de 18 MB. Validação e textos da tela ajustados para 18 × 1024 × 1024 bytes.
- Migration school_folder_limit_18mb aplicada no COC (20261016201551) e Conceito (20261016201552): bucket school-materials com file_size_limit 18874368; privacidade e restrição PDF preservadas.
- Build de produção aprovado. Alteração da interface incluída na publicação via main. Upload do PDF real e entrega por WhatsApp dependem do teste de Renato; nenhum arquivo ou mensagem foi enviado nesta rodada.

## 52. Ativação do folder da Ana (16/10/2026)

- Renato carregou folder-digital.pdf (17667379 bytes) no COC e pediu envio quando responsáveis solicitarem informações da escola. A chave escola_folder_ativo estava ausente; ativada explicitamente nesta rodada.
- Identificação ampliada para “informações da escola” e “conhecer a escola”, além dos pedidos de folder/mais informações. Mantidos envio apenas após resposta da Ana, respeito à intervenção humana e bloqueio de repetição em 24 horas.
- Nenhum envio manual ou reprocessamento de conversa: Renato fará o teste pela próxima mensagem no WhatsApp. Entrega no aparelho ainda não homologada.


## 53. Encerramento da orientação de matrícula (16/10/2026)

- Renato aprovou manter a explicação das etapas/turnos e a frase de matrícula do 8º ano até “com a documentação necessária.”, encerrando ali. Não oferecer coordenação nem pergunta adicional; secretaria continua o caso.
- school-triage v61 ACTIVE no COC; fonte publicada conferida contra GitHub (código 3ebc605). Prompt inclui texto aprovado, proíbe encaminhar matrícula à coordenação; respostas de matrícula com handoff não recebem oferta automática de ajuda nem novo follow-up de cinco minutos. Corte determinístico após a frase aprovada quando presente na resposta de matrícula com handoff.
- Verificação isolada com resposta original e complementos passou, preservando exatamente o texto aprovado. Não houve envio de WhatsApp nem teste completo de geração nesta rodada; validar na próxima conversa controlada de Renato. Conceito não foi republicado.


## 54. Correção da preferência de encerramento (16/10/2026)

- Renato esclareceu que “Posso ajudar em algo mais?” pode permanecer. A restrição é encaminhar matrícula, vagas e documentação à coordenação: esses assuntos permanecem com a secretaria.
- Publicada school-triage v62 ACTIVE no COC, fonte conferida após publicação. Oferta de ajuda e follow-up voltaram às condições anteriores; mantida a remoção de complementos após a frase aprovada antes de adicionar a oferta de ajuda. Prompt atualizado para permitir ajuda e impedir indicação da coordenação nesse contexto. Esta preferência substitui a restrição de encerramento da seção 53. Sem envio manual de WhatsApp.


## 55. Conferência da família e assinatura humana (16/10/2026)

- Renato confirmou que o folder chegou e o agendamento funcionou no teste real. Isso homologa esses passos no teste dele; não comprova automaticamente todos os cenários nem corrige o callback de entrega.
- Nova preferência: Ana coleta nome completo do responsável, nome do aluno, série, ano e turno opcional; apresenta resumo e pede SIM antes de gravar família/aluno/oportunidade. Corrigiu dados? Novo resumo e nova confirmação. SIM sem resumo não autoriza cadastro; confirmação usa exatamente os dados enviados, não uma nova inferência da IA. Visita continua com SIM separado e vínculo à oportunidade correta. O pedido de humano tem prioridade.
- Assinatura humana recuperada do combinado de 13/10: nome do perfil da sessão validada pelo servidor, formato “Renato — Secretaria COC”. Implementação antiga na branch de teste tinha escapes defeituosos; reaplicada sobre a v11 ativa e corrigida. A mensagem enviada e o histórico guardam assinatura, operator_id e operator_name. Corpo do navegador não pode definir operador nem se fazer passar por Ana; chamadas internas da Ana preservadas. Três operadores atuais têm full_name. Nome ausente gera orientação para preencher Meu perfil. Somente mensagens enviadas pelo CRM recebem assinatura; envio direto pelo aparelho não identifica automaticamente quem digitou.
- PR #46 mesclada em 5f1be3b4053c24abb48b054c8097fb1618e5e123. COC: school-triage v63 e send-whatsapp-message v12 ACTIVE, fontes conferidas após publicação. Auth interno e auxiliares preservados. Nenhuma migration ou mudança de frontend; Conceito não republicado nesta rodada (revisar rótulo Secretaria COC antes da implantação dele).
- Validação: 18 cenários dos handlers com banco e HTTP simulados, incluindo cadastro/correção/SIM/repetição, dados incompletos, intervenção humana, agenda, sessão sem papel, nome ausente, assinatura e identidade falsificada. Testes executados com remoção nativa de tipos no Node 24; TypeScript não estava instalado no runtime. Não houve envio real nesta sessão.
- Próximo teste de Renato: completar dados → conferir resumo → SIM → conferir família/funil; visita tem confirmação própria. Enviar uma mensagem manual pelo CRM e conferir assinatura no aparelho. Limpeza da família fictícia anterior e publicação do Conceito continuam pendentes.


## 56. Auditoria e hardening do CRM escolar (17/10/2026)

- Limpeza do teste visual concluída no COC: removidos apenas os IDs/nomes exatos de TESTE TEMPORARIO CRM 1610 e sua visita. O banco ficou com 2 responsáveis, 2 alunos, 2 oportunidades, 0 visitas e 0 tarefas. Nenhum dado real foi removido.
- Migration crm_school_write_path_hardening aplicada ao projeto COC como 20261017130455. Gravações de responsáveis, alunos, vínculos, oportunidades, visitas e tarefas agora passam pelas RPCs validadas; mensagens, histórico de atividade, anexos de e-mail e logs de entrega ficam somente leitura pelo cliente. Edge Functions de confiança continuam gravando com service_role.
- Corrigido refresh_related_enrollment_score() para ignorar o recálculo quando a oportunidade já foi removida por exclusão em cascata. Antes, excluir uma oportunidade com visita falhava porque o trigger tentava recalcular o pai já removido.
- Teste transacional com rollback aprovado depois da migration: cadastro manual, agendamento, leitura da equipe, bloqueio de escrita direta e exclusão em cascata passaram; nenhum registro sintético permaneceu.
- Auditoria identificou logs de dados pessoais nas funções de conversa. PR #47 foi mesclada em 058c19df. Edge Functions publicadas e ACTIVE no COC: zapi-webhook v19, send-whatsapp-message v13 e school-triage v64. Os logs não imprimem mais valores dinâmicos, conteúdo de mensagens, números, nomes, e-mails, LIDs ou objetos de erro. Nenhuma mensagem foi enviada nesta publicação.
- Advisor após hardening: 13 funções SECURITY DEFINER executáveis por authenticated continuam sinalizadas, mas as RPCs/helper functions usadas foram revisadas e têm guardas de papel. Não revogar em bloco. Proteção de senhas comprometidas continua desativada e depende de configuração no painel.
- Auditoria detalhada registrada em docs/AUDITORIA_CRM_2026-10-17.md. Pendências prioritárias: teste real de coleta/resumo/SIM pela Ana, assinatura humana no aparelho, callback de entrega Z-API, edição de famílias/alunos, atribuição entre atendentes e perfis adicionais para SaaS.
- Render não foi consultado nesta rodada. Antes de inspecionar deploys, Renato deve confirmar o workspace CRM COC para não confundir com AIM.Edu. O Conceito continua isolado e não foi alterado.


## 57. Restrição de gravação direta na tabela de contatos (17/10/2026)

- Migration crm_lead_column_permissions aplicada ao COC como 20261017131106. O cliente autenticado continua lendo leads e pode atualizar somente status, triage_status e resolved_at, usados pela interface de atendimentos. Não pode inserir/excluir leads nem alterar diretamente nome, telefone, e-mail, mensagens ou metadados da automação.
- Transições diretas de status para resolvido/matriculado e de triage_status para resolvido foram bloqueadas para usuários autenticados. Conclusão passa por complete-school-attendance (inclui pesquisa de satisfação); confirmação de matrícula permanece no funil escolar. A automação de servidor com service_role continua funcionando.
- Teste transacional com rollback aprovado: privilégios por coluna, atualização normal de status/triagem e bloqueio das transições terminais passaram. Nenhuma alteração persistiu.

---

## Estado operacional atualizado — 17/10/2026

> Esta seção é a referência mais recente e **supersede informações históricas anteriores** que indiquem que o CRM/Atendimentos ainda está em um estado de setembro ou que a Ana/configurações não foram verificadas. A validação real de ponta a ponta ainda não está concluída.

### Referência de código e publicação
- Repositório: `charlyjhone/crm-coc-macapa`, branch `main`.
- Commit funcional mais recente: `19dbea9b05a189649f9af17e2a270c064f8eedf3` — destaca handoffs aguardando secretaria. A correção de associação/paginação das mensagens está no commit anterior `18cee722ca70436518ca4949f797aad4f553f902`.
- Render confirmou `build_ended: succeeded` e `deploy_ended: succeeded` para o CRM COC e também para o serviço CRM Conceito. O repo é compartilhado, mas o build do Conceito continua usando `scripts/build-conceito.mjs`; não foram alterados dados, usuários, configurações ou banco do Conceito.
- A correção está publicada no frontend COC. Ainda falta confirmar a fila visualmente em sessão autenticada e homologar a lógica com mensagens controladas.

### Correção da fila “Pendentes de resposta”
- Antes, `src/hooks/usePendingLeads.ts` filtrava mensagens por `lead_id` e usava apenas as primeiras 1.000 linhas por canal. No banco havia 1.714 de 2.750 mensagens WhatsApp sem `lead_id` (382 inbound e 1.332 outbound).
- O hook foi alterado para:
  - considerar mensagens WhatsApp vinculadas por `lead_id` ou por telefone/variantes e identificadores `@lid`;
  - paginar o histórico em blocos de 1.000 para não truncar silenciosamente o histórico;
  - não excluir contatos apenas por status ou classificação, para que mensagens novas em contatos resolvidos/não classificados possam voltar à fila;
  - preservar o comportamento de e-mail baseado em `lead_id`.
- A fila inclui duas situações: (1) a última mensagem do canal é inbound; (2) `triage_status='aguardando_secretaria'`, mesmo quando a última mensagem armazenada é outbound da Ana. O segundo caso recebe o selo **Aguardando secretaria** e permanece visível até a equipe atualizar o andamento. Assim, a confirmação automática de encaminhamento não é confundida com resposta humana concluída. Telefones compartilhados por mais de um registro podem fazer a mesma conversa aparecer em múltiplos contatos; observar isso no teste e, se acontecer, ajustar com regra de desambiguação antes de escalar.
- Não houve alteração no banco nem atualização em lote de contatos.

### Configurações COC verificadas no Supabase
- `school-triage`: v66 ACTIVE; `zapi-webhook`: v19 ACTIVE; `send-whatsapp-message`: v13 ACTIVE; `complete-school-attendance`: v3 ACTIVE; `send-school-folder`: v1 ACTIVE.
- `escola_nome=COC Macapá Norte`, `escola_agente_nome=Ana`, `escola_agente_ativo=true`, `escola_folder_ativo=true` e `escola_info` estão presentes.
- `escola_valores` e `media_kit_link` estão vazios. Não inventar valores; confirmar o mecanismo/arquivo de envio do folder no WhatsApp real.
- A presença de configurações e funções ativas não equivale a homologação de entrega no WhatsApp. `delivery_logs` continua sem registros na fotografia consultada.

### Pendências de atendimento observadas
- Há 29 contatos ativos com `triage_status='aguardando_secretaria'`.
- Ao cruzar o histórico WhatsApp por telefone, 11 dos 29 tinham a última mensagem armazenada como `inbound`; 9 dessas entradas eram de mais de 7 dias. A lista inclui situações possivelmente concluídas, respostas curtas e pelo menos um contato comercial não relacionado a matrícula — revisar o histórico individual antes de tratar como pendência real.
- A cache de timestamps do lead só apontou 6 casos com entrada posterior à saída ou sem saída registrada, e 5 casos têm um dos timestamps de entrada/saída ausente; isso confirma que a cache não deve ser a única fonte da fila.
- O número anterior de 51 contatos com última entrada posterior à última saída era uma triagem ampla entre diferentes status; não significa que todos estejam sem resposta. **Não encerrar, apagar ou enviar mensagem em lote.**

### Plano urgente para liberação até segunda-feira
1. Conferir visualmente **Pendentes de resposta** em sessão autenticada; comparar ao menos um contato com `lead_id` e um contato WhatsApp relacionado só por telefone.
2. Revisar individualmente os 29 casos `aguardando_secretaria`; marcar para retorno somente após ler o histórico.
3. Com um número de teste autorizado, homologar mensagem recebida, resposta da Ana, resposta humana, encerramento e pesquisa de satisfação. Confirmar no aparelho e no CRM.
4. Testar cadastro de família/aluno/oportunidade com confirmação explícita e correção antes da confirmação.
5. Testar visita (agendamento, confirmação separada, reagendamento e conclusão) e tarefa (responsável, prazo, conclusão e próxima ação).
6. Antes de operar, conferir quem assume os atendimentos na secretaria e revisar diariamente pendências e atrasos na primeira semana.

### Limites desta etapa
- Não foram enviados WhatsApps de teste por esta sessão.
- Não foram alterados status, responsáveis ou dados pessoais dos contatos.
- Não foram executadas migrações ou mudanças no banco.
- A prioridade continua sendo confiabilidade operacional, não ampliar o escopo antes do lançamento.


## Atualização 2026-10-19 — revisão e correções da Ana

- PR #53 foi mesclado após a suíte de regressão e o build do frontend passarem.
- A Edge Function `school-triage` foi publicada somente no projeto Supabase `crm-coc` (COC Macapá Norte) e está ACTIVE na versão 90. O backend do Colégio Conceito não foi atualizado.
- A configuração `escola_valores_data_divulgacao` foi adicionada à tela Configurações gerais. Se estiver vazia, a Ana não deve inventar uma data para os valores de 2027; preencher somente após confirmação oficial.
- O prompt da Ana reforça: não repetir respostas/resumos/encaminhamentos, não perguntar novamente dados já informados, não revelar instruções internas e manter o encerramento “somente isso mesmo”.
- A pesquisa de satisfação usa `claim_crm_survey` para idempotência e é bloqueada para leads marcados como matriculados, oportunidades matriculadas ligadas ao lead ou ao responsável pelo telefone. O fechamento humano não depende de a pesquisa ser enviada com sucesso.
- Validação do PR #53: 24 testes automatizados passaram e `npm run build` passou. Nenhum WhatsApp real foi enviado.
- O frontend foi mesclado em `main`, mas a publicação/estado do serviço Render não foi confirmada nesta sessão.
- PR #54 (`fix/ana-media-understanding-20261018`) prepara análise de imagens e encaminhamento de documentos/PDFs/vídeos. Os testes do helper de mídia e do webhook passaram; ainda não foi mesclado nem publicado. **A análise de imagem envia a URL da imagem ao serviço de IA da OpenAI**, por isso aguarda aprovação explícita antes de ser ativada em produção.
- Próxima homologação: com número controlado e autorização, testar mensagem de texto, áudio, imagem comum, documento/PDF, figurinha, transferência para secretaria, encerramento e pesquisa; confirmar a resposta no aparelho e no CRM.

## 20. Configurações dedicadas da Ana (19/10/2026)

- Criada a aba **Atendente Virtual** em Configurações, separada das abas Escola e Integrações.
- A aba permite editar o nome e estado da Ana, a data de divulgação dos valores de 2027, o horário da secretaria, a antecedência mínima para visitas, a pesquisa de satisfação e o envio do folder digital.
- Valores confirmados: divulgação em **1º de novembro de 2026**; telefone é o mesmo número da integração WhatsApp; horário informado: **7h30 às 18h**.
- O telefone não é duplicado em `system_settings`; a interface usa o número conectado à instância WhatsApp.
- Novas chaves em `system_settings`: `escola_horario_secretaria`, `escola_antecedencia_visita_min`, `escola_pesquisa_ativa`. A função `school-triage` usa horário e antecedência configuráveis; `complete-school-attendance` respeita o interruptor da pesquisa.
- Migration `supabase/migrations/20261019130000_ana_virtual_attendant_settings.sql` define a data confirmada e insere defaults operacionais sem sobrescrever os valores existentes de horário, antecedência e pesquisa.
- `SchoolSettingsTab` mantém os dados oficiais da escola; `GeneralSettingsTab` mantém a integração WhatsApp, evitando controles duplicados.
- PR #54 foi integrada à `main` para encaminhar mídias à secretaria sem análise automática por IA; ainda falta publicar e validar as funções no projeto Supabase.
- Próximos passos: validar build/testes após a combinação das alterações, aplicar a migration no Supabase do COC, publicar o frontend no Render e testar no WhatsApp com contato controlado.


## 48. Nova agenda automática de visitas da Ana (19/10/2026)

- **Substitui o fluxo antigo:** a Ana não pede mais um segundo “SIM” para confirmar uma proposta de visita e não encaminha a disponibilidade à secretaria para confirmação posterior.
- Quando a família solicita uma visita, a Ana coleta apenas os dados que faltam, cadastra automaticamente responsável/aluno/oportunidade assim que estiverem completos e consulta a agenda antes de oferecer horários.
- Regras fixas da agenda: segunda a sexta, 08h–18h, horário de Macapá (America/Belem), slots de 30 minutos e antecedência mínima de 60 minutos. O horário geral da secretaria continua sendo uma informação separada.
- A função RPC `get_ana_available_visit_slots(date)` retorna apenas horários livres. `register_ana_school_visit` revalida e reserva dentro de transação com lock global, impedindo duas famílias de ocupar o mesmo intervalo.
- A visita é confirmada no WhatsApp somente depois do registro no banco. A família recebe data e hora; a equipe continua responsável por marcar a visita como realizada após o atendimento presencial.
- Removida a configuração editável antiga `escola_antecedencia_visita_min`; a aba de configurações apresenta as regras fixas de agendamento. O valor antigo foi removido de `system_settings`.
- Migrations: `20261019173000_ana_auto_visit_booking.sql` e `20261019180000_remove_legacy_visit_notice_setting.sql`.
- Publicado no Supabase COC (`fenqnbzdjnyvgrmjczoi`): `school-triage` v101 ACTIVE, `verify_jwt=false` preservado e validação interna de segredo mantida. A migration foi aplicada e a RPC de disponibilidade foi consultada com sucesso.
- Código e testes em `feat/ana-auto-agendamento-visitas`; antes de encerrar, revisar o CI do PR e validar com um número de teste real. Não considerar o envio pelo provedor como prova de entrega no aparelho.

## Layout novo no prévio do Conceito (21/10/2026)

Branch `feat/novo-visual-crm-escolas` (publicado só no serviço `crm-conceito-preview`; `main` e a produção não mudam).

- Menu superior trocado por barra lateral (`src/components/AppSidebar.tsx`): Hoje, Conversas, Funil, Direção; em "Mais": Visitas, Famílias e alunos, Tarefas. Equipe, Configurações e Auditoria ficam no menu do usuário.
- `/` e `/hoje` — nova tela Hoje (`src/pages/Hoje.tsx`): famílias aguardando a secretaria, visitas do dia (registro pelo `VisitStatusDialog`) e oportunidades/conversas sem retorno há 3 dias ou mais.
- `/atendimentos` — Conversas em três colunas (lista com abas Aguardando/Em conversa/Resolvidas/Todas, conversa, ficha da família com visita e resumo da IA). Envio, áudio, conclusão e pesquisa continuam usando as mesmas funções. Parâmetros antigos `?status=` são aceitos.
- `/funil` — quadro com quatro colunas (Novo interessado, Visita agendada, Visitou, Quer matricular) agrupando as etapas de `enrollment_opportunities`, com ficha lateral e `OpportunityProgressDialog`. `/matriculas` continua disponível.
- `/direcao` — indicadores de 7/30/90 dias: novos contatos, visitas realizadas, querem matricular, satisfação (pesquisa), contatos por período, origem (pesquisa; sem respostas usa a origem do funil), caminho das famílias e motivos de desistência.
- Telas antigas (`/captacao`, `/origem-conversao`, `/pendentes` etc.) seguem acessíveis pela URL.
- Nenhuma alteração de banco, funções ou permissões.
- Modo demonstração (`src/lib/demo.ts`): liga sozinho em hosts com "preview" (ou `?demo=1`; `?demo=0` desliga). Usa famílias fictícias em memória; enviar, resolver, mover no funil e registrar visita funcionam só na tela. Nada vai ao Supabase nem ao WhatsApp. Botões de cadastro que gravam no banco ficam ocultos.
- Cores por escola (`src/lib/crmTheme.ts`): um tema por modo de build (Conceito: verde-azulado + laranja; padrão: verde + verde-limão), aplicado como variáveis `--crm-*` no início do app.
- Cores do Conceito ajustadas pelo logo (turquesa #12B9AE, verde-água #46C8B6, laranja #E27C26; botões em #0B8077 para leitura com texto branco).
- Confirmar matrícula (`ConfirmEnrollmentButton`): no Funil e na ficha da conversa; usa a RPC existente `update_enrollment_progress` com `matriculado` (grava `enrolled_at`).
- Comparativo de matrículas (`useEnrollmentComparison`, `EnrollmentComparison`, `RecordEnrollmentsDialog`): a secretaria lança data + quantidade de matrículas do dia (ou cola vários dias); o sistema calcula o acumulado do ano letivo (campanha de 1º/08 a 31/03) e compara com a mesma data dos dois anos anteriores. Cartão na tela Hoje e painel na Direção.
- PENDENTE para usar fora da demonstração: criar a tabela `enrollment_history (academic_year int, day date unique, count int)` com RLS para usuários da equipe. Sem ela o comparativo usa só as matrículas confirmadas no funil e o lançamento mostra aviso. Não criada por decisão do responsável (prévio só para testes).
