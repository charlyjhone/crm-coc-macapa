export type WhatsAppMediaKind = "image" | "document" | "video" | "sticker" | "unknown";

const MEDIA_HANDOFF = "[MÍDIA_PARA_SECRETARIA:";

/**
 * Não analisa, transcreve nem envia mídias a serviços de IA.
 * Registra apenas o tipo do anexo para que a mensagem seja encaminhada
 * à secretaria e o arquivo original continue disponível no CRM.
 */
export function mediaFallbackMessage(
  kind: WhatsAppMediaKind,
  fileName = "",
): string {
  const safeName = fileName.replace(/[\r\n\[\]<>]/g, "").slice(0, 100);
  if (kind === "image") {
    return `${MEDIA_HANDOFF} imagem recebida; não analisar automaticamente; encaminhar à secretaria para conferência]`;
  }
  if (kind === "document") {
    return `${MEDIA_HANDOFF} documento/anexo recebido${safeName ? ` (${safeName})` : ""}; não analisar automaticamente; encaminhar à secretaria para conferência ou impressão]`;
  }
  if (kind === "video") {
    return `${MEDIA_HANDOFF} vídeo recebido; não analisar automaticamente; encaminhar à secretaria para conferência]`;
  }
  if (kind === "sticker") return "[FIGURINHA_RECEBIDA]";
  return `${MEDIA_HANDOFF} arquivo recebido; não analisar automaticamente; encaminhar à secretaria para conferência]`;
}
