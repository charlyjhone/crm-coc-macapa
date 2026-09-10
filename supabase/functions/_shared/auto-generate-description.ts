import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

/**
 * Fire-and-forget: triggers generate-lead-description for a lead
 * if it hasn't been processed yet (description_updated_at is null).
 * After description is generated, also triggers diagnose-leads for
 * ai_close_probability, ai_diagnosis, ai_next_step.
 */
export async function triggerAutoDescription(leadId: string): Promise<void> {
  if (!leadId) return;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Check if lead already has description processed
    const { data: lead } = await supabase
      .from('leads')
      .select('description_updated_at, ai_diagnosis_updated_at')
      .eq('id', leadId)
      .single();

    // Fire-and-forget: generate description if needed
    if (!lead?.description_updated_at) {
      console.log('Triggering auto generate-lead-description for lead:', leadId);
      fetch(`${supabaseUrl}/functions/v1/generate-lead-description`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leadId }),
      })
        .then(() => {
          // After description completes, trigger diagnosis
          triggerAutoDiagnosis(leadId, supabaseUrl, supabaseKey);
        })
        .catch(err => console.error('Error triggering auto description:', err));
    } else if (!lead?.ai_diagnosis_updated_at) {
      // Description exists but no diagnosis yet — trigger diagnosis directly
      console.log('Lead already has description, triggering diagnosis only:', leadId);
      triggerAutoDiagnosis(leadId, supabaseUrl, supabaseKey);
    } else {
      console.log('Lead already has description and diagnosis, skipping:', leadId);
    }
  } catch (err) {
    console.error('Error in triggerAutoDescription:', err);
  }
}

/**
 * Fire-and-forget: triggers diagnose-leads for a specific lead
 */
function triggerAutoDiagnosis(leadId: string, supabaseUrl: string, supabaseKey: string): void {
  console.log('Triggering auto diagnose-leads for lead:', leadId);
  fetch(`${supabaseUrl}/functions/v1/diagnose-leads`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ leadId }),
  }).catch(err => console.error('Error triggering auto diagnosis:', err));
}
