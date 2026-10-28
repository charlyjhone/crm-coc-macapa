// Marca a conversa do contato como lida no WhatsApp da escola (Z-API "modify-chat").
// Chamada pelo CRM quando alguém da equipe abre a conversa em Atendimentos.
// Recebe só o leadId: o número vem do banco, nunca do navegador.
// Efeitos: a família vê os tiques azuis (se a confirmação de leitura estiver ativa
// no WhatsApp da escola) e a conversa deixa de aparecer como não lida no aparelho.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "unauthorized" }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Só pessoas logadas da equipe (admin ou secretaria).
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") || "")?.[1];
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: "unauthorized" }, 401);
  const { data: roles, error: roleError } = await admin.from("user_roles")
    .select("role").eq("user_id", auth.user.id).in("role", ["admin", "user"]);
  if (roleError || !roles?.length) return json({ error: "forbidden" }, 403);

  const { leadId } = await req.json().catch(() => ({}));
  if (typeof leadId !== "string" || !/^[0-9a-f-]{36}$/i.test(leadId)) return json({ error: "leadId inválido" }, 400);

  const { data: lead, error: leadError } = await admin.from("leads")
    .select("phone, whatsapp_chat_lids").eq("id", leadId).maybeSingle();
  if (leadError || !lead) return json({ error: "contato não encontrado" }, 404);

  const instance = Deno.env.get("ZAPI_INSTANCE_ID");
  const zapiToken = Deno.env.get("ZAPI_TOKEN");
  const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");
  if (!instance || !zapiToken || !clientToken) return json({ error: "Credenciais Z-API não configuradas" }, 500);

  // Tenta pelo número; se o chat só existir pelo identificador interno (LID), tenta por ele.
  const phone = String(lead.phone || "").replace(/@.*$/, "").replace(/\D/g, "");
  const lids = (Array.isArray(lead.whatsapp_chat_lids) ? lead.whatsapp_chat_lids : [])
    .map((lid: string) => String(lid).replace(/@.*$/, "").replace(/\D/g, ""))
    .filter((lid: string) => lid.length >= 5);
  const candidates = [...new Set([phone, ...lids].filter(Boolean))];
  if (!candidates.length) return json({ success: false, skipped: "sem_telefone" });

  for (const chat of candidates) {
    try {
      const response = await fetch(`https://api.z-api.io/instances/${instance}/token/${zapiToken}/modify-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Client-Token": clientToken },
        body: JSON.stringify({ phone: chat, action: "read" }),
        signal: AbortSignal.timeout(10000),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result?.value !== false) return json({ success: true });
    } catch (_) {
      // tenta o próximo identificador
    }
  }
  console.error("Z-API não marcou a conversa como lida");
  return json({ success: false }, 502);
});
