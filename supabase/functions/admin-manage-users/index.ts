import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type UserRoleRow = { user_id: string; role: string };
type UserPresenceRow = { user_id: string; last_seen_at: string; last_path: string | null };
type ActivityLogRow = {
  id: string;
  lead_id: string;
  activity_type: string;
  description: string;
  source: string;
  actor: string | null;
  created_at: string;
};
type LeadNameRow = { id: string; name: string };
type UserUpdateAttributes = {
  email?: string;
  password?: string;
  user_metadata?: Record<string, unknown>;
};

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
    const body = await req.json();
    const action = body.action as string;

    // Perfil próprio é permitido para qualquer usuário autenticado. As demais
    // ações continuam restritas a administradores.
    const { data: isAdminData } = await admin.rpc("is_admin", { _user_id: userData.user.id });
    if (!isAdminData && action !== "update_own_profile") {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const beginAudit = async (event: {
      operation: "INSERT" | "UPDATE" | "DELETE";
      table_name: string;
      record_id?: string | null;
      entity_label?: string | null;
      changed_fields: string[];
    }) => {
      const { data, error } = await admin
        .from("audit_logs")
        .insert({
          actor_id: userData.user.id,
          actor_email: userData.user.email || null,
          operation: event.operation,
          schema_name: "auth",
          table_name: event.table_name,
          record_id: event.record_id || null,
          entity_label: event.entity_label || null,
          changed_fields: event.changed_fields,
          outcome: "started",
        })
        .select("id")
        .single();
      if (error || !data) {
        throw new Error("Não foi possível registrar a auditoria. Nenhuma alteração foi aplicada.");
      }
      return data.id as string;
    };

    const finishAudit = async (auditId: string, outcome: "success" | "failed", recordId?: string) => {
      const update: Record<string, unknown> = { outcome };
      if (recordId) update.record_id = recordId;
      const { error } = await admin.from("audit_logs").update(update).eq("id", auditId);
      if (error) {
        // O evento iniciado permanece visível para o administrador se o
        // fechamento da operação não puder ser gravado.
        console.error("admin-manage-users could not finish audit event", error);
        return false;
      }
      return true;
    };

    if (action === "list") {
      const { data: usersList, error } = await admin.auth.admin.listUsers({ perPage: 200 });
      if (error) throw error;
      const ids = (usersList.users || []).map((u) => u.id);
      const [{ data: roles }, { data: presence }] = await Promise.all([
        admin.from("user_roles").select("user_id, role").in("user_id", ids),
        admin.from("user_presence").select("user_id, last_seen_at, last_path").in("user_id", ids),
      ]);
      const rolesMap = new Map<string, string[]>();
      ((roles || []) as UserRoleRow[]).forEach((r) => {
        const arr = rolesMap.get(r.user_id) || [];
        arr.push(r.role);
        rolesMap.set(r.user_id, arr);
      });
      const presenceMap = new Map<string, { last_seen_at: string; last_path: string | null }>();
      ((presence || []) as UserPresenceRow[]).forEach((p) => presenceMap.set(p.user_id, { last_seen_at: p.last_seen_at, last_path: p.last_path }));
      const users = (usersList.users || []).map((u) => {
        const metadata = (u.user_metadata || {}) as Record<string, unknown>;
        const lastSignIn = (u as unknown as { last_sign_in_at?: string }).last_sign_in_at || null;
        return {
          id: u.id,
          email: u.email,
          name: typeof metadata.full_name === "string" ? metadata.full_name : null,
          created_at: u.created_at,
          last_sign_in_at: lastSignIn,
          last_seen_at: presenceMap.get(u.id)?.last_seen_at || null,
          last_path: presenceMap.get(u.id)?.last_path || null,
          roles: rolesMap.get(u.id) || [],
        };
      });
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
      const activityRows = (activities || []) as ActivityLogRow[];
      const leadIds = Array.from(new Set(activityRows.map((a) => a.lead_id).filter(Boolean)));
      const leadsMap = new Map<string, string>();
      if (leadIds.length > 0) {
        const { data: leads } = await admin.from("leads").select("id, name").in("id", leadIds);
        ((leads || []) as LeadNameRow[]).forEach((l) => leadsMap.set(l.id, l.name));
      }
      const enriched = activityRows.map((a) => ({
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
      const normalizedEmail = String(email).trim();
      const auditId = await beginAudit({
        operation: "INSERT",
        table_name: "users",
        entity_label: normalizedEmail,
        changed_fields: ["email", ...(name ? ["full_name"] : []), "role"],
      });
      try {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: normalizedEmail,
          password,
          email_confirm: true,
          user_metadata: name ? { full_name: name } : undefined,
        });
        if (createErr) throw createErr;
        const newUserId = created.user.id;
        const { error: roleErr } = await admin.from("user_roles").insert({ user_id: newUserId, role: "user" });
        if (roleErr) throw roleErr;
        await finishAudit(auditId, "success", newUserId);
        return new Response(JSON.stringify({ ok: true, user_id: newUserId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        await finishAudit(auditId, "failed");
        throw error;
      }
    }

    if (action === "update_profile") {
      const { user_id, name, email } = body;
      if (!user_id) throw new Error("user_id obrigatório");
      const { data: before, error: beforeErr } = await admin.auth.admin.getUserById(user_id);
      if (beforeErr || !before.user) throw beforeErr || new Error("usuário não encontrado");
      const update: Record<string, unknown> = {};
      if (typeof email === "string" && email.trim()) update.email = email.trim();
      if (typeof name === "string") update.user_metadata = { full_name: name.trim() || null };
      if (Object.keys(update).length === 0) throw new Error("nada para atualizar");
      const changedFields: string[] = [];
      if (typeof update.email === "string" && update.email.toLowerCase() !== (before.user.email || "").toLowerCase()) {
        changedFields.push("email");
      }
      if (
        typeof update.user_metadata === "object" &&
        (update.user_metadata as Record<string, unknown>).full_name !==
          ((before.user.user_metadata as Record<string, unknown> | undefined)?.full_name || null)
      ) {
        changedFields.push("full_name");
      }
      if (changedFields.length === 0) {
        return new Response(JSON.stringify({ ok: true, unchanged: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const auditId = await beginAudit({
        operation: "UPDATE",
        table_name: "users",
        record_id: user_id,
        entity_label: before.user.email || null,
        changed_fields: changedFields,
      });
      try {
        const { error } = await admin.auth.admin.updateUserById(user_id, update as UserUpdateAttributes);
        if (error) throw error;
        await finishAudit(auditId, "success", user_id);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        await finishAudit(auditId, "failed", user_id);
        throw error;
      }
    }

    if (action === "update_password") {
      const { user_id, password } = body;
      if (!user_id || !password) throw new Error("user_id e password obrigatórios");
      const { data: target, error: targetErr } = await admin.auth.admin.getUserById(user_id);
      if (targetErr || !target.user) throw targetErr || new Error("usuário não encontrado");
      const auditId = await beginAudit({
        operation: "UPDATE",
        table_name: "users",
        record_id: user_id,
        entity_label: target.user.email || null,
        changed_fields: ["password"],
      });
      try {
        const { error } = await admin.auth.admin.updateUserById(user_id, { password });
        if (error) throw error;
        await finishAudit(auditId, "success", user_id);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        await finishAudit(auditId, "failed", user_id);
        throw error;
      }
    }

    if (action === "update_own_profile") {
      const { name, password } = body;
      if (typeof name !== "string" && typeof password !== "string") {
        throw new Error("Informe um nome ou uma nova senha");
      }
      if (typeof name === "string" && name.trim().length > 100) {
        throw new Error("O nome deve ter até 100 caracteres");
      }
      if (typeof password === "string" && password.length > 0 && password.length < 8) {
        throw new Error("A senha deve ter pelo menos 8 caracteres");
      }

      const metadata = (userData.user.user_metadata || {}) as Record<string, unknown>;
      const update: Record<string, unknown> = {};
      const changedFields: string[] = [];
      if (typeof name === "string") {
        const normalizedName = name.trim();
        if ((metadata.full_name || null) !== (normalizedName || null)) {
          update.user_metadata = { ...metadata, full_name: normalizedName || null };
          changedFields.push("full_name");
        }
      }
      if (typeof password === "string" && password.length > 0) {
        update.password = password;
        changedFields.push("password");
      }
      if (changedFields.length === 0) {
        return new Response(JSON.stringify({ ok: true, unchanged: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const auditId = await beginAudit({
        operation: "UPDATE",
        table_name: "users",
        record_id: userData.user.id,
        entity_label: userData.user.email || null,
        changed_fields: changedFields,
      });
      try {
        const { error } = await admin.auth.admin.updateUserById(userData.user.id, update as UserUpdateAttributes);
        if (error) throw error;
        await finishAudit(auditId, "success", userData.user.id);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        await finishAudit(auditId, "failed", userData.user.id);
        throw error;
      }
    }

    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) throw new Error("user_id obrigatório");
      if (user_id === userData.user.id) throw new Error("não é possível deletar a si mesmo");
      const { data: target, error: targetErr } = await admin.auth.admin.getUserById(user_id);
      if (targetErr || !target.user) throw targetErr || new Error("usuário não encontrado");
      const auditId = await beginAudit({
        operation: "DELETE",
        table_name: "users",
        record_id: user_id,
        entity_label: target.user.email || null,
        changed_fields: ["account"],
      });
      try {
        const { error } = await admin.auth.admin.deleteUser(user_id);
        if (error) throw error;
        await finishAudit(auditId, "success", user_id);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        await finishAudit(auditId, "failed", user_id);
        throw error;
      }
    }

    return new Response(JSON.stringify({ error: "unknown_action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    console.error("admin-manage-users error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
