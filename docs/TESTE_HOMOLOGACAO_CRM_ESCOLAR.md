# Teste de homologação — CRM escolar

Este roteiro valida a fundação escolar sem remover ou converter automaticamente os dados do CRM legado.

## 1. Preparação

1. Confirmar que o ambiente é de homologação.
2. Fazer backup do banco.
3. Aplicar `supabase/migrations/20260917190000_school_enrollment_foundation.sql`.
4. Executar `supabase/tests/20260918_school_crm_preflight.sql`.
5. Regenerar os tipos do Supabase.
6. Publicar a branch `codex/fundacao-crm-escolar` em uma URL de teste.

O pré-voo deve terminar sem exceções e retornar os totais das tabelas escolares.

## 2. Fluxo mínimo obrigatório

### Família e aluno

- Abrir **Captação → Famílias e alunos**.
- Cadastrar um responsável com WhatsApp autorizado.
- Cadastrar um aluno, ano, série e turno.
- Confirmar que responsável, aluno e oportunidade aparecem juntos.
- Tentar cadastrar novamente o mesmo telefone e confirmar que não surge outro responsável duplicado.

### Funil

- Abrir **Captação → Funil de matrículas**.
- Localizar o aluno criado.
- Avançar para **Contato realizado** e definir a próxima ação.
- Confirmar a mudança no Kanban, pontuação e histórico.
- Não testar perda sem informar o motivo: o sistema deve bloquear.

### Visita

- Abrir **Captação → Visitas escolares**.
- Agendar uma visita para a oportunidade.
- Confirmar que a etapa muda para **Visita agendada**.
- Marcar como confirmada e depois realizada.
- Registrar impressão da família, objeções e retorno.
- Confirmar a criação do follow-up após a visita.

### Tarefas

- Abrir **Captação → Tarefas e follow-ups**.
- Criar uma tarefa com prazo e prioridade.
- Concluir a tarefa criando o próximo passo no mesmo formulário.
- Confirmar que a tarefa concluída sai da fila e a nova aparece.

### Possibilidades

- Abrir **Captação → Possibilidades de matrícula**.
- Clicar em **Recalcular possibilidades**.
- Confirmar que a explicação menciona os sinais presentes no cadastro.
- Verificar pontuação entre 0% e 100% e confiança entre 0% e 100%.
- Confirmar que tarefas vencidas e falta em visita reduzem a pontuação.

### Origem e conversão

- Criar oportunidades com origens e campanhas diferentes.
- Abrir **Captação → Origem e conversão**.
- Conferir interessados, visitas, matrículas e conversão por canal.
- Confirmar que oportunidades sem origem aparecem em **Origem não informada**.

## 3. Responsividade e visual

Validar em:

- desktop com 1440 px;
- notebook com 1024 px;
- tablet com 768 px;
- celular com 390 px.

Conferir navegação horizontal, formulários, cartões, tabelas com rolagem e contraste dos textos. Nenhum texto pode ficar cinza-claro sobre fundo branco.

## 4. Critérios para aprovação

- nenhum erro no console;
- nenhum cadastro parcial;
- nenhuma oportunidade sem aluno;
- nenhuma matrícula sem data de conclusão;
- nenhuma perda sem motivo;
- atualização correta do funil após visita;
- tarefas e próximas ações sincronizadas;
- pontuação explicável;
- CRM legado preservado;
- build de produção aprovado.

## 5. Resultado técnico atual

- build Vite aprovado com 3.498 módulos;
- lint dos arquivos escolares aprovado;
- carregamento por rota habilitado;
- migração e pré-voo aguardando execução no Supabase de homologação.
