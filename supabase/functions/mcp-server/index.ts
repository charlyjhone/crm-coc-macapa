import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { setActivityContext } from "../_shared/activity-context.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getSupabase() {
  const client = createClient(supabaseUrl, supabaseServiceKey);
  // Marca todas as ações via MCP no log de atividade
  setActivityContext(client, { source: 'mcp', actor: 'manus' }).catch(() => {});
  return client;
}

const APP_BASE_URL = "https://autolead.inventormiguel.com";
const leadUrl = (id: string) => `${APP_BASE_URL}/opportunity/${id}`;
function withLeadUrl<T extends { id?: string } | null | undefined>(row: T): T {
  if (!row || !row.id) return row;
  return { ...row, url: leadUrl(row.id) } as T;
}
function withLeadUrls<T extends { id?: string }>(rows: T[] | null): T[] {
  if (!rows) return [] as T[];
  return rows.map((r) => withLeadUrl(r));
}

// Enriquece com métricas de tempo de resposta (dias sem cliente responder).
function withResponseMetrics<T extends { last_inbound_message_at?: string | null; last_outbound_message_at?: string | null } | null | undefined>(row: T): T {
  if (!row) return row;
  const lastIn = row.last_inbound_message_at ? new Date(row.last_inbound_message_at).getTime() : 0;
  const lastOut = row.last_outbound_message_at ? new Date(row.last_outbound_message_at).getTime() : 0;
  const now = Date.now();
  const daysSinceLastInbound = lastIn ? Math.floor((now - lastIn) / 86400000) : null;
  const waitingForClient = lastOut > lastIn;
  const daysWaitingForClient = waitingForClient
    ? Math.floor((now - lastOut) / 86400000)
    : 0;
  return { ...row, days_since_last_inbound: daysSinceLastInbound, waiting_for_client: waitingForClient, days_waiting_for_client: daysWaitingForClient } as T;
}
function withResponseMetricsAll<T extends { last_inbound_message_at?: string | null; last_outbound_message_at?: string | null }>(rows: T[] | null): T[] {
  if (!rows) return [] as T[];
  return rows.map((r) => withResponseMetrics(r));
}

// --- Telefone WhatsApp: mensagens são associadas ao número, não ao lead.
// Mesma lógica de variantes do banco (whatsapp_phone_variants) e do frontend (src/lib/whatsappPhone.ts).
function getPhoneVariants(phone?: string | null): string[] {
  const digits = (phone || "").toString().replace(/\D/g, "");
  if (!digits) return [];
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  const variants = new Set<string>([digits, local, `55${local}`]);
  const without9 = local.length === 11 && local[2] === "9" ? `${local.slice(0, 2)}${local.slice(3)}` : null;
  const with9 = local.length === 10 && local[2] !== "9" ? `${local.slice(0, 2)}9${local.slice(2)}` : null;
  [without9, with9].filter(Boolean).forEach((v) => {
    variants.add(v as string);
    variants.add(`55${v}`);
  });
  return Array.from(variants);
}

async function getLeadPhoneVariants(sb: any, leadId: string): Promise<string[]> {
  const { data } = await sb.from("leads").select("phone, phones").eq("id", leadId).maybeSingle();
  if (!data) return [];
  const list = [data.phone, ...(data.phones || [])].filter(Boolean) as string[];
  return Array.from(new Set(list.flatMap(getPhoneVariants)));
}

// Enriquece mensagens WhatsApp com URLs públicas/assinadas dos anexos vinculados
async function attachAttachmentUrls(sb: any, messages: any[]): Promise<any[]> {
  if (!messages || messages.length === 0) return messages || [];
  const ids = messages.map((m: any) => m.id).filter(Boolean);
  if (ids.length === 0) return messages;
  const { data: atts } = await sb.from("email_attachments")
    .select("id, whatsapp_message_id, filename, content_type, size_bytes, storage_path")
    .in("whatsapp_message_id", ids);
  const map = new Map<string, any[]>();
  for (const a of atts || []) {
    const path = (a.storage_path || "").startsWith("whatsapp-attachments/")
      ? a.storage_path.slice("whatsapp-attachments/".length)
      : a.storage_path;
    let url: string | null = null;
    try {
      const { data: pub } = sb.storage.from("whatsapp-attachments").getPublicUrl(path);
      url = pub?.publicUrl || null;
    } catch (_) { url = null; }
    if (!url) {
      try {
        const { data: signed } = await sb.storage.from("whatsapp-attachments").createSignedUrl(path, 60 * 60 * 24 * 7);
        url = signed?.signedUrl || null;
      } catch (_) {}
    }
    const entry = {
      id: a.id,
      filename: a.filename,
      content_type: a.content_type,
      size_bytes: a.size_bytes,
      url,
    };
    const arr = map.get(a.whatsapp_message_id) || [];
    arr.push(entry);
    map.set(a.whatsapp_message_id, arr);
  }
  return messages.map((m: any) => ({ ...m, attachments: map.get(m.id) || [] }));
}

const app = new Hono();

const mcpServer = new McpServer({
  name: "autolead-mcp",
  version: "1.0.0",
});

// --- list_leads ---
mcpServer.tool("list_leads", {
  description: "Lista leads/oportunidades com filtros. Inclui contadores de mensagens, last_inbound_message_at, last_outbound_message_at, days_since_last_inbound (dias desde a última msg do cliente) e waiting_for_client/days_waiting_for_client (quantos dias o cliente está sem responder desde nosso último contato).",
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string", description: "Filtrar por status: em_aberto, em_negociacao, ganho, perdido, entregue, produzido" },
      produto: { type: "string", description: "Filtrar por produto" },
      archived: { type: "boolean", description: "Filtrar por arquivado (default false)" },
      limit: { type: "number", description: "Máximo de resultados (default 50, max 200)" },
      offset: { type: "number", description: "Offset para paginação (default 0)" },
    },
  },
  handler: async (args: any) => {
    const { status, produto, archived, limit, offset } = args;
    const sb = getSupabase();
    let query = sb.from("leads").select("id, name, status, valor, moeda, produto, description, email, phone, created_at, updated_at, source, origem, ai_diagnosis, ai_close_probability, last_inbound_message_at, last_outbound_message_at, email_inbound_count, email_outbound_count, whatsapp_inbound_count, whatsapp_outbound_count")
      .eq("archived", archived ?? false)
      .order("created_at", { ascending: false })
      .range(offset ?? 0, (offset ?? 0) + Math.min(limit ?? 50, 200) - 1);

    if (status) query = query.eq("status", status);
    if (produto) query = query.eq("produto", produto);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    return { content: [{ type: "text", text: JSON.stringify(withResponseMetricsAll(withLeadUrls(data as any[])), null, 2) }] };
  },
});

// --- get_lead ---
mcpServer.tool("get_lead", {
  description: "Retorna todos os detalhes de um lead por ID, incluindo days_since_last_inbound e days_waiting_for_client.",
  inputSchema: {
    type: "object",
    properties: {
      lead_id: { type: "string", description: "UUID do lead" },
    },
    required: ["lead_id"],
  },
  handler: async (args: any) => {
    const { lead_id } = args;
    const sb = getSupabase();
    const { data, error } = await sb.from("leads").select("*").eq("id", lead_id).single();
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    return { content: [{ type: "text", text: JSON.stringify(withResponseMetrics(withLeadUrl(data as any)), null, 2) }] };
  },
});

// --- search_leads ---
mcpServer.tool("search_leads", {
  description: "Busca leads por nome ou email (busca parcial, case-insensitive).",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Termo de busca (nome ou email)" },
      limit: { type: "number", description: "Máximo de resultados (default 20)" },
    },
    required: ["query"],
  },
  handler: async (args: any) => {
    const { query, limit } = args;
    const sb = getSupabase();
    const maxResults = Math.min(limit ?? 20, 100);
    const { data, error } = await sb.from("leads")
      .select("id, name, status, valor, moeda, produto, email, phone, created_at")
      .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
      .order("created_at", { ascending: false })
      .limit(maxResults);
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    return { content: [{ type: "text", text: JSON.stringify(withLeadUrls(data as any[]), null, 2) }] };
  },
});

// --- list_duplicate_candidates ---
mcpServer.tool("list_duplicate_candidates", {
  description: "Lista possíveis oportunidades duplicadas com pontuação e evidências. Somente same_rfc_message_id permite merge automático; email/telefone iguais exigem revisão humana.",
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string", description: "pending, merged, dismissed ou failed (default pending)" },
      min_score: { type: "integer", description: "Pontuação mínima (default 0)" },
      limit: { type: "integer", description: "Máximo de resultados (default 50, max 200)" },
    },
  },
  handler: async (args: any) => {
    const sb = getSupabase();
    const maxResults = Math.min(Math.max(Number(args.limit ?? 50), 1), 200);
    let query = sb.from("lead_duplicate_candidates")
      .select("id, lead_a_id, lead_b_id, score, reasons, auto_merge_eligible, status, detected_at, reviewed_at, merged_into_id, last_error")
      .eq("status", args.status ?? "pending")
      .gte("score", Number(args.min_score ?? 0))
      .order("score", { ascending: false })
      .order("detected_at", { ascending: false })
      .limit(maxResults);

    const { data: candidates, error } = await query;
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };

    const leadIds = Array.from(new Set((candidates || []).flatMap((c: any) => [c.lead_a_id, c.lead_b_id])));
    const { data: leads, error: leadsError } = leadIds.length
      ? await sb.from("leads").select("id, name, email, phone, status, produto, valor, moeda, created_at").in("id", leadIds)
      : { data: [], error: null };
    if (leadsError) return { content: [{ type: "text", text: `Erro: ${leadsError.message}` }] };

    const byId = new Map((leads || []).map((lead: any) => [lead.id, withLeadUrl(lead)]));
    const enriched = (candidates || []).map((candidate: any) => ({
      ...candidate,
      lead_a: byId.get(candidate.lead_a_id) || null,
      lead_b: byId.get(candidate.lead_b_id) || null,
      decision_rule: candidate.auto_merge_eligible
        ? "auto_merge_same_rfc_message_id"
        : "manual_review_required",
    }));
    return { content: [{ type: "text", text: JSON.stringify({ count: enriched.length, results: enriched }, null, 2) }] };
  },
});

// --- merge_leads ---
mcpServer.tool("merge_leads", {
  description: "Junta duas oportunidades duplicadas numa só, sem perder nenhuma informação. Todo o histórico (e-mails, WhatsApp, notas, atividades, reuniões, anexos, entregas) do lead duplicado é movido para o lead principal; e-mails/telefones/LIDs são unidos; campos vazios do principal são preenchidos com os do duplicado; o duplicado é removido. Use quando o mesmo cliente/negócio virou dois leads (ex.: cliente escreveu de outro endereço da mesma empresa).",
  inputSchema: {
    type: "object",
    properties: {
      primary_lead_id: { type: "string", description: "UUID do lead que será MANTIDO (o 'verdadeiro' — normalmente o mais completo/antigo ou o que tem o status certo)" },
      duplicate_lead_id: { type: "string", description: "UUID do lead duplicado que será absorvido e removido" },
    },
    required: ["primary_lead_id", "duplicate_lead_id"],
  },
  handler: async (args: any) => {
    const { primary_lead_id, duplicate_lead_id } = args;
    const sb = getSupabase();
    const fail = (msg: string) => ({ content: [{ type: "text", text: `Erro: ${msg}` }] });

    if (!primary_lead_id || !duplicate_lead_id) return fail("informe primary_lead_id e duplicate_lead_id");
    if (primary_lead_id === duplicate_lead_id) return fail("os dois ids são o mesmo lead");

    const { data: primary, error: e1 } = await sb.from("leads").select("*").eq("id", primary_lead_id).maybeSingle();
    if (e1 || !primary) return fail(`lead principal não encontrado: ${e1?.message || primary_lead_id}`);
    const { data: dup, error: e2 } = await sb.from("leads").select("*").eq("id", duplicate_lead_id).maybeSingle();
    if (e2 || !dup) return fail(`lead duplicado não encontrado: ${e2?.message || duplicate_lead_id}`);

    const moved: Record<string, number> = {};

    // 1) scheduled_followups tem unique(lead_id): remove a fila do duplicado
    //    (o followup-engine recalcula a do principal sozinho na próxima execução)
    await sb.from("scheduled_followups").delete().eq("lead_id", duplicate_lead_id);

    // 2) E-mails podem existir nos dois leads com o mesmo Message-ID. Mover em
    // bloco violava o índice único e deixava o merge interrompido no meio.
    // Consolida primeiro somente as cópias RFC realmente idênticas.
    const { data: duplicateEmails, error: duplicateEmailsError } = await sb
      .from("email_messages")
      .select("id, internet_message_id")
      .eq("lead_id", duplicate_lead_id)
      .not("internet_message_id", "is", null);
    if (duplicateEmailsError) return fail(`falha ao preparar dedupe de e-mails: ${duplicateEmailsError.message}`);

    let consolidatedEmails = 0;
    for (const duplicateEmail of duplicateEmails || []) {
      const { data: matchingPrimary, error: matchError } = await sb
        .from("email_messages")
        .select("id")
        .eq("lead_id", primary_lead_id)
        .ilike("internet_message_id", duplicateEmail.internet_message_id)
        .maybeSingle();
      if (matchError) return fail(`falha ao comparar Message-ID: ${matchError.message}`);
      if (!matchingPrimary) continue;

      // Preserva anexos que porventura estejam vinculados somente à cópia.
      const { error: attachmentError } = await sb
        .from("email_attachments")
        .update({ email_message_id: matchingPrimary.id, lead_id: primary_lead_id })
        .eq("email_message_id", duplicateEmail.id);
      if (attachmentError) return fail(`falha ao preservar anexos de e-mail duplicado: ${attachmentError.message}`);

      const { error: deleteEmailError } = await sb
        .from("email_messages")
        .delete()
        .eq("id", duplicateEmail.id);
      if (deleteEmailError) return fail(`falha ao consolidar e-mail duplicado: ${deleteEmailError.message}`);
      consolidatedEmails++;
    }

    // 3) Move os registros filhos restantes para o principal
    const tables = [
      "whatsapp_messages", "email_messages", "lead_notes", "activity_log",
      "meetings", "worker_actions", "delivery_logs", "email_attachments",
    ];
    for (const table of tables) {
      const { data: rows, error } = await sb
        .from(table)
        .update({ lead_id: primary_lead_id })
        .eq("lead_id", duplicate_lead_id)
        .select("id");
      if (error) return fail(`falha ao migrar ${table}: ${error.message} (merge interrompido — nada foi apagado)`);
      moved[table] = rows?.length || 0;
    }
    if (consolidatedEmails > 0) moved.email_messages_consolidated = consolidatedEmails;

    // 4) União de contatos + preenche lacunas do principal com dados do duplicado
    const isPlaceholder = (e: string | null) => !e || e.toLowerCase().endsWith("@whatsapp.temp");
    const union = (a: string[] | null, b: string[] | null) =>
      Array.from(new Set([...(a || []), ...(b || [])].map((x) => (x || "").trim()).filter(Boolean)));

    const mergedEmails = union(primary.emails, dup.emails);
    const realEmails = mergedEmails.filter((e: string) => !isPlaceholder(e));
    const update: Record<string, unknown> = {
      emails: mergedEmails,
      phones: union(primary.phones, dup.phones),
      whatsapp_chat_lids: union(primary.whatsapp_chat_lids, dup.whatsapp_chat_lids),
    };
    if (isPlaceholder(primary.email) && realEmails.length > 0) update.email = realEmails[0];
    if (!primary.phone && dup.phone) update.phone = dup.phone;
    // Campos escalares: preenche apenas o que está vazio no principal
    const fillIfNull = [
      "description", "valor", "moeda", "produto", "publicidade_subtipo", "publicidade_quantidade",
      "language", "profile_picture_url", "proposal_url", "proposal_sent_at",
      "data_proximo_pagamento", "suggested_followup", "origem", "source", "message",
    ];
    for (const f of fillIfNull) {
      if ((primary[f] === null || primary[f] === undefined || primary[f] === "" || primary[f] === 0) && dup[f]) {
        update[f] = dup[f];
      }
    }
    if (dup.is_recurring) update.is_recurring = true;
    if ((primary.valor_pago || 0) === 0 && (dup.valor_pago || 0) > 0) update.valor_pago = dup.valor_pago;

    const { error: eUp } = await sb.from("leads").update(update).eq("id", primary_lead_id);
    if (eUp) return fail(`falha ao atualizar lead principal: ${eUp.message} (histórico já migrado; duplicado NÃO foi apagado)`);

    // 5) Nota de auditoria no principal
    await sb.from("lead_notes").insert({
      lead_id: primary_lead_id,
      note: `[Sistema] Merge: a oportunidade "${dup.name}" (${dup.email || "sem e-mail"}, status ${dup.status || "?"}, criada em ${new Date(dup.created_at).toLocaleDateString("pt-BR")}) foi incorporada a esta. Histórico migrado: ${Object.entries(moved).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${t}`).join(", ") || "nenhum registro filho"}.`,
    });

    // 6) Remove o duplicado e recalcula o cache unificado do principal
    const { error: eDel } = await sb.from("leads").delete().eq("id", duplicate_lead_id);
    if (eDel) return fail(`histórico migrado, mas falha ao remover o duplicado: ${eDel.message}`);
    try {
      await sb.rpc("recompute_lead_whatsapp_cache", { p_lead_id: primary_lead_id });
    } catch (_) { /* trigger de mensagens cobre depois */ }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          kept: { id: primary_lead_id, name: primary.name },
          absorbed: { id: duplicate_lead_id, name: dup.name },
          migrated: moved,
          merged_fields: Object.keys(update),
          url: `https://autolead.inventormiguel.com/opportunity/${primary_lead_id}`,
        }, null, 2),
      }],
    };
  },
});

// --- get_lead_emails ---
mcpServer.tool("get_lead_emails", {
  description: "Retorna o histórico de emails de um lead. Suporta paginação para varrer TODAS as mensagens — chame repetidamente incrementando `offset` até `has_more=false`.",
  inputSchema: {
    type: "object",
    properties: {
      lead_id: { type: "string", description: "UUID do lead" },
      limit: { type: "number", description: "Tamanho da página (default 50, max 200)" },
      offset: { type: "number", description: "Offset para paginar (default 0). As mensagens vêm ordenadas das mais recentes para as mais antigas." },
    },
    required: ["lead_id"],
  },
  handler: async (args: any) => {
    const { lead_id } = args;
    const limit = Math.min(Math.max(Number(args.limit ?? 50), 1), 200);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    const sb = getSupabase();
    const { data, error, count } = await sb.from("email_messages")
      .select("id, subject, message, direction, timestamp, created_at", { count: "exact" })
      .eq("lead_id", lead_id)
      .order("timestamp", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    const returned = data?.length ?? 0;
    const total = count ?? (offset + returned);
    const hasMore = offset + returned < total;
    return { content: [{ type: "text", text: JSON.stringify({
      total, returned, offset, limit, has_more: hasMore,
      next_offset: hasMore ? offset + returned : null,
      results: data,
    }, null, 2) }] };
  },
});

// --- list_inbox_emails ---
mcpServer.tool("list_inbox_emails", {
  description: "Lista emails do inbox geral (todos os leads). Por padrão retorna apenas inbound (recebidos pela Susan). Suporta paginação, filtro por direção, busca textual em assunto/corpo/remetente, e filtro por intervalo de datas. Inclui lead_id quando o email está associado a um lead.",
  inputSchema: {
    type: "object",
    properties: {
      direction: { type: "string", description: "inbound | outbound | all (default inbound)" },
      query: { type: "string", description: "Busca parcial em subject, message ou raw_data (case-insensitive)" },
      since: { type: "string", description: "ISO date — retorna apenas emails com timestamp >= since" },
      until: { type: "string", description: "ISO date — retorna apenas emails com timestamp <= until" },
      only_unlinked: { type: "boolean", description: "Se true, retorna apenas emails sem lead_id (órfãos)" },
      limit: { type: "number", description: "Tamanho da página (default 50, max 200)" },
      offset: { type: "number", description: "Offset para paginar (default 0)" },
    },
  },
  handler: async (args: any) => {
    const limit = Math.min(Math.max(Number(args.limit ?? 50), 1), 200);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    const direction = (args.direction || "inbound").toLowerCase();
    const sb = getSupabase();
    let q = sb.from("email_messages")
      .select("id, lead_id, subject, message, direction, timestamp, created_at, raw_data", { count: "exact" })
      .order("timestamp", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (direction !== "all") q = q.eq("direction", direction);
    if (args.since) q = q.gte("timestamp", args.since);
    if (args.until) q = q.lte("timestamp", args.until);
    if (args.only_unlinked) q = q.is("lead_id", null);
    if (args.query) {
      const term = String(args.query).replace(/%/g, "");
      q = q.or(`subject.ilike.%${term}%,message.ilike.%${term}%`);
    }
    const { data, error, count } = await q.range(offset, offset + limit - 1);
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    const results = (data || []).map((r: any) => {
      const raw = r.raw_data || {};
      const from = raw["envelope[from]"] || raw["headers[From]"] || raw["headers[from]"] || raw.from || null;
      const to = raw["envelope[to]"] || raw["headers[To]"] || raw["headers[to]"] || raw.to || null;
      return {
        id: r.id,
        lead_id: r.lead_id,
        direction: r.direction,
        timestamp: r.timestamp || r.created_at,
        subject: r.subject,
        from,
        to,
        preview: (r.message || "").substring(0, 400),
      };
    });
    const total = count ?? (offset + results.length);
    const hasMore = offset + results.length < total;
    return { content: [{ type: "text", text: JSON.stringify({
      total, returned: results.length, offset, limit, has_more: hasMore,
      next_offset: hasMore ? offset + results.length : null,
      results,
    }, null, 2) }] };
  },
});

// --- get_email ---
mcpServer.tool("get_email", {
  description: "Retorna o conteúdo completo de um email específico do inbox (incluindo html_body e raw_data).",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "UUID do email_message" } },
    required: ["id"],
  },
  handler: async (args: any) => {
    const sb = getSupabase();
    const { data, error } = await sb.from("email_messages").select("*").eq("id", args.id).maybeSingle();
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    if (!data) return { content: [{ type: "text", text: "Email não encontrado" }] };
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
});



// --- get_lead_whatsapp ---
mcpServer.tool("get_lead_whatsapp", {
  description: "Retorna o histórico de mensagens WhatsApp de um lead. Suporta paginação para varrer TODAS as mensagens — chame repetidamente incrementando `offset` até `has_more=false`.",
  inputSchema: {
    type: "object",
    properties: {
      lead_id: { type: "string", description: "UUID do lead" },
      limit: { type: "number", description: "Tamanho da página (default 50, max 200)" },
      offset: { type: "number", description: "Offset para paginar (default 0). As mensagens vêm ordenadas das mais recentes para as mais antigas." },
    },
    required: ["lead_id"],
  },
  handler: async (args: any) => {
    const { lead_id } = args;
    const limit = Math.min(Math.max(Number(args.limit ?? 50), 1), 200);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    const sb = getSupabase();
    const variants = await getLeadPhoneVariants(sb, lead_id);
    if (variants.length === 0) {
      return { content: [{ type: "text", text: JSON.stringify({ total: 0, returned: 0, offset, limit, has_more: false, next_offset: null, results: [] }, null, 2) }] };
    }
    const { data, error, count } = await sb.from("whatsapp_messages")
      .select("id, message, direction, phone, timestamp, is_audio, created_at", { count: "exact" })
      .in("phone", variants)
      .order("timestamp", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    const enriched = await attachAttachmentUrls(sb, data || []);
    const returned = enriched.length;
    const total = count ?? (offset + returned);
    const hasMore = offset + returned < total;
    return { content: [{ type: "text", text: JSON.stringify({
      total, returned, offset, limit, has_more: hasMore,
      next_offset: hasMore ? offset + returned : null,
      results: enriched,
    }, null, 2) }] };
  },
});

// --- search_whatsapp_messages ---
mcpServer.tool("search_whatsapp_messages", {
  description: "Busca texto livre em TODAS as mensagens de WhatsApp (inbound e outbound). Mensagens são indexadas por número de telefone — quando lead_id é informado, filtra pelos telefones do lead.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Texto a buscar (case-insensitive, substring)" },
      direction: { type: "string", enum: ["inbound", "outbound"], description: "Filtrar por direção (opcional)" },
      lead_id: { type: "string", description: "Restringir aos telefones de um lead específico (opcional)" },
      since: { type: "string", description: "ISO date — mensagens a partir desta data (opcional)" },
      until: { type: "string", description: "ISO date — mensagens até esta data (opcional)" },
      limit: { type: "number", description: "Máximo de resultados (default 50, max 200)" },
    },
    required: ["query"],
  },
  handler: async (args: any) => {
    const { query, direction, lead_id, since, until, limit } = args;
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return { content: [{ type: "text", text: "Erro: query deve ter pelo menos 2 caracteres." }] };
    }
    const sb = getSupabase();
    const escaped = query.trim().replace(/[\\%_]/g, (m) => `\\${m}`);
    let q = sb.from("whatsapp_messages")
      .select("id, message, direction, phone, timestamp, is_audio, created_at")
      .ilike("message", `%${escaped}%`)
      .order("timestamp", { ascending: false, nullsFirst: false })
      .limit(Math.min(limit ?? 50, 200));
    if (direction) q = q.eq("direction", direction);
    if (lead_id) {
      const variants = await getLeadPhoneVariants(sb, lead_id);
      if (variants.length === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ count: 0, results: [] }, null, 2) }] };
      }
      q = q.in("phone", variants);
    }
    if (since) q = q.gte("timestamp", since);
    if (until) q = q.lte("timestamp", until);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    const enriched = await attachAttachmentUrls(getSupabase(), data || []);
    return { content: [{ type: "text", text: JSON.stringify({ count: enriched.length, results: enriched }, null, 2) }] };
  },
});



// --- get_lead_notes ---
mcpServer.tool("get_lead_notes", {
  description: "Retorna as notas de um lead.",
  inputSchema: {
    type: "object",
    properties: {
      lead_id: { type: "string", description: "UUID do lead" },
    },
    required: ["lead_id"],
  },
  handler: async (args: any) => {
    const { lead_id } = args;
    const sb = getSupabase();
    const { data, error } = await sb.from("lead_notes")
      .select("id, note, created_at, updated_at")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false });
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
});

// --- update_lead ---
mcpServer.tool("update_lead", {
  description: "Atualiza campos cadastrais e o diagnóstico comercial de um lead. Para email/phone: define como principal e adiciona ao array de emails/phones do lead (dedup). Valor informado manualmente fica protegido contra sobrescrita automática.",
  inputSchema: {
    type: "object",
    properties: {
      lead_id: { type: "string", description: "UUID do lead" },
      name: { type: "string", description: "Novo nome do cliente" },
      status: { type: "string", description: "Novo status: em_aberto, em_negociacao, ganho, perdido, entregue, produzido" },
      valor: { type: "number", description: "Novo valor" },
      produto: { type: "string", description: "Novo produto (palestra, publicidade, consultoria, mentoria, treinamento, documentario)" },
      description: { type: "string", description: "Nova descrição" },
      moeda: { type: "string", description: "Moeda (BRL, USD, EUR)" },
      unclassified: { type: "boolean", description: "Marcar (true) ou desmarcar (false) como não classificado" },
      is_recurring: { type: "boolean", description: "Marcar como cliente recorrente" },
      email: { type: "string", description: "E-mail principal do lead (também adicionado ao array emails)" },
      phone: { type: "string", description: "Telefone principal do lead (também adicionado ao array phones)" },
      publicidade_subtipo: {
        anyOf: [{ type: "string" }, { type: "null" }],
        description: "Subtipo de publicidade ou null quando ainda não confirmado: longo, curto, insercao, longo_curto, linkedin, newsletter",
      },
      publicidade_quantidade: {
        anyOf: [{ type: "integer" }, { type: "null" }],
        description: "Quantidade de peças ou null quando o briefing ainda não a confirmou",
      },
      language: { type: "string", description: "Idioma do lead (ISO 639-1, ex: pt, en, es)" },
      ai_close_probability: { type: "integer", description: "Chance atual de fechamento, de 0 a 100" },
      ai_diagnosis: { type: "string", description: "Diagnóstico comercial atualizado" },
      ai_next_step: { type: "string", description: "Próxima ação concreta" },
      ai_diagnosis_reason: { type: "string", description: "Justificativa da chance de fechamento" },
    },
    required: ["lead_id"],
  },
  handler: async (args: any) => {
    const { lead_id, ...fields } = args;
    const sb = getSupabase();
    const updateData: Record<string, any> = {};
    for (const key of ["name", "status", "valor", "produto", "description", "moeda", "unclassified", "is_recurring", "publicidade_subtipo", "publicidade_quantidade", "language", "ai_close_probability", "ai_diagnosis", "ai_next_step", "ai_diagnosis_reason"]) {
      if (fields[key] !== undefined) updateData[key] = fields[key];
    }

    if (updateData.ai_close_probability !== undefined) {
      const probability = Number(updateData.ai_close_probability);
      if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
        return { content: [{ type: "text", text: "Erro: ai_close_probability deve estar entre 0 e 100." }] };
      }
      updateData.ai_close_probability = Math.round(probability);
      updateData.ai_diagnosis_updated_at = new Date().toISOString();
    }

    // Uma correção humana de preço é a fonte de verdade. Sem esta marcação, o
    // diagnóstico noturno podia substituir o valor correto por qualquer cifra
    // histórica mencionada no fio (proposta antiga, preço de tabela etc.).
    if (updateData.valor !== undefined || updateData.moeda !== undefined) {
      updateData.valor_manually_edited = true;
    }


    // Tratamento especial para email/phone: define principal + mescla no array
    if (fields.email !== undefined || fields.phone !== undefined) {
      const { data: current, error: curErr } = await sb
        .from("leads")
        .select("emails, phones")
        .eq("id", lead_id)
        .single();
      if (curErr) return { content: [{ type: "text", text: `Erro ao carregar lead: ${curErr.message}` }] };

      if (fields.email !== undefined) {
        const newEmail = String(fields.email).trim();
        updateData.email = newEmail || null;
        if (newEmail) {
          const existing = Array.isArray(current?.emails) ? current.emails : [];
          const merged = Array.from(new Set([newEmail, ...existing.filter((e: string) => !!e)]));
          updateData.emails = merged;
        }
      }
      if (fields.phone !== undefined) {
        const newPhone = String(fields.phone).trim();
        updateData.phone = newPhone || null;
        if (newPhone) {
          const existing = Array.isArray(current?.phones) ? current.phones : [];
          const merged = Array.from(new Set([newPhone, ...existing.filter((p: string) => !!p)]));
          updateData.phones = merged;
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return { content: [{ type: "text", text: "Nenhum campo para atualizar." }] };
    }

    // Se o status mudou, setar timestamps de ciclo de vida (perdido_at, ganho_at, etc.)
    if (updateData.status) {
      const { data: currentLead } = await sb
        .from("leads")
        .select("status, negociacao_at")
        .eq("id", lead_id)
        .single();
      const now = new Date().toISOString();
      const s = updateData.status;
      if (s === "em_aberto" && currentLead?.status === "perdido") updateData.reopened_at = now;
      if (s === "em_negociacao" && !currentLead?.negociacao_at) updateData.negociacao_at = now;
      if (s === "ganho") updateData.ganho_at = now;
      if (s === "perdido") updateData.perdido_at = now;
      if (s === "produzido") updateData.produzido_at = now;
      if (s === "entregue") updateData.delivered_at = now;
    }

    updateData.updated_at = new Date().toISOString();
    const { data, error } = await sb.from("leads").update(updateData).eq("id", lead_id).select().single();
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    return { content: [{ type: "text", text: `Lead atualizado: ${JSON.stringify(withLeadUrl(data as any), null, 2)}` }] };

  },
});


// --- classify_lead ---
mcpServer.tool("classify_lead", {
  description: "Classifica um lead (tira de 'Não Classificado'), define o produto e força regeneração da descrição. Use para confirmar leads pendentes de classificação.",
  inputSchema: {
    type: "object",
    properties: {
      lead_id: { type: "string", description: "UUID do lead" },
      produto: {
        type: "string",
        description: "Produto: palestra, publicidade, consultoria, mentoria, treinamento ou documentario",
      },
    },
    required: ["lead_id", "produto"],
  },
  handler: async (args: any) => {
    const { lead_id, produto } = args;
    const sb = getSupabase();
    const produtoNorm = String(produto || "").toLowerCase().trim();
    const allowed = ["palestra", "publicidade", "consultoria", "mentoria", "treinamento", "documentario"];
    if (!allowed.includes(produtoNorm)) {
      return { content: [{ type: "text", text: `Produto inválido. Use: ${allowed.join(", ")}` }] };
    }
    const { data, error } = await sb
      .from("leads")
      .update({
        produto: produtoNorm,
        unclassified: false,
        description_updated_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead_id)
      .select("id, name, produto, unclassified, status")
      .single();
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    try {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-lead-description`;
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ leadId: lead_id }),
      }).catch(() => {});
    } catch (_) { /* ignore */ }
    return { content: [{ type: "text", text: `Lead classificado como ${produtoNorm}: ${JSON.stringify(data, null, 2)}` }] };
  },
});

// --- list_pending_leads ---
mcpServer.tool("list_pending_leads", {
  description: "Lista leads com mensagens pendentes de resposta (última mensagem foi do cliente). Inclui days_since_last_inbound. Ordenado do mais recente para o mais antigo.",
  inputSchema: {
    type: "object",
    properties: {
      channel: { type: "string", description: "Filtrar por canal: email, whatsapp ou all (default all)" },
      limit: { type: "number", description: "Máximo de resultados (default 100, max 500)" },
    },
  },
  handler: async (args: any) => {
    const { channel, limit } = args;
    const sb = getSupabase();
    const max = Math.min(limit ?? 100, 500);

    // 1) Leads candidatos
    const { data: leads, error: leadsErr } = await sb
      .from("leads")
      .select("id, name, email, phone, phones, status, produto, valor, moeda, last_inbound_message, last_inbound_message_at")
      .eq("archived", false)
      .eq("unclassified", false)
      .neq("status", "perdido")
      .not("last_inbound_message_at", "is", null)
      .order("last_inbound_message_at", { ascending: false })
      .limit(1000);
    if (leadsErr) return { content: [{ type: "text", text: `Erro: ${leadsErr.message}` }] };

    // 2) Última mensagem de e-mail por lead (e-mail ainda usa lead_id)
    async function fetchLastEmailByLead() {
      const { data, error } = await sb
        .from("email_messages")
        .select("lead_id, direction, timestamp, created_at, message, subject")
        .not("lead_id", "is", null)
        .order("timestamp", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const map = new Map<string, any>();
      for (const row of (data as any[]) || []) {
        if (!row.lead_id) continue;
        if (!map.has(row.lead_id)) map.set(row.lead_id, row);
      }
      return map;
    }

    // 3) Última mensagem de WhatsApp por lead — indexada por telefone.
    async function fetchLastWhatsAppByLead() {
      const variantToLead = new Map<string, string>();
      for (const l of (leads as any[]) || []) {
        const list = [l.phone, ...(l.phones || [])].filter(Boolean) as string[];
        for (const p of list) {
          for (const v of getPhoneVariants(p)) {
            if (!variantToLead.has(v)) variantToLead.set(v, l.id);
          }
        }
      }
      const { data, error } = await sb
        .from("whatsapp_messages")
        .select("phone, direction, timestamp, created_at, message")
        .order("timestamp", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const map = new Map<string, any>();
      for (const row of (data as any[]) || []) {
        const matched = getPhoneVariants(row.phone).find((v) => variantToLead.has(v));
        if (!matched) continue;
        const leadId = variantToLead.get(matched)!;
        if (!map.has(leadId)) map.set(leadId, row);
      }
      return map;
    }

    const [emailLast, waLast] = await Promise.all([
      fetchLastEmailByLead(),
      fetchLastWhatsAppByLead(),
    ]);

    const result: any[] = [];
    for (const l of leads || []) {
      const e = emailLast.get(l.id);
      const w = waLast.get(l.id);
      const channels: string[] = [];
      const stamps: { ch: string; ts: string; preview: string }[] = [];
      if (e && e.direction === "inbound") {
        channels.push("email");
        stamps.push({ ch: "email", ts: e.timestamp || e.created_at, preview: (e.message || e.subject || "").trim() });
      }
      if (w && w.direction === "inbound") {
        channels.push("whatsapp");
        stamps.push({ ch: "whatsapp", ts: w.timestamp || w.created_at, preview: (w.message || "").trim() });
      }
      if (channels.length === 0) continue;
      if (channel && channel !== "all" && !channels.includes(channel)) continue;
      stamps.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
      const oldest = stamps[0];
      const daysSince = Math.floor((Date.now() - new Date(oldest.ts).getTime()) / 86400000);
      result.push({
        id: l.id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        status: l.status,
        produto: l.produto,
        valor: l.valor,
        moeda: l.moeda,
        pending_channels: channels,
        last_inbound_at: oldest.ts,
        days_since_last_inbound: daysSince,
        last_inbound_preview: (oldest.preview || (l.last_inbound_message || "").trim()).substring(0, 300),
      });
    }
    result.sort((a, b) => new Date(b.last_inbound_at).getTime() - new Date(a.last_inbound_at).getTime());
    const limited = result.slice(0, max);
    return { content: [{ type: "text", text: JSON.stringify({ total: result.length, returned: limited.length, leads: limited }, null, 2) }] };
  },
});

// --- list_scheduled_followups ---
mcpServer.tool("list_scheduled_followups", {
  description: "Lista os follow-ups agendados. Pode filtrar por status (pending, sent, failed, cancelled). Retorna lead_id, next_run_at, attempt_number, status e dados do lead associado.",
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string", description: "Filtrar por status: pending, sent, failed, cancelled (default: pending)" },
      limit: { type: "number", description: "Máximo de resultados (default 50)" },
    },
  },
  handler: async (args: any) => {
    const { status, limit } = args;
    const sb = getSupabase();
    let query = sb.from("scheduled_followups")
      .select("id, lead_id, next_run_at, attempt_number, status, last_error, created_at, updated_at")
      .eq("status", status ?? "pending")
      .order("next_run_at", { ascending: true })
      .limit(Math.min(limit ?? 50, 200));

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };

    // Enrich with lead names
    if (data && data.length > 0) {
      const leadIds = [...new Set(data.map((f: any) => f.lead_id))];
      const { data: leads } = await sb.from("leads")
        .select("id, name, email, phone, produto, status")
        .in("id", leadIds);
      const leadMap = new Map((leads || []).map((l: any) => [l.id, l]));
      const enriched = data.map((f: any) => ({ ...f, lead: leadMap.get(f.lead_id) ? { ...(leadMap.get(f.lead_id) as any), url: leadUrl(f.lead_id) } : null, lead_url: leadUrl(f.lead_id) }));
      return { content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }] };
    }

    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
});

// --- create_lead ---
mcpServer.tool("create_lead", {
  description: "Cria uma nova oportunidade/lead. Apenas o nome é obrigatório, os demais campos são opcionais.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Nome do lead/cliente" },
      email: { type: "string", description: "Email principal" },
      phone: { type: "string", description: "Telefone principal (com código de país)" },
      produto: { type: "string", description: "Produto de interesse" },
      valor: { type: "number", description: "Valor da oportunidade" },
      moeda: { type: "string", description: "Moeda (BRL, USD, EUR). Default: BRL" },
      description: { type: "string", description: "Descrição da oportunidade" },
      origem: { type: "string", description: "Origem do lead (ex: indicação, site, instagram)" },
      source: { type: "string", description: "Fonte técnica (ex: mcp, whatsapp, email)" },
    },
    required: ["name"],
  },
  handler: async (args: any) => {
    const sb = getSupabase();
    const insertData: Record<string, any> = { name: args.name, source: args.source || "mcp" };
    for (const key of ["email", "phone", "produto", "valor", "moeda", "description", "origem"]) {
      if (args[key] !== undefined) insertData[key] = args[key];
    }
    if (args.email) insertData.emails = [args.email];
    if (args.phone) insertData.phones = [args.phone.replace(/\D/g, '')];
    const { data, error } = await sb.from("leads").insert(insertData).select().single();
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    return { content: [{ type: "text", text: `Lead criado com sucesso: ${JSON.stringify(withLeadUrl(data as any), null, 2)}` }] };
  },
});

// --- add_lead_note ---
mcpServer.tool("add_lead_note", {
  description: "Adiciona uma nota a um lead.",
  inputSchema: {
    type: "object",
    properties: {
      lead_id: { type: "string", description: "UUID do lead" },
      note: { type: "string", description: "Texto da nota" },
    },
    required: ["lead_id", "note"],
  },
  handler: async (args: any) => {
    const { lead_id, note } = args;
    const sb = getSupabase();
    const { data, error } = await sb.from("lead_notes").insert({ lead_id, note }).select().single();
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    return { content: [{ type: "text", text: `Nota adicionada: ${JSON.stringify(data, null, 2)}` }] };
  },
});

// --- send_whatsapp ---
mcpServer.tool("send_whatsapp", {
  description: "Envia uma mensagem de WhatsApp para qualquer número. Não precisa de lead_id — se o número pertencer a um lead cadastrado, a mensagem é vinculada automaticamente. Funciona para contatos avulsos também.",
  inputSchema: {
    type: "object",
    properties: {
      phone: { type: "string", description: "Número de telefone com código de país (ex: 5511999998888)" },
      message: { type: "string", description: "Texto da mensagem" },
      lead_id: { type: "string", description: "UUID do lead (opcional — se não informado, busca automaticamente pelo telefone)" },
    },
    required: ["phone", "message"],
  },
  handler: async (args: any) => {
    const { phone, message } = args;
    let leadId = args.lead_id || null;
    const normalizedPhone = phone.replace(/\D/g, '');

    // Se não veio lead_id, tenta encontrar o lead pelo telefone
    if (!leadId) {
      try {
        const sb = getSupabase();
        const { data: leads } = await sb.from("leads")
          .select("id, phone, phones")
          .or(`phone.ilike.%${normalizedPhone}%,phones.cs.{${normalizedPhone}}`)
          .limit(1);
        if (leads && leads.length > 0) {
          leadId = leads[0].id;
        }
      } catch (e) {
        console.error("Erro ao buscar lead pelo telefone:", e);
      }
    }

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ phone: normalizedPhone, message, leadId }),
      });
      const data = await res.json();
      if (!res.ok) return { content: [{ type: "text", text: `Erro: ${JSON.stringify(data)}` }] };
      const linkedMsg = leadId ? ` (vinculado ao lead ${leadId})` : " (sem lead associado)";
      return { content: [{ type: "text", text: `WhatsApp enviado com sucesso para ${normalizedPhone}${linkedMsg}` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Erro ao enviar WhatsApp: ${e.message}` }] };
    }
  },
});

// --- send_email ---
mcpServer.tool("send_email", {
  description: "Envia um email como Susan (persona padrão do sistema). Opcionalmente vincula a um lead para threading e/ou anexa arquivos.",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Email do destinatário" },
      subject: { type: "string", description: "Assunto do email" },
      body: { type: "string", description: "Corpo do email (pode ser HTML)" },
      lead_id: { type: "string", description: "UUID do lead (opcional, para threading e registro)" },
      attachments: {
        type: "array",
        description: "Lista de anexos. Cada item: { filename, content (base64 puro, sem prefixo data:), type (MIME, opcional) } OU { filename, url (URL pública para baixar), type (opcional) }",
        items: {
          type: "object",
          properties: {
            filename: { type: "string" },
            content: { type: "string", description: "Conteúdo em base64 (sem o prefixo data:...;base64,)" },
            url: { type: "string", description: "URL pública do arquivo a ser baixado e anexado" },
            type: { type: "string", description: "MIME type, ex: image/png, application/pdf" },
          },
          required: ["filename"],
        },
      },
    },
    required: ["to", "subject", "body"],
  },
  handler: async (args: any) => {
    const { to, subject, body, lead_id, attachments } = args;
    try {
      // Resolve attachments: baixa URLs e converte para base64
      let resolvedAttachments: any[] | undefined = undefined;
      if (Array.isArray(attachments) && attachments.length > 0) {
        resolvedAttachments = [];
        for (const att of attachments) {
          let content = att.content;
          let type = att.type || "application/octet-stream";
          if (!content && att.url) {
            const r = await fetch(att.url);
            if (!r.ok) {
              return { content: [{ type: "text", text: `Erro ao baixar anexo ${att.filename}: HTTP ${r.status}` }] };
            }
            type = att.type || r.headers.get("content-type") || type;
            const buf = new Uint8Array(await r.arrayBuffer());
            let binary = "";
            const chunk = 8192;
            for (let i = 0; i < buf.length; i += chunk) {
              binary += String.fromCharCode(...buf.subarray(i, Math.min(i + chunk, buf.length)));
            }
            content = btoa(binary);
          }
          if (!content) {
            return { content: [{ type: "text", text: `Anexo ${att.filename} sem content nem url.` }] };
          }
          // Remove prefixo data: se vier por engano
          content = String(content).replace(/^data:[^;]+;base64,/, "");
          resolvedAttachments.push({ filename: att.filename, content, type });
        }
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ to, subject, body, leadId: lead_id, attachments: resolvedAttachments }),
      });
      const data = await res.json();
      if (!res.ok) return { content: [{ type: "text", text: `Erro: ${JSON.stringify(data)}` }] };
      return { content: [{ type: "text", text: `Email enviado com sucesso para ${to}` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Erro ao enviar email: ${e.message}` }] };
    }
  },
});

// --- export_to_sara ---
mcpServer.tool("export_to_sara", {
  description: "Exporta um lead para o sistema de entregas da Sara (Operações). Gera o payload via IA e envia para a API de delivery. Requer que o lead tenha email cadastrado.",
  inputSchema: {
    type: "object",
    properties: {
      lead_id: { type: "string", description: "UUID do lead" },
    },
    required: ["lead_id"],
  },
  handler: async (args: any) => {
    const { lead_id } = args;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/create-delivery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ leadId: lead_id }),
      });
      const data = await res.json();
      if (!res.ok) return { content: [{ type: "text", text: `Erro: ${JSON.stringify(data)}` }] };
      try {
        await getSupabase().from("delivery_logs").insert({ lead_id, destination: "sara", url: data?.url || null });
      } catch (logErr) { console.error("delivery_logs insert (sara) falhou:", logErr); }
      const urlLine = data?.url ? `\nLink: ${data.url}` : "";
      return { content: [{ type: "text", text: `Exportado para Sara com sucesso.${urlLine}\n${JSON.stringify(data, null, 2)}` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Erro ao exportar para Sara: ${e.message}` }] };
    }
  },
});

// --- export_to_tiffany ---
mcpServer.tool("export_to_tiffany", {
  description: "Exporta um lead para o sistema financeiro da Tiffany. Monta um payload determinístico com os dados financeiros do CRM e envia para o webhook do sistema financeiro.",
  inputSchema: {
    type: "object",
    properties: {
      lead_id: { type: "string", description: "UUID do lead" },
    },
    required: ["lead_id"],
  },
  handler: async (args: any) => {
    const { lead_id } = args;
    try {
      const sb = getSupabase();

      // Build context like the frontend does
      const waVariants = await getLeadPhoneVariants(sb, lead_id);
      const [leadRes, notesRes, emailsRes, whatsappRes] = await Promise.all([
        sb.from("leads").select("*").eq("id", lead_id).single(),
        sb.from("lead_notes").select("note").eq("lead_id", lead_id),
        sb.from("email_messages").select("subject, message, direction, timestamp").eq("lead_id", lead_id).order("timestamp", { ascending: false }).limit(30),
        waVariants.length > 0
          ? sb.from("whatsapp_messages").select("message, direction, created_at").in("phone", waVariants).order("created_at", { ascending: false }).limit(20)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (leadRes.error) return { content: [{ type: "text", text: `Erro ao buscar lead: ${leadRes.error.message}` }] };
      const lead = leadRes.data;

      const allEmails = lead.emails?.filter((e: string) => !e.endsWith('@whatsapp.temp')) || [];
      const notesText = (notesRes.data || []).map((n: any) => n.note).join('\n');
      const emailsText = (emailsRes.data || []).map((e: any) => `[${e.direction}] ${e.subject || ''}: ${(e.message || '').substring(0, 300)}`).join('\n');
      const whatsappText = (whatsappRes.data || []).map((m: any) => `${m.direction === 'inbound' ? 'Cliente' : 'Nós'}: ${m.message || ''}`).join('\n');

      const context = `Lead: ${lead.name}
Emails: ${allEmails.join(', ')}
Telefones: ${lead.phones?.join(', ') || 'N/A'}
Produto: ${lead.produto || 'Não definido'}
Moeda: ${lead.moeda || 'BRL'}
Valor: ${lead.valor || 'N/A'}
Valor pago: ${lead.valor_pago || 0}
Status: ${lead.status}
Descrição: ${lead.description || 'N/A'}
delivery_date: ${lead.delivered_at || 'N/A'}
expected_payment_date: ${lead.data_proximo_pagamento || 'N/A'}
Origem: ${lead.origem || 'N/A'}

Notas:
${notesText || 'Nenhuma'}

Últimos emails:
${emailsText || 'Nenhum'}

Últimas mensagens WhatsApp:
${whatsappText || 'Nenhuma'}`;

      const res = await fetch(`${supabaseUrl}/functions/v1/generate-lead-export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ context, leadName: lead.name, lead }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        return { content: [{ type: "text", text: `Erro ao exportar para Tiffany: ${data?.error || JSON.stringify(data)}` }] };
      }
      try {
        await sb.from("delivery_logs").insert({ lead_id, destination: "tiffany", url: data?.url || null });
      } catch (logErr) { console.error("delivery_logs insert (tiffany) falhou:", logErr); }
      const urlLine = data?.url ? `\nLink: ${data.url}` : "";
      return { content: [{ type: "text", text: `Exportado para Tiffany com sucesso.${urlLine}\n${JSON.stringify(data, null, 2)}` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Erro ao exportar para Tiffany: ${e.message}` }] };
    }
  },
});

// --- attach_file_to_lead ---
mcpServer.tool("attach_file_to_lead", {
  description: "Anexa um arquivo (imagem, PDF, documento) ao histórico de um lead. Aceita base64 OU URL pública. Faz upload pro storage, registra em email_attachments e cria uma nota com o texto extraído (OCR via IA para PDF/imagem). Use quando precisar deixar um arquivo de fato anexado ao lead.",
  inputSchema: {
    type: "object",
    properties: {
      lead_id: { type: "string", description: "UUID do lead" },
      filename: { type: "string", description: "Nome do arquivo (ex: contrato.pdf, stats.png)" },
      content: { type: "string", description: "Conteúdo em base64 (sem prefixo data:...). Use isto OU url." },
      url: { type: "string", description: "URL pública do arquivo a baixar e anexar. Use isto OU content." },
      content_type: { type: "string", description: "MIME type (ex: application/pdf, image/png). Se omitido, é inferido." },
      run_ocr: { type: "boolean", description: "Extrair texto via IA e salvar como nota (default true)." },
    },
    required: ["lead_id", "filename"],
  },
  handler: async (args: any) => {
    const { lead_id, filename, url, content_type, run_ocr } = args;
    let { content } = args;
    try {
      const sb = getSupabase();

      // 1) Resolve bytes
      let bytes: Uint8Array;
      let mime = content_type || "application/octet-stream";
      if (content) {
        content = String(content).replace(/^data:[^;]+;base64,/, "");
        const bin = atob(content);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else if (url) {
        const r = await fetch(url);
        if (!r.ok) return { content: [{ type: "text", text: `Erro ao baixar arquivo: HTTP ${r.status}` }] };
        mime = content_type || r.headers.get("content-type") || mime;
        bytes = new Uint8Array(await r.arrayBuffer());
      } else {
        return { content: [{ type: "text", text: "Informe content (base64) ou url." }] };
      }

      // 2) Hash para deduplicação
      const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
      const contentHash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

      const { data: existing } = await sb
        .from("email_attachments")
        .select("id, storage_path")
        .eq("lead_id", lead_id)
        .eq("content_hash", contentHash)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();

      let storagePath: string;
      let duplicate = false;
      if (existing) {
        storagePath = existing.storage_path;
        duplicate = true;
      } else {
        const ts = Date.now();
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        storagePath = `${lead_id}/${ts}_${safeName}`;
        const { error: upErr } = await sb.storage.from("email-attachments").upload(storagePath, bytes, {
          contentType: mime,
          upsert: false,
        });
        if (upErr) return { content: [{ type: "text", text: `Erro upload: ${upErr.message}` }] };

        await sb.from("email_attachments").insert({
          lead_id,
          filename,
          content_type: mime,
          size_bytes: bytes.byteLength,
          storage_path: storagePath,
          content_hash: contentHash,
        });
      }

      const { data: pub } = sb.storage.from("email-attachments").getPublicUrl(storagePath);
      const publicUrl = pub?.publicUrl || null;

      // 3) OCR opcional (só pra novos)
      let extractedLen = 0;
      if (!duplicate && (run_ocr ?? true)) {
        const isPdf = mime === "application/pdf";
        const isImage = mime.startsWith("image/");
        const isText = mime.startsWith("text/") || mime === "application/json" || mime === "application/xml";

        let text = "";
        if (isText) {
          text = new TextDecoder().decode(bytes);
        } else if (isPdf || isImage) {
          const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
          if (lovableApiKey) {
            let binary = "";
            const chunk = 8192;
            for (let i = 0; i < bytes.length; i += chunk) {
              binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
            }
            const b64 = btoa(binary);
            const dataUrl = `data:${mime};base64,${b64}`;
            const sysPrompt = isPdf
              ? "Extraia TODO o texto do PDF, mantendo estrutura. Retorne APENAS o texto."
              : "Extraia TODO o texto da imagem. Retorne APENAS o texto.";
            try {
              const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash",
                  messages: [
                    { role: "system", content: sysPrompt },
                    { role: "user", content: [
                      { type: "text", text: "Extraia todo o texto deste arquivo." },
                      { type: "image_url", image_url: { url: dataUrl } },
                    ] },
                  ],
                }),
              });
              if (aiRes.ok) {
                const aiData = await aiRes.json();
                text = aiData.choices?.[0]?.message?.content || "";
              }
            } catch (e) {
              console.error("OCR error:", e);
            }
          }
        }

        if (text && text.length > 10) {
          const prefix = isPdf ? "[Documento Anexado]" : isImage ? "[Imagem Anexada]" : "[Arquivo Anexado]";
          await sb.from("lead_notes").insert({
            lead_id,
            note: `${prefix} ${filename}\n\n${text}`,
          });
          extractedLen = text.length;
        } else {
          await sb.from("lead_notes").insert({
            lead_id,
            note: `[Arquivo Anexado] ${filename} (${mime}, ${bytes.byteLength} bytes)\nURL: ${publicUrl || storagePath}`,
          });
        }
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            duplicate,
            filename,
            content_type: mime,
            size_bytes: bytes.byteLength,
            storage_path: storagePath,
            public_url: publicUrl,
            extracted_text_length: extractedLen,
          }, null, 2),
        }],
      };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Erro ao anexar arquivo: ${e.message}` }] };
    }
  },
});

// --- register_payment ---
mcpServer.tool("register_payment", {
  description: "Registra pagamento (parcial ou total) de um lead. Soma ao valor_pago atual por padrão (mode='add'); use mode='set' para sobrescrever. Opcionalmente atualiza data_proximo_pagamento. Se valor_pago >= valor total, marca status='ganho' automaticamente.",
  inputSchema: {
    type: "object",
    properties: {
      lead_id: { type: "string", description: "UUID do lead" },
      amount: { type: "number", description: "Valor do pagamento (na moeda do lead)" },
      mode: { type: "string", description: "'add' (soma ao valor_pago atual, default) ou 'set' (sobrescreve)" },
      data_proximo_pagamento: { type: "string", description: "Data do próximo pagamento (YYYY-MM-DD), opcional" },
      note: { type: "string", description: "Observação opcional (será adicionada como nota no lead)" },
    },
    required: ["lead_id", "amount"],
  },
  handler: async (args: any) => {
    const { lead_id, amount, mode = "add", data_proximo_pagamento, note } = args;
    const sb = getSupabase();

    if (typeof amount !== "number" || !isFinite(amount)) {
      return { content: [{ type: "text", text: "Erro: 'amount' deve ser numérico." }] };
    }

    const { data: lead, error: fetchErr } = await sb
      .from("leads")
      .select("id, name, valor, valor_pago, moeda, status")
      .eq("id", lead_id)
      .single();
    if (fetchErr || !lead) {
      return { content: [{ type: "text", text: `Erro: lead não encontrado (${fetchErr?.message || "not found"}).` }] };
    }

    const prevPago = Number(lead.valor_pago || 0);
    const novoPago = mode === "set" ? Number(amount) : prevPago + Number(amount);
    const valorTotal = Number(lead.valor || 0);
    const moeda = lead.moeda || "BRL";

    const updateData: Record<string, any> = {
      valor_pago: novoPago,
      updated_at: new Date().toISOString(),
    };
    if (data_proximo_pagamento) updateData.data_proximo_pagamento = data_proximo_pagamento;

    let autoGanho = false;
    if (valorTotal > 0 && novoPago >= valorTotal && lead.status !== "ganho" && lead.status !== "produzido" && lead.status !== "entregue") {
      updateData.status = "ganho";
      autoGanho = true;
    }

    const { error: updErr } = await sb.from("leads").update(updateData).eq("id", lead_id);
    if (updErr) return { content: [{ type: "text", text: `Erro ao atualizar lead: ${updErr.message}` }] };

    if (note && String(note).trim().length > 0) {
      await sb.from("lead_notes").insert({
        lead_id,
        note: `[Pagamento] ${String(note).trim()}`,
      });
    }

    const restante = Math.max(valorTotal - novoPago, 0);
    const linhas = [
      `Pagamento registrado para "${lead.name}".`,
      `• Valor recebido: ${amount} ${moeda} (${mode === "set" ? "sobrescrito" : "somado"})`,
      `• Valor pago acumulado: ${novoPago} ${moeda}${valorTotal > 0 ? ` / ${valorTotal} ${moeda}` : ""}`,
    ];
    if (valorTotal > 0) linhas.push(`• Restante: ${restante} ${moeda}`);
    if (data_proximo_pagamento) linhas.push(`• Próximo pagamento: ${data_proximo_pagamento}`);
    if (autoGanho) linhas.push(`• Status alterado automaticamente para "ganho" (pago integral).`);

    return { content: [{ type: "text", text: linhas.join("\n") }] };
  },
});

// --- analyze_legal_risk ---
// Dispara a análise jurídica de um anexo (mesma função usada pelo botão "Verificar risco jurídico" no frontend).
// Retorna o parecer estruturado (resumo, nivel_risco, pontos_atencao, sugestoes_alteracao, perguntas_para_cliente).
mcpServer.tool("analyze_legal_risk", {
  description: "Analisa risco jurídico de um anexo (contrato/documento) sob a ótica do Miguel. Extrai texto via IA e gera parecer estruturado JSON (resumo, nivel_risco baixo/medio/alto, pontos_atencao[], sugestoes_alteracao[], perguntas_para_cliente[]). Resultado é cacheado no próprio anexo — use force=true para refazer. Use attachment_id obtido em get_lead_whatsapp/get_lead_emails/get_email.",
  inputSchema: {
    type: "object",
    properties: {
      attachment_id: { type: "string", description: "UUID do anexo (email_attachments.id)" },
      force: { type: "boolean", description: "Se true, refaz a análise mesmo se já houver cache" },
    },
    required: ["attachment_id"],
  },
  handler: async (args: any) => {
    const { attachment_id, force } = args;
    if (!attachment_id) return { content: [{ type: "text", text: "Erro: attachment_id é obrigatório." }] };
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/analyze-legal-risk`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ attachment_id, force: !!force }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { content: [{ type: "text", text: `Erro (${res.status}): ${json?.error || JSON.stringify(json)}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify({ attachment_id, cached: !!json.cached, analysis: json.analysis }, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Erro: ${e.message}` }] };
    }
  },
});

// --- get_legal_analysis ---
// Lê o parecer jurídico já salvo para um anexo (sem chamar IA). Filtra por anexo ou por lead.
mcpServer.tool("get_legal_analysis", {
  description: "Lê pareceres jurídicos JÁ GERADOS (cache) de anexos. Pode buscar por attachment_id específico, ou listar todos os pareceres de um lead (lead_id). Não chama IA — use analyze_legal_risk para gerar.",
  inputSchema: {
    type: "object",
    properties: {
      attachment_id: { type: "string", description: "UUID do anexo específico" },
      lead_id: { type: "string", description: "UUID do lead — retorna todos os anexos do lead que têm parecer" },
    },
  },
  handler: async (args: any) => {
    const { attachment_id, lead_id } = args;
    if (!attachment_id && !lead_id) {
      return { content: [{ type: "text", text: "Erro: informe attachment_id ou lead_id." }] };
    }
    const sb = getSupabase();
    let q = sb.from("email_attachments")
      .select("id, lead_id, filename, content_type, size_bytes, legal_analysis, legal_analysis_at")
      .not("legal_analysis", "is", null);
    if (attachment_id) q = q.eq("id", attachment_id);
    if (lead_id) q = q.eq("lead_id", lead_id);
    const { data, error } = await q.order("legal_analysis_at", { ascending: false });
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }] };
    if (!data || data.length === 0) {
      return { content: [{ type: "text", text: "Nenhum parecer jurídico encontrado. Use analyze_legal_risk para gerar." }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
});

// HTTP transport
const transport = new StreamableHttpTransport();
const handleRequest = transport.bind(mcpServer);

app.all("/*", async (c) => {
  return await handleRequest(c.req.raw);
});

Deno.serve(app.fetch);
