/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase types will include the school tables after the pending migration is applied and types are regenerated. */
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const stages = [
  ["novo_interessado", "Novo interessado"],
  ["tentativa_contato", "Tentativa de contato"],
  ["contato_realizado", "Contato realizado"],
  ["qualificado", "Qualificado"],
  ["visita_agendada", "Visita agendada"],
  ["visita_realizada", "Visita realizada"],
  ["condicoes_apresentadas", "Condições apresentadas"],
  ["documentacao_pendente", "Documentação pendente"],
  ["matricula_em_conclusao", "Matrícula em conclusão"],
  ["matriculado", "Matriculado"],
  ["nutricao", "Nutrição"],
  ["perdido", "Perdido"],
] as const;

type OpportunityProgressDialogProps = {
  opportunity: {
    id: string;
    stage: string;
    next_action: string | null;
    next_action_at: string | null;
    students: { full_name: string } | null;
  };
  onUpdated: () => void;
};

const toLocalDateTime = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

export function OpportunityProgressDialog({
  opportunity,
  onUpdated,
}: OpportunityProgressDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState(opportunity.stage);
  const [nextAction, setNextAction] = useState(opportunity.next_action || "");
  const [nextActionAt, setNextActionAt] = useState(toLocalDateTime(opportunity.next_action_at));
  const [lossReason, setLossReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStage(opportunity.stage);
    setNextAction(opportunity.next_action || "");
    setNextActionAt(toLocalDateTime(opportunity.next_action_at));
    setLossReason("");
  }, [open, opportunity]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (stage === "perdido" && !lossReason.trim()) {
      toast({ title: "Informe o motivo da perda", variant: "destructive" });
      return;
    }
    if (!["matriculado", "perdido", "nutricao"].includes(stage) && !nextAction.trim()) {
      toast({
        title: "Defina a próxima ação",
        description: "Toda oportunidade ativa precisa indicar o próximo atendimento.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const { error } = await (supabase as any).rpc("update_enrollment_progress", {
      p_opportunity_id: opportunity.id,
      p_stage: stage,
      p_next_action: nextAction.trim() || null,
      p_next_action_at: nextActionAt ? new Date(nextActionAt).toISOString() : null,
      p_loss_reason: lossReason.trim() || null,
    });
    setSaving(false);

    if (error) {
      toast({
        title: "Não foi possível atualizar",
        description: error.message || "Tente novamente.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Oportunidade atualizada",
      description: (opportunity.students?.full_name || "Aluno") + " foi movido no funil.",
    });
    setOpen(false);
    onUpdated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="mt-3 w-full gap-2 text-slate-800">
          Atualizar etapa
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="text-slate-950">Atualizar oportunidade</DialogTitle>
            <DialogDescription className="text-slate-600">
              {opportunity.students?.full_name || "Aluno não identificado"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-5">
            <div className="space-y-2">
              <Label>Etapa do funil</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {stage === "perdido" ? (
              <div className="space-y-2">
                <Label htmlFor="loss-reason">Motivo da perda *</Label>
                <Textarea
                  id="loss-reason"
                  value={lossReason}
                  onChange={(event) => setLossReason(event.target.value)}
                  placeholder="Ex.: escolheu outra escola, valor ou turno indisponível"
                />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="next-action">Próxima ação</Label>
                  <Input
                    id="next-action"
                    value={nextAction}
                    onChange={(event) => setNextAction(event.target.value)}
                    placeholder="Ex.: confirmar visita com a família"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="next-action-at" className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" />
                    Data e horário
                  </Label>
                  <Input
                    id="next-action-at"
                    type="datetime-local"
                    value={nextActionAt}
                    onChange={(event) => setNextActionAt(event.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-emerald-700 text-white hover:bg-emerald-800">
              {saving ? "Salvando..." : "Salvar atualização"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
