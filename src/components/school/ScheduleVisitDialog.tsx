/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase types will include the school tables after the pending migration is applied and types are regenerated. */
import { FormEvent, useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type OpportunityOption = {
  id: string;
  desired_grade: string;
  desired_shift: string | null;
  students: { full_name: string } | null;
  guardians: { full_name: string } | null;
};

export function ScheduleVisitDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [opportunities, setOpportunities] = useState<OpportunityOption[]>([]);
  const [opportunityId, setOpportunityId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [participants, setParticipants] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const { data, error } = await (supabase as any)
        .from("enrollment_opportunities")
        .select("id,desired_grade,desired_shift,students(full_name),guardians:primary_guardian_id(full_name)")
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
    if (!opportunityId || !scheduledAt) {
      toast({ title: "Selecione a oportunidade e o horário", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await (supabase as any).rpc("schedule_school_visit", {
      p_opportunity_id: opportunityId,
      p_scheduled_at: new Date(scheduledAt).toISOString(),
      p_participants: participants.trim() || null,
      p_notes: notes.trim() || null,
    });
    setSaving(false);

    if (error) {
      toast({ title: "Não foi possível agendar", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Visita agendada", description: "O funil e a próxima ação foram atualizados automaticamente." });
    setOpportunityId("");
    setScheduledAt("");
    setParticipants("");
    setNotes("");
    setOpen(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800">
          <CalendarPlus className="h-4 w-4" /> Agendar visita
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="text-slate-950">Agendar visita escolar</DialogTitle>
            <DialogDescription className="text-slate-600">
              Escolha uma oportunidade ativa. O aluno avançará automaticamente para visita agendada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5">
            <div className="space-y-2">
              <Label>Aluno e oportunidade *</Label>
              <Select value={opportunityId} onValueChange={setOpportunityId}>
                <SelectTrigger><SelectValue placeholder="Selecione o aluno" /></SelectTrigger>
                <SelectContent>
                  {opportunities.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {(item.students?.full_name || "Aluno") + " · " + item.desired_grade + (item.desired_shift ? " · " + item.desired_shift : "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="visit-at">Data e horário *</Label>
              <Input id="visit-at" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="participants">Participantes</Label>
              <Input id="participants" value={participants} onChange={(event) => setParticipants(event.target.value)} placeholder="Ex.: mãe, pai e aluno" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="visit-notes">Observações para a visita</Label>
              <Textarea id="visit-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Interesses, necessidades e pontos que a equipe deve abordar" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-emerald-700 text-white hover:bg-emerald-800">
              {saving ? "Agendando..." : "Confirmar agendamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
