import { Megaphone } from "lucide-react";
import { isPaidSource, sourceLabel, temperatureOf } from "@/lib/funnel";
import { adChipClass } from "@/hooks/useAdReferrals";

const chip = "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold";

/** Origem do contato; anúncios pagos ganham destaque próprio. */
export function SourceChip({ value }: { value: string | null | undefined }) {
  const label = sourceLabel(value);
  if (!label) return null;
  return isPaidSource(value)
    ? <span className={`${chip} ${adChipClass(value)}`}><Megaphone className="h-3 w-3" aria-hidden="true" />{label}</span>
    : <span className={`${chip} bg-[#F1F3F6] text-[#3B4452]`}>{label}</span>;
}

/** Quente / morno / frio, pela pontuação calculada no banco. */
export function TemperatureChip({ score }: { score: number | null | undefined }) {
  const t = temperatureOf(score);
  return <span className={`${chip} ${t.className}`} title="Pela pontuação de chance de matrícula">{t.label}</span>;
}

export function OptionButton({ selected, onClick, children, hint, disabled }: { selected: boolean; onClick: () => void; children: React.ReactNode; hint?: string; disabled?: boolean }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} disabled={disabled}
      className={`min-h-10 rounded-[10px] border px-3 py-2 text-left text-sm font-semibold transition-colors disabled:opacity-50 ${
        selected ? "border-[var(--crm-accent)] bg-[var(--crm-accent-soft)] text-[var(--crm-accent)] ring-1 ring-[var(--crm-accent)]" : "border-[#D3D7DE] bg-white text-[#2A3240] hover:bg-[#F9FAFB]"
      }`}>
      {children}
      {hint && <small className="block text-xs font-medium text-[#5A6474]">{hint}</small>}
    </button>
  );
}
