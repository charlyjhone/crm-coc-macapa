import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Atendimento } from "@/hooks/useAtendimentos";
import { useFunnelActions } from "@/hooks/useFunnelActions";
import { currentAcademicYear } from "@/lib/enrollmentCalendar";
import { FREE_SOURCES, GRADE_GROUPS, PAID_SOURCES, gradeForAge, isPaidSource } from "@/lib/funnel";
import { OptionButton } from "@/components/crm/FunnelBits";
import { btn, btnPrimary } from "@/components/crm/ui";

type Purpose = "matricula" | "familia" | "outro";

const allGrades = GRADE_GROUPS.flatMap((group) => group.grades.map((grade) => grade.name));

function guessGrade(text: string | null | undefined) {
  const t = (text || "").toLocaleLowerCase("pt-BR");
  if (!t) return "";
  return [...allGrades].sort((a, b) => b.length - a.length).find((grade) => t.includes(grade.toLocaleLowerCase("pt-BR"))) || "";
}

function guessSource(lead: Atendimento | null | undefined) {
  const s = (lead?.source || "").toLocaleLowerCase("pt-BR");
  if (/an[uú]ncio.*face|facebook ads|meta.*face/.test(s)) return "anuncio_facebook";
  if (/an[uú]ncio|tr[aá]fego|ads/.test(s)) return "anuncio_instagram";
  if (s.includes("indica")) return "indicacao";
  if (s.includes("insta") || s.includes("redes")) return "instagram";
  if (lead?.phone) return "whatsapp";
  return "";
}

const looksLikePlaceholder = (name: string | null | undefined) => !name || /^contato\s*\+?\d/i.test(name.trim());

const SectionTitle = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <h3 className="flex items-center gap-2.5 text-[15px] font-bold text-[#151A23]">
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--crm-accent)] text-[13px] text-white">{n}</span>{children}
  </h3>
);
const Group = ({ children }: { children: React.ReactNode }) => <p className="mt-1 text-[11px] font-bold uppercase tracking-[.06em] text-[#5A6474]">{children}</p>;

export function ClassifyContactDialog({ lead, open, onOpenChange }: { lead: Atendimento | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const actions = useFunnelActions();
  const [purpose, setPurpose] = useState<Purpose>("matricula");
  const [guardianName, setGuardianName] = useState("");
  const [phone, setPhone] = useState("");
  const [studentName, setStudentName] = useState("");
  const [age, setAge] = useState("");
  const [grade, setGrade] = useState("");
  const [shift, setShift] = useState("");
  const [source, setSource] = useState("");
  const [campaign, setCampaign] = useState("");
  const [year, setYear] = useState(currentAcademicYear());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPurpose(lead?.assunto && !["matricula", "outros"].includes(lead.assunto) ? "outro" : "matricula");
    setGuardianName(looksLikePlaceholder(lead?.name) ? "" : lead?.name || "");
    setPhone(lead?.phone || "");
    setStudentName("");
    setAge("");
    setGrade(guessGrade(`${lead?.interesse || ""} ${lead?.triage_summary || ""} ${lead?.last_inbound_message || ""}`));
    setShift(/tarde/i.test(lead?.interesse || "") ? "tarde" : /manh/i.test(lead?.interesse || "") ? "manhã" : "");
    setSource(guessSource(lead));
    setCampaign("");
    setYear(currentAcademicYear());
  }, [open, lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onAge = (value: string) => {
    setAge(value);
    const suggested = gradeForAge(Number(value.replace(/\D/g, "")));
    if (suggested) setGrade(suggested);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (purpose !== "matricula") {
        if (lead) await actions.markNotEnrollment(lead.id);
        toast.success(purpose === "familia" ? "Marcado como família da escola" : "Marcado como outro assunto", { description: "O contato saiu da lista de novos." });
        onOpenChange(false);
        return;
      }
      if (!guardianName.trim() || !studentName.trim() || !grade) {
        toast.error("Preencha responsável, aluno e série.");
        return;
      }
      await actions.classify({ leadId: lead?.id || null, guardianName, phone, studentName, academicYear: year, grade, shift: shift || null, source: source || null, campaign: isPaidSource(source) ? campaign : null });
      toast.success("Família no funil", { description: `${studentName.trim()} entrou como novo contato · ${grade}.` });
      onOpenChange(false);
    } catch (error) {
      toast.error("Não foi possível salvar", { description: error instanceof Error ? error.message : "Tente novamente." });
    } finally {
      setSaving(false);
    }
  };

  const title = lead ? `Classificar contato · ${looksLikePlaceholder(lead.name) ? lead.phone || "sem nome" : lead.name}` : "Novo contato";

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle className="text-[20px]">{title}</DialogTitle>
            <DialogDescription>Leva menos de 30 segundos. O que já se sabe da conversa vem preenchido.</DialogDescription>
          </DialogHeader>

          {lead && (lead.last_inbound_message || lead.triage_summary) && (
            <div className="rounded-xl bg-[#F1F3F6] px-4 py-3 text-sm leading-relaxed">
              {lead.last_inbound_message && <p>“{lead.last_inbound_message}”</p>}
              {lead.triage_summary && <p className="mt-1 text-[13px] text-[#5A6474]">Resumo: {lead.triage_summary}</p>}
            </div>
          )}

          <section className="flex flex-col gap-2.5">
            <SectionTitle n={1}>O que essa pessoa procura?</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <OptionButton selected={purpose === "matricula"} onClick={() => setPurpose("matricula")} hint="entra no funil">Matrícula de novo aluno</OptionButton>
              {lead && <OptionButton selected={purpose === "familia"} onClick={() => setPurpose("familia")} hint="segue no atendimento">Já é família da escola</OptionButton>}
              {lead && <OptionButton selected={purpose === "outro"} onClick={() => setPurpose("outro")} hint="financeiro, documentos…">Outro assunto</OptionButton>}
            </div>
          </section>

          {purpose === "matricula" && (
            <>
              <section className="flex flex-col gap-3">
                <SectionTitle n={2}>Quem é a família?</SectionTitle>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="cl-guardian">Responsável *</Label><Input id="cl-guardian" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} placeholder="Nome completo" /></div>
                  {lead ? (
                    <div className="space-y-1.5"><Label>Telefone</Label><p className="flex min-h-10 items-center text-sm text-[#5A6474]">{lead.phone || lead.email || "—"}</p></div>
                  ) : (
                    <div className="space-y-1.5"><Label htmlFor="cl-phone">WhatsApp</Label><Input id="cl-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(96) 99999-9999" /></div>
                  )}
                  <div className="space-y-1.5"><Label htmlFor="cl-student">Aluno *</Label><Input id="cl-student" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Nome do aluno" /></div>
                  <div className="space-y-1.5"><Label htmlFor="cl-age">Idade</Label><Input id="cl-age" inputMode="numeric" value={age} onChange={(e) => onAge(e.target.value)} placeholder="Sugere a série" /></div>
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <SectionTitle n={3}>Para qual série?</SectionTitle>
                {GRADE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <Group>{group.label}</Group>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {group.grades.map((g) => <OptionButton key={g.name} selected={grade === g.name} onClick={() => setGrade(g.name)}>{g.name}</OptionButton>)}
                    </div>
                  </div>
                ))}
                {grade && !allGrades.includes(grade) && <p className="text-xs text-[#5A6474]">Série atual: {grade}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[#3B4452]">Turno</span>
                  {["manhã", "tarde", "integral"].map((s) => <OptionButton key={s} selected={shift === s} onClick={() => setShift(shift === s ? "" : s)}>{s.charAt(0).toUpperCase() + s.slice(1)}</OptionButton>)}
                  <span className="ml-auto flex items-center gap-2 text-sm"><Label htmlFor="cl-year">Ano letivo</Label>
                    <Input id="cl-year" type="number" min={2026} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value) || currentAcademicYear())} className="h-10 w-24" /></span>
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <SectionTitle n={4}>Como conheceu a escola?</SectionTitle>
                <Group>Anúncio pago</Group>
                <div className="flex flex-wrap gap-2">{PAID_SOURCES.map((o) => <OptionButton key={o.value} selected={source === o.value} onClick={() => setSource(o.value)}>{o.label}</OptionButton>)}</div>
                <Group>Sem anúncio</Group>
                <div className="flex flex-wrap gap-2">{FREE_SOURCES.map((o) => <OptionButton key={o.value} selected={source === o.value} onClick={() => setSource(o.value)}>{o.label}</OptionButton>)}</div>
                {isPaidSource(source) && (
                  <div className="mt-1 space-y-1.5"><Label htmlFor="cl-campaign">Campanha</Label>
                    <Input id="cl-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="ex.: Matrículas 2027 · Fundamental II" /></div>
                )}
              </section>
            </>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#EEF0F3] pt-4">
            {lead && <Link to={`/atendimentos?aba=todas&lead=${lead.id}`} className={`${btn} mr-auto`} onClick={() => onOpenChange(false)}>Abrir conversa</Link>}
            <button type="button" className={btn} onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</button>
            <button type="submit" className={btnPrimary} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {purpose === "matricula" ? "Salvar e colocar no funil" : "Salvar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
