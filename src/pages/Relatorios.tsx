import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle, CalendarRange, ClipboardList, Contact, FileDown, FileSpreadsheet, GraduationCap, Loader2,
  MessageCircle, PieChart, School, Star, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useSchoolIdentity } from "@/hooks/useSchoolIdentity";
import { schoolDateTimeInput } from "@/lib/schoolDateTime";
import { REPORTS, type ReportRange } from "@/lib/reports";
import { downloadCsv, printReport, slugify } from "@/lib/reportExport";

const ICONS: Record<string, LucideIcon> = {
  resumo: PieChart, contatos: MessageCircle, familias: Contact, funil: GraduationCap,
  visitas: School, pesquisas: Star, matriculas: ClipboardList,
};
const PREVIEW_ROWS = 50;

const today = () => schoolDateTimeInput(new Date()).slice(0, 10);
const daysAgo = (n: number) => schoolDateTimeInput(new Date(Date.now() - n * 86_400_000)).slice(0, 10);
/** Campanha de matrículas: de 1º de agosto até 31 de março do ano seguinte. */
function campaignStart() {
  const t = today();
  const year = Number(t.slice(0, 4));
  return Number(t.slice(5, 7)) >= 8 ? `${year}-08-01` : `${year - 1}-08-01`;
}

const PRESETS = [
  { id: "7", label: "7 dias", range: () => ({ from: daysAgo(6), to: today() }) },
  { id: "30", label: "30 dias", range: () => ({ from: daysAgo(29), to: today() }) },
  { id: "90", label: "90 dias", range: () => ({ from: daysAgo(89), to: today() }) },
  { id: "mes", label: "Este mês", range: () => ({ from: `${today().slice(0, 7)}-01`, to: today() }) },
  { id: "campanha", label: "Campanha de matrículas", range: () => ({ from: campaignStart(), to: today() }) },
];

export default function Relatorios() {
  const { schoolName } = useSchoolIdentity();
  const { user } = useAuth();
  const [reportId, setReportId] = useState(REPORTS[0].id);
  const [preset, setPreset] = useState("30");
  const [range, setRange] = useState<ReportRange>(PRESETS[1].range());
  const report = REPORTS.find((r) => r.id === reportId) || REPORTS[0];
  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(range.from) && /^\d{4}-\d{2}-\d{2}$/.test(range.to) && range.from <= range.to;

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ["relatorio", report.id, report.usesPeriod ? range.from : "", report.usesPeriod ? range.to : ""],
    queryFn: () => report.load(range),
    enabled: !report.usesPeriod || validRange,
    staleTime: 60_000,
  });

  const fileName = useMemo(() => {
    const base = `relatorio-${report.id}-${slugify(schoolName)}`;
    return report.usesPeriod ? `${base}-${range.from}-a-${range.to}` : `${base}-${today()}`;
  }, [report, schoolName, range]);

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(data, fileName);
    toast.success("Planilha baixada", { description: `${data.rows.length} registros em ${fileName}.csv` });
  };
  const exportPdf = () => {
    if (!data) return;
    try {
      printReport(data, { schoolName, fileName, generatedBy: user?.email || undefined });
      toast("Escolha “Salvar como PDF” na janela de impressão.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF.");
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-emerald-950/10 bg-white px-5 py-5 md:px-8">
        <div className="mx-auto max-w-[1480px]">
          <p className="text-sm font-semibold text-emerald-700">Relatórios</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Gerar relatório</h1>
          <p className="mt-1 text-sm text-slate-600">Escolha o relatório e o período, confira a prévia e baixe em planilha (CSV) ou PDF.</p>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1480px] gap-6 p-5 md:p-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section aria-labelledby="lista-relatorios" className="space-y-2">
          <h2 id="lista-relatorios" className="text-sm font-semibold text-slate-700">Relatórios disponíveis</h2>
          <div role="radiogroup" aria-label="Relatório" className="space-y-2">
            {REPORTS.map((r) => {
              const Icon = ICONS[r.id] || FileSpreadsheet;
              const active = r.id === report.id;
              return (
                <button key={r.id} type="button" role="radio" aria-checked={active} onClick={() => setReportId(r.id)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    active ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40"}`}>
                  <span className={`mt-0.5 rounded-lg p-2 ${active ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700"}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-sm text-slate-900">{r.title}</strong>
                    <span className="block text-xs leading-snug text-slate-600">{r.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="min-w-0 space-y-5" aria-live="polite">
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <CalendarRange className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-800">Período</h2>
              {!report.usesPeriod && <span className="text-xs text-slate-500">— este relatório mostra o cadastro completo, sem período.</span>}
            </div>
            <fieldset disabled={!report.usesPeriod} className="mt-3 flex flex-wrap items-end gap-3 disabled:opacity-50">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Atalhos de período">
                {PRESETS.map((p) => (
                  <button key={p.id} type="button" aria-pressed={preset === p.id}
                    onClick={() => { setPreset(p.id); setRange(p.range()); }}
                    className={`h-9 rounded-lg border px-3 text-sm font-medium ${preset === p.id ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                De
                <input type="date" value={range.from} max={range.to} onChange={(e) => { setPreset(""); setRange((r) => ({ ...r, from: e.target.value })); }}
                  className="h-9 rounded-lg border border-slate-300 px-2 text-sm text-slate-900" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Até
                <input type="date" value={range.to} min={range.from} max={today()} onChange={(e) => { setPreset(""); setRange((r) => ({ ...r, to: e.target.value })); }}
                  className="h-9 rounded-lg border border-slate-300 px-2 text-sm text-slate-900" />
              </label>
            </fieldset>
            {report.usesPeriod && !validRange && <p className="mt-2 text-sm text-rose-700">Confira as datas: o início precisa ser antes do fim.</p>}
          </div>

          <div className="rounded-2xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-950">{report.title}</h2>
                <p className="text-sm text-slate-600">{data?.subtitle || (report.usesPeriod ? "" : "Cadastro geral")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={exportCsv} disabled={!data || isFetching}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50">
                  <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />Baixar planilha (CSV)
                </button>
                <button type="button" onClick={exportPdf} disabled={!data || isFetching}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
                  <FileDown className="h-4 w-4" aria-hidden="true" />Baixar PDF
                </button>
              </div>
            </div>

            <div className="space-y-4 p-4">
              {isFetching && <p className="text-sm text-slate-600"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Montando o relatório…</p>}
              {isError && !isFetching && (
                <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  Não foi possível montar o relatório. {error instanceof Error ? error.message : ""}
                </div>
              )}
              {data && !isFetching && (
                <>
                  {data.notice && (
                    <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{data.notice}
                    </div>
                  )}
                  {!!data.summary?.length && (
                    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {data.summary.map((s) => (
                        <div key={s.label} className="rounded-xl bg-emerald-50/60 p-3">
                          <dt className="text-xs text-slate-600">{s.label}</dt>
                          <dd className="mt-1 text-2xl font-bold text-slate-950">{s.value ?? "—"}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {data.rows.length ? (
                    <>
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full min-w-[640px] text-left text-sm">
                          <caption className="sr-only">Prévia do relatório {report.title}</caption>
                          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                            <tr>{data.columns.map((c) => <th key={c.key} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{c.label}</th>)}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {data.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                              <tr key={i} className="align-top">
                                {data.columns.map((c) => <td key={c.key} className="px-3 py-2 text-slate-800">{row[c.key] ?? ""}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-slate-500">
                        {data.rows.length > PREVIEW_ROWS
                          ? `Prévia com ${PREVIEW_ROWS} de ${data.rows.length} registros. A planilha e o PDF trazem todos.`
                          : `${data.rows.length} ${data.rows.length === 1 ? "registro" : "registros"}.`}
                      </p>
                    </>
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">Nenhum registro encontrado{report.usesPeriod ? " neste período" : ""}.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
