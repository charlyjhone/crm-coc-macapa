/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase types are regenerated after the school CRM migrations. */
import { FormEvent, useEffect, useState } from "react";
import { Edit, Save, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export type FamilyStudent = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  birth_date: string | null;
  current_school: string | null;
  notes: string | null;
};

export type EditableFamily = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_opt_in: boolean;
  notes: string | null;
  student_guardians?: Array<{
    relationship: string | null;
    is_primary: boolean;
    students: FamilyStudent | null;
  }>;
};

type StudentDraft = FamilyStudent;

export function EditFamilyDialog({
  guardian,
  onSaved,
}: {
  guardian: EditableFamily;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [guardianNotes, setGuardianNotes] = useState("");
  const [students, setStudents] = useState<StudentDraft[]>([]);

  useEffect(() => {
    if (!open) return;
    setGuardianName(guardian.full_name || "");
    setPreferredName(guardian.preferred_name || "");
    setPhone(guardian.phone || "");
    setEmail(guardian.email || "");
    setWhatsappOptIn(guardian.whatsapp_opt_in);
    setGuardianNotes(guardian.notes || "");
    setStudents((guardian.student_guardians || [])
      .flatMap((link) => link.students ? [{
        id: link.students.id,
        full_name: link.students.full_name || "",
        preferred_name: link.students.preferred_name || "",
        birth_date: link.students.birth_date || "",
        current_school: link.students.current_school || "",
        notes: link.students.notes || "",
      }] : []));
  }, [open, guardian]);

  const updateStudent = (studentId: string, field: keyof Omit<StudentDraft, "id">, value: string) => {
    setStudents((current) => current.map((student) =>
      student.id === studentId ? { ...student, [field]: value } : student,
    ));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!guardianName.trim()) {
      toast({
        title: "Informe o nome do responsável",
        description: "O nome completo é obrigatório.",
        variant: "destructive",
      });
      return;
    }
    if (students.some((student) => !student.full_name.trim())) {
      toast({
        title: "Informe o nome de todos os alunos",
        description: "Cada aluno vinculado precisa ter um nome completo.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const { error } = await (supabase as any).rpc("update_school_family", {
      p_guardian_id: guardian.id,
      p_full_name: guardianName.trim(),
      p_preferred_name: preferredName.trim() || null,
      p_email: email.trim() || null,
      p_phone: phone.trim() || null,
      p_whatsapp_opt_in: whatsappOptIn,
      p_notes: guardianNotes.trim() || null,
      p_students: students.map((student) => ({
        id: student.id,
        full_name: student.full_name.trim(),
        preferred_name: student.preferred_name.trim() || null,
        birth_date: student.birth_date || null,
        current_school: student.current_school.trim() || null,
        notes: student.notes.trim() || null,
      })),
    });
    setSaving(false);

    if (error) {
      toast({
        title: "Não foi possível salvar as alterações",
        description: error.message || "Verifique os dados e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Cadastro atualizado",
      description: "Os dados da família e dos alunos foram salvos com sucesso.",
    });
    setOpen(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          <Edit className="h-4 w-4" />
          Editar cadastro
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-950">
              <UserRound className="h-5 w-5 text-emerald-700" />
              Editar família e alunos
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              Corrija os dados do responsável e dos alunos vinculados. As alterações ficam registradas na auditoria do CRM.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-5">
            <section>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Responsável</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`guardian-name-${guardian.id}`}>Nome completo *</Label>
                  <Input id={`guardian-name-${guardian.id}`} value={guardianName} onChange={(event) => setGuardianName(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`guardian-preferred-${guardian.id}`}>Nome de preferência</Label>
                  <Input id={`guardian-preferred-${guardian.id}`} value={preferredName} onChange={(event) => setPreferredName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`guardian-phone-${guardian.id}`}>WhatsApp / telefone</Label>
                  <Input id={`guardian-phone-${guardian.id}`} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(96) 99999-9999" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`guardian-email-${guardian.id}`}>E-mail</Label>
                  <Input id={`guardian-email-${guardian.id}`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>
                <div className="flex items-center gap-3 rounded-md border p-3 sm:mt-6">
                  <Checkbox id={`guardian-whatsapp-${guardian.id}`} checked={whatsappOptIn} onCheckedChange={(value) => setWhatsappOptIn(value === true)} />
                  <Label htmlFor={`guardian-whatsapp-${guardian.id}`} className="cursor-pointer text-sm leading-5">
                    Autoriza contato pelo WhatsApp
                  </Label>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`guardian-notes-${guardian.id}`}>Observações internas</Label>
                  <Textarea id={`guardian-notes-${guardian.id}`} value={guardianNotes} onChange={(event) => setGuardianNotes(event.target.value)} rows={2} />
                </div>
              </div>
            </section>

            {students.map((student, index) => (
              <section key={student.id} className="border-t pt-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">
                  Aluno {students.length > 1 ? index + 1 : ""}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`student-name-${student.id}`}>Nome completo *</Label>
                    <Input id={`student-name-${student.id}`} value={student.full_name} onChange={(event) => updateStudent(student.id, "full_name", event.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`student-preferred-${student.id}`}>Nome de preferência</Label>
                    <Input id={`student-preferred-${student.id}`} value={student.preferred_name || ""} onChange={(event) => updateStudent(student.id, "preferred_name", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`student-birth-${student.id}`}>Data de nascimento</Label>
                    <Input id={`student-birth-${student.id}`} type="date" value={student.birth_date || ""} onChange={(event) => updateStudent(student.id, "birth_date", event.target.value)} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`student-school-${student.id}`}>Escola atual</Label>
                    <Input id={`student-school-${student.id}`} value={student.current_school || ""} onChange={(event) => updateStudent(student.id, "current_school", event.target.value)} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`student-notes-${student.id}`}>Observações do aluno</Label>
                    <Textarea id={`student-notes-${student.id}`} value={student.notes || ""} onChange={(event) => updateStudent(student.id, "notes", event.target.value)} rows={2} />
                  </div>
                </div>
              </section>
            ))}
            {!students.length && (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                Esta família ainda não possui alunos vinculados. Os dados do responsável podem ser corrigidos normalmente.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800">
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
