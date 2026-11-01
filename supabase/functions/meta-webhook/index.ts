// Recebe mensagens do Instagram Direct e do Facebook Messenger (webhook oficial da Meta).
// - GET: verificação do webhook (hub.mode / hub.verify_token / hub.challenge).
// - POST: confere a assinatura X-Hub-Signature-256 com o App Secret, grava a mensagem em
//   social_messages, cria/atualiza o contato (leads) e o vínculo em lead_social_identities.
// A Ana não responde nesses canais por enquanto: a conversa vai para a secretaria.
// Segredos: META_APP_SECRET, META_VERIFY_TOKEN, META_PAGE_ACCESS_TOKEN (opcional, para buscar nome/foto).
// Os logs não imprimem conteúdo de mensagens nem identificadores das famílias.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const GRAPH = `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") || "v25.0"}`;
type Channel = "instagram" | "facebook";
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const text = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain" } });

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function validSignature(raw: string, header: string | null, secret: string) {
  const received = /^sha256=([0-9a-f]{64})$/i.exec(header || "")?.[1]?.toLowerCase();
  if (!received) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  return safeEqual(digest, received);
}

function describe(message: Json): { body: string | null; attachments: Json[] } {
  const attachments: Json[] = Array.isArray(message?.attachments)
    ? message.attachments.map((a: Json) => ({ type: a?.type || "file", url: a?.payload?.url || null }))
    : [];
  const body = typeof message?.text === "string" && message.text.trim() ? message.text.trim() : null;
  return { body, attachments };
}

const preview = (body: string | null, attachments: Json[]) => {
  if (body) return body.slice(0, 500);
  const kind = attachments[0]?.type;
  return kind === "image" ? "[imagem]" : kind === "audio" ? "[áudio]" : kind === "video" ? "[vídeo]" : kind === "story_mention" ? "[menção no story]" : "[anexo]";
};

async function fetchProfile(channel: Channel, userId: string) {
  const token = Deno.env.get("META_PAGE_ACCESS_TOKEN");
  if (!token) return null;
  const fields = channel === "instagram" ? "name,username,profile_pic" : "first_name,last_name,profile_pic";
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(userId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const name = channel === "instagram" ? (data.name || null) : [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
    return { name, username: data.username || null, profile_pic: data.profile_pic || null };
  } catch {
    return null;
  }
}

async function ensureLead(db: SupabaseClient, channel: Channel, userId: string, createIfMissing: boolean) {
  const { data: identity } = await db.from("lead_social_identities")
    .select("id, lead_id").eq("channel", channel).eq("social_user_id", userId).maybeSingle();
  if (identity?.lead_id) return identity.lead_id as string;
  if (!createIfMissing) return null;

  const profile = await fetchProfile(channel, userId);
  const label = channel === "instagram" ? "Instagram" : "Facebook";
  const name = profile?.name || (profile?.username ? `@${profile.username}` : `Contato do ${label}`);
  const { data: lead, error } = await db.from("leads").insert({
    name,
    source: channel === "instagram" ? "Instagram Direct" : "Facebook Messenger",
    status: "novo",
    triage_status: "aguardando_secretaria",
    attention_level: "normal",
    handoff_reason: `Mensagem pelo ${label}`,
  }).select("id").single();
  if (error || !lead) throw new Error("lead_insert_failed");

  const { error: idError } = await db.from("lead_social_identities").insert({
    lead_id: lead.id, channel, social_user_id: userId,
    username: profile?.username || null, display_name: profile?.name || null, profile_pic: profile?.profile_pic || null,
  });
  if (idError) {
    // Outra entrega simultânea criou o vínculo primeiro: usa o dela e descarta o contato duplicado.
    const { data: winner } = await db.from("lead_social_identities").select("lead_id").eq("channel", channel).eq("social_user_id", userId).maybeSingle();
    if (winner?.lead_id) { await db.from("leads").update({ archived: true }).eq("id", lead.id); return winner.lead_id as string; }
    throw new Error("identity_insert_failed");
  }
  return lead.id as string;
}

export async function handleEvent(db: SupabaseClient, channel: Channel, event: Json) {
  const message = event?.message;
  const postback = event?.postback;
  if (!message && !postback) return "ignored"; // leitura, entrega, reação etc.
  if (message?.is_deleted) return "ignored";

  const isEcho = message?.is_echo === true;
  const userId: string | undefined = isEcho ? event?.recipient?.id : event?.sender?.id;
  const externalId: string | null = message?.mid || postback?.mid || null;
  if (!userId) return "ignored";

  const { body, attachments } = message ? describe(message) : { body: postback?.title || null, attachments: [] as Json[] };
  const sentAt = new Date(Number(event?.timestamp) || Date.now()).toISOString();
  const leadId = await ensureLead(db, channel, userId, !isEcho);

  // Mensagem enviada pelo próprio CRM já foi gravada pela send-meta-message (mesmo mid).
  if (externalId) {
    const { data: existing } = await db.from("social_messages").select("id").eq("channel", channel).eq("external_id", externalId).maybeSingle();
    if (existing) return "duplicate";
  }

  const { error } = await db.from("social_messages").insert({
    channel, external_id: externalId, lead_id: leadId, social_user_id: userId,
    direction: isEcho ? "outbound" : "inbound", message: body, attachments,
    raw_data: { type: postback ? "postback" : "message", reply_to: message?.reply_to || null, app_id: message?.app_id || null },
    operator_name: isEcho ? "Pelo aplicativo" : null, sent_at: sentAt,
  });
  if (error) {
    if (error.code === "23505") return "duplicate";
    throw new Error("message_insert_failed");
  }
  if (!leadId) return "stored";

  if (isEcho) {
    await db.from("leads").update({ last_outbound_message_at: sentAt }).eq("id", leadId);
    return "stored";
  }

  const { data: lead } = await db.from("leads").select("status, triage_status").eq("id", leadId).maybeSingle();
  const reopen = lead?.triage_status === "resolvido" || lead?.status === "resolvido";
  await db.from("leads").update({
    last_inbound_message: preview(body, attachments),
    last_inbound_message_at: sentAt,
    triage_status: "aguardando_secretaria",
    ...(reopen ? { resolved_at: null, status: "em_atendimento" } : {}),
  }).eq("id", leadId);
  await db.from("lead_social_identities").update({ last_inbound_at: sentAt, updated_at: new Date().toISOString() })
    .eq("channel", channel).eq("social_user_id", userId);
  return "stored";
}

if (import.meta.main) serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const verify = Deno.env.get("META_VERIFY_TOKEN");
    const ok = verify && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === verify;
    return ok ? text(url.searchParams.get("hub.challenge") || "") : text("forbidden", 403);
  }
  if (req.method !== "POST") return text("method_not_allowed", 405);

  const secret = Deno.env.get("META_APP_SECRET");
  if (!secret) { console.error("meta-webhook: META_APP_SECRET ausente"); return text("not_configured", 503); }
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-hub-signature-256"), secret))) return text("invalid_signature", 401);

  let payload: Json;
  try { payload = JSON.parse(raw); } catch { return text("bad_request", 400); }
  const channel: Channel | null = payload?.object === "instagram" ? "instagram" : payload?.object === "page" ? "facebook" : null;
  if (!channel) return text("not_found", 404);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const counts: Record<string, number> = {};
  for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
    for (const event of Array.isArray(entry?.messaging) ? entry.messaging : []) {
      try {
        const result = await handleEvent(db, channel, event);
        counts[result] = (counts[result] || 0) + 1;
      } catch (error) {
        counts.error = (counts.error || 0) + 1;
        console.error("meta-webhook: falha ao processar evento", channel, error instanceof Error ? error.message : "erro");
      }
    }
  }
  console.log("meta-webhook", channel, JSON.stringify(counts));
  // Erro de gravação: 500 faz a Meta reenviar (a gravação é idempotente pelo mid).
  return counts.error ? text("partial_failure", 500) : text("EVENT_RECEIVED");
});
