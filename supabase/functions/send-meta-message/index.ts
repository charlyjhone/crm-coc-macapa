// Envia a resposta da secretaria pelo Instagram Direct ou Facebook Messenger (Send API da Meta).
// Recebe só { leadId, message }: o destinatário vem do banco, o nome da pessoa vem da sessão.
// Regra da Meta: resposta livre até 24 h depois da última mensagem da família. Entre 24 h e 7 dias,
// só com a etiqueta HUMAN_AGENT (exige aprovação do app; ligue META_HUMAN_AGENT=1 depois de aprovada).
// Segredos: META_PAGE_ACCESS_TOKEN (token da Página com instagram_manage_messages / pages_messaging).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const GRAPH = `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") || "v25.0"}`;
const HOUR = 3_600_000;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") || "")?.[1];
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return json({ error: "unauthorized" }, 401);
  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", auth.user.id).in("role", ["admin", "user"]);
  if (!roles?.length) return json({ error: "forbidden" }, 403);

  const rawName = auth.user.user_metadata?.full_name;
  const operatorName = typeof rawName === "string" ? rawName.replace(/[\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) : "";
  if (!operatorName) return json({ error: "Cadastre seu nome em Meu perfil antes de enviar mensagens." }, 422);

  const { leadId, message } = await req.json().catch(() => ({}));
  if (typeof leadId !== "string" || !/^[0-9a-f-]{36}$/i.test(leadId)) return json({ error: "leadId inválido" }, 400);
  if (typeof message !== "string" || !message.trim()) return json({ error: "Escreva a mensagem" }, 400);

  const pageToken = Deno.env.get("META_PAGE_ACCESS_TOKEN");
  if (!pageToken) return json({ error: "Integração com Instagram/Facebook ainda não configurada." }, 503);

  const { data: identity } = await db.from("lead_social_identities")
    .select("channel, social_user_id, last_inbound_at").eq("lead_id", leadId)
    .order("last_inbound_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  if (!identity) return json({ error: "Este contato não veio do Instagram nem do Facebook." }, 404);

  const label = identity.channel === "instagram" ? "Instagram" : "Facebook";
  const text = `${operatorName} · Secretaria\n${message.trim()}`;
  if (new TextEncoder().encode(text).length > 1000) return json({ error: `Mensagem longa demais para o ${label} (limite de 1000 caracteres). Divida em duas.` }, 400);

  const since = identity.last_inbound_at ? Date.now() - Date.parse(identity.last_inbound_at) : Infinity;
  const humanAgent = Deno.env.get("META_HUMAN_AGENT") === "1";
  let messagingType = "RESPONSE";
  let tag: string | null = null;
  if (since > 24 * HOUR) {
    if (humanAgent && since <= 7 * 24 * HOUR) { messagingType = "MESSAGE_TAG"; tag = "HUMAN_AGENT"; }
    else return json({ error: `A janela de resposta do ${label} fechou (24 h sem mensagem da família). Peça para a família mandar uma nova mensagem ou fale por outro canal.`, window: "closed" }, 409);
  }

  const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(pageToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: identity.social_user_id },
      messaging_type: messagingType,
      ...(tag ? { tag } : {}),
      message: { text },
    }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || !result?.message_id) {
    console.error("send-meta-message: Meta recusou", identity.channel, result?.error?.code || res.status);
    return json({ error: `O ${label} recusou o envio${result?.error?.message ? `: ${result.error.message}` : "."}` }, 502);
  }

  const now = new Date().toISOString();
  await db.from("social_messages").insert({
    channel: identity.channel, external_id: result.message_id, lead_id: leadId, social_user_id: identity.social_user_id,
    direction: "outbound", message: text, sent_by: auth.user.id, operator_name: operatorName, message_tag: tag, sent_at: now,
  });
  const { data: lead } = await db.from("leads").select("triage_status").eq("id", leadId).maybeSingle();
  await db.from("leads").update({
    last_outbound_message_at: now,
    ...(lead?.triage_status === "aguardando_secretaria" ? { triage_status: "respondido_agente", attention_level: "normal" } : {}),
  }).eq("id", leadId);

  return json({ success: true, channel: identity.channel, message_id: result.message_id, tag });
});
