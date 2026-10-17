import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLeadPhoneVariants, getPhoneVariants } from "@/lib/whatsappPhone";

export type PendingChannel = "email" | "whatsapp";
export type PendingReason = "unanswered_message" | "aguardando_secretaria";

export interface PendingLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  triage_status: string | null;
  handoff_reason: string | null;
  produto: string | null;
  valor: number | null;
  moeda: string | null;
  profile_picture_url: string | null;
  pending_channels: PendingChannel[];
  pending_reasons: PendingReason[];
  pending_since: string;
  last_inbound_preview: string;
}

interface LeadCandidate {
  id: string;
  phone: string | null;
  email: string | null;
  phones: string[] | null;
  whatsapp_chat_lids: string[] | null;
  name: string;
  status: string | null;
  triage_status: string | null;
  handoff_at: string | null;
  handoff_reason: string | null;
  triage_summary: string | null;
  created_at: string;
  last_inbound_message: string | null;
  last_inbound_message_at: string | null;
  produto: string | null;
  valor: number | null;
  moeda: string | null;
  profile_picture_url: string | null;
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
    for (const row of rows) {
      if (row.lead_id && !map.has(row.lead_id)) map.set(row.lead_id, row);
    }
    return map;
  }

  // O webhook pode gravar WhatsApp por telefone com lead_id nulo.
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
      // Statuses resolvidos/não classificados não escondem uma nova mensagem
      // nem um handoff que ainda aguarda a equipe humana.
      const { data: leads, error: leadsErr } = await supabase
        .from("leads")
        .select(
          "id, name, email, phone, phones, whatsapp_chat_lids, status, triage_status, handoff_at, handoff_reason, triage_summary, created_at, last_inbound_message, last_inbound_message_at, produto, valor, moeda, profile_picture_url"
        )
        .eq("archived", false)
        .order("last_inbound_message_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (leadsErr) throw leadsErr;

      const candidates = (leads || []) as unknown as LeadCandidate[];
      const [emailLast, waLast] = await Promise.all([
        fetchLastByChannel("email_messages", candidates),
        fetchLastByChannel("whatsapp_messages", candidates),
      ]);

      const result: PendingLead[] = [];
      for (const lead of candidates) {
        const email = emailLast.get(lead.id);
        const whatsapp = waLast.get(lead.id);
        const channels: PendingChannel[] = [];
        const reasons: PendingReason[] = [];
        const inboundStamps: { ch: PendingChannel; ts: string; preview: string }[] = [];
        const pendingStamps: { ch: PendingChannel; ts: string; preview: string }[] = [];
        const addChannel = (channel: PendingChannel) => {
          if (!channels.includes(channel)) channels.push(channel);
        };

        if (email?.direction === "inbound") {
          addChannel("email");
          inboundStamps.push({
            ch: "email",
            ts: email.timestamp || email.created_at,
            preview: (email.message || email.subject || "").trim(),
          });
        }
        if (whatsapp?.direction === "inbound") {
          addChannel("whatsapp");
          inboundStamps.push({
            ch: "whatsapp",
            ts: whatsapp.timestamp || whatsapp.created_at,
            preview: (whatsapp.message || "").trim(),
          });
        }
        if (inboundStamps.length > 0) reasons.push("unanswered_message");
        pendingStamps.push(...inboundStamps);

        // Uma resposta automática de handoff não conclui o atendimento humano.
        // Mantemos o contato visível até a equipe alterar o andamento.
        if (lead.triage_status === "aguardando_secretaria") {
          reasons.push("aguardando_secretaria");
          if (whatsapp) addChannel("whatsapp");
          if (email) addChannel("email");
          if (channels.length === 0) {
            if (lead.phone) addChannel("whatsapp");
            else if (lead.email) addChannel("email");
          }
          const handoffSince =
            lead.handoff_at || lead.last_inbound_message_at || lead.created_at;
          if (channels.length > 0) {
            pendingStamps.push({
              ch: channels[0],
              ts: handoffSince,
              preview:
                (lead.last_inbound_message || "").trim() ||
                (lead.triage_summary || "").trim() ||
                (lead.handoff_reason || "").trim() ||
                "Encaminhado à secretaria; aguardando retorno humano.",
            });
          }
        }

        if (channels.length === 0 || reasons.length === 0) continue;
        pendingStamps.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
        const oldest = pendingStamps[0];
        const latestInbound = [...inboundStamps].sort(
          (a, b) => Date.parse(b.ts) - Date.parse(a.ts),
        )[0];

        result.push({
          id: lead.id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          status: lead.status,
          triage_status: lead.triage_status,
          handoff_reason: lead.handoff_reason,
          produto: lead.produto,
          valor: lead.valor,
          moeda: lead.moeda,
          profile_picture_url: lead.profile_picture_url,
          pending_channels: channels,
          pending_reasons: reasons,
          pending_since: oldest.ts,
          last_inbound_preview:
            latestInbound?.preview ||
            (lead.last_inbound_message || "").trim() ||
            (lead.triage_summary || "").trim() ||
            (lead.handoff_reason || "").trim() ||
            (reasons.includes("aguardando_secretaria")
              ? "Encaminhado à secretaria; aguardando retorno humano."
              : ""),
        });
      }

      result.sort(
        (a, b) =>
          Date.parse(a.pending_since) - Date.parse(b.pending_since),
      );
      return result;
    },
  });
}
