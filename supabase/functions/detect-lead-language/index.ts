// Detecta o idioma de um lead a partir das mensagens (inbound prioritário) e persiste em leads.language.
// Modo single: { lead_id, force? } — detecta para 1 lead.
// Modo backfill: { backfill: true, statuses?: string[], limit?: number, force?: boolean } — varre leads ativos.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED = ["pt", "en", "es", "fr", "de", "it", "nl", "zh", "ja", "ko", "ru", "ar", "tr", "pl", "sv"];

function stripHtml(html: string): string {
  return (html || "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function detectForLead(supabase: any, leadId: string): Promise<{ language: string | null; sample: string }> {
  // Inbound emails prioritários
  const { data: emails } = await supabase
    .from("email_messages")
    .select("message, html_body, direction")
    .eq("lead_id", leadId)
    .eq("direction", "inbound")
    .order("timestamp", { ascending: false })
    .limit(5);

  // WhatsApp inbound como fallback adicional
  const { data: whats } = await supabase
    .from("whatsapp_messages")
    .select("message, direction, is_audio")
    .eq("lead_id", leadId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(10);

  const parts: string[] = [];
  for (const e of emails || []) {
    const txt = (e.message || (e.html_body ? stripHtml(e.html_body) : "")).slice(0, 800);
    if (txt) parts.push(txt);
  }
  for (const w of whats || []) {
    if (w.is_audio) continue;
    const txt = (w.message || "").slice(0, 400);
    if (txt) parts.push(txt);
  }

  // Se não houver inbound, tenta o próprio campo message do lead
  if (parts.length === 0) {
    const { data: lead } = await supabase.from("leads").select("message,name").eq("id", leadId).maybeSingle();
    if (lead?.message) parts.push(String(lead.message).slice(0, 800));
  }

  const sample = parts.join("\n---\n").slice(0, 4000);
  if (!sample.trim()) return { language: null, sample: "" };

  // IA com tool-calling para garantir saída estruturada
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "system",
          content:
            "You detect the natural language of a sales lead based on the messages they wrote. Return ONLY an ISO 639-1 lowercase code (pt, en, es, fr, de, it, nl, zh, ja, ko, ru, ar, tr, pl, sv). If mixed, pick the dominant one. If clearly unknown, return 'unknown'.",
        },
        { role: "user", content: `Messages from the LEAD (client) below. Detect their language:\n\n${sample}` },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "set_language",
            description: "Set the detected ISO 639-1 language code for the lead.",
            parameters: {
              type: "object",
              properties: { code: { type: "string", description: "ISO 639-1 lowercase code (e.g. pt, en, es) or 'unknown'." } },
              required: ["code"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "set_language" } },
    }),
  });

  if (!resp.ok) {
    console.error("AI error", resp.status, await resp.text());
    return { language: null, sample };
  }

  const data = await resp.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  let code: string | null = null;
  try {
    const parsed = JSON.parse(args || "{}");
    code = (parsed.code || "").toString().toLowerCase().trim();
  } catch {
    code = null;
  }
  if (!code || code === "unknown" || !ALLOWED.includes(code)) return { language: null, sample };
  return { language: code, sample };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    if (body.backfill) {
      const statuses: string[] = body.statuses || ["em_aberto", "em_negociacao", "ganho"];
      const limit: number = Math.min(body.limit || 200, 500);
      const force: boolean = !!body.force;

      let q = supabase.from("leads").select("id, language").in("status", statuses).limit(limit);
      if (!force) q = q.is("language", null);
      const { data: leads, error } = await q;
      if (error) throw error;

      const results: any[] = [];
      for (const lead of leads || []) {
        try {
          const { language } = await detectForLead(supabase, lead.id);
          if (language) {
            await supabase.from("leads").update({ language }).eq("id", lead.id);
            results.push({ lead_id: lead.id, language });
          } else {
            results.push({ lead_id: lead.id, language: null, skipped: true });
          }
        } catch (e) {
          console.error("lead failed", lead.id, e);
          results.push({ lead_id: lead.id, error: String(e) });
        }
        // pequena pausa para evitar rate limit
        await new Promise((r) => setTimeout(r, 250));
      }

      return new Response(
        JSON.stringify({ processed: results.length, results: results.slice(0, 50), total_returned: results.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const leadId: string | undefined = body.lead_id;
    const force: boolean = !!body.force;
    if (!leadId) {
      return new Response(JSON.stringify({ error: "lead_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await supabase.from("leads").select("language").eq("id", leadId).maybeSingle();
    if (existing?.language && !force) {
      return new Response(JSON.stringify({ lead_id: leadId, language: existing.language, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { language } = await detectForLead(supabase, leadId);
    if (language) {
      await supabase.from("leads").update({ language }).eq("id", leadId);
    }
    return new Response(JSON.stringify({ lead_id: leadId, language }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("detect-lead-language error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
