import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAtendimentos, useEnviarWhatsApp, useEnviarAudioWhatsApp, useMensagensAtendimento, useUpdateTriage, useUpdateLeadStatus, type Atendimento, type LeadStatus, type MensagemAtendimento } from "@/hooks/useAtendimentos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ExternalLink, FileText, Loader2, MessageCircle, Mic, Send, Square, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatSchoolDateTime } from "@/lib/schoolDateTime";
import { timeAgo } from "@/components/crm/ui";
import { DEMO_MODE, demo } from "@/lib/demo";
import { ConfirmEnrollmentButton } from "@/components/crm/ConfirmEnrollmentButton";
import { attendancePriority } from "@/lib/attendancePriority";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NewFamilyDialog } from "@/components/school/NewFamilyDialog";

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
    <section className="flex min-h-[500px] min-w-0 flex-1 flex-col md:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E7EC] bg-white px-5 py-3.5">
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
            {lead.triage_status === "resolvido" ? "Verificar pesquisa" : "Marcar como resolvida"}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-[#E4E7EC] bg-white px-5 py-2.5">
        <label htmlFor="lead-status" className="text-sm font-medium">Andamento do contato</label>
        <select id="lead-status" aria-label="Andamento do contato" className="h-9 rounded-md border bg-background px-3 text-sm" value={lead.status || "novo"}
          onChange={(event) => void changeStatus(event.target.value as LeadStatus)} disabled={updateStatus.isPending}>
          {lead.status === "matriculado" && <option value="matriculado" disabled>Interesse em matrícula</option>}
          {stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
        </select>
        <span className="text-xs text-slate-600">Assunto: {subjectLabel(lead.assunto)}</span>
        <Link to="/funil" className="text-xs font-medium text-[var(--crm-accent)] underline">Ver no funil</Link>
      </div>
      <div className="flex min-h-64 flex-1 flex-col gap-3 overflow-y-auto bg-[#F6F7F9] p-5">
        {isLoading && <p className="text-sm text-slate-600">Carregando histórico...</p>}
        {isError && <p className="text-sm text-red-700">Não foi possível carregar o histórico.</p>}
        {!isLoading && !isError && !messages?.length && <p className="text-sm text-slate-600">Nenhuma mensagem encontrada.</p>}
        {messages?.map((m) => {
          const outgoing = m.direction === "outbound";
          const rawText = m.message.trim();
          const text = outgoing
            ? rawText.replace(/^\*(?:\[Atendente\s+[^\]\r\n]+\]|[^*\r\n]*(?:Secretaria|Atendente)[^*\r\n]*)\*\s*/i, "")
            : rawText;
          const audioPlaceholder = /^\[(?:mensagem de áudio|áudio não transcrito|áudio enviado pela secretaria)/i.test(text);
          const duration = formatMediaDuration(m.mediaDurationSeconds);
          return (
            <div key={`${m.channel}-${m.id}`} className={`max-w-[85%] rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed md:max-w-[62%] ${outgoing ? "self-end border-[var(--crm-accent-line)] bg-[var(--crm-accent-soft)]" : "self-start border-[#E4E7EC] bg-white"}`}>
              {outgoing && m.senderName && <p className="mb-0.5 text-xs text-[#5B6675]">{m.senderName}</p>}
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
      <div className="border-t border-[#E4E7EC] bg-white px-5 py-3.5">
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


function DemoConversation({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([
    { id: 1, from: "family", time: "09:14", text: "Bom dia! Gostaria de saber sobre matrícula para o 6º ano." },
    { id: 2, from: "school", time: "09:15", text: "Bom dia! Seja bem-vinda ao Colégio Conceito Bilíngue. Posso ajudar com as informações iniciais." },
    { id: 3, from: "family", time: "09:16", text: "Quais são os turnos disponíveis?" },
  ]);
  const sendDemoMessage = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((current) => [...current, { id: Date.now(), from: "school", time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), text }]);
    setDraft("");
  };
  return (
    <div className="flex min-h-[500px] h-full min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-card p-4">
        <div><div className="flex items-center gap-2"><h2 className="font-semibold">Mariana Oliveira</h2><span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">DEMONSTRAÇÃO</span></div><p className="text-xs text-muted-foreground">(96) 99999-0101 · Exemplo fictício</p></div>
        <Button size="sm" variant="outline" onClick={onClose}>Fechar demonstração</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-3">
        <span className="text-xs font-medium text-muted-foreground">Andamento</span><span className="rounded-full border px-2.5 py-1 text-xs">Novo</span>
        <span className="ml-auto text-xs text-muted-foreground">Matrícula · 6º ano</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 p-4">
        <div className="mx-auto rounded-full bg-white px-3 py-1 text-[10px] text-slate-500 shadow-sm">Hoje · conversa fictícia</div>
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.from === "school" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm ${message.from === "school" ? "rounded-br-sm bg-emerald-100 text-slate-800" : "rounded-bl-sm border bg-white text-slate-800"}`}>
              <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p><p className="mt-1 text-right text-[10px] text-slate-500">{message.time} · {message.from === "school" ? "Secretaria (simulado)" : "Família (simulado)"}</p>
            </div>
          </div>
        ))}
      </div>
      <form className="border-t bg-card p-3" onSubmit={(event) => { event.preventDefault(); sendDemoMessage(); }}>
        <div className="flex items-end gap-2"><textarea aria-label="Mensagem de demonstração" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Digite uma resposta de teste (não será enviada ao WhatsApp)..." rows={2} className="min-h-11 flex-1 resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" /><Button type="submit" disabled={!draft.trim()}><Send className="mr-2 h-4 w-4" />Simular envio</Button></div>
        <p className="mt-2 text-[10px] text-muted-foreground">Modo demonstração: as mensagens ficam somente nesta tela e não são gravadas nem enviadas.</p>
      </form>
    </div>
  );
}

type Tab = "aguardando" | "em_conversa" | "resolvidas" | "todas";
const tabs: { key: Tab; label: string }[] = [
  { key: "aguardando", label: "Aguardando" },
  { key: "em_conversa", label: "Em conversa" },
  { key: "resolvidas", label: "Resolvidas" },
  { key: "todas", label: "Todas" },
];

function tabOf(lead: Atendimento): Exclude<Tab, "todas"> {
  if (lead.triage_status === "resolvido" || lead.status === "resolvido" || lead.status === "nao_convertido") return "resolvidas";
  if (lead.triage_status === "aguardando_secretaria" || attendancePriority(lead).level >= 1) return "aguardando";
  return "em_conversa";
}

function legacyFilterToTab(value: string | null): Tab | null {
  if (!value) return null;
  if (tabs.some((item) => item.key === value)) return value as Tab;
  if (value === "todos") return "todas";
  if (value === "resolvido") return "resolvidas";
  if (["urgentes", "atencao", "aguardando_secretaria"].includes(value)) return "aguardando";
  if (["novos", "respondido_agente", "matricula"].includes(value)) return "em_conversa";
  return null;
}

type LeadVisit = { scheduled_at: string; status: string };
function useLeadVisit(leadId: string | null) {
  return useQuery({
    queryKey: ["conversa-visita", leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<{ id: string | null; stage: string | null; grade: string | null; shift: string | null; student: string | null; visit: LeadVisit | null }> => {
      const { data, error } = DEMO_MODE
        ? { data: (await demo.opportunities()).filter((o) => o.legacy_lead_id === leadId), error: null }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas escolares ainda não estão nos tipos gerados.
        : await (supabase as any).from("enrollment_opportunities")
          .select("id,stage,desired_grade,desired_shift,students(full_name),school_visits(scheduled_at,status)")
          .eq("legacy_lead_id", leadId).order("created_at", { ascending: false }).limit(1);
      if (error || !data?.length) return { id: null, stage: null, grade: null, shift: null, student: null, visit: null };
      const row = data[0];
      const visits = ((row.school_visits || []) as LeadVisit[]).filter((v) => v.status !== "cancelada")
        .sort((a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at));
      return { id: row.id, stage: row.stage, grade: row.desired_grade, shift: row.desired_shift, student: row.students?.full_name || null, visit: visits[0] || null };
    },
  });
}

const visitStatusLabel: Record<string, string> = { agendada: "Agendada", confirmada: "Confirmada", reagendada: "Reagendada", realizada: "Realizada", faltou: "Não compareceu" };

function FamilyCard({ lead }: { lead: Atendimento }) {
  const { data } = useLeadVisit(lead.id);
  const row = (label: string, value: string | null | undefined) => (
    <div className="flex justify-between gap-3 py-1.5 text-sm"><span className="text-[#5B6675]">{label}</span><span className="min-w-0 break-words text-right">{value || "—"}</span></div>
  );
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-[.04em] text-[#5B6675]">Família</p>
        {row("Responsável", lead.name)}
        {row("Telefone", lead.phone || lead.email)}
        {data?.student && row("Aluno", data.student)}
        {row("Série", data?.grade ? `${data.grade}${data.shift ? `, ${data.shift}` : ""}` : lead.interesse)}
        {row("Como conheceu", lead.source)}
        {row("Assunto", subjectLabel(lead.assunto))}
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-[.04em] text-[#5B6675]">Visita</p>
        {data?.visit ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>{formatSchoolDateTime(data.visit.scheduled_at)}</span>
            <span className="rounded-full bg-[#ECFDF3] px-2 py-0.5 text-xs font-semibold text-[#067647]">{visitStatusLabel[data.visit.status] || data.visit.status}</span>
          </div>
        ) : <p className="text-sm text-[#5B6675]">Nenhuma visita marcada.</p>}
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-[.04em] text-[#5B6675]">Resumo da IA</p>
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[#5B6675]">{lead.triage_summary || lead.last_inbound_message || "O resumo aparece quando houver mensagens."}</p>
      </div>
      {data?.id && data.stage !== "matriculado" && data.stage !== "perdido" && (
        <ConfirmEnrollmentButton opportunityId={data.id} studentName={data.student} grade={data.grade} />
      )}
      {data?.stage === "matriculado" && <p className="rounded-lg bg-[#ECFDF3] px-3 py-2 text-sm font-medium text-[#067647]">Matrícula confirmada</p>}
      {lead.phone && !DEMO_MODE && !data?.id && <NewFamilyDialog initialLead={{ id: lead.id, name: lead.name, phone: lead.phone, email: lead.email, interesse: lead.interesse }} triggerLabel="Preparar cadastro de matrícula" />}
    </div>
  );
}

export default function Atendimentos() {
  const { data, isLoading, isError } = useAtendimentos();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStage = searchParams.get("etapa");
  const stageFilter = stages.some((item) => item.key === requestedStage) ? requestedStage as LeadStatus : null;
  const requestedLeadId = searchParams.get("lead");
  const tab: Tab = legacyFilterToTab(searchParams.get("aba") || searchParams.get("status")) || "aguardando";
  const [search, setSearch] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(requestedLeadId);

  const counts = useMemo(() => {
    const result: Record<Tab, number> = { aguardando: 0, em_conversa: 0, resolvidas: 0, todas: data?.length || 0 };
    for (const lead of data || []) result[tabOf(lead)]++;
    return result;
  }, [data]);

  const list = (data || []).filter((lead) => {
    const matchesTab = stageFilter ? lead.status === stageFilter : tab === "todas" || tabOf(lead) === tab;
    const term = search.toLocaleLowerCase("pt-BR");
    return matchesTab && (!term || [lead.name, lead.phone, lead.email].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)));
  }).sort((a, b) => attendancePriority(b).level - attendancePriority(a).level ||
    (Date.parse(b.last_inbound_message_at || "") || 0) - (Date.parse(a.last_inbound_message_at || "") || 0));

  const selected = (data || []).find((lead) => lead.id === selectedId) || list[0] || null;

  const tagFor = (lead: Atendimento) => {
    const level = attendancePriority(lead).level;
    if (level >= 3) return <span className="rounded-full bg-[#FEF3F2] px-2 py-0.5 text-xs font-semibold text-[#B42318]">Urgente</span>;
    if (level >= 1) return <span className="rounded-full bg-[#FFFAEB] px-2 py-0.5 text-xs font-semibold text-[#93370D]">Atenção</span>;
    if (isNewContact(lead)) return <span className="rounded-full bg-[#EFF8FF] px-2 py-0.5 text-xs font-semibold text-[#175CD3]">Novo</span>;
    return null;
  };

  return (
    <section aria-label="Conversas" className="flex min-h-[calc(100vh-104px)] flex-col bg-[#F6F7F9] md:h-screen md:min-h-0 lg:flex-row">
      <aside className="flex max-h-[45vh] w-full shrink-0 flex-col border-b border-[#E4E7EC] bg-white lg:max-h-none lg:w-[300px] lg:border-b-0 lg:border-r">
        <div className="px-4 pb-2 pt-[18px]">
          <h1 className="text-base font-semibold">Conversas</h1>
          <Input aria-label="Buscar conversa" placeholder="Buscar nome ou telefone" value={search} onChange={(event) => setSearch(event.target.value)} className="mt-3 h-9" />
        </div>
        <div className="flex flex-wrap gap-1 px-3 pb-2.5" role="tablist" aria-label="Situação das conversas">
          {tabs.map((item) => (
            <button key={item.key} type="button" role="tab" aria-selected={!stageFilter && tab === item.key}
              onClick={() => { setSearchParams({ aba: item.key }); setSelectedId(null); }}
              className={`min-h-9 rounded-lg px-2.5 text-sm font-medium ${!stageFilter && tab === item.key ? "bg-[var(--crm-accent-soft)] text-[var(--crm-accent)]" : "text-[#5B6675] hover:bg-[#F2F4F7]"}`}>
              {item.label} {item.key !== "resolvidas" && item.key !== "todas" ? counts[item.key] : ""}
            </button>
          ))}
        </div>
        {stageFilter && (
          <div className="mx-3 mb-2 flex items-center justify-between rounded-lg bg-[var(--crm-accent-softer)] px-3 py-2 text-xs">
            <span>Etapa: <strong>{stages.find((item) => item.key === stageFilter)?.label}</strong></span>
            <button className="font-medium text-[var(--crm-accent)] underline" onClick={() => setSearchParams({ aba: "todas" })}>Limpar</button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="p-5 text-sm text-[#5B6675]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando conversas…</p>}
          {isError && <p className="p-5 text-sm text-[#B42318]">Não foi possível carregar as conversas. Atualize a página.</p>}
          {!isLoading && !isError && !list.length && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm font-semibold">Nenhuma conversa aqui</p>
              <p className="mt-1 text-xs text-[#5B6675]">As mensagens novas aparecem automaticamente.</p>
              <button type="button" className="mt-3 text-xs font-medium text-[var(--crm-accent)] underline" onClick={() => setDemoMode(true)}>Ver conversa de exemplo</button>
            </div>
          )}
          {list.map((lead) => (
            <button key={lead.id} type="button" onClick={() => { setDemoMode(false); setSelectedId(lead.id); }}
              className={`flex w-full flex-col gap-1 border-t border-[#EEF0F3] px-4 py-3 text-left hover:bg-[#F9FAFB] ${!demoMode && lead.id === selected?.id ? "bg-[var(--crm-accent-softer)]" : ""}`}>
              <span className="flex items-center justify-between gap-2"><b className="truncate text-sm">{lead.name}</b><span className="shrink-0 text-[13px] text-[#5B6675]">{timeAgo(lead.last_inbound_message_at).replace("há ", "")}</span></span>
              <span className="truncate text-[13px] text-[#5B6675]">{lead.last_inbound_message || lead.triage_summary || "Sem mensagem registrada"}</span>
              {tagFor(lead) && <span>{tagFor(lead)}</span>}
            </button>
          ))}
        </div>
      </aside>

      <div className="flex min-h-[520px] min-w-0 flex-1 flex-col">
        {demoMode ? <DemoConversation onClose={() => setDemoMode(false)} /> : selected ? <Conversation key={selected.id} lead={selected} /> : (
          <div className="flex flex-1 flex-col items-center justify-center px-8 py-10 text-center">
            <MessageCircle className="mb-3 h-8 w-8 text-[var(--crm-accent)]" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Escolha uma conversa</h2>
            <p className="mt-1 max-w-sm text-sm text-[#5B6675]">O histórico, a resposta e a ficha da família aparecem aqui.</p>
          </div>
        )}
      </div>

      <aside className="w-full shrink-0 border-t border-[#E4E7EC] bg-white p-[18px] lg:w-[300px] lg:overflow-y-auto lg:border-l lg:border-t-0">
        {selected && !demoMode ? <FamilyCard lead={selected} /> : (
          <p className="text-sm text-[#5B6675]">{demoMode ? "Conversa de exemplo: nada é salvo nem enviado." : "A ficha da família aparece ao abrir uma conversa."}</p>
        )}
      </aside>
    </section>
  );
}
