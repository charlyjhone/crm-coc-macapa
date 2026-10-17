import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAtendimentos, useEnviarWhatsApp, useEnviarAudioWhatsApp, useMensagensAtendimento, useUpdateTriage, useUpdateLeadStatus, type Atendimento, type LeadStatus, type MensagemAtendimento } from "@/hooks/useAtendimentos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ExternalLink, FileText, Loader2, MessageCircle, Mic, Send, Square, Trash2 } from "lucide-react";
import { useSchoolIdentity } from "@/hooks/useSchoolIdentity";
import { attendancePriority } from "@/lib/attendancePriority";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

function isPdfMedia(message: MensagemAtendimento) {
  const mime = (message.mediaMimeType || "").toLowerCase().split(";")[0];
  return mime === "application/pdf" ||
    /\\.pdf(?:$|[?#])/i.test(message.mediaName || "") ||
    /\\.pdf(?:$|[?#])/i.test(message.mediaUrl || "");
}

function Conversation({ lead }: { lead: Atendimento }) {
  const priority = attendancePriority(lead);
  const { data: messages, isLoading, isError } = useMensagensAtendimento(lead);
  const send = useEnviarWhatsApp();
  const sendAudio = useEnviarAudioWhatsApp();
  const update = useUpdateTriage();
  const updateStatus = useUpdateLeadStatus();
  const [draft, setDraft] = useState("");
  const [pdfPreview, setPdfPreview] = useState<{ url: string; name: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef(0);
  const recordingTimerRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [audioPreviewUrl]);

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Este navegador não permite gravar áudio. Use uma versão atual do Chrome ou Edge.");
      return;
    }
    try {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
      setAudioPreviewUrl(null);
      setRecordedAudio(null);
      setRecordingSeconds(0);
      setRecordedDuration(0);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const candidates = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4"];
      const preferredType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      discardRecordingRef.current = false;
      recordingStartRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopRecordingTimer();
        setIsRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          return;
        }
        const duration = Math.max(1, Math.round((Date.now() - recordingStartRef.current) / 1000));
        const mimeType = (recorder.mimeType || "audio/webm").split(";")[0];
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (!blob.size) {
          toast.error("Não foi possível capturar o áudio. Tente novamente.");
          return;
        }
        if (blob.size > 10 * 1024 * 1024) {
          toast.error("O áudio ultrapassou 10 MB. Grave uma mensagem mais curta.");
          return;
        }
        setRecordedAudio(blob);
        setRecordedDuration(duration);
        setAudioPreviewUrl(URL.createObjectURL(blob));
      };
      recorder.onerror = () => {
        stopRecordingTimer();
        setIsRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        toast.error("Ocorreu um erro durante a gravação do áudio.");
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      recordingTimerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartRef.current) / 1000);
        setRecordingSeconds(elapsed);
        if (elapsed >= 120 && recorder.state === "recording") recorder.stop();
      }, 1000);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      toast.error(error instanceof Error && error.name === "NotAllowedError"
        ? "Permita o acesso ao microfone para gravar o áudio."
        : "Não foi possível iniciar a gravação. Verifique o microfone.");
    }
  };

  const stopRecording = () => {
    stopRecordingTimer();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const cancelRecording = () => {
    if (recorderRef.current?.state === "recording") {
      discardRecordingRef.current = true;
      stopRecordingTimer();
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioPreviewUrl(null);
    setRecordedAudio(null);
    setRecordedDuration(0);
    setRecordingSeconds(0);
    setIsRecording(false);
  };

  const sendRecordedAudio = async () => {
    if (!recordedAudio || sendAudio.isPending) return;
    try {
      const result = await sendAudio.mutateAsync({ lead, blob: recordedAudio, durationSeconds: recordedDuration });
      cancelRecording();
      if (result.warning) toast.warning(result.warning);
      else toast.success("Áudio enviado pelo WhatsApp");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o áudio.");
    }
  };

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
        <div className="flex flex-wrap items-center gap-2">
          {lead.phone && (
            <a
              href={`https://web.whatsapp.com/send?phone=${lead.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-700 px-3 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
              title="Abrir esta conversa no WhatsApp Web para consultar e imprimir documentos"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp Web
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => void finish()}>
            {lead.triage_status === "resolvido" ? "Verificar pesquisa" : "Concluir atendimento"}
          </Button>
        </div>
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
                <p className="whitespace-pre-wrap break-words text-slate-600">{outgoing ? "Áudio enviado pela secretaria." : "Áudio recebido; o conteúdo não ficou disponível em texto."}</p>
              )}
              {!text && !m.mediaType && <p className="whitespace-pre-wrap break-words">(mensagem sem texto)</p>}
              {m.mediaType === "image" && m.mediaUrl && (
                <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="mt-2 block" aria-label="Ampliar imagem recebida">
                  <img
                    src={m.mediaUrl}
                    alt={m.mediaCaption || m.mediaName || "Imagem enviada nesta conversa"}
                    loading="lazy"
                    className="max-h-72 max-w-full rounded-lg border object-contain"
                  />
                  <span className="mt-1 inline-block text-xs font-medium text-blue-700 underline">Ampliar imagem</span>
                </a>
              )}
              {m.mediaType === "audio" && m.mediaUrl && (
                <div className="mt-2 min-w-0">
                  <audio controls preload="metadata" src={m.mediaUrl} className="w-full max-w-xs">
                    Seu navegador não conseguiu reproduzir este áudio.
                  </audio>
                </div>
              )}
              {m.mediaType && m.mediaUrl && m.mediaType !== "image" && m.mediaType !== "audio" && (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {isPdfMedia(m) && (
                    <Button size="sm" variant="outline" onClick={() => setPdfPreview({ url: m.mediaUrl!, name: m.mediaName || "Documento PDF" })}>
                      <FileText className="mr-2 h-4 w-4" /> Visualizar PDF
                    </Button>
                  )}
                  <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 underline">
                    {isPdfMedia(m) ? "Abrir PDF em nova aba" : m.mediaType === "document" || m.mediaType === "file" ? "Abrir documento / arquivo" : "Abrir anexo"}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {m.mediaType === "document" && (
                <p className="mt-1 text-xs text-slate-600">Para localizar outros arquivos e imprimir a documentação da família, use o atalho WhatsApp Web no cabeçalho.</p>
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
          <>
            {isRecording && (
              <div className="mb-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> Gravando áudio · {formatMediaDuration(recordingSeconds)}</span>
                <Button size="sm" variant="destructive" onClick={stopRecording}><Square className="mr-2 h-3.5 w-3.5" /> Parar</Button>
              </div>
            )}
            {recordedAudio && audioPreviewUrl && !isRecording && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-slate-50 p-3">
                <audio controls src={audioPreviewUrl} className="min-w-[180px] flex-1" />
                <Button variant="outline" size="sm" onClick={cancelRecording} disabled={sendAudio.isPending}>
                  <Trash2 className="mr-1 h-4 w-4" /> Descartar
                </Button>
                <Button size="sm" onClick={() => void sendRecordedAudio()} disabled={sendAudio.isPending}>
                  {sendAudio.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                  Enviar áudio
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Input aria-label="Mensagem de WhatsApp" placeholder={isRecording ? "Gravação em andamento..." : "Escreva uma resposta para a família"} value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void sendMessage(); } }}
                disabled={send.isPending || isRecording || sendAudio.isPending} />
              {isRecording ? (
                <Button variant="outline" title="Parar gravação" aria-label="Parar gravação" onClick={stopRecording}>
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="outline" title="Gravar áudio" aria-label="Gravar áudio" onClick={() => void startRecording()}
                  disabled={send.isPending || sendAudio.isPending}>
                  <Mic className="h-4 w-4" />
                </Button>
              )}
              <Button onClick={() => void sendMessage()} disabled={!draft.trim() || send.isPending || isRecording || sendAudio.isPending}>
                {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="ml-2">Enviar</span>
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Você pode gravar até 2 minutos, ouvir antes de enviar e descartar se necessário.</p>
          </>
        ) : <p className="text-sm text-slate-600">Sem WhatsApp cadastrado. O envio por e-mail será integrado depois.</p>}
      </div>
      <Dialog open={!!pdfPreview} onOpenChange={(open) => { if (!open) setPdfPreview(null); }}>
        <DialogContent className="flex h-[85vh] w-[96vw] max-w-5xl flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{pdfPreview?.name || "Visualizar PDF"}</DialogTitle>
            <DialogDescription>Se o arquivo não aparecer aqui, use a opção para abrir em uma nova aba.</DialogDescription>
          </DialogHeader>
          {pdfPreview && (
            <>
              <iframe src={pdfPreview.url} title={pdfPreview.name} className="min-h-0 w-full flex-1 rounded-md border bg-white" />
              <a href={pdfPreview.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 underline">
                Abrir PDF em nova aba <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
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
