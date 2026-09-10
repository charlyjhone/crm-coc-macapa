import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

interface LastMsg {
  lead_id: string;
  direction: string;
  timestamp: string | null;
  created_at: string;
  message: string | null;
  subject?: string | null;
}

async function fetchLastByChannel(table: "email_messages" | "whatsapp_messages") {
  // Buscar últimas N mensagens (ordenadas) e reduzir no cliente p/ "última por lead".
  // Limite alto para cobrir o pipeline ativo.
  const cols =
    table === "email_messages"
      ? "lead_id, direction, timestamp, created_at, message, subject"
      : "lead_id, direction, timestamp, created_at, message";
  const { data, error } = await supabase
    .from(table)
    .select(cols)
    .not("lead_id", "is", null)
    .order("timestamp", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  const map = new Map<string, LastMsg>();
  for (const row of (data as any as LastMsg[]) || []) {
    if (!row.lead_id) continue;
    if (!map.has(row.lead_id)) map.set(row.lead_id, row);
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
      // 1) Leads candidatos
      const { data: leads, error: leadsErr } = await supabase
        .from("leads")
        .select(
          "id, name, email, phone, status, produto, valor, moeda, profile_picture_url, last_inbound_message, last_inbound_message_at"
        )
        .eq("archived", false)
        .eq("unclassified", false)
        .in("status", ["em_aberto", "em_negociacao"])
        .not("last_inbound_message_at", "is", null)
        .order("last_inbound_message_at", { ascending: true })
        .limit(1000);
      if (leadsErr) throw leadsErr;

      // 2) Última mensagem por lead em cada canal
      const [emailLast, waLast] = await Promise.all([
        fetchLastByChannel("email_messages"),
        fetchLastByChannel("whatsapp_messages"),
      ]);

      const result: PendingLead[] = [];
      for (const l of leads || []) {
        const e = emailLast.get(l.id);
        const w = waLast.get(l.id);
        const channels: PendingChannel[] = [];
        const stamps: { ch: PendingChannel; ts: string; preview: string }[] = [];
        if (e && e.direction === "inbound") {
          channels.push("email");
          stamps.push({
            ch: "email",
            ts: e.timestamp || e.created_at,
            preview: (e.message || e.subject || "").trim(),
          });
        }
        if (w && w.direction === "inbound") {
          channels.push("whatsapp");
          stamps.push({
            ch: "whatsapp",
            ts: w.timestamp || w.created_at,
            preview: (w.message || "").trim(),
          });
        }
        if (channels.length === 0) continue;
        // Ordena pelo mais antigo entre os canais pendentes
        stamps.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
        const oldest = stamps[0];
        result.push({
          id: l.id,
          name: l.name,
          email: l.email,
          phone: l.phone,
          status: l.status,
          produto: l.produto,
          valor: l.valor,
          moeda: l.moeda,
          profile_picture_url: l.profile_picture_url,
          pending_channels: channels,
          last_inbound_at: oldest.ts,
          last_inbound_preview:
            oldest.preview || (l.last_inbound_message || "").trim(),
        });
      }
      // Mais recente primeiro
      result.sort(
        (a, b) =>
          new Date(b.last_inbound_at).getTime() -
          new Date(a.last_inbound_at).getTime()
      );
      return result;
    },
  });
}
