// Daily digest para Miguel — leads de palestra/consultoria/mentoria/treinamento/curso/outros
// (tudo que NÃO é publicidade) em em_aberto/em_negociacao.
// Susan NÃO faz follow-up automático nesses. Em vez disso, manda um resumo diário ao Miguel
// com: nome, produto, última interação (data/canal/direção/preview), probabilidade IA + justificativa curta.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { getSettings } from "../_shared/get-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ELIGIBLE_STATUSES = ["em_aberto", "em_negociacao"];
const NON_PUB_PRODUCTS = ["palestra", "consultoria", "mentoria", "treinamento", "curso", "outros"];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

function daysAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "hoje";
  if (d === 1) return "1 dia atrás";
  return `${d} dias atrás`;
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n) + "…";
}

function esc(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const supabase = createClient(supabaseUrl, srk);

    let dryRun = false;
    let toOverride: string | null = null;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
      toOverride = body?.to || null;
    } catch (_) {}

    const settings = await getSettings(["susan_name", "susan_email", "company_email"]);
    const recipient = toOverride || settings.company_email || "miguel@inventormiguel.com";

    // 1) Leads elegíveis: não-publicidade, em aberto/negociação
    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select(
        "id, name, produto, status, valor, moeda, ai_close_probability, ai_diagnosis_reason, ai_next_step, last_inbound_message, last_inbound_message_at, last_outbound_message, last_outbound_message_at, updated_at",
      )
      .in("status", ELIGIBLE_STATUSES)
      .eq("archived", false)
      .eq("unclassified", false)
      .or(`produto.in.(${NON_PUB_PRODUCTS.join(",")}),produto.is.null`)
      .order("ai_close_probability", { ascending: false, nullsFirst: false });

    if (leadsErr) throw leadsErr;
    const eligible = (leads || []).filter((l) => l.produto !== "publicidade");

    if (eligible.length === 0) {
      return new Response(
        JSON.stringify({ message: "no_leads", sent: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2) Para cada lead, buscar a última interação (email ou whatsapp, qualquer direção)
    const enriched = await Promise.all(
      eligible.map(async (l) => {
        const [emailRes, waRes] = await Promise.all([
          supabase
            .from("email_messages")
            .select("direction, message, subject, timestamp, created_at")
            .eq("lead_id", l.id)
            .order("timestamp", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("whatsapp_messages")
            .select("direction, message, timestamp, created_at, is_audio")
            .eq("lead_id", l.id)
            .order("timestamp", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle(),
        ]);

        const e = emailRes.data;
        const w = waRes.data;
        const eTs = e ? (e.timestamp || e.created_at) : null;
        const wTs = w ? (w.timestamp || w.created_at) : null;
        let last: any = null;
        let channel: "email" | "whatsapp" | null = null;
        if (eTs && (!wTs || new Date(eTs) >= new Date(wTs))) {
          last = e; channel = "email";
        } else if (wTs) {
          last = w; channel = "whatsapp";
        }

        return {
          ...l,
          last_channel: channel,
          last_direction: last?.direction || null,
          last_ts: last ? (last.timestamp || last.created_at) : null,
          last_preview: last
            ? channel === "whatsapp" && last.is_audio
              ? "[áudio]"
              : truncate((last.message || last.subject || "").trim(), 240)
            : "",
        };
      }),
    );

    // 3) Ordenar: primeiro os com inbound mais antigo sem resposta (bola conosco), depois resto
    enriched.sort((a, b) => {
      const pa = a.ai_close_probability ?? -1;
      const pb = b.ai_close_probability ?? -1;
      return pb - pa;
    });

    const grouped: Record<string, typeof enriched> = {};
    for (const l of enriched) {
      const key = l.produto || "sem produto";
      (grouped[key] ||= []).push(l);
    }

    // 4) Montar HTML
    const productLabel: Record<string, string> = {
      palestra: "Palestras",
      consultoria: "Consultorias",
      mentoria: "Mentorias",
      treinamento: "Treinamentos",
      curso: "Cursos",
      outros: "Outros",
      "sem produto": "Sem produto identificado",
    };

    const totalCount = enriched.length;
    const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long" });

    let html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;max-width:720px;margin:0 auto;color:#1a1a1a;font-size:14px;line-height:1.55;">
  <h2 style="margin:0 0 4px;font-size:20px;">Resumo de oportunidades não-publicidade</h2>
  <p style="margin:0 0 18px;color:#666;font-size:13px;">${esc(today)} — ${totalCount} lead${totalCount === 1 ? "" : "s"} em aberto / negociação</p>`;

    for (const prodKey of Object.keys(grouped).sort()) {
      const items = grouped[prodKey];
      html += `<h3 style="margin:22px 0 8px;font-size:16px;border-bottom:1px solid #e5e5e5;padding-bottom:4px;">${esc(productLabel[prodKey] || prodKey)} (${items.length})</h3>`;
      for (const l of items) {
        const prob = l.ai_close_probability != null ? `${l.ai_close_probability}%` : "—";
        const probColor = (l.ai_close_probability ?? 0) >= 60 ? "#16a34a" : (l.ai_close_probability ?? 0) >= 30 ? "#ca8a04" : "#6b7280";
        const valor = l.valor ? `${l.moeda || "BRL"} ${Number(l.valor).toLocaleString("pt-BR")}` : "valor indefinido";
        const dirLabel = l.last_direction === "inbound" ? "🟢 Cliente" : l.last_direction === "outbound" ? "🔵 Miguel" : "—";
        const channelLabel = l.last_channel === "email" ? "📧 e-mail" : l.last_channel === "whatsapp" ? "💬 WhatsApp" : "";
        html += `
        <div style="border:1px solid #e5e5e5;border-radius:8px;padding:12px 14px;margin-bottom:10px;background:#fafafa;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
            <strong style="font-size:15px;">${esc(l.name || "(sem nome)")}</strong>
            <span style="color:${probColor};font-weight:600;font-size:13px;">${prob}</span>
          </div>
          <div style="color:#666;font-size:12px;margin:2px 0 8px;">${esc(valor)} · ${esc(l.status || "")}</div>
          <div style="font-size:13px;margin-bottom:6px;">
            <span style="color:#666;">Última interação:</span> ${dirLabel} ${channelLabel} · ${esc(fmtDate(l.last_ts))} <span style="color:#999;">(${esc(daysAgo(l.last_ts))})</span>
          </div>
          ${l.last_preview ? `<div style="background:#fff;border-left:3px solid #d4d4d4;padding:6px 10px;font-size:13px;color:#444;margin:6px 0;white-space:pre-wrap;">${esc(l.last_preview)}</div>` : ""}
          ${l.ai_diagnosis_reason ? `<div style="font-size:12px;color:#555;margin-top:6px;"><strong>Justificativa IA:</strong> ${esc(truncate(l.ai_diagnosis_reason, 280))}</div>` : ""}
          ${l.ai_next_step ? `<div style="font-size:12px;color:#555;margin-top:2px;"><strong>Próximo passo:</strong> ${esc(truncate(l.ai_next_step, 220))}</div>` : ""}
        </div>`;
      }
    }

    html += `<p style="margin-top:24px;color:#999;font-size:11px;">Gerado automaticamente — Susan não faz follow-up nesses leads. Responda manualmente os que considerar prioritários.</p>
  </div>`;

    if (dryRun) {
      return new Response(
        JSON.stringify({ dry_run: true, leads: enriched.length, html_length: html.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 5) Enviar via Resend
    const sendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${settings.susan_name} <${settings.susan_email}>`,
        to: [recipient],
        subject: `📋 Resumo de oportunidades não-publicidade — ${totalCount} lead${totalCount === 1 ? "" : "s"}`,
        html,
      }),
    });

    if (!sendResp.ok) {
      const t = await sendResp.text();
      return new Response(
        JSON.stringify({ error: `Resend ${sendResp.status}: ${t.slice(0, 400)}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sendData = await sendResp.json();
    return new Response(
      JSON.stringify({ sent: true, leads: enriched.length, recipient, resend_id: sendData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("non-publicidade-digest error:", e);
    return new Response(
      JSON.stringify({ error: e?.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
