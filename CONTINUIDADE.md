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
