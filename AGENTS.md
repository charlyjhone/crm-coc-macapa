# AGENTS.md — Regras de trabalho no CRM COC Macapá Norte

## Continuidade obrigatória

Antes de analisar, editar, remover ou criar código neste repositório:

1. Leia `CONTINUIDADE.md` por completo.
2. Confira se existem commits na `main` posteriores ao commit de referência registrado nele.
3. Considere o estado atual do código como fonte de verdade quando houver divergência com documentação antiga.

## Identidade do projeto

Este repositório é o **CRM próprio e exclusivo do COC Macapá Norte**, destinado a captação e matrículas escolares.

Não reintroduza, sem solicitação explícita do responsável:
- Susan;
- Miguel;
- publicidade comercial;
- propostas comerciais do sistema antigo;
- automações de marcas/parcerias;
- cérebro, prompts ou regras do CRM anterior.

## Preservação

- Não recomece o projeto do zero.
- Não restaure arquivos removidos apenas porque aparecem no histórico Git.
- Antes de remover código, pesquise dependências no frontend, Supabase Functions, migrations e integrações.
- Migrations antigas exigem cuidado especial: não apagar somente por conterem nomenclatura histórica.
- Para mudanças de risco, prefira branch/PR e preserve uma referência funcional.
- Nunca grave secrets, tokens ou credenciais na documentação.

## Ana

A Ana é a atendente virtual escolar. Enquanto `CONTINUIDADE.md` indicar que ela está em diagnóstico/homologação, não a trate como funcional em produção sem teste ponta a ponta.

## Atualização deste documento vivo

Após alterações estruturais relevantes, atualize `CONTINUIDADE.md` com:
- o que mudou;
- o que foi validado;
- problemas encontrados;
- pendências;
- novo commit/estado de referência quando aplicável.

O histórico Git é o registro técnico das mudanças. Não recrie um arquivo gigante de prompts como fonte principal de continuidade.
