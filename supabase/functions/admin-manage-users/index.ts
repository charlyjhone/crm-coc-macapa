import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "missing_auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "invalid_auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verifica admin
    const { data: isAdminData } = await admin.rpc("is_admin", { _user_id: userData.user.id });
    if (!isAdminData) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === "list") {
      const { data: usersList, error } = await admin.auth.admin.listUsers({ perPage: 200 });
      if (error) throw error;
      const ids = (usersList.users || []).map((u) => u.id);
      const [{ data: roles }, { data: presence }] = await Promise.all([
        admin.from("user_roles").select("user_id, role").in("user_id", ids),
        admin.from("user_presence").select("user_id, last_seen_at, last_path").in("user_id", ids),
      ]);
      const rolesMap = new Map<string, string[]>();
      (roles || []).forEach((r: any) => {
        const arr = rolesMap.get(r.user_id) || [];
        arr.push(r.role);
        rolesMap.set(r.user_id, arr);
      });
      const presenceMap = new Map<string, { last_seen_at: string; last_path: string | null }>();
      (presence || []).forEach((p: any) => presenceMap.set(p.user_id, { last_seen_at: p.last_seen_at, last_path: p.last_path }));
      const users = (usersList.users || []).map((u) => ({
        id: u.id,
        email: u.email,
        name: (u.user_metadata as any)?.full_name || null,
        created_at: u.created_at,
        last_sign_in_at: (u as any).last_sign_in_at || null,
        last_seen_at: presenceMap.get(u.id)?.last_seen_at || null,
        last_path: presenceMap.get(u.id)?.last_path || null,
        roles: rolesMap.get(u.id) || [],
      }));
      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_activities") {
      const { user_id, limit = 50, offset = 0 } = body;
      if (!user_id) throw new Error("user_id obrigatório");
      const from = Number(offset) || 0;
      const to = from + (Number(limit) || 50) - 1;
      const { data: activities, error: actErr, count } = await admin
        .from("activity_log")
        .select("id, lead_id, activity_type, description, source, actor, created_at", { count: "exact" })
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (actErr) throw actErr;
      const leadIds = Array.from(new Set((activities || []).map((a: any) => a.lead_id).filter(Boolean)));
      const leadsMap = new Map<string, string>();
      if (leadIds.length > 0) {
        const { data: leads } = await admin.from("leads").select("id, name").in("id", leadIds);
        (leads || []).forEach((l: any) => leadsMap.set(l.id, l.name));
      }
      const enriched = (activities || []).map((a: any) => ({
        ...a,
        lead_name: a.lead_id ? leadsMap.get(a.lead_id) || null : null,
      }));
      return new Response(JSON.stringify({ activities: enriched, total: count ?? enriched.length, offset: from, limit: Number(limit) || 50 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create") {
      const { email, password, name } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "email_e_senha_obrigatorios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: name ? { full_name: name } : undefined,
      });
      if (createErr) throw createErr;
      const newUserId = created.user.id;
      await admin.from("user_roles").insert({ user_id: newUserId, role: "user" });
      return new Response(JSON.stringify({ ok: true, user_id: newUserId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_profile") {
      const { user_id, name, email } = body;
      if (!user_id) throw new Error("user_id obrigatório");
      const update: Record<string, unknown> = {};
      if (typeof email === "string" && email.trim()) update.email = email.trim();
      if (typeof name === "string") update.user_metadata = { full_name: name.trim() || null };
      if (Object.keys(update).length === 0) throw new Error("nada para atualizar");
      const { error } = await admin.auth.admin.updateUserById(user_id, update as any);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_password") {
      const { user_id, password } = body;
      if (!user_id || !password) throw new Error("user_id e password obrigatórios");
      const { error } = await admin.auth.admin.updateUserById(user_id, { password });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) throw new Error("user_id obrigatório");
      if (user_id === userData.user.id) throw new Error("não é possível deletar a si mesmo");
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown_action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("admin-manage-users error", e);
    return new Response(JSON.stringify({ error: e?.message || "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
