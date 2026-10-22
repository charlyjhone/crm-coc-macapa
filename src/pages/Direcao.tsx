/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas escolares ainda não estão nos tipos gerados do Supabase. */
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, Loader2, Star, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { SCHOOL_TIME_ZONE, schoolDateTimeInput } from "@/lib/schoolDateTime";
import { Empty, Page, PageTitle, Panel } from "@/components/crm/ui";
import { EnrollmentComparisonPanel } from "@/components/crm/EnrollmentComparison";
import { DEMO_MODE, demoDirecaoData } from "@/lib/demo";
import { crmTheme as t, readableText } from "@/lib/crmTheme";

const DAY = 86_400_000;
const ratingColors = ["#D92D20", "#F79009", "#98A2B3", t.accentLight, t.accent];
const periods = [7, 30, 90] as const;
type Period = (typeof periods)[number];
const wantStages = new Set(["documentacao_pendente", "matricula_em_conclusao", "matriculado"]);
const originColors: Record<string, string> = { indicacao: t.accent, redes_sociais: t.chart2, panfletagem_outdoor: t.warm, outros: "#98A2B3" };
const originLabels: Record<string, string> = { indicacao: "Indicação", redes_sociais: "Redes sociais", panfletagem_outdoor: "Panfletagem", outros: "Outros" };

const originCategory = (value: string | null | undefined) => {
  const v = (value || "").toLowerCase();
  if (["instagram", "facebook", "redes_sociais"].includes(v)) return "redes_sociais";
  if (v === "indicacao") return "indicacao";
  if (v === "panfletagem_outdoor") return "panfletagem_outdoor";
  return "outros";
};

type Data = {
  leads: { created_at: string }[];
  visits: { status: string; scheduled_at: string; completed_at: string | null; created_at: string }[];
  opportunities: { stage: string; source_channel: string | null; loss_reason: string | null; lost_at: string | null; status_updated_at: string | null; updated_at: string }[];
  origins: { lead_id: string; metadata: any; created_at: string }[];
  ratings: { lead_id: string; metadata: any; created_at: string }[];
};

function useDirecaoData(period: Period) {
  return useQuery<Data>({
    queryKey: ["direcao", period],
    refetchInterval: 300_000,
    queryFn: async () => {
      if (DEMO_MODE) return demoDirecaoData() as Data;
      const client = supabase as any;
      const since = new Date(Date.now() - 2 * period * DAY).toISOString();
      const [leads, visits, opportunities, origins, ratings] = await Promise.all([
        client.from("leads").select("created_at").eq("archived", false).gte("created_at", since).limit(5000),
        client.from("school_visits").select("status,scheduled_at,completed_at,created_at").gte("scheduled_at", since).limit(5000),
        client.from("enrollment_opportunities").select("stage,source_channel,loss_reason,lost_at,status_updated_at,updated_at").gte("updated_at", since).limit(5000),
        client.from("activity_log").select("lead_id,metadata,created_at").eq("source", "school-triage").eq("metadata->>survey", "origin").gte("created_at", since).limit(2000),
        client.from("activity_log").select("lead_id,metadata,created_at").eq("source", "school-triage").eq("metadata->>survey", "rating").gte("created_at", since).limit(2000),
      ]);
      const failed = [leads, visits, opportunities].find((r) => r.error);
      if (failed) throw failed.error;
      return {
        leads: leads.data || [], visits: visits.data || [], opportunities: opportunities.data || [],
        origins: origins.error ? [] : origins.data || [], ratings: ratings.error ? [] : ratings.data || [],
      };
    },
  });
}

function Kpi({ icon, value, label, chip }: { icon: ReactNode; value: string | number; label: string; chip?: string | null }) {
  return (
    <Panel className="flex-1">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-[var(--crm-accent-soft)] text-[var(--crm-accent)]">{icon}</span>
        {chip && <span className="rounded-full bg-[#F2F4F7] px-2 py-0.5 text-xs font-semibold text-[#344054]">{chip}</span>}
      </div>
      <p className="mt-3 text-[30px] font-bold leading-tight">{value}</p>
      <p className="text-[13px] text-[#5B6675]">{label}</p>
    </Panel>
  );
}

function delta(current: number, previous: number) {
  if (!previous) return current ? "novo" : null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

export default function Direcao() {
  const [period, setPeriod] = useState<Period>(30);
  const { data, isLoading, isError } = useDirecaoData(period);

  const view = useMemo(() => {
    if (!data) return null;
    const now = Date.now();
    const start = now - period * DAY;
    const prevStart = now - 2 * period * DAY;
    const inCur = (v: string | null | undefined) => !!v && Date.parse(v) >= start;
    const inPrev = (v: string | null | undefined) => !!v && Date.parse(v) >= prevStart && Date.parse(v) < start;

    const contacts = data.leads.filter((l) => inCur(l.created_at)).length;
    const contactsPrev = data.leads.filter((l) => inPrev(l.created_at)).length;
    const visitDone = (v: Data["visits"][number]) => v.status === "realizada";
    const visited = data.visits.filter((v) => visitDone(v) && inCur(v.completed_at || v.scheduled_at)).length;
    const visitedPrev = data.visits.filter((v) => visitDone(v) && inPrev(v.completed_at || v.scheduled_at)).length;
    const scheduled = data.visits.filter((v) => v.status !== "cancelada" && inCur(v.created_at)).length;
    const want = data.opportunities.filter((o) => wantStages.has(o.stage) && inCur(o.status_updated_at || o.updated_at)).length;
    const wantPrev = data.opportunities.filter((o) => wantStages.has(o.stage) && inPrev(o.status_updated_at || o.updated_at)).length;

    // Satisfação: uma resposta por família, a mais recente.
    const seenRating = new Set<string>();
    const ratingCounts = [0, 0, 0, 0, 0];
    for (const row of [...data.ratings].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
      if (!inCur(row.created_at) || !row.lead_id || seenRating.has(row.lead_id)) continue;
      const r = row.metadata?.rating;
      if (!Number.isInteger(r) || r < 1 || r > 5) continue;
      seenRating.add(row.lead_id); ratingCounts[r - 1]++;
    }
    const ratingTotal = ratingCounts.reduce((a, b) => a + b, 0);
    const ratingAvg = ratingTotal ? ratingCounts.reduce((sum, c, i) => sum + c * (i + 1), 0) / ratingTotal : null;

    // Origem: pesquisa com a família; sem respostas, usa a origem registrada no funil.
    const originCounts = new Map<string, number>();
    const seenOrigin = new Set<string>();
    for (const row of data.origins) {
      if (!inCur(row.created_at) || !row.lead_id || seenOrigin.has(row.lead_id)) continue;
      const value = row.metadata?.source_channel;
      if (typeof value !== "string" || !value) continue;
      seenOrigin.add(row.lead_id);
      const key = originCategory(value); originCounts.set(key, (originCounts.get(key) || 0) + 1);
    }
    let originFrom = "pesquisa";
    if (!originCounts.size) {
      originFrom = "funil";
      for (const o of data.opportunities) {
        if (!inCur(o.updated_at) || !o.source_channel || o.source_channel === "cadastro_manual") continue;
        const key = originCategory(o.source_channel); originCounts.set(key, (originCounts.get(key) || 0) + 1);
      }
    }
    const origins = ["indicacao", "redes_sociais", "panfletagem_outdoor", "outros"]
      .map((key) => ({ key, name: originLabels[key], value: originCounts.get(key) || 0, color: originColors[key] }))
      .filter((item) => item.value > 0);
    const originTotal = origins.reduce((a, b) => a + b.value, 0);

    // Contatos ao longo do período: por dia (7 dias) ou por semana.
    const bucketDays = period === 7 ? 1 : 7;
    const buckets = Math.ceil(period / bucketDays);
    const series = Array.from({ length: buckets }, (_, i) => {
      const from = start + i * bucketDays * DAY;
      const to = from + bucketDays * DAY;
      const label = period === 7
        ? new Intl.DateTimeFormat("pt-BR", { timeZone: SCHOOL_TIME_ZONE, weekday: "short" }).format(new Date(from)).replace(".", "")
        : schoolDateTimeInput(new Date(from)).slice(5, 10).split("-").reverse().join("/");
      return { label, contatos: data.leads.filter((l) => { const t = Date.parse(l.created_at); return t >= from && t < to; }).length };
    });

    const losses = new Map<string, number>();
    for (const o of data.opportunities) {
      if (o.stage !== "perdido" || !inCur(o.lost_at || o.updated_at)) continue;
      const raw = (o.loss_reason || "Não informado").trim();
      const key = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      losses.set(key, (losses.get(key) || 0) + 1);
    }
    const lossRows = Array.from(losses, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);

    return { contacts, contactsPrev, visited, visitedPrev, scheduled, want, wantPrev, ratingCounts, ratingTotal, ratingAvg, origins, originTotal, originFrom, series, lossRows };
  }, [data, period]);

  const fmt1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const funnel = view ? [
    { label: "contatos", value: view.contacts, color: t.accent, text: readableText(t.accent) },
    { label: "visitas agendadas", value: view.scheduled, color: t.accent2, text: readableText(t.accent2) },
    { label: "visitaram", value: view.visited, color: t.accent3, text: readableText(t.accent3) },
    { label: "querem matricular", value: view.want, color: t.warm, text: readableText(t.warm) },
  ] : [];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));
  const lossMax = Math.max(1, ...(view?.lossRows.map((r) => r.count) || [1]));

  return (
    <Page>
      <PageTitle
        title="Direção"
        subtitle={`Últimos ${period} dias, comparado aos ${period} dias anteriores`}
        actions={
          <div className="flex rounded-[10px] bg-white p-[3px] shadow-[0_1px_2px_rgba(16,24,40,.06)]" role="group" aria-label="Período">
            {periods.map((p) => (
              <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}
                className={`min-h-[34px] rounded-lg px-3 text-sm font-medium ${period === p ? "bg-[var(--crm-accent)] text-white" : "text-[#5B6675]"}`}>{p} dias</button>
            ))}
          </div>
        }
      />

      {isLoading && <p className="text-sm text-[#5B6675]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando indicadores…</p>}
      {isError && <p className="text-sm text-[#B42318]">Não foi possível carregar os indicadores.</p>}

      <EnrollmentComparisonPanel />

      {view && (
        <>
          <div className="grid gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={<Users className="h-[18px] w-[18px]" />} value={view.contacts} label="Novos contatos" chip={delta(view.contacts, view.contactsPrev)} />
            <Kpi icon={<CalendarDays className="h-[18px] w-[18px]" />} value={view.visited} label="Visitas realizadas" chip={delta(view.visited, view.visitedPrev)} />
            <Kpi icon={<Check className="h-[18px] w-[18px]" />} value={view.want} label="Querem matricular" chip={delta(view.want, view.wantPrev)} />
            <Kpi icon={<Star className="h-[18px] w-[18px]" />} value={view.ratingAvg ? fmt1(view.ratingAvg) : "—"} label="Satisfação média, de 5"
              chip={view.ratingTotal ? `${view.ratingTotal} ${view.ratingTotal === 1 ? "resposta" : "respostas"}` : null} />
          </div>

          <div className="grid gap-[18px] xl:grid-cols-3">
            <Panel title={period === 7 ? "Novos contatos por dia" : "Novos contatos por semana"} className="xl:col-span-2">
              <div className="h-[230px]" role="img" aria-label={`Novos contatos: ${view.series.map((s) => `${s.label} ${s.contatos}`).join(", ")}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={view.series} margin={{ top: 16, right: 12, left: -18, bottom: 0 }}>
                    <defs><linearGradient id="contatosFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={t.accent} stopOpacity={0.28} /><stop offset="1" stopColor={t.accent} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="#EEF0F3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#5B6675", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: "#5B6675", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: number) => [v, "Contatos"]} contentStyle={{ borderRadius: 10, border: "1px solid #E4E7EC" }} />
                    <Area type="monotone" dataKey="contatos" stroke={t.accent} strokeWidth={3} fill="url(#contatosFill)" dot={{ r: 4, fill: "#fff", stroke: t.accent, strokeWidth: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="De onde vieram as famílias">
              {!view.originTotal ? <Empty>Ainda sem respostas sobre como conheceram a escola.</Empty> : (
                <div className="mt-2 flex items-center gap-4">
                  <div className="relative h-[140px] w-[140px] shrink-0" role="img" aria-label={`Origem: ${view.origins.map((o) => `${o.name} ${o.value}`).join(", ")}`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart><Pie data={view.origins} dataKey="value" innerRadius={44} outerRadius={64} startAngle={90} endAngle={-270} stroke="none">
                        {view.origins.map((o) => <Cell key={o.key} fill={o.color} />)}
                      </Pie></PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><b className="text-2xl">{view.originTotal}</b><span className="text-[11px] text-[#5B6675]">famílias</span></div>
                  </div>
                  <div className="flex-1 text-[13px]">
                    {view.origins.map((o) => (
                      <div key={o.key} className="flex items-center gap-2 py-1"><i className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: o.color }} />{o.name}<b className="ml-auto">{o.value}</b></div>
                    ))}
                    {view.originFrom === "funil" && <p className="mt-2 text-[11px] text-[#5B6675]">Pela origem registrada no funil.</p>}
                  </div>
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-[18px] xl:grid-cols-3">
            <Panel title="Caminho das famílias">
              <div className="mt-3 flex flex-col gap-2">
                {funnel.map((step) => (
                  <div key={step.label} className="mx-auto flex h-[30px] items-center justify-center rounded-lg px-2 text-[13px] font-semibold"
                    style={{ width: `${Math.max(38, (step.value / funnelMax) * 100)}%`, background: step.color, color: step.text }}>
                    {step.value} {step.label}
                  </div>
                ))}
              </div>
              <p className="mt-2.5 text-[13px] text-[#5B6675]">
                Conversão de contato até querer matricular: {view.contacts ? `${Math.round((view.want / view.contacts) * 100)}%` : "—"}
              </p>
            </Panel>

            <Panel title="Satisfação no atendimento">
              {!view.ratingTotal ? <Empty>Nenhuma avaliação neste período.</Empty> : (
                <>
                  <div className="mt-2 flex items-baseline gap-2"><span className="text-[30px] font-bold">{fmt1(view.ratingAvg!)}</span><span className="text-[13px] text-[#5B6675]">de 5 · {view.ratingTotal} {view.ratingTotal === 1 ? "resposta" : "respostas"}</span></div>
                  <div className="my-3 flex h-3.5 overflow-hidden rounded-lg bg-[#EEF0F3]">
                    {[4, 3, 2, 1, 0].map((i) => view.ratingCounts[i] ? <i key={i} style={{ width: `${(view.ratingCounts[i] / view.ratingTotal) * 100}%`, background: ratingColors[i] }} /> : null)}
                  </div>
                  {[4, 3, 2, 1, 0].filter((i) => view.ratingCounts[i]).map((i) => (
                    <div key={i} className="flex items-center gap-2 py-1 text-[13px]"><i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: ratingColors[i] }} />Nota {i + 1}<b className="ml-auto">{Math.round((view.ratingCounts[i] / view.ratingTotal) * 100)}%</b></div>
                  ))}
                </>
              )}
            </Panel>

            <Panel title="Por que desistiram">
              {!view.lossRows.length ? <Empty>Nenhuma desistência registrada neste período.</Empty> : (
                <div className="mt-2">
                  {view.lossRows.map((row) => (
                    <div key={row.name} className="flex items-center gap-2.5 py-1.5">
                      <span className="w-[120px] truncate text-[13px]" title={row.name}>{row.name}</span>
                      <span className="h-2.5 flex-1 overflow-hidden rounded-md bg-[#EEF0F3]"><i className="block h-full rounded-md bg-[var(--crm-warm)]" style={{ width: `${(row.count / lossMax) * 100}%` }} /></span>
                      <b className="w-6 text-right">{row.count}</b>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </Page>
  );
}
