// Detecta declínio EXPLÍCITO do cliente em e-mail recebido.
// Conservador: na dúvida retorna false.

export async function analyzeClientDeclined(
  emailContent: string,
  emailHistory: string,
  lovableApiKey: string,
): Promise<{ is_decline: boolean; reasoning: string }> {
  const prompt = `You analyze a CLIENT email to determine if they are EXPLICITLY declining/closing the deal.

Mark as decline ONLY when the client clearly says they will NOT move forward. Examples:
- "We won't be moving forward"
- "We've decided to go with another vendor"
- "Decidimos não avançar com essa parceria"
- "Vamos passar dessa oportunidade"
- "Não temos interesse"
- "Encerrando essa conversa"
- "Obrigado, mas não"
- "We're going to pass on this"
- "Closing this conversation"

Do NOT mark as decline for:
- Silence / no response
- Asking for discount or different price
- "Vou pensar", "I'll think about it", "Let me check internally"
- Postponing ("not now, maybe later", "vamos retomar mais para frente")
- Asking questions or requesting info (media kit, pricing, etc)
- Budget rejection that still leaves room for counter-offer
- Polite acknowledgments without explicit closure
- Anything ambiguous

Conversation history:
${emailHistory}

LATEST CLIENT EMAIL:
${emailContent}

Decide: is the client EXPLICITLY closing/declining this deal?`;

  try {
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: 'You analyze client emails for explicit deal decline. Always respond using the tool provided. When in doubt, default to false — it is much better to NOT mark as lost than to mark incorrectly.',
          },
          { role: 'user', content: prompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'detect_decline',
              description: 'Determine if the client is explicitly declining the deal',
              parameters: {
                type: 'object',
                properties: {
                  is_decline: {
                    type: 'boolean',
                    description: 'True ONLY if client EXPLICITLY closes/declines the deal',
                  },
                  reasoning: {
                    type: 'string',
                    description: 'Brief explanation in pt-BR',
                  },
                },
                required: ['is_decline', 'reasoning'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'detect_decline' } },
      }),
    });

    if (!resp.ok) {
      console.error('analyzeClientDeclined HTTP error:', resp.status);
      return { is_decline: false, reasoning: 'http error' };
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.log('analyzeClientDeclined: no tool call, defaulting false');
      return { is_decline: false, reasoning: 'no tool call' };
    }

    const args = JSON.parse(toolCall.function.arguments);
    console.log('analyzeClientDeclined result:', args);
    return {
      is_decline: args.is_decline === true,
      reasoning: args.reasoning || '',
    };
  } catch (e) {
    console.error('analyzeClientDeclined exception:', e);
    return { is_decline: false, reasoning: 'exception' };
  }
}
