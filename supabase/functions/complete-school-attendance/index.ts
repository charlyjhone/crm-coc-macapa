import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Content-Type": "application/json" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const options = [
  { id: "redes_sociais", title: "Redes sociais", description: "" },
  { id: "indicacao", title: "Indicação", description: "" },
  { id: "panfletagem_outdoor", title: "Panfletagem/outdoor", description: "" },
  { id: "outros", title: "Outros", description: "" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") || "";
  const token = auth.match(/^Bearer (.+)$/i)?.[1];
  if (!token || token === serviceKey) return reply({ error: "unauthorized" }, 401);
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: identity, error: authError } = await userClient.auth.getUser(token);
  if (authError || !identity.user) return reply({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  if (typeof body.leadId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.leadId)) return reply({ error: "invalid_lead" }, 400);
  const { data: visible, error: readError } = await userClient.from("leads")
    .select("id, phone, triage_status, resolved_at, last_inbound_message_at").eq("id", body.leadId).maybeSingle();
  if (readError) return reply({ error: "read_failed" }, 500);
  if (!visible) return reply({ error: "forbidden" }, 403);

  const admin = createClient(url, serviceKey);
  let lead = visible;
  if (lead.triage_status !== "resolvido") {
    const { data, error } = await admin.from("leads")
      .update({ triage_status: "resolvido", status: "resolvido", resolved_at: new Date().toISOString() })
      .eq("id", lead.id).neq("triage_status", "resolvido")
      .select("id, phone, triage_status, resolved_at, last_inbound_message_at").maybeSingle();
    if (error) return reply({ error: "update_failed" }, 500);
    if (data) lead = data;
    else {
      const current = await admin.from("leads").select("id, phone, triage_status, resolved_at, last_inbound_message_at").eq("id", lead.id).single();
      if (current.error) return reply({ error: "read_failed" }, 500);
      lead = current.data;
    }
  }
  const inboundAt = lead.last_inbound_message_at ? Date.parse(lead.last_inbound_message_at) : NaN;
  if (!lead.phone || !Number.isFinite(inboundAt) || Date.now() - inboundAt > 7 * 86400000)
    return reply({ success: true, survey: "not_applicable" });
  const { data: linkedInbound, error: inboundError } = await admin.from("whatsapp_messages")
    .select("phone, created_at").eq("lead_id", lead.id).eq("direction", "inbound")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (inboundError) return reply({ success: true, survey: "lookup_failed" });
  // Some webhook messages precede the lead reconciliation and have no lead_id.
  const digits = lead.phone.replace(/\D/g, "");
  const { data: phoneInbound, error: phoneError } = await admin.from("whatsapp_messages")
    .select("phone, created_at").in("phone", [...new Set([lead.phone, digits])])
    .eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (phoneError) return reply({ success: true, survey: "lookup_failed" });
  const samePhoneLinked = linkedInbound?.phone?.replace(/\D/g, "") === digits ? linkedInbound : null;
  const inbound = !samePhoneLinked || (phoneInbound && Date.parse(phoneInbound.created_at) > Date.parse(samePhoneLinked.created_at))
    ? phoneInbound : samePhoneLinked;
  if (!inbound?.phone || Date.now() - Date.parse(inbound.created_at) > 7 * 86400000)
    return reply({ success: true, survey: "not_applicable" });
  const { data: previous, error: previousError } = await admin.from("whatsapp_messages")
    .select("id").eq("phone", inbound.phone).eq("direction", "outbound").eq("raw_data->>survey_step", "origin")
    .gte("created_at", inbound.created_at).limit(1);
  if (previousError) return reply({ success: true, survey: "lookup_failed" });
  if (previous?.length) return reply({ success: true, survey: "already_sent" });
  if (!lead.resolved_at) return reply({ success: true, survey: "not_applicable" });
  const { data: claimed, error: claimError } = await admin.rpc("claim_crm_survey", { p_lead_id: lead.id, p_cycle_at: lead.resolved_at });
  if (claimError) return reply({ success: true, survey: "claim_failed" });
  if (!claimed) return reply({ success: true, survey: "already_processing" });
  let sent = false;
  try {
    const { data: setting } = await admin.from("system_settings").select("value").eq("key", "escola_agente_nome").maybeSingle();
    const agentName = (setting?.value || "Ana").trim().slice(0, 40).replace(/[\r\n\[\]*<>]/g, "") || "Ana";
    const message = `*[Atendente ${agentName}]*\nAntes de ir, como você conheceu a escola? Sua resposta nos ajuda a melhorar nossa comunicação. É só escolher uma opção abaixo. 😊`;
    const send = async (useList: boolean) => fetch(`${url}/functions/v1/send-whatsapp-message`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ phone: inbound.phone, leadId: lead.id, senderType: "ana", surveyStep: "origin",
        message: useList ? message : `${message}\n${options.map((o) => o.title).join(" · ")}`,
        ...(useList ? { optionList: { title: "Como conheceu a escola?", buttonLabel: "Escolher opção", options } } : {}) }),
    });
    const listResponse = await send(true);
    sent = listResponse.ok || (await send(false)).ok;
  } catch (error) { console.error("crm_survey_send_failed", error); }
  await admin.from("crm_survey_claims").update({ state: sent ? "sent" : "failed", updated_at: new Date().toISOString() })
    .eq("lead_id", lead.id).eq("cycle_at", lead.resolved_at).eq("state", "processing");
  return reply({ success: true, survey: sent ? "sent" : "send_failed" });
});
