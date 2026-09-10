import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Check if phone number is valid for profile picture lookup (not a group)
function isValidPersonPhone(phone: string): boolean {
  if (!phone) return false;
  
  const normalized = phone.replace(/\D/g, '');
  
  // Groups have IDs like 120363..., 247372..., etc (15+ digits or specific patterns)
  if (normalized.length > 15) return false;
  
  // Valid phone numbers should start with country codes like 55 (Brazil), 351 (Portugal)
  if (normalized.startsWith('55') || normalized.startsWith('351') || normalized.startsWith('1')) {
    return true;
  }
  
  // If it's a reasonably sized number, might be valid
  if (normalized.length >= 10 && normalized.length <= 15) {
    return true;
  }
  
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get only OPPORTUNITIES without profile pictures (em_negociacao, ganho, perdido - NOT entregue, NOT unclassified)
    const { data: leads, error: fetchError } = await supabase
      .from('leads')
      .select('id, name, phone, phones, profile_picture_url')
      .or('archived.eq.false,archived.is.null')
      .or('status.eq.em_negociacao,status.eq.ganho,status.eq.perdido,status.is.null')
      .or('unclassified.eq.false,unclassified.is.null')
      .is('profile_picture_url', null);

    if (fetchError) {
      throw new Error(`Erro ao buscar leads: ${fetchError.message}`);
    }

    console.log(`Encontradas ${leads?.length || 0} oportunidades sem foto de perfil`);

    const results: { leadId: string; name: string; success: boolean; error?: string }[] = [];
    let skippedGroups = 0;

    for (const lead of leads || []) {
      // Get the first available phone
      const phone = lead.phone || (lead.phones && lead.phones[0]);
      
      if (!phone) {
        console.log(`Lead ${lead.name} não tem telefone`);
        results.push({ leadId: lead.id, name: lead.name, success: false, error: 'Sem telefone' });
        continue;
      }

      // Skip groups and invalid phone numbers
      if (!isValidPersonPhone(phone)) {
        console.log(`Pulando grupo/número inválido: ${lead.name} (${phone})`);
        skippedGroups++;
        continue;
      }

      try {
        console.log(`Buscando foto para: ${lead.name} (${phone})`);
        
        // Call the fetch-profile-picture function
        const response = await supabase.functions.invoke('fetch-profile-picture', {
          body: { phone, leadId: lead.id },
        });

        if (response.error) {
          console.error(`Erro para lead ${lead.id}:`, response.error);
          results.push({ leadId: lead.id, name: lead.name, success: false, error: response.error.message });
        } else {
          console.log(`Lead ${lead.name}: ${response.data?.success ? 'foto atualizada' : 'sem foto disponível'}`);
          results.push({ leadId: lead.id, name: lead.name, success: response.data?.success || false });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`Erro ao processar lead ${lead.id}:`, error);
        results.push({ leadId: lead.id, name: lead.name, success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`Processamento concluído: ${successCount}/${results.length} fotos atualizadas, ${skippedGroups} grupos ignorados`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        total: results.length,
        updated: successCount,
        skippedGroups,
        results 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro ao atualizar fotos de perfil:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
