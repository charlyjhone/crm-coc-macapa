/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas escolares ainda não estão nos tipos gerados do Supabase. */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAtendimentos, type Atendimento } from "@/hooks/useAtendimentos";
import { useActiveOpportunities, useLinkedLeadIds } from "@/hooks/useOpportunities";
import { attendancePriority, waitingForTeam } from "@/lib/attendancePriority";
import { SCHOOL_TIME_ZONE, schoolDateTimeInput } from "@/lib/schoolDateTime";
import { FUNNEL_COLUMNS, funnelKeyOf } from "@/lib/funnel";
import { VisitStatusDialog } from "@/components/school/VisitStatusDialog";
import { Empty, Page, PageTitle, Panel, Tag, btn, btnPrimary, timeAgo } from "@/components/crm/ui";
import { TemperatureChip } from "@/components/crm/FunnelBits";
import { displayName, displayPreview, displaySource, sourceChipClass } from "@/lib/leadDisplay";
import { adChipClass, adLabel, adReferralOf, useAdReferrals } from "@/hooks/useAdReferrals";
import { ClassifyContactDialog } from "@/components/crm/ClassifyContactDialog";
import { DEMO_MODE, demo } from "@/lib/demo";
import { EnrollmentComparisonCard } from "@/components/crm/EnrollmentComparison";
import { RemindersTodayPanel } from "@/components/crm/Reminders";

type TodayVisit = {
  id: string; scheduled_at: string; status: string;
  family_impression: string | null; objections: string | null; follow_up_notes: string | null;
  enrollment_opportunities: { desired_grade: string; source_channel?: string | null; students: { full_name: string } | null; guardians: { full_name: string } | null } | null;
};

const DAY = 86_400_000;
const activeVisit = ["agendada", "confirmada", "reagendada"];
const visitLabel: Record<string, string> = { agendada: "Agendada", confirmada: "Confirmada", reagendada: "Reagendada", realizada: "Compareceu", faltou: "Faltou", cancelada: "Cancelada" };

function needsTeam(lead: Atendimento) {
  return waitingForTeam(lead) || attendancePriority(lead).level >= 1;
}

const isResolved = (lead: Atendimento) => lead.triage_status === "resolvido" || lead.status === "resolvido" || lead.status === "nao_convertido";
const initials = (name: string) => name.replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "#";
const lastTouch = (lead: Atendimento) => Math.max(Date.parse(lead.last_inbound_message_at || "") || 0, Date.parse(lead.created_at) || 0);

/** Contato que ainda não foi classificado: sem família no funil, status Novo e sem assunto que não seja matrícula. */
function isUnclassified(lead: Atendimento, linked: Set<string>, now = Date.now()) {
  if (linked.has(lead.id) || isResolved(lead)) return false;
  if ((lead.status || "novo") !== "novo") return false;
  if (lead.attention_level === "externo") return false; // operadora, propaganda etc.
  return now - lastTouch(lead) < 30 * DAY;
}

export default function Hoje() {
  const qc = useQueryClient();
  const { data: leads = [], isLoading } = useAtendimentos();
  const opportunities = useActiveOpportunities();
  const linked = useLinkedLeadIds();
  const ads = useAdReferrals();
  const [classifyLead, setClassifyLead] = useState<Atendimento | null>(null);
  const [classifyOpen, setClassifyOpen] = useState(false);
  const [showAllNew, setShowAllNew] = useState(false);
  const todayKey = schoolDateTimeInput(new Date()).slice(0, 10);

  const visits = useQuery<TodayVisit[]>({
    queryKey: ["hoje-visitas", todayKey],
    refetchInterval: 60_000,
    queryFn: async () => {
      if (DEMO_MODE) {
        const list = await demo.opportunities();
        return list.flatMap((o) => o.school_visits.map((v) => ({ ...v, enrollment_opportunities: { desired_grade: o.desired_grade, source_channel: o.source_channel, students: o.students, guardians: o.guardians } })))
          .filter((v) => v.status !== "cancelada" && schoolDateTimeInput(v.scheduled_at).slice(0, 10) === todayKey)
          .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
      }
      const from = new Date(Date.now() - DAY * 1.5).toISOString();
      const to = new Date(Date.now() + DAY * 1.5).toISOString();
      const { data, error } = await (supabase as any).from("school_visits")
        .select("id,scheduled_at,status,family_impression,objections,follow_up_notes,enrollment_opportunities(desired_grade,source_channel,students(full_name),guardians:primary_guardian_id(full_name))")
        .gte("scheduled_at", from).lte("scheduled_at", to).neq("status", "cancelada")
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data || []).filter((visit: TodayVisit) => schoolDateTimeInput(visit.scheduled_at).slice(0, 10) === todayKey);
    },
  });

  const linkedIds = useMemo(() => linked.data || new Set<string>(), [linked.data]);

  const newContacts = useMemo(() => leads.filter((lead) => isUnclassified(lead, linkedIds))
    .sort((a, b) => lastTouch(b) - lastTouch(a)), [leads, linkedIds]);

  const needsYou = useMemo(() => leads.filter(needsTeam)
    .sort((a, b) => attendancePriority(b).level - attendancePriority(a).level ||
      (Date.parse(a.last_inbound_message_at || a.handoff_at || "") || 0) - (Date.parse(b.last_inbound_message_at || b.handoff_at || "") || 0)), [leads]);

  const counts = useMemo(() => {
    const result = Object.fromEntries(FUNNEL_COLUMNS.map((c) => [c.key, 0])) as Record<string, number>;
    for (const item of opportunities.data || []) { const key = funnelKeyOf(item.stage); if (key) result[key]++; }
    return result;
  }, [opportunities.data]);
  const maxCount = Math.max(1, ...Object.values(counts));

  // Retornar hoje: retorno previsto até hoje, ou parado há 3 dias.
  const followUps = useMemo(() => {
    const now = Date.now();
    const endOfToday = now + DAY;
    return (opportunities.data || []).filter((item) => {
      if (item.next_action_at) return Date.parse(item.next_action_at) < endOfToday && schoolDateTimeInput(item.next_action_at).slice(0, 10) <= todayKey;
      return now - Date.parse(item.updated_at) > 3 * DAY;
    }).sort((a, b) => (Date.parse(a.next_action_at || a.updated_at) || 0) - (Date.parse(b.next_action_at || b.updated_at) || 0));
  }, [opportunities.data, todayKey]);

  const visitsToday = visits.data?.filter((v) => activeVisit.includes(v.status)).length ?? 0;
  const refreshVisits = () => { for (const key of ["hoje-visitas", "funil", "school-visits"]) void qc.invalidateQueries({ queryKey: [key] }); };
  const todayLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: SCHOOL_TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const toFollow = newContacts.length + needsYou.length + visitsToday + followUps.length;
  const openClassify = (lead: Atendimento | null) => { setClassifyLead(lead); setClassifyOpen(true); };
  const stageHint: Record<string, string> = {
    novo: newContacts.length ? `+${newContacts.length} para classificar` : "no funil",
    conversa: "conversando com a família",
    visita: visitsToday ? `${visitsToday} hoje` : "agendadas",
    visitou: "aguardando decisão",
    matricular: "encaminhar à matrícula",
  };

  return (
    <Page>
      <PageTitle
        title="Início"
        subtitle={`${todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)} · ${toFollow} ${toFollow === 1 ? "item" : "itens"} para acompanhar hoje`}
        actions={<button type="button" className={btnPrimary} onClick={() => openClassify(null)}><Plus className="h-4 w-4" aria-hidden="true" />Novo contato</button>}
      />

      <nav aria-label="Funil de matrícula" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {FUNNEL_COLUMNS.map((column) => (
          <Link key={column.key} to={`/funil?coluna=${column.key}`}
            className={`flex flex-col gap-1.5 rounded-2xl border bg-white px-4 py-3.5 hover:shadow-md ${column.key === "novo" && newContacts.length ? "border-[var(--crm-accent)] ring-1 ring-[var(--crm-accent)]" : "border-[#E6E8EC]"}`}>
            <span className="text-[13px] text-[#5B6675]">{column.label}</span>
            <span className="text-[28px] font-bold leading-none">{opportunities.isLoading ? "…" : counts[column.key]}</span>
            <span className="h-1 overflow-hidden rounded bg-[#E6E8EC]"><i className="block h-full bg-[var(--crm-accent)]" style={{ width: `${(counts[column.key] / maxCount) * 100}%` }} /></span>
            <span className="truncate text-[12px] text-[#5B6675]">{stageHint[column.key]}</span>
          </Link>
        ))}
      </nav>

      <RemindersTodayPanel />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <Panel title="Novos contatos" action={<Tag tone={newContacts.length ? "info" : "neutro"}>{newContacts.length} para classificar</Tag>}>
            <p className="-mt-1 mb-1 text-[13px] text-[#5B6675]">Responda 4 perguntas rápidas e a família entra no funil.</p>
            {(isLoading || linked.isLoading) && <p className="py-4 text-sm text-[#5B6675]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</p>}
            {!isLoading && !linked.isLoading && !newContacts.length && <Empty>Nenhum contato novo esperando classificação.</Empty>}
            <ul className="divide-y divide-[#EEF0F3]">
              {(showAllNew ? newContacts : newContacts.slice(0, 6)).map((lead) => (
                <li key={lead.id} className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF1F5] text-xs font-bold text-[#3B4452]" aria-hidden="true">{initials(displayName(lead))}</span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/atendimentos?aba=todas&lead=${lead.id}`} className="block truncate font-semibold hover:underline">{displayName(lead)}</Link>
                    <p className="truncate text-[13px] text-[#5B6675]">{lead.last_inbound_message ? `“${displayPreview(lead.last_inbound_message)}”` : lead.triage_summary || "Sem mensagem registrada"}</p>
                  </div>
                  {(() => { const ad = adReferralOf(ads.data, lead.phone); return ad
                    ? <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold sm:inline ${adChipClass(ad.source_app)}`} title={ad.ad_headline || undefined}>{adLabel(ad)}</span>
                    : displaySource(lead.source) && <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold sm:inline ${sourceChipClass(lead.source)}`}>{displaySource(lead.source)}</span>; })()}
                  <span className="shrink-0 text-[13px] text-[#5B6675]">{timeAgo(lead.last_inbound_message_at || lead.created_at)}</span>
                  <Link to={`/atendimentos?aba=todas&lead=${lead.id}`} className={btn}>Responder</Link>
                  <button type="button" className={btn} onClick={() => openClassify(lead)}>Classificar</button>
                </li>
              ))}
            </ul>
            {newContacts.length > 6 && (
              <button type="button" className="mt-2 text-sm font-medium text-[var(--crm-accent)] underline" onClick={() => setShowAllNew((v) => !v)}>
                {showAllNew ? "Mostrar menos" : `Ver todos os ${newContacts.length}`}
              </button>
            )}
          </Panel>

          <Panel title="Aguardando resposta">
            {isLoading && <p className="py-4 text-sm text-[#5B6675]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</p>}
            {!isLoading && !needsYou.length && <Empty>Nenhuma família aguardando a secretaria agora.</Empty>}
            <ul className="divide-y divide-[#EEF0F3]">
              {needsYou.slice(0, 8).map((lead, index) => {
                const priority = attendancePriority(lead);
                const urgent = priority.level >= 3;
                return (
                  <li key={lead.id} className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
                    <Tag tone={urgent ? "urgente" : "atencao"}>{urgent ? "Urgente" : "Atenção"}</Tag>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{displayName(lead)}</p>
                      <p className="truncate text-[13px] text-[#5B6675]">{lead.handoff_reason || lead.triage_summary || displayPreview(lead.last_inbound_message) || priority.reason || "Aguardando resposta"}</p>
                    </div>
                    <span className="text-[13px] text-[#5B6675]">{timeAgo(lead.last_inbound_message_at || lead.handoff_at)}</span>
                    <Link to={`/atendimentos?status=todos&lead=${lead.id}`} className={index === 0 ? btnPrimary : btn}>Responder</Link>
                  </li>
                );
              })}
            </ul>
            {needsYou.length > 8 && <Link to="/atendimentos" className="mt-2 inline-block text-sm font-medium text-[var(--crm-accent)] underline">Ver todas as {needsYou.length} conversas</Link>}
          </Panel>
        </div>

        <div className="flex w-full flex-col gap-5 lg:w-[400px] lg:flex-none">
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
                        <button type="button" className={btn} onClick={() => void demo.setVisitStatus(visit.id, "realizada").then(refreshVisits)}>Visitou</button>
                        <button type="button" className={btn} onClick={() => void demo.setVisitStatus(visit.id, "faltou").then(refreshVisits)}>Faltou</button>
                      </span>
                    ) : activeVisit.includes(visit.status) ? (
                      <VisitStatusDialog visit={{ ...visit, studentName: opp?.students?.full_name || family }} onUpdated={refreshVisits} />
                    ) : (
                      <Tag tone={visit.status === "realizada" ? "ok" : "neutro"}>{visitLabel[visit.status] || visit.status}</Tag>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Retornar hoje" action={followUps.length ? <Tag tone="atencao">{followUps.length}</Tag> : undefined}>
            {opportunities.isLoading && <p className="py-3 text-sm text-[#5B6675]">Carregando…</p>}
            {!opportunities.isLoading && !followUps.length && <Empty>Todas as famílias estão com retorno em dia.</Empty>}
            <ul className="divide-y divide-[#EEF0F3]">
              {followUps.slice(0, 8).map((item) => {
                const name = item.guardians?.full_name || item.students?.full_name || "Família";
                const overdue = item.next_action_at && Date.parse(item.next_action_at) < Date.now();
                return (
                  <li key={item.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1"><p className="truncate">{name}</p>
                      <p className="truncate text-[13px] text-[#5B6675]">
                        {item.next_action ? `${item.next_action} · ` : ""}{item.next_action_at ? (overdue ? `previsto ${timeAgo(item.next_action_at)}` : "hoje") : `parado ${timeAgo(item.updated_at)}`}
                      </p></div>
                    <TemperatureChip score={item.probability_score} />
                    <Link to={item.legacy_lead_id ? `/atendimentos?status=todos&lead=${item.legacy_lead_id}` : `/funil?ficha=${item.id}`} className={btn}>Retomar</Link>
                  </li>
                );
              })}
            </ul>
            {followUps.length > 8 && <Link to="/funil" className="mt-2 inline-block text-sm font-medium text-[var(--crm-accent)] underline">Ver no funil</Link>}
          </Panel>

          <EnrollmentComparisonCard />
        </div>
      </div>

      <ClassifyContactDialog lead={classifyLead} open={classifyOpen} onOpenChange={setClassifyOpen} />
    </Page>
  );
}
