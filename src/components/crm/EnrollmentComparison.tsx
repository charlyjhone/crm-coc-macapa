import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2 } from "lucide-react";
import { useEnrollmentComparison, type YearComparison } from "@/hooks/useEnrollmentComparison";
import { formatDay } from "@/lib/enrollmentCalendar";
import { crmTheme as t } from "@/lib/crmTheme";
import { Panel } from "@/components/crm/ui";
import { RecordEnrollmentsDialog } from "@/components/crm/RecordEnrollmentsDialog";

function Diff({ current, past }: { current: number; past: YearComparison }) {
  if (!past.hasData) return <span className="text-xs text-[#5B6675]">sem histórico</span>;
  const diff = current - past.cumulative;
  const pct = past.cumulative ? Math.round((diff / past.cumulative) * 100) : null;
  const tone = diff > 0 ? "bg-[#ECFDF3] text-[#067647]" : diff < 0 ? "bg-[#FEF3F2] text-[#B42318]" : "bg-[#F2F4F7] text-[#344054]";
  const text = diff > 0 ? `${diff} à frente` : diff < 0 ? `${Math.abs(diff)} atrás` : "empatado";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      <span aria-hidden="true">{diff > 0 ? "▲" : diff < 0 ? "▼" : "="}</span>{text}{pct !== null && diff !== 0 ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""}
    </span>
  );
}

/** Cartão curto para a tela Hoje. */
export function EnrollmentComparisonCard() {
  const { data, isLoading, isError } = useEnrollmentComparison();
  if (isLoading) return <Panel title="Matrículas"><p className="py-2 text-sm text-[#5B6675]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</p></Panel>;
  if (isError || !data) return <Panel title="Matrículas"><p className="text-sm text-[#B42318]">Não foi possível carregar o comparativo.</p></Panel>;
  const [cur, prev, prev2] = data.years;
  return (
    <Panel title={`Matrículas ${data.year}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-[28px] font-semibold leading-none">{cur.cumulative}</span>
        <span className="text-[13px] text-[#5B6675]">até hoje · {cur.onDay} hoje</span>
      </div>
      <ul className="mt-3 divide-y divide-[#EEF0F3]">
        {[prev, prev2].map((p) => (
          <li key={p.academicYear} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span><b>{p.academicYear}</b> <span className="text-[#5B6675]">em {formatDay(p.refDay).slice(0, 5)}: {p.hasData ? p.cumulative : "—"}</span></span>
            <Diff current={cur.cumulative} past={p} />
          </li>
        ))}
      </ul>
      <div className="mt-3"><RecordEnrollmentsDialog compact /></div>
    </Panel>
  );
}

/** Painel completo para a tela Direção. */
export function EnrollmentComparisonPanel() {
  const { data, isLoading, isError } = useEnrollmentComparison();
  if (isLoading) return <Panel title="Comparativo de matrículas"><p className="py-2 text-sm text-[#5B6675]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</p></Panel>;
  if (isError || !data) return <Panel title="Comparativo de matrículas"><p className="text-sm text-[#B42318]">Não foi possível carregar o comparativo.</p></Panel>;
  const [cur, prev, prev2] = data.years;
  const noHistory = !prev.hasData && !prev2.hasData;
  const todayLabel = data.series[data.todayIndex]?.label;

  return (
    <Panel title="Comparativo de matrículas" action={<RecordEnrollmentsDialog />}>
      <p className="-mt-1 text-[13px] text-[#5B6675]">Comparado com a mesma data nos anos anteriores · hoje {formatDay(data.today)}</p>
      <div className="mt-2 grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <div className="rounded-xl bg-[var(--crm-accent-soft)] p-4">
            <p className="text-[13px] font-medium text-[var(--crm-accent)]">Ano letivo {data.year}</p>
            <p className="mt-1 text-[34px] font-bold leading-none">{cur.cumulative}</p>
            <p className="mt-1 text-[13px] text-[#344054]">matrículas até hoje · <b>{cur.onDay}</b> hoje</p>
          </div>
          {[prev, prev2].map((p) => (
            <div key={p.academicYear} className="rounded-xl border border-[#E4E7EC] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-medium text-[#5B6675]">{p.academicYear} em {formatDay(p.refDay)}</p>
                <Diff current={cur.cumulative} past={p} />
              </div>
              <p className="mt-1 text-2xl font-semibold">{p.hasData ? p.cumulative : "—"}</p>
              <p className="text-[13px] text-[#5B6675]">
                {p.hasData ? <>{p.onDay} no dia · {p.total} no ano todo</> : "Ainda sem lançamentos deste ano"}
              </p>
            </div>
          ))}
        </div>

        <div className="min-w-0">
          <p className="mb-1 text-[13px] text-[#5B6675]">Matrículas acumuladas na campanha (agosto a março)</p>
          <div className="h-[300px]" role="img"
            aria-label={`Acumulado até hoje: ${data.year} ${cur.cumulative}; ${prev.academicYear} ${prev.hasData ? prev.cumulative : "sem dados"}; ${prev2.academicYear} ${prev2.hasData ? prev2.cumulative : "sem dados"}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.series} margin={{ top: 10, right: 12, left: -14, bottom: 0 }}>
                <CartesianGrid stroke="#EEF0F3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#5B6675", fontSize: 11 }} axisLine={false} tickLine={false} interval={29} />
                <YAxis allowDecimals={false} tick={{ fill: "#5B6675", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E4E7EC" }} labelFormatter={(l) => `Dia ${l}`} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                {todayLabel && <ReferenceLine x={todayLabel} stroke="#98A2B3" strokeDasharray="4 4" label={{ value: "hoje", fill: "#5B6675", fontSize: 11, position: "top" }} />}
                {prev2.hasData && <Line name={String(prev2.academicYear)} dataKey="retrasado" stroke="#B9C0CB" strokeWidth={2} strokeDasharray="5 4" dot={false} />}
                {prev.hasData && <Line name={String(prev.academicYear)} dataKey="anterior" stroke={t.warm} strokeWidth={2} dot={false} />}
                <Line name={String(data.year)} dataKey="atual" stroke={t.accent} strokeWidth={3.5} dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {noHistory && (
            <p className="mt-2 rounded-lg bg-[#FFFAEB] px-3 py-2 text-[13px] text-[#93370D]">
              Para comparar, lance as matrículas de {prev.academicYear} e {prev2.academicYear} em “Registrar matrículas › Vários dias”, colando a data e a quantidade de cada dia.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
