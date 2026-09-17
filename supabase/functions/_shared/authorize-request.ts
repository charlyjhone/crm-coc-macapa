import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function authorizeRequest(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{ authorized: boolean; userId?: string; mode?: "internal" | "service_role" | "user" }> {
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") || "";
  const suppliedInternal =
    req.headers.get("x-internal-secret") ||
    new URL(req.url).searchParams.get("internal_secret") ||
    "";

  if (internalSecret && safeEqual(internalSecret, suppliedInternal)) {
    return { authorized: true, mode: "internal" };
  }

  const authorization = req.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { authorized: false };

  if (safeEqual(token, serviceRoleKey)) {
    return { authorized: true, mode: "service_role" };
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      return { authorized: true, userId: data.user.id, mode: "user" };
    }
  } catch (_) {
    // Deliberately fall through to an unauthorized result.
  }

  return { authorized: false };
}

export function unauthorizedResponse(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
