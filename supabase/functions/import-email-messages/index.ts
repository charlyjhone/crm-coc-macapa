import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { getPrompt } from "../_shared/get-prompt.ts";
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
 };
 
 interface ProcessedEmail {
   subject: string;
   message: string;
   direction: 'inbound' | 'outbound';
   timestamp: string;
 }
 
 serve(async (req) => {
   if (req.method === 'OPTIONS') {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const { text, leadId, userName = 'Miguel' } = await req.json();
     console.log('Iniciando processamento de emails para lead:', leadId);
 
     const supabase = createClient(
       Deno.env.get('SUPABASE_URL') ?? '',
       Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
     );
 
     // Processar de forma assíncrona
     (async () => {
       try {
         console.log('Processando emails...');
         
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
                content: await getPrompt("22", `Você é um assistente que analisa histórico de emails copiados e os estrutura em formato JSON.
            
O usuário que está importando os emails se chama "{userName}".

Analise o texto fornecido e identifique cada email individual. Para cada email, determine:
1. O assunto do email (se disponível, se não, crie um resumo curto do conteúdo)
2. O conteúdo/corpo do email (limpe HTML e mantenha apenas texto relevante)
3. A direção correta:
   - "outbound" = emails ENVIADOS por {userName} ou seu domínio (@inventosdigitais.com.br, @inventormiguel.com)
   - "inbound" = emails RECEBIDOS de outras pessoas/domínios
4. Data e hora (extraia do cabeçalho se disponível, senão use data/hora atual com intervalos de 1 hora entre emails)

IMPORTANTE: 
- Emails de {userName}, miguel@inventosdigitais.com.br, mi@inventosdigitais.com.br, miguel@inventormiguel.com são "outbound"
- Todos os outros emails são "inbound"
- Ignore assinaturas de email, disclaimers legais e rodapés automáticos
- Se houver uma thread/conversa, separe cada email individual
- Mantenha a ordem cronológica (mais antigo primeiro)
- Remova citações de emails anteriores ("On ... wrote:", "Em ... escreveu:", etc)

Retorne um array JSON com objetos no formato:
{
  "subject": "assunto do email",
  "message": "conteúdo do email",
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
                   name: "structure_email_messages",
                   description: "Estrutura emails em formato JSON",
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
                             timestamp: { type: "string" }
                           },
                           required: ["subject", "message", "direction", "timestamp"],
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
             tool_choice: { type: "function", function: { name: "structure_email_messages" } }
           }),
         });
 
         if (!aiResponse.ok) {
           const errorText = await aiResponse.text();
           console.error('Erro da API Lovable AI:', errorText);
           return;
         }
 
         const aiData = await aiResponse.json();
         console.log('IA processou os emails');
 
         const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];
         if (!toolCall) {
           console.error('Tool call não encontrado');
           return;
         }
 
         const parsedEmails = JSON.parse(toolCall.function.arguments);
         const emails: ProcessedEmail[] = parsedEmails.emails;
 
         console.log(`Salvando ${emails.length} emails...`);
 
         const emailsToInsert = emails.map((email) => ({
           lead_id: leadId,
           subject: email.subject,
           message: email.message,
           html_body: `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">${email.message.replace(/\n/g, '<br>')}</div>`,
           direction: email.direction,
           timestamp: email.timestamp,
           raw_data: { imported: true }
         }));
 
         const { data, error } = await supabase
           .from('email_messages')
           .insert(emailsToInsert)
           .select();
 
         if (error) {
           console.error('Erro ao salvar:', error);
           return;
         }
 
         console.log(`✅ ${data.length} emails salvos!`);
       } catch (error) {
         console.error('❌ Erro:', error);
       }
     })(); // Executar async sem await
 
     // Retornar resposta imediata
     return new Response(
       JSON.stringify({ 
         success: true, 
         message: 'Importação iniciada! Os emails serão processados em alguns segundos.',
         processing: true
       }),
       { 
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         status: 202 // Accepted - processing in background
       }
     );
 
   } catch (error) {
     console.error('Erro ao importar emails:', error);
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