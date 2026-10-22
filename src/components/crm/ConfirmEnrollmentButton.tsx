/* eslint-disable @typescript-eslint/no-explicit-any -- RPC escolar ainda não está nos tipos gerados do Supabase. */
import { useState } from "react";
import { GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_MODE, demo } from "@/lib/demo";
import { btnPrimary } from "@/components/crm/ui";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Props = {
  opportunityId: string;
  studentName: string | null | undefined;
  grade?: string | null;
  className?: string;
  onDone?: () => void;
};

/** Marca a oportunidade como "matriculado" (grava a data da matrícula). */
export function ConfirmEnrollmentButton({ opportunityId, studentName, grade, className, onDone }: Props) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const name = studentName || "o aluno";

  const confirm = async () => {
    setSaving(true);
    try {
      if (DEMO_MODE) await demo.moveOpportunity(opportunityId, "matriculado");
      else {
        const { error } = await (supabase as any).rpc("update_enrollment_progress", {
          p_opportunity_id: opportunityId, p_stage: "matriculado", p_next_action: null, p_next_action_at: null, p_loss_reason: null,
        });
        if (error) throw error;
      }
      toast.success(DEMO_MODE ? `Matrícula de ${name} confirmada (demonstração, nada foi salvo)` : `Matrícula de ${name} confirmada`);
      for (const key of ["funil", "comparativo-matriculas", "direcao", "hoje-sem-retorno", "conversa-visita"]) void qc.invalidateQueries({ queryKey: [key] });
      onDone?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível confirmar a matrícula.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button type="button" className={className || btnPrimary} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" aria-hidden="true" />}
          Confirmar matrícula
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar a matrícula de {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {grade ? `${grade}. ` : ""}A família sai do funil e a matrícula passa a contar hoje no comparativo com os anos anteriores.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={() => void confirm()} className="bg-[var(--crm-accent)] hover:bg-[var(--crm-accent-hover)]">Confirmar matrícula</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
