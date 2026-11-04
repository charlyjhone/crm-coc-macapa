/* eslint-disable @typescript-eslint/no-explicit-any -- a RPC register_past_school_visit entra nos tipos quando forem regenerados. */
import { FormEvent, useEffect, useState } from "react";
import { History } from "lucide-react";
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

// Visita que já aconteceu: a família veio direto à escola, sem agendar.
// Fica registrada como "Realizada" na data informada e o funil avança.
export function PastVisitDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [opportunities, setOpportunities] = useState<OpportunityOption[]>([]);
  const [opportunityId, setOpportunityId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [participants, setParticipants] = useState("");
  const [impression, setImpression] = useState("");
  const [objections, setObjections] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<FamilyMode>("cadastrada");
  const [family, setFamily] = useState<NewFamily>(emptyNewFamily);

  const now = schoolDateTimeInput(new Date());
  const today = now.slice(0, 10);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const { data, error } = await (supabase as any)
        .from("enrollment_opportunities")
        .select("id,desired_grade,desired_shift,students(full_name),guardians:primary_guardian_id(full_name)")
        .not("stage", "in", '("matriculado","perdido")')
        .order("created_at", { ascending: false });
      if (error) {
        toast({ title: "Não foi possível carregar os alunos", description: error.message, variant: "destructive" });
        return;
      }
      setOpportunities(data || []);
    };
    void load();
  }, [open, toast]);

  const reset = () => {
    setOpportunityId("");
    setDate("");
    setTime("");
    setParticipants("");
    setImpression("");
    setObjections("");
    setFollowUp("");
    setMode("cadastrada");
    setFamily(emptyNewFamily);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if ((mode === "cadastrada" && !opportunityId) || !date || !time) {
      toast({ title: mode === "cadastrada" ? "Selecione o aluno, a data e o horário da visita" : "Informe a data e o horário da visita", variant: "destructive" });
      return;
    }
    const missing = mode === "nova" ? newFamilyMissing(family) : null;
    if (missing) {
      toast({ title: missing, variant: "destructive" });
      return;
    }
    const visitedIso = schoolDateTimeToIso(`${date}T${time}`);
    if (!visitedIso || new Date(visitedIso).getTime() > Date.now()) {
      toast({ title: "Informe uma data e horário que já passaram", description: "Para visitas futuras, use Agendar visita.", variant: "destructive" });
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
    const { error } = await (supabase as any).rpc("register_past_school_visit", {
      p_opportunity_id: targetId,
      p_visited_at: visitedIso,
      p_participants: participants.trim() || null,
      p_family_impression: impression.trim() || null,
      p_objections: objections.trim() || null,
      p_follow_up_notes: followUp.trim() || null,
    });
    setSaving(false);

    if (error) {
      toast({ title: "Não foi possível registrar a visita", description: mode === "nova" ? `A família foi cadastrada no funil, mas a visita não: ${error.message}` : error.message, variant: "destructive" });
      if (mode === "nova") { reset(); setOpen(false); onCreated(); }
      return;
    }

    toast({ title: "Visita registrada", description: "Ela aparece como Realizada e o funil foi atualizado." });
    reset();
    setOpen(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!saving) { setOpen(value); if (!value) reset(); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 text-slate-800">
          <History className="h-4 w-4" /> Registrar visita já feita
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="text-slate-950">Registrar visita já feita</DialogTitle>
            <DialogDescription className="text-slate-600">
              Para famílias que vieram à escola sem agendar, já cadastradas ou não. A visita fica como Realizada na data informada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5">
            <FamilyModeToggle mode={mode} onChange={setMode} />
            {mode === "nova" ? <NewFamilyFields value={family} onChange={setFamily} /> : <div className="space-y-2">
              <Label>Família *</Label>
              <FamilySearch options={opportunities} value={opportunityId} onChange={setOpportunityId}
                onNew={(typed) => { setMode("nova"); setFamily({ ...emptyNewFamily, guardianName: typed }); }} />
              <p className="text-xs text-slate-500">A família ainda não está no CRM? Escolha "Família nova" acima.</p>
            </div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="past-visit-date">Data da visita *</Label>
                <Input id="past-visit-date" type="date" required max={today} value={date} onChange={(event) => setDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="past-visit-time">Horário aproximado *</Label>
                <Input id="past-visit-time" type="time" required value={time} onChange={(event) => setTime(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="past-participants">Quem veio</Label>
              <Input id="past-participants" value={participants} onChange={(event) => setParticipants(event.target.value)} placeholder="Ex.: mãe e aluno" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="past-impression">Impressão da família</Label>
              <Textarea id="past-impression" value={impression} onChange={(event) => setImpression(event.target.value)} placeholder="O que mais interessou à família?" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="past-objections">Objeções ou dúvidas</Label>
              <Textarea id="past-objections" value={objections} onChange={(event) => setObjections(event.target.value)} placeholder="Valor, turno, transporte, adaptação..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="past-follow-up">Notas para o próximo contato</Label>
              <Textarea id="past-follow-up" value={followUp} onChange={(event) => setFollowUp(event.target.value)} placeholder="Compromissos assumidos e próximos passos" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-emerald-700 text-white hover:bg-emerald-800">
              {saving ? "Salvando..." : "Registrar visita"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
