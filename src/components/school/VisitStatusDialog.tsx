/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase types will include the school tables after the pending migration is applied and types are regenerated. */
import { FormEvent, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { schoolDateTimeInput, schoolDateTimeToIso } from "@/lib/schoolDateTime";

type Props = {
  visit: {
    id: string; status: string; studentName: string; scheduled_at: string;
    family_impression: string | null; objections: string | null; follow_up_notes: string | null;
  };
  onUpdated: () => void;
};

export function VisitStatusDialog({ visit, onUpdated }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(visit.status);
  const [impression, setImpression] = useState("");
  const [objections, setObjections] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [saving, setSaving] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [initial, setInitial] = useState(visit);

  const changeOpen = (nextOpen: boolean) => {
    if (saving) return;
    if (nextOpen) {
      setInitial(visit);
      setStatus(visit.status);
      setImpression(visit.family_impression || "");
      setObjections(visit.objections || "");
      setFollowUp(visit.follow_up_notes || "");
      setScheduledAt(schoolDateTimeInput(visit.scheduled_at));
    }
    setOpen(nextOpen);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const scheduledIso = schoolDateTimeToIso(scheduledAt);
    const rescheduling = status === "reagendada" && (
      initial.status !== "reagendada" || scheduledAt !== schoolDateTimeInput(initial.scheduled_at)
    );
    if (rescheduling && (!scheduledIso || new Date(scheduledIso).getTime() <= Date.now())) {
      toast({ title: "Escolha uma data e horário futuros", variant: "destructive" });
      return;
    }
    if (rescheduling && scheduledAt === schoolDateTimeInput(initial.scheduled_at)) {
      toast({ title: "Escolha um novo horário para reagendar", variant: "destructive" });
      return;
    }
    // Null preserva o valor atual no banco; string vazia limpa somente um campo editado.
    const changed = (value: string, previous: string | null) => value.trim() === (previous || "") ? null : value.trim();
    setSaving(true);
    const { error } = rescheduling
      ? await (supabase as any).rpc("reschedule_school_visit", {
        p_visit_id: visit.id,
        p_scheduled_at: scheduledIso,
        p_follow_up_notes: changed(followUp, initial.follow_up_notes),
      })
      : await (supabase as any).rpc("update_school_visit_status", {
      p_visit_id: visit.id,
      p_status: status,
      p_family_impression: changed(impression, initial.family_impression),
      p_objections: changed(objections, initial.objections),
      p_follow_up_notes: changed(followUp, initial.follow_up_notes),
    });
    setSaving(false);

    if (error) {
      toast({ title: "Não foi possível atualizar a visita", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: "Visita atualizada",
      description: rescheduling ? "O novo horário foi salvo na agenda."
        : status === "realizada" ? "Resultado e anotações salvos para o acompanhamento da família."
        : "O status da visita foi salvo.",
    });
    setOpen(false);
    onUpdated();
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 text-slate-800">
          <ClipboardCheck className="h-4 w-4" /> Registrar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="text-slate-950">Registrar resultado da visita</DialogTitle>
            <DialogDescription className="text-slate-600">{visit.studentName}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus} disabled={initial.status === "realizada"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendada">Agendada</SelectItem>
                  <SelectItem value="confirmada">Confirmada</SelectItem>
                  <SelectItem value="realizada">Realizada</SelectItem>
                  <SelectItem value="faltou">Não compareceu</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                  <SelectItem value="reagendada" disabled={initial.status === "realizada"}>Reagendada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {status === "reagendada" && (
              <div className="space-y-2">
                <Label htmlFor="reschedule-at">Nova data e horário *</Label>
                <Input id="reschedule-at" type="datetime-local" required
                  min={scheduledAt !== schoolDateTimeInput(initial.scheduled_at) || initial.status !== "reagendada" ? schoolDateTimeInput(new Date()) : undefined}
                  value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
                <p className="text-xs text-slate-500">Horário local da escola. Confirme a disponibilidade antes de salvar.</p>
              </div>
            )}
            {status === "realizada" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="impression">Impressão da família</Label>
                  <Textarea id="impression" value={impression} onChange={(event) => setImpression(event.target.value)} placeholder="O que mais interessou à família?" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="objections">Objeções ou dúvidas</Label>
                  <Textarea id="objections" value={objections} onChange={(event) => setObjections(event.target.value)} placeholder="Valor, turno, transporte, adaptação..." />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="follow-up">Notas para o próximo contato</Label>
              <Textarea id="follow-up" value={followUp} onChange={(event) => setFollowUp(event.target.value)} placeholder="Compromissos assumidos e próximos passos" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-emerald-700 text-white hover:bg-emerald-800">
              {saving ? "Salvando..." : "Salvar resultado"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
