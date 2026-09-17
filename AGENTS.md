# AGENTS.md — Regras Operacionais do CRM Escolar

## 1. Escopo

Este repositório pertence exclusivamente ao CRM COC Macapá Norte. Não introduza nomes, regras, prompts, domínios, produtos ou automações de outros projetos.

## 2. Log de prompts

Toda solicitação que resulte em alteração no repositório deve ser registrada em `PROMPTS.md` na mesma entrega.

Formato:

```md
### [HH:MM] Prompt
> Resumo fiel da solicitação.

**Ação:** resumo do que foi alterado e dos arquivos principais.
```

Use o horário local de Macapá (`America/Belem`). Apenas anexe novas entradas; não reescreva o histórico.

## 3. Segurança

- Nunca grave secrets, tokens, senhas ou chaves administrativas no GitHub.
- Funções com `SUPABASE_SERVICE_ROLE_KEY` devem autenticar cada requisição.
- Webhooks devem validar segredo ou assinatura.
- Não registre mensagens, telefones, e-mails, documentos ou payloads completos nos logs.
- Anexos e documentos devem usar buckets privados e URLs assinadas.
- Preserve RLS e o princípio do menor privilégio.

## 4. IA e atendimento

- Utilize somente informações oficiais cadastradas para a escola.
- Nunca invente preço, vaga, condição comercial, prazo ou documento necessário.
- Transfira para uma pessoa quando houver negociação, desconto, situação individual do aluno, dúvida não cadastrada ou pedido explícito.
- Registre modelo, uso e custo estimado das chamadas de IA.
- Minimize os dados pessoais e o histórico enviados ao provedor.

## 5. Deploy

Não faça deploy automático. Antes de publicar:

1. sincronize `PROMPTS.md`;
2. valide lint e build;
3. revise migrações e secrets obrigatórios;
4. teste WhatsApp, e-mail e handoff;
5. informe claramente qualquer ação manual necessária.
