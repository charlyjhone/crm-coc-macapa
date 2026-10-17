import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAtendimentos, useEnviarWhatsApp, useMensagensAtendimento, useUpdateTriage, useUpdateLeadStatus, type Atendimento, type LeadStatus } from "@/hooks/useAtendimentos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { useSchoolIdentity } from "@/hooks/useSchoolIdentity";
import { attendancePriority } from "@/lib/attendancePriority";

type Filter = "urgentes" | "atencao" | "novos" | "aguardando_secretaria" | "matricula" | "respondido_agente" | "resolvido" | "todos";
const filters: { key: Filter; label: string }[] = [
  { key: "urgentes", label: "Urgentes" },
  { key: "atencao", label: "Atenção" },
  { key: "novos", label: "Novos" },
  { key: "aguardando_secretaria", label: "Aguardando secretaria" },
  { key: "matricula", label: "Matrículas" },
  { key: "respondido_agente", label: "Respondidos pelo agente" },
  { key: "resolvido", label: "Resolvidos" },
  { key: "todos", label: "Todos" },
];
const stages: { key: LeadStatus; label: string }[] = [
  { key: "novo", label: "Novo" },
  { key: "em_atendimento", label: "Em atendimento" },
  { key: "em_negociacao", label: "Em negociação" },
  { key: "nao_convertido", label: "Não convertido" },
  { key: "resolvido", label: "Resolvido" },
];

function isNewContact(lead: Atendimento, now = Date.now()) {
  const created = Date.parse(lead.created_at);
  return lead.status === "novo" && Number.isFinite(created) && now - created < 48 * 3_600_000;
}

function subjectLabel(value: string | null) {
  if (!value) return "Não classificado";
  const names: Record<string, string> = { matricula: "Matrícula", documento_declaracao: "Documento / declaração", financeiro: "Financeiro" };
  return names[value] || value.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

const mediaLabels: Record<string, string> = {
  audio: "Áudio",
  image: "Foto / imagem",
  video: "Vídeo",
  document: "Documento",
  sticker: "Figurinha",
  location: "Localização",
  contact: "Contato compartilhado",
  file: "Arquivo",
};

function formatMediaDuration(seconds: number | null) {
  if (seconds === null) return null;
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function Conversation({ lead }: { lead: Atendimento }) {
  const priority = attendancePriority(lead);
  const { data: messages, isLoading, isError } = useMensagensAtendimento(lead);
  const send = useEnviarWhatsApp();
  const update = useUpdateTriage();
  const updateStatus = useUpdateLeadStatus();
  const [draft, setDraft] = useState("");

  const sendMessage = async () => {
    const message = draft.trim();
    if (!lead.phone || !message || send.isPending) return;
    try {
      await send.mutateAsync({ lead, message });
      setDraft("");
      toast.success("Mensagem enviada pelo WhatsApp");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao enviar a mensagem.");
    }
  };

  const finish = async () => {
    try {
      const result = await update.mutateAsync({ id: lead.id, status: "resolvido" });
      if (["send_failed", "lookup_failed", "claim_failed"].includes(result?.survey || "")) toast.error("Atendimento concluído, mas a pesquisa falhou. Use Verificar pesquisa para tentar novamente.");
      else toast.success(result?.survey === "sent" ? "Atendimento concluído; pesquisa enviada" : "Atendimento concluído; pesquisa não aplicável ou já enviada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir o atendimento.");
    }
  };

  const changeStatus = async (status: LeadStatus) => {
    if (status === lead.status) return;
    try {
      const result = await updateStatus.mutateAsync({ lead, status });
      if (status === "resolvido" && ["send_failed", "lookup_failed", "claim_failed"].includes(result?.survey || "")) toast.error("Andamento atualizado, mas a pesquisa falhou. Use Verificar pesquisa para tentar novamente.");
      else toast.success(status === "resolvido" && result?.survey === "sent" ? "Andamento atualizado; pesquisa enviada" : "Andamento atualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o andamento.");
    }
  };

  return (
    <section className="flex min-h-[500px] min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="font-semibold">{lead.name}</h2>
          <p className="text-xs text-slate-600">{lead.phone || lead.email || "Sem telefone ou e-mail"}</p>
          {priority.level >= 3 && (
            <p className="mt-1 text-sm font-semibold text-red-700">URGENTE · {priority.reason}</p>
          )}
          {priority.level === 2 && (
            <p className="mt-1 text-sm font-medium text-amber-700">ATENÇÃO · {priority.reason}</p>
          )}
          {priority.level === 1 && (
            <p className="mt-1 text-xs text-amber-700">Aguardando equipe · {priority.reason}</p>
          )}
          {lead.handoff_reason && lead.triage_status === "aguardando_secretaria" && (
            <p className="mt-1 text-xs text-red-700">Repasse: {lead.handoff_reason}</p>
          )}
        </div>
        <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => void finish()}>
          {lead.triage_status === "resolvido" ? "Verificar pesquisa" : "Concluir atendimento"}
        </Button>
      </header>
      <div className="flex flex-wrap items-center gap-3 border-b bg-white px-4 py-3">
        <label htmlFor="lead-status" className="text-sm font-medium">Andamento do contato</label>
        <select id="lead-status" aria-label="Andamento do contato" className="h-9 rounded-md border bg-background px-3 text-sm" value={lead.status || "novo"}
          onChange={(event) => void changeStatus(event.target.value as LeadStatus)} disabled={updateStatus.isPending}>
          {lead.status === "matriculado" && <option value="matriculado" disabled>Matrícula confirmada no funil</option>}
          {stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
        </select>
        <span className="text-xs text-slate-600">Assunto: {subjectLabel(lead.assunto)}</span>
        <Link to="/matriculas" className="text-xs font-medium text-primary underline">Confirmar matrícula no funil do aluno</Link>
      </div>
      <div className="flex max-h-[60vh] min-h-64 flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 p-4">
        {isLoading && <p className="text-sm text-slate-600">Carregando histórico...</p>}
        {isError && <p className="text-sm text-red-700">Não foi possível carregar o histórico.</p>}
        {!isLoading && !isError && !messages?.length && <p className="text-sm text-slate-600">Nenhuma mensagem encontrada.</p>}
        {messages?.map((m) => {
          const outgoing = m.direction === "outbound";
          const text = m.message.trim();
          const audioPlaceholder = /^\[(?:mensagem de áudio|áudio não transcrito)/i.test(text);
          const duration = formatMediaDuration(m.mediaDurationSeconds);
          return (
            <div key={`${m.channel}-${m.id}`} className={`max-w-[85%] rounded-xl border px-3 py-2 text-sm ${outgoing ? "self-end bg-emerald-100" : "self-start bg-white"}`}>
              {m.mediaType && (
                <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-slate-300/70 bg-white/70 px-2 py-1.5 text-xs font-semibold text-slate-700">
                  <span aria-hidden="true">{m.mediaType === "audio" ? "🎙️" : m.mediaType === "image" ? "🖼️" : m.mediaType === "video" ? "🎬" : m.mediaType === "document" || m.mediaType === "file" ? "📎" : m.mediaType === "location" ? "📍" : "📄"}</span>
                  <span>{outgoing ? "Enviado" : "Recebido"} · {mediaLabels[m.mediaType] || "Mídia"}</span>
                  {duration && m.mediaType === "audio" && <span className="font-normal">({duration})</span>}
                </div>
              )}
              {m.mediaName && <p className="mb-1 break-words text-xs text-slate-700">Arquivo: {m.mediaName}</p>}
              {m.mediaCaption && m.mediaCaption !== text && <p className="mb-1 whitespace-pre-wrap break-words text-xs text-slate-600">Legenda: {m.mediaCaption}</p>}
              {text && !audioPlaceholder && (
                <p className="whitespace-pre-wrap break-words">{m.isAudio ? `Transcrição: ${text}` : text}</p>
              )}
              {audioPlaceholder && m.isAudio && (
                <p className="whitespace-pre-wrap break-words text-slate-600">Áudio recebido; o conteúdo não ficou disponível em texto.</p>
              )}
              {!text && !m.mediaType && <p className="whitespace-pre-wrap break-words">(mensagem sem texto)</p>}
              {m.mediaType && m.mediaUrl && (
                <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-blue-700 underline">
                  Abrir anexo
                </a>
              )}
              <p className="mt-1 text-[11px] text-slate-500">
                {m.channel === "whatsapp" ? "WhatsApp" : "E-mail"} · {outgoing ? "Enviada pela escola" : "Recebida"} · {new Date(m.at).toLocaleString("pt-BR")}
              </p>
            </div>
          );
        })}
      </div>
      <div className="border-t p-4">
        {lead.phone ? (
          <div className="flex gap-2">
            <Input aria-label="Mensagem de WhatsApp" placeholder="Escreva uma resposta para a família" value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void sendMessage(); } }}
              disabled={send.isPending} />
            <Button onClick={() => void sendMessage()} disabled={!draft.trim() || send.isPending}>
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="ml-2">Enviar</span>
            </Button>
          </div>
        ) : <p className="text-sm text-slate-600">Sem WhatsApp cadastrado. O envio por e-mail será integrado depois.</p>}
      </div>
    </section>
  );
}

export default function Atendimentos() {
  const { agentName } = useSchoolIdentity();
  const { data, isLoading, isError } = useAtendimentos();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFilter = searchParams.get("status");
  const requestedStage = searchParams.get("etapa");
  const stageFilter = stages.some((item) => item.key === requestedStage) ? requestedStage as LeadStatus : null;
  const isValidRequestedFilter = filters.some((item) => item.key === requestedFilter);
  const filter: Filter = isValidRequestedFilter ? requestedFilter as Filter : "aguardando_secretaria";
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("lead"));
  const counts = useMemo(() => ({
    urgentes: (data || []).filter((a) => attendancePriority(a).level >= 3).length,
    atencao: (data || []).filter((a) => attendancePriority(a).level === 2).length,
    novos: (data || []).filter(isNewContact).length,
    aguardando_secretaria: (data || []).filter((a) => a.triage_status === "aguardando_secretaria").length,
    matricula: (data || []).filter((a) => a.assunto === "matricula").length,
    respondido_agente: (data || []).filter((a) => a.triage_status === "respondido_agente").length,
    resolvido: (data || []).filter((a) => a.triage_status === "resolvido").length,
    todos: data?.length || 0,
  }), [data]);
  const list = (data || []).filter((lead) => {
    const matchesFilter = (stageFilter ? lead.status === stageFilter : filter === "todos" || (filter === "urgentes" ? attendancePriority(lead).level >= 3 : filter === "atencao" ? attendancePriority(lead).level === 2 : filter === "novos" ? isNewContact(lead) : filter === "matricula" ? lead.assunto === "matricula" : lead.triage_status === filter));
    const term = search.toLocaleLowerCase("pt-BR");
    return matchesFilter && (!term || [lead.name, lead.phone, lead.email].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)));
  }).sort((a, b) => attendancePriority(b).level - attendancePriority(a).level ||
    (Date.parse(a.last_inbound_message_at || "") || 0) - (Date.parse(b.last_inbound_message_at || "") || 0));
  const requestedLeadId = searchParams.get("lead");
  const selected = list.find((lead) => lead.id === selectedId)
    || (requestedLeadId ? (data || []).find((lead) => lead.id === requestedLeadId) ?? null : null)
    || (isValidRequestedFilter || stageFilter ? list[0] ?? null : null);

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-6 md:px-7">
      <h1 className="text-2xl font-bold">Atendimentos da escola</h1>
      <p className="mt-1 text-sm text-slate-600">Acompanhe os repasses de {agentName} e responda às famílias pelo WhatsApp. O vermelho indica uma demanda escolar urgente; o amarelo, atenção por espera; o azul, contato novo.</p>
      {stageFilter && <p className="mt-2 text-sm text-slate-600">Andamento: {stages.find((item) => item.key === stageFilter)?.label}. <button className="font-medium text-primary underline" onClick={() => setSearchParams({ status: "todos" })}>Mostrar todos</button></p>}
      <div className="mt-5 flex flex-wrap gap-2">
        {filters.map((item) => (
          <Button key={item.key} size="sm" variant={!stageFilter && filter === item.key ? "default" : "outline"}
            onClick={() => { setSearchParams({ status: item.key }); setSelectedId(null); }}>
            {item.key === "respondido_agente" ? `Respondidos por ${agentName}` : item.label} ({counts[item.key]})
          </Button>
        ))}
      </div>
      <div className="mt-4 grid overflow-hidden rounded-xl border bg-white md:grid-cols-[minmax(280px,360px)_1fr]">
        <div className="border-b md:border-b-0 md:border-r">
          <div className="border-b p-3">
            <Input aria-label="Buscar atendimento" placeholder="Buscar nome, telefone ou e-mail"
              value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {isLoading && <p className="p-4 text-sm text-slate-600">Carregando atendimentos...</p>}
            {isError && <p className="p-4 text-sm text-red-700">Erro ao carregar atendimentos.</p>}
            {!isLoading && !isError && !list.length && <p className="p-4 text-sm text-slate-600">Nenhum atendimento nesta lista.</p>}
            {list.map((lead) => (
              <button key={lead.id} type="button" onClick={() => setSelectedId(lead.id)}
                className={`w-full border-b px-4 py-3 text-left hover:bg-emerald-50 ${attendancePriority(lead).level >= 3 ? "border-l-4 border-l-red-600 bg-red-50" : attendancePriority(lead).level === 2 ? "border-l-4 border-l-amber-500 bg-amber-50" : isNewContact(lead) ? "border-l-4 border-l-blue-500 bg-blue-50" : ""} ${lead.id === selected?.id ? "ring-2 ring-inset ring-emerald-400" : ""}`}>
                <span className="flex items-center gap-2 font-medium"><span className="truncate">{lead.name}</span>{attendancePriority(lead).level >= 3 ? <span className="shrink-0 rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">URGENTE!</span> : attendancePriority(lead).level === 2 ? <span className="shrink-0 rounded bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">ATENÇÃO</span> : isNewContact(lead) ? <span className="shrink-0 rounded bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">NOVO</span> : null}</span>
                <span className="block text-xs text-slate-600">{lead.phone || lead.email}</span>
                {attendancePriority(lead).level > 0 && <span className={`block text-xs ${attendancePriority(lead).level >= 3 ? "font-semibold text-red-700" : "text-amber-700"}`}>{attendancePriority(lead).reason}</span>}
                <span className="mt-1 block line-clamp-2 text-sm text-slate-600">{lead.triage_summary || lead.last_inbound_message || "Sem resumo"}</span>
              </button>
            ))}
          </div>
        </div>
        {selected ? <Conversation key={selected.id} lead={selected} /> : (
          <div className="flex min-h-[400px] items-center justify-center p-8 text-center text-sm text-slate-600">
            Selecione um atendimento para ler o histórico e responder.
          </div>
        )}
      </div>
    </div>
  );
}
