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
    const { phone, leadId } = await req.json();

    if (!phone || !leadId) {
      return new Response(
        JSON.stringify({ error: 'phone e leadId são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
      console.error('Credenciais Z-API não configuradas');
      return new Response(
        JSON.stringify({ error: 'Credenciais Z-API não configuradas' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize phone number
    const normalizedPhone = phone.replace(/\D/g, '');
    console.log('Buscando foto de perfil para:', normalizedPhone);

    // Fetch profile picture from Z-API
    const zapiUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/profile-picture?phone=${normalizedPhone}`;
    
    const zapiResponse = await fetch(zapiUrl, {
      method: 'GET',
      headers: {
        'Client-Token': ZAPI_CLIENT_TOKEN,
      },
    });

    const zapiData = await zapiResponse.json();
    console.log('Resposta Z-API profile-picture:', JSON.stringify(zapiData));

    // Check for valid link - Z-API sometimes returns {"link":"null"} or errorMessage
    if (!zapiResponse.ok || !zapiData.link || zapiData.link === 'null' || zapiData.errorMessage) {
      console.log('Sem foto de perfil disponível para:', normalizedPhone, zapiData.errorMessage || '');
      return new Response(
        JSON.stringify({ success: false, message: 'Foto de perfil não disponível' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download the image
    const imageResponse = await fetch(zapiData.link);
    if (!imageResponse.ok) {
      throw new Error('Falha ao baixar imagem de perfil');
    }

    const imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();
    const imageBytes = new Uint8Array(imageBuffer);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Upload to storage
    const fileName = `${leadId}.jpg`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('profile-pictures')
      .upload(fileName, imageBytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Erro ao fazer upload:', uploadError);
      throw new Error(`Erro ao fazer upload: ${uploadError.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('profile-pictures')
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData.publicUrl;
    console.log('Foto salva em:', publicUrl);

    // Update lead with profile picture URL
    const { error: updateError } = await supabase
      .from('leads')
      .update({ profile_picture_url: publicUrl })
      .eq('id', leadId);

    if (updateError) {
      console.error('Erro ao atualizar lead:', updateError);
      throw new Error(`Erro ao atualizar lead: ${updateError.message}`);
    }

    console.log('Lead atualizado com foto de perfil:', leadId);

    return new Response(
      JSON.stringify({ success: true, url: publicUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro ao buscar foto de perfil:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
