export interface PromptTemplate {
  id: string;
  title: string;
  function: string;
  description: string;
  usageContext: string;
  prompt: string;
}

export const defaultTemplates: PromptTemplate[] = [
  {
    id: "2",
    title: "Extração de contato escolar",
    function: "Entrada do contato",
    description: "Extrai dados essenciais de uma família interessada.",
    usageContext: "Importação manual de um novo contato.",
    prompt: `Extraia do texto, sem inventar: nome do responsável, nome do aluno, telefone, e-mail, série/ano de interesse, unidade, turno, assunto e origem. Use null quando a informação não estiver presente. Texto: {text}`,
  },
  {
    id: "3",
    title: "Classificação de e-mail",
    function: "Triagem",
    description: "Classifica a intenção de um e-mail recebido.",
    usageContext: "Processamento de e-mails inbound.",
    prompt: `Classifique o e-mail em: matricula, documentos, financeiro, pedagogico, curriculo, horario, localizacao ou outros. Nunca invente informação. Assunto: {emailSubject}\nConteúdo: {emailContent}`,
  },
  {
    id: "8",
    title: "Resposta de WhatsApp",
    function: "Atendimento",
    description: "Gera uma resposta curta e coerente com a conversa.",
    usageContext: "Sugestão de resposta para a equipe.",
    prompt: `Escreva uma resposta de WhatsApp curta, cordial e objetiva em nome do COC Macapá Norte. Use somente informações oficiais fornecidas. Não invente preço, vaga, prazo ou documento. Encaminhe para a secretaria se houver negociação, desconto, situação individual ou informação ausente. Contexto: {context}\nHistórico recente: {historico}\nÚltimas mensagens: {lastMessages}`,
  },
  {
    id: "9",
    title: "Resposta de e-mail",
    function: "Atendimento",
    description: "Gera resposta de e-mail escolar.",
    usageContext: "Sugestão de resposta a responsáveis e interessados.",
    prompt: `Redija um e-mail claro e cordial em nome do COC Macapá Norte. Responda no idioma do contato, utilize apenas dados oficiais e encaminhe casos individuais para atendimento humano. Nome: {leadName}\nContexto: {statusContext}`,
  },
  {
    id: "13",
    title: "Resumo do contato",
    function: "Análise",
    description: "Resume a necessidade do responsável sem expor dados desnecessários.",
    usageContext: "Ficha da oportunidade.",
    prompt: `Resuma em até três frases: responsável, aluno, série pretendida, principal necessidade, urgência e próxima ação. Não invente informações e não inclua dados pessoais que não sejam necessários.`,
  },
  {
    id: "14",
    title: "Probabilidade de matrícula",
    function: "Análise",
    description: "Estima a probabilidade de matrícula com justificativa.",
    usageContext: "Priorização comercial.",
    prompt: `Estime a probabilidade de matrícula de 0 a 100 usando apenas evidências da conversa: série, prazo, visita, documentos, valores discutidos, resposta da família e tempo sem interação. Diferencie claramente fato de inferência e indique a próxima ação recomendada.`,
  },
  {
    id: "15",
    title: "Extração de texto",
    function: "Documentos",
    description: "Extrai texto de imagens e documentos.",
    usageContext: "OCR de anexos recebidos.",
    prompt: `Extraia somente o texto visível, preservando a estrutura. Não interprete, não complete dados ausentes e não faça comentários.`,
  },
  {
    id: "16",
    title: "Separação de e-mails",
    function: "Importação",
    description: "Separa uma conversa de e-mail em mensagens individuais.",
    usageContext: "Reprocessamento de histórico.",
    prompt: `Separe o histórico em e-mails individuais, mantendo ordem cronológica, remetente, destinatário, assunto, conteúdo e data. Classifique como outbound apenas mensagens enviadas pelos endereços oficiais cadastrados da escola.`,
  },
  {
    id: "21",
    title: "Importação de WhatsApp",
    function: "Importação",
    description: "Estrutura mensagens copiadas do WhatsApp.",
    usageContext: "Importação manual de conversa.",
    prompt: `Estruture as mensagens em JSON com message, direction e timestamp. Mensagens de {userName} são outbound; as demais são inbound. Preserve a ordem e não invente datas.`,
  },
  {
    id: "22",
    title: "Importação de e-mails",
    function: "Importação",
    description: "Estrutura e-mails copiados.",
    usageContext: "Importação manual de conversa.",
    prompt: `Estruture os e-mails em JSON com subject, message, direction e timestamp. Use os endereços oficiais cadastrados para identificar outbound. Preserve a ordem e não invente conteúdo.`,
  },
  {
    id: "23",
    title: "Informação institucional",
    function: "Atendimento",
    description: "Responde solicitações de informações oficiais.",
    usageContext: "Atendimento automático de dúvidas simples.",
    prompt: `Responda usando exclusivamente as informações oficiais cadastradas da escola. Se a resposta não estiver disponível, diga que a secretaria continuará o atendimento. Solicitação: {emailContent}`,
  },
];
