// Sincroniza reuniões do Granola: busca todas as notas recentes via API,
// faz match com leads por email dos participantes e dá upsert na tabela meetings.
// Pode ser chamada manualmente ou via cron (2x/dia).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRANOLA_BASE = "https://public-api.granola.ai/v1";

const INTERNAL_DOMAINS = [
  "inventosdigitais.com.br",
  "inventormiguel.com",
  "inventormiguel.link",
];

function isInternalEmail(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1];
  return INTERNAL_DOMAINS.some((d) => domain === d || domain?.endsWith("." + d));
}

interface GranolaAttendee {
  name?: string;
  email?: string;
}

interface GranolaNote {
  id: string;
  title?: string;
  web_url?: string;
  created_at?: string;
  updated_at?: string;
  owner?: { name?: string; email?: string };
  attendees?: GranolaAttendee[];
  calendar_event?: {
    scheduled_start_time?: string;
    organiser?: string;
    invitees?: { email?: string }[];
  };
  summary_text?: string;
  summary_markdown?: string;
  transcript?: Array<{ text?: string; speaker?: { source?: string } }>;
}

function buildTranscript(t: GranolaNote["transcript"]): string | undefined {
  if (!t || !Array.isArray(t) || t.length === 0) return undefined;
  return t.map((seg) => seg?.text || "").filter(Boolean).join(" ");
}

function buildParticipants(n: GranolaNote) {
  const list = (n.attendees && n.attendees.length > 0)
    ? n.attendees
    : (n.calendar_event?.invitees ?? []);
  const organiser = n.calendar_event?.organiser?.toLowerCase();
  return list
    .filter((p) => p?.email)
    .map((p) => ({
      name: p.name,
      email: p.email,
      is_organizer: organiser ? p.email!.toLowerCase() === organiser : undefined,
    }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GRANOLA_KEY = Deno.env.get("GRANOLA_API_KEY");
    if (!GRANOLA_KEY) {
      return new Response(JSON.stringify({ error: "GRANOLA_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Parâmetros opcionais: ?days=7 ou body { days, limit_per_page }
    let days = 14;
    let pageLimit = 50;
    let maxPages = 10;
    try {
      const url = new URL(req.url);
      if (url.searchParams.get("days")) days = parseInt(url.searchParams.get("days")!) || days;
    } catch (_) {}
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.days) days = parseInt(String(body.days)) || days;
        if (body?.limit_per_page) pageLimit = parseInt(String(body.limit_per_page)) || pageLimit;
        if (body?.max_pages) maxPages = parseInt(String(body.max_pages)) || maxPages;
      } catch (_) {}
    }

    const createdAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // 1) Listar notas paginando
    const allNotes: GranolaNote[] = [];
    let cursor: string | undefined = undefined;
    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({
        limit: String(pageLimit),
        created_after: createdAfter,
      });
      if (cursor) params.set("cursor", cursor);
      const listRes = await fetch(`${GRANOLA_BASE}/notes?${params.toString()}`, {
        headers: { Authorization: `Bearer ${GRANOLA_KEY}` },
      });
      if (!listRes.ok) {
        const errTxt = await listRes.text();
        return new Response(JSON.stringify({ error: `Granola list failed [${listRes.status}]: ${errTxt}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const listJson = await listRes.json();
      const notes: GranolaNote[] = listJson?.notes ?? [];
      allNotes.push(...notes);
      if (!listJson?.hasMore || !listJson?.cursor) break;
      cursor = listJson.cursor;
    }

    // 2) Filtrar quais já existem (skip se já temos esse external_id, a menos que estejam recentes)
    const externalIds = allNotes.map((n) => n.id);
    const { data: existing } = await supabase
      .from("meetings")
      .select("external_id, updated_at")
      .in("external_id", externalIds);
    const existingMap = new Map((existing ?? []).map((r: any) => [r.external_id, r.updated_at]));

    const results: Array<{
      external_id: string;
      status: "matched" | "no_match" | "skipped" | "error" | "updated";
      lead_id?: string;
      lead_name?: string;
      title?: string;
      reason?: string;
    }> = [];

    // 3) Para cada nota: buscar detalhes (transcript+summary) e fazer match/upsert
    for (const summary of allNotes) {
      try {
        // Skip se já existe e Granola não tem update mais novo
        const existsAt = existingMap.get(summary.id);
        if (existsAt && summary.updated_at && new Date(existsAt) >= new Date(summary.updated_at)) {
          results.push({ external_id: summary.id, status: "skipped", title: summary.title, reason: "já sincronizado" });
          continue;
        }

        // Pega detalhes da nota (transcript + summary)
        const detRes = await fetch(`${GRANOLA_BASE}/notes/${summary.id}?include=transcript`, {
          headers: { Authorization: `Bearer ${GRANOLA_KEY}` },
        });
        if (!detRes.ok) {
          results.push({ external_id: summary.id, status: "error", title: summary.title, reason: `detail ${detRes.status}` });
          continue;
        }
        const note: GranolaNote = await detRes.json();

        // Match por email externo
        const candidateEmails = [
          ...(note.attendees ?? []).map((a) => a.email),
          ...(note.calendar_event?.invitees ?? []).map((i) => i.email),
        ]
          .map((e) => e?.toLowerCase().trim())
          .filter((e): e is string => !!e && !isInternalEmail(e));

        const uniqueEmails = Array.from(new Set(candidateEmails));

        if (uniqueEmails.length === 0) {
          results.push({ external_id: note.id, status: "no_match", title: note.title, reason: "sem emails externos" });
          continue;
        }

        // Busca leads que tenham qualquer email coincidente
        const orFilter = uniqueEmails
          .map((e) => `email.eq.${e},emails.cs.{${e}}`)
          .join(",");
        const { data: leads, error: leadsErr } = await supabase
          .from("leads")
          .select("id, name, email, emails, status, created_at")
          .or(orFilter)
          .order("created_at", { ascending: false });
        if (leadsErr) throw leadsErr;

        if (!leads || leads.length === 0) {
          results.push({
            external_id: note.id,
            status: "no_match",
            title: note.title,
            reason: `nenhum lead com: ${uniqueEmails.join(", ")}`,
          });
          continue;
        }

        // Prioriza leads ativos (não terminais) e mais recentes.
        // Status terminais ficam no fim para evitar anexar reuniões em deals já fechados/perdidos antigos.
        const TERMINAL = new Set(["entregue", "perdido"]);
        const sortedLeads = [...leads].sort((a: any, b: any) => {
          const aT = TERMINAL.has(a.status) ? 1 : 0;
          const bT = TERMINAL.has(b.status) ? 1 : 0;
          if (aT !== bT) return aT - bT;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        const lead = sortedLeads[0];

        const meetingDate = note.calendar_event?.scheduled_start_time
          ?? note.created_at
          ?? null;

        const { error: upErr } = await supabase.from("meetings").upsert(
          {
            lead_id: lead.id,
            external_id: note.id,
            source: "granola",
            title: note.title,
            meeting_date: meetingDate,
            participants: buildParticipants(note),
            summary: note.summary_markdown || note.summary_text || null,
            transcript: buildTranscript(note.transcript) ?? null,
            external_url: note.web_url ?? null,
            raw_data: note,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "external_id" }
        );
        if (upErr) throw upErr;

        results.push({
          external_id: note.id,
          status: existsAt ? "updated" : "matched",
          lead_id: lead.id,
          lead_name: (lead as any).name,
          title: note.title,
        });
      } catch (e) {
        results.push({
          external_id: summary.id,
          status: "error",
          title: summary.title,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return new Response(
      JSON.stringify({
        days_window: days,
        total_fetched: allNotes.length,
        matched: results.filter((r) => r.status === "matched").length,
        updated: results.filter((r) => r.status === "updated").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        no_match: results.filter((r) => r.status === "no_match").length,
        errors: results.filter((r) => r.status === "error").length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-granola-meetings error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
