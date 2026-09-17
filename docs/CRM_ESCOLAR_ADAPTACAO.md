# Plano de adaptação — CRM de Captação e Matrículas

## Diagnóstico técnico

A aplicação já oferece uma base reutilizável: autenticação, papéis de usuário, leads, histórico de atividades, e-mail, WhatsApp, reuniões, tarefas pendentes e páginas de oportunidades. A migração deve ser evolutiva para não romper esses fluxos.

Também existem heranças de um CRM comercial anterior em nomes, prompts, regras de vendas, integrações e funções. Esses elementos não devem ser simplesmente apagados antes de mapear suas dependências.

## Modelo escolar adotado

- **Responsável:** adulto que conversa e decide.
- **Aluno:** candidato à vaga; um responsável pode ter vários alunos.
- **Oportunidade de matrícula:** interesse de um aluno em uma unidade, ano, série e turno.
- **Visita:** compromisso e resultado da visita à escola.
- **Tarefa:** próxima ação operacional.
- **Capacidade:** vagas totais, reservadas e ocupadas.
- **Previsão:** soma ponderada das probabilidades das oportunidades.

A tabela legada `leads` continuará funcionando durante a transição. `legacy_lead_id` liga os novos registros ao histórico atual de e-mails, WhatsApp, reuniões e atividades.

## Funil oficial

1. Novo interessado
2. Tentativa de contato
3. Contato realizado
4. Qualificado
5. Visita agendada
6. Visita realizada
7. Condições apresentadas
8. Documentação pendente
9. Matrícula em conclusão
10. Matriculado
11. Nutrição
12. Perdido

## Entregas

### Fase 1 — Fundação

- [x] Modelo relacional escolar
- [x] Vagas e capacidade
- [x] Visitas
- [x] Tarefas e próxima ação
- [x] Probabilidade e explicação
- [x] Previsão ponderada
- [ ] Serviço de migração dos leads atuais
- [x] Cadastro transacional de família, aluno e oportunidade
- [ ] Tipos TypeScript gerados após aplicação da migração

### Fase 2 — Operação

- [x] Tela de famílias e alunos
- [x] Kanban de matrículas
- [ ] Agenda de visitas
- [ ] Documentos pendentes
- [ ] Motivos de perda
- [ ] Alertas de oportunidades paradas

### Fase 3 — Gestão

- [x] Painel executivo inicial
- [ ] Meta por série e turno
- [x] Ocupação e vagas no painel inicial
- [ ] Conversão por etapa
- [ ] Conversão por campanha
- [ ] Custo por matrícula
- [ ] Calibração da probabilidade com dados reais

### Fase 4 — IA e integrações

- [ ] Camada de IA independente de fornecedor
- [ ] Extração de aluno, série, turno e intenção
- [ ] Resumo e próxima ação sugerida
- [ ] Handoff humano obrigatório em casos sensíveis
- [ ] Integração com sistema acadêmico após matrícula

## Guardrails

- Nenhum registro legado será apagado na migração inicial.
- Conversas permanecem vinculadas ao lead legado até a validação do novo vínculo.
- Matrícula confirmada exige data de confirmação.
- Perda exige motivo.
- Vagas reservadas e ocupadas não podem superar a capacidade.
- Pontuação sempre deve possuir sinais explicáveis; IA não promete vaga ou desconto.
- Dados de crianças devem ser mínimos e relacionados ao responsável adulto.
