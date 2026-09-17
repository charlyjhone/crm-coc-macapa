import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, Megaphone, Target, TrendingUp, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type Opportunity = {
  id: string;
  source_channel: string | null;
  source_campaign: string | null;
  stage: string;
  probability_score: number;
  expected_monthly_revenue: number | null;
};

type Visit = {
  opportunity_id: string;
  status: string;
};

type SourceRow = {
  name: string;
  leads: number;
  qualified: number;
  visits: number;
  enrolled: number;
  lost: number;
  conversion: number;
  visitRate: number;
  forecast: number;
};

const channelLabels: Record<string, string> = {
  cadastro_manual: "Cadastro manual",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  google: "Google",
  indicacao: "Indicação",
  evento: "Evento",
  site: "Site",
  telefone: "Telefone",
};

const displayName = (value: string | null, fallback: string) => {
  if (!value?.trim()) return fallback;
  return channelLabels[value] || value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const qualifiedStages = new Set([
  "qualificado", "visita_agendada", "visita_realizada", "condicoes_apresentadas",
  "documentacao_pendente", "matricula_em_conclusao", "matriculado",
]);

const buildRows = (
  opportunities: Opportunity[],
  visitIds: Set<string>,
  key: "source_channel" | "source_campaign",
  fallback: string,
) => {
  const groups = new Map<string, Opportunity[]>();
  opportunities.forEach((item) => {
    const name = displayName(item[key], fallback);
    groups.set(name, [...(groups.get(name) || []), item]);
  });
  return Array.from(groups.entries())
    .map(([name, items]): SourceRow => {
      const leads = items.length;
      const visits = items.filter((item) => visitIds.has(item.id)).length;
      const enrolled = items.filter((item) => item.stage === "matriculado").length;
      const qualified = items.filter((item) => qualifiedStages.has(item.stage)).length;
      const lost = items.filter((item) => item.stage === "perdido").length;
      const forecast = items.reduce((total, item) => {
        if (item.stage === "matriculado") return total + 1;
        if (item.stage === "perdido") return total;
        return total + item.probability_score / 100;
      }, 0);
      return {
        name,
        leads,
        qualified,
        visits,
        enrolled,
        lost,
        conversion: leads ? (enrolled / leads) * 100 : 0,
        visitRate: leads ? (visits / leads) * 100 : 0,
        forecast,
      };
    })
    .sort((a, b) => b.enrolled - a.enrolled || b.leads - a.leads);
};

const percentage = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value) + "%";

const AcquisitionAnalytics = () => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [foundationPending, setFoundationPending] = useState(false);

  useEffect(() => {
    const load = async () => {
      const client = supabase as any;
      const [opportunityResult, visitResult] = await Promise.all([
        client.from("enrollment_opportunities")
          .select("id,source_channel,source_campaign,stage,probability_score,expected_monthly_revenue"),
        client.from("school_visits").select("opportunity_id,status"),
      ]);
      if (opportunityResult.error || visitResult.error) {
        setFoundationPending(true);
        return;
      }
      setFoundationPending(false);
      setOpportunities(opportunityResult.data || []);
      setVisits(visitResult.data || []);
    };
    load();
  }, []);

  const visitIds = useMemo(
    () => new Set(visits.filter((visit) => visit.status !== "cancelada").map((visit) => visit.opportunity_id)),
    [visits],
  );
  const sources = useMemo(
    () => buildRows(opportunities, visitIds, "source_channel", "Origem não informada"),
    [opportunities, visitIds],
  );
  const campaigns = useMemo(
    () => buildRows(opportunities.filter((item) => item.source_campaign), visitIds, "source_campaign", "Sem campanha"),
    [opportunities, visitIds],
  );

  const metrics = useMemo(() => {
    const total = opportunities.length;
    const enrolled = opportunities.filter((item) => item.stage === "matriculado").length;
    const qualified = opportunities.filter((item) => qualifiedStages.has(item.stage)).length;
    const visited = opportunities.filter((item) => visitIds.has(item.id)).length;
    return {
      total,
      enrolled,
      conversion: total ? (enrolled / total) * 100 : 0,
      qualification: total ? (qualified / total) * 100 : 0,
      visitRate: total ? (visited / total) * 100 : 0,
      bestSource: sources[0]?.name || "Sem dados",
    };
  }, [opportunities, sources, visitIds]);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-emerald-950/10 bg-white px-5 py-5 md:px-8">
        <div className="mx-auto max-w-[1480px]">
          <p className="text-sm font-semibold text-emerald-700">Inteligência de captação</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Origem e conversão</h1>
          <p className="mt-1 text-sm text-slate-600">Descubra quais canais e campanhas realmente levam famílias até a matrícula.</p>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] space-y-7 p-5 md:p-8">
        {foundationPending && (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">Os indicadores serão preenchidos após a migração escolar ser aplicada em homologação.</p>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Interessados", value: metrics.total, note: "oportunidades registradas", icon: Users },
            { label: "Qualificação", value: percentage(metrics.qualification), note: "avançaram no atendimento", icon: Target },
            { label: "Taxa de visita", value: percentage(metrics.visitRate), note: "tiveram visita registrada", icon: BarChart3 },
            { label: "Conversão", value: percentage(metrics.conversion), note: "viraram matrícula", icon: TrendingUp },
            { label: "Melhor origem", value: metrics.bestSource, note: "por matrículas e volume", icon: Megaphone },
          ].map(({ label, value, note, icon: Icon }) => (
            <Card key={label} className="border-emerald-950/10 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-600">{label}</p>
                    <p className="mt-2 truncate text-2xl font-bold text-slate-950">{value}</p>
                  </div>
                  <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Icon className="h-5 w-5" /></span>
                </div>
                <p className="mt-2 text-xs text-slate-600">{note}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card className="border-emerald-950/10">
            <CardHeader>
              <CardTitle className="text-lg text-slate-950">Resultados por canal</CardTitle>
            </CardHeader>
            <CardContent>
              {sources.length ? (
                <div className="h-[340px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sources.slice(0, 8)} margin={{ top: 8, right: 12, left: -18, bottom: 35 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 12 }} angle={-20} textAnchor="end" interval={0} />
                      <YAxis allowDecimals={false} tick={{ fill: "#475569", fontSize: 12 }} />
                      <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#d1e1da" }} />
                      <Legend verticalAlign="top" height={32} />
                      <Bar dataKey="leads" name="Interessados" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="visits" name="Visitas" fill="#84cc16" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="enrolled" name="Matrículas" fill="#047857" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState text="Cadastre a origem das oportunidades para comparar os canais." />
              )}
            </CardContent>
          </Card>

          <Card className="border-emerald-950/10">
            <CardHeader>
              <CardTitle className="text-lg text-slate-950">Conversão por origem</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {sources.slice(0, 7).map((source) => (
                <div key={source.name}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{source.name}</p>
                      <p className="text-xs text-slate-600">{source.enrolled} matrículas de {source.leads} interessados</p>
                    </div>
                    <strong className="text-sm text-emerald-800">{percentage(source.conversion)}</strong>
                  </div>
                  <Progress value={source.conversion} />
                </div>
              ))}
              {!sources.length && <EmptyState text="Ainda não existem origens para analisar." />}
            </CardContent>
          </Card>
        </section>

        <Card className="border-emerald-950/10">
          <CardHeader>
            <CardTitle className="text-lg text-slate-950">Desempenho das campanhas</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {campaigns.length ? (
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="pb-3 font-semibold">Campanha</th>
                    <th className="pb-3 text-right font-semibold">Interessados</th>
                    <th className="pb-3 text-right font-semibold">Qualificados</th>
                    <th className="pb-3 text-right font-semibold">Visitas</th>
                    <th className="pb-3 text-right font-semibold">Matrículas</th>
                    <th className="pb-3 text-right font-semibold">Conversão</th>
                    <th className="pb-3 text-right font-semibold">Previsão</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr key={campaign.name} className="border-b border-slate-100 text-slate-800">
                      <td className="py-4 font-semibold text-slate-950">{campaign.name}</td>
                      <td className="py-4 text-right">{campaign.leads}</td>
                      <td className="py-4 text-right">{campaign.qualified}</td>
                      <td className="py-4 text-right">{campaign.visits}</td>
                      <td className="py-4 text-right">{campaign.enrolled}</td>
                      <td className="py-4 text-right font-semibold text-emerald-800">{percentage(campaign.conversion)}</td>
                      <td className="py-4 text-right">{campaign.forecast.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState text="Preencha o nome da campanha nas oportunidades para medir seu retorno." />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

const EmptyState = ({ text }: { text: string }) => (
  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">{text}</div>
);

export default AcquisitionAnalytics;
