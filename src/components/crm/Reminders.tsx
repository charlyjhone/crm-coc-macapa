import { useState } from "react";
import { Link } from "react-router-dom";
import { BellPlus, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { reminderKindLabel, reminderKinds, useDueReminders, useReminderActions, useReminders, type Reminder, type ReminderKind } from "@/hooks/useReminders";
import { formatDay, todayKey } from "@/lib/enrollmentCalendar";
import { DEMO_MODE } from "@/lib/demo";
import { Empty, Panel, Tag, btn, btnPrimary } from "@/components/crm/ui";

const DAY = 86_400_000;
const addDays = (n: number) => todayKey(new Date(Date.now() + n * DAY));
function nextFirstOfMonth() {
  const [y, m] = todayKey().split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}
function nextMonday() {
  const weekday = new Date(`${todayKey()}T12:00:00Z`).getUTCDay();
  return addDays(((8 - weekday) % 7) || 7);
}

function whenLabel(day: string) {
  const today = todayKey();
  if (day === today) return { text: "Hoje", tone: "atencao" as const };
  if (day < today) {
    const late = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / DAY);
    return { text: late === 1 ? "Atrasado 1 dia" : `Atrasado ${late} dias`, tone: "urgente" as const };
  }
  if (day === addDays(1)) return { text: "Amanhã", tone: "neutro" as const };
  return { text: formatDay(day), tone: "neutro" as const };
}

/** Botão + janela para criar um lembrete para a família. */
export function ReminderDialog({ leadId, leadName, compact }: { leadId: string; leadName: string; compact?: boolean }) {
  const { create } = useReminderActions();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(addDays(1));
  const [kind, setKind] = useState<ReminderKind>("enviar_valores");
  const [note, setNote] = useState("");
  const quick = [
    { label: "Amanhã", value: addDays(1) },
    { label: "Próxima segunda", value: nextMonday() },
    { label: `Dia 1º (${formatDay(nextFirstOfMonth()).slice(0, 5)})`, value: nextFirstOfMonth() },
  ];
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= todayKey();

  const save = async () => {
    try {
      await create.mutateAsync({ lead_id: leadId, remind_on: day, kind, note: note.trim() || null });
      toast.success(`Lembrete criado para ${formatDay(day)}${DEMO_MODE ? " (demonstração)" : ""}`);
      setOpen(false); setNote("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o lembrete.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!create.isPending) { setOpen(next); if (next) { setDay(addDays(1)); setKind("enviar_valores"); } } }}>
      <DialogTrigger asChild>
        <button type="button" className={compact ? `${btn} w-full` : btn}><BellPlus className="h-4 w-4" aria-hidden="true" />Criar lembrete</button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lembrete para {leadName}</DialogTitle>
          <DialogDescription>No dia escolhido, o lembrete aparece na tela Hoje e com aviso na barra lateral.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">O que fazer</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de lembrete">
            {reminderKinds.map((k) => (
              <button key={k.key} type="button" role="radio" aria-checked={kind === k.key} onClick={() => setKind(k.key)}
                className={`min-h-9 rounded-full border px-3 text-sm ${kind === k.key ? "border-[var(--crm-accent)] bg-[var(--crm-accent-soft)] font-medium text-[var(--crm-accent)]" : "border-[#D0D5DD] text-[#344054] hover:bg-[#F9FAFB]"}`}>
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="lembrete-dia" className="text-sm font-medium">Quando</label>
          <div className="flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <button key={q.label} type="button" onClick={() => setDay(q.value)}
                className={`min-h-8 rounded-lg border px-2.5 text-xs ${day === q.value ? "border-[var(--crm-accent)] text-[var(--crm-accent)]" : "border-[#D0D5DD] text-[#5B6675]"}`}>{q.label}</button>
            ))}
          </div>
          <input id="lembrete-dia" type="date" min={todayKey()} value={day} onChange={(e) => setDay(e.target.value)}
            className="min-h-10 rounded-lg border border-[#D0D5DD] px-3 text-sm" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="lembrete-obs" className="text-sm font-medium">Observação <span className="font-normal text-[#5B6675]">(opcional)</span></label>
          <textarea id="lembrete-obs" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Ex.: mandar os valores do Maternal assim que forem liberados" className="rounded-lg border border-[#D0D5DD] px-3 py-2 text-sm" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btn} onClick={() => setOpen(false)} disabled={create.isPending}>Cancelar</button>
          <button type="button" className={btnPrimary} onClick={() => void save()} disabled={!valid || create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Salvar lembrete
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DoneButton({ reminder }: { reminder: Reminder }) {
  const { complete } = useReminderActions();
  return (
    <button type="button" className={btn} disabled={complete.isPending} aria-label={`Marcar lembrete de ${reminder.leads?.name || "família"} como feito`}
      onClick={() => complete.mutate(reminder.id, {
        onSuccess: () => toast.success("Lembrete concluído"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível concluir."),
      })}>
      <Check className="h-4 w-4" aria-hidden="true" />Feito
    </button>
  );
}

/** Seção de lembretes na ficha da família. */
export function LeadReminders({ leadId, leadName }: { leadId: string; leadName: string }) {
  const { data } = useReminders(leadId);
  const items = data?.items || [];
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-[.04em] text-[#5B6675]">Lembretes</p>
      {items.length > 0 && (
        <ul className="mb-2 flex flex-col gap-2">
          {items.map((r) => {
            const when = whenLabel(r.remind_on);
            return (
              <li key={r.id} className="rounded-lg border border-[#E4E7EC] p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2"><b>{reminderKindLabel(r.kind)}</b><Tag tone={when.tone}>{when.text}</Tag></div>
                {r.note && <p className="mt-1 text-[13px] text-[#5B6675]">{r.note}</p>}
                {r.remind_on <= todayKey() && <div className="mt-2"><DoneButton reminder={r} /></div>}
              </li>
            );
          })}
        </ul>
      )}
      {data?.unavailable ? (
        <p className="text-[13px] text-[#5B6675]">Lembretes ainda não ativados no banco desta escola.</p>
      ) : (
        <ReminderDialog leadId={leadId} leadName={leadName} compact />
      )}
    </div>
  );
}

/** Painel da tela Hoje: lembretes do dia e atrasados. */
export function RemindersTodayPanel() {
  const { due, data, isLoading } = useDueReminders();
  if (data?.unavailable) return null;
  const upcoming = (data?.items || []).filter((r) => r.remind_on > todayKey()).length;
  return (
    <Panel title="Lembretes de hoje" action={upcoming ? <span className="text-[13px] text-[#5B6675]">{upcoming} programado{upcoming === 1 ? "" : "s"}</span> : undefined}>
      {isLoading && <p className="py-2 text-sm text-[#5B6675]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</p>}
      {!isLoading && !due.length && <Empty>Nenhum lembrete para hoje.</Empty>}
      <ul className="divide-y divide-[#EEF0F3]">
        {due.map((r) => {
          const when = whenLabel(r.remind_on);
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
              <Tag tone={when.tone}>{when.text}</Tag>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.leads?.name || "Família"} · {reminderKindLabel(r.kind)}</p>
                {r.note && <p className="truncate text-[13px] text-[#5B6675]">{r.note}</p>}
              </div>
              <Link to={`/atendimentos?aba=todas&lead=${r.lead_id}`} className={btnPrimary}>Abrir conversa</Link>
              <DoneButton reminder={r} />
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
