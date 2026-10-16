# Instalação do CRM para uma nova escola

Decisão para os primeiros clientes: mesma base de código, um projeto Supabase e uma publicação do frontend por escola. A instalação atual do COC continua independente. Não existe isolamento por tenant implementado em um banco compartilhado.

## Dados necessários para provisionar

- Escola informada: **Colégio Conceito**, parceira do COC. Identificador sugerido: `colegio-conceito` (ainda não provisionado).
- Organização Supabase responsável pela cobrança e administração: CHARLY ou organização própria do cliente.
- Plano e custo mensal aprovados antes de criar um recurso cobrado; consultar o custo da organização escolhida.
- Região do banco, URL/subdomínio do CRM e e-mail do administrador inicial.
- WhatsApp e instância Z-API próprios; nome da atendente, informações oficiais, séries, horários e valores da escola.

## Separação obrigatória

Cada instalação usa seu próprio banco, Auth, Storage, chaves, secrets, configurações e integração WhatsApp. Reaproveitar código e estrutura revisada; nunca importar contatos, alunos, mensagens, pesquisas, usuários, senhas ou credenciais do COC. Chaves privilegiadas ficam somente no backend. A chave pública e URL do frontend devem apontar para o novo projeto.

## Sequência de implantação

1. Criar o projeto vazio depois de definir nome, organização e custo. Para clientes no Brasil, avaliar São Paulo (`sa-east-1`).
2. Preparar e testar a estrutura inicial a partir do esquema escolar atual. O histórico contém migrations legadas e versões locais diferentes das aplicadas; não executar toda a pasta nem copiar um dump de produção sem revisão.
3. Aplicar tabelas, funções, grants, RLS e bucket privado. Testar administrador, secretaria e identidade sem perfil.
4. Publicar as Edge Functions escolares com autenticação interna preservada e secrets exclusivos. Manter a atendente desligada durante a configuração.
5. Configurar domínio, redirecionamentos Auth, conta administrativa e identidade da escola; revisar título, metadados, logo, textos COC, ano da campanha e fuso horário ainda fixos no código.
6. Publicar o mesmo código em um serviço próprio, com as variáveis do novo projeto. Validar que as consultas não acessam o projeto do COC.
7. Conectar o WhatsApp do cliente e configurar callbacks protegidos. Testar com um número controlado: recebimento, resposta, cadastro, visita, intervenção humana e pesquisa. Ativar o agente após validar esse fluxo.
8. Conferir backups, monitoramento e procedimento de atualização por cliente.

## Situação em 16/10/2026

A organização CHARLY consultada está no plano Free e possui CRM e AIMEDU ativos. Os preços publicados nessa data são Pro a partir de US$ 25/mês, primeiro projeto incluído, e projetos adicionais a partir de US$ 10/mês, sujeitos a consumo e adicionais. O plano Free informa limite de dois projetos ativos. O cliente foi identificado como Colégio Conceito; organização e custo ainda precisam ser definidos. Nenhum projeto novo foi criado.

Renato perguntou sobre Hostinger. A recomendação para esta etapa é manter o Supabase gerenciado, com instalação separada por escola, e concluir os fluxos atuais antes de migrar infraestrutura. Hospedar a interface na Hostinger é uma decisão separada de substituir o backend. Uma VPS pode executar Supabase com Docker, mas backups, restauração, segurança, atualização e disponibilidade passam a ser responsabilidade da operação; um banco MySQL isolado não substitui Auth, Postgres, RLS, Storage e Edge Functions usados pelo CRM. Não houve contratação nem migração para Hostinger.

A agenda agora aceita `VITE_SCHOOL_TIME_ZONE` no build; padrão do COC: `America/Belem`. Isso não elimina a revisão dos demais fusos/textos fixos, especialmente os prompts da atendente.

Referências: https://supabase.com/pricing, https://supabase.com/docs/guides/platform/billing-on-supabase, https://supabase.com/docs/guides/self-hosting e https://www.hostinger.com/br/servidor-vps
