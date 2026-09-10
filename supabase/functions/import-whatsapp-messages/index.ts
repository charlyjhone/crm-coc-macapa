import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { getPrompt } from "../_shared/get-prompt.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessedMessage {
  message: string;
  direction: 'inbound' | 'outbound';
  timestamp: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, leadId, phone, userName = 'Miguel' } = await req.json();
    console.log('Iniciando processamento para lead:', leadId);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Processar de forma assíncrona
    (async () => {
      try {
        console.log('Processando mensagens do WhatsApp...');
        
        const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
        if (!lovableApiKey) {
          throw new Error('LOVABLE_API_KEY não configurada');
        }

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
                content: await getPrompt("21", `Você é um assistente que analisa conversas do WhatsApp copiadas e as estrutura em formato JSON.
            
O usuário que está importando a conversa se chama "{userName}".

Analise o texto fornecido e identifique cada mensagem individual. Para cada mensagem, determine:
1. O conteúdo da mensagem
2. A direção correta:
   - "outbound" = mensagens ENVIADAS por {userName} (são as respostas do usuário para o cliente)
   - "inbound" = mensagens RECEBIDAS de outras pessoas (são as mensagens do cliente/lead)
3. Data e hora (se disponível no formato que aparecer, senão use a data/hora atual)

IMPORTANTE: 
- Qualquer mensagem que tenha o nome "{userName}" como remetente é "outbound"
- Todas as outras mensagens são "inbound"
- Ignore linhas de sistema como "Mensagem apagada" ou timestamps vazios
- Se não houver timestamp, use a data/hora atual com intervalos de 1 minuto entre mensagens
- Mantenha a ordem cronológica

Retorne um array JSON com objetos no formato:
{
  "message": "texto da mensagem",
  "direction": "inbound" ou "outbound",
  "timestamp": "ISO 8601 datetime"
}`, { userName })
              },
              {
                role: 'user',
                content: text
              }
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "structure_whatsapp_messages",
                  description: "Estrutura mensagens do WhatsApp em formato JSON",
                  parameters: {
                    type: "object",
                    properties: {
                      messages: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            message: { type: "string" },
                            direction: { type: "string", enum: ["inbound", "outbound"] },
                            timestamp: { type: "string" }
                          },
                          required: ["message", "direction", "timestamp"],
                          additionalProperties: false
                        }
                      }
                    },
                    required: ["messages"],
                    additionalProperties: false
                  }
                }
              }
            ],
            tool_choice: { type: "function", function: { name: "structure_whatsapp_messages" } }
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error('Erro da API Lovable AI:', errorText);
          return;
        }

        const aiData = await aiResponse.json();
        console.log('IA processou as mensagens');

        const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];
        if (!toolCall) {
          console.error('Tool call não encontrado');
          return;
        }

        const parsedMessages = JSON.parse(toolCall.function.arguments);
        const messages: ProcessedMessage[] = parsedMessages.messages;

        console.log(`Salvando ${messages.length} mensagens...`);

        const normalizedPhone = (phone || '').toString().replace(/\D/g, '');

        const messagesToInsert = messages.map((msg) => ({
          lead_id: leadId,
          phone: normalizedPhone,
          message: msg.message,
          direction: msg.direction,
          timestamp: msg.timestamp,
          raw_data: { imported: true }
        }));

        const { data, error } = await supabase
          .from('whatsapp_messages')
          .insert(messagesToInsert)
          .select();

        if (error) {
          console.error('Erro ao salvar:', error);
          return;
        }

        console.log(`✅ ${data.length} mensagens salvas!`);
      } catch (error) {
        console.error('❌ Erro:', error);
      }
    })(); // Executar async sem await

    // Retornar resposta imediata
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Importação iniciada! As mensagens serão processadas em alguns segundos.',
        processing: true
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 202 // Accepted - processing in background
      }
    );

  } catch (error) {
    console.error('Erro ao importar mensagens:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erro desconhecido' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
