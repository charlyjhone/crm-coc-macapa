import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function normalizePhone(value: string) {
  const digits = value.replace(/@.*$/, "").replace(/\D/g, "");
  if (!digits) return "";
  if (!digits.startsWith("55")) {
    const international = digits.startsWith("351") || digits.startsWith("1") || digits.startsWith("44") ||
      digits.startsWith("33") || digits.startsWith("34") || digits.startsWith("39") || digits.startsWith("49") || digits.length > 11;
    if (international) return digits;
  }
  let local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 10 && /^[6-9]/.test(local.slice(2, 3))) local = `${local.slice(0, 2)}9${local.slice(2)}`;
  return local.length === 10 || local.length === 11 ? `55${local}` : digits;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") || "")?.[1];
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!token || !supabaseUrl || !serviceKey) return json({ error: "Sessão inválida." }, 401);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return json({ error: "Sessão inválida." }, 401);
    const { data: roles, error: rolesError } = await admin.from("user_roles").select("role")
      .eq("user_id", user.id).in("role", ["admin", "user"]);
    if (rolesError || !roles?.length) return json({ error: "Acesso não autorizado." }, 403);

    const body = await req.json();
    const leadId = typeof body.leadId === "string" ? body.leadId : "";
    const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType.split(";")[0].trim().toLowerCase() : "";
    const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 120) : "audio-secretaria.webm";
    const durationSeconds = Number.isFinite(body.durationSeconds) ? Math.max(0, Math.min(300, Math.round(body.durationSeconds))) : null;
    if (!leadId || !storagePath || !storagePath.startsWith(`${user.id}/${leadId}/`) ||
        !/^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)$/.test(mimeType)) {
      return json({ error: "Áudio inválido ou caminho não autorizado." }, 400);
    }
    const { data: lead, error: leadError } = await admin.from("leads").select("id, phone").eq("id", leadId).maybeSingle();
    if (leadError || !lead?.phone) return json({ error: "Contato sem WhatsApp cadastrado." }, 422);
    const phone = normalizePhone(lead.phone);
    if (!phone) return json({ error: "Telefone inválido." }, 422);
    const { data: signed, error: signError } = await admin.storage.from("whatsapp-audio").createSignedUrl(storagePath, 600);
    if (signError || !signed?.signedUrl) return json({ error: "Não foi possível preparar o áudio para envio." }, 422);

    const instanceId = Deno.env.get("ZAPI_INSTANCE_ID");
    const zapiToken = Deno.env.get("ZAPI_TOKEN");
    const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");
    if (!instanceId || !zapiToken || !clientToken) return json({ error: "Credenciais Z-API não configuradas." }, 500);
    const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${zapiToken}/send-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body: JSON.stringify({ phone, audio: signed.signedUrl, viewOnce: false, waveform: true }),
    });
    const zapiData = await response.json().catch(() => ({}));
    const confirmed = response.ok && !!(zapiData?.messageId || zapiData?.zaapId || zapiData?.id);
    if (!confirmed) {
      console.error("[send-whatsapp-audio] provider did not confirm", response.status);
      return json({ error: "O WhatsApp não confirmou o envio do áudio. Tente novamente." }, 502);
    }
    const operatorName = typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.replace(/[\r\n*_~`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60)
      : null;
    await admin.rpc("set_activity_context", { p_source: "edge_function:send-whatsapp-audio", p_actor: operatorName || user.id });
    const { error: insertError } = await admin.from("whatsapp_messages").insert({
      lead_id: null, phone, message: "[Áudio enviado pela secretaria]", direction: "outbound",
      timestamp: new Date().toISOString(), is_audio: true,
      raw_data: { ...zapiData, audio: { storagePath, mimeType, fileName, durationSeconds },
        operator_id: user.id, operator_name: operatorName, sender_type: "human", source: "manual" },
    });
    if (insertError) {
      console.error("[send-whatsapp-audio] message log insert failed", insertError.message);
      return json({ success: true, logged: false, warning: "Áudio enviado, mas o histórico ainda não foi atualizado." });
    }
    return json({ success: true, messageId: zapiData.messageId || zapiData.zaapId || zapiData.id });
  } catch (error) {
    console.error("[send-whatsapp-audio] failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Não foi possível enviar o áudio." }, 500);
  }
});
