import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarCheck2, CalendarClock, CheckCircle2, Clock3, ListChecks, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { NewEnrollmentTaskDialog } from "@/components/school/NewEnrollmentTaskDialog";
import { CompleteEnrollmentTaskDialog } from "@/components/school/CompleteEnrollmentTaskDialog";

type Task = {
  id: string;
  title: string;
  due_at: string | null;
  priority: string;
  status: string;
  enrollment_opportunities: {
    desired_grade: string;
    desired_shift: string | null;
    stage: string;
    students: { full_name: string } | null;
    guardians: { full_name: string; phone: string | null } | null;
  } | null;
};

const priorityLabel: Record<string, string> = { baixa: "Baixa", normal: "Normal", alta: "Alta", urgente: "Urgente" };
const priorityClass: Record<string, string> = {
  baixa: "bg-slate-100 text-slate-700",
  normal: "bg-blue-100 text-blue-800",
  alta: "bg-amber-100 text-amber-900",
  urgente: "bg-rose-100 text-rose-800",
};

const sameDay = (first: Date, second: Date) =>
  first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();

const EnrollmentTasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [foundationPending, setFoundationPending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await (supabase as any)
        .from("enrollment_tasks")
        .select("id,title,due_at,priority,status,enrollment_opportunities(desired_grade,desired_shift,stage,students(full_name),guardians:primary_guardian_id(full_name,phone))")
        .in("status", ["pendente", "em_andamento"])
        .order("due_at", { ascending: true, nullsFirst: false });
      if (error) {
        setFoundationPending(true);
        return;
      }
      setFoundationPending(false);
      setTasks(data || []);
    };
    load();
  }, [refreshKey]);

  const now = new Date();
  const metrics = useMemo(() => ({
    overdue: tasks.filter((task) => task.due_at && new Date(task.due_at) < now).length,
    today: tasks.filter((task) => task.due_at && sameDay(new Date(task.due_at), now)).length,
    upcoming: tasks.filter((task) => task.due_at && new Date(task.due_at) > now && !sameDay(new Date(task.due_at), now)).length,
    noDeadline: tasks.filter((task) => !task.due_at).length,
  }), [tasks]);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-emerald-950/10 bg-white px-5 py-5 md:px-8">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Captação e matrículas</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Tarefas e follow-ups</h1>
            <p className="mt-1 text-sm text-slate-600">Acompanhe cada promessa feita à família e mantenha o processo de matrícula em movimento.</p>
          </div>
          <NewEnrollmentTaskDialog onCreated={() => setRefreshKey((value) => value + 1)} />
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] p-5 md:p-8">
        {foundationPending && (
          <div className="mb-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">As tarefas serão habilitadas após a migração escolar ser aplicada em homologação.</p>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Atrasadas", value: metrics.overdue, icon: AlertCircle, tone: "text-rose-700 bg-rose-50" },
            { label: "Para hoje", value: metrics.today, icon: CalendarCheck2, tone: "text-amber-700 bg-amber-50" },
            { label: "Próximas", value: metrics.upcoming, icon: CalendarClock, tone: "text-emerald-700 bg-emerald-50" },
            { label: "Sem prazo", value: metrics.noDeadline, icon: Clock3, tone: "text-slate-700 bg-slate-100" },
          ].map(({ label, value, icon: Icon, tone }) => (
            <Card key={label} className="border-emerald-950/10 shadow-sm">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm font-medium text-slate-600">{label}</p>
                  <p className="mt-1 text-3xl font-bold text-slate-950">{value}</p>
                </div>
                <span className={"rounded-xl p-3 " + tone}><Icon className="h-5 w-5" /></span>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-7">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-950">Fila de atendimento</h2>
            <p className="text-sm text-slate-600">As ações mais urgentes aparecem primeiro.</p>
          </div>
          <div className="space-y-3">
            {tasks.map((task) => {
              const opportunity = task.enrollment_opportunities;
              const studentName = opportunity?.students?.full_name || "Aluno não identificado";
              const overdue = task.due_at ? new Date(task.due_at) < now : false;
              return (
                <Card key={task.id} className={"border shadow-sm " + (overdue ? "border-rose-200 bg-rose-50/30" : "border-emerald-950/10")}>
                  <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                    <span className={"rounded-xl p-3 " + (overdue ? "bg-rose-100 text-rose-700" : "bg-emerald-50 text-emerald-700")}>
                      {overdue ? <AlertCircle className="h-5 w-5" /> : <ListChecks className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-slate-950">{task.title}</p>
                        <Badge className={priorityClass[task.priority] || priorityClass.normal}>{priorityLabel[task.priority] || task.priority}</Badge>
                        {overdue && <Badge className="bg-rose-100 text-rose-800">Atrasada</Badge>}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                        <UserRound className="h-4 w-4 text-emerald-700" />
                        <strong>{studentName}</strong>
                        <span>·</span>
                        <span>{opportunity?.guardians?.full_name || "Responsável pendente"}</span>
                        {opportunity?.guardians?.phone && <span>· {opportunity.guardians.phone}</span>}
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        {opportunity?.desired_grade || "Série pendente"}
                        {opportunity?.desired_shift ? " · " + opportunity.desired_shift : ""}
                        {task.due_at ? " · " + new Date(task.due_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : " · Sem prazo definido"}
                      </p>
                    </div>
                    <CompleteEnrollmentTaskDialog
                      task={{ id: task.id, title: task.title, studentName }}
                      onCompleted={() => setRefreshKey((value) => value + 1)}
                    />
                  </CardContent>
                </Card>
              );
            })}
            {!tasks.length && !foundationPending && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-700" />
                <p className="mt-3 font-semibold text-slate-900">Nenhuma tarefa pendente</p>
                <p className="mt-1 text-sm text-slate-600">A fila está em dia. Novas ações podem ser criadas para qualquer oportunidade ativa.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default EnrollmentTasks;
