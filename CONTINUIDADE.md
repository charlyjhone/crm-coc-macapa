# CONTINUIDADE — CRM COC MACAPÁ NORTE

> **Leia este arquivo antes de alterar o projeto.**
>
> Atualizado em 21/09/2026. Este documento existe para permitir que outra conta, desenvolvedor ou sessão do ChatGPT continue o trabalho exatamente de onde paramos.

## Objetivo

Este repositório deve se tornar o **CRM próprio do COC Macapá Norte**, e não apenas uma adaptação visual do CRM comercial que serviu de base.

Não reconstruir do zero. Preservar infraestrutura útil e remover o domínio antigo.

### Preservar / evoluir

- WhatsApp e Z-API;
- normalização de telefone e LID;
- histórico de mensagens;
- anexos, áudio e transcrição;
- autenticação e usuários;
- agente virtual **Ana**;
- responsáveis, alunos e vínculos;
- oportunidades de matrícula;
- visitas e tarefas;
- funil escolar.

### Remover / substituir

Tudo que seja específico do CRM anterior: Miguel, Susan, Sara, Tiffany, publicidade, palestra, consultoria, mentoria comercial, propostas, delivery, Worker Mode, Granola, Media Kit, follow-up comercial e regras de produtos antigos.

---

## Supabase correto

O backend deste CRM é o projeto **crm-escola**.

Ele é separado do **AIM.EDU**. Nunca executar limpeza deste CRM no banco do AIM.EDU.

Uma homologação anterior registrou 12 leads e 94 mensagens de WhatsApp preservadas. Esses números são históricos e devem ser novamente medidos no runtime atual; não assumir que continuam iguais.

---

## Ana

Ana é a única persona pública do atendimento automatizado do COC Macapá Norte.

Fluxo técnico auditado:

```text
Z-API
  -> zapi-webhook
  -> whatsapp_messages
  -> trigger PostgreSQL
  -> school-triage
  -> IA
  -> send-whatsapp-message
  -> Z-API
```

O trigger deve processar somente mensagens `inbound`, evitando loop com respostas da própria Ana.

A Ana não deve inventar valores, descontos, vagas, condições ou procedimentos. Quando a informação oficial não estiver disponível, deve encaminhar para a secretaria.

---

## Estrutura escolar a preservar

Já existe fundação escolar no banco/código:

- `school_units`
- `guardians`
- `students`
- `student_guardians`
- `enrollment_opportunities`
- `school_capacity`
- `school_visits`
- `enrollment_tasks`
- `enrollment_stage_history`

O funil escolar atual usa principalmente:

- `src/pages/EnrollmentPipeline.tsx`
- `src/pages/EnrollmentPossibilities.tsx`

Esses módulos substituem o antigo conceito comercial de Opportunities.

---

## Trabalho já incorporado ao main

### PR #3 — Ana V0.1

- identidade da agente alterada para Ana;
- actor de WhatsApp alterado de Miguel para Ana;
- falha de envio automático agora gera handoff para secretaria;
- removidos comandos antigos de produtos no webhook.

### PR #4 — limpeza visual

Foram removidas rotas/navegação de módulos antigos como Proposal, Worker Mode, Insights, Archived, Unclassified e Pendentes antigos.

### PR #5 — automações comerciais

Aproximadamente 5.960 linhas removidas.

Saíram follow-ups comerciais, publicidade, geração/visualização de propostas e memórias relacionadas.

### PR #6 — oportunidades comerciais

Aproximadamente 10.208 linhas removidas.

`Opportunities.tsx` e `OpportunityDetail.tsx` foram removidos. O funil escolar é o modelo oficial.

### PR #7 — cérebro do CRM antigo

Aproximadamente 20.858 linhas removidas.

Foram retirados prompts Susan/Miguel, páginas comerciais antigas, LeadCard/leadPriority antigos, Granola, Tiffany, delivery, análise jurídica, diagnóstico comercial, export antigo, geração de slides e documentação PROMPTS/AGENTS do sistema anterior.

---

## PONTO EXATO ONDE PARAMOS — PR #8

Existe um PR aberto:

**PR #8 — Repositório próprio: remover arquivos e dependências desnecessárias**

Branch:

```text
cleanup/repository-phase5
```

Antes de qualquer nova alteração, verificar o estado/mergeabilidade do PR #8. Se estiver limpo, validar e incorporar.

O PR #8 contém a Fase 5 de higiene do repositório:

- remoção de artefatos antigos em `.lovable`;
- remoção do plano Miguesales;
- remoção de regras antigas de produto;
- remoção de componentes órfãos;
- remoção do cleanup-unclassified antigo;
- remoção do lockfile Bun textual;
- remoção do `lovable-tagger` de `package.json` e Vite;
- remoção de `previewAuthStorage.ts`;
- remoção do uso do preview storage no cliente Supabase;
- README reescrito como **CRM COC Macapá Norte**.

A ferramenta utilizada não conseguiu excluir `bun.lockb` por ser binário. Verificar se ainda existe e removê-lo por método apropriado se não for necessário.

---

## Descoberta sobre Lovable

Uma intervenção anterior havia informado que o Lovable já tinha sido removido e que o build passava com 3.497 módulos.

Na auditoria atual, porém, o `main` ainda continha:

- `lovable-tagger`;
- `previewAuthStorage.ts`;
- configuração de preview Lovable;
- README orientado ao Lovable.

Por isso o PR #8 está fazendo novamente essa limpeza.

**Importante:** remover Lovable como plataforma de autoria/preview NÃO significa apagar cegamente o gateway de IA. Algumas Edge Functions, inclusive a Ana, ainda podem usar `ai.gateway.lovable.dev` e `LOVABLE_API_KEY`. Só substituir isso depois de preparar outro provider e testar a Ana.

---

## Pendências prioritárias depois do PR #8

### 1. Inbox

`src/pages/Inbox.tsx` ainda foi encontrado com lógica antiga:

- Inbox da Susan;
- Miguel Fernandes;
- Susan;
- Sara;
- domínios inventormiguel;
- responder como Susan.

Não apagar o Inbox cegamente. Ele pode ser útil como central de atendimento. Refatorar para **Inbox/Atendimentos COC**.

### 2. Internal contacts

`supabase/functions/_shared/internal-contacts.ts` ainda contém regras de bloqueio relacionadas a:

- inventormiguel.link;
- inventormiguel.com;
- inventosdigitais.com.br;
- nomes/tokens do projeto anterior.

Isso é risco operacional porque pode ignorar contatos incorretamente. Remover/substituir por configuração própria do COC.

### 3. E-mail

Ainda existem funções genéricas/legadas como:

- `send-email`;
- `generate-email-reply`;
- `import-email-messages`;
- `reprocess-email-directions`;
- `reprocess-forwarded-emails`;
- `reprocess-lead-emails`;
- `resend-inbound-webhook`.

Primeiro decidir se e-mail continuará como canal do CRM escolar. Se sim, reescrever como COC/Ana. Se não, remover depois de confirmar dependências.

### 4. MCP server

`supabase/functions/mcp-server/index.ts` ainda é grande e contém domínio do CRM anterior. Auditar. Se não tiver uso escolar real, remover; se tiver infraestrutura útil, reescrever para responsáveis/alunos/matrículas.

### 5. .env / secrets

Foi identificado um `.env` no repositório. **Nunca exibir valores no chat.**

Auditar somente nomes/presença. Se houver credenciais reais versionadas:

1. remover `.env` do Git;
2. adicionar ao `.gitignore`;
3. criar `.env.example` sem segredos;
4. rotacionar credenciais comprometidas;
5. avaliar limpeza do histórico Git.

---

## Próxima auditoria global

Depois de incorporar o PR #8, pesquisar novamente no estado real do `main`:

```text
Miguel
Susan
Sara
Tiffany
inventormiguel
publicidade
palestra
consultoria
mentoria
treinamento
documentario
proposal
Media Kit
delivery
Worker
Granola
Lovable
```

A busca do GitHub pode manter resultados indexados de arquivos já removidos. Confirmar sempre pela árvore/arquivo atual antes de concluir que algo ainda existe.

---

## Depois do código: Supabase crm-escola

Somente depois de estabilizar o repositório, auditar o runtime do Supabase **crm-escola**:

- tabelas;
- views;
- functions;
- triggers;
- policies/RLS;
- cron jobs;
- Edge Functions implantadas;
- Storage;
- settings;
- secrets (somente presença, nunca valor).

Classificar cada estrutura como:

- MANTER
- ADAPTAR
- MIGRAR
- REMOVER

Excluir um arquivo de Edge Function no GitHub não garante que a função implantada tenha sido removida do Supabase.

Criar migration segura para remover tabelas/colunas comerciais antigas somente após confirmar que não existem dependências.

---

## Build e homologação

Após a limpeza:

```bash
npm install
npm run build
npm run lint
```

Corrigir imports/referências quebradas antes de considerar a limpeza concluída.

Depois homologar:

- login;
- dashboard;
- responsáveis;
- alunos;
- funil;
- possibilidades;
- visitas;
- tarefas;
- Inbox/Atendimentos;
- WhatsApp;
- Ana;
- contato novo;
- contato existente;
- handoff para secretaria;
- histórico;
- anexos;
- áudio.

Teste mínimo da Ana com número novo:

> Boa tarde, queria saber sobre matrícula para o 6º ano em 2027.

Esperado: Ana responde, atendimento é registrado e o interesse de matrícula entra no CRM.

Depois:

> Qual o valor?

Enquanto não houver valor oficial configurado, Ana não inventa e encaminha para a secretaria.

---

## Regra de continuidade

**NÃO RECOMEÇAR DO ZERO.**

A estratégia aprovada é:

```text
preservar infraestrutura boa
        +
remover domínio antigo
        +
fortalecer domínio escolar
        =
CRM próprio COC Macapá Norte
```

O objetivo final é que GitHub, frontend, backend e banco contem a mesma história:

**CRM COC MACAPÁ NORTE — Ana + Atendimento + Famílias + Alunos + Matrículas + Visitas + Tarefas + Inteligência de Captação.**


---

# ANEXO A — CONTEXTO TÉCNICO DETALHADO PARA OUTRA CONTA

Esta seção complementa o resumo acima. Ela existe para evitar perda de contexto entre contas/sessões e deve ser atualizada a cada fase relevante.

## Histórico da intervenção anterior ao trabalho atual

Antes desta auditoria, uma sessão anterior registrou a seguinte situação:

- referências/dependências do Lovable teriam sido removidas do código auditado;
- `lovable-tagger` teria sido retirado;
- autenticação específica das prévias Lovable teria sido retirada;
- orientação de sincronização pelo chat Lovable teria sido retirada;
- build de produção teria sido aprovado com **3.497 módulos compilados**;
- Supabase correto confirmado como **crm-escola**, separado do AIM.EDU;
- **12 leads** e **94 mensagens de WhatsApp** teriam sido preservados.

A auditoria atual encontrou novamente parte das dependências Lovable no `main`. Portanto, esse registro deve ser tratado como histórico, não como prova do estado atual. O PR #8 corrige novamente esses itens.

## PRs desta auditoria

### PR #3 — `Ana V0.1: corrigir fluxo de atendimento e remover legado crítico`

Já incorporado.

Arquivos principais:

#### `supabase/functions/send-whatsapp-message/index.ts`

- actor de atividade alterado de `miguel` para `ana`.

#### `supabase/functions/school-triage/index.ts`

- prompt identifica Ana como assistente virtual oficial do COC Macapá Norte;
- primeira interação pode apresentar Ana naturalmente;
- criado tratamento `falhaEnvio = !!resposta && !enviado`;
- se a IA gera resposta mas a entrega falha:
  - `triage_status = aguardando_secretaria`;
  - grava `handoff_at`;
  - `handoff_reason = Falha no envio automático da resposta`;
- atividades passaram a identificar Ana e diferenciar falha de envio.

#### `supabase/functions/zapi-webhook/index.ts`

Removido bloco de comandos explícitos do CRM anterior:

- /palestra
- /publicidade
- /consultoria
- /mentoria
- /treinamento
- /documentario

Também foram removidos filtros explícitos de e-mail Miguel/Brotherhood e comentários/semântica de “órfão/Miguel” para número desconhecido.

### PR #4 — `Limpeza CRM COC: remover legado visível da Susan/Miguel`

Já incorporado.

Alterações:

- `GeneralSettingsTab.tsx`: retirada de configurações visíveis Susan/empresa/Media Kit/propostas;
- `App.tsx`: retirada das rotas antigas Pendentes, Unclassified, Archived, Proposal, Insights e WorkerMode;
- `AppSidebar.tsx`: retirada da navegação correspondente.

### PR #5 — `Limpeza CRM COC: remover automações comerciais legadas`

Já incorporado.

Cerca de **5.960 linhas removidas**.

Foram removidos, entre outros:

- `followup-engine`;
- `followup-publicidade`;
- `followup-urgentes-digest`;
- `non-publicidade-digest`;
- `suggest-worker-actions`;
- `generate-proposal-content`;
- `generate-proposal-email`;
- `generate-proposal-pdf`;
- `view-proposal`;
- `Proposal.tsx`;
- `WorkerMode.tsx`;
- memórias antigas relacionadas a Susan, propostas e follow-up.

### PR #6 — `CRM próprio: substituir oportunidades comerciais pelo funil escolar`

Já incorporado.

Cerca de **10.208 linhas removidas**.

Removidos:

- `src/pages/Opportunities.tsx`;
- `src/pages/OpportunityDetail.tsx`;
- rotas e navegação correspondentes.

Motivo: eram módulos comerciais extensos com publicidade, palestra, propostas, delivery, análise jurídica, Susan e follow-up. O substituto correto já existe em `EnrollmentPipeline.tsx` e `EnrollmentPossibilities.tsx`.

### PR #7 — `CRM próprio: remover cérebro e integrações do sistema antigo`

Já incorporado.

Cerca de **20.858 linhas removidas** em 24 arquivos.

Foram removidos:

- `src/data/promptTemplates.ts`;
- `src/lib/leadPriority.ts`;
- páginas antigas Leads/Archived/Insights/Unclassified;
- `LeadCard.tsx`;
- Meetings/Granola antigos;
- `audience-facts.ts`;
- `loop-in-miguel.ts`;
- Tiffany export/test;
- analyze-legal-risk;
- create-delivery;
- diagnose-leads;
- generate-lead-export;
- generate-slide-images;
- sync/upsert Granola;
- PROMPTS.md e AGENTS.md antigos;
- botão de sincronização Granola da sidebar.

### PR #8 — `Repositório próprio: remover arquivos e dependências desnecessárias`

**ABERTO NO MOMENTO DA CRIAÇÃO DESTE CHECKPOINT.**

Branch:

`cleanup/repository-phase5`

Mudanças preparadas:

- remoção de arquivos `.lovable` legados;
- remoção do plano Miguesales;
- remoção de regras antigas de produto;
- remoção de componentes órfãos;
- remoção de `cleanup-unclassified-leads`;
- remoção de `bun.lock`;
- tentativa de remoção de `bun.lockb` falhou pela ferramenta por ser binário;
- remoção de `lovable-tagger` do package.json;
- remoção de componentTagger do Vite;
- remoção de `previewAuthStorage.ts`;
- cliente Supabase deixa de usar `brokeredPreviewStorage`;
- README refeito para identidade CRM COC Macapá Norte;
- este `CONTINUIDADE.md` criado e ampliado.

Antes do merge, conferir build/estado do PR.

## Detalhes do domínio escolar

Migration principal identificada:

`supabase/migrations/20260917190000_school_enrollment_foundation.sql`

Ela contém a fundação escolar e deve ser preservada.

Estágios conhecidos de `enrollment_opportunities`:

1. novo_interessado
2. tentativa_contato
3. contato_realizado
4. qualificado
5. visita_agendada
6. visita_realizada
7. condicoes_apresentadas
8. documentacao_pendente
9. matricula_em_conclusao
10. matriculado
11. nutricao
12. perdido

RPCs identificadas:

- `create_school_enrollment(...)`;
- `update_enrollment_progress(...)`;
- `schedule_school_visit(...)`;
- `update_school_visit_status(...)`.

## EnrollmentPipeline

`src/pages/EnrollmentPipeline.tsx` utiliza `enrollment_opportunities`.

Campos observados:

- id
- stage
- probability_score
- score_explanation
- desired_grade
- desired_shift
- next_action
- next_action_at
- student.full_name
- guardian.full_name
- guardian.phone

O pipeline visual trabalha com etapas escolares e exclui matriculado/perdido/nutricao da visão principal.

## EnrollmentPossibilities

`src/pages/EnrollmentPossibilities.tsx` também utiliza `enrollment_opportunities`.

Faixas atuais:

- alta possibilidade: >= 80;
- média: 50–79;
- atenção: < 50.

Também utiliza confiança dos dados, estágio, série/turno, explicação do score e próxima ação.

RPC observada:

`recompute_all_enrollment_scores`.

## Arquitetura detalhada do school-triage

Configurações lidas atualmente:

- `escola_agente_ativo`;
- `escola_info`;
- `escola_valores`;
- `escola_nome`.

Se não houver `lead_id`, tenta resolver pelo telefone. Historicamente ainda existe criação em `leads`, o que deve ser migrado futuramente para o domínio responsável/aluno sem quebrar mensagens existentes.

O agente interrompe automação quando:

`triage_status === aguardando_secretaria`.

Endpoint de IA observado:

`https://ai.gateway.lovable.dev/v1/chat/completions`

Modelo observado na auditoria:

`google/gemini-3.8-flash`

Secret esperado:

`LOVABLE_API_KEY`

Não registrar o valor desse secret.

Situações de handoff identificadas:

- pedido explícito por pessoa;
- negociação;
- descontos;
- caso específico do aluno;
- documentos;
- vaga específica;
- assunto fora das informações oficiais.

Falha da IA ou falha de envio deve resultar em atendimento humano, não em resposta inventada.

## Trigger PostgreSQL da triagem

Migration auditada:

`supabase/migrations/20260910144056_874a0f2c-24bf-47f5-afdb-120c8198f32c.sql`

Proteção importante:

`IF NEW.direction <> 'inbound' THEN RETURN NEW; END IF;`

Há triggers para WhatsApp e e-mail.

A chamada HTTP do trigger pode falhar e ser convertida em warning SQL, permitindo que a mensagem inbound continue gravada. Portanto, “mensagem apareceu no CRM” NÃO prova que `school-triage` executou com sucesso.

Na homologação futura, conferir logs/runtime.

## send-whatsapp-message

Secrets esperados:

- `ZAPI_INSTANCE_ID`;
- `ZAPI_TOKEN`;
- `ZAPI_CLIENT_TOKEN`.

Preservar normalização de telefone e resolução de LID.

## Arquitetura de mensagens por telefone

Documento técnico ainda útil:

`.lovable/memory/architecture/whatsapp-phone-based-storage.md`

Mesmo estando sob pasta `.lovable`, o conteúdo descreve uma arquitetura útil: mensagens pertencem primariamente ao número de telefone e não necessariamente a um lead.

Helpers de banco identificados:

- `whatsapp_phone_variants(text)`;
- `resolve_lead_ids_by_phone(text)`;
- `recompute_lead_whatsapp_cache(uuid)`;
- trigger `whatsapp_message_recompute_caches_trigger`.

Antes de apagar esse documento, migrar o conteúdo útil para `docs/` se a arquitetura continuar válida.

## Pendências técnicas concretas

### Inbox

Na última auditoria, `src/pages/Inbox.tsx` continha referências ativas a:

- domínios internos de Miguel/Susan;
- `inferMiguelAsSender`;
- `isMiguelEmail`;
- `isSusanInboxEmail`;
- Susan/Sara;
- `susan@inventormiguel.link`;
- `sara@inventormiguel.link`;
- “Miguel Fernandes”;
- “E-mails da Susan”;
- “Responder como Susan”.

Refatorar, não apenas renomear mecanicamente.

### get-settings

`supabase/functions/_shared/get-settings.ts` ainda foi observado com defaults:

- `susan_name`;
- `susan_email`;
- `company_name`;
- `company_email`.

Migrar para configuração escolar quando as funções dependentes forem definidas.

### send-email

Ainda foi observado usando `susan_name`, `susan_email` e actor `susan`.

### generate-email-reply

Ainda foi observado usando:

- `LOVABLE_API_KEY`;
- identidade Susan;
- lógica de prospect/cliente;
- proposta/follow-up;
- gateway Lovable AI.

Não confundir “remover Lovable do frontend” com “desligar o provider de IA” antes de substituir dependências.

### ActivityLog

Ainda foi observado com actors/labels:

- miguel;
- susan;
- tiffany;
- sara;
- proposal_sent.

Refatorar para atores/eventos escolares depois de verificar dados históricos.

### internal-contacts

Alta prioridade. Remover regras específicas de Inventor Miguel e substituir por configuração escolar segura.

### mcp-server

Arquivo observado com aproximadamente 71 KB e domínio comercial antigo. Auditar referências e uso real antes de remover.

### resend-inbound-webhook

Arquivo observado com aproximadamente 123 KB. Auditar profundamente; não manter apenas porque é grande e não remover apenas porque é legado.

## Higiene do GitHub

Objetivo adicional aprovado pelo responsável do projeto: **limpar o repositório GitHub**, removendo arquivos desnecessários e código morto.

A limpeza deve abranger:

- arquivos órfãos;
- documentação obsoleta;
- integrações sem uso;
- componentes não importados;
- lockfiles de gerenciadores não utilizados;
- restos do clone;
- testes exclusivos do CRM antigo;
- arquivos gerados que não deveriam estar versionados.

Manter migrations necessárias e documentação operacional atual.

## Segurança

Foi observado `.env` na árvore do Git.

Não abrir/exibir valores em conversa.

Se contiver secrets reais, tratar como possível exposição mesmo que o repositório seja privado:

- remover do versionamento;
- adicionar ao .gitignore;
- criar .env.example;
- rotacionar credenciais;
- avaliar histórico Git.

Também existe migration com chave publishable hardcoded. Não reproduzir a chave em documentação/chat. Validar a estratégia de autenticação do trigger durante auditoria do runtime.

## Base de conhecimento futura da Ana

Ainda não foi construída de forma definitiva.

Planejamento:

1. fatos oficiais;
2. procedimentos da secretaria;
3. exemplos reais;
4. guardrails/handoff.

Coletar:

- horários;
- matrículas;
- valores e condições 2026/2027;
- documentos;
- séries;
- turnos;
- material didático;
- uniforme;
- Edify/programa bilíngue;
- visitas;
- transferências;
- secretaria;
- financeiro;
- situações especiais;
- FAQ;
- objeções de matrícula;
- regras de encaminhamento.

Cenários de teste:

- “Tem vaga no 7º ano?”
- desconto para irmãos;
- transferência no meio do ano;
- pergunta somente por preço;
- pedido de visita.

## Direção futura da interface da Ana

Planejado:

**Configurações → Ana**

Possíveis seções:

- Identidade
- Base de Conhecimento
- Matrículas
- Horários
- Financeiro
- Secretaria
- Pedagógico
- Edify
- FAQ
- Regras
- Encaminhamentos
- Testes

Desejado um simulador que mostre resposta, fonte/regra usada e motivo de eventual handoff antes de colocar mudanças em produção.

## Checklist para a próxima sessão/conta

1. Ler este arquivo inteiro.
2. Conferir PR #8 e branch `cleanup/repository-phase5`.
3. Não recomeçar o CRM.
4. Não tocar no AIM.EDU.
5. Não apagar histórico WhatsApp.
6. Não expor secrets.
7. Validar/mergear PR #8.
8. Fazer busca global no `main` real após o merge.
9. Refatorar Inbox/internal-contacts.
10. Auditar cadeia de e-mail e mcp-server.
11. Fazer build/lint.
12. Só então planejar migration de limpeza do Supabase `crm-escola`.
13. Auditar funções implantadas/cron no runtime.
14. Homologar Ana com número novo.
15. Atualizar este `CONTINUIDADE.md` ao final da próxima fase.

---

# ANEXO B — PRINCÍPIO DE DECISÃO

Quando houver dúvida sobre um módulo, não decidir pelo nome. Perguntar:

**Isto representa infraestrutura reutilizável ou regra de negócio do CRM anterior?**

Exemplos:

- normalização de telefone → infraestrutura → manter;
- LID WhatsApp → infraestrutura → manter;
- anexos → infraestrutura → manter;
- transcrição de áudio → infraestrutura → manter;
- autenticação → infraestrutura → manter;
- publicidade/palestra → negócio antigo → remover;
- proposta comercial → negócio antigo → remover;
- Granola do CRM anterior → remover se não houver uso escolar;
- lead genérico → migrar para responsável/aluno/oportunidade;
- Inbox → adaptar para atendimento COC;
- e-mail → decidir pelo uso escolar real;
- IA → desacoplar provider sem quebrar Ana.

O resultado esperado não é “um clone limpo”. É um **CRM escolar próprio e sustentável**.
