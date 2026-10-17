import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TriageStatus = "novo" | "respondido_agente" | "aguardando_secretaria" | "resolvido";
export type LeadStatus = "novo" | "em_atendimento" | "em_negociacao" | "matriculado" | "nao_convertido" | "resolvido";
export type Assunto = "matricula" | "curriculo" | "horario" | "localizacao" | "outros";

export type WhatsAppMediaType = "audio" | "image" | "video" | "document" | "sticker" | "location" | "contact" | "file";

export interface MensagemAtendimento {
  id: string;
  channel: "whatsapp" | "email";
  direction: string;
  message: string;
  at: string;
  mediaType: WhatsAppMediaType | null;
  mediaName: string | null;
  mediaCaption: string | null;
  mediaDurationSeconds: number | null;
  mediaUrl: string | null;
  mediaStoragePath: string | null;
  mediaMimeType: string | null;
  isAudio: boolean;
  senderName: string | null;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function describeWhatsAppMedia(rawValue: unknown, isAudioFlag: boolean | null, message: string | null) {
  const raw: JsonRecord = asRecord(rawValue) || {};
  const nested = [asRecord(raw.payload), asRecord(raw.data), asRecord(raw.messageData)].filter(Boolean) as JsonRecord[];
  const records = [raw, ...nested];
  const findObject = (...keys: string[]) => {
    for (const record of records) {
      for (const key of keys) {
        const value = asRecord(record[key]);
        if (value) return value;
      }
    }
    return null;
  };
  const findValue = (...keys: string[]) => {
    for (const record of records) {
      for (const key of keys) {
        if (record[key] !== undefined && record[key] !== null) return record[key];
      }
    }
    return undefined;
  };
  const audio = findObject("audio", "ptt", "voice");
  const image = findObject("image", "photo");
  const video = findObject("video");
  const document = findObject("document", "file", "documentMessage");
  const sticker = findObject("sticker");
  const location = findObject("location", "liveLocation");
  const contact = findObject("contact", "vcard", "contacts");
  const mediaUrl = (obj: JsonRecord | null, ...keys: string[]) =>
    firstString(...keys.map((key) => obj?.[key]));
  const audioUrl = mediaUrl(audio, "audioUrl", "url", "mediaUrl") || firstString(findValue("audioUrl", "pttUrl", "voiceUrl"));
  const audioStoragePath = mediaUrl(audio, "storagePath", "mediaStoragePath") || firstString(findValue("storagePath", "mediaStoragePath"));
  const imageUrl = mediaUrl(image, "imageUrl", "url", "mediaUrl") || firstString(findValue("imageUrl", "photoUrl"));
  const videoUrl = mediaUrl(video, "videoUrl", "url", "mediaUrl") || firstString(findValue("videoUrl"));
  const documentUrl = mediaUrl(document, "documentUrl", "url", "mediaUrl", "fileUrl") || firstString(findValue("documentUrl", "fileUrl"));
  const stickerUrl = mediaUrl(sticker, "stickerUrl", "url", "mediaUrl") || firstString(findValue("stickerUrl"));
  const genericUrl = firstString(findValue("fileUrl", "mediaUrl", "url"));
  const mimeType = firstString(
    audio?.mimeType, image?.mimeType, image?.mimetype, video?.mimeType, video?.mimetype,
    document?.mimeType, document?.mimetype, findValue("mimeType", "mimetype", "documentMimeType", "imageMimeType", "videoMimeType"),
  );
  const messageText = (message || "").trim();
  const audioPlaceholder = /^\[(?:mensagem de áudio|áudio não transcrito|áudio enviado pela secretaria)/i.test(messageText);
  let mediaType: WhatsAppMediaType | null = null;
  if (isAudioFlag || audioUrl || /audio\//i.test(mimeType || "") || audioPlaceholder) mediaType = "audio";
  else if (imageUrl || /image\//i.test(mimeType || "")) mediaType = "image";
  else if (videoUrl || /video\//i.test(mimeType || "")) mediaType = "video";
  else if (documentUrl || document) mediaType = "document";
  else if (stickerUrl || sticker) mediaType = "sticker";
  else if (location) mediaType = "location";
  else if (contact) mediaType = "contact";
  else if (genericUrl || mimeType || firstString(findValue("fileName", "filename", "title"))) mediaType = "file";

  const durationValue = audio?.seconds ?? audio?.duration ?? findValue("seconds", "duration", "durationSeconds");
  const duration = typeof durationValue === "number" && Number.isFinite(durationValue) && durationValue >= 0
    ? durationValue
    : typeof durationValue === "string" && /^\d+(?:\.\d+)?$/.test(durationValue)
      ? Number(durationValue)
      : null;
  const name = firstString(
    document?.fileName, document?.filename, document?.title,
    findValue("fileName", "filename", "documentName", "title"),
  );
  const caption = firstString(
    image?.caption, video?.caption, document?.caption, sticker?.caption,
    findValue("caption", "description"),
  );
  const url = safeHttpUrl(audioUrl || imageUrl || videoUrl || documentUrl || stickerUrl || genericUrl);
  return {
    mediaType,
    mediaName: name,
    mediaCaption: caption,
    mediaDurationSeconds: duration,
    mediaUrl: url,
    mediaStoragePath: audioStoragePath,
    mediaMimeType: mimeType,
    isAudio: mediaType === "audio",
  };
}

export interface Atendimento {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  assunto: Assunto | null;
  interesse: string | null;
  triage_status: TriageStatus;
  status: LeadStatus | null;
  triage_summary: string | null;
  attention_level: "urgente" | "atencao" | "normal" | "externo" | null;
  attention_reason: string | null;
  agent_replied_at: string | null;
  handoff_at: string | null;
  handoff_reason: string | null;
  resolved_at: string | null;
  last_inbound_message: string | null;
  last_inbound_message_at: string | null;
  last_outbound_message_at: string | null;
  created_at: string;
}

export function useAtendimentos() {
  return useQuery({
    queryKey: ["atendimentos"],
    refetchInterval: 30_000,
    queryFn: async (): Promise<Atendimento[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, name, email, phone, source, assunto, interesse, status, triage_status, triage_summary, attention_level, attention_reason, agent_replied_at, handoff_at, handoff_reason, resolved_at, last_inbound_message, last_inbound_message_at, last_outbound_message_at, created_at"
        )
        .eq("archived", false)
        .order("last_inbound_message_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as Atendimento[];
    },
  });
}

export function useUpdateTriage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TriageStatus }) => {
      if (status === "resolvido") {
        const { data, error } = await supabase.functions.invoke("complete-school-attendance", { body: { leadId: id } });
        if (error || !data?.success) throw error || new Error(data?.error || "Falha ao concluir atendimento.");
        return data as { success: boolean; survey: string };
      }
      const patch: Record<string, unknown> = { triage_status: status };
      const { data, error } = await supabase.from("leads").update(patch).eq("id", id).select("id").single();
      if (error) throw error;
      if (!data) throw new Error("Contato não encontrado.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atendimentos"] }),
  });
}

export function useUpdateLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lead, status }: { lead: Atendimento; status: LeadStatus }) => {
      if (status === "resolvido") {
        const { data, error } = await supabase.functions.invoke("complete-school-attendance", { body: { leadId: lead.id } });
        if (error || !data?.success) throw error || new Error(data?.error || "Falha ao concluir atendimento.");
        return data as { success: boolean; survey: string };
      }
      const patch: Record<string, unknown> = { status };
      if (lead.triage_status === "resolvido") {
        patch.triage_status = status === "novo" ? "novo" : "aguardando_secretaria";
        patch.resolved_at = null;
      }
      const { data, error } = await supabase.from("leads").update(patch).eq("id", lead.id).select("id").single();
      if (error) throw error;
      if (!data) throw new Error("Contato não encontrado.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atendimentos"] }),
  });
}

export function useMensagensAtendimento(lead: Atendimento | null) {
  return useQuery({
    queryKey: ["mensagens-atendimento", lead?.id, lead?.phone],
    enabled: !!lead,
    refetchInterval: 15_000,
    queryFn: async (): Promise<MensagemAtendimento[]> => {
      if (!lead) return [];
      const whatsappByLead = supabase
        .from("whatsapp_messages")
        .select("id, direction, message, timestamp, created_at, raw_data, is_audio")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(100);
      const phoneDigits = lead.phone?.replace(/\D/g, "") || "";
      const canonicalPhone = phoneDigits.startsWith("55") || phoneDigits.length < 10 ? phoneDigits : `55${phoneDigits}`;
      const phoneVariants = lead.phone
        ? [...new Set([lead.phone, phoneDigits, canonicalPhone].filter(Boolean))]
        : [];
      const whatsappByPhone = phoneVariants.length
        ? supabase
            .from("whatsapp_messages")
            .select("id, direction, message, timestamp, created_at, raw_data, is_audio")
            .in("phone", phoneVariants)
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null });
      const emailByLead = supabase
        .from("email_messages")
        .select("id, direction, message, subject, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(50);
      const [byLead, byPhone, emails] = await Promise.all([whatsappByLead, whatsappByPhone, emailByLead]);
      if (byLead.error) throw byLead.error;
      if (byPhone.error) throw byPhone.error;
      if (emails.error) throw emails.error;

      const uniqueWhatsApp = new Map(
        [...(byLead.data || []), ...(byPhone.data || [])].map((m) => [m.id, m]),
      );
      const whatsappBase: MensagemAtendimento[] = [...uniqueWhatsApp.values()].map((m) => {
        const raw = asRecord(m.raw_data) || {};
        const senderType = firstString(raw.sender_type, raw.source) || "";
        const operatorName = firstString(raw.operator_name, raw.attendant_name, raw.agent_name);
        const senderName = m.direction === "outbound"
          ? (senderType === "ana" || /^\\*?\\[Atendente Ana\\]/i.test(m.message || "") ? "Ana" : operatorName)
          : null;
        return {
          id: m.id,
          channel: "whatsapp",
          direction: m.direction,
          message: m.message || "",
          at: m.timestamp || m.created_at,
          senderName,
          ...describeWhatsAppMedia(m.raw_data, m.is_audio, m.message),
        };
      });
      const whatsapp: MensagemAtendimento[] = await Promise.all(whatsappBase.map(async (message) => {
        if (!message.mediaStoragePath || message.mediaUrl) return message;
        const { data: signed, error: signedError } = await supabase.storage
          .from("whatsapp-audio")
          .createSignedUrl(message.mediaStoragePath, 3600);
        return !signedError && signed?.signedUrl
          ? { ...message, mediaUrl: signed.signedUrl }
          : message;
      }));
      const email: MensagemAtendimento[] = (emails.data || []).map((m) => ({
        id: m.id,
        channel: "email",
        direction: m.direction,
        message: m.message || m.subject || "",
        at: m.created_at,
        mediaType: null,
        mediaName: null,
        mediaCaption: null,
        mediaDurationSeconds: null,
        mediaUrl: null,
        mediaStoragePath: null,
        mediaMimeType: null,
        isAudio: false,
        senderName: null,
      }));
      return [...whatsapp, ...email].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    },
  });
}

export function useEnviarWhatsApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lead, message }: { lead: Atendimento; message: string }) => {
      if (!lead.phone) throw new Error("Este contato não tem telefone para WhatsApp.");
      const { data, error } = await supabase.functions.invoke("send-whatsapp-message", {
        body: { phone: lead.phone, leadId: lead.id, message, senderType: "human" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "O WhatsApp não confirmou o envio.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mensagens-atendimento"] });
      qc.invalidateQueries({ queryKey: ["atendimentos"] });
    },
  });
}


export function useEnviarAudioWhatsApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lead, blob, durationSeconds }: {
      lead: Atendimento;
      blob: Blob;
      durationSeconds: number;
    }) => {
      if (!lead.phone) throw new Error("Este contato não tem telefone para WhatsApp.");
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Sua sessão expirou. Entre novamente.");
      if (!blob.size || blob.size > 10 * 1024 * 1024) {
        throw new Error("O áudio está vazio ou ultrapassa o limite de 10 MB.");
      }

      const mimeType = (blob.type || "audio/webm").split(";")[0].trim().toLowerCase();
      const extension = mimeType === "audio/ogg" ? "ogg"
        : mimeType === "audio/mp4" ? "m4a"
        : mimeType === "audio/mpeg" ? "mp3"
        : mimeType === "audio/wav" ? "wav"
        : mimeType === "audio/aac" ? "aac"
        : "webm";
      const fileName = `audio-secretaria-${Date.now()}.${extension}`;
      const storagePath = `${authData.user.id}/${lead.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("whatsapp-audio")
        .upload(storagePath, blob, { contentType: mimeType, upsert: false });
      if (uploadError) throw new Error(`Não foi possível preparar o áudio: ${uploadError.message}`);

      try {
        const { data, error } = await supabase.functions.invoke("send-whatsapp-audio", {
          body: { leadId: lead.id, storagePath, mimeType, fileName, durationSeconds },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "O WhatsApp não confirmou o envio do áudio.");
        return data as { success: boolean; logged?: boolean; warning?: string };
      } catch (error) {
        await supabase.storage.from("whatsapp-audio").remove([storagePath]).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mensagens-atendimento"] });
      qc.invalidateQueries({ queryKey: ["atendimentos"] });
    },
  });
}

/** Tempo de espera em horas desde a última mensagem recebida sem resposta. */
export function horasEsperando(a: Atendimento): number | null {
  if (!a.last_inbound_message_at) return null;
  const tIn = Date.parse(a.last_inbound_message_at);
  const tOut = a.last_outbound_message_at ? Date.parse(a.last_outbound_message_at) : 0;
  if (tOut > tIn) return null; // já respondemos
  return (Date.now() - tIn) / 3_600_000;
}
