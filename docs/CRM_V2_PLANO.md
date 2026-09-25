# CRM COC Macapá V2 — Plano de reconstrução limpa

## 1. Decisão

Construir uma nova versão do CRM escolar sem reaproveitar o frontend, prompts comerciais ou automações do sistema anterior.

A branch `main` atual permanece como referência histórica. Nenhum arquivo, dado ou serviço existente deve ser apagado até a V2 passar pelos testes de homologação.

## 2. Objetivo

Criar um CRM exclusivo do COC Macapá Norte para captar famílias, atender responsáveis, acompanhar alunos interessados e conduzir oportunidades até a matrícula.

O CRM continua separado do AIM.Edu. Integrações entre os projetos só poderão existir por contratos de API explícitos no futuro.

## 3. O que preservar

Preservar como regra de negócio e referência, sem copiar código automaticamente:

- identidade e comportamento da Ana;
- configuração oficial da escola;
- integração WhatsApp/Z-API;
- resolução de telefone, chat LID e vínculos de conversa;
- histórico necessário de mensagens e anexos;
- autenticação e perfis de acesso;
- fluxo escolar: responsável → aluno → oportunidade → visita/tarefa → matrícula;
- critérios de transferência para a secretaria;
- dados reais que forem validados para migração.

## 4. O que não levar para a V2

- Susan, Miguel e demais identidades antigas;
- publicidade, propostas comerciais, mídia kit e fluxos de vendas do sistema anterior;
- prompts antigos não relacionados à Ana;
- páginas e componentes sem função escolar;
- migrations legadas como base da instalação nova;
- dependências quebradas ou arquivos restaurados apenas por aparecerem no histórico;
- código de IA acoplado diretamente a um único provedor.

## 5. Arquitetura proposta

### Aplicação

- Frontend: React + TypeScript + Vite.
- Interface: Tailwind CSS + shadcn/ui.
- Estado remoto: TanStack Query.
- Backend e banco: Supabase.
- Hospedagem do frontend: Render inicialmente.
- Edge Functions: integrações, webhooks e operações protegidas.
- IA: gateway próprio, com OpenAI como padrão e possibilidade de fallback sem alterar as regras da Ana.

### Módulos

1. Autenticação e usuários.
2. Dashboard de captação.
3. Famílias e responsáveis.
4. Alunos interessados.
5. Funil de matrícula.
6. Conversas e histórico.
7. Visitas escolares.
8. Tarefas e retornos.
9. Configurações da escola.
10. Ana e transferência para atendimento humano.
11. Auditoria e logs.
12. Relatórios de origem e conversão.

## 6. Modelo de dados mínimo

### school_units

Unidades escolares e configurações básicas.

### profiles

Usuários internos, funções e vínculo com unidade.

### guardians

Responsáveis: nome, telefones, e-mails, origem, consentimento e observações.

### students

Alunos: nome, data de nascimento, série atual e dados escolares necessários.

### student_guardians

Relação entre alunos e responsáveis.

### enrollment_opportunities

Ano letivo, série pretendida, turno, origem, etapa, prioridade, responsável interno e próxima ação.

### conversations

Canal, responsável/aluno relacionado, estado do atendimento e responsável humano.

### messages

Mensagens inbound/outbound, provedor, identificadores externos, anexos, status de entrega e timestamps.

### school_visits

Agendamento, participantes, situação, impressões e resultado.

### enrollment_tasks

Tarefas, prioridade, vencimento, responsável e situação.

### enrollment_stage_history

Histórico imutável das mudanças do funil.

### school_settings

Nome da escola, horários, informações oficiais, valores, perguntas frequentes e liga/desliga da Ana.

### ai_runs

Modelo, tokens, custo, duração, resultado, erro e módulo responsável.

### audit_logs

Ações administrativas e alterações sensíveis.

## 7. Funil inicial

1. Novo contato.
2. Em atendimento.
3. Qualificado.
4. Visita agendada.
5. Em negociação.
6. Documentação.
7. Matriculado.
8. Perdido.
9. Nutrição.

Toda mudança de etapa deve gerar histórico. Estados terminais não podem ser alterados silenciosamente.

## 8. Ana V1

### Responsabilidades

- identificar a intenção;
- coletar nome do responsável;
- coletar nome do aluno;
- identificar série, turno e ano letivo;
- responder somente com informações oficiais cadastradas;
- criar ou atualizar a oportunidade;
- sugerir visita quando aplicável;
- registrar resumo e próxima ação;
- encaminhar para a secretaria quando necessário.

### Encaminhamento obrigatório

- negociação ou desconto;
- confirmação de vaga;
- documentos;
- condições específicas da criança;
- reclamações ou situações sensíveis;
- pedido explícito por atendimento humano;
- ausência de informação oficial;
- falha de IA ou falha de envio.

### Regras técnicas

- nenhuma mensagem será marcada como respondida antes da confirmação do provedor;
- webhooks devem ser idempotentes;
- telefone e LID precisam ser normalizados;
- prompts e configurações ficam versionados;
- secrets nunca ficam no frontend ou no GitHub;
- toda execução de IA gera log técnico e custo.

## 9. Etapas de construção

### Fase 0 — Fundação

- criar projeto limpo;
- definir variáveis de ambiente;
- configurar lint, build e validação;
- criar schema inicial e RLS;
- preparar ambientes de desenvolvimento e homologação.

Critério: instalação limpa, build aprovado e acesso autenticado funcionando.

### Fase 1 — CRM essencial

- responsáveis;
- alunos;
- oportunidades;
- funil;
- visitas;
- tarefas;
- dashboard básico.

Critério: cadastrar uma família e conduzir uma oportunidade manualmente até matrícula.

### Fase 2 — Conversas

- inbox;
- mensagens;
- Z-API inbound/outbound;
- LID/telefone;
- anexos e áudio;
- status de envio e leitura quando disponível.

Critério: conversa completa de teste sem duplicidade ou mensagem órfã.

### Fase 3 — Ana

- gateway de IA;
- configurações oficiais;
- triagem;
- coleta estruturada;
- criação/atualização de oportunidade;
- handoff humano;
- logs e custos.

Critério: testes ponta a ponta aprovados para perguntas simples, matrícula, falha e transferência humana.

### Fase 4 — Migração e produção

- selecionar dados legítimos;
- executar migração reproduzível;
- validar contagens e vínculos;
- conectar o Render;
- homologar com a secretaria;
- ativar produção gradualmente.

Critério: produção validada sem dependência do sistema antigo.

## 10. Testes obrigatórios

- build de produção;
- autenticação e permissões por função;
- RLS em todas as tabelas;
- criação e deduplicação de responsável;
- mais de um aluno por família;
- histórico de funil;
- webhook duplicado;
- telefone e LID;
- falha de envio;
- falha de IA;
- handoff humano;
- conteúdo oficial ausente;
- cálculo e registro de custo de IA;
- backup e restauração.

## 11. Estratégia de preservação

- `main` atual: referência histórica, sem novas limpezas destrutivas;
- V2: desenvolvimento isolado;
- banco atual: somente leitura durante o mapeamento;
- migrations novas: consolidadas e independentes das antigas;
- migração: scripts separados, repetíveis e auditáveis;
- corte para produção: somente após homologação.

## 12. Primeiro ciclo de implementação

1. Criar a estrutura limpa do aplicativo.
2. Definir o schema SQL consolidado.
3. Implementar autenticação e perfis.
4. Implementar famílias, alunos e oportunidades.
5. Implementar o funil.
6. Validar build no Render antes das integrações.
7. Adicionar mensagens/Z-API.
8. Implementar e homologar a Ana.

## 13. Decisões pendentes para o início da implementação

- nome definitivo do novo repositório;
- usar um novo projeto Supabase ou um schema limpo no projeto `crm-escola`;
- papéis iniciais de usuário;
- etapas finais do funil;
- dados que realmente precisam ser migrados;
- provedor e plano definitivo do WhatsApp.
