import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) throw new Error('LOVABLE_API_KEY não configurada');

    // Find all "Hey Susan" emails that have html_body with forwarded content
    const { data: forwardedEmails, error } = await supabase
      .from('email_messages')
      .select('id, lead_id, subject, message, html_body, timestamp')
      .eq('direction', 'outbound')
      .ilike('message', 'Hey Susan, Look at this%')
      .not('html_body', 'is', null)
      .order('timestamp', { ascending: true });

    if (error) throw error;

    console.log(`Found ${forwardedEmails?.length || 0} forwarded emails to reprocess`);

    let totalExtracted = 0;
    const results: Array<{ leadId: string; emailId: string; extracted: number }> = [];

    for (const email of (forwardedEmails || [])) {
      if (!email.html_body || !email.lead_id) continue;

      // Check if this lead already has inbound emails (skip if so)
      const { data: existingInbound } = await supabase
        .from('email_messages')
        .select('id')
        .eq('lead_id', email.lead_id)
        .eq('direction', 'inbound')
        .limit(1);

      if (existingInbound && existingInbound.length > 0) {
        console.log(`Lead ${email.lead_id} already has inbound emails, skipping`);
        continue;
      }

      // Use AI to extract the original client email from the forwarded content
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
              content: `Você analisa emails encaminhados e extrai o email ORIGINAL do cliente.

O email foi encaminhado por Miguel (domínios: @inventosdigitais.com.br, @inventormiguel.com) para a Susan.
O corpo contém:
1. A mensagem curta do Miguel (ex: "Hey Susan, Look at this") - IGNORE ESTA
2. O email ORIGINAL do CLIENTE - EXTRAIA ESTE

Extraia APENAS o email original do cliente (a pessoa externa que escreveu para o Miguel/inventormiguel).
NÃO inclua a mensagem do Miguel.
NÃO inclua assinaturas, disclaimers ou rodapés.`
            },
            {
              role: 'user',
              content: email.html_body
            }
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_client_email",
                description: "Extrai o email original do cliente de um forward",
                parameters: {
                  type: "object",
                  properties: {
                    found: { type: "boolean", description: "Se encontrou um email do cliente no forward" },
                    message: { type: "string", description: "Corpo do email original do cliente" },
                    sender_email: { type: "string", description: "Email do remetente original (cliente)" },
                    sender_name: { type: "string", description: "Nome do remetente original" },
                    timestamp: { type: "string", description: "Data/hora do email original em ISO 8601" }
                  },
                  required: ["found", "message"],
                  additionalProperties: false
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: "extract_client_email" } }
        }),
      });

      if (!aiResponse.ok) {
        console.error(`AI error for email ${email.id}:`, await aiResponse.text());
        continue;
      }

      const aiData = await aiResponse.json();
      const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall) continue;

      const extracted = JSON.parse(toolCall.function.arguments);
      
      if (!extracted.found || !extracted.message?.trim()) {
        console.log(`No client email found in forward for email ${email.id}`);
        continue;
      }

      // Save the extracted client email
      const clientTimestamp = extracted.timestamp || new Date(new Date(email.timestamp).getTime() - 3600000).toISOString();
      
      const { error: insertError } = await supabase
        .from('email_messages')
        .insert({
          lead_id: email.lead_id,
          subject: email.subject?.replace(/^(Re|Fwd|Enc):\s*/i, '') || email.subject,
          message: extracted.message,
          html_body: `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">${extracted.message.replace(/\n/g, '<br>')}</div>`,
          direction: 'inbound',
          timestamp: clientTimestamp,
          raw_data: { extracted_from_forward: true, original_email_id: email.id, sender_email: extracted.sender_email }
        });

      if (insertError) {
        console.error(`Error saving extracted email for lead ${email.lead_id}:`, insertError);
      } else {
        totalExtracted++;
        results.push({ leadId: email.lead_id, emailId: email.id, extracted: 1 });
        console.log(`✅ Extracted client email for lead ${email.lead_id} from ${extracted.sender_email || 'unknown'}`);

        // Recalculate lead cache fields after extraction
        const { data: latestInbound } = await supabase
          .from('email_messages')
          .select('message, timestamp')
          .eq('lead_id', email.lead_id)
          .eq('direction', 'inbound')
          .order('timestamp', { ascending: false })
          .limit(1);

        const { data: inboundCount } = await supabase
          .from('email_messages')
          .select('id', { count: 'exact', head: true })
          .eq('lead_id', email.lead_id)
          .eq('direction', 'inbound');

        const { data: outboundCount } = await supabase
          .from('email_messages')
          .select('id', { count: 'exact', head: true })
          .eq('lead_id', email.lead_id)
          .eq('direction', 'outbound');

        const updateData: Record<string, any> = {};
        if (latestInbound && latestInbound.length > 0) {
          updateData.last_inbound_message = latestInbound[0].message;
          updateData.last_inbound_message_at = latestInbound[0].timestamp;
        }

        if (Object.keys(updateData).length > 0) {
          await supabase.from('leads').update(updateData).eq('id', email.lead_id);
          console.log(`📊 Updated cache fields for lead ${email.lead_id}`);
        }
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`✅ Reprocessing complete: ${totalExtracted} client emails extracted`);

    return new Response(
      JSON.stringify({ success: true, totalProcessed: forwardedEmails?.length || 0, totalExtracted, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
