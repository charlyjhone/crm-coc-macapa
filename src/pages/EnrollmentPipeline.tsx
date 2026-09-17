import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CalendarClock, GraduationCap, Target, UserRound } from "lucide-react";

type Opportunity = {
  id: string;
  stage: string;
  probability_score: number;
  score_explanation: string | null;
  desired_grade: string;
  desired_shift: string | null;
  next_action: string | null;
  next_action_at: string | null;
  students: { full_name: string } | null;
  guardians: { full_name: string; phone: string | null } | null;
};

const columns = [
  { key: "novo_interessado", label: "Novos" },
  { key: "contato_realizado", label: "Contato realizado" },
  { key: "qualificado", label: "Qualificados" },
  { key: "visita_agendada", label: "Visita agendada" },
  { key: "visita_realizada", label: "Visita realizada" },
  { key: "condicoes_apresentadas", label: "Condições" },
  { key: "documentacao_pendente", label: "Documentação" },
  { key: "matricula_em_conclusao", label: "Em conclusão" },
] as const;

const probabilityStyle = (score: number) => {
  if (score >= 80) return "bg-emerald-100 text-emerald-800";
  if (score >= 60) return "bg-blue-100 text-blue-800";
  if (score >= 40) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
};

const EnrollmentPipeline = () => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [foundationPending, setFoundationPending] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await (supabase as any)
        .from("enrollment_opportunities")
        .select("id,stage,probability_score,score_explanation,desired_grade,desired_shift,next_action,next_action_at,students(full_name),guardians:primary_guardian_id(full_name,phone)")
        .not("stage", "in", '("matriculado","perdido","nutricao")')
        .order("probability_score", { ascending: false });
      if (error) setFoundationPending(true);
      else setOpportunities(data || []);
    };
    load();
  }, []);

  const grouped = useMemo(
    () => Object.fromEntries(columns.map((column) => [column.key, opportunities.filter((item) => item.stage === column.key)])),
    [opportunities],
  );

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-background px-5 py-5 md:px-8">
        <div className="mx-auto max-w-[1600px]">
          <p className="text-sm font-medium text-primary">Jornada de matrícula</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Funil de captação</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada aluno aparece uma única vez por oportunidade, série, turno e ano letivo.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] p-5 md:p-8">
        {foundationPending && (
          <div className="mb-5 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">O Kanban será preenchido após a migração escolar ser aplicada em homologação.</p>
          </div>
        )}

        <div className="overflow-x-auto pb-4">
          <div className="grid min-w-[2200px] grid-cols-8 gap-4">
            {columns.map((column) => (
              <section key={column.key} className="rounded-xl bg-muted/70 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold">{column.label}</h2>
                  <Badge variant="secondary">{grouped[column.key]?.length || 0}</Badge>
                </div>
                <div className="space-y-3">
                  {(grouped[column.key] || []).map((opportunity: Opportunity) => (
                    <Card key={opportunity.id} className="shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold leading-tight text-slate-900">{opportunity.students?.full_name || "Aluno não identificado"}</p>
                            <p className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                              <UserRound className="h-3 w-3" />
                              {opportunity.guardians?.full_name || "Responsável pendente"}
                            </p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-xs font-bold ${probabilityStyle(opportunity.probability_score)}`}>
                            {opportunity.probability_score}%
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="outline" className="gap-1"><GraduationCap className="h-3 w-3" />{opportunity.desired_grade}</Badge>
                          {opportunity.desired_shift && <Badge variant="outline">{opportunity.desired_shift}</Badge>}
                        </div>

                        {opportunity.score_explanation && (
                          <p className="mt-3 flex gap-1.5 text-xs text-slate-600">
                            <Target className="mt-0.5 h-3 w-3 shrink-0" />{opportunity.score_explanation}
                          </p>
                        )}

                        <div className="mt-3 border-t pt-3">
                          <p className="text-xs font-medium text-slate-800">{opportunity.next_action || "Definir próxima ação"}</p>
                          {opportunity.next_action_at && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                              <CalendarClock className="h-3 w-3" />
                              {new Date(opportunity.next_action_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {!grouped[column.key]?.length && (
                    <div className="rounded-lg border border-dashed bg-background/60 p-5 text-center text-xs text-muted-foreground">
                      Nenhuma oportunidade
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default EnrollmentPipeline;
