# Plano — Material da aula: Remix do CRM (AutoLead/migueSALES)

## Objetivo

Criar o material completo da aula gravada em que o Miguel ensina alunos iniciantes a remixar **este sistema de CRM** (não o Creative Hub). Entrega: um arquivo `.md` em `/mnt/documents/` com **texto de slides + roteiro de narração** dos 9 blocos do briefing, adaptado ao sistema real.

## Conteúdo do documento

### Estrutura (seguindo os 9 blocos do briefing)

1. **Bloco 1 — Boas-vindas e acordo inicial** (~3-5 min): frases de abertura adaptadas, tirando a pressão do aluno.
2. **Bloco 2 — Decupagem do sistema** (~8-12 min): tour pelo CRM rodando de verdade — Caixa de entrada, Oportunidades (pipeline Aberto → Negociação → Ganho → Produzido → Entregue), Pendentes, Leads, Worker Mode, Reuniões, Insights (valores em EUR), Propostas com PDF, envio para Sara (produção) e Tiffany (financeiro). Para cada função: "o que isso faz por mim" na vida real + texto de slide correspondente.
3. **Bloco 3 — Mapa das integrações** (~5-8 min): explicação simples do que é integração e chave de API + tabela preenchida (Anexo A) com as integrações reais deste projeto:
   - **Resend** (envio/recebimento de e-mails da assistente) — conta própria, plano gratuito para começar
   - **Z-API** (WhatsApp) — conta própria, **paga** (aviso honesto de custo)
   - **ElevenLabs** (transcrição de áudios do WhatsApp) — conta própria, cobra por uso
   - **OpenAI** (fallback de transcrição) — conta própria, cobra por uso
   - **Granola** (sincronização de reuniões) — opcional
   - **Lovable Cloud** (banco de dados, login, arquivos) — já vem incluso, sem conta extra
   - **IA (Gemini via Lovable)** — já vem inclusa, sem chave
4. **Bloco 4 — Clonagem como usuário novo** (~5-8 min): roteiro clique a clique do Remix (janela anônima, botão preto no canto superior direito, tela de login, Remix de novo, nomear o projeto).
5. **Bloco 5 — O que o Lovable está fazendo** (~2-3 min): cópia independente, chaves vêm em branco, projeto é do aluno.
6. **Bloco 6 — Tela principal e primeiro passo** (~5-8 min): nomear áreas da tela; primeiro passo = criar o próprio usuário/senha e entrar no sistema.
7. **Bloco 7 — Configurando cada integração do zero** (~20-35 min): ciclo completo dos 7 passos (o que é → criar conta → gerar chave → guardar com segurança → conectar no projeto → testar → erro mais comum) **repetido para cada integração**, com texto de slide de capa por integração e ponto de descanso no meio.
8. **Bloco 8 — Personalização** (~8-12 min): cores, logo, nome; exemplo de pedido ruim vs. pedido bom para o Lovable; o que é seguro mexer.
9. **Bloco 9 — Fechamento** (~5-8 min): projeto rodando ponta a ponta, recapitulação, próximo passo concreto, onde tirar dúvidas.

### Elementos recorrentes no documento

- **Texto de slide** separado do roteiro: para cada momento-chave, um bloco `SLIDE n — título` com o texto enxuto que vai na tela, seguido do roteiro falado.
- Roteiro em PT-BR, na voz do Miguel, respeitando as 7 regras do briefing (nomear cliques, traduzir siglas, proibido "é só/simplesmente", antecipar erros, repetir o mapa).
- Frases-âncora do briefing adaptadas ao CRM.
- **Anexo A preenchido** com a tabela real de integrações + **versão simplificada para o aluno** (material de apoio).
- Checklist final de gravação adaptado.

## Observações

- Onde o briefing pede dado que só o Miguel tem (ex.: link público de remix, custo exato do plano Z-API), o documento terá marcadores `[PREENCHER: ...]` para ele completar antes de gravar.
- Arquivo final: `/mnt/documents/roteiro-aula-remix-crm.md`, entregue como anexo no chat.
- Prompt registrado em `PROMPTS.md` ao executar.
