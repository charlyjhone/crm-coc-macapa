/* eslint-disable @typescript-eslint/no-explicit-any -- tabela de lembretes ainda não está nos tipos gerados do Supabase. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_MODE, demo } from "@/lib/demo";
import { todayKey } from "@/lib/enrollmentCalendar";

export type ReminderKind = "enviar_valores" | "enviar_documento" | "falar_matricula" | "retornar_contato" | "outro";

export const reminderKinds: { key: ReminderKind; label: string }[] = [
  { key: "enviar_valores", label: "Enviar valores" },
  { key: "enviar_documento", label: "Enviar documento" },
  { key: "falar_matricula", label: "Falar sobre matrícula" },
  { key: "retornar_contato", label: "Retornar contato" },
  { key: "outro", label: "Outro" },
];
export const reminderKindLabel = (kind: string) => reminderKinds.find((k) => k.key === kind)?.label || "Lembrete";

export type Reminder = {
  id: string;
  lead_id: string;
  remind_on: string; // AAAA-MM-DD
  kind: ReminderKind;
  note: string | null;
  done_at: string | null;
  created_at: string;
  leads: { name: string } | null;
};

export type RemindersResult = { items: Reminder[]; unavailable: boolean };

const isMissingTable = (error: any) =>
  error?.code === "42P01" || error?.code === "PGRST205" || /lead_reminders/.test(error?.message || "");

/** Lembretes pendentes (todos, ou só de uma família). */
export function useReminders(leadId?: string | null) {
  return useQuery<RemindersResult>({
    queryKey: ["lembretes", leadId || "todos"],
    refetchInterval: 60_000,
    queryFn: async () => {
      if (DEMO_MODE) return { items: (await demo.reminders(leadId || undefined)) as Reminder[], unavailable: false };
      let query = (supabase as any).from("lead_reminders")
        .select("id,lead_id,remind_on,kind,note,done_at,created_at,leads(name)")
        .is("done_at", null)
        .order("remind_on", { ascending: true })
        .limit(500);
      if (leadId) query = query.eq("lead_id", leadId);
      const { data, error } = await query;
      if (error) {
        if (isMissingTable(error)) return { items: [], unavailable: true };
        throw error;
      }
      return { items: data || [], unavailable: false };
    },
  });
}

/** Lembretes de hoje e atrasados. */
export function useDueReminders() {
  const result = useReminders();
  const today = todayKey();
  const due = (result.data?.items || []).filter((r) => r.remind_on <= today);
  return { ...result, due, today };
}

export function useReminderActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["lembretes"] });
  const create = useMutation({
    mutationFn: async (input: { lead_id: string; remind_on: string; kind: ReminderKind; note: string | null }) => {
      if (DEMO_MODE) return demo.addReminder(input);
      const { error } = await (supabase as any).from("lead_reminders").insert(input);
      if (error) throw isMissingTable(error) ? new Error("Os lembretes ainda não foram ativados no banco desta escola.") : error;
    },
    onSuccess: refresh,
  });
  const complete = useMutation({
    mutationFn: async (id: string) => {
      if (DEMO_MODE) return demo.completeReminder(id);
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("lead_reminders")
        .update({ done_at: new Date().toISOString(), done_by: auth.user?.id ?? null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  return { create, complete };
}
