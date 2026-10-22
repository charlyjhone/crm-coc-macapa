/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas escolares ainda não estão nos tipos gerados do Supabase. */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { schoolDateTimeInput } from "@/lib/schoolDateTime";
import { campaignDays, currentAcademicYear, sameDateYearsBack, todayKey } from "@/lib/enrollmentCalendar";
import { DEMO_MODE, demo } from "@/lib/demo";

type DayRow = { academic_year: number; day: string; count: number };

export type YearComparison = {
  academicYear: number;
  refDay: string;        // a "mesma data" naquele ano
  cumulative: number;    // matrículas acumuladas até a mesma data
  onDay: number;         // matrículas exatamente naquele dia
  total: number;         // total do ano letivo (anos anteriores)
  hasData: boolean;
};

export type EnrollmentComparison = {
  year: number;
  today: string;
  years: YearComparison[];  // [ano atual, ano passado, ano retrasado]
  series: { label: string; atual?: number; anterior: number | null; retrasado: number | null }[];
  todayIndex: number;
  source: "demo" | "crm";
  manualByDay: Record<string, number>;
};

async function loadRows(year: number): Promise<{ rows: DayRow[]; manual: DayRow[] }> {
  if (DEMO_MODE) {
    // Lançamentos manuais têm prioridade; confirmações no funil só contam para anos sem lançamento.
    const manual = demo.enrollmentEntries();
    const manualYears = new Set(manual.map((r) => r.academic_year));
    const confirmed = demo.enrolledThisSession().map((o) => ({ academic_year: o.academic_year, day: schoolDateTimeInput(o.enrolled_at).slice(0, 10), count: 1 }))
      .filter((r) => !manualYears.has(r.academic_year));
    return { rows: [...manual, ...confirmed], manual };
  }
  const client = supabase as any;
  const years = [year, year - 1, year - 2];
  const [opps, history] = await Promise.all([
    client.from("enrollment_opportunities").select("enrolled_at,academic_year")
      .eq("stage", "matriculado").in("academic_year", years).not("enrolled_at", "is", null).limit(10000),
    // Matrículas por dia lançadas pela secretaria (a tabela pode ainda não existir).
    client.from("enrollment_history").select("academic_year,day,count").in("academic_year", years).limit(10000),
  ]);
  if (opps.error) throw opps.error;
  const fromCrm: DayRow[] = (opps.data || []).map((o: any) => ({ academic_year: o.academic_year, day: schoolDateTimeInput(o.enrolled_at).slice(0, 10), count: 1 }));
  const imported: DayRow[] = history.error ? [] : history.data || [];
  // Para cada ano, o lançamento manual (quando existe) substitui as confirmações do funil.
  const importedYears = new Set(imported.map((r) => r.academic_year));
  return { rows: [...imported, ...fromCrm.filter((r) => !importedYears.has(r.academic_year))], manual: imported };
}

export function compute({ rows, manual }: { rows: DayRow[]; manual: DayRow[] }, year: number): EnrollmentComparison {
  const today = todayKey();
  const byYear = new Map<number, Map<string, number>>();
  for (const r of rows) {
    const m = byYear.get(r.academic_year) || new Map<string, number>();
    m.set(r.day, (m.get(r.day) || 0) + r.count);
    byYear.set(r.academic_year, m);
  }
  const years: YearComparison[] = [0, 1, 2].map((back) => {
    const ay = year - back;
    const refDay = sameDateYearsBack(today, back);
    const days = byYear.get(ay) || new Map<string, number>();
    let cumulative = 0; let total = 0;
    for (const [day, count] of days) { total += count; if (day <= refDay) cumulative += count; }
    return { academicYear: ay, refDay, cumulative, onDay: days.get(refDay) || 0, total, hasData: days.size > 0 };
  });

  const current = campaignDays(year);
  const run = [0, 0, 0];
  const before = [0, 1, 2].map((back) => {
    const days = byYear.get(year - back);
    const start = sameDateYearsBack(current[0], back);
    let sum = 0;
    days?.forEach((count, day) => { if (day < start) sum += count; });
    return sum;
  });
  let todayIndex = current.length - 1;
  const series = current.map((day, i) => {
    if (day === today) todayIndex = i;
    const values = [0, 1, 2].map((back) => {
      run[back] += byYear.get(year - back)?.get(sameDateYearsBack(day, back)) || 0;
      return before[back] + run[back];
    });
    const [d, m] = [day.slice(8, 10), day.slice(5, 7)];
    return {
      label: `${d}/${m}`,
      atual: day <= today ? values[0] : undefined,
      anterior: years[1].hasData ? values[1] : null,
      retrasado: years[2].hasData ? values[2] : null,
    };
  });
  if (today < current[0]) todayIndex = 0;
  const manualByDay: Record<string, number> = {};
  for (const r of manual) manualByDay[r.day] = r.count;
  return { year, today, years, series, todayIndex, source: DEMO_MODE ? "demo" : "crm", manualByDay };
}

export function useEnrollmentComparison() {
  const year = currentAcademicYear();
  return useQuery({
    queryKey: ["comparativo-matriculas", year],
    refetchInterval: 120_000,
    queryFn: async () => compute(await loadRows(year), year),
  });
}

/** Grava (ou corrige) a quantidade de matrículas de cada dia informado. */
export async function saveEnrollmentEntries(entries: DayRow[]) {
  if (DEMO_MODE) return demo.saveEnrollmentEntries(entries);
  const { error } = await (supabase as any).from("enrollment_history").upsert(entries, { onConflict: "day" });
  if (error) {
    if (/enrollment_history/.test(error.message || "") || error.code === "42P01" || error.code === "PGRST205") {
      throw new Error("O lançamento de matrículas ainda não está ativado no banco desta escola.");
    }
    throw error;
  }
}
