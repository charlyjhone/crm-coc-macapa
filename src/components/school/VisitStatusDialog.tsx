/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase types will include the school tables after the pending migration is applied and types are regenerated. */
import { FormEvent, useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type Props = {
  visit: { id: string; status: string; studentName: string };
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

  useEffect(() => {
    if (!open) return;
    setStatus(visit.status);
    setImpression("");
    setObjections("");
    setFollowUp("");
  }, [open, visit]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const { error } = await (supabase as any).rpc("update_school_visit_status", {
      p_visit_id: visit.id,
      p_status: status,
      p_family_impression: impression.trim() || null,
      p_objections: objections.trim() || null,
      p_follow_up_notes: followUp.trim() || null,
    });
    setSaving(false);

    if (error) {
      toast({ title: "Não foi possível atualizar a visita", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: "Visita atualizada",
      description: status === "realizada"
        ? "O aluno avançou no funil e o retorno foi agendado."
        : "O status da visita foi salvo.",
    });
    setOpen(false);
    onUpdated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendada">Agendada</SelectItem>
                  <SelectItem value="confirmada">Confirmada</SelectItem>
                  <SelectItem value="realizada">Realizada</SelectItem>
                  <SelectItem value="faltou">Não compareceu</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                  <SelectItem value="reagendada">Reagendada</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-emerald-700 text-white hover:bg-emerald-800">
              {saving ? "Salvando..." : "Salvar resultado"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
