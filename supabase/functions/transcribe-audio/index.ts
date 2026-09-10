import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioUrl } = await req.json();
    
    if (!audioUrl) {
      throw new Error('No audio URL provided');
    }

    console.log('Downloading audio from:', audioUrl);
    
    // Download audio from URL
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.statusText}`);
    }

    const audioBlob = await audioResponse.blob();
    console.log('Audio downloaded, size:', audioBlob.size, 'type:', audioBlob.type);
    
    // Convert to base64
    const arrayBuffer = await audioBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64Audio = btoa(binary);
    
    console.log('Sending to ElevenLabs for transcription...');

    // Prepare form data for ElevenLabs
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('model_id', 'scribe_v2');
    formData.append('language_code', 'por'); // Portuguese

    // Send to ElevenLabs via Lovable AI Gateway
    const elevenlabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');
    
    if (elevenlabsApiKey) {
      // Use ElevenLabs directly if API key is available
      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'xi-api-key': elevenlabsApiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ElevenLabs API error:', errorText);
        throw new Error(`ElevenLabs API error: ${errorText}`);
      }

      const result = await response.json();
      console.log('Transcription result:', result);

      return new Response(
        JSON.stringify({ text: result.text }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Fallback to OpenAI if no ElevenLabs key
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openaiKey) {
        throw new Error('No transcription API key configured');
      }
      
      const openaiFormData = new FormData();
      openaiFormData.append('file', audioBlob, 'audio.ogg');
      openaiFormData.append('model', 'whisper-1');
      openaiFormData.append('language', 'pt');

      const openaiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: openaiFormData,
      });

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        console.error('OpenAI API error:', errorText);
        throw new Error(`OpenAI API error: ${errorText}`);
      }

      const result = await openaiResponse.json();
      console.log('Transcription result:', result);

      return new Response(
        JSON.stringify({ text: result.text }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error in transcribe-audio function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
