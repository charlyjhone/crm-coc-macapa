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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find all leads without description_updated_at
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, name')
      .is('description_updated_at', null)
      .eq('archived', false)
      .not('status', 'eq', 'perdido')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    console.log(`Found ${leads?.length || 0} leads without description`);

    const results: any[] = [];

    for (const lead of leads || []) {
      console.log(`Processing lead: ${lead.name} (${lead.id})`);
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/generate-lead-description`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ leadId: lead.id }),
        });

        const result = await response.json();
        results.push({ id: lead.id, name: lead.name, success: response.ok, result });
        console.log(`Lead ${lead.name}: ${response.ok ? 'OK' : 'FAIL'}`);
        
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`Error processing lead ${lead.name}:`, err);
        results.push({ id: lead.id, name: lead.name, success: false, error: String(err) });
      }
    }

    return new Response(
      JSON.stringify({ total: leads?.length || 0, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in batch-generate-descriptions:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
