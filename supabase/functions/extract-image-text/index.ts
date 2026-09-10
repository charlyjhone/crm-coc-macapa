import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getPrompt } from "../_shared/get-prompt.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function dataUrlInfo(dataUrl: string): { bytes: Uint8Array; mime: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error('Invalid data URL');
  const mime = match[1];
  const base64 = match[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime, base64 };
}

/**
 * Send the document (PDF or image) directly to the Gemini Vision model.
 * Gemini natively understands PDFs as multi-page documents (analyzes EACH page
 * including tables and layout — equivalent to "screenshot every page").
 */
async function extractWithVision(
  dataUrl: string,
  systemPrompt: string,
  apiKey: string,
): Promise<string> {
  const userText = `Analise este documento PÁGINA POR PÁGINA (visualmente) e extraia TODO o conteúdo textual.

REGRAS CRÍTICAS:
- Olhe cada página como se fosse uma imagem (preste atenção a cabeçalhos, rodapés, tabelas, valores em colunas).
- Reproduza tabelas em Markdown preservando colunas e valores alinhados.
- Preserve EXATAMENTE valores monetários e a moeda original — símbolos como €, R$, US$, $, e códigos EUR/USD/BRL. NUNCA converta entre moedas.
- Se o documento tiver múltiplas moedas, indique cada valor com sua moeda.
- Mantenha o idioma original (en/pt/es).
- Inclua todos os contatos (nomes, e-mails, telefones, empresas), datas, prazos e identificadores (SOW ID, Contract ID, etc.).
- Não resuma. Não comente. Apenas o conteúdo integral.`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-pro', // Pro = best for multi-page PDFs + tables + layout
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error('Rate limit exceeded. Please try again later.');
    if (response.status === 402) throw new Error('Payment required. Please add credits to your workspace.');
    const errorText = await response.text();
    console.error('AI Gateway error:', response.status, errorText);
    throw new Error(`AI Gateway error: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, fileBase64, mimeType: explicitMime } = await req.json();
    const dataUrl: string | undefined = fileBase64 || imageBase64;

    if (!dataUrl) {
      throw new Error('No file/image data provided');
    }

    const { bytes, mime } = dataUrlInfo(dataUrl);
    const mimeType = explicitMime || mime || 'image/png';
    const isPdf = mimeType === 'application/pdf';

    const sizeMB = bytes.byteLength / (1024 * 1024);
    console.log(`Extracting from ${isPdf ? 'PDF' : 'image'} (${mimeType}) — ${sizeMB.toFixed(2)} MB`);

    if (sizeMB > 25) {
      throw new Error(`Arquivo muito grande: ${sizeMB.toFixed(1)}MB (limite 25MB)`);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const defaultSystemPrompt = `Você é um especialista em OCR e extração de dados de documentos comerciais (contratos, propostas, SOWs).
- Analise o documento PÁGINA POR PÁGINA visualmente.
- Extraia TODO o texto, incluindo cabeçalhos, rodapés e TABELAS.
- Reproduza tabelas em Markdown preservando colunas.
- Mantenha valores monetários e moeda EXATAMENTE como aparecem (€, R$, US$, EUR, USD, BRL). NUNCA converta.
- Preserve o idioma original.
- Não resuma, não comente.`;

    const systemPrompt = await getPrompt("15", defaultSystemPrompt);

    let extractedText = await extractWithVision(dataUrl, systemPrompt, LOVABLE_API_KEY);

    if (extractedText.length > 50000) {
      extractedText = extractedText.slice(0, 50000) + '\n\n[...texto truncado...]';
    }

    console.log(`Extracted ${extractedText.length} chars`);

    return new Response(
      JSON.stringify({ text: extractedText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error extracting text from image/PDF:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
