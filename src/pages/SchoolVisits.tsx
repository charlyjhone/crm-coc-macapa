/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase types will include the school tables after the pending migration is applied and types are regenerated. */
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, MapPin, RefreshCw, UserRound, UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatSchoolDateTime, schoolDateTimeInput } from "@/lib/schoolDateTime";
import { ScheduleVisitDialog } from "@/components/school/ScheduleVisitDialog";
import { PastVisitDialog } from "@/components/school/PastVisitDialog";
import { VisitStatusDialog } from "@/components/school/VisitStatusDialog";

type Visit = {
  id: string;
  scheduled_at: string;
  status: string;
  participants: string | null;
  family_impression: string | null;
  objections: string | null;
  follow_up_notes: string | null;
  enrollment_opportunities: {
    desired_grade: string;
    desired_shift: string | null;
    students: { full_name: string } | null;
    guardians: { full_name: string; phone: string | null } | null;
  } | null;
};

const statusLabel: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  realizada: "Realizada",
  faltou: "Não compareceu",
  cancelada: "Cancelada",
  reagendada: "Reagendada",
};

const statusClass: Record<string, string> = {
  agendada: "bg-blue-100 text-blue-800",
  confirmada: "bg-emerald-100 text-emerald-800",
  realizada: "bg-slate-200 text-slate-800",
  faltou: "bg-amber-100 text-amber-900",
  cancelada: "bg-rose-100 text-rose-800",
  reagendada: "bg-violet-100 text-violet-800",
};

const SchoolVisits = () => {
  const { data: visits = [], error, isPending, isFetching, refetch } = useQuery<Visit[]>({
    queryKey: ["school-visits"],
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("school_visits")
        .select("id,scheduled_at,status,participants,family_impression,objections,follow_up_notes,enrollment_opportunities(desired_grade,desired_shift,students(full_name),guardians:primary_guardian_id(full_name,phone))")
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const now = new Date();
  // Próximas visitas em aberto primeiro (da mais próxima para a mais distante);
  // depois as demais, da mais recente para a mais antiga.
  const isUpcoming = (visit: Visit) =>
    new Date(visit.scheduled_at) >= now && ["agendada", "confirmada", "reagendada"].includes(visit.status);
  const ordered = [...visits].sort((a, b) => {
    const ua = isUpcoming(a), ub = isUpcoming(b);
    if (ua !== ub) return ua ? -1 : 1;
    const diff = Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at);
    return ua ? diff : -diff;
  });
  const metrics = {
    today: visits.filter((visit) => visit.status !== "cancelada" && schoolDateTimeInput(visit.scheduled_at).slice(0,10) === schoolDateTimeInput(now).slice(0,10)).length,
    upcoming: visits.filter((visit) => new Date(visit.scheduled_at) >= now && ["agendada", "confirmada", "reagendada"].includes(visit.status)).length,
    confirmed: visits.filter((visit) => visit.status === "confirmada").length,
    completed: visits.filter((visit) => visit.status === "realizada").length,
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-emerald-950/10 bg-white px-5 py-5 md:px-8">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Captação e matrículas</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Visitas escolares</h1>
            <p className="mt-1 text-sm text-slate-600">Organize o encontro, registre a percepção da família e não deixe o retorno esfriar.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <PastVisitDialog onCreated={() => { void refetch(); }} />
            <ScheduleVisitDialog onCreated={() => { void refetch(); }} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] p-5 md:p-8">
        {error && (
          <div className="mb-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm" role="alert">Não foi possível atualizar a agenda. Confira sua conexão e clique em Atualizar. As informações exibidas podem estar desatualizadas.</p>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Hoje", value: metrics.today, icon: CalendarDays },
            { label: "Próximas", value: metrics.upcoming, icon: Clock3 },
            { label: "Confirmadas", value: metrics.confirmed, icon: CheckCircle2 },
            { label: "Realizadas", value: metrics.completed, icon: UsersRound },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="border-emerald-950/10 shadow-sm">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm font-medium text-slate-600">{label}</p>
                  <p className="mt-1 text-3xl font-bold text-slate-950">{value}</p>
                </div>
                <span className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Icon className="h-5 w-5" /></span>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-7">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-950">Agenda de visitas</h2>
            <p className="text-sm text-slate-600">Horário local da escola. A agenda atualiza automaticamente a cada 30 segundos.</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {ordered.map((visit) => {
              const opportunity = visit.enrollment_opportunities;
              const studentName = opportunity?.students?.full_name || "Aluno não identificado";
              return (
                <Card key={visit.id} className="border-emerald-950/10 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-bold text-slate-950">{studentName}</p>
                        <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                          <UserRound className="h-4 w-4 text-emerald-700" />
                          {opportunity?.guardians?.full_name || "Responsável pendente"}
                          {opportunity?.guardians?.phone ? " · " + opportunity.guardians.phone : ""}
                        </p>
                      </div>
                      <Badge className={statusClass[visit.status] || "bg-slate-100 text-slate-800"}>
                        {statusLabel[visit.status] || visit.status}
                      </Badge>
                    </div>

                    <div className="mt-4 grid gap-3 rounded-xl bg-emerald-50/70 p-4 sm:grid-cols-2">
                      <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <CalendarDays className="h-4 w-4 text-emerald-700" />
                        {formatSchoolDateTime(visit.scheduled_at)}
                      </p>
                      <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <MapPin className="h-4 w-4 text-emerald-700" />
                        {opportunity?.desired_grade || "Série pendente"}
                        {opportunity?.desired_shift ? " · " + opportunity.desired_shift : ""}
                      </p>
                    </div>

                    {visit.participants && <p className="mt-3 text-sm text-slate-700"><strong>Participantes:</strong> {visit.participants}</p>}
                    {visit.family_impression && <p className="mt-2 text-sm text-slate-700"><strong>Impressão:</strong> {visit.family_impression}</p>}
                    {visit.objections && <p className="mt-2 text-sm text-slate-700"><strong>Objeções:</strong> {visit.objections}</p>}
                    {visit.follow_up_notes && <p className="mt-2 text-sm text-slate-700"><strong>Próximo contato:</strong> {visit.follow_up_notes}</p>}

                    <div className="mt-4 flex justify-end border-t border-slate-200 pt-4">
                      <VisitStatusDialog visit={{ ...visit, studentName }} onUpdated={() => { void refetch(); }} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {isPending && !error && <p role="status" className="p-5 text-sm text-slate-600">Carregando agenda...</p>}
            {!visits.length && !isPending && !error && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center lg:col-span-2">
                <CalendarDays className="mx-auto h-8 w-8 text-emerald-700" />
                <p className="mt-3 font-semibold text-slate-900">Nenhuma visita agendada</p>
                <p className="mt-1 text-sm text-slate-600">Agende a primeira visita a partir de uma oportunidade ativa.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default SchoolVisits;
