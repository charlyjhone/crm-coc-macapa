import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting email direction reprocessing");
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar todas as mensagens de e-mail com raw_data
    const { data: messages, error: fetchError } = await supabase
      .from('email_messages')
      .select('id, raw_data, direction')
      .not('raw_data', 'is', null);

    if (fetchError) {
      console.error('Error fetching messages:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${messages?.length || 0} messages to process`);

    let updatedCount = 0;
    let errorCount = 0;

    // Processar cada mensagem
    for (const msg of messages || []) {
      try {
        const rawData = msg.raw_data;
        
        // Extrair o remetente (from) do raw_data
        let senderEmail = '';
        
        // Tentar diferentes caminhos possíveis para encontrar o remetente
        // Nota: CloudMailin usa notação com colchetes como "envelope[from]"
        const fromCandidates = [
          rawData?.['envelope[from]'],
          rawData?.envelope?.from,
          rawData?.['headers[From]'],
          rawData?.['headers[from]'],
          rawData?.headers?.From,
          rawData?.headers?.from,
          rawData?.from,
          rawData?.sender
        ];

        for (const candidate of fromCandidates) {
          if (candidate && typeof candidate === 'string') {
            senderEmail = candidate.toLowerCase();
            break;
          }
        }

        // Se encontrou um from no formato "Name <email@domain.com>", extrair só o email
        if (senderEmail && senderEmail.includes('<')) {
          const emailMatch = senderEmail.match(/<([^>]+)>/);
          if (emailMatch) {
            senderEmail = emailMatch[1].toLowerCase();
          }
        }

        // Determinar a direção baseado no remetente
        const isOutbound = senderEmail.includes('mi@inventosdigitais.com.br') || 
                          senderEmail.includes('miguel@inventosdigitais.com.br') ||
                          senderEmail.includes('miguel@inventormiguel.com');
        const newDirection = isOutbound ? 'outbound' : 'inbound';

        console.log(`Message ${msg.id}: sender=${senderEmail}, direction=${newDirection}`);

        // Atualizar apenas se a direção mudou
        if (msg.direction !== newDirection) {
          const { error: updateError } = await supabase
            .from('email_messages')
            .update({ direction: newDirection })
            .eq('id', msg.id);

          if (updateError) {
            console.error(`Error updating message ${msg.id}:`, updateError);
            errorCount++;
          } else {
            updatedCount++;
          }
        }
      } catch (err) {
        console.error(`Error processing message ${msg.id}:`, err);
        errorCount++;
      }
    }

    console.log(`Reprocessing complete: ${updatedCount} updated, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        total: messages?.length || 0,
        updated: updatedCount,
        errors: errorCount
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error("Error in reprocess-email-directions:", error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
