import type { ReactNode } from "react";

// Peças visuais do layout novo (Hoje, Conversas, Funil, Direção).

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-7 ${wide ? "max-w-[1800px]" : "max-w-[1440px]"}`}>{children}</div>;
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight text-[#1B2430]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-[#5B6675]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className = "", title, action }: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) {
  return (
    <section className={`min-w-0 rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,.06),0_1px_3px_rgba(16,24,40,.04)] ${className}`}>
      {(title || action) && (
        <div className="mb-2 flex items-center justify-between gap-3">
          {title && <h2 className="text-[15px] font-semibold text-[#1B2430]">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export type Tone = "urgente" | "atencao" | "ok" | "neutro" | "info";
const toneClass: Record<Tone, string> = {
  urgente: "bg-[#FEF3F2] text-[#B42318]",
  atencao: "bg-[#FFFAEB] text-[#93370D]",
  ok: "bg-[#ECFDF3] text-[#067647]",
  neutro: "bg-[#F2F4F7] text-[#344054]",
  info: "bg-[#EFF8FF] text-[#175CD3]",
};

export function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${toneClass[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-[#D0D5DD] px-4 py-6 text-center text-[13px] text-[#5B6675]">{children}</p>;
}

export const btn = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#D0D5DD] bg-white px-3 text-sm font-medium text-[#1B2430] hover:bg-[#F9FAFB] disabled:opacity-60";
export const btnPrimary = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#0F766E] bg-[#0F766E] px-3 text-sm font-medium text-white hover:bg-[#0B615B] disabled:opacity-60";

export function timeAgo(value: string | null | undefined, now = Date.now()) {
  if (!value) return "";
  const diff = Math.max(0, now - Date.parse(value));
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}
