/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas e RPCs escolares ainda não estão nos tipos gerados do Supabase. */
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_MODE, demo } from "@/lib/demo";
import { NEXT_ACTION_FOR_COLUMN, STAGE_FOR_COLUMN, type FunnelKey } from "@/lib/funnel";

export const PENDING_ACTIVATION =
  "A classificação de contatos ainda não foi ativada no banco desta escola. Peça ao administrador para aplicar a atualização “classify_school_contact”.";

function isMissingFunction(error: any) {
  const text = `${error?.code || ""} ${error?.message || ""}`;
  return /PGRST202|42883|could not find the function|does not exist/i.test(text);
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) {
    if (isMissingFunction(error)) throw new Error(PENDING_ACTIVATION);
    throw new Error(error.message || "Não foi possível salvar.");
  }
  return data;
}

export type ClassifyInput = {
  leadId: string | null;
  guardianName: string;
  phone?: string | null;
  studentName: string;
  academicYear: number;
  grade: string;
  shift: string | null;
  source: string | null;
  campaign: string | null;
};

const plusDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

export function useFunnelActions() {
  const qc = useQueryClient();
  const refresh = () => {
    for (const key of ["funil", "funil-perdidos", "atendimentos", "hoje-sem-retorno", "hoje-visitas", "conversa-visita", "direcao", "relatorio-origem"]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };

  /** Cria (ou reaproveita) família/aluno/oportunidade a partir de um contato ou de um cadastro manual. */
  const classify = async (input: ClassifyInput) => {
    if (DEMO_MODE) { await demo.classify(input); refresh(); return; }
    if (input.leadId) {
      await rpc("classify_school_contact", {
        p_lead_id: input.leadId,
        p_guardian_name: input.guardianName.trim(),
        p_student_name: input.studentName.trim(),
        p_academic_year: input.academicYear,
        p_desired_grade: input.grade,
        p_desired_shift: input.shift || null,
        p_source_channel: input.source || null,
        p_source_campaign: input.campaign?.trim() || null,
      });
    } else {
      const created = await rpc("create_school_enrollment", {
        p_guardian_name: input.guardianName.trim(),
        p_guardian_phone: input.phone?.trim() || "",
        p_guardian_email: "",
        p_student_name: input.studentName.trim(),
        p_academic_year: input.academicYear,
        p_desired_grade: input.grade,
        p_desired_shift: input.shift || null,
        p_whatsapp_opt_in: false,
        p_source_channel: input.source || "cadastro_manual",
      });
      // A campanha precisa da função nova; sem ela o cadastro continua valendo.
      if (input.campaign?.trim() && created?.opportunity_id) {
        try { await rpc("set_opportunity_source", { p_opportunity_id: created.opportunity_id, p_source_channel: input.source, p_source_campaign: input.campaign.trim() }); }
        catch { /* campanha fica para depois */ }
      }
    }
    refresh();
  };

  /** Contato que não é matrícula (família da escola ou outro assunto): sai da lista de novos. */
  const markNotEnrollment = async (leadId: string) => {
    if (DEMO_MODE) { await demo.setLeadStatus(leadId, "em_atendimento"); refresh(); return; }
    const { error } = await supabase.from("leads").update({ status: "em_atendimento" }).eq("id", leadId);
    if (error) throw new Error(error.message);
    refresh();
  };

  const setSource = async (opportunityId: string, source: string, campaign: string | null) => {
    if (DEMO_MODE) { await demo.setSource(opportunityId, source, campaign); refresh(); return; }
    await rpc("set_opportunity_source", { p_opportunity_id: opportunityId, p_source_channel: source, p_source_campaign: campaign?.trim() || null });
    refresh();
  };

  const moveTo = async (opportunityId: string, column: FunnelKey, options: { nextAction?: string; inDays?: number } = {}) => {
    const stage = STAGE_FOR_COLUMN[column];
    if (DEMO_MODE) { await demo.moveOpportunity(opportunityId, stage); refresh(); return; }
    await rpc("update_enrollment_progress", {
      p_opportunity_id: opportunityId,
      p_stage: stage,
      p_next_action: options.nextAction || NEXT_ACTION_FOR_COLUMN[column],
      p_next_action_at: plusDays(options.inDays ?? 1),
      p_loss_reason: null,
    });
    refresh();
  };

  /** "Ainda pensando": continua em Visitou, com retorno marcado. */
  const thinking = async (opportunityId: string) => {
    if (DEMO_MODE) { await demo.moveOpportunity(opportunityId, "condicoes_apresentadas"); refresh(); return; }
    await rpc("update_enrollment_progress", {
      p_opportunity_id: opportunityId, p_stage: "condicoes_apresentadas",
      p_next_action: "Retornar à família (ainda pensando)", p_next_action_at: plusDays(2), p_loss_reason: null,
    });
    refresh();
  };

  const markLost = async (opportunityId: string, reason: string) => {
    if (DEMO_MODE) { await demo.moveOpportunity(opportunityId, "perdido", reason); refresh(); return; }
    await rpc("update_enrollment_progress", {
      p_opportunity_id: opportunityId, p_stage: "perdido", p_next_action: null, p_next_action_at: null, p_loss_reason: reason,
    });
    refresh();
  };

  /** Agenda visita (o banco move para "Visita agendada" quando a família ainda está no início). */
  const scheduleVisit = async (opportunityId: string, isoDate: string) => {
    if (DEMO_MODE) { await demo.addVisit(opportunityId, isoDate); refresh(); return; }
    await rpc("schedule_school_visit", { p_opportunity_id: opportunityId, p_scheduled_at: isoDate, p_participants: null, p_notes: null });
    refresh();
  };

  return { classify, markNotEnrollment, setSource, moveTo, thinking, markLost, scheduleVisit, refresh };
}
