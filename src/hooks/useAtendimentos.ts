import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TriageStatus = "novo" | "respondido_agente" | "aguardando_secretaria" | "resolvido";
export type LeadStatus = "novo" | "em_atendimento" | "em_negociacao" | "matriculado" | "nao_convertido" | "resolvido";
export type Assunto = "matricula" | "curriculo" | "horario" | "localizacao" | "outros";

export interface MensagemAtendimento {
  id: string;
  channel: "whatsapp" | "email";
  direction: string;
  message: string;
  at: string;
}

export interface Atendimento {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  assunto: Assunto | null;
  interesse: string | null;
  triage_status: TriageStatus;
  status: LeadStatus | null;
  triage_summary: string | null;
  agent_replied_at: string | null;
  handoff_at: string | null;
  handoff_reason: string | null;
  resolved_at: string | null;
  last_inbound_message: string | null;
  last_inbound_message_at: string | null;
  last_outbound_message_at: string | null;
  created_at: string;
}

export function useAtendimentos() {
  return useQuery({
    queryKey: ["atendimentos"],
    refetchInterval: 30_000,
    queryFn: async (): Promise<Atendimento[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, name, email, phone, source, assunto, interesse, status, triage_status, triage_summary, agent_replied_at, handoff_at, handoff_reason, resolved_at, last_inbound_message, last_inbound_message_at, last_outbound_message_at, created_at"
        )
        .eq("archived", false)
        .order("last_inbound_message_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as Atendimento[];
    },
  });
}

export function useUpdateTriage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TriageStatus }) => {
      const patch: Record<string, unknown> = { triage_status: status };
      if (status === "resolvido") {
        patch.resolved_at = new Date().toISOString();
        patch.status = "resolvido";
      }
      const { data, error } = await supabase.from("leads").update(patch).eq("id", id).select("id").single();
      if (error) throw error;
      if (!data) throw new Error("Contato não encontrado.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atendimentos"] }),
  });
}

export function useUpdateLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lead, status }: { lead: Atendimento; status: LeadStatus }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "resolvido") {
        patch.triage_status = "resolvido";
        patch.resolved_at = new Date().toISOString();
      } else if (lead.triage_status === "resolvido") {
        patch.triage_status = status === "novo" ? "novo" : "aguardando_secretaria";
        patch.resolved_at = null;
      }
      const { data, error } = await supabase.from("leads").update(patch).eq("id", lead.id).select("id").single();
      if (error) throw error;
      if (!data) throw new Error("Contato não encontrado.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atendimentos"] }),
  });
}

export function useMensagensAtendimento(lead: Atendimento | null) {
  return useQuery({
    queryKey: ["mensagens-atendimento", lead?.id, lead?.phone],
    enabled: !!lead,
    refetchInterval: 15_000,
    queryFn: async (): Promise<MensagemAtendimento[]> => {
      if (!lead) return [];
      const whatsappByLead = supabase
        .from("whatsapp_messages")
        .select("id, direction, message, timestamp, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(100);
      const phoneVariants = lead.phone
        ? [...new Set([lead.phone, lead.phone.replace(/\D/g, "")].filter(Boolean))]
        : [];
      const whatsappByPhone = phoneVariants.length
        ? supabase
            .from("whatsapp_messages")
            .select("id, direction, message, timestamp, created_at")
            .in("phone", phoneVariants)
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null });
      const emailByLead = supabase
        .from("email_messages")
        .select("id, direction, message, subject, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(50);
      const [byLead, byPhone, emails] = await Promise.all([whatsappByLead, whatsappByPhone, emailByLead]);
      if (byLead.error) throw byLead.error;
      if (byPhone.error) throw byPhone.error;
      if (emails.error) throw emails.error;

      const uniqueWhatsApp = new Map(
        [...(byLead.data || []), ...(byPhone.data || [])].map((m) => [m.id, m]),
      );
      const whatsapp: MensagemAtendimento[] = [...uniqueWhatsApp.values()].map((m) => ({
        id: m.id,
        channel: "whatsapp",
        direction: m.direction,
        message: m.message || "",
        at: m.timestamp || m.created_at,
      }));
      const email: MensagemAtendimento[] = (emails.data || []).map((m) => ({
        id: m.id,
        channel: "email",
        direction: m.direction,
        message: m.message || m.subject || "",
        at: m.created_at,
      }));
      return [...whatsapp, ...email].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    },
  });
}

export function useEnviarWhatsApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lead, message }: { lead: Atendimento; message: string }) => {
      if (!lead.phone) throw new Error("Este contato não tem telefone para WhatsApp.");
      const { data, error } = await supabase.functions.invoke("send-whatsapp-message", {
        body: { phone: lead.phone, leadId: lead.id, message, senderType: "human" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "O WhatsApp não confirmou o envio.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mensagens-atendimento"] });
      qc.invalidateQueries({ queryKey: ["atendimentos"] });
    },
  });
}

/** Tempo de espera em horas desde a última mensagem recebida sem resposta. */
export function horasEsperando(a: Atendimento): number | null {
  if (!a.last_inbound_message_at) return null;
  const tIn = Date.parse(a.last_inbound_message_at);
  const tOut = a.last_outbound_message_at ? Date.parse(a.last_outbound_message_at) : 0;
  if (tOut > tIn) return null; // já respondemos
  return (Date.now() - tIn) / 3_600_000;
}
