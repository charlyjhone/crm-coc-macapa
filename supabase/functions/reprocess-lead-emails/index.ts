import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { getPrompt } from "../_shared/get-prompt.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedEmail {
  subject: string;
  message: string;
  direction: 'inbound' | 'outbound';
  timestamp: string;
  sender_email: string;
  recipient_email: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { leadId, userName = 'Miguel' } = await req.json();
    console.log('Reprocessando emails para lead:', leadId);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Buscar todos os emails do lead
    const { data: existingEmails, error: fetchError } = await supabase
      .from('email_messages')
      .select('id, subject, message, html_body, direction, timestamp, raw_data')
      .eq('lead_id', leadId)
      .order('timestamp', { ascending: true });

    if (fetchError) {
      throw new Error(`Erro ao buscar emails: ${fetchError.message}`);
    }

    if (!existingEmails || existingEmails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Nenhum email para reprocessar', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Encontrados ${existingEmails.length} emails para analisar`);

    // Concatenar todo o conteúdo dos emails para análise
    const allEmailContent = existingEmails.map(email => {
      const htmlContent = email.html_body || '';
      const textContent = email.message || '';
      const subject = email.subject || '';
      const timestamp = email.timestamp || '';
      const direction = email.direction || '';
      
      return `
=== EMAIL RECORD ===
Subject: ${subject}
Direction: ${direction}
Timestamp: ${timestamp}
Content:
${htmlContent || textContent}
===================
`;
    }).join('\n\n');

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    // Usar IA para extrair todos os emails individuais
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
            content: await getPrompt("16", `Você é um assistente que analisa históricos de email e extrai cada email INDIVIDUAL.

O usuário se chama "{userName}". Seus emails são de domínios:
- @inventosdigitais.com.br
- @inventormiguel.com
- miguel@inventosdigitais.com.br
- mi@inventosdigitais.com.br

IMPORTANTE:
1. Analise TODO o conteúdo fornecido e identifique CADA email individual, mesmo os que estão em citações/threads
2. Para cada email encontrado, extraia:
   - subject: assunto do email
   - message: APENAS o corpo do email (sem citações de emails anteriores, sem assinaturas, sem rodapés)
   - direction: "outbound" se enviado por {userName}/@inventosdigitais.com.br/@inventormiguel.com, "inbound" se enviado por outros
   - timestamp: data/hora em formato ISO 8601
   - sender_email: email do remetente
   - recipient_email: email do destinatário

3. REMOVA:
   - Citações de emails anteriores ("On ... wrote:", "Em ... escreveu:")
   - Assinaturas de email
   - Disclaimers legais
   - Rodapés automáticos
   - HTML tags (converta para texto limpo)

4. Mantenha a ordem CRONOLÓGICA (mais antigo primeiro)

5. NÃO repita o mesmo email mais de uma vez - cada email deve aparecer uma única vez na lista

Retorne um array JSON com TODOS os emails encontrados.`, { userName })
          },
          {
            role: 'user',
            content: allEmailContent
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_individual_emails",
              description: "Extrai emails individuais de threads",
              parameters: {
                type: "object",
                properties: {
                  emails: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        subject: { type: "string" },
                        message: { type: "string" },
                        direction: { type: "string", enum: ["inbound", "outbound"] },
                        timestamp: { type: "string" },
                        sender_email: { type: "string" },
                        recipient_email: { type: "string" }
                      },
                      required: ["subject", "message", "direction", "timestamp", "sender_email", "recipient_email"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["emails"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_individual_emails" } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Erro da API Lovable AI:', errorText);
      throw new Error('Erro ao processar com IA');
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error('Tool call não encontrado na resposta da IA');
    }

    const parsedResult = JSON.parse(toolCall.function.arguments);
    const extractedEmails: ExtractedEmail[] = parsedResult.emails;

    console.log(`IA extraiu ${extractedEmails.length} emails individuais`);

    // Deletar os emails antigos
    const { error: deleteError } = await supabase
      .from('email_messages')
      .delete()
      .eq('lead_id', leadId);

    if (deleteError) {
      console.error('Erro ao deletar emails antigos:', deleteError);
      throw new Error('Erro ao limpar emails antigos');
    }

    console.log('Emails antigos removidos, inserindo novos...');

    // Inserir os novos emails extraídos
    const emailsToInsert = extractedEmails.map((email) => ({
      lead_id: leadId,
      subject: email.subject,
      message: email.message,
      html_body: `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">${email.message.replace(/\n/g, '<br>')}</div>`,
      direction: email.direction,
      timestamp: email.timestamp,
      raw_data: { 
        reprocessed: true, 
        sender_email: email.sender_email,
        recipient_email: email.recipient_email
      }
    }));

    const { data: insertedEmails, error: insertError } = await supabase
      .from('email_messages')
      .insert(emailsToInsert)
      .select();

    if (insertError) {
      console.error('Erro ao inserir emails:', insertError);
      throw new Error('Erro ao salvar emails processados');
    }

    console.log(`✅ ${insertedEmails.length} emails salvos com sucesso!`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Reprocessamento concluído`,
        originalCount: existingEmails.length,
        newCount: insertedEmails.length,
        emails: extractedEmails.map(e => ({ subject: e.subject, direction: e.direction, timestamp: e.timestamp }))
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Erro ao reprocessar emails:', error);
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
