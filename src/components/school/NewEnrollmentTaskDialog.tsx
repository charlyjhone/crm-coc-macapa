import { FormEvent, useEffect, useState } from "react";
import { ListPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type OpportunityOption = {
  id: string;
  desired_grade: string;
  students: { full_name: string } | null;
  guardians: { full_name: string } | null;
};

export function NewEnrollmentTaskDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [opportunities, setOpportunities] = useState<OpportunityOption[]>([]);
  const [opportunityId, setOpportunityId] = useState("");
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState("normal");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const { data, error } = await (supabase as any)
        .from("enrollment_opportunities")
        .select("id,desired_grade,students(full_name),guardians:primary_guardian_id(full_name)")
        .not("stage", "in", '("matriculado","perdido","nutricao")')
        .order("created_at", { ascending: false });
      if (error) {
        toast({ title: "Não foi possível carregar as oportunidades", description: error.message, variant: "destructive" });
        return;
      }
      setOpportunities(data || []);
    };
    load();
  }, [open, toast]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!opportunityId || !title.trim()) {
      toast({ title: "Selecione o aluno e informe a tarefa", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).rpc("create_enrollment_task", {
      p_opportunity_id: opportunityId,
      p_title: title.trim(),
      p_due_at: dueAt ? new Date(dueAt).toISOString() : null,
      p_priority: priority,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Não foi possível criar a tarefa", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Tarefa criada", description: "A próxima ação da oportunidade foi atualizada." });
    setOpportunityId("");
    setTitle("");
    setDueAt("");
    setPriority("normal");
    setOpen(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800"><ListPlus className="h-4 w-4" /> Nova tarefa</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="text-slate-950">Criar tarefa de captação</DialogTitle>
            <DialogDescription className="text-slate-600">Defina o próximo contato necessário para avançar a matrícula.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5">
            <div className="space-y-2">
              <Label>Aluno e oportunidade *</Label>
              <Select value={opportunityId} onValueChange={setOpportunityId}>
                <SelectTrigger><SelectValue placeholder="Selecione o aluno" /></SelectTrigger>
                <SelectContent>{opportunities.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {(item.students?.full_name || "Aluno") + " · " + item.desired_grade + " · " + (item.guardians?.full_name || "Responsável pendente")}
                  </SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-title">Próxima ação *</Label>
              <Input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: ligar para confirmar interesse" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="task-due">Prazo</Label>
                <Input id="task-due" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
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
            <Button type="submit" disabled={saving} className="bg-emerald-700 text-white hover:bg-emerald-800">{saving ? "Salvando..." : "Criar tarefa"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
