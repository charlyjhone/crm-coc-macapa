import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  GraduationCap,
  School,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

type Opportunity = {
  id: string;
  stage: string;
  probability_score: number;
  desired_grade: string;
  desired_shift: string | null;
  next_action: string | null;
  next_action_at: string | null;
  expected_monthly_revenue: number | null;
};

type Capacity = {
  id: string;
  grade: string;
  shift: string;
  total_seats: number;
  reserved_seats: number;
  enrolled_seats: number;
};

const stages = [
  ["novo_interessado", "Novos"],
  ["contato_realizado", "Contatados"],
  ["qualificado", "Qualificados"],
  ["visita_agendada", "Visitas"],
  ["condicoes_apresentadas", "Condições"],
  ["matricula_em_conclusao", "Em conclusão"],
  ["matriculado", "Matriculados"],
] as const;

const formatNumber = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);

const CaptacaoDashboard = () => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [capacities, setCapacities] = useState<Capacity[]>([]);
  const [loading, setLoading] = useState(true);
  const [foundationPending, setFoundationPending] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const client = supabase as any;
      const [opportunitiesResult, capacitiesResult] = await Promise.all([
        client
          .from("enrollment_opportunities")
          .select("id,stage,probability_score,desired_grade,desired_shift,next_action,next_action_at,expected_monthly_revenue"),
        client
          .from("school_capacity")
          .select("id,grade,shift,total_seats,reserved_seats,enrolled_seats")
          .order("grade"),
      ]);

      if (opportunitiesResult.error || capacitiesResult.error) {
        setFoundationPending(true);
      } else {
        setOpportunities(opportunitiesResult.data || []);
        setCapacities(capacitiesResult.data || []);
      }
      setLoading(false);
    };

    load();
  }, []);

  const metrics = useMemo(() => {
    const confirmed = opportunities.filter((item) => item.stage === "matriculado").length;
    const open = opportunities.filter((item) => !["matriculado", "perdido"].includes(item.stage));
    const forecast = opportunities.reduce((total, item) => {
      if (item.stage === "matriculado") return total + 1;
      if (item.stage === "perdido") return total;
      return total + item.probability_score / 100;
    }, 0);
    const highProbability = open.filter((item) => item.probability_score >= 80).length;
    const overdue = open.filter(
      (item) => item.next_action_at && new Date(item.next_action_at).getTime() < Date.now(),
    ).length;
    const totalSeats = capacities.reduce((total, item) => total + item.total_seats, 0);
    const occupiedSeats = capacities.reduce((total, item) => total + item.enrolled_seats, 0);

    return { confirmed, open: open.length, forecast, highProbability, overdue, totalSeats, occupiedSeats };
  }, [opportunities, capacities]);

  const stageCount = (stage: string) =>
    opportunities.filter((item) => item.stage === stage).length;

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-background px-5 py-5 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm font-medium text-primary">
              <School className="h-4 w-4" />
              COC Macapá Norte
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Captação e matrículas</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Visão executiva das oportunidades, próximas ações e vagas da escola.
            </p>
          </div>
          <Badge variant="outline" className="w-fit gap-1.5 px-3 py-1.5">
            <CalendarCheck className="h-3.5 w-3.5" />
            Ano letivo 2027
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-5 md:p-8">
        {foundationPending && (
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Fundação escolar aguardando aplicação no Supabase</p>
              <p className="mt-1 text-sm">
                A interface já está pronta. Os indicadores serão preenchidos após a migração ser validada
                no ambiente de homologação.
              </p>
            </div>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard title="Confirmadas" value={metrics.confirmed} note="matrículas concluídas" icon={CheckCircle2} />
          <MetricCard title="Previsão" value={formatNumber(metrics.forecast)} note="matrículas ponderadas" icon={TrendingUp} />
          <MetricCard title="Em andamento" value={metrics.open} note="oportunidades abertas" icon={Users} />
          <MetricCard title="Alta possibilidade" value={metrics.highProbability} note="80% ou mais" icon={Target} />
          <MetricCard
            title="Ações atrasadas"
            value={metrics.overdue}
            note={metrics.overdue ? "precisam de atenção" : "atendimento em dia"}
            icon={AlertCircle}
            attention={metrics.overdue > 0}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <GraduationCap className="h-5 w-5 text-primary" />
                Funil de matrículas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {stages.map(([key, label], index) => (
                  <div key={key} className="rounded-lg border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="text-2xl font-bold text-slate-900">{stageCount(key)}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">{label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Ocupação geral</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-end justify-between">
                  <span className="text-3xl font-bold text-slate-900">{metrics.occupiedSeats}</span>
                  <span className="text-sm text-muted-foreground">de {metrics.totalSeats} vagas</span>
                </div>
                <Progress
                  className="mt-3"
                  value={metrics.totalSeats ? (metrics.occupiedSeats / metrics.totalSeats) * 100 : 0}
                />
              </div>
              <div className="space-y-3">
                {capacities.slice(0, 6).map((capacity) => {
                  const used = capacity.enrolled_seats + capacity.reserved_seats;
                  const available = Math.max(0, capacity.total_seats - used);
                  return (
                    <div key={capacity.id} className="flex items-center justify-between text-sm text-slate-700">
                      <span>{capacity.grade} · {capacity.shift}</span>
                      <Badge variant={available <= 2 ? "destructive" : "secondary"}>
                        {available} vagas
                      </Badge>
                    </div>
                  );
                })}
                {!capacities.length && !loading && (
                  <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                    Cadastre a capacidade das turmas para acompanhar vagas e direcionar campanhas.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
};

const MetricCard = ({
  title,
  value,
  note,
  icon: Icon,
  attention = false,
}: {
  title: string;
  value: string | number;
  note: string;
  icon: typeof Users;
  attention?: boolean;
}) => (
  <Card className={attention ? "border-destructive/40" : undefined}>
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
        </div>
        <div className={`rounded-lg p-2 ${attention ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-600">{note}</p>
    </CardContent>
  </Card>
);

export default CaptacaoDashboard;
