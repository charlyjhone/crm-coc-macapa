import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getPrompt } from "../_shared/get-prompt.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Texto é obrigatório');
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const defaultPrompt = `Você está extraindo dados de um LEAD (cliente potencial) para o CRM do Miguel Lannes Fernandes.

CONTEXTO CRÍTICO — IDENTIFICAÇÃO DAS PARTES:
- NÓS somos: Miguel Lannes Fernandes e suas empresas (ex: "ARGUMENTO FERTIL UNIPESSOAL", "Inventor Miguel"). NUNCA são o lead.
- O LEAD é sempre a OUTRA parte: o cliente, contratante, licenciador de plataforma, patrocinador, marca, etc.
- Em contratos/SOW/propostas, identifique quem CONTRATA Miguel (ou licencia o conteúdo dele). Esse é o lead.
  Exemplos: "LinkedIn Ireland Unlimited Company" contrata Miguel para licenciar curso → lead = LinkedIn.
- Se aparecer "Licensor"/"Contratado"/"Prestador" associado a Miguel/empresas dele, IGNORE como lead.
- Use "Licensee"/"Contratante"/"Cliente" como o lead.

REGRAS DE EXTRAÇÃO:
1. name: Nome da pessoa de contato do LADO DO CLIENTE. Se só houver nome da empresa-cliente, use "Empresa Cliente". Se houver pessoa + empresa, use "Pessoa - Empresa". NUNCA use o nome de Miguel ou empresas dele.
2. emails: Apenas emails do CLIENTE (descarte qualquer email @inventormiguel, do Miguel, ou de empresas dele).
3. phones: Apenas telefones do cliente, formato internacional.
4. description: Resumo OBJETIVO do que o cliente quer/contratou (máx 200 chars). Ex: "LinkedIn Learning contratou curso/treinamento gravado de ~1h sobre [tema] para a plataforma LinkedIn Learning". Foque no NEGÓCIO REAL, não em boilerplate jurídico.
5. valor: Valor pago AO MIGUEL pelo cliente, NA MOEDA ORIGINAL do documento (número, sem converter). Se não houver valor, null.
5b. moeda: Moeda do valor — "BRL" (R$/reais), "USD" (US$/dólar) ou "EUR" (€/euro). Se não houver valor, null. NUNCA converta valores entre moedas.
6. produto: ANALISE o que está sendo entregue/contratado no documento e classifique:
   - "palestra" → talk/keynote/conferência presencial ou online AO VIVO, evento único
   - "treinamento" → curso gravado, workshop, aula, conteúdo educacional licenciado para plataformas (LinkedIn Learning, Udemy, Alura, etc.) ou treinamento corporativo in-company
   - "consultoria" → consultoria estratégica, advisory, serviço técnico/profissional contínuo, projetos de implementação
   - "mentoria" → mentoria/coaching 1:1 ou em grupo, acompanhamento individual
   - "publicidade" → posts patrocinados, campanhas, conteúdo de marca em redes sociais, branded content, influencer marketing
   - "documentario" → produção de documentário, série documental, filme/vídeo de não-ficção, participação como protagonista/personagem em documentário
   REGRA: leia o ESCOPO real do documento (entregáveis, formato, duração, plataforma) e escolha o que melhor descreve. Não chute — se o contrato fala em "Statement of Work para licenciar curso gravado", é treinamento; se fala em "palestra de 1h no evento X", é palestra; se fala em "consultoria mensal de marketing", é consultoria; etc. Se realmente não der pra inferir, use null.
7. origem: instagram | linkedin | email | whatsapp | indicacao | site | evento | outro. Identifique pelo canal/contexto de origem do contato.

Texto do documento:
{text}`;

    const prompt = await getPrompt("2", defaultPrompt, { text });

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente especializado em extrair informações estruturadas de leads.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_lead_data",
              description: "Extrair dados estruturados do lead",
              parameters: {
                type: "object",
                properties: {
                  name: { 
                    type: "string",
                    description: "Nome da pessoa ou Nome - Empresa"
                  },
                  emails: { 
                    type: "array",
                    items: { type: "string" },
                    description: "Lista de emails encontrados"
                  },
                  phones: { 
                    type: "array",
                    items: { type: "string" },
                    description: "Lista de telefones (formato internacional)"
                  },
                  description: { 
                    type: "string",
                    description: "Descrição resumida (máximo 200 caracteres)"
                  },
                  valor: {
                    type: ["number", "null"],
                    description: "Valor do negócio na moeda original (apenas número, sem converter)"
                  },
                  moeda: {
                    type: ["string", "null"],
                    enum: ["BRL", "USD", "EUR", null],
                    description: "Moeda do valor (BRL, USD ou EUR)"
                  },
                  produto: {
                    type: ["string", "null"],
                    enum: ["palestra", "consultoria", "mentoria", "treinamento", "publicidade", "documentario", null],
                    description: "Tipo de produto"
                  },
                  origem: {
                    type: ["string", "null"],
                    enum: ["instagram", "linkedin", "email", "whatsapp", "indicacao", "site", "evento", "outro", null],
                    description: "Origem do lead"
                  }
                },
                required: ["name", "emails", "phones", "description", "valor", "moeda", "produto", "origem"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_lead_data" } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      throw new Error('Erro ao processar texto com IA');
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error('Não foi possível extrair informações do texto');
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    console.log('Dados extraídos:', extractedData);

    // Validar e normalizar dados
    const result = {
      name: (extractedData.name || '').trim(),
      emails: Array.isArray(extractedData.emails) ? extractedData.emails.filter((e: string) => e && e.includes('@')) : [],
      phones: Array.isArray(extractedData.phones) ? extractedData.phones.filter((p: string) => p && p.length > 0) : [],
      description: (extractedData.description || '').trim().substring(0, 200),
      valor: extractedData.valor,
      moeda: extractedData.moeda || (extractedData.valor != null ? 'BRL' : null),
      produto: extractedData.produto,
      origem: extractedData.origem
    };

    // Validar que ao menos um campo foi extraído
    if (!result.name && result.emails.length === 0 && result.phones.length === 0) {
      throw new Error('Não foi possível extrair informações do texto fornecido');
    }

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error extracting lead info:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});