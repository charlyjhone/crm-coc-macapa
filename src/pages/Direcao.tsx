/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas escolares ainda não estão nos tipos gerados do Supabase. */
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, Download, Loader2, Megaphone, Printer, Star, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { SCHOOL_TIME_ZONE, schoolDateTimeInput } from "@/lib/schoolDateTime";
import { Empty, Page, PageTitle, Panel } from "@/components/crm/ui";
import { EnrollmentComparisonPanel } from "@/components/crm/EnrollmentComparison";
import { DEMO_MODE, demoDirecaoData } from "@/lib/demo";
import { crmTheme as t, readableText } from "@/lib/crmTheme";
import { SOURCE_CATEGORIES, isPaidSource, sourceCategory } from "@/lib/funnel";
import { btn } from "@/components/crm/ui";
import { campaignLabel, useAdReferrals } from "@/hooks/useAdReferrals";

const DAY = 86_400_000;
const ratingColors = ["#D92D20", "#F79009", "#98A2B3", t.accentLight, t.accent];
const periods = [7, 30, 90] as const;
type Period = (typeof periods)[number];
const wantStages = new Set(["documentacao_pendente", "matricula_em_conclusao", "matriculado"]);
const visitedStages = new Set(["visita_realizada", "condicoes_apresentadas", "documentacao_pendente", "matricula_em_conclusao", "matriculado"]);
const originCategory = sourceCategory;

const investmentKey = () => `crm-investimento-anuncios-${import.meta.env.MODE}-${schoolDateTimeInput(new Date()).slice(0, 7)}`;
function readInvestment() { try { return localStorage.getItem(investmentKey()) || ""; } catch { return ""; } }
function saveInvestment(value: string) { try { localStorage.setItem(investmentKey(), value); } catch { /* sem storage */ } }
const parseMoney = (value: string) => { const n = Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Data = {
  leads: { created_at: string }[];
  visits: { status: string; scheduled_at: string; completed_at: string | null; created_at: string }[];
  opportunities: { stage: string; source_channel: string | null; source_campaign?: string | null; loss_reason: string | null; lost_at: string | null; status_updated_at: string | null; updated_at: string; created_at?: string }[];
  created: { stage: string; source_channel: string | null; source_campaign: string | null; created_at: string }[];
  origins: { lead_id: string; metadata: any; created_at: string }[];
  ratings: { lead_id: string; metadata: any; created_at: string }[];
};

function useDirecaoData(period: Period) {
  return useQuery<Data>({
    queryKey: ["direcao", period],
    refetchInterval: 300_000,
    queryFn: async () => {
      if (DEMO_MODE) { const d = demoDirecaoData(); return { ...d, created: d.opportunities.map((o) => ({ stage: o.stage, source_channel: o.source_channel, source_campaign: o.source_campaign, created_at: o.created_at })) } as Data; }
      const client = supabase as any;
      const since = new Date(Date.now() - 2 * period * DAY).toISOString();
      const [leads, visits, opportunities, origins, ratings, created] = await Promise.all([
        client.from("leads").select("created_at").eq("archived", false).gte("created_at", since).limit(5000),
        client.from("school_visits").select("status,scheduled_at,completed_at,created_at").gte("scheduled_at", since).limit(5000),
        client.from("enrollment_opportunities").select("stage,source_channel,loss_reason,lost_at,status_updated_at,updated_at").gte("updated_at", since).limit(5000),
        client.from("activity_log").select("lead_id,metadata,created_at").eq("source", "school-triage").eq("metadata->>survey", "origin").gte("created_at", since).limit(2000),
        client.from("activity_log").select("lead_id,metadata,created_at").eq("source", "school-triage").eq("metadata->>survey", "rating").gte("created_at", since).limit(2000),
        client.from("enrollment_opportunities").select("stage,source_channel,source_campaign,created_at").gte("created_at", since).limit(5000),
      ]);
      const failed = [leads, visits, opportunities, created].find((r) => r.error);
      if (failed) throw failed.error;
      return {
        leads: leads.data || [], visits: visits.data || [], opportunities: opportunities.data || [],
        origins: origins.error ? [] : origins.data || [], ratings: ratings.error ? [] : ratings.data || [], created: created.data || [],
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
  const [investment, setInvestment] = useState(readInvestment);
  const { data, isLoading, isError } = useDirecaoData(period);
  const ads = useAdReferrals();

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
    const origins = SOURCE_CATEGORIES
      .map((c) => ({ key: c.key, name: c.label, value: originCounts.get(c.key) || 0, color: c.color }))
      .filter((item) => item.value > 0);

    // Resultado por origem: famílias que entraram no funil no período.
    const createdNow = data.created.filter((o) => inCur(o.created_at));
    const byOrigin = new Map<string, { families: number; visited: number; want: number }>();
    for (const o of createdNow) {
      const key = originCategory(o.source_channel === "cadastro_manual" ? null : o.source_channel);
      const row = byOrigin.get(key) || { families: 0, visited: 0, want: 0 };
      row.families++; if (visitedStages.has(o.stage)) row.visited++; if (wantStages.has(o.stage)) row.want++;
      byOrigin.set(key, row);
    }
    const originRows = SOURCE_CATEGORIES.filter((c) => byOrigin.has(c.key)).map((c) => ({ ...c, ...byOrigin.get(c.key)! }))
      .sort((a, b) => b.families - a.families);
    const paidFamilies = createdNow.filter((o) => isPaidSource(o.source_channel));
    const campaigns = new Map<string, { campaign: string; where: string; chats: number; families: number; visited: number; want: number }>();
    // Conversas de WhatsApp iniciadas por anúncio (registradas automaticamente).
    let adChats = 0;
    for (const r of ads.data?.values() || []) {
      if (!inCur(r.first_at) || r.source_app === "outro") continue;
      adChats++;
      const campaign = campaignLabel(r.ad_headline);
      const where = r.source_app === "facebook" ? "Facebook" : "Instagram";
      const key = `${campaign}|${where}`;
      const row = campaigns.get(key) || { campaign, where, chats: 0, families: 0, visited: 0, want: 0 };
      row.chats++; campaigns.set(key, row);
    }
    for (const o of paidFamilies) {
      const campaign = campaignLabel(o.source_campaign?.trim() || "Campanha não informada");
      const where = o.source_channel === "anuncio_facebook" ? "Facebook" : "Instagram";
      const key = `${campaign}|${where}`;
      const row = campaigns.get(key) || { campaign, where, chats: 0, families: 0, visited: 0, want: 0 };
      row.families++; if (visitedStages.has(o.stage)) row.visited++; if (wantStages.has(o.stage)) row.want++;
      campaigns.set(key, row);
    }
    const campaignRows = Array.from(campaigns.values()).sort((a, b) => b.chats - a.chats || b.families - a.families);
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

    return { contacts, contactsPrev, visited, visitedPrev, scheduled, want, wantPrev, ratingCounts, ratingTotal, ratingAvg, origins, originTotal, originFrom, series, lossRows,
      originRows, paidCount: paidFamilies.length, familiesInPeriod: createdNow.length, campaignRows, adChats };
  }, [data, period, ads.data]);

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
        title="Relatórios"
        subtitle={`Últimos ${period} dias, comparado aos ${period} dias anteriores`}
        actions={
          <>
          <button type="button" className={`${btn} print:hidden`} disabled={!view} onClick={() => view && downloadCsv(`relatorio-origens-${period}d.csv`, [
            ["Origem", "Famílias no funil", "Visitaram", "Querem matricular", "Conversão"],
            ...view.originRows.map((r) => [r.label, r.families, r.visited, r.want, r.families ? `${Math.round((r.want / r.families) * 100)}%` : "—"]),
            [], ["Campanha", "Onde", "Conversas no WhatsApp", "Famílias no funil", "Visitaram", "Querem matricular"],
            ...view.campaignRows.map((r) => [r.campaign, r.where, r.chats, r.families, r.visited, r.want]),
          ])}><Download className="h-4 w-4" aria-hidden="true" />CSV</button>
          <button type="button" className={`${btn} print:hidden`} onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden="true" />PDF</button>
          <div className="flex rounded-[10px] bg-white p-[3px] shadow-[0_1px_2px_rgba(16,24,40,.06)]" role="group" aria-label="Período">
            {periods.map((p) => (
              <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}
                className={`min-h-[34px] rounded-lg px-3 text-sm font-medium ${period === p ? "bg-[var(--crm-accent)] text-white" : "text-[#5B6675]"}`}>{p} dias</button>
            ))}
          </div>
          </>
        }
      />

      {isLoading && <p className="text-sm text-[#5B6675]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando indicadores…</p>}
      {isError && <p className="text-sm text-[#B42318]">Não foi possível carregar os indicadores.</p>}

      <EnrollmentComparisonPanel />

      {view && (
        <>
          <div className="grid gap-[18px] sm:grid-cols-2 xl:grid-cols-5">
            <Kpi icon={<Users className="h-[18px] w-[18px]" />} value={view.contacts} label="Novos contatos" chip={delta(view.contacts, view.contactsPrev)} />
            <Kpi icon={<Megaphone className="h-[18px] w-[18px]" />} value={view.adChats} label="Conversas vindas de anúncios"
              chip={view.paidCount ? `${view.paidCount} no funil` : null} />
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

          <Panel title="Qual origem traz famílias que querem matricular?">
            <p className="-mt-1 text-[13px] text-[#5B6675]">Famílias que entraram no funil no período, comparando anúncios pagos com os canais sem custo.</p>
            {!view.originRows.length ? <div className="mt-3"><Empty>Nenhuma família entrou no funil neste período.</Empty></div> : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[560px] text-[13.5px]">
                  <thead><tr className="border-b border-[#E6E8EC] text-left text-[11.5px] uppercase tracking-[.05em] text-[#5B6675]">
                    <th className="px-2 py-2 font-bold">Origem</th><th className="px-2 py-2 text-right font-bold">Famílias</th><th className="px-2 py-2 text-right font-bold">Visitaram</th><th className="px-2 py-2 text-right font-bold">Querem matricular</th><th className="px-2 py-2 text-right font-bold">Conversão</th>
                  </tr></thead>
                  <tbody>
                    {view.originRows.map((r) => {
                      const conv = r.families ? Math.round((r.want / r.families) * 100) : 0;
                      return (
                        <tr key={r.key} className="border-b border-[#EEF0F3]">
                          <td className="px-2 py-2.5"><span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: r.color }} />{r.label}</span></td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{r.families}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{r.visited}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{r.want}</td>
                          <td className="px-2 py-2.5"><span className="flex items-center justify-end gap-2 tabular-nums">{conv}%<span className="h-2 w-16 overflow-hidden rounded bg-[#EEF0F3]"><i className="block h-full bg-[var(--crm-accent)]" style={{ width: `${conv}%` }} /></span></span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Campanhas de anúncio">
            <p className="-mt-1 mb-2 text-[13px] text-[#5B6675]">Conversas de WhatsApp que começaram por um anúncio “Clique para conversar” são identificadas sozinhas.</p>
            {!view.campaignRows.length ? <Empty>Nenhuma conversa ou família de anúncio neste período.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[13.5px]">
                  <thead><tr className="border-b border-[#E6E8EC] text-left text-[11.5px] uppercase tracking-[.05em] text-[#5B6675]">
                    <th className="px-2 py-2 font-bold">Anúncio</th><th className="px-2 py-2 font-bold">Onde</th><th className="px-2 py-2 text-right font-bold">Conversas</th><th className="px-2 py-2 text-right font-bold">No funil</th><th className="px-2 py-2 text-right font-bold">Visitaram</th><th className="px-2 py-2 text-right font-bold">Querem matricular</th>
                  </tr></thead>
                  <tbody>
                    {view.campaignRows.map((r) => (
                      <tr key={`${r.campaign}-${r.where}`} className="border-b border-[#EEF0F3]">
                        <td className="px-2 py-2.5">{r.campaign}</td><td className="px-2 py-2.5">{r.where}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{r.chats}</td><td className="px-2 py-2.5 text-right tabular-nums">{r.families}</td><td className="px-2 py-2.5 text-right tabular-nums">{r.visited}</td><td className="px-2 py-2.5 text-right tabular-nums">{r.want}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-[#EEF0F3] pt-4">
              <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[13px] font-semibold text-[#344054]">Investido em anúncios neste mês
                <input className="min-h-10 rounded-[10px] border border-[#D3D7DE] px-3 font-normal" inputMode="decimal" placeholder="R$ 0,00" value={investment}
                  onChange={(e) => { setInvestment(e.target.value); saveInvestment(e.target.value); }} />
              </label>
              <div className="min-w-[200px] flex-1">
                <p className="text-[13px] text-[#5B6675]">Custo por conversa vinda de anúncio</p>
                <b className="text-xl">{parseMoney(investment) && (view.adChats || view.paidCount) ? money(parseMoney(investment)! / (view.adChats || view.paidCount)) : "—"}</b>
                {parseMoney(investment) && view.paidCount > 0 && <p className="text-[12px] text-[#5B6675]">{money(parseMoney(investment)! / view.paidCount)} por família no funil</p>}
                {parseMoney(investment) && view.campaignRows.reduce((a, r) => a + r.want, 0) > 0 && (
                  <p className="text-[12px] text-[#5B6675]">{money(parseMoney(investment)! / view.campaignRows.reduce((a, r) => a + r.want, 0))} por família que quer matricular</p>
                )}
              </div>
              <p className="w-full text-[11.5px] text-[#5B6675]">O valor fica guardado só neste navegador e vale para o período selecionado.</p>
            </div>
          </Panel>

          <div className="grid gap-[18px] xl:grid-cols-3">
            <Panel title="Caminho das famílias">
              <ol className="mt-3 flex flex-col gap-3">
                {funnel.map((step, i) => {
                  const prev = i > 0 ? funnel[i - 1].value : null;
                  const pass = prev ? Math.round((step.value / prev) * 100) : null;
                  return (
                    <li key={step.label}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="text-[#344054]">{step.label.charAt(0).toUpperCase() + step.label.slice(1)}</span>
                        <span className="flex items-baseline gap-2">
                          {pass !== null && <span className="text-xs text-[#5B6675]">{pass}% da etapa anterior</span>}
                          <b className="w-8 text-right tabular-nums text-[#1B2430]">{step.value}</b>
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-[#EEF0F3]">
                        <div className="h-full rounded-full" style={{ width: `${step.value ? Math.max(2, (step.value / funnelMax) * 100) : 0}%`, background: step.color }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-4 border-t border-[#EEF0F3] pt-3 text-[13px] text-[#5B6675]">
                Do contato até querer matricular: <b className="text-[#1B2430]">{view.contacts ? `${Math.round((view.want / view.contacts) * 100)}%` : "—"}</b>
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
