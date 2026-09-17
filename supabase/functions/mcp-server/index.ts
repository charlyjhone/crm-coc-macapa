import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { setActivityContext } from "../_shared/activity-context.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const appBaseUrl = Deno.env.get("CRM_APP_BASE_URL") || "";

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getSupabase() {
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  setActivityContext(client, { source: "mcp", actor: "crm-assistant" }).catch(() => {});
  return client;
}

function withUrl<T extends { id?: string }>(row: T): T & { url?: string } {
  return appBaseUrl && row.id
    ? { ...row, url: `${appBaseUrl}/opportunity/${row.id}` }
    : row;
}

const app = new Hono();
app.use("*", async (context, next) => {
  const expected = Deno.env.get("MCP_SERVER_TOKEN") || "";
  const supplied = (context.req.header("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!safeEqual(expected, supplied)) {
    return context.json({ error: "unauthorized" }, 401);
  }
  await next();
});

const server = new McpServer({ name: "coc-macapa-crm", version: "2.0.0" });

server.tool("list_contacts", {
  description: "Lista contatos do CRM escolar com filtros básicos.",
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string" },
      triage_status: { type: "string" },
      assunto: { type: "string" },
      limit: { type: "number" },
      offset: { type: "number" },
    },
  },
  handler: async (args: any) => {
    const sb = getSupabase();
    const limit = Math.min(Math.max(Number(args.limit || 50), 1), 200);
    const offset = Math.max(Number(args.offset || 0), 0);
    let query = sb
      .from("leads")
      .select("id,name,email,phone,status,triage_status,assunto,interesse,triage_summary,handoff_at,created_at,updated_at")
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (args.status) query = query.eq("status", args.status);
    if (args.triage_status) query = query.eq("triage_status", args.triage_status);
    if (args.assunto) query = query.eq("assunto", args.assunto);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    return { content: [{ type: "text", text: JSON.stringify((data || []).map(withUrl), null, 2) }] };
  },
});

server.tool("get_contact", {
  description: "Retorna os dados de um contato do CRM escolar.",
  inputSchema: {
    type: "object",
    properties: { lead_id: { type: "string" } },
    required: ["lead_id"],
  },
  handler: async ({ lead_id }: any) => {
    const { data, error } = await getSupabase().from("leads").select("*").eq("id", lead_id).single();
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    return { content: [{ type: "text", text: JSON.stringify(withUrl(data), null, 2) }] };
  },
});

server.tool("search_contacts", {
  description: "Busca contatos por nome, e-mail ou telefone.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" }, limit: { type: "number" } },
    required: ["query"],
  },
  handler: async ({ query, limit }: any) => {
    const term = String(query || "").replace(/[%_,()]/g, " ").trim();
    if (term.length < 2) return { content: [{ type: "text", text: "Informe ao menos dois caracteres." }] };
    const max = Math.min(Math.max(Number(limit || 20), 1), 100);
    const { data, error } = await getSupabase()
      .from("leads")
      .select("id,name,email,phone,status,triage_status,assunto,updated_at")
      .or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .limit(max);
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    return { content: [{ type: "text", text: JSON.stringify((data || []).map(withUrl), null, 2) }] };
  },
});

server.tool("get_contact_history", {
  description: "Lê as mensagens recentes de WhatsApp, e-mail e notas de um contato.",
  inputSchema: {
    type: "object",
    properties: { lead_id: { type: "string" }, limit: { type: "number" } },
    required: ["lead_id"],
  },
  handler: async ({ lead_id, limit }: any) => {
    const sb = getSupabase();
    const max = Math.min(Math.max(Number(limit || 30), 1), 100);
    const [whatsapp, emails, notes] = await Promise.all([
      sb.from("whatsapp_messages").select("id,direction,message,timestamp,created_at").eq("lead_id", lead_id).order("created_at", { ascending: false }).limit(max),
      sb.from("email_messages").select("id,direction,subject,message,timestamp,created_at").eq("lead_id", lead_id).order("created_at", { ascending: false }).limit(max),
      sb.from("lead_notes").select("id,note,created_at").eq("lead_id", lead_id).order("created_at", { ascending: false }).limit(max),
    ]);
    const error = whatsapp.error || emails.error || notes.error;
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    return { content: [{ type: "text", text: JSON.stringify({
      whatsapp: whatsapp.data || [],
      emails: emails.data || [],
      notes: notes.data || [],
    }, null, 2) }] };
  },
});

server.tool("update_contact", {
  description: "Atualiza somente campos permitidos de um contato escolar.",
  inputSchema: {
    type: "object",
    properties: {
      lead_id: { type: "string" },
      name: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      status: { type: "string" },
      triage_status: { type: "string" },
      assunto: { type: "string" },
      interesse: { type: "string" },
    },
    required: ["lead_id"],
  },
  handler: async (args: any) => {
    const allowed = ["name", "email", "phone", "status", "triage_status", "assunto", "interesse"];
    const update: Record<string, unknown> = {};
    for (const key of allowed) if (args[key] !== undefined) update[key] = args[key];
    if (Object.keys(update).length === 0) return { content: [{ type: "text", text: "Nenhum campo permitido informado." }] };
    update.updated_at = new Date().toISOString();
    const { data, error } = await getSupabase().from("leads").update(update).eq("id", args.lead_id).select("id,name,status,triage_status,assunto,interesse,updated_at").single();
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    return { content: [{ type: "text", text: JSON.stringify(withUrl(data), null, 2) }] };
  },
});

server.tool("add_contact_note", {
  description: "Adiciona uma nota interna ao contato.",
  inputSchema: {
    type: "object",
    properties: { lead_id: { type: "string" }, note: { type: "string" } },
    required: ["lead_id", "note"],
  },
  handler: async ({ lead_id, note }: any) => {
    const clean = String(note || "").trim();
    if (!clean) return { content: [{ type: "text", text: "A nota não pode estar vazia." }] };
    const { data, error } = await getSupabase().from("lead_notes").insert({ lead_id, note: clean }).select("id,lead_id,note,created_at").single();
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
});

const transport = new StreamableHttpTransport();
const handleRequest = transport.bind(server);
app.all("/*", async (context) => handleRequest(context.req.raw));

Deno.serve(app.fetch);
