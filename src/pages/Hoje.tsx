/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas escolares ainda não estão nos tipos gerados do Supabase. */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAtendimentos, type Atendimento } from "@/hooks/useAtendimentos";
import { attendancePriority } from "@/lib/attendancePriority";
import { SCHOOL_TIME_ZONE, schoolDateTimeInput } from "@/lib/schoolDateTime";
import { VisitStatusDialog } from "@/components/school/VisitStatusDialog";
import { Empty, Page, PageTitle, Panel, Tag, btn, btnPrimary, timeAgo } from "@/components/crm/ui";
import { DEMO_MODE, demo } from "@/lib/demo";
import { EnrollmentComparisonCard } from "@/components/crm/EnrollmentComparison";
import { RemindersTodayPanel } from "@/components/crm/Reminders";

type TodayVisit = {
  id: string; scheduled_at: string; status: string;
  family_impression: string | null; objections: string | null; follow_up_notes: string | null;
  enrollment_opportunities: { desired_grade: string; students: { full_name: string } | null; guardians: { full_name: string } | null } | null;
};
type StaleOpportunity = {
  id: string; stage: string; legacy_lead_id: string | null; next_action_at: string | null; updated_at: string;
  desired_grade: string; students: { full_name: string } | null; guardians: { full_name: string } | null;
};

const DAY = 86_400_000;
const activeVisit = ["agendada", "confirmada", "reagendada"];
const visitLabel: Record<string, string> = { agendada: "Agendada", confirmada: "Confirmada", reagendada: "Reagendada", realizada: "Compareceu", faltou: "Faltou", cancelada: "Cancelada" };

function needsTeam(lead: Atendimento) {
  return lead.triage_status === "aguardando_secretaria" || attendancePriority(lead).level >= 1;
}

export default function Hoje() {
  const qc = useQueryClient();
  const { data: leads = [], isLoading } = useAtendimentos();
  const todayKey = schoolDateTimeInput(new Date()).slice(0, 10);

  const visits = useQuery<TodayVisit[]>({
    queryKey: ["hoje-visitas", todayKey],
    refetchInterval: 60_000,
    queryFn: async () => {
      if (DEMO_MODE) {
        const opportunities = await demo.opportunities();
        return opportunities.flatMap((o) => o.school_visits.map((v) => ({ ...v, enrollment_opportunities: { desired_grade: o.desired_grade, students: o.students, guardians: o.guardians } })))
          .filter((v) => v.status !== "cancelada" && schoolDateTimeInput(v.scheduled_at).slice(0, 10) === todayKey)
          .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
      }
      const from = new Date(Date.now() - DAY * 1.5).toISOString();
      const to = new Date(Date.now() + DAY * 1.5).toISOString();
      const { data, error } = await (supabase as any).from("school_visits")
        .select("id,scheduled_at,status,family_impression,objections,follow_up_notes,enrollment_opportunities(desired_grade,students(full_name),guardians:primary_guardian_id(full_name))")
        .gte("scheduled_at", from).lte("scheduled_at", to).neq("status", "cancelada")
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data || []).filter((visit: TodayVisit) => schoolDateTimeInput(visit.scheduled_at).slice(0, 10) === todayKey);
    },
  });

  const stale = useQuery<StaleOpportunity[]>({
    queryKey: ["hoje-sem-retorno"],
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = DEMO_MODE
        ? { data: (await demo.opportunities()).filter((o) => !["matriculado", "perdido", "nutricao"].includes(o.stage)), error: null }
        : await (supabase as any).from("enrollment_opportunities")
          .select("id,stage,legacy_lead_id,next_action_at,updated_at,desired_grade,students(full_name),guardians:primary_guardian_id(full_name)")
          .not("stage", "in", '("matriculado","perdido","nutricao")')
          .order("updated_at", { ascending: true }).limit(200);
      if (error) throw error;
      const limit = Date.now() - 3 * DAY;
      return (data || []).filter((item: StaleOpportunity) =>
        (item.next_action_at && Date.parse(item.next_action_at) < limit) || Date.parse(item.updated_at) < limit);
    },
  });

  const needsYou = useMemo(() => leads.filter(needsTeam)
    .sort((a, b) => attendancePriority(b).level - attendancePriority(a).level ||
      (Date.parse(a.last_inbound_message_at || a.handoff_at || "") || 0) - (Date.parse(b.last_inbound_message_at || b.handoff_at || "") || 0)), [leads]);

  const staleLeads = useMemo(() => {
    const limit = Date.now() - 3 * DAY;
    const fromOpportunities = new Set((stale.data || []).map((item) => item.legacy_lead_id).filter(Boolean));
    return leads.filter((lead) => {
      if (needsTeam(lead) || fromOpportunities.has(lead.id)) return false;
      if (lead.triage_status === "resolvido" || !["novo", "em_atendimento", "em_negociacao"].includes(lead.status || "novo")) return false;
      const last = Math.max(Date.parse(lead.last_inbound_message_at || "") || 0, Date.parse(lead.last_outbound_message_at || "") || 0);
      return last > 0 && last < limit;
    });
  }, [leads, stale.data]);

  const refreshVisits = () => { void qc.invalidateQueries({ queryKey: ["hoje-visitas"] }); void qc.invalidateQueries({ queryKey: ["funil"] }); void qc.invalidateQueries({ queryKey: ["hoje-sem-retorno"] }); };
  const staleCount = (stale.data?.length || 0) + staleLeads.length;
  const todayLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: SCHOOL_TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <Page>
      <PageTitle title="Hoje" subtitle={todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Panel><p className="text-[28px] font-semibold leading-none">{needsYou.length}</p><p className="mt-2 text-[13px] text-[#5B6675]">Aguardando a secretaria</p></Panel>
        <Panel><p className="text-[28px] font-semibold leading-none">{visits.data?.filter((v) => activeVisit.includes(v.status)).length ?? 0}</p><p className="mt-2 text-[13px] text-[#5B6675]">Visitas hoje</p></Panel>
        <Panel><p className="text-[28px] font-semibold leading-none">{staleCount}</p><p className="mt-2 text-[13px] text-[#5B6675]">Sem retorno há 3 dias ou mais</p></Panel>
      </div>

      <RemindersTodayPanel />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <Panel title="Precisa de você" className="flex-1">
          {isLoading && <p className="py-4 text-sm text-[#5B6675]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</p>}
          {!isLoading && !needsYou.length && <Empty>Nenhuma família aguardando a secretaria agora.</Empty>}
          <ul className="divide-y divide-[#EEF0F3]">
            {needsYou.slice(0, 12).map((lead, index) => {
              const priority = attendancePriority(lead);
              const urgent = priority.level >= 3;
              return (
                <li key={lead.id} className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
                  <Tag tone={urgent ? "urgente" : "atencao"}>{urgent ? "Urgente" : "Atenção"}</Tag>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{lead.name}</p>
                    <p className="truncate text-[13px] text-[#5B6675]">{lead.handoff_reason || lead.triage_summary || lead.last_inbound_message || priority.reason || "Aguardando resposta"}</p>
                  </div>
                  <span className="text-[13px] text-[#5B6675]">{timeAgo(lead.last_inbound_message_at || lead.handoff_at)}</span>
                  <Link to={`/atendimentos?status=todos&lead=${lead.id}`} className={index === 0 ? btnPrimary : btn}>Responder</Link>
                </li>
              );
            })}
          </ul>
          {needsYou.length > 12 && <Link to="/atendimentos" className="mt-2 inline-block text-sm font-medium text-[var(--crm-accent)] underline">Ver todas as {needsYou.length} conversas</Link>}
        </Panel>

        <div className="flex w-full flex-col gap-5 lg:w-[400px] lg:flex-none">
          <EnrollmentComparisonCard />
          <Panel title="Visitas de hoje" action={<Link to="/visitas" className="text-[13px] font-medium text-[var(--crm-accent)] underline">Agenda</Link>}>
            {visits.isLoading && <p className="py-3 text-sm text-[#5B6675]">Carregando…</p>}
            {visits.isError && <p className="py-3 text-sm text-[#B42318]">Não foi possível carregar as visitas.</p>}
            {!visits.isLoading && !visits.isError && !visits.data?.length && <Empty>Nenhuma visita marcada para hoje.</Empty>}
            <ul className="divide-y divide-[#EEF0F3]">
              {visits.data?.map((visit) => {
                const opp = visit.enrollment_opportunities;
                const family = opp?.guardians?.full_name || opp?.students?.full_name || "Família";
                return (
                  <li key={visit.id} className="flex items-center gap-3 py-3">
                    <b className="w-12 shrink-0 tabular-nums">{schoolDateTimeInput(visit.scheduled_at).slice(11, 16)}</b>
                    <div className="min-w-0 flex-1"><p className="truncate">{family}</p><p className="text-[13px] text-[#5B6675]">{opp?.desired_grade || "Série a confirmar"}</p></div>
                    {activeVisit.includes(visit.status) && DEMO_MODE ? (
                      <span className="flex gap-1.5">
                        <button type="button" className={btn} onClick={() => void demo.setVisitStatus(visit.id, "realizada").then(refreshVisits)}>Compareceu</button>
                        <button type="button" className={btn} onClick={() => void demo.setVisitStatus(visit.id, "faltou").then(refreshVisits)}>Faltou</button>
                      </span>
                    ) : activeVisit.includes(visit.status) ? (
                      <VisitStatusDialog
                        visit={{ ...visit, studentName: opp?.students?.full_name || family }}
                        onUpdated={() => { void qc.invalidateQueries({ queryKey: ["hoje-visitas"] }); void qc.invalidateQueries({ queryKey: ["school-visits"] }); }}
                      />
                    ) : (
                      <Tag tone={visit.status === "realizada" ? "ok" : "neutro"}>{visitLabel[visit.status] || visit.status}</Tag>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Sem retorno">
            {!staleCount && <Empty>Todas as famílias estão com retorno em dia.</Empty>}
            <ul className="divide-y divide-[#EEF0F3]">
              {stale.data?.slice(0, 8).map((item) => {
                const overdue = item.next_action_at && Date.parse(item.next_action_at) < Date.now();
                const name = item.guardians?.full_name || item.students?.full_name || "Família";
                return (
                  <li key={item.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1"><p className="truncate">{name}</p>
                      <p className="text-[13px] text-[#5B6675]">{overdue ? `Retorno previsto ${timeAgo(item.next_action_at)}` : `Sem andamento ${timeAgo(item.updated_at)}`}</p></div>
                    <Link to={item.legacy_lead_id ? `/atendimentos?status=todos&lead=${item.legacy_lead_id}` : `/funil?ficha=${item.id}`} className={btn}>Retomar</Link>
                  </li>
                );
              })}
              {staleLeads.slice(0, 8).map((lead) => (
                <li key={lead.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1"><p className="truncate">{lead.name}</p>
                    <p className="text-[13px] text-[#5B6675]">Última conversa {timeAgo(lead.last_outbound_message_at && lead.last_outbound_message_at > (lead.last_inbound_message_at || "") ? lead.last_outbound_message_at : lead.last_inbound_message_at)}</p></div>
                  <Link to={`/atendimentos?status=todos&lead=${lead.id}`} className={btn}>Retomar</Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
