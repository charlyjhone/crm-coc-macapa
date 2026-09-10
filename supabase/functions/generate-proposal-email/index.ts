import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getPrompt } from "../_shared/get-prompt.ts";
import { getSettings } from "../_shared/get-settings.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { leadName, leadDescription, produto, valor, moeda, proposalUrl, emails } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não está configurada');
    }

    const settings = await getSettings(['susan_name', 'company_name']);

    console.log('Gerando email de proposta para:', leadName);
    console.log('Produto:', produto);
    console.log('Valor:', valor, moeda);
    console.log('Proposal URL:', proposalUrl);

    // Extrair contexto da empresa/lead da descrição
    const empresaContext = leadDescription || 'empresa';

    const valorFormatado = valor ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(valor) : 'A definir';

    // Calcular a data da próxima segunda-feira (em pt-BR)
    const hoje = new Date();
    const diaSemana = hoje.getDay(); // 0=dom ... 6=sáb
    const diasAteSegunda = ((1 - diaSemana + 7) % 7) || 7; // sempre a PRÓXIMA segunda (não hoje)
    const proximaSegunda = new Date(hoje);
    proximaSegunda.setDate(hoje.getDate() + diasAteSegunda);
    const proximaSegundaFormatada = proximaSegunda.toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long'
    });

    // Extrair primeiro nome do lead (ignora " - Empresa", sobrenomes, etc.)
    const rawLeadName = (leadName || '').toString();
    const nameBeforeDash = rawLeadName.split(/\s*[-–|]\s*/)[0].trim();
    const firstName = (nameBeforeDash.split(/\s+/)[0] || '').replace(/[^\p{L}'’-]/gu, '').trim() || 'Olá';

    const defaultPrompt = `Você é ${settings.susan_name}, assistente executiva de ${settings.company_name}. Você está escrevendo o email DE ENVIO da proposta comercial em NOME PRÓPRIO (assistente), não em nome do Miguel.

INFORMAÇÕES DO LEAD:
- Nome/Empresa: {leadName}
- PRIMEIRO NOME do cliente (use APENAS este na saudação): {firstName}
- Descrição/Contexto: {leadDescription}
- Produto: {produto}
- Valor: {valor formatado}
- Link da proposta: {proposalUrl}
- Data da próxima segunda-feira: {proximaSegunda}

REGRAS CRÍTICAS DE SAUDAÇÃO:
- Abra SEMPRE com o PRIMEIRO NOME apenas: "Olá, {firstName}," — humano e direto.
- NUNCA escreva "Olá, Nome Sobrenome", NUNCA cite a empresa na saudação, NUNCA escreva "Olá, {firstName}, empresa XPTO".
- Nada de "Prezado(a)", "Caro(a)", "Bom dia/boa tarde".

REGRAS CRÍTICAS DE ASSUNTO:
- TUDO em letra minúscula (inclusive nomes próprios e siglas).
- NO MÁXIMO 3 palavras. Curto, direto, sem pontuação final.
- Exemplos válidos: "proposta palestra", "envio da proposta", "proposta enviada".
- NÃO inclua o nome do cliente nem da empresa no assunto.

INSTRUÇÕES PARA O EMAIL (voz da Susan, em 1ª pessoa):
1. Saudação humanizada com apenas o primeiro nome (ver regra acima).
2. Abertura curta e profissional, SEM bajulação. Ex.: "Conversei com o ${settings.company_name} sobre o convite de vocês e ele ficou bastante interessado em viabilizar essa palestra."
3. Deixe claro que o ${settings.company_name} demonstrou genuíno interesse no tema/contexto da empresa (referencie brevemente o nicho da empresa quando fizer sentido, NO CORPO — nunca na saudação).
4. Seja transparente: a agenda dele está bem apertada nas próximas semanas, mas ele quer muito conseguir encaixar — por isso você está enviando a proposta o quanto antes para vocês conseguirem alinhar internamente.
5. Inclua o link da proposta usando o texto "Clique aqui para acessar a proposta" (NÃO cole a URL crua — o sistema transforma em link automaticamente).
6. Peça uma resposta até {proximaSegunda} para que você consiga segurar uma janela na agenda dele. Mencione a data de forma natural (ex.: "se possível até segunda-feira, dia X").
7. Tom: objetivo, cordial, humano. SEM bajulação ("ficamos honrados", "que prazer imenso", "sou fã"). SEM frases de venda exageradas.
8. NÃO assine — a assinatura é adicionada automaticamente.
9. Português brasileiro.

FORMATO DE RESPOSTA:
Retorne APENAS um JSON válido no seguinte formato, sem markdown, sem backticks, sem texto antes ou depois:
{"subject": "assunto curto minúsculo até 3 palavras", "body": "corpo do email começando com 'Olá, {firstName},' e sem assinatura"}`;

    const prompt = await getPrompt("1", defaultPrompt, {
      leadName,
      firstName,
      leadDescription: leadDescription || 'Não informado',
      produto: produto || 'Palestra',
      'valor formatado': valorFormatado,
      proposalUrl,
      proximaSegunda: proximaSegundaFormatada,
    });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: prompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "compose_email",
              description: "Compose a proposal email with subject and body",
              parameters: {
                type: "object",
                properties: {
                  subject: { type: "string", description: "Email subject line" },
                  body: { type: "string", description: "Email body text without signature" }
                },
                required: ["subject", "body"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "compose_email" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro da Lovable AI:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes. Adicione créditos ao seu workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Erro da Lovable AI: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract from tool_calls (structured output)
    let subject = '';
    let body = '';
    
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        subject = args.subject || '';
        body = args.body || '';
      } catch (e) {
        console.error('Erro ao parsear tool_calls:', e);
        // Fallback: try message content
        const content = data.choices?.[0]?.message?.content || '';
        subject = `envio da proposta`;
        body = content;
      }
    } else {
      // Fallback if no tool_calls
      const content = data.choices?.[0]?.message?.content || '';
      subject = `envio da proposta`;
      body = content;
    }

    if (!subject) subject = `envio da proposta`;

    // Sanitização: assunto SEMPRE minúsculo, até 3 palavras, sem pontuação final
    subject = subject
      .toLowerCase()
      .replace(/[.!?]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 3)
      .join(' ');

    // Sanitização da saudação: se a IA escorregou e usou nome completo / empresa, força "Olá, <firstName>,"
    const greetingRegex = /^\s*(ol[áa]|prezad[oa]s?|car[oa]s?|bom\s+dia|boa\s+tarde|boa\s+noite)[^\n]*?,?\s*[\r\n]+/i;
    const correctGreeting = `Olá, ${firstName},\n\n`;
    if (greetingRegex.test(body)) {
      body = body.replace(greetingRegex, correctGreeting);
    } else {
      body = correctGreeting + body.replace(/^\s+/, '');
    }

    console.log('Email gerado com sucesso - subject:', subject, '| firstName:', firstName);

    return new Response(
      JSON.stringify({ subject, body }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Erro em generate-proposal-email:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
