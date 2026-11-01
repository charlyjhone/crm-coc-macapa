/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas escolares ainda não estão nos tipos gerados do Supabase. */
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Phone, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatSchoolDateTime, schoolDateTimeInput, schoolDateTimeToIso } from "@/lib/schoolDateTime";
import { OpportunityProgressDialog } from "@/components/school/OpportunityProgressDialog";
import { VisitStatusDialog } from "@/components/school/VisitStatusDialog";
import { btn, btnPrimary } from "@/components/crm/ui";
import { OptionButton, SourceChip, TemperatureChip } from "@/components/crm/FunnelBits";
import { ClassifyContactDialog } from "@/components/crm/ClassifyContactDialog";
import { DEMO_MODE, demo } from "@/lib/demo";
import { LeadReminders } from "@/components/crm/Reminders";
import { latestVisit, useActiveOpportunities, useLostOpportunities, type Opportunity } from "@/hooks/useOpportunities";
import { useFunnelActions } from "@/hooks/useFunnelActions";
import {
  FREE_SOURCES, FUNNEL_COLUMNS, GRADE_GROUPS, LOSS_REASONS, PAID_SOURCES, STAGE_LABEL,
  funnelKeyOf, isPaidSource, segmentOf, sourceCategory, sourceLabel, type FunnelKey,
} from "@/lib/funnel";

const DAY = 86_400_000;
type Health = { color: string; label: string };
function health(item: Opportunity, now = Date.now()): Health {
  const today = schoolDateTimeInput(new Date(now)).slice(0, 10);
  if (item.next_action_at) {
    const due = Date.parse(item.next_action_at);
    if (schoolDateTimeInput(item.next_action_at).slice(0, 10) === today) return { color: "#12B76A", label: "Retorno hoje" };
    if (due < now) {
      const days = Math.max(1, Math.floor((now - due) / DAY));
      return { color: "#D92D20", label: `Retornar · ${days} ${days === 1 ? "dia" : "dias"} de atraso` };
    }
    return { color: "#12B76A", label: "Em dia" };
  }
  if (["novo_interessado", "tentativa_contato"].includes(item.stage)) return { color: "#F79009", label: "Sem contato" };
  const idle = Math.floor((now - Date.parse(item.updated_at)) / DAY);
  return idle >= 3 ? { color: "#D92D20", label: `Parado há ${idle} dias` } : { color: "#12B76A", label: "Em dia" };
}

const familyName = (item: Opportunity) => item.guardians?.full_name || item.students?.full_name || "Família";
const sel = "min-h-10 rounded-[10px] border border-[#D3D7DE] bg-white px-3 text-sm text-[#151A23]";
const sectionTitle = "mb-2 text-[11.5px] font-bold uppercase tracking-[.06em] text-[#5A6474]";

type History = { id: string; previous_stage: string | null; new_stage: string; next_action: string | null; created_at: string };
function useHistory(opportunityId: string | null) {
  return useQuery<History[]>({
    queryKey: ["funil", "historico", opportunityId],
    enabled: !!opportunityId && !DEMO_MODE,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("enrollment_stage_history")
        .select("id,previous_stage,new_stage,next_action,created_at").eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: false }).limit(8);
      if (error) return [];
      return data || [];
    },
  });
}

function SourceEditor({ item, onDone }: { item: Opportunity; onDone: () => void }) {
  const actions = useFunnelActions();
  const [source, setSource] = useState(item.source_channel || "");
  const [campaign, setCampaign] = useState(item.source_campaign || "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!source) return;
    setSaving(true);
    try { await actions.setSource(item.id, source, isPaidSource(source) ? campaign : null); toast.success("Origem atualizada"); onDone(); }
    catch (error) { toast.error("Não foi possível salvar", { description: error instanceof Error ? error.message : undefined }); }
    finally { setSaving(false); }
  };
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-[#E6E8EC] p-3">
      <div className="flex flex-wrap gap-1.5">{[...PAID_SOURCES, ...FREE_SOURCES].map((o) => <OptionButton key={o.value} selected={source === o.value} onClick={() => setSource(o.value)}>{o.label}</OptionButton>)}</div>
      {isPaidSource(source) && <input className={sel} value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Campanha (ex.: Matrículas 2027 · EM)" aria-label="Campanha" />}
      <div className="flex justify-end gap-2"><button type="button" className={btn} onClick={onDone}>Cancelar</button><button type="button" className={btnPrimary} disabled={!source || saving} onClick={() => void save()}>Salvar origem</button></div>
    </div>
  );
}

function Decision({ item, column }: { item: Opportunity; column: FunnelKey }) {
  const actions = useFunnelActions();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [askReason, setAskReason] = useState(false);
  const [visitAt, setVisitAt] = useState("");
  useEffect(() => { setAskReason(false); setVisitAt(""); }, [item.id]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); }
    catch (error) { toast.error("Não foi possível atualizar", { description: error instanceof Error ? error.message : undefined }); }
    finally { setBusy(false); }
  };
  const visit = latestVisit(item);
  const lost = (
    <>
      <button type="button" disabled={busy} className={`${btn} w-full justify-start`} onClick={() => setAskReason((v) => !v)}><i className="h-2.5 w-2.5 rounded-full bg-[#A61B1B]" />Não ficou interessado</button>
      {askReason && (
        <div>
          <p className="mb-1.5 text-[13px] text-[#5A6474]">Qual o motivo?</p>
          <div className="flex flex-wrap gap-1.5">
            {LOSS_REASONS.map((reason) => (
              <button key={reason} type="button" disabled={busy} onClick={() => void run(() => actions.markLost(item.id, reason), "Marcado como sem interesse")}
                className="min-h-9 rounded-full border border-dashed border-[#B9BFC9] bg-white px-3 text-[13px] font-semibold text-[#3B4452] hover:bg-[#F9FAFB]">{reason}</button>
            ))}
          </div>
        </div>
      )}
    </>
  );

  const box = (title: string, children: React.ReactNode) => (
    <div className="flex flex-col gap-2 rounded-2xl bg-[var(--crm-accent-softer)] p-4"><b>{title}</b>{children}</div>
  );

  if (column === "visitou") return box("Como foi a visita?", <>
    <button type="button" disabled={busy} className={`${btn} w-full justify-start`} onClick={() => void run(() => actions.moveTo(item.id, "matricular"), "Família em “Quer matricular”")}><i className="h-2.5 w-2.5 rounded-full bg-[#1A7F45]" />Ficou interessado — quer matricular</button>
    <button type="button" disabled={busy} className={`${btn} w-full justify-start`} onClick={() => void run(() => actions.thinking(item.id), "Retorno marcado para daqui a 2 dias")}><i className="h-2.5 w-2.5 rounded-full bg-[#C98A00]" />Ainda pensando — agendar retorno</button>
    {lost}
  </>);

  if (column === "visita") return box("A visita aconteceu?", <>
    {visit && <p className="text-[13px] text-[#5A6474]">Marcada para {formatSchoolDateTime(visit.scheduled_at)}</p>}
    {visit && DEMO_MODE && (
      <div className="flex gap-2">
        <button type="button" className={btn} disabled={busy} onClick={() => void run(() => demo.setVisitStatus(visit.id, "realizada").then(actions.refresh), "Visita registrada")}>Visitou</button>
        <button type="button" className={btn} disabled={busy} onClick={() => void run(() => demo.setVisitStatus(visit.id, "faltou").then(actions.refresh), "Falta registrada")}>Faltou</button>
      </div>
    )}
    {visit && !DEMO_MODE && <VisitStatusDialog visit={{ ...visit, studentName: item.students?.full_name || familyName(item) }} onUpdated={() => { actions.refresh(); void qc.invalidateQueries({ queryKey: ["school-visits"] }); }} />}
    {lost}
  </>);

  if (column === "matricular") return box("Encaminhada à matrícula", <>
    <p className="text-[13px] text-[#5A6474]">A matrícula é confirmada no sistema da escola. Aqui a família fica até concluir.</p>
    {lost}
  </>);

  // novo / conversa
  return box("Próximo passo", <>
    {column === "novo" && <button type="button" disabled={busy} className={`${btn} w-full justify-start`} onClick={() => void run(() => actions.moveTo(item.id, "conversa"), "Família em “Em conversa”")}>Já conversei com a família</button>}
    <label className="text-[13px] font-semibold text-[#3B4452]" htmlFor="visit-at">Agendar visita</label>
    <div className="flex gap-2">
      <input id="visit-at" type="datetime-local" className={`${sel} min-w-0 flex-1`} value={visitAt} onChange={(e) => setVisitAt(e.target.value)} />
      <button type="button" className={btnPrimary} disabled={busy || !visitAt} onClick={() => {
        const iso = schoolDateTimeToIso(visitAt);
        if (!iso) { toast.error("Data inválida"); return; }
        void run(() => actions.scheduleVisit(item.id, iso), "Visita agendada");
      }}>Agendar</button>
    </div>
    {lost}
  </>);
}

function Ficha({ item, onClose }: { item: Opportunity; onClose: () => void }) {
  const [editSource, setEditSource] = useState(false);
  const history = useHistory(item.id);
  const actions = useFunnelActions();
  const column = funnelKeyOf(item.stage);
  const visit = latestVisit(item);
  useEffect(() => setEditSource(false), [item.id]);
  const kv = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1 text-sm"><span className="text-[#5A6474]">{label}</span><span className="min-w-0 text-right">{value || "—"}</span></div>
  );
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><h2 className="truncate text-lg font-bold">{familyName(item)}</h2><p className="text-[13px] text-[#5A6474]">{STAGE_LABEL[item.stage] || item.stage} · desde {new Date(item.created_at).toLocaleDateString("pt-BR")}</p></div>
        <div className="flex items-center gap-1.5">
          {item.stage !== "perdido" && <TemperatureChip score={item.probability_score} />}
          <button type="button" className="rounded-lg p-1.5 text-[#5A6474] hover:bg-[#F2F4F7] lg:hidden" onClick={onClose} aria-label="Fechar ficha"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="flex gap-2">
        {item.legacy_lead_id && <Link to={`/atendimentos?aba=todas&lead=${item.legacy_lead_id}`} className={`${btnPrimary} flex-1`}>Abrir conversa</Link>}
        {item.guardians?.phone && <a href={`tel:${item.guardians.phone.replace(/[^\d+]/g, "")}`} className={`${btn} flex-1`}><Phone className="h-4 w-4" aria-hidden="true" />Ligar</a>}
      </div>
      <div>
        <p className={sectionTitle}>Família</p>
        {kv("Responsável", item.guardians?.full_name)}
        {kv("Aluno", item.students?.full_name)}
        {kv("Série", `${item.desired_grade}${item.desired_shift ? ` · ${item.desired_shift}` : ""}`)}
        {kv("Origem", <span className="inline-flex items-center gap-2">{sourceLabel(item.source_channel) || "—"}<button type="button" className="text-[12px] font-semibold text-[var(--crm-accent)] underline" onClick={() => setEditSource((v) => !v)}>Corrigir</button></span>)}
        {item.source_campaign && kv("Campanha", item.source_campaign)}
        {editSource && <SourceEditor item={item} onDone={() => setEditSource(false)} />}
      </div>
      {item.stage === "perdido" ? (
        <div className="rounded-2xl bg-[#F6F7F9] p-4 text-sm">
          <b>Sem interesse</b><p className="text-[#5A6474]">Motivo: {item.loss_reason || "não informado"}</p>
          <button type="button" className={`${btn} mt-3`} onClick={() => void actions.moveTo(item.id, "conversa", { nextAction: "Retomar contato com a família" }).then(() => toast.success("Família voltou ao funil")).catch((e) => toast.error(e.message))}>Voltar ao funil</button>
        </div>
      ) : column && <Decision item={item} column={column} />}
      {item.stage !== "perdido" && (
        <div>
          <p className={sectionTitle}>Próximo passo</p>
          <p className="text-sm">{item.next_action || "Ainda não definido"}</p>
          {item.next_action_at && <p className="text-[13px] text-[#5A6474]">{formatSchoolDateTime(item.next_action_at)}</p>}
          {visit && column !== "visita" && <p className="mt-1 text-[13px] text-[#5A6474]">Visita: {formatSchoolDateTime(visit.scheduled_at)} · {visit.status === "realizada" ? "realizada" : visit.status}</p>}
        </div>
      )}
      {!!history.data?.length && (
        <div>
          <p className={sectionTitle}>Histórico</p>
          <ol className="ml-1.5 flex flex-col gap-3 border-l-2 border-[#E6E8EC] pl-4">
            {history.data.map((h) => (
              <li key={h.id} className="relative text-[13px]">
                <i className="absolute -left-[23px] top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--crm-accent)] bg-white" />
                <b>{STAGE_LABEL[h.new_stage] || h.new_stage}</b>
                <p className="text-[#5A6474]">{new Date(h.created_at).toLocaleDateString("pt-BR")}{h.next_action ? ` · ${h.next_action}` : ""}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
      {item.legacy_lead_id && <LeadReminders leadId={item.legacy_lead_id} leadName={familyName(item)} />}
      {!DEMO_MODE && item.stage !== "perdido" && <OpportunityProgressDialog opportunity={item} onUpdated={actions.refresh} />}
    </div>
  );
}

export default function Funil() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("");
  const [origin, setOrigin] = useState("");
  const [showLost, setShowLost] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const active = useActiveOpportunities();
  const lostQuery = useLostOpportunities();
  const focusColumn = params.get("coluna");

  const matches = (item: Opportunity) => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (term && ![item.guardians?.full_name, item.students?.full_name, item.guardians?.phone].some((v) => v?.toLocaleLowerCase("pt-BR").includes(term))) return false;
    if (segment && segmentOf(item.desired_grade) !== segment) return false;
    if (origin === "pagos" && !isPaidSource(item.source_channel)) return false;
    if (origin && origin !== "pagos" && sourceCategory(item.source_channel) !== origin) return false;
    return true;
  };

  const data = useMemo(() => (active.data || []).filter(matches), [active.data, search, segment, origin]); // eslint-disable-line react-hooks/exhaustive-deps
  const lost = useMemo(() => (lostQuery.data || []).filter(matches), [lostQuery.data, search, segment, origin]); // eslint-disable-line react-hooks/exhaustive-deps
  const grouped = useMemo(() => FUNNEL_COLUMNS.map((column) => ({ ...column, items: data.filter((item) => funnelKeyOf(item.stage) === column.key) })), [data]);
  const selected = [...(active.data || []), ...(lostQuery.data || [])].find((item) => item.id === params.get("ficha")) || null;
  const open = (id: string) => setParams((prev) => { const next = new URLSearchParams(prev); next.set("ficha", id); return next; });
  const close = () => setParams((prev) => { const next = new URLSearchParams(prev); next.delete("ficha"); return next; });

  const card = (item: Opportunity, columnKey: string) => {
    const h = health(item);
    const visit = columnKey === "visita" ? latestVisit(item) : null;
    return (
      <button key={item.id} type="button" onClick={() => open(item.id)}
        className={`flex flex-col gap-1.5 rounded-xl border bg-white px-3 py-2.5 text-left hover:shadow-md ${selected?.id === item.id ? "border-[var(--crm-accent)] ring-1 ring-[var(--crm-accent)]" : "border-[#E1E4E9]"}`}>
        <b className="truncate">{familyName(item)}</b>
        <span className="truncate text-[13px] text-[#5B6675]">
          {visit ? `${formatSchoolDateTime(visit.scheduled_at)} · ${item.desired_grade}` : `${item.students?.full_name?.split(" ")[0] || "Aluno"} · ${item.desired_grade}`}
        </span>
        <span className="flex flex-wrap gap-1"><SourceChip value={item.source_channel} />{columnKey !== "perdido" && <TemperatureChip score={item.probability_score} />}</span>
        {columnKey === "perdido"
          ? <span className="text-xs font-semibold text-[#5A6474]">Motivo: {item.loss_reason || "não informado"}</span>
          : <span className="text-xs font-semibold" style={{ color: h.color === "#12B76A" ? "#1A6A3A" : h.color === "#D92D20" ? "#A61B1B" : "#93370D" }}>{h.label}</span>}
      </button>
    );
  };

  return (
    <div className="flex min-h-[calc(100vh-104px)] flex-col md:min-h-screen lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4 px-4 pt-6 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold">Funil de matrícula</h1>
            <p className="text-[13px] text-[#5B6675]">{active.data?.length ?? 0} {active.data?.length === 1 ? "família" : "famílias"} em andamento</p>
          </div>
          <button type="button" className={btnPrimary} onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" aria-hidden="true" />Novo contato</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-10 flex-[1_1_220px] items-center gap-2 rounded-[10px] border border-[#D3D7DE] bg-white px-3">
            <Search className="h-4 w-4 text-[#5A6474]" aria-hidden="true" />
            <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Buscar responsável, aluno ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar" />
          </label>
          <select className={sel} value={segment} onChange={(e) => setSegment(e.target.value)} aria-label="Segmento">
            <option value="">Todos os segmentos</option>
            {GRADE_GROUPS.map((g) => <option key={g.label} value={g.label}>{g.label}</option>)}
          </select>
          <select className={sel} value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Origem">
            <option value="">Todas as origens</option>
            <option value="pagos">Só anúncios pagos</option>
            <option value="anuncio_instagram">Anúncio · Instagram</option>
            <option value="anuncio_facebook">Anúncio · Facebook</option>
            <option value="instagram">Instagram orgânico / redes</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="indicacao">Indicação</option>
            <option value="outros">Outras</option>
          </select>
          <button type="button" aria-pressed={showLost} className={`${btn} ${showLost ? "border-[var(--crm-accent)] text-[var(--crm-accent)]" : ""}`} onClick={() => setShowLost((v) => !v)}>
            {showLost ? "Voltar ao funil" : `Sem interesse (${lostQuery.data?.length ?? 0})`}
          </button>
        </div>
        {active.isLoading && <p className="text-sm text-[#5B6675]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</p>}
        {active.isError && <p className="text-sm text-[#B42318]">Não foi possível carregar o funil.</p>}

        {showLost ? (
          <section aria-label="Sem interesse" className="grid gap-2.5 pb-6 sm:grid-cols-2 xl:grid-cols-4">
            {lost.map((item) => card(item, "perdido"))}
            {!lost.length && !lostQuery.isLoading && <p className="text-sm text-[#5B6675]">Nenhuma família marcada como sem interesse.</p>}
          </section>
        ) : (
          <div className="flex flex-1 gap-3 overflow-x-auto pb-6">
            {grouped.map((column) => (
              <section key={column.key} aria-label={column.label}
                className={`flex min-w-[200px] flex-1 flex-col gap-2 rounded-[14px] bg-[#ECEEF2] p-2.5 ${focusColumn === column.key ? "ring-2 ring-[var(--crm-accent)]" : ""}`}>
                <div className="flex items-center justify-between px-1.5 pb-1 pt-1 text-[13px] font-bold"><span>{column.label}</span><span className="rounded-full bg-white px-2 text-xs font-semibold text-[#4A5463]">{column.items.length}</span></div>
                {column.items.map((item) => card(item, column.key))}
                {!column.items.length && !active.isLoading && <p className="px-1 py-3 text-center text-xs text-[#5B6675]">Nenhuma família nesta etapa</p>}
              </section>
            ))}
          </div>
        )}
      </div>

      <aside className="w-full shrink-0 border-t border-[#E6E8EC] bg-white p-5 lg:w-[360px] lg:overflow-y-auto lg:border-l lg:border-t-0" aria-label="Ficha da família">
        {selected ? <Ficha item={selected} onClose={close} /> : <p className="text-sm text-[#5B6675]">Clique em uma família para ver a ficha e registrar como foi a visita.</p>}
      </aside>

      <ClassifyContactDialog lead={null} open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
