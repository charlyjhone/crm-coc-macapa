// Use sempre o fuso da escola, mesmo quando o navegador estiver em outro local.
export const SCHOOL_TIME_ZONE = import.meta.env?.VITE_SCHOOL_TIME_ZONE || "America/Belem";

export function schoolDateTimeInput(value: string | Date, timeZone = SCHOOL_TIME_ZONE): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function schoolDateTimeToIso(value: string, timeZone = SCHOOL_TIME_ZONE): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const wallTime = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wallTime)) return null;
  let instant = wallTime;
  for (let attempt = 0; attempt < 3; attempt++) {
    const displayed = Date.parse(`${schoolDateTimeInput(new Date(instant), timeZone)}:00Z`);
    instant += wallTime - displayed;
  }
  const date = new Date(instant);
  return schoolDateTimeInput(date, timeZone) === value ? date.toISOString() : null;
}

export function formatSchoolDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: SCHOOL_TIME_ZONE, dateStyle: "short", timeStyle: "short",
  });
}
