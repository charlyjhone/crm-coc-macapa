/* eslint-disable @typescript-eslint/no-explicit-any -- a RPC delete_school_family entra nos tipos quando forem regenerados. */
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

type Props = {
  guardianIds: string[];
  studentIds: string[];
  // Nome que aparece no cartão (aluno ou responsável), usado na confirmação.
  familyName: string;
  studentNames: string[];
  guardianNames: string[];
  onDeleted: () => void;
};

const CONFIRM_WORD = "EXCLUIR";

// Exclui a família do cartão (só administradores). Conversas de WhatsApp e
// contatos em Atendimentos continuam no CRM.
export function DeleteFamilyDialog({ guardianIds, studentIds, familyName, studentNames, guardianNames, onDeleted }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;

  const handleDelete = async () => {
    if (!confirmed || deleting) return;
    setDeleting(true);
    const { data, error } = await (supabase as any).rpc("delete_school_family", {
      p_guardian_ids: guardianIds,
      p_student_ids: studentIds,
    });
    setDeleting(false);
    if (error) {
      toast({
        title: "Não foi possível excluir a família",
        description: error.message || "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
      return;
    }
    const visits = Number(data?.visits || 0);
    toast({
      title: "Família excluída",
      description: `${familyName} foi removida do CRM${visits ? `, com ${visits} ${visits === 1 ? "visita" : "visitas"}` : ""}. As conversas de WhatsApp continuam em Atendimentos.`,
    });
    setOpen(false);
    setTyped("");
    onDeleted();
  };

  return (
    <AlertDialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setTyped(""); }}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="mr-1.5 h-4 w-4" /> Excluir família
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir a família de {familyName}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Use quando a família saiu da escola. Serão apagados do CRM:</p>
              <ul className="list-disc space-y-1 pl-5">
                {studentNames.length > 0 && <li>{studentNames.length === 1 ? "Aluno" : "Alunos"}: {studentNames.join(", ")}</li>}
                {guardianNames.length > 0 && <li>{guardianNames.length === 1 ? "Responsável" : "Responsáveis"}: {guardianNames.join(", ")}</li>}
                <li>Interesses de matrícula, visitas e tarefas desses alunos</li>
              </ul>
              <p>As conversas de WhatsApp continuam em Atendimentos. A exclusão fica registrada na Auditoria e não pode ser desfeita.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-delete-family">Para confirmar, digite {CONFIRM_WORD}</Label>
          <Input
            id="confirm-delete-family"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            placeholder={CONFIRM_WORD}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={handleDelete} disabled={!confirmed || deleting}>
            {deleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
            Excluir família
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
