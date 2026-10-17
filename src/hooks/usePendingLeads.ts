import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLeadPhoneVariants, getPhoneVariants } from "@/lib/whatsappPhone";

export type PendingChannel = "email" | "whatsapp";

export interface PendingLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  produto: string | null;
  valor: number | null;
  moeda: string | null;
  profile_picture_url: string | null;
  pending_channels: PendingChannel[];
  last_inbound_at: string; // ISO; mais antiga entre os canais pendentes
  last_inbound_preview: string;
}

interface LeadCandidate {
  id: string;
  phone: string | null;
  phones: string[] | null;
  whatsapp_chat_lids: string[] | null;
}

interface LastMsg {
  lead_id: string | null;
  phone?: string | null;
  direction: string;
  timestamp: string | null;
  created_at: string;
  message: string | null;
  subject?: string | null;
}

function messagePhoneKeys(phone?: string | null): string[] {
  const raw = (phone || "").trim().toLowerCase();
  if (!raw) return [];
  const keys = new Set<string>([raw]);
  // O provedor pode registrar conversas usando identificadores @lid.
  if (raw.includes("@lid")) keys.add(raw.split("@")[0]);
  for (const variant of getPhoneVariants(raw)) keys.add(variant.toLowerCase());
  return [...keys];
}

async function fetchLastByChannel(
  table: "email_messages" | "whatsapp_messages",
  leads: LeadCandidate[],
) {
  const isWhatsApp = table === "whatsapp_messages";
  const cols = isWhatsApp
    ? "lead_id, phone, direction, timestamp, created_at, message"
    : "lead_id, direction, timestamp, created_at, message, subject";

  // Paginar o histórico inteiro: o limite padrão do Supabase é 1.000 linhas.
  // Sem paginação, mensagens mais antigas podem ficar de fora silenciosamente.
  const rows: LastMsg[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from(table)
      .select(cols)
      .order("timestamp", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (!isWhatsApp) query = query.not("lead_id", "is", null) as typeof query;
    const { data, error } = await query;
    if (error) throw error;
    const page = (data || []) as unknown as LastMsg[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  const map = new Map<string, LastMsg>();
  if (!isWhatsApp) {
    // E-mail continua associado diretamente ao lead_id.
    for (const row of rows) {
      if (row.lead_id && !map.has(row.lead_id)) map.set(row.lead_id, row);
    }
    return map;
  }

  // No WhatsApp, mensagens órfãs são normais: o webhook grava por telefone e
  // pode deixar lead_id nulo. Indexamos variantes de telefone e @lid dos leads.
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  const phoneToLeads = new Map<string, Set<string>>();
  for (const lead of leads) {
    const variants = getLeadPhoneVariants({
      phone: lead.phone,
      phones: lead.phones || [],
      whatsapp_chat_lids: lead.whatsapp_chat_lids || [],
    });
    for (const variant of variants) {
      const key = variant.trim().toLowerCase();
      if (!key) continue;
      if (!phoneToLeads.has(key)) phoneToLeads.set(key, new Set());
      phoneToLeads.get(key)!.add(lead.id);
    }
  }

  // Rows are newest-first. The first message found for a lead is its latest.
  for (const row of rows) {
    let targetLeadIds: Set<string>;
    if (row.lead_id && leadsById.has(row.lead_id)) {
      targetLeadIds = new Set([row.lead_id]);
    } else {
      targetLeadIds = new Set<string>();
      for (const key of messagePhoneKeys(row.phone)) {
        for (const leadId of phoneToLeads.get(key) || []) targetLeadIds.add(leadId);
      }
    }
    for (const leadId of targetLeadIds) {
      if (!map.has(leadId)) map.set(leadId, row);
    }
  }
  return map;
}

export function usePendingLeads() {
  return useQuery({
    queryKey: ["pending-leads"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    queryFn: async (): Promise<PendingLead[]> => {
      // Incluir todos os contatos ativos. Uma nova mensagem pode reabrir um
      // contato resolvido ou ainda não classificado; o status não deve escondê-la.
      const { data: leads, error: leadsErr } = await supabase
        .from("leads")
        .select(
          "id, name, email, phone, phones, whatsapp_chat_lids, status, produto, valor, moeda, profile_picture_url, last_inbound_message, last_inbound_message_at"
        )
        .eq("archived", false)
        .order("last_inbound_message_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (leadsErr) throw leadsErr;

      const candidates = (leads || []) as unknown as (LeadCandidate & {
        name: string;
        email: string | null;
        status: string | null;
        produto: string | null;
        valor: number | null;
        moeda: string | null;
        profile_picture_url: string | null;
        last_inbound_message: string | null;
      })[];

      const [emailLast, waLast] = await Promise.all([
        fetchLastByChannel("email_messages", candidates),
        fetchLastByChannel("whatsapp_messages", candidates),
      ]);

      const result: PendingLead[] = [];
      for (const lead of candidates) {
        const email = emailLast.get(lead.id);
        const whatsapp = waLast.get(lead.id);
        const channels: PendingChannel[] = [];
        const stamps: { ch: PendingChannel; ts: string; preview: string }[] = [];

        if (email?.direction === "inbound") {
          channels.push("email");
          stamps.push({
            ch: "email",
            ts: email.timestamp || email.created_at,
            preview: (email.message || email.subject || "").trim(),
          });
        }
        if (whatsapp?.direction === "inbound") {
          channels.push("whatsapp");
          stamps.push({
            ch: "whatsapp",
            ts: whatsapp.timestamp || whatsapp.created_at,
            preview: (whatsapp.message || "").trim(),
          });
        }
        if (channels.length === 0) continue;

        // Ordena pelo mais antigo entre os canais que ainda aguardam resposta.
        stamps.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
        const oldest = stamps[0];
        result.push({
          id: lead.id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          status: lead.status,
          produto: lead.produto,
          valor: lead.valor,
          moeda: lead.moeda,
          profile_picture_url: lead.profile_picture_url,
          pending_channels: channels,
          last_inbound_at: oldest.ts,
          last_inbound_preview:
            oldest.preview || (lead.last_inbound_message || "").trim(),
        });
      }

      result.sort(
        (a, b) =>
          new Date(b.last_inbound_at).getTime() -
          new Date(a.last_inbound_at).getTime(),
      );
      return result;
    },
  });
}
