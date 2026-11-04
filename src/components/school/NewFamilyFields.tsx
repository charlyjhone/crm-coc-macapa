/* eslint-disable @typescript-eslint/no-explicit-any -- RPC e system_settings fora dos tipos gerados do Supabase. */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_MODE } from "@/lib/demo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currentAcademicYear } from "@/lib/enrollmentCalendar";
import { FREE_SOURCES, GRADE_GROUPS, PAID_SOURCES, gradeGroupsFromSetting, type GradeGroup } from "@/lib/funnel";

/** Família ainda não cadastrada, informada direto no agendamento da visita. */
export type NewFamily = { guardianName: string; phone: string; studentName: string; grade: string; shift: string; source: string };
export const emptyNewFamily: NewFamily = { guardianName: "", phone: "", studentName: "", grade: "", shift: "", source: "" };

export type FamilyMode = "cadastrada" | "nova";

/** Séries da escola (configuração série=idade); sem ela, a tabela padrão. */
export function useSchoolGrades(enabled = true): GradeGroup[] {
  const { data } = useQuery({
    queryKey: ["escola-series-idades"],
    enabled: enabled && !DEMO_MODE,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any).from("system_settings").select("value").eq("key", "escola_series_idades").maybeSingle();
      return gradeGroupsFromSetting(data?.value) || null;
    },
  });
  return data || GRADE_GROUPS;
}

export function newFamilyMissing(f: NewFamily) {
  if (f.guardianName.trim().split(/\s+/).length < 2) return "Informe o nome completo do responsável";
  if (!f.studentName.trim()) return "Informe o nome do aluno";
  if (!f.grade) return "Escolha a série pretendida";
  return null;
}

/** Cadastra responsável, aluno e oportunidade no funil; devolve a oportunidade criada. */
export async function createFamilyForVisit(f: NewFamily): Promise<string> {
  const { data, error } = await (supabase as any).rpc("create_school_enrollment", {
    p_guardian_name: f.guardianName.trim(),
    p_guardian_phone: f.phone.trim(),
    p_guardian_email: "",
    p_student_name: f.studentName.trim(),
    p_academic_year: currentAcademicYear(),
    p_desired_grade: f.grade,
    p_desired_shift: f.shift || null,
    p_whatsapp_opt_in: false,
    p_source_channel: f.source || "cadastro_manual",
  });
  if (error) throw error;
  const id = data?.opportunity_id as string | undefined;
  if (!id) throw new Error("O cadastro da família não retornou a oportunidade.");
  return id;
}

export function FamilyModeToggle({ mode, onChange }: { mode: FamilyMode; onChange: (mode: FamilyMode) => void }) {
  const option = (value: FamilyMode, label: string) => (
    <button type="button" aria-pressed={mode === value} onClick={() => onChange(value)}
      className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${mode === value ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
      {label}
    </button>
  );
  return (
    <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Família">
      {option("cadastrada", "Família já cadastrada")}
      {option("nova", "Família nova")}
    </div>
  );
}

export function NewFamilyFields({ value, onChange }: { value: NewFamily; onChange: (value: NewFamily) => void }) {
  const groups = useSchoolGrades();
  const grades = useMemo(() => groups.flatMap((g) => g.grades.map((x) => x.name)).filter((n, i, a) => a.indexOf(n) === i), [groups]);
  const set = (patch: Partial<NewFamily>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 p-3">
      <p className="text-xs text-slate-500">A família entra no funil junto com a visita, sem precisar cadastrar antes.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="nf-guardian">Responsável (nome completo) *</Label>
          <Input id="nf-guardian" value={value.guardianName} onChange={(e) => set({ guardianName: e.target.value })} placeholder="Ex.: Maria da Silva" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nf-phone">WhatsApp do responsável</Label>
          <Input id="nf-phone" inputMode="tel" value={value.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="(96) 99999-9999" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nf-student">Aluno *</Label>
          <Input id="nf-student" value={value.studentName} onChange={(e) => set({ studentName: e.target.value })} placeholder="Nome do aluno" />
        </div>
        <div className="space-y-1.5">
          <Label>Série pretendida *</Label>
          <Select value={value.grade} onValueChange={(grade) => set({ grade })}>
            <SelectTrigger><SelectValue placeholder="Escolha a série" /></SelectTrigger>
            <SelectContent>{grades.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Turno</Label>
          <Select value={value.shift || "sem"} onValueChange={(shift) => set({ shift: shift === "sem" ? "" : shift })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sem">Ainda não sabe</SelectItem>
              <SelectItem value="manhã">Manhã</SelectItem>
              <SelectItem value="tarde">Tarde</SelectItem>
              <SelectItem value="integral">Integral</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Como conheceu a escola</Label>
          <Select value={value.source || "sem"} onValueChange={(source) => set({ source: source === "sem" ? "" : source })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sem">Não informado</SelectItem>
              {[...PAID_SOURCES, ...FREE_SOURCES].map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export type FamilyOption = {
  id: string;
  desired_grade: string;
  desired_shift?: string | null;
  students: { full_name: string } | null;
  guardians: { full_name: string } | null;
};

const fold = (text: string) => text.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Busca por nome (aluno ou responsável); se não achar, oferece cadastrar como família nova. */
export function FamilySearch({ options, value, onChange, onNew }: {
  options: FamilyOption[]; value: string; onChange: (id: string) => void; onNew: (typed: string) => void;
}) {
  const [term, setTerm] = useState("");
  const selected = options.find((o) => o.id === value) || null;
  const matches = useMemo(() => {
    const t = fold(term.trim());
    if (!t) return options.slice(0, 8);
    return options.filter((o) => fold(`${o.students?.full_name || ""} ${o.guardians?.full_name || ""}`).includes(t)).slice(0, 8);
  }, [options, term]);
  const label = (o: FamilyOption) => `${o.students?.full_name || "Aluno"} · ${o.desired_grade}${o.guardians?.full_name ? ` · ${o.guardians.full_name}` : ""}`;

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
        <span className="min-w-0 truncate font-semibold text-slate-900">{label(selected)}</span>
        <button type="button" className="shrink-0 text-sm font-medium text-emerald-800 underline" onClick={() => { onChange(""); setTerm(""); }}>Trocar</button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Digite o nome do aluno ou do responsável" aria-label="Buscar família" />
      <ul className="max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {matches.map((o) => (
          <li key={o.id}>
            <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => onChange(o.id)}>{label(o)}</button>
          </li>
        ))}
        {!matches.length && <li className="px-3 py-2 text-sm text-slate-500">Nenhuma família com esse nome no funil.</li>}
      </ul>
      <button type="button" className="text-sm font-medium text-emerald-800 underline" onClick={() => onNew(term.trim())}>
        {term.trim() ? `Cadastrar “${term.trim()}” como família nova` : "Cadastrar família nova"}
      </button>
    </div>
  );
}
