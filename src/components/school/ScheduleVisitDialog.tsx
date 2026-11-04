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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { schoolDateTimeInput, schoolDateTimeToIso } from "@/lib/schoolDateTime";
import { FamilyModeToggle, NewFamilyFields, createFamilyForVisit, emptyNewFamily, newFamilyMissing, type FamilyMode, type NewFamily, FamilySearch } from "@/components/school/NewFamilyFields";

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
  const [mode, setMode] = useState<FamilyMode>("cadastrada");
  const [family, setFamily] = useState<NewFamily>(emptyNewFamily);

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
    if ((mode === "cadastrada" && !opportunityId) || !scheduledAt) {
      toast({ title: mode === "cadastrada" ? "Selecione o aluno e o horário" : "Informe o horário da visita", variant: "destructive" });
      return;
    }
    const missing = mode === "nova" ? newFamilyMissing(family) : null;
    if (missing) {
      toast({ title: missing, variant: "destructive" });
      return;
    }
    const scheduledIso = schoolDateTimeToIso(scheduledAt);
    if (!scheduledIso || new Date(scheduledIso).getTime() <= Date.now()) {
      toast({ title: "Escolha uma data e horário futuros", variant: "destructive" });
      return;
    }

    setSaving(true);
    let targetId = opportunityId;
    if (mode === "nova") {
      try {
        targetId = await createFamilyForVisit(family);
      } catch (createError) {
        setSaving(false);
        toast({ title: "Não foi possível cadastrar a família", description: (createError as Error).message, variant: "destructive" });
        return;
      }
    }
    const { error } = await (supabase as any).rpc("schedule_school_visit", {
      p_opportunity_id: targetId,
      p_scheduled_at: scheduledIso,
      p_participants: participants.trim() || null,
      p_notes: notes.trim() || null,
    });
    setSaving(false);

    if (error) {
      toast({ title: "Não foi possível agendar", description: mode === "nova" ? `A família foi cadastrada no funil, mas a visita não: ${error.message}` : error.message, variant: "destructive" });
      // A família já ficou no funil: na próxima tentativa basta escolhê-la em "Família já cadastrada".
      if (mode === "nova") { setMode("cadastrada"); setFamily(emptyNewFamily); setOpen(false); onCreated(); }
      return;
    }

    toast({ title: "Visita agendada", description: "O funil e a próxima ação foram atualizados automaticamente." });
    setOpportunityId("");
    setScheduledAt("");
    setParticipants("");
    setNotes("");
    setMode("cadastrada");
    setFamily(emptyNewFamily);
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="text-slate-950">Agendar visita escolar</DialogTitle>
            <DialogDescription className="text-slate-600">
              Escolha uma família do funil ou cadastre uma nova aqui mesmo. O aluno avança automaticamente para visita agendada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5">
            <FamilyModeToggle mode={mode} onChange={setMode} />
            {mode === "nova" ? <NewFamilyFields value={family} onChange={setFamily} /> : <div className="space-y-2">
              <Label>Família *</Label>
              <FamilySearch options={opportunities} value={opportunityId} onChange={setOpportunityId}
                onNew={(typed) => { setMode("nova"); setFamily({ ...emptyNewFamily, guardianName: typed }); }} />
            </div>}
            <div className="space-y-2">
              <Label htmlFor="visit-at">Data e horário *</Label>
              <Input id="visit-at" type="datetime-local" required min={schoolDateTimeInput(new Date())} value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
              <p className="text-xs text-slate-500">Horário local da escola.</p>
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
