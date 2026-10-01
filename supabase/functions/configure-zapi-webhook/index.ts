import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const expectedPath = "/functions/v1/zapi-webhook";
const callbackFields = [
  ["receivedCallbackUrl", "update-webhook-received"],
  ["deliveryCallbackUrl", "update-webhook-delivery"],
  ["messageStatusCallbackUrl", "update-webhook-message-status"],
  ["connectedCallbackUrl", "update-webhook-connected"],
  ["disconnectedCallbackUrl", "update-webhook-disconnected"],
  ["presenceChatCallbackUrl", "update-webhook-chat-presence"],
] as const;

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const instance = Deno.env.get("ZAPI_INSTANCE_ID");
  const token = Deno.env.get("ZAPI_TOKEN");
  const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");
  if (!url || !serviceKey || !instance || !token || !clientToken) {
    return Response.json({ error: "missing_server_configuration" }, { status: 503 });
  }
  const supabase = createClient(url, serviceKey);
  const internalSecret = req.headers.get("x-school-triage-secret") || "";
  if (!internalSecret) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { data: authorized, error: authError } = await supabase.rpc(
    "verify_school_triage_secret", { p_secret: internalSecret }
  );
  if (authError || authorized !== true) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (body.action !== "inspect" && body.action !== "configure") {
      return Response.json({ error: "invalid_action" }, { status: 400 });
    }
    const apiBase = `https://api.z-api.io/instances/${encodeURIComponent(instance)}/token/${encodeURIComponent(token)}`;
    const headers = { "Client-Token": clientToken, "Content-Type": "application/json" };
    const getCurrent = async () => {
      const response = await fetch(`${apiBase}/me`, { headers });
      if (!response.ok) throw new Error(`zapi_me_${response.status}`);
      return await response.json() as Record<string, unknown>;
    };
    const current = await getCurrent();
    const endpoint = new URL(expectedPath, url);
    const callbacks = callbackFields.map(([field, updateRoute]) => {
      const configured = typeof current[field] === "string" ? current[field] as string : "";
      let pointsToThisCrm = false;
      try {
        const parsed = new URL(configured);
        pointsToThisCrm = parsed.origin === endpoint.origin && parsed.pathname === endpoint.pathname;
      } catch { /* no callback for this event */ }
      return { field, updateRoute, configured: Boolean(configured), pointsToThisCrm };
    });
    const active = callbacks.filter((item) => item.pointsToThisCrm);
    if (body.action === "inspect") {
      return Response.json({ callbacks: callbacks.map(({ field, configured, pointsToThisCrm }) =>
        ({ field, configured, pointsToThisCrm })), sentByMe: current.receiveCallbackSentByMe === true });
    }
    if (!active.some((item) => item.field === "receivedCallbackUrl")) {
      return Response.json({ error: "received_callback_not_at_this_crm" }, { status: 409 });
    }
    const { data: callbackSecret, error: secretError } = await supabase.rpc("get_zapi_webhook_secret");
    if (secretError || typeof callbackSecret !== "string" || callbackSecret.length !== 64) {
      return Response.json({ error: "callback_secret_unavailable" }, { status: 503 });
    }
    endpoint.searchParams.set("key", callbackSecret);
    for (const { updateRoute } of active) {
      const response = await fetch(`${apiBase}/${updateRoute}`, {
        method: "PUT", headers, body: JSON.stringify({ value: endpoint.toString() }),
      });
      if (!response.ok) throw new Error(`zapi_update_${updateRoute}_${response.status}`);
    }
    const after = await getCurrent();
    const verified = active.every(({ field }) => after[field] === endpoint.toString());
    return Response.json({ updated: active.map(({ field }) => field), verified }, { status: verified ? 200 : 502 });
  } catch (error) {
    console.error("Z-API callback configuration failed:", String(error));
    return Response.json({ error: "provider_update_failed" }, { status: 502 });
  }
});
