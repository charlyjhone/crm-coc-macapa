/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas escolares ainda não estão nos tipos gerados do Supabase. */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_MODE, demo } from "@/lib/demo";

export type OpportunityVisit = {
  id: string; scheduled_at: string; status: string;
  family_impression: string | null; objections: string | null; follow_up_notes: string | null;
};

export type Opportunity = {
  id: string; stage: string; legacy_lead_id: string | null; desired_grade: string; desired_shift: string | null;
  source_channel: string | null; source_campaign: string | null; probability_score: number | null;
  next_action: string | null; next_action_at: string | null; loss_reason: string | null; lost_at: string | null;
  created_at: string; updated_at: string;
  students: { full_name: string } | null;
  guardians: { full_name: string; phone: string | null } | null;
  school_visits: OpportunityVisit[] | null;
};

const SELECT = "id,stage,legacy_lead_id,desired_grade,desired_shift,source_channel,source_campaign,probability_score,next_action,next_action_at,loss_reason,lost_at,created_at,updated_at,students(full_name),guardians:primary_guardian_id(full_name,phone),school_visits(id,scheduled_at,status,family_impression,objections,follow_up_notes)";

const normalizeDemo = (o: any): Opportunity => ({
  source_campaign: null, loss_reason: null, lost_at: null, ...o,
  school_visits: (o.school_visits || []).map((v: any) => ({ family_impression: null, objections: null, follow_up_notes: null, ...v })),
});

/** Famílias ativas no funil (sem matriculadas, perdidas e nutrição). */
export function useActiveOpportunities() {
  return useQuery<Opportunity[]>({
    queryKey: ["funil"],
    refetchInterval: 60_000,
    queryFn: async () => {
      if (DEMO_MODE) return (await demo.opportunities()).filter((o) => !["matriculado", "perdido", "nutricao"].includes(o.stage)).map(normalizeDemo);
      const { data, error } = await (supabase as any).from("enrollment_opportunities").select(SELECT)
        .not("stage", "in", '("matriculado","perdido","nutricao")')
        .order("updated_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return data || [];
    },
  });
}

/** Famílias marcadas como "sem interesse" (mais recentes primeiro). */
export function useLostOpportunities(enabled = true) {
  return useQuery<Opportunity[]>({
    queryKey: ["funil-perdidos"],
    enabled,
    refetchInterval: 300_000,
    queryFn: async () => {
      if (DEMO_MODE) return (await demo.opportunities()).filter((o) => o.stage === "perdido").map(normalizeDemo);
      const { data, error } = await (supabase as any).from("enrollment_opportunities").select(SELECT)
        .eq("stage", "perdido").order("updated_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data || [];
    },
  });
}

/** Contatos que já viraram família no funil (qualquer etapa). */
export function useLinkedLeadIds() {
  return useQuery<Set<string>>({
    queryKey: ["funil", "leads-vinculados"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const rows = DEMO_MODE
        ? await demo.opportunities()
        : await (async () => {
          const { data, error } = await (supabase as any).from("enrollment_opportunities").select("legacy_lead_id").not("legacy_lead_id", "is", null).limit(10000);
          if (error) throw error;
          return data || [];
        })();
      return new Set(rows.map((r: { legacy_lead_id: string | null }) => r.legacy_lead_id).filter(Boolean) as string[]);
    },
  });
}

export const latestVisit = (item: Opportunity) => (item.school_visits || [])
  .filter((v) => v.status !== "cancelada").sort((a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at))[0] || null;
