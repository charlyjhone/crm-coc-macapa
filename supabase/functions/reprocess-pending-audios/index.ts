import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting to reprocess pending audio messages...');

    // Get all audio messages that failed transcription or don't have one
    // Only from leads that are NOT archived and NOT unclassified
    const { data: pendingAudios, error: fetchError } = await supabase
      .from('whatsapp_messages')
      .select(`
        id,
        phone,
        raw_data,
        lead_id,
        message,
        leads!inner (
          id,
          name,
          archived,
          unclassified
        )
      `)
      .eq('is_audio', true)
      .eq('direction', 'inbound')
      .or('message.is.null,message.eq.,message.eq.[Mensagem de áudio - erro na transcrição]')
      .eq('leads.archived', false)
      .eq('leads.unclassified', false);

    if (fetchError) {
      console.error('Error fetching pending audios:', fetchError);
      throw new Error(`Failed to fetch pending audios: ${fetchError.message}`);
    }

    console.log(`Found ${pendingAudios?.length || 0} pending audio messages to process`);

    const results = {
      total: pendingAudios?.length || 0,
      success: 0,
      failed: 0,
      skipped: 0,
      details: [] as any[]
    };

    for (const audio of pendingAudios || []) {
      try {
        // Extract audio URL from raw_data
        const rawData = audio.raw_data as any;
        let audioUrl = null;

        // Try different paths where audio URL might be stored
        if (rawData?.audio?.audioUrl) {
          audioUrl = rawData.audio.audioUrl;
        } else if (rawData?.audioUrl) {
          audioUrl = rawData.audioUrl;
        } else if (rawData?.message?.audioMessage?.url) {
          audioUrl = rawData.message.audioMessage.url;
        } else if (rawData?.audio?.url) {
          audioUrl = rawData.audio.url;
        }

        if (!audioUrl) {
          console.log(`Skipping message ${audio.id}: No audio URL found in raw_data`);
          results.skipped++;
          results.details.push({
            id: audio.id,
            leadName: (audio.leads as any)?.name,
            status: 'skipped',
            reason: 'No audio URL found'
          });
          continue;
        }

        console.log(`Processing audio for lead "${(audio.leads as any)?.name}" (${audio.id})`);

        // Call transcribe-audio function
        const transcribeResponse = await supabase.functions.invoke('transcribe-audio', {
          body: { audioUrl }
        });

        if (transcribeResponse.error) {
          throw new Error(transcribeResponse.error.message);
        }

        const transcription = transcribeResponse.data?.text;

        if (!transcription) {
          throw new Error('No transcription returned');
        }

        // Update the message with the transcription
        const { error: updateError } = await supabase
          .from('whatsapp_messages')
          .update({ message: transcription })
          .eq('id', audio.id);

        if (updateError) {
          throw new Error(`Failed to update message: ${updateError.message}`);
        }

        console.log(`Successfully transcribed audio ${audio.id}: "${transcription.substring(0, 50)}..."`);
        results.success++;
        results.details.push({
          id: audio.id,
          leadName: (audio.leads as any)?.name,
          status: 'success',
          transcription: transcription.substring(0, 100)
        });

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Failed to process audio ${audio.id}:`, error);
        results.failed++;
        results.details.push({
          id: audio.id,
          leadName: (audio.leads as any)?.name,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    console.log('Reprocessing complete:', results);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in reprocess-pending-audios:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
