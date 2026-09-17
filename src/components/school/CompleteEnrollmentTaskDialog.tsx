import { FormEvent, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export function CompleteEnrollmentTaskDialog({
  task,
  onCompleted,
}: {
  task: { id: string; title: string; studentName: string };
  onCompleted: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [nextAction, setNextAction] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [priority, setPriority] = useState("normal");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const { error } = await (supabase as any).rpc("complete_enrollment_task", {
      p_task_id: task.id,
      p_next_action: nextAction.trim() || null,
      p_next_action_at: nextActionAt ? new Date(nextActionAt).toISOString() : null,
      p_next_priority: priority,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Não foi possível concluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Tarefa concluída",
      description: nextAction.trim() ? "O próximo follow-up já foi criado." : "A oportunidade ficou sem ação pendente.",
    });
    setOpen(false);
    setNextAction("");
    setNextActionAt("");
    setPriority("normal");
    onCompleted();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800"><Check className="h-4 w-4" /> Concluir</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="text-slate-950">Concluir atendimento</DialogTitle>
            <DialogDescription className="text-slate-600">{task.studentName} · {task.title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5">
            <div className="rounded-xl bg-emerald-50 p-4 text-sm text-slate-700">
              Se ainda houver algo a fazer, já deixe o próximo follow-up agendado. Caso contrário, conclua sem preencher.
            </div>
            <div className="space-y-2">
              <Label htmlFor="next-task">Próxima ação</Label>
              <Input id="next-task" value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="Ex.: enviar proposta de matrícula" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="next-task-at">Data e horário</Label>
                <Input id="next-task-at" type="datetime-local" value={nextActionAt} onChange={(event) => setNextActionAt(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-emerald-700 text-white hover:bg-emerald-800">{saving ? "Concluindo..." : "Concluir atendimento"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
