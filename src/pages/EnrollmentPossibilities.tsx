/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase types will include the school tables after the pending migration is applied and types are regenerated. */
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BrainCircuit, CalendarClock, RefreshCw, ShieldCheck, Target, TrendingUp, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { OpportunityProgressDialog } from "@/components/school/OpportunityProgressDialog";
import { useToast } from "@/hooks/use-toast";

type Opportunity = {
  id: string;
  stage: string;
  probability_score: number;
  data_confidence: number;
  score_explanation: string | null;
  desired_grade: string;
  desired_shift: string | null;
  next_action: string | null;
  next_action_at: string | null;
  status_updated_at: string;
  students: { full_name: string } | null;
  guardians: { full_name: string; phone: string | null } | null;
};

const stageLabels: Record<string, string> = {
  novo_interessado: "Novo interessado",
  tentativa_contato: "Tentativa de contato",
  contato_realizado: "Contato realizado",
  qualificado: "Qualificado",
  visita_agendada: "Visita agendada",
  visita_realizada: "Visita realizada",
  condicoes_apresentadas: "Condições apresentadas",
  documentacao_pendente: "Documentação pendente",
  matricula_em_conclusao: "Matrícula em conclusão",
  nutricao: "Nutrição",
};

const scoreTone = (score: number) => {
  if (score >= 80) return { label: "Alta possibilidade", badge: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-600" };
  if (score >= 50) return { label: "Possibilidade média", badge: "bg-amber-100 text-amber-900", bar: "bg-amber-500" };
  return { label: "Precisa de atenção", badge: "bg-rose-100 text-rose-800", bar: "bg-rose-500" };
};

const EnrollmentPossibilities = () => {
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [foundationPending, setFoundationPending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await (supabase as any)
        .from("enrollment_opportunities")
        .select("id,stage,probability_score,data_confidence,score_explanation,desired_grade,desired_shift,next_action,next_action_at,status_updated_at,students(full_name),guardians:primary_guardian_id(full_name,phone)")
        .not("stage", "in", '("matriculado","perdido")')
        .order("probability_score", { ascending: false });
      if (error) {
        setFoundationPending(true);
        return;
      }
      setFoundationPending(false);
      setOpportunities(data || []);
    };
    load();
  }, [refreshKey]);

  const metrics = useMemo(() => ({
    high: opportunities.filter((item) => item.probability_score >= 80).length,
    medium: opportunities.filter((item) => item.probability_score >= 50 && item.probability_score < 80).length,
    attention: opportunities.filter((item) => item.probability_score < 50).length,
    reliable: opportunities.filter((item) => item.data_confidence >= 70).length,
  }), [opportunities]);

  const recalculate = async () => {
    setRecalculating(true);
    const { data, error } = await (supabase as any).rpc("recompute_all_enrollment_scores");
    setRecalculating(false);
    if (error) {
      toast({ title: "Não foi possível recalcular", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Possibilidades atualizadas", description: String(data || 0) + " oportunidades foram analisadas." });
    setRefreshKey((value) => value + 1);
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-emerald-950/10 bg-white px-5 py-5 md:px-8">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Inteligência de captação</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Possibilidades de matrícula</h1>
            <p className="mt-1 text-sm text-slate-600">Priorize as famílias com maior chance e entenda os sinais usados no cálculo.</p>
          </div>
          <Button onClick={recalculate} disabled={recalculating || foundationPending} className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800">
            <RefreshCw className={"h-4 w-4 " + (recalculating ? "animate-spin" : "")} />
            {recalculating ? "Analisando..." : "Recalcular possibilidades"}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] space-y-7 p-5 md:p-8">
        {foundationPending && (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">O cálculo será habilitado após a migração escolar ser aplicada em homologação.</p>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Alta possibilidade", value: metrics.high, note: "80% ou mais", icon: TrendingUp, tone: "bg-emerald-50 text-emerald-700" },
            { label: "Possibilidade média", value: metrics.medium, note: "entre 50% e 79%", icon: Target, tone: "bg-amber-50 text-amber-700" },
            { label: "Precisam de atenção", value: metrics.attention, note: "abaixo de 50%", icon: AlertCircle, tone: "bg-rose-50 text-rose-700" },
            { label: "Dados confiáveis", value: metrics.reliable, note: "confiança de 70% ou mais", icon: ShieldCheck, tone: "bg-blue-50 text-blue-700" },
          ].map(({ label, value, note, icon: Icon, tone }) => (
            <Card key={label} className="border-emerald-950/10 shadow-sm">
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="text-sm font-medium text-slate-600">{label}</p>
                  <p className="mt-1 text-3xl font-bold text-slate-950">{value}</p>
                  <p className="mt-1 text-xs text-slate-600">{note}</p>
                </div>
                <span className={"rounded-xl p-3 " + tone}><Icon className="h-5 w-5" /></span>
              </CardContent>
            </Card>
          ))}
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-950">Fila priorizada</h2>
            <p className="text-sm text-slate-600">Ordenada da maior para a menor possibilidade calculada.</p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {opportunities.map((opportunity) => {
              const tone = scoreTone(opportunity.probability_score);
              const overdue = opportunity.next_action_at && new Date(opportunity.next_action_at) < new Date();
              return (
                <Card key={opportunity.id} className="border-emerald-950/10 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-bold text-slate-950">{opportunity.students?.full_name || "Aluno não identificado"}</p>
                        <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                          <UserRound className="h-4 w-4 text-emerald-700" />
                          {opportunity.guardians?.full_name || "Responsável pendente"}
                          {opportunity.guardians?.phone ? " · " + opportunity.guardians.phone : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-extrabold text-slate-950">{opportunity.probability_score}%</p>
                        <Badge className={tone.badge}>{tone.label}</Badge>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Etapa</p>
                        <p className="mt-1 font-semibold text-slate-900">{stageLabels[opportunity.stage] || opportunity.stage}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Interesse</p>
                        <p className="mt-1 font-semibold text-slate-900">{opportunity.desired_grade}{opportunity.desired_shift ? " · " + opportunity.desired_shift : ""}</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-emerald-950/10 p-4">
                      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><BrainCircuit className="h-4 w-4 text-emerald-700" /> Por que recebeu esta pontuação?</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{opportunity.score_explanation || "Recalcule para gerar uma explicação baseada nos dados atuais."}</p>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-600">Confiança dos dados</span>
                        <strong className="text-slate-800">{opportunity.data_confidence}%</strong>
                      </div>
                      <Progress value={opportunity.data_confidence} />
                    </div>

                    <div className={"mt-4 flex items-center gap-2 rounded-xl p-3 text-sm " + (overdue ? "bg-rose-50 text-rose-900" : "bg-emerald-50 text-slate-800")}>
                      <CalendarClock className={"h-4 w-4 shrink-0 " + (overdue ? "text-rose-700" : "text-emerald-700")} />
                      <span>
                        <strong>{opportunity.next_action || "Próxima ação não definida"}</strong>
                        {opportunity.next_action_at ? " · " + new Date(opportunity.next_action_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""}
                      </span>
                    </div>

                    <OpportunityProgressDialog opportunity={opportunity} onUpdated={() => setRefreshKey((value) => value + 1)} />
                  </CardContent>
                </Card>
              );
            })}
            {!opportunities.length && !foundationPending && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center xl:col-span-2">
                <Target className="mx-auto h-8 w-8 text-emerald-700" />
                <p className="mt-3 font-semibold text-slate-900">Nenhuma oportunidade ativa</p>
                <p className="mt-1 text-sm text-slate-600">As possibilidades aparecerão quando houver alunos no funil de captação.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default EnrollmentPossibilities;
