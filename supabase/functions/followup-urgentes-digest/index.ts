// Digest diário de FOLLOW-UPS URGENTES DO MIGUEL — enviado por WhatsApp.
//
// A Susan só faz follow-up automático de PUBLICIDADE (regra do Miguel).
// Todo o resto (palestra/consultoria/mentoria/treinamento/curso) é follow-up
// MANUAL — e conversas onde o cliente respondeu por último precisam de resposta
// humana em qualquer produto. Este digest escolhe os 3 mais urgentes e manda
// no WhatsApp do Miguel: "follow-ups urgentes, escolhe três".
//
// IMPORTANTE: a urgência é calculada lendo as MENSAGENS REAIS (email_messages +
// whatsapp_messages por variantes de telefone), nunca os contadores cacheados
// do lead — que já provaram que mentem.
//
// Config: system_settings.miguel_digest_whatsapp (número destino, só dígitos).
// Body opcional: { dry_run: true } (não envia, só retorna o texto).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ELIGIBLE_STATUSES = ["em_aberto", "em_negociacao"];
const DAY_MS = 86400000;

interface Urgente {
  lead: any;
  score: number;
  motivo: string;
}

function valorBRL(valor: number | null, moeda: string | null): number {
  if (!valor) return 0;
  if (moeda === "USD") return valor * 5.5;
  if (moeda === "EUR") return valor * 6.0;
  return valor;
}

function fmtValor(lead: any): string {
  if (!lead.valor) return "";
  const sym = lead.moeda === "USD" ? "US$" : lead.moeda === "EUR" ? "€" : "R$";
  return `${sym} ${Number(lead.valor).toLocaleString("pt-BR")}`;
}

// Última mensagem real (email + whatsapp por variantes de telefone) do lead
async function lastRealMessages(supabase: any, lead: any): Promise<{ lastIn: number | null; lastOut: number | null }> {
  let lastIn: number | null = null;
  let lastOut: number | null = null;

  const { data: lastEmails } = await supabase
    .from("email_messages")
    .select("direction, timestamp")
    .eq("lead_id", lead.id)
    .order("timestamp", { ascending: false })
    .limit(20);
  for (const e of lastEmails || []) {
    const t = Date.parse(e.timestamp);
    if (Number.isNaN(t)) continue;
    if (e.direction === "inbound") lastIn = Math.max(lastIn ?? 0, t);
    else lastOut = Math.max(lastOut ?? 0, t);
    if (lastIn && lastOut) break;
  }

  // WhatsApp: busca por variantes de telefone (mensagens vivem ligadas ao phone)
  const phones: string[] = [lead.phone, ...(lead.phones || [])]
    .filter(Boolean)
    .map((p: string) => String(p).replace(/\D/g, ""))
    .filter((p: string) => p.length >= 10);
  const variants = new Set<string>();
  for (const p of phones) {
    variants.add(p);
    const local = p.startsWith("55") ? p.slice(2) : p;
    variants.add(local);
    variants.add("55" + local);
    if (local.length === 11 && local[2] === "9") {
      const sem9 = local.slice(0, 2) + local.slice(3);
      variants.add(sem9);
      variants.add("55" + sem9);
    }
  }
  for (const lid of lead.whatsapp_chat_lids || []) {
    if (lid) {
      variants.add(lid);
      variants.add(String(lid).replace("@lid", ""));
    }
  }
  if (variants.size > 0) {
    const { data: waMsgs } = await supabase
      .from("whatsapp_messages")
      .select("direction, timestamp, created_at")
      .in("phone", [...variants])
      .order("timestamp", { ascending: false })
      .limit(20);
    for (const m of waMsgs || []) {
      const t = Date.parse(m.timestamp || m.created_at);
      if (Number.isNaN(t)) continue;
      if (m.direction === "inbound") lastIn = Math.max(lastIn ?? 0, t);
      else lastOut = Math.max(lastOut ?? 0, t);
      if (lastIn && lastOut) break;
    }
  }
  return { lastIn, lastOut };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
    } catch (_) {}

    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, name, status, valor, moeda, produto, phone, phones, whatsapp_chat_lids, ai_close_probability, ai_next_step")
      .in("status", ELIGIBLE_STATUSES)
      .eq("archived", false)
      .eq("unclassified", false);
    if (error) throw error;

    const now = Date.now();
    const urgentes: Urgente[] = [];

    for (const lead of leads || []) {
      const { lastIn, lastOut } = await lastRealMessages(supabase, lead);
      const prob = lead.ai_close_probability ?? 0;
      const vBonus = Math.min(15, Math.log10(valorBRL(lead.valor, lead.moeda) + 1) * 3);

      // 1) Cliente escreveu por último e está sem resposta há 24h+ (qualquer produto)
      if (lastIn && (!lastOut || lastIn > lastOut)) {
        const diasEsperando = (now - lastIn) / DAY_MS;
        if (diasEsperando >= 1) {
          urgentes.push({
            lead,
            score: 50 + diasEsperando * 3 + prob / 5 + vBonus,
            motivo: `cliente esperando resposta há ${Math.floor(diasEsperando)}d`,
          });
        }
        continue;
      }

      // 2) Não-publicidade parado (nós falamos por último e cliente sumiu 4d+):
      //    a Susan NÃO cobre — é follow-up manual do Miguel
      if (lead.produto !== "publicidade" && lastOut) {
        const diasParado = (now - lastOut) / DAY_MS;
        if (diasParado >= 4) {
          urgentes.push({
            lead,
            score: diasParado * 1.5 + prob / 5 + vBonus,
            motivo: `sem follow-up há ${Math.floor(diasParado)}d (${lead.produto || "sem produto"} — fora da esteira da Susan)`,
          });
        }
      }
    }

    urgentes.sort((a, b) => b.score - a.score);
    const top3 = urgentes.slice(0, 3);

    if (top3.length === 0) {
      return new Response(JSON.stringify({ message: "nenhum follow-up urgente hoje", candidates: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const linhas = top3.map((u, i) => {
      const v = fmtValor(u.lead);
      const p = u.lead.ai_close_probability != null ? ` · ${u.lead.ai_close_probability}%` : "";
      return `${i + 1}) *${u.lead.name}*${v ? ` (${v}${p})` : p ? ` (${p.slice(3)})` : ""}\n   ${u.motivo}\n   autolead.inventormiguel.com/opportunity/${u.lead.id}`;
    });

    const msg = `🔥 *Follow-ups urgentes de hoje, belesma!*\n\nEscolhe esses 3 e manda ver:\n\n${linhas.join("\n\n")}\n\n(${urgentes.length} conversas precisando de você no total — essas 3 são as que mais queimam)`;

    if (dryRun) {
      return new Response(JSON.stringify({ dry_run: true, message: msg, candidates: urgentes.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Número destino: system_settings.miguel_digest_whatsapp
    const { data: setting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "miguel_digest_whatsapp")
      .maybeSingle();
    const digestPhone = String(setting?.value || "").replace(/\D/g, "");
    if (!digestPhone) {
      return new Response(JSON.stringify({ error: "system_settings.miguel_digest_whatsapp não configurado", preview: msg }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID")!;
    const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN")!;
    const ZAPI_CLIENT_TOKEN = Deno.env.get("ZAPI_CLIENT_TOKEN")!;

    // Envio direto pela Z-API (SEM registrar em whatsapp_messages — é notificação
    // interna pro Miguel, não conversa de lead)
    const resp = await fetch(
      `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Client-Token": ZAPI_CLIENT_TOKEN },
        body: JSON.stringify({ phone: digestPhone, message: msg }),
      },
    );
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`Z-API ${resp.status}: ${t.slice(0, 200)}`);
    }

    return new Response(
      JSON.stringify({ sent: true, to: digestPhone, top3: top3.map((u) => ({ name: u.lead.name, motivo: u.motivo })), candidates: urgentes.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("followup-urgentes-digest error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
