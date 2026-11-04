import { useMemo, useState } from "react";
import { ClipboardPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { saveEnrollmentEntries, useEnrollmentComparison } from "@/hooks/useEnrollmentComparison";
import { academicYearOf, formatDay, todayKey } from "@/lib/enrollmentCalendar";
import { DEMO_MODE } from "@/lib/demo";
import { btn, btnPrimary } from "@/components/crm/ui";

type Entry = { academic_year: number; day: string; count: number };

// Aceita linhas como "21/10/2025;5", "21/10/2025 5", "2025-10-21	5" (colado do Excel).
function parsePasted(text: string): { entries: Entry[]; invalid: string[] } {
  const entries: Entry[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})[\s;,\t]+(\d+)$/) || null;
    const iso = line.match(/^(\d{4})-(\d{2})-(\d{2})[\s;,\t]+(\d+)$/);
    let day = ""; let count = NaN;
    if (m) { day = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; count = Number(m[4]); }
    else if (iso) { day = `${iso[1]}-${iso[2]}-${iso[3]}`; count = Number(iso[4]); }
    if (!day || !Number.isFinite(count) || Number.isNaN(Date.parse(`${day}T12:00:00Z`))) { invalid.push(line); continue; }
    entries.push({ academic_year: academicYearOf(day), day, count });
  }
  return { entries, invalid };
}

export function RecordEnrollmentsDialog({ compact }: { compact?: boolean }) {
  const qc = useQueryClient();
  const { data } = useEnrollmentComparison();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"dia" | "colar">("dia");
  const [day, setDay] = useState(todayKey());
  const [count, setCount] = useState("");
  const [pasted, setPasted] = useState("");
  const [saving, setSaving] = useState(false);

  const existing = data?.manualByDay[day];
  const parsed = useMemo(() => parsePasted(pasted), [pasted]);
  const validDay = /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= todayKey();
  const canSave = mode === "dia" ? validDay && count !== "" && Number(count) >= 0 : parsed.entries.length > 0;

  const save = async () => {
    const entries: Entry[] = mode === "dia"
      ? [{ academic_year: academicYearOf(day), day, count: Math.floor(Number(count)) }]
      : parsed.entries;
    setSaving(true);
    try {
      await saveEnrollmentEntries(entries);
      await qc.invalidateQueries({ queryKey: ["comparativo-matriculas"] });
      toast.success(mode === "dia"
        ? `${entries[0].count} ${entries[0].count === 1 ? "matrícula registrada" : "matrículas registradas"} em ${formatDay(day)}${DEMO_MODE ? " (demonstração)" : ""}`
        : `${entries.length} dias registrados${DEMO_MODE ? " (demonstração)" : ""}`);
      setCount(""); setPasted(""); setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) { setOpen(next); if (next) { setDay(todayKey()); setMode("dia"); } } }}>
      <DialogTrigger asChild>
        <button type="button" className={compact ? btn : btnPrimary}><ClipboardPlus className="h-4 w-4" aria-hidden="true" />Registrar matrículas</button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar matrículas</DialogTitle>
          <DialogDescription>Informe quantas matrículas foram feitas no dia. O sistema calcula o acumulado e compara com a mesma data dos anos anteriores.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg bg-[#F2F4F7] p-1" role="tablist" aria-label="Forma de lançamento">
          {([["dia", "Um dia"], ["colar", "Vários dias (colar)"]] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={mode === key} onClick={() => setMode(key)}
              className={`min-h-9 flex-1 rounded-md text-sm font-medium ${mode === key ? "bg-white text-[#1B2430] shadow-sm" : "text-[#5B6675]"}`}>{label}</button>
          ))}
        </div>

        {mode === "dia" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="mat-dia" className="text-sm font-medium">Data</label>
              <input id="mat-dia" type="date" max={todayKey()} value={day} onChange={(e) => setDay(e.target.value)}
                className="min-h-10 rounded-lg border border-[#D0D5DD] px-3 text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="mat-qtd" className="text-sm font-medium">Matrículas no dia</label>
              <input id="mat-qtd" type="number" inputMode="numeric" min={0} step={1} value={count} onChange={(e) => setCount(e.target.value)}
                placeholder="0" className="min-h-10 rounded-lg border border-[#D0D5DD] px-3 text-sm" />
            </div>
            <p className="text-[13px] text-[#5B6675] sm:col-span-2">
              {validDay ? <>Conta para o ano letivo <b>{academicYearOf(day)}</b>.</> : "Escolha uma data até hoje."}
              {existing !== undefined && <> Já há <b>{existing}</b> registrada{existing === 1 ? "" : "s"} neste dia; o valor novo substitui.</>}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mat-colar" className="text-sm font-medium">Uma linha por dia: data e quantidade</label>
            <textarea id="mat-colar" rows={7} value={pasted} onChange={(e) => setPasted(e.target.value)}
              placeholder={"21/10/2025;5\n22/10/2025;3\n23/10/2025;7"} className="rounded-lg border border-[#D0D5DD] px-3 py-2 font-mono text-sm" />
            <p className="text-[13px] text-[#5B6675]">
              Dá para colar duas colunas do Excel (data e quantidade). {parsed.entries.length > 0 && <><b>{parsed.entries.length}</b> dias reconhecidos.</>}
              {parsed.invalid.length > 0 && <span className="text-[#B42318]"> {parsed.invalid.length} linha(s) não reconhecida(s): {parsed.invalid.slice(0, 2).join(" · ")}</span>}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btn} onClick={() => setOpen(false)} disabled={saving}>Cancelar</button>
          <button type="button" className={btnPrimary} onClick={() => void save()} disabled={!canSave || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}Salvar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
