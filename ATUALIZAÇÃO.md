# ATUALIZAÇÃO

> Arquivo oficial de continuidade do projeto **CRM COC Macapá**.
> Sempre que houver uma mudança relevante, este arquivo deve ser atualizado com o estado mais recente do projeto.

## Última atualização

**Data:** 25/09/2026

### Estado atual
- Projeto: CRM COC Macapá.
- Repositório principal: `charlyjhone/crm-coc-macapa`.
- A assistente de WhatsApp **Ana** está sendo integrada ao CRM.
- A secretaria deverá operar prioritariamente pelo CRM, evitando depender do WhatsApp Web para o fluxo de atendimento.
- A Ana deverá considerar o histórico completo da conversa, incluindo mensagens enviadas por atendentes humanos.
- Após o encerramento de um atendimento, o usuário poderá acionar uma pesquisa por botão; a Ana então encaminhará a pesquisa.
- O nome informado pelo contato deverá ser salvo/atualizado no cadastro correspondente do CRM.
- Está planejado um painel de configuração da Ana para o perfil de **Direção**, incluindo:
  - ativar/desativar a Ana;
  - permitir desligamento rápido em caso de falha;
  - configurar mensagens;
  - cadastrar/alterar informações usadas nas respostas.

### Regra de continuidade
Ao finalizar uma etapa importante do desenvolvimento:
1. Atualizar a data acima.
2. Substituir esta seção pelo estado mais recente.
3. Registrar mudanças concluídas.
4. Registrar pendências.
5. Registrar exatamente qual deve ser o próximo passo.

### Alterações concluídas
- Definição do fluxo de pesquisa após encerramento do atendimento.
- Definição de leitura do histórico humano + IA pela Ana.
- Definição de salvamento do nome do contato no CRM.
- Definição conceitual do painel administrativo da Ana.

### Pendências
- Implementar/revisar o painel de configuração da Ana.
- Validar permissões por perfil, especialmente Direção e Secretaria.
- Validar o fluxo completo de atendimento, encerramento e pesquisa.
- Revisar persistência das configurações no banco de dados.
- Testar o botão de ativar/desativar a Ana e comportamento de emergência.

### Próximo passo
Continuar a implementação do painel de configuração da Ana e revisar no código/banco o que já existe antes de adicionar novas alterações.

---

## Histórico resumido
Este arquivo deve representar sempre o **estado mais atual** do projeto. O histórico detalhado permanece no Git e nos commits.
