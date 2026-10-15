import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const headers = { "Content-Type": "application/json" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (req.headers.get("Authorization") !== `Bearer ${serviceKey}`) return reply({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  if (typeof body.leadId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.leadId) ||
      typeof body.phone !== "string" || !/^[0-9]{10,15}$/.test(body.phone.replace(/\D/g, "")))
    return reply({ error: "invalid_contact" }, 400);
  const db = createClient(url, serviceKey);
  const { data: enabled, error: settingError } = await db.from("system_settings")
    .select("value").eq("key", "escola_folder_ativo").maybeSingle();
  if (settingError || enabled?.value !== "true") return reply({ error: "folder_disabled" }, 409);
  const { data: lead, error: leadError } = await db.from("leads")
    .select("id, phone, archived").eq("id", body.leadId).maybeSingle();
  if (leadError || !lead || lead.archived || lead.phone?.replace(/\D/g, "") !== body.phone.replace(/\D/g, ""))
    return reply({ error: "contact_mismatch" }, 403);
  const phone = body.phone.replace(/\D/g, "");
  const { data: recent, error: recentError } = await db.from("whatsapp_messages")
    .select("id").eq("phone", phone).eq("direction", "outbound")
    .eq("raw_data->>material", "school_folder").gte("created_at", new Date(Date.now() - 24 * 3600000).toISOString()).limit(1);
  if (recentError) return reply({ error: "history_unavailable" }, 503);
  if (recent?.length) return reply({ success: true, skipped: "recently_sent" });
  const signed = await db.storage.from("school-materials").createSignedUrl("folder-digital.pdf", 300);
  if (signed.error || !signed.data?.signedUrl) return reply({ error: "folder_unavailable" }, 503);
  const instance = Deno.env.get("ZAPI_INSTANCE_ID");
  const token = Deno.env.get("ZAPI_TOKEN");
  const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");
  if (!instance || !token || !clientToken) return reply({ error: "provider_unavailable" }, 503);
  const { data: agentSetting } = await db.from("system_settings").select("value").eq("key", "escola_agente_nome").maybeSingle();
  const agentName = (agentSetting?.value || "Ana").trim().slice(0, 40).replace(/[\r\n\[\]*<>]/g, "") || "Ana";
  const caption = `*[Atendente ${agentName}]*\nAqui está o folder digital da escola. Se quiser saber mais sobre alguma etapa, estou à disposição!`;
  const response = await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-document/pdf`, {
    method: "POST", headers: { "Content-Type": "application/json", "Client-Token": clientToken },
    body: JSON.stringify({ phone, document: signed.data.signedUrl, fileName: "Folder digital da escola.pdf", caption }),
  });
  const provider = await response.json().catch(() => ({}));
  if (!response.ok || !(provider.messageId || provider.zaapId || provider.id))
    return reply({ error: "provider_did_not_confirm" }, 502);
  const { error: saveError } = await db.from("whatsapp_messages").insert({
    lead_id: null, phone, direction: "outbound", message: caption, timestamp: new Date().toISOString(),
    raw_data: { messageId: provider.messageId || provider.id, zaapId: provider.zaapId,
      sender_type: "ana", source: "school-triage", material: "school_folder" },
  });
  if (saveError) {
    console.error("school_folder_save_failed", saveError);
    return reply({ success: true, warning: "history_save_failed" });
  }
  return reply({ success: true, sent: true });
});
