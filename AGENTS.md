# AGENTS.md — Regras Operacionais do Projeto

Este documento define regras obrigatórias para qualquer agente (Lovable, Codex, etc.) que atue neste repositório.

## 1. Log de Prompts (`PROMPTS.md`) — OBRIGATÓRIO

**Toda mensagem do usuário deve ser registrada em `PROMPTS.md` na MESMA resposta em que é processada.** Sem exceção.

Formato (anexar ao final da seção do dia, criando o cabeçalho `## YYYY-MM-DD` se necessário):

```
### [HH:MM] Prompt
> Texto literal do prompt do usuário (pode truncar se muito longo, mas preserve o sentido).

**Ação Lovable:** Resumo curto (1–3 linhas) do que foi feito, arquivos principais tocados.
```

Regras:
- Use o horário local em formato 24h.
- Nunca pular um prompt, mesmo que seja pergunta curta, follow-up ou correção.
- Se esquecer em uma resposta, recuperar na próxima incluindo os prompts faltantes.
- Não reescrever entradas antigas — apenas anexar.

## 2. Checklist de Deploy / Publish

Antes de sinalizar ao usuário que algo está pronto para publicar, ou ao receber pedido de deploy/publish, o agente DEVE:

1. Verificar se todos os prompts da sessão atual estão registrados em `PROMPTS.md`.
2. Se faltar algum, adicionar imediatamente antes de prosseguir.
3. Confirmar ao usuário ("Prompts sincronizados em PROMPTS.md") junto com o aviso de publish.

## 3. Outras regras operacionais

- Voz da Susan em comunicações automatizadas (e-mail/WhatsApp em nome dela): 1ª pessoa, sem bajulação, Miguel sempre em 3ª pessoa.
- Nunca colocar o mesmo e-mail e WhatsApp duplicados — se o lead tiver WhatsApp, evitar enviar e-mail automaticamente para um endereço sintético.
- Mais regras específicas do produto vivem em `mem://index.md` (memória do projeto).
