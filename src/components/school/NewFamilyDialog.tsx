import { FormEvent, useState } from "react";
import { Plus, UserPlus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const grades = [
  "Maternal", "Jardim I", "Jardim II", "1º ano", "2º ano", "3º ano",
  "4º ano", "5º ano", "6º ano", "7º ano", "8º ano", "9º ano",
  "1ª série", "2ª série", "3ª série",
];

export function NewFamilyDialog({ onCreated }: { onCreated?: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [studentName, setStudentName] = useState("");
  const [academicYear, setAcademicYear] = useState("2027");
  const [grade, setGrade] = useState("");
  const [shift, setShift] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);

  const reset = () => {
    setGuardianName("");
    setPhone("");
    setEmail("");
    setStudentName("");
    setGrade("");
    setShift("");
    setWhatsappOptIn(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!guardianName.trim() || !studentName.trim() || !grade) {
      toast({
        title: "Preencha os campos obrigatórios",
        description: "Responsável, aluno e série são necessários.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const { error } = await (supabase as any).rpc("create_school_enrollment", {
      p_guardian_name: guardianName.trim(),
      p_guardian_phone: phone.trim(),
      p_guardian_email: email.trim(),
      p_student_name: studentName.trim(),
      p_academic_year: Number(academicYear),
      p_desired_grade: grade,
      p_desired_shift: shift || null,
      p_whatsapp_opt_in: whatsappOptIn,
      p_source_channel: "cadastro_manual",
    });
    setSaving(false);

    if (error) {
      toast({
        title: "Não foi possível cadastrar",
        description: error.message || "Verifique os dados e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Família e oportunidade cadastradas",
      description: studentName.trim() + " entrou no funil como novo interessado.",
    });
    reset();
    setOpen(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800">
          <Plus className="h-4 w-4" />
          Nova família
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-950">
              <UserPlus className="h-5 w-5 text-emerald-700" />
              Cadastrar família e interesse
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              O cadastro cria o responsável, o aluno e a oportunidade de matrícula em uma única operação.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-5">
            <section>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Responsável</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="guardian-name">Nome completo *</Label>
                  <Input id="guardian-name" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guardian-phone">WhatsApp</Label>
                  <Input id="guardian-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(96) 99999-9999" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guardian-email">E-mail</Label>
                  <Input id="guardian-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <label className="flex items-center gap-3 text-sm text-slate-700 sm:col-span-2">
                  <Checkbox checked={whatsappOptIn} onCheckedChange={(value) => setWhatsappOptIn(value === true)} />
                  Responsável autorizou contato pelo WhatsApp
                </label>
              </div>
            </section>

            <section className="border-t pt-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Aluno e interesse</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="student-name">Nome do aluno *</Label>
                  <Input id="student-name" value={studentName} onChange={(e) => setStudentName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="academic-year">Ano letivo *</Label>
                  <Input id="academic-year" type="number" min="2026" max="2100" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Série pretendida *</Label>
                  <Select value={grade} onValueChange={setGrade}>
                    <SelectTrigger><SelectValue placeholder="Selecione a série" /></SelectTrigger>
                    <SelectContent>{grades.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Turno pretendido</Label>
                  <Select value={shift} onValueChange={setShift}>
                    <SelectTrigger><SelectValue placeholder="Selecione o turno" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manhã">Manhã</SelectItem>
                      <SelectItem value="tarde">Tarde</SelectItem>
                      <SelectItem value="integral">Integral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-emerald-700 text-white hover:bg-emerald-800">
              {saving ? "Salvando..." : "Cadastrar e incluir no funil"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
