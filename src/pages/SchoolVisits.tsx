import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, MapPin, UserRound, UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScheduleVisitDialog } from "@/components/school/ScheduleVisitDialog";
import { VisitStatusDialog } from "@/components/school/VisitStatusDialog";

type Visit = {
  id: string;
  scheduled_at: string;
  status: string;
  participants: string | null;
  family_impression: string | null;
  objections: string | null;
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

const isSameDay = (first: Date, second: Date) =>
  first.getFullYear() === second.getFullYear() &&
  first.getMonth() === second.getMonth() &&
  first.getDate() === second.getDate();

const SchoolVisits = () => {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [foundationPending, setFoundationPending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await (supabase as any)
        .from("school_visits")
        .select("id,scheduled_at,status,participants,family_impression,objections,enrollment_opportunities(desired_grade,desired_shift,students(full_name),guardians:primary_guardian_id(full_name,phone))")
        .order("scheduled_at", { ascending: true });
      if (error) {
        setFoundationPending(true);
        return;
      }
      setFoundationPending(false);
      setVisits(data || []);
    };
    load();
  }, [refreshKey]);

  const now = new Date();
  const metrics = useMemo(() => ({
    today: visits.filter((visit) => isSameDay(new Date(visit.scheduled_at), now)).length,
    upcoming: visits.filter((visit) => new Date(visit.scheduled_at) >= now && ["agendada", "confirmada", "reagendada"].includes(visit.status)).length,
    confirmed: visits.filter((visit) => visit.status === "confirmada").length,
    completed: visits.filter((visit) => visit.status === "realizada").length,
  }), [visits]);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-emerald-950/10 bg-white px-5 py-5 md:px-8">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Captação e matrículas</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Visitas escolares</h1>
            <p className="mt-1 text-sm text-slate-600">Organize o encontro, registre a percepção da família e não deixe o retorno esfriar.</p>
          </div>
          <ScheduleVisitDialog onCreated={() => setRefreshKey((value) => value + 1)} />
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] p-5 md:p-8">
        {foundationPending && (
          <div className="mb-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">A agenda será habilitada após a migração escolar ser aplicada em homologação.</p>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Hoje", metrics.today, CalendarDays],
            ["Próximas", metrics.upcoming, Clock3],
            ["Confirmadas", metrics.confirmed, CheckCircle2],
            ["Realizadas", metrics.completed, UsersRound],
          ].map(([label, value, Icon]) => (
            <Card key={String(label)} className="border-emerald-950/10 shadow-sm">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm font-medium text-slate-600">{String(label)}</p>
                  <p className="mt-1 text-3xl font-bold text-slate-950">{String(value)}</p>
                </div>
                <span className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Icon className="h-5 w-5" /></span>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-7">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-950">Agenda de visitas</h2>
            <p className="text-sm text-slate-600">Visitas ordenadas por data e horário.</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {visits.map((visit) => {
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
                        {new Date(visit.scheduled_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
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

                    <div className="mt-4 flex justify-end border-t border-slate-200 pt-4">
                      <VisitStatusDialog visit={{ id: visit.id, status: visit.status, studentName }} onUpdated={() => setRefreshKey((value) => value + 1)} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {!visits.length && !foundationPending && (
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
