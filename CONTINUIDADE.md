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

## 15. Estado operacional verificado em 21–22/09/2026

### GitHub e limpeza local

- `main` remota verificada: commit `d5fbc3f`;
- branch local de limpeza: `cleanup/remove-unused-legacy-files`;
- commit local da limpeza: `d2cc30f` — `chore: remover arquivos legados e corrigir build`;
- resultado da limpeza: 24 arquivos alterados, 3.113 linhas removidas e 59 linhas adicionadas;
- build de produção aprovado após a limpeza: 3.459 módulos transformados;
- `git diff --check` aprovado;
- o lint completo ainda não passa: foram encontrados 237 erros e 12 avisos preexistentes, concentrados principalmente em Edge Functions legadas e usos antigos de `any`. Essa dívida não foi corrigida em massa para evitar ampliar o risco deste PR.

O commit `d2cc30f` ainda **não foi publicado no GitHub**. As tentativas automáticas de `git push` falharam antes da autenticação porque o ambiente de execução não conseguiu resolver `github.com`/`ssh.github.com`. Também foram preparados, como contingência, um patch Git e um ZIP limpo; as tentativas manuais pelo GitHub Desktop ainda não foram concluídas.

Uma chave SSH temporária, identificada no GitHub como **`Codex CRM COC — sessão 21/09/2026`**, foi adicionada à conta do responsável. O conteúdo privado da chave não deve ser registrado, copiado ou compartilhado. Remover essa chave das configurações do GitHub assim que a branch for publicada ou quando for decidido abandonar esse meio de acesso.

### Ana no Supabase

No ambiente implantado, foi verificado que:

- o projeto Supabase correto da conexão atual é `crm-escola`, ID `fenqnbzdjnyvgrmjczoi`; o ID antigo `swtujagetprnlmfvlega` estava obsoleto no `supabase/config.toml` e foi corrigido localmente;
- `school-triage` está publicada e ativa na versão 40;
- as regras recentes de identificação `*[Atendente Ana]*`, separação Secretaria/Financeiro e interrupção quando um funcionário responde estavam presentes na função implantada;
- os triggers de WhatsApp e e-mail estavam ativos;
- a causa de `create_lead_failed` foi confirmada: a função tentava inserir `status = "em_aberto"`, valor inexistente no enum `lead_status`;
- a versão 38 foi criada diretamente a partir da versão 37 implantada, alterando somente esse valor para `status = "novo"`;
- uma inserção equivalente foi validada dentro de transação com `ROLLBACK`, sem deixar contato ou atividade de teste no banco;
- o trigger `trigger_school_triage` foi migrado para remover totalmente a credencial e o cabeçalho `Authorization`; chamadas anônimas diretas à função SQL também foram revogadas;
- uma chamada técnica sem conteúdo confirmou HTTP 200 e `empty_text`, sem criar contato, chamar IA ou enviar mensagem;
- após a correção, execuções reais retornaram `success`, `enviado = true` e handoff `aguardando_secretaria`; mensagens seguintes foram corretamente interrompidas com `waiting_human`;
- `escola_agente_ativo` foi cadastrado explicitamente como `true`;
- a homologação com número controlado confirmou entrega real no WhatsApp, identificação `*[Atendente Ana]*`, classificação de horário e atualização do contato;
- a versão 39 corrigiu um handoff indevido: pedidos amplos de informações agora podem continuar com perguntas de qualificação, sem forçar atendimento humano apenas por terem sido classificados como `outros`;
- após receber série e turno no teste, a Ana retomou, classificou como `matricula`, respondeu e fez handoff legítimo para confirmação humana de vaga, valores e documentação;
- a versão 40 deixou de tratar o handoff como bloqueio total: enquanto a matrícula permanece na fila da secretaria, a Ana continua respondendo dúvidas autônomas como localização e horário;
- encerramentos curtos como “não”, “ok” e “obrigado” permanecem silenciosos durante o handoff, evitando mensagens repetitivas;
- o teste “Perfeito, qual a localização?” foi respondido com sucesso, classificado como `localizacao` e preservou corretamente o estado `aguardando_secretaria` da matrícula;
- antes das correções, não havia mensagens automáticas enviadas desde 18/09/2026; após as versões 38–40, respostas reais voltaram a ser enviadas e recebidas no WhatsApp;
- `escola_nome` e `escola_info` estavam preenchidos;
- `escola_valores` e `escola_agente_ativo` não estavam cadastrados;
- a `OPENAI_API_KEY` renovada havia sido validada anteriormente e não foi identificada como causa da falha;
- foi detectada uma credencial privilegiada gravada diretamente na definição SQL do trigger. Não reproduzir essa credencial. Ela precisa ser rotacionada e substituída por mecanismo seguro antes da homologação.

A falha `create_lead_failed` e a credencial embutida no trigger estão corrigidas. A Ana está operacional e já respondeu com sucesso em produção. Ainda falta a homologação funcional completa dos diferentes assuntos e a rotação planejada da chave antiga após inventariar dependências. Contatos e históricos existentes foram preservados.

## 16. Próximos passos imediatos

1. Publicar a branch `cleanup/remove-unused-legacy-files` e abrir PR contra `main`, sem mesclar automaticamente.
2. Revisar no PR a remoção dos 24 arquivos e confirmar novamente o build.
3. Após a publicação, remover a chave SSH temporária da conta GitHub.
4. Inventariar dependências da chave antiga e executar sua rotação planejada sem indisponibilidade.
5. Informar a lista oficial de números/e-mails internos da escola para preencher `_shared/internal-contacts.ts`; referências do CRM antigo foram removidas e a lista está vazia de forma intencional.
6. Ativar no painel do Supabase Auth a proteção contra senhas comprometidas. O Advisor continua apontando essa configuração; a sessão de navegador disponível exigiu novo login e nenhuma credencial foi solicitada ou manipulada.
7. Homologar os assuntos ainda não testados com números controlados: documentos, visita, currículo/RH, financeiro de aluno matriculado, coordenação, saúde, cadastro e resposta humana real.
8. Cadastrar `escola_valores` somente após definir os valores oficiais; `escola_agente_ativo` está explicitamente configurado como `true`.
9. Tratar gradualmente os 237 erros de lint preexistentes, sem alteração em massa que coloque o CRM em risco.

### Commits locais mais recentes

- `97f0f94` — corrigir criação de contatos pela Ana;
- `3dfcc07` — remover credencial do trigger da Ana;
- `cd8eec9` — evitar handoff prematuro da Ana;
- `53e67ca` — responder FAQs durante handoff da Ana.
- `c9712a8` — atualizar continuidade da Ana v40.

## 17. Correções operacionais e de segurança de 22/09/2026 — Ana v42

Foi executada uma nova auditoria depois da homologação inicial. O código publicado da versão 40 foi primeiro trazido de volta ao repositório para eliminar a divergência entre produção e fonte local. Em seguida foram aplicadas e publicadas as correções abaixo.

### Versões ativas

- `school-triage`: **v42**, ativa;
- `send-whatsapp-message`: **v9**, ativa;
- `zapi-webhook`: **v10**, ativa.

### Correções concluídas

- criada normalização compartilhada de telefones em `_shared/whatsapp-phone.ts`;
- celulares brasileiros antigos com oito dígitos passam a receber o nono dígito depois do DDD;
- 16 contatos e 196 mensagens antigas foram normalizados no banco sem remoção de histórico;
- o telefone controlado da homologação ficou canônico como `5596981064115`, mantendo o vínculo com o LID existente;
- mensagens enviadas pela Ana recebem `raw_data.sender_type = "ana"` e `raw_data.source = "school-triage"`;
- 46 mensagens históricas identificadas por `*[Atendente Ana]*` foram marcadas retroativamente como automáticas;
- a detecção de resposta humana agora ignora mensagens da própria Ana;
- a retomada após quatro horas não interpreta mais uma saída automática como resposta da Secretaria;
- áudio sem transcrição não é mais enviado à IA nem gera handoff: a Ana pede para reenviar o áudio ou escrever a dúvida;
- falha real no envio automático volta a gerar `aguardando_secretaria`, evitando atendimento fantasma;
- contradições entre Secretaria e Financeiro foram corrigidas em `escola_info`: interessados e novas matrículas permanecem com a Secretaria; Financeiro atende somente alunos já matriculados em assuntos posteriores à matrícula;
- referências antigas de Miguel, Inventor Miguel, Inventos Digitais, Yuri e Contentize foram removidas de `_shared/internal-contacts.ts`;
- foi criado `public.ana_followups`, com RLS, sem acesso de `anon` ou `authenticated`;
- um cron ativo, `ana-process-followups`, executa a cada minuto e processa acompanhamentos vencidos;
- cinco minutos depois de um novo handoff, a Ana pergunta uma única vez se pode ajudar em algo mais, somente se a família não continuou a conversa e nenhum funcionário respondeu;
- funções `SECURITY DEFINER` que são triggers deixaram de ser RPCs públicas;
- nenhuma função privilegiada permanece executável pelo papel `anon`;
- utilitários internos de cache, resolução de telefone, limpeza e contexto ficaram restritos ao `service_role`;
- a base de dados conserva as funções escolares necessárias aos usuários autenticados, que validam `auth.uid()` antes da execução.

### Verificações realizadas

- mensagem controlada de falha de áudio entregue no número autorizado com o texto correto e identificação da Ana;
- resposta gravada com telefone canônico, `sender_type = ana` e `source = school-triage`;
- teste do processador de follow-up cancelou corretamente uma tarefa cujo handoff já havia mudado, sem enviar mensagem indevida;
- job `ana-process-followups` confirmado ativo;
- `git diff --check` aprovado;
- build de produção aprovado novamente com 3.459 módulos transformados;
- configurações `escola_agente_ativo = true`, `escola_nome` e `escola_info` preservadas;
- `escola_valores` continua ausente propositalmente, até aprovação dos valores oficiais.

### Migrations adicionadas

- `20260922180000_align_ana_v41_phone_and_rules.sql`;
- `20260922183000_ana_handoff_followups.sql`;
- `20260922184500_harden_trigger_function_permissions.sql`.

### Limites conhecidos após a v42

- a proteção do Supabase Auth contra senhas vazadas ainda precisa ser ativada no painel autenticado;
- o Advisor ainda informa funções `SECURITY DEFINER` acessíveis a `authenticated`; as funções escolares mantidas nessa condição possuem verificação de `auth.uid()` e são usadas pelo CRM. Não revogar em massa;
- a lista oficial de contatos internos da escola ainda precisa ser fornecida;
- os valores oficiais de 2027 continuam não cadastrados;
- o lint completo permanece com 237 erros preexistentes, embora o build esteja aprovado;
- a branch local continua pendente de publicação no GitHub por causa do bloqueio de resolução de rede já registrado.

## 18. Correção de encerramentos curtos — Ana v43

Na continuidade da homologação com o número autorizado, foi confirmado no histórico real que a mensagem inbound **“Somente isso.”** recebeu indevidamente uma nova resposta da Ana perguntando se poderia ajudar em algo mais.

A causa era objetiva: a expressão regular já reconhecia “só isso” e “era só”, mas não continha a forma “somente isso”. A correção passou a reconhecer também “somente isso”, “apenas isso”, “é só isso”, “não obrigado”, “muito obrigado”, “resolvido” e equivalentes definidos no código.

Além do vocabulário ampliado, a regra agora consulta a última mensagem outbound: quando a Ana acabou de perguntar **“Posso ajudar em algo mais?”**, uma resposta curta de encerramento fica silenciosa mesmo se o estado do handoff tiver mudado entre as mensagens. Qualquer follow-up de cinco minutos ainda pendente para esse contato é cancelado com o motivo `conversation_closed`.

---

Última atualização deste documento: **22/09/2026 — Ana v43**.
Referência remota atual: **`main` em `d5fbc3f`**.
Referência local pendente de publicação: **branch `cleanup/remove-unused-legacy-files`, commit funcional mais recente — `fix: homologar Ana v42 e corrigir fluxo do CRM`**.
