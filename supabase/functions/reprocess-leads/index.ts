import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helpers
const INTERNAL_DOMAINS = ["inventosdigitais.com.br", "cloudmailin.net"]; 
const isInternal = (email: string) => INTERNAL_DOMAINS.some(d => email.toLowerCase().endsWith(`@${d}`));

const parseAddress = (token: string) => {
  token = token.trim();
  const m = token.match(/^(.+?)\s*<(.+?)>$/);
  if (m) return { name: m[1].trim().replace(/['"]/g, ''), email: m[2].trim() };
  return { name: token.split('@')[0] || 'Lead', email: token };
};

const extractHeaderValue = (raw: string, key: string): string | null => {
  // Matches a block like: name="headers[to]"\r\n\r\nVALUE\r\n------
  const re = new RegExp(`name=\"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\"[\r\n\s]*[\r\n]+([^\r\n]+)`, 'i');
  const m = raw.match(re);
  return m ? m[1].trim() : null;
};

const extractCandidatesFromRaw = (raw: string) => {
  const candidates: string[] = [];
  const headersTo = extractHeaderValue(raw, 'headers[to]');
  const headersFrom = extractHeaderValue(raw, 'headers[from]');
  const envFrom = extractHeaderValue(raw, 'envelope[from]');
  const envTo = extractHeaderValue(raw, 'envelope[to]');

  [headersTo, headersFrom, envFrom, envTo].forEach((val) => {
    if (!val) return;
    val.split(',').forEach(v => {
      const t = v.trim();
      if (t) candidates.push(t);
    });
  });

  return candidates.map(parseAddress);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { limit = 500 } = (req.headers.get('content-type') || '').includes('application/json')
      ? await req.json().catch(() => ({}))
      : {};

    console.log('Reprocessing leads, limit =', limit);

    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(limit) || 500, 2000));

    if (error) {
      console.error('Erro ao buscar leads:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let checked = 0;
    let updated = 0;
    const updates: any[] = [];

    for (const lead of leads || []) {
      checked++;
      const email: string = (lead.email || '').toLowerCase();
      if (email === 'unknown@example.com' || isInternal(email)) {
        const raw: string = lead.message || '';
        const parsed = extractCandidatesFromRaw(raw);
        const external = parsed.find(p => !isInternal(p.email));
        if (external && external.email.includes('@')) {
          const newName = external.name || external.email.split('@')[0];
          const { error: upErr } = await supabase
            .from('leads')
            .update({ email: external.email, name: newName })
            .eq('id', lead.id);
          if (upErr) {
            console.error('Erro ao atualizar lead', lead.id, upErr.message);
          } else {
            updated++;
            updates.push({ id: lead.id, old: lead.email, new: external.email });
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, checked, updated, updates }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Erro no reprocess-leads:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Erro desconhecido' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
