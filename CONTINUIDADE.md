# CONTINUIDADE — CRM COC Macapá Norte

## Estado verificado em 24/09/2026 — ler primeiro

Esta seção prevalece sobre os registros históricos abaixo. Branch atual:
`fix/reconcile-crm-continuity`, baseada em `cleanup/remove-unused-legacy-files` (`051afbe`).

- Proteção de `system_settings` aplicada em produção: somente administradores inserem/atualizam. Teste com admin/user aprovado, incluindo bloqueio de upsert do usuário comum; rollback integral.
- Migration registrada no banco e no código: `20260924222929_restrict_system_settings_writes_to_admin.sql`.
- Fila da Secretaria restaurada no código em `/atendimentos`; menu corrigido, sem SidebarTrigger incompatível nem link para rota antiga.
- Código do webhook sincronizado com a v11 já implantada. Ana v46 conferida com a produção. Nenhuma Edge Function republicada.
- Build (3.461 módulos) e lint direcionado aprovados. Frontend ainda depende de revisão/merge e publicação.
- Há 46 callbacks humanos recentes; amostra agregada compatível com a pausa de quatro horas. Teste controlado completo continua pendente.
- As implementações multi-escola descritas na seção 24 não estavam no GitHub. Não afirmar que foram recuperadas ou implantadas.
- Migrations antigas foram comparadas aos objetos instalados; há divergências de timestamps e registros ausentes. Não fazer db push automático nem declarar o histórico totalmente reconciliado. A nova migration foi aplicada isoladamente após conferir suas dependências.
- Detalhes e pendências: `docs/RECONCILIACAO_2026_09_24.md`.

As seções seguintes são histórico das sessões anteriores e contêm estados já superados.

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

**A Ana está operacional no WhatsApp e permanece em homologação funcional ampliada.**

O fluxo automático principal foi recuperado, publicado e testado em produção até a versão 46. Já existem entregas reais pelo WhatsApp, classificação, handoff, respostas a dúvidas autônomas, encerramentos silenciosos e proteção contra chamadas externas. Ainda não considerar todos os assuntos e o atendimento humano totalmente homologados até concluir os testes pendentes registrados nas seções 20 e 22.

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
- trate a Ana como **operacional no fluxo automático e ainda em homologação ampliada**, até concluir o teste real com resposta humana e os assuntos pendentes;
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

## 19. Proteção do acesso interno — Ana v44

O endpoint `school-triage` continuou com `verify_jwt = false` porque é chamado por trigger e `pg_cron`, mas deixou de aceitar requisições anônimas sem autenticação própria.

### Correções concluídas

- criado um segredo aleatório exclusivo em `vault.secrets`, com o nome `school_triage_webhook_secret`;
- o valor permanece criptografado no Supabase Vault e não foi incluído no código, nas migrations ou neste documento;
- o trigger `public.trigger_school_triage()` passou a ler o segredo no momento da chamada e enviá-lo no cabeçalho `x-school-triage-secret`;
- o job `ana-process-followups` foi recriado com o mesmo cabeçalho e continua executando a cada minuto;
- criada `public.verify_school_triage_secret(text)`, executável apenas por `service_role`; `anon` e `authenticated` não possuem permissão;
- `school-triage` valida o cabeçalho antes de ler o payload, consultar contatos ou enviar respostas;
- `school-triage` foi publicada como **v44**, ativa, ainda com `verify_jwt = false` por usar essa autenticação interna.

### Verificações realizadas

- chamada sem o segredo retornou HTTP 401 com `unauthorized`;
- chamada interna com o segredo do Vault retornou HTTP 200 e `empty_text`, sem enviar mensagem;
- execução real do cron protegido retornou HTTP 200, com zero itens pendentes e zero envios;
- o Vault contém exatamente um segredo com o nome esperado;
- permissões confirmadas: `anon = false`, `authenticated = false`, `service_role = true` para a função verificadora;
- build de produção aprovado com 3.459 módulos transformados;
- `git diff --check` aprovado.

### Migration adicionada

- `20260922203000_secure_school_triage_ingress.sql`.

### Advisor após a alteração

O Advisor não apontou a nova função verificadora. Permanecem os itens já conhecidos: proteção contra senhas vazadas desativada, 12 funções escolares `SECURITY DEFINER` intencionalmente acessíveis a usuários autenticados e tabelas internas com RLS sem policies públicas.

## 20. Continuidade da conversa e atendimento humano — Ana v46

Uma nova auditoria funcional foi feita sobre as conversas reais e sobre a fila de atendimentos. As versões 45 e 46 foram publicadas em sequência; a versão ativa ao final é a **v46**.

### Correções concluídas

- respostas estruturadas da IA agora usam schema JSON estrito e temperatura reduzida, diminuindo respostas ilegíveis ou fora do formato esperado;
- criada uma pré-visualização interna protegida para homologar respostas sem enviar WhatsApp nem alterar o contato;
- encerramentos como “era isso mesmo”, “só queria saber isso”, “não preciso de mais nada”, “por enquanto é só isso”, “valeu”, 👍 e 🙏 também ficam silenciosos no contexto correto;
- durante um handoff já existente, a Ana remove da resposta qualquer repetição de “Posso ajudar em algo mais?”;
- quando a primeira pergunta de nome é ignorada e a pessoa responde apenas socialmente, a Ana pode pedir o nome uma segunda vez, sem insistir indefinidamente;
- o fallback local de endereço e horário foi alinhado às informações oficiais atuais da escola, removendo o endereço antigo incorreto;
- ao iniciar ou renovar um handoff, `resolved_at` agora é limpo para evitar um contato simultaneamente resolvido e aguardando a Secretaria;
- criada a função/trigger `resolve_handoff_on_human_whatsapp_reply`: uma mensagem outbound humana resolve o handoff e cancela follow-ups pendentes;
- após uma resposta humana, a Ana permanece silenciosa por quatro horas para não interromper a conversa da equipe; depois desse período pode atender uma nova conversa normalmente.

### Homologação sem envio de mensagens

- localização durante handoff: respondeu a localização e não repetiu o convite de ajuda;
- informação adicional sobre criança de 3 anos: manteve o assunto de matrícula e não repetiu “Posso ajudar em algo mais?”;
- contato sem nome após resposta social: pediu o nome novamente e não fez handoff;
- funcionamento aos sábados: informou corretamente que não há aulas nem atendimento;
- resposta humana: teste dentro de transação confirmou mudança para `resolvido`, limpeza do handoff e posterior rollback integral; nenhuma mensagem de teste permaneceu no histórico;
- cron protegido continuou retornando HTTP 200 após a publicação da v46.

### Migration adicionada

- `20260922210000_resolve_handoff_on_human_reply.sql`.

## 21. Inbox escolar segura — 22/09/2026

A Inbox do frontend ainda continha identidade, filtros e ações do CRM comercial antigo, apesar de o restante da navegação já estar adaptado à escola. A auditoria confirmou que `public.email_messages` está vazia no projeto `crm-escola`, portanto não havia histórico escolar de e-mail a migrar ou preservar nessa tela.

### Correções concluídas

- removidos da Inbox os filtros e heurísticas específicos de Susan, Miguel e Sara;
- removidos nomes, etiquetas e endereços comerciais antigos da interface;
- o cabeçalho passou de “E-mails da Susan” para “E-mails da escola”;
- o compositor passou a identificar a resposta como “Ana — COC Macapá Norte”;
- o botão de geração por IA comercial foi desativado e substituído por resposta manual segura;
- a função antiga `generate-email-reply` não é mais acionada pela Inbox;
- envio manual continua usando `send-email`, cujas configurações atuais no banco são `Ana`, `ana@cocmacapanorte.com.br`, `COC MACAPÁ NORTE` e `coc@cocmacapanorte.com.br`;
- build de produção aprovado com 3.459 módulos transformados e `git diff --check` aprovado.

### Limite preservado

O webhook legado de entrada de e-mail ainda contém automações comerciais antigas e não foi reativado nem reescrito nesta etapa. Como não há mensagens em `email_messages`, o e-mail não integra o fluxo operacional atual. A próxima alteração nesse webhook deve ser uma substituição controlada pelo fluxo escolar, não uma limpeza parcial arriscada.

## 22. Estado consolidado para a próxima sessão

### Estado funcional atual

- `school-triage`: **v46**, ativa e protegida por segredo interno no Vault;
- `send-whatsapp-message`: **v9**, ativa;
- `zapi-webhook`: **v10**, ativa;
- WhatsApp inbound e outbound, criação/resolução de contato, identificação da Ana, handoff, follow-up e encerramentos curtos foram testados;
- cron `ana-process-followups` permanece ativo e respondendo HTTP 200;
- Inbox do frontend está adaptada ao COC e não chama mais o gerador comercial antigo;
- `public.email_messages` permanece vazia; o fluxo escolar de e-mail ainda não foi homologado;
- build de produção e `git diff --check` estão aprovados;
- nenhuma mensagem, contato ou histórico escolar foi apagado nas correções recentes.

### Commits locais mais recentes

- `66ec168` — `fix: adaptar Inbox para atendimento escolar`;
- `6953b9e` — `fix: estabilizar conversa e handoff da Ana`;
- `218e359` — `fix: proteger acesso interno da Ana`;
- `ea9a20d` — `fix: silenciar encerramentos curtos da Ana`;
- `ab69784` — `fix: homologar Ana v42 e corrigir fluxo do CRM`.

### Próxima ação prioritária

Executar o teste real controlado:

1. o responsável envia uma nova pergunta pelo número autorizado `5596981064115`;
2. a Ana responde e encaminha um assunto que exige a Secretaria;
3. um funcionário responde pela conta oficial da escola;
4. o responsável envia nova mensagem;
5. confirmar que o contato sai de `aguardando_secretaria`, o follow-up é cancelado e a Ana permanece silenciosa por quatro horas.

Não havia mensagem nova do número autorizado na última consulta feita após a publicação da v46.

### Pendências após o teste prioritário

1. homologar documentos, visita, currículo/RH, financeiro de aluno matriculado, coordenação, saúde, cadastro, anexos e áudio;
2. validar pela interface login, dashboard, famílias, alunos, funil, possibilidades, visitas, tarefas, Inbox, histórico e Atendimentos;
3. receber a lista oficial de telefones/e-mails internos da escola antes de preencher `_shared/internal-contacts.ts`;
4. cadastrar `escola_valores` somente quando os valores oficiais de 2027 forem aprovados;
5. substituir de forma controlada o webhook legado de entrada de e-mail por um fluxo escolar; não fazer limpeza parcial do arquivo implantado;
6. ativar a proteção contra senhas comprometidas no painel autenticado do Supabase Auth;
7. inventariar dependências e rotacionar a credencial privilegiada antiga sem indisponibilidade;
8. publicar a branch, abrir PR, revisar e remover a chave SSH temporária;
9. corrigir gradualmente os 237 erros e 12 avisos antigos de lint.

## 23. Identificação de respostas humanas no WhatsApp — Z-API webhook v11

Em 23/09/2026 foi confirmado em conversas reais que a Ana ainda entrava no meio
do atendimento da Secretaria. A regra de pausa da v46 estava correta, mas as
mensagens digitadas diretamente no WhatsApp da escola não chegavam ao CRM. No
histórico recente existiam apenas mensagens inbound dos responsáveis e outbound
da Ana; não havia callbacks `fromMe=true` das respostas humanas.

### Causa confirmada

- a opção **“Notificar as enviadas por mim também”** estava desativada na
  instância `Meu número` da Z-API;
- sem esse callback, o banco não recebia a resposta manual da Secretaria e não
  tinha sinal para acionar `resolve_handoff_on_human_whatsapp_reply`;
- por isso, a Ana podia responder a uma nova mensagem do responsável mesmo com
  um funcionário conversando pelo WhatsApp da escola.

### Correções concluídas

- a opção **“Notificar as enviadas por mim também”** foi ativada e salva no
  painel da Z-API;
- `zapi-webhook` foi publicado como **v11**, ativo;
- `fromMe` e `fromApi` agora são normalizados explicitamente, aceitando booleano
  ou string sem interpretar a string `"false"` como verdadeira;
- mensagens outbound digitadas no aparelho são persistidas com
  `raw_data.sender_type = "human"` e `raw_data.source = "whatsapp-device"`;
- callbacks de envio por API permanecem distinguíveis das mensagens manuais e
  as respostas da Ana continuam protegidas contra loop/assunção humana falsa;
- o trigger existente da v46 continua sendo a fonte de verdade para resolver o
  handoff, cancelar follow-up e impor silêncio de quatro horas.

### Verificações realizadas

- build de produção aprovado com 3.459 módulos;
- `git diff --check` aprovado;
- publicação da Edge Function confirmada: `zapi-webhook` v11, status `ACTIVE`;
- teste transacional com mensagem `sender_type = human` confirmou mudança do
  contato para `resolvido` e limpeza de `handoff_at`;
- o teste foi revertido integralmente; nenhuma mensagem técnica ficou no
  histórico e nenhum WhatsApp foi enviado.

### Teste real ainda necessário

Em uma conversa controlada, a Secretaria deve enviar uma resposta diretamente
pelo WhatsApp da escola. Confirmar no banco que o callback chegou como outbound
humano (`fromMe=true`, `sender_type=human`, `source=whatsapp-device`) e que uma
mensagem seguinte do responsável não recebe resposta da Ana durante quatro
horas.

---

## 24. Preparação para operação multi-escola isolada

Em 23/09/2026 o projeto começou a ser preparado para atender o COC Macapá e
escolas parceiras sem compartilhar dados entre clientes. A decisão arquitetural
é manter um único código privado e criar uma implantação e um projeto Supabase
independentes para cada escola, além de um ambiente separado de homologação.

### Alterações concluídas no código

- identidade visual e nomes da escola passaram a ser configuráveis por variáveis
  `VITE_SCHOOL_*`, sem duplicar o código para cada cliente;
- foram adicionados modelos de configuração para homologação e para uma escola;
- o build de publicação agora valida ambiente, URL, tipo de chave e identificador
  da escola antes de gerar os arquivos;
- foi criado um workflow de CI para validar build e arquivos gerados em pull
  requests, mantendo a publicação em produção sob aprovação manual;
- `supabase/config.toml` deixou de apontar diretamente para o projeto de produção;
- o fallback de `school-triage` ficou genérico e o agente passa a permanecer
  desligado quando a configuração da escola estiver ausente;
- a arquitetura, o fluxo de atualização e o checklist de criação de uma nova
  escola foram documentados em `docs/ARQUITETURA_MULTI_ESCOLA.md`.

### Verificações realizadas

- build normal aprovado com 3.460 módulos;
- build de publicação com configuração de teste aprovado com 3.460 módulos;
- `git diff --check` aprovado;
- nenhum banco ou ambiente de produção foi alterado nesta etapa.

### Segurança do repositório

Foi identificado que `charlyjhone/crm-coc-macapa` ainda estava público e que a
branch `main` continha um arquivo `.env`. O fluxo para tornar o repositório
privado foi iniciado, mas o GitHub exigiu confirmação de identidade por e-mail
no último passo. Até essa confirmação ser concluída, considerar o repositório
como público. Depois da mudança, revisar o histórico e rotacionar qualquer
credencial que possa ter sido exposta; apenas mudar a visibilidade não revoga
segredos antigos.

### Próximos passos desta arquitetura

1. concluir a confirmação de identidade do GitHub e validar que o repositório
   aparece como privado;
2. ativar proteção da `main`, exigindo CI aprovado e pull request antes de merge;
3. remover o `.env` da `main` e rotacionar credenciais potencialmente expostas;
4. provisionar homologação e uma produção Supabase por escola, após confirmar
   organização, nomes e custos;
5. criar uma migração nova para eliminar URLs históricas de produção embutidas
   em funções SQL; o Supabase CLI pode ser executado via `npx` e deve ser usado
   para gerar os arquivos de migration;
6. aplicar a mesma estrutura ao AImEdu em uma etapa separada, preservando
   projetos, bancos, segredos e domínios próprios.

---

Última atualização deste documento: **23/09/2026 — arquitetura multi-escola isolada preparada localmente**.
Referência remota atual: **`main` em `d5fbc3f`**.
Referência local: **branch `cleanup/remove-unused-legacy-files`; publicar após concluir a revisão de segurança**.

## 25. Homologação operacional do CRM — fila da Secretaria

Em 23/09/2026 foi iniciada a homologação consolidada para liberar o CRM ao uso
diário da Secretaria. A inspeção foi feita no código local e no projeto Supabase
de produção `crm-escola`, sem criar, alterar ou apagar dados escolares.

### Correção concluída no frontend

- a página existente `Atendimentos` voltou a ter rota em `/atendimentos`;
- o menu `Atendimento` passou a exibir `Inbox` e `Fila da secretaria`;
- foi removida da página a dependência de um `SidebarProvider` que não existe no
  layout atual;
- o link antigo para `/opportunity/:id`, rota já removida do CRM escolar, deixou
  de ser exibido;
- a fila permite visualizar novos atendimentos, repasses para a Secretaria,
  respostas da Ana e resolvidos, além de concluir um atendimento.

### Estado confirmado em produção

- projeto Supabase ativo e saudável;
- `school-triage` v46, `send-whatsapp-message` v9 e `zapi-webhook` v11 ativos;
- cron `ana-process-followups` ativo a cada minuto;
- triggers de triagem e de resolução por resposta humana ativos no banco;
- dois usuários cadastrados, um `admin` e um `user`, sem usuário sem papel;
- configurações `escola_nome`, `escola_info` e `escola_agente_ativo` preenchidas;
- `escola_valores` continua ausente de forma intencional;
- 27 contatos ativos e 18 aguardando a Secretaria;
- ainda não existem responsáveis, alunos, oportunidades, visitas ou tarefas no
  novo módulo escolar;
- o número controlado teve atividade recente, mas nenhum callback outbound
  humano foi registrado nos últimos sete dias. O teste real de pausa da Ana
  continua pendente.

### Alertas encontrados

- o histórico remoto de migrations termina em
  `20260922124525_remove_school_triage_trigger_credential`, embora mudanças
  posteriores estejam instaladas no banco e documentadas localmente. Antes de
  criar outro ambiente, reconciliar o histórico para que o banco seja
  reproduzível;
- usuários autenticados comuns conseguem atualizar `system_settings` pela API.
  A tela é administrativa, mas a RLS ainda precisa restringir escrita ao papel
  `admin` antes da liberação;
- a proteção contra senhas vazadas permanece desativada no Supabase Auth;
- o Advisor mantém os avisos conhecidos sobre 12 funções `SECURITY DEFINER` e
  três tabelas internas sem policies públicas; não revogar em massa sem revisar
  cada fluxo;
- a mudança do repositório GitHub para privado ainda depende da confirmação de
  identidade apresentada pelo próprio GitHub.

### Verificações desta etapa

- build de produção aprovado com 3.462 módulos;
- lint direcionado dos arquivos da fila aprovado;
- `git diff --check` aprovado;
- a tentativa de teste visual automatizado não foi concluída porque o navegador
  remoto não alcançou o servidor local. Não considerar navegação autenticada
  homologada somente pelo build.

### Próxima sequência obrigatória

1. restringir escrita de `system_settings` a administradores mediante migration
   rastreável;
2. reconciliar as migrations instaladas depois de `20260922124525`;
3. testar com login real: dashboard, famílias/alunos, funil, visitas, tarefas,
   Inbox, fila da Secretaria, usuários e configurações;
4. executar o teste real de resposta humana pelo WhatsApp da escola;
5. concluir a privacidade/proteção do GitHub e só então publicar/hospedar.

---

Última atualização deste documento: **23/09/2026 — fila da Secretaria restaurada e produção auditada**.
Referência local: **branch `cleanup/remove-unused-legacy-files`; commit de homologação pendente nesta seção**.
# Correção da identificação humana — estado consolidado (23/09/2026)

- **Causa confirmada nos dados:** nas 48 horas auditadas, nenhuma mensagem digitada manualmente no WhatsApp da escola chegou ao CRM com `fromMe=true`. Sem esse callback, o CRM não sabe que a Secretaria assumiu a conversa e a Ana pode responder no meio do atendimento.
- **Configuração necessária na Z-API:** ativar `notifySentByMe` para que mensagens enviadas pelo próprio número conectado também sejam entregues ao webhook “Ao receber”. Endpoint oficial: `PUT /update-notify-sent-by-me` com `notifySentByMe: true`.
- **Correção local e publicada:** `supabase/functions/zapi-webhook/index.ts` reconhece booleanos e strings nos campos `fromMe`/`from_me`, identifica callbacks de envio e grava `sender_type=human` para mensagens manuais ou `sender_type=ana` para mensagens enviadas pela API.
- **Proteção preservada:** o trigger `resolve_handoff_on_human_whatsapp_reply` já retira o contato de `aguardando_secretaria`, cancela follow-up e mantém a Ana silenciosa após uma mensagem humana.
- **Produção confirmada:** `zapi-webhook` v11 está ativa. A opção `notifySentByMe` também foi ativada na Z-API. O código local foi alinhado à origem `whatsapp-device` usada pela versão implantada.

## Teste obrigatório após publicar

1. A Ana encaminha um contato para a Secretaria.
2. Um funcionário responde manualmente pelo WhatsApp da escola.
3. Confirmar no banco que a mensagem foi salva como `direction=outbound`, `raw_data.sender_type=human` e `raw_data.source=whatsapp-device`.
4. O responsável envia uma nova mensagem dentro de quatro horas.
5. Resultado esperado: Ana permanece silenciosa e o contato não volta para `aguardando_secretaria`.

## 26. Proteção administrativa preparada

- o Supabase CLI 2.117.0 foi executado via `npx`;
- a migration `20260923185832_restrict_system_settings_writes_to_admin.sql`
  foi criada pelo comando oficial `supabase migration new`;
- a migration remove as policies de escrita abertas a qualquer usuário
  autenticado e cria policies de INSERT e UPDATE condicionadas a `is_admin`;
- o diretório temporário `supabase/.temp/` foi incluído no `.gitignore`;
- a migration ainda **não foi aplicada em produção**: a consulta de verificação
  anterior perdeu a conexão e a nova tentativa foi recusada pelo conector;
- nenhuma policy ou dado de produção foi alterado nesta etapa.

## 27. Passagem de continuidade para outra conta

Estado local consolidado em 23/09/2026:

- branch de trabalho: `cleanup/remove-unused-legacy-files`;
- commit mais recente antes desta atualização documental: `23c9112` —
  `security: preparar restricao das configuracoes escolares`;
- build de produção aprovado com 3.462 módulos;
- `git diff --check` aprovado;
- a migration de proteção administrativa está versionada, mas ainda não foi
  aplicada ao Supabase;
- nenhuma alteração desta última etapa foi feita no banco de produção;
- a próxima conta deve começar lendo `AGENTS.md` e este arquivo, conferir a
  branch e os commits mais recentes no GitHub e não trabalhar apenas sobre a
  `main` antiga.

### Ordem recomendada para continuar

1. confirmar que a branch foi publicada integralmente no GitHub;
2. revisar e abrir PR contra `main`, sem merge automático;
3. restaurar/autorizar o conector Supabase e verificar se as migrations de
   `20260922180000` a `20260922210000` já estão materialmente instaladas;
4. reconciliar o histórico remoto antes de aplicar novas migrations;
5. aplicar e testar
   `20260923185832_restrict_system_settings_writes_to_admin.sql`, comprovando
   que `admin` escreve e `user` não escreve em `system_settings`;
6. executar o teste real de resposta manual da Secretaria no WhatsApp;
7. concluir a privacidade do repositório, proteção da `main`, hospedagem e teste
   autenticado de todas as telas.

### Regra de segurança para a próxima conta

Não pedir, copiar ou registrar senhas, tokens, códigos de autenticação ou
chaves privilegiadas. Não aplicar migrations pendentes apenas para fazer o
histórico “ficar verde”: primeiro comparar o objeto instalado no banco e o SQL
local. Não encerrar nem apagar os atendimentos reais que permanecem na fila da
Secretaria.

---

Última atualização: **23/09/2026 — passagem de continuidade preparada para publicação no GitHub**.
