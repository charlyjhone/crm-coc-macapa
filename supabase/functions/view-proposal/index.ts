import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const leadId = url.searchParams.get('id');

    if (!leadId) {
      return new Response('Missing lead ID', { status: 400, headers: corsHeaders });
    }

    console.log("Tracking proposal view for lead:", leadId);

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the lead to find the proposal URL
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('proposal_url, proposal_view_count, proposal_last_viewed_at')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      console.error("Lead not found:", leadError);
      return new Response('Proposal not found', { status: 404, headers: corsHeaders });
    }

    if (!lead.proposal_url) {
      return new Response('Proposal not generated yet', { status: 404, headers: corsHeaders });
    }

    // Only count view if last view was more than 5 seconds ago (debounce duplicate requests)
    const lastViewedAt = lead.proposal_last_viewed_at ? new Date(lead.proposal_last_viewed_at) : null;
    const now = new Date();
    const fiveSecondsAgo = new Date(now.getTime() - 5 * 1000);
    
    const shouldCountView = !lastViewedAt || lastViewedAt < fiveSecondsAgo;

    if (shouldCountView) {
      // Increment view count and update last viewed timestamp
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          proposal_view_count: (lead.proposal_view_count || 0) + 1,
          proposal_last_viewed_at: now.toISOString(),
        })
        .eq('id', leadId);

      if (updateError) {
        console.error("Error updating view count:", updateError);
      } else {
        console.log("View count updated to:", (lead.proposal_view_count || 0) + 1);
      }
    } else {
      console.log("Skipping duplicate view (last viewed less than 1 min ago)");
    }

    // Redirect to the actual PDF URL (use 307 for better browser support)
    return new Response(null, {
      status: 307,
      headers: {
        'Location': lead.proposal_url,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error) {
    console.error('Error in view-proposal function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
