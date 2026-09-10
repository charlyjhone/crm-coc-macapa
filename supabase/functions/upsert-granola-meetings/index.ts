// Recebe um array de reuniões do Granola (preparado pelo agente via MCP)
// e faz match com leads por email dos participantes.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Participant {
  name?: string;
  email?: string;
  is_organizer?: boolean;
}

interface MeetingPayload {
  external_id: string;
  title?: string;
  meeting_date?: string;
  participants?: Participant[];
  summary?: string;
  transcript?: string;
  notes?: string;
  external_url?: string;
  raw_data?: unknown;
  // Override: força associação a este lead (se omitido, faz match por email)
  lead_id?: string;
}

const INTERNAL_DOMAINS = [
  "inventosdigitais.com.br",
  "inventormiguel.com",
  "inventormiguel.link",
];

function isInternalEmail(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1];
  return INTERNAL_DOMAINS.some((d) => domain === d || domain?.endsWith("." + d));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json();
    const meetings: MeetingPayload[] = Array.isArray(body) ? body : body.meetings ?? [];

    if (!meetings.length) {
      return new Response(JSON.stringify({ error: "no meetings provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{
      external_id: string;
      status: "matched" | "no_match" | "skipped" | "error";
      lead_id?: string;
      lead_name?: string;
      reason?: string;
    }> = [];

    for (const m of meetings) {
      try {
        let leadId: string | undefined = m.lead_id;
        let leadName: string | undefined;

        // Se não passou lead_id, tenta match por email dos participantes
        if (!leadId) {
          const candidateEmails = (m.participants ?? [])
            .map((p) => p.email?.toLowerCase().trim())
            .filter((e): e is string => !!e && !isInternalEmail(e));

          if (!candidateEmails.length) {
            results.push({ external_id: m.external_id, status: "no_match", reason: "nenhum email externo" });
            continue;
          }

          // Busca leads que tenham qualquer email coincidente
          const { data: leads, error: leadsErr } = await supabase
            .from("leads")
            .select("id, name, email, emails")
            .or(
              candidateEmails
                .map((e) => `email.eq.${e},emails.cs.{${e}}`)
                .join(",")
            );

          if (leadsErr) throw leadsErr;

          // Prioriza ganho/produzido se múltiplos
          if (leads && leads.length > 0) {
            leadId = leads[0].id;
            leadName = leads[0].name;
          } else {
            results.push({
              external_id: m.external_id,
              status: "no_match",
              reason: `nenhum lead com emails: ${candidateEmails.join(", ")}`,
            });
            continue;
          }
        }

        // Upsert por external_id
        const { error: upsertErr } = await supabase.from("meetings").upsert(
          {
            lead_id: leadId,
            external_id: m.external_id,
            source: "granola",
            title: m.title,
            meeting_date: m.meeting_date,
            participants: m.participants ?? [],
            summary: m.summary,
            transcript: m.transcript,
            notes: m.notes,
            external_url: m.external_url,
            raw_data: m.raw_data,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "external_id" }
        );

        if (upsertErr) throw upsertErr;

        results.push({ external_id: m.external_id, status: "matched", lead_id: leadId, lead_name: leadName });
      } catch (e) {
        results.push({
          external_id: m.external_id,
          status: "error",
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return new Response(
      JSON.stringify({
        total: meetings.length,
        matched: results.filter((r) => r.status === "matched").length,
        no_match: results.filter((r) => r.status === "no_match").length,
        errors: results.filter((r) => r.status === "error").length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("upsert-granola-meetings error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
