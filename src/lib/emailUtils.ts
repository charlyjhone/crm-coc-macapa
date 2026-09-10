/**
 * Extrai apenas o conteúdo novo de um email, removendo o histórico de respostas
 */
export const extractNewEmailContent = (html: string | null): string => {
  if (!html) return '';
  
  // Remover scripts e styles primeiro
  let cleaned = html;
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Marcadores HTML que indicam início de histórico (mais confiáveis)
  const htmlHistoryMarkers = [
    /<div\s+class="gmail_quote[^"]*"[^>]*>/i,
    /<div\s+class="gmail_quote_container"[^>]*>/i,
    /<blockquote[^>]*class="gmail_quote"[^>]*>/i,
    /<blockquote[^>]*>/i,
    /<div\s+class="moz-cite-prefix"[^>]*>/i,
    /<div\s+class="yahoo_quoted"[^>]*>/i,
    /<div\s+id="divRplyFwdMsg"[^>]*>/i,
    /<hr[^>]*>/i,
  ];
  
  // Encontrar onde começa o histórico usando marcadores HTML
  let cutIndex = -1;
  
  for (const markerRegex of htmlHistoryMarkers) {
    const match = cleaned.match(markerRegex);
    if (match && match.index !== undefined) {
      if (cutIndex === -1 || match.index < cutIndex) {
        cutIndex = match.index;
      }
    }
  }
  
  // Se encontrou um marcador HTML, cortar o texto
  if (cutIndex > 0) {
    cleaned = cleaned.substring(0, cutIndex);
  }
  
  // Se não encontrou marcador HTML, tentar marcadores de texto
  if (cutIndex === -1) {
    const textMarkers = [
      /On\s+\w+,\s+\w+\s+\d+,\s+\d+\s+at\s+[\d:]+\s*[AP]M.*?wrote:/i,
      /Em\s+\w+\.?,?\s+\d+\s+de\s+\w+\.?\s+de\s+\d+\s+às?\s+[\d:]+.*?escreveu:/i,
      /----+\s*Original\s*Message\s*----+/i,
      /----+\s*Mensagem\s*original\s*----+/i,
      /_{10,}/,
      /From:.*?Sent:/is,
      /De:.*?Enviado:/is,
    ];
    
    for (const markerRegex of textMarkers) {
      const match = cleaned.match(markerRegex);
      if (match && match.index !== undefined) {
        if (cutIndex === -1 || match.index < cutIndex) {
          cutIndex = match.index;
        }
      }
    }
    
    if (cutIndex > 0) {
      cleaned = cleaned.substring(0, cutIndex);
    }
  }
  
  // Remover linhas vazias excessivas
  cleaned = cleaned.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');
  cleaned = cleaned.replace(/(<p>\s*<\/p>\s*){2,}/gi, '');
  
  // Remover divs vazias no final
  cleaned = cleaned.replace(/(<div[^>]*>\s*<\/div>\s*)+$/gi, '');
  
  return cleaned.trim();
};

/**
 * Remove citações de emails anteriores de texto plano
 * Útil para campos como last_inbound_message que armazenam texto sem HTML
 */
export const stripPlainTextQuotes = (text: string | null): string => {
  if (!text) return '';
  
  let cleaned = text;
  
  // Marcadores de texto que indicam início de citação
  const textMarkers = [
    /\n\s*On\s+\w+,\s+\w+\s+\d+,\s+\d+\s+at\s+[\d:]+\s*[AP]M.*?wrote:/i,
    /\n\s*Em\s+\w+\.?,?\s+\d+\s+de\s+\w+\.?\s+de\s+\d+\s+às?\s+[\d:]+.*?escreveu:/i,
    /\n\s*----+\s*Original\s*Message\s*----+/i,
    /\n\s*----+\s*Mensagem\s*original\s*----+/i,
    /\n\s*_{10,}/,
    /\n\s*From:.*?Sent:/is,
    /\n\s*De:.*?Enviado:/is,
    /\n\s*>+ /m,
  ];
  
  let cutIndex = -1;
  for (const marker of textMarkers) {
    const match = cleaned.match(marker);
    if (match && match.index !== undefined) {
      if (cutIndex === -1 || match.index < cutIndex) {
        cutIndex = match.index;
      }
    }
  }
  
  if (cutIndex > 0) {
    cleaned = cleaned.substring(0, cutIndex);
  }
  
  return cleaned.trim();
};

/**
 * Formata HTML de email para exibição limpa
 * @param html - conteúdo HTML do email
 * @param extractNewOnly - se true, extrai apenas o conteúdo novo (para emails inbound). Se false, mostra tudo (para emails outbound)
 */
export const formatEmailHtml = (html: string | null, extractNewOnly: boolean = true): string => {
  if (!html) return '';
  
  // Para emails enviados (outbound), mostrar o conteúdo completo
  // Para emails recebidos (inbound), extrair apenas o novo conteúdo
  let formatted = extractNewOnly ? extractNewEmailContent(html) : html;
  
  // Remover scripts e styles
  formatted = formatted.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  formatted = formatted.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Adicionar classes para melhor formatação
  formatted = formatted.replace(/<p>/gi, '<p class="mb-2">');
  formatted = formatted.replace(/<br\s*\/?>/gi, '<br class="my-1">');
  
  // Melhorar links
  formatted = formatted.replace(
    /<a\s+href=/gi, 
    '<a class="text-primary hover:underline" target="_blank" rel="noopener noreferrer" href='
  );
  
  return formatted;
};

/**
 * Converte HTML para texto plano para exibição em textarea
 */
export const htmlToPlainText = (html: string | null): string => {
  if (!html) return '';
  
  let text = html;
  
  // Substituir <br> por quebras de linha
  text = text.replace(/<br\s*\/?>/gi, '\n');
  
  // Substituir </p> e </div> por quebras de linha
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  
  // Remover todas as tags HTML
  text = text.replace(/<[^>]+>/g, '');
  
  // Decodificar entidades HTML comuns
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  
  // Remover múltiplas quebras de linha consecutivas
  text = text.replace(/\n{3,}/g, '\n\n');
  
  return text.trim();
};

/**
 * Converte texto plano para HTML para envio de email
 */
export const plainTextToHtml = (text: string | null): string => {
  if (!text) return '';
  
  // Escapar caracteres especiais HTML
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  
  // Converter quebras de linha para <br>
  html = html.replace(/\n/g, '<br>');
  
  // Envolver em div com estilos básicos
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">${html}</div>`;
};
