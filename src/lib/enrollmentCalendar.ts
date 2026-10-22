import { schoolDateTimeInput } from "@/lib/schoolDateTime";

// Calendário da campanha de matrículas.
// A campanha do ano letivo N vai de 1º de agosto de N-1 até 31 de março de N.
export const CAMPAIGN_START_MONTH = 8; // agosto

export const todayKey = (now = new Date()) => schoolDateTimeInput(now).slice(0, 10);

export function currentAcademicYear(now = new Date()) {
  const [year, month] = todayKey(now).split("-").map(Number);
  return month >= CAMPAIGN_START_MONTH ? year + 1 : year;
}

/** Ano letivo ao qual uma data de matrícula pertence (agosto em diante conta para o ano seguinte). */
export function academicYearOf(day: string) {
  const [year, month] = day.split("-").map(Number);
  return month >= CAMPAIGN_START_MONTH ? year + 1 : year;
}

export const campaignStart = (academicYear: number) => `${academicYear - 1}-${String(CAMPAIGN_START_MONTH).padStart(2, "0")}-01`;
export const campaignEnd = (academicYear: number) => `${academicYear}-03-31`;

export function campaignDays(academicYear: number) {
  const days: string[] = [];
  const end = Date.parse(`${campaignEnd(academicYear)}T12:00:00Z`);
  for (let t = Date.parse(`${campaignStart(academicYear)}T12:00:00Z`); t <= end; t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

/** A mesma data (dia e mês) alguns anos antes; 29/02 vira 28/02. */
export function sameDateYearsBack(day: string, yearsBack: number) {
  const [y, m, d] = day.split("-").map(Number);
  const year = y - yearsBack;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const dd = m === 2 && d === 29 && !leap ? 28 : d;
  return `${year}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export const formatDay = (day: string) => day.split("-").reverse().join("/");
