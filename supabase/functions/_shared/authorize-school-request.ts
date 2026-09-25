import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

/** Never trust a decoded JWT or user_metadata to authorize a school operator. */
export async function authorizeSchoolRequest(req: Request, cors: Record<string, string>) {
  const reject = (status: number) => ({
    response: new Response(JSON.stringify({ error: status === 401 ? "unauthorized" : "forbidden" }), {
      status, headers: { ...cors, "Content-Type": "application/json" },
    }), internal: false,
  });
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") || "")?.[1];
  if (!token) return reject(401);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  if (!serviceKey || !url) return reject(401);
  // Only the exact server credential is accepted for internal calls.
  if (token === serviceKey) return { response: null, internal: true };
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return reject(401);
  const { data: roles, error: roleError } = await client.from("user_roles")
    .select("role").eq("user_id", data.user.id).in("role", ["admin", "user"]);
  if (roleError || !roles?.length) return reject(403);
  return { response: null, internal: false };
}
