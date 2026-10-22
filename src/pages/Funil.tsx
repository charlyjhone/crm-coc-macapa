/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas escolares ainda não estão nos tipos gerados do Supabase. */
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatSchoolDateTime, schoolDateTimeInput } from "@/lib/schoolDateTime";
import { OpportunityProgressDialog } from "@/components/school/OpportunityProgressDialog";
import { Tag, btn, btnPrimary } from "@/components/crm/ui";
import { DEMO_MODE, demo } from "@/lib/demo";

type Opportunity = {
  id: string; stage: string; legacy_lead_id: string | null; desired_grade: string; desired_shift: string | null;
  source_channel: string | null; next_action: string | null; next_action_at: string | null; created_at: string; updated_at: string;
  students: { full_name: string } | null;
  guardians: { full_name: string; phone: string | null } | null;
  school_visits: { scheduled_at: string; status: string }[] | null;
};

// As etapas detalhadas continuam no banco; o quadro agrupa em quatro colunas simples.
const columns = [
  { key: "novo", label: "Novo interessado", stages: ["novo_interessado", "tentativa_contato", "contato_realizado", "qualificado"] },
  { key: "visita", label: "Visita agendada", stages: ["visita_agendada"] },
  { key: "visitou", label: "Visitou", stages: ["visita_realizada", "condicoes_apresentadas"] },
  { key: "matricular", label: "Quer matricular", stages: ["documentacao_pendente", "matricula_em_conclusao"] },
] as const;

const stageLabel: Record<string, string> = {
  novo_interessado: "Novo interessado", tentativa_contato: "Tentativa de contato", contato_realizado: "Contato realizado",
  qualificado: "Qualificado", visita_agendada: "Visita agendada", visita_realizada: "Visita realizada",
  condicoes_apresentadas: "Condições apresentadas", documentacao_pendente: "Documentação pendente", matricula_em_conclusao: "Matrícula em conclusão",
};
const sourceLabel: Record<string, string> = {
  cadastro_manual: "Cadastro manual", whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook", google: "Google",
  indicacao: "Indicação", evento: "Evento", site: "Site", telefone: "Telefone", ja_conhecia: "Já conhecia a escola",
  redes_sociais: "Redes sociais", panfletagem_outdoor: "Panfletagem/outdoor", outro: "Outro", outros: "Outros",
};

const DAY = 86_400_000;
type Health = { color: string; label: string };
function health(item: Opportunity, now = Date.now()): Health {
  const today = schoolDateTimeInput(new Date(now)).slice(0, 10);
  if (item.next_action_at) {
    const due = Date.parse(item.next_action_at);
    if (schoolDateTimeInput(item.next_action_at).slice(0, 10) === today) return { color: "#12B76A", label: "Retorno hoje" };
    if (due < now) {
      const days = Math.max(1, Math.floor((now - due) / DAY));
      return { color: "#D92D20", label: `Atrasado ${days} ${days === 1 ? "dia" : "dias"}` };
    }
    return { color: "#12B76A", label: "Em dia" };
  }
  if (["novo_interessado", "tentativa_contato"].includes(item.stage)) return { color: "#F79009", label: "Sem contato" };
  const idle = Math.floor((now - Date.parse(item.updated_at)) / DAY);
  return idle >= 3 ? { color: "#D92D20", label: `Parado há ${idle} dias` } : { color: "#12B76A", label: "Em dia" };
}

const nextVisit = (item: Opportunity) => (item.school_visits || [])
  .filter((v) => v.status !== "cancelada").sort((a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at))[0] || null;

export default function Funil() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data = [], isLoading, isError } = useQuery<Opportunity[]>({
    queryKey: ["funil"],
    refetchInterval: 60_000,
    queryFn: async () => {
      if (DEMO_MODE) return (await demo.opportunities()).filter((o) => !["matriculado", "perdido", "nutricao"].includes(o.stage));
      const { data, error } = await (supabase as any).from("enrollment_opportunities")
        .select("id,stage,legacy_lead_id,desired_grade,desired_shift,source_channel,next_action,next_action_at,created_at,updated_at,students(full_name),guardians:primary_guardian_id(full_name,phone),school_visits(scheduled_at,status)")
        .not("stage", "in", '("matriculado","perdido","nutricao")')
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const grouped = useMemo(() => columns.map((column) => ({
    ...column,
    items: data.filter((item) => (column.stages as readonly string[]).includes(item.stage)),
  })), [data]);
  const selected = data.find((item) => item.id === params.get("ficha")) || null;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["funil"] }); void qc.invalidateQueries({ queryKey: ["hoje-sem-retorno"] }); };

  return (
    <div className="flex min-h-[calc(100vh-104px)] flex-col lg:flex-row md:min-h-screen">
      <div className="flex min-w-0 flex-1 flex-col gap-4 px-4 pt-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold">Funil</h1>
            <p className="text-[13px] text-[#5B6675]">{data.length} {data.length === 1 ? "família" : "famílias"} em acompanhamento</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[13px] text-[#5B6675]">
            <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#12B76A]" />Retorno em dia</span>
            <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#D92D20]" />Atrasado</span>
            <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#F79009]" />Sem contato</span>
          </div>
        </div>
        {isLoading && <p className="text-sm text-[#5B6675]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</p>}
        {isError && <p className="text-sm text-[#B42318]">Não foi possível carregar o funil.</p>}
        <div className="flex flex-1 gap-3 overflow-x-auto pb-6">
          {grouped.map((column) => (
            <section key={column.key} aria-label={column.label} className="flex min-w-[220px] flex-1 flex-col gap-2 rounded-xl bg-[#EEF0F3] p-2.5">
              <div className="flex justify-between px-1 pb-1 pt-0.5 font-semibold"><span>{column.label}</span><span className="text-[13px] font-normal text-[#5B6675]">{column.items.length}</span></div>
              {column.items.map((item) => {
                const h = health(item);
                const isSel = selected?.id === item.id;
                const visit = column.key === "visita" ? nextVisit(item) : null;
                return (
                  <button key={item.id} type="button" onClick={() => setParams({ ficha: item.id })}
                    className={`flex flex-col gap-0.5 rounded-xl bg-white px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(16,24,40,.08)] hover:shadow-md ${isSel ? "ring-1 ring-[var(--crm-accent)]" : ""}`}>
                    <b className="truncate">{item.guardians?.full_name || item.students?.full_name || "Família"}</b>
                    <span className="truncate text-[13px] text-[#5B6675]">
                      {visit ? `${formatSchoolDateTime(visit.scheduled_at)} · ${item.desired_grade}` : `${item.students?.full_name?.split(" ")[0] || "Aluno"} · ${item.desired_grade}`}
                    </span>
                    <span className="text-[13px] text-[#5B6675]"><i className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: h.color }} />{h.label}</span>
                  </button>
                );
              })}
              {!column.items.length && !isLoading && <p className="px-1 py-3 text-center text-xs text-[#5B6675]">Nenhuma família nesta etapa</p>}
            </section>
          ))}
        </div>
      </div>

      <aside className="w-full shrink-0 border-t border-[#E4E7EC] bg-white p-[18px] lg:w-[290px] lg:border-l lg:border-t-0">
        {selected ? (
          <div className="flex h-full flex-col gap-4">
            <div><b className="text-base">{selected.guardians?.full_name || "Família"}</b><p className="text-[13px] text-[#5B6675]">{stageLabel[selected.stage] || selected.stage}</p></div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[.04em] text-[#5B6675]">Família</p>
              {[["Aluno", selected.students?.full_name], ["Série", `${selected.desired_grade}${selected.desired_shift ? `, ${selected.desired_shift}` : ""}`], ["Telefone", selected.guardians?.phone], ["Como conheceu", selected.source_channel ? sourceLabel[selected.source_channel] || selected.source_channel : null]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-1 text-sm"><span className="text-[#5B6675]">{k}</span><span className="text-right">{v || "—"}</span></div>
              ))}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[.04em] text-[#5B6675]">Visita</p>
              {nextVisit(selected) ? (
                <div className="flex items-center justify-between gap-3 text-sm"><span>{formatSchoolDateTime(nextVisit(selected)!.scheduled_at)}</span><Tag tone="ok">{nextVisit(selected)!.status === "realizada" ? "Realizada" : "Agendada"}</Tag></div>
              ) : <p className="text-sm text-[#5B6675]">Nenhuma visita marcada.</p>}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[.04em] text-[#5B6675]">Próximo passo</p>
              <p className="text-sm">{selected.next_action || "Ainda não definido"}</p>
              {selected.next_action_at && <p className="text-[13px] text-[#5B6675]">{formatSchoolDateTime(selected.next_action_at)}</p>}
            </div>
            <div className="mt-auto flex flex-col gap-2 pb-2">
              {selected.legacy_lead_id && <Link to={`/atendimentos?aba=todas&lead=${selected.legacy_lead_id}`} className={btnPrimary}>Abrir conversa</Link>}
              {DEMO_MODE ? (
                <>
                  <label className="text-xs font-medium text-[#5B6675]" htmlFor="demo-stage">Mover para</label>
                  <select id="demo-stage" className="min-h-9 rounded-lg border border-[#D0D5DD] bg-white px-2 text-sm" value={selected.stage}
                    onChange={(event) => void demo.moveOpportunity(selected.id, event.target.value).then(refresh)}>
                    {Object.entries(stageLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    <option value="matriculado">Matriculado</option>
                  </select>
                  <button type="button" className={btn} onClick={() => void demo.moveOpportunity(selected.id, "perdido").then(() => { setParams({}); refresh(); })}>Sem interesse</button>
                </>
              ) : (
                <>
                  <OpportunityProgressDialog opportunity={selected} onUpdated={refresh} />
                  <p className="text-xs text-[#5B6675]">Para marcar “sem interesse”, escolha a etapa Perdido ao atualizar.</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#5B6675]">Clique em uma família para ver a ficha.</p>
        )}
      </aside>
    </div>
  );
}
