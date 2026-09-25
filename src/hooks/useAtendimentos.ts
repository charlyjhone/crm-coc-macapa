import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export type TriageStatus = "novo" | "respondido_agente" | "aguardando_secretaria" | "resolvido";
export type Assunto = "matricula" | "curriculo" | "horario" | "localizacao" | "financeiro" | "outros";

export interface Atendimento {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  assunto: Assunto | null;
  interesse: string | null;
  triage_status: TriageStatus;
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

export function useAtendimentos(contactId?: string | null) {
  return useQuery({
    queryKey: ["atendimentos", contactId || null],
    refetchInterval: 30_000,
    queryFn: async (): Promise<Atendimento[]> => {
      let query = supabase
        .from("leads")
        .select(
          "id, name, email, phone, source, assunto, interesse, triage_status, triage_summary, agent_replied_at, handoff_at, handoff_reason, resolved_at, last_inbound_message, last_inbound_message_at, last_outbound_message_at, created_at"
        )
        .eq("archived", false)
        .order("last_inbound_message_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (contactId) query = query.eq("id", contactId);
      const { data, error } = await query;
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
      if (status === "resolvido") patch.resolved_at = new Date().toISOString();
      const { data, error } = await supabase.from("leads").update(patch).eq("id", id).select("id").single();
      if (error) throw error;
      if (!data) throw new Error("Atendimento não foi atualizado");
    },
    onError: () => toast({ title: "Não foi possível concluir o atendimento", description: "Tente novamente. Se persistir, contate o administrador.", variant: "destructive" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atendimentos"] }),
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
