import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) binary += String.fromCharCode(chunk[j]);
  }
  return btoa(binary);
}

const LAWYER_SYSTEM = `Você é um(a) advogado(a) sênior brasileiro(a), especialista em Direito Empresarial, Contratos, Publicidade, Mídia e Propriedade Intelectual.

Seu cliente é Miguel Fernandes ("Inventor Miguel"), criador do portal inventormiguel.com. Ele vende: (1) publicidade no portal/canais, (2) consultoria e (3) palestras. Empresa: Inventos Digitais.

Sua tarefa: analisar o contrato/documento enviado SOB A ÓTICA DO MIGUEL (parte contratada/fornecedora). Identificar riscos jurídicos, financeiros, operacionais e reputacionais.

ATENÇÃO ESPECIAL para:
- Cláusulas de EXCLUSIVIDADE (de categoria, concorrentes, território, tempo).
- Multas, penalidades e cláusula penal desproporcionais.
- Direitos autorais e cessão de imagem/conteúdo (perpetuidade, irrevogabilidade, territorialidade).
- Confidencialidade abusiva ou unilateral.
- Indenizações ilimitadas, hold harmless, indenidade.
- Prazos de pagamento longos, retenções, glosas unilaterais.
- Direito de aprovação prévia de conteúdo que limite editorial.
- Não-concorrência pós-contrato.
- Foro, lei aplicável e arbitragem custosa.
- Rescisão unilateral sem motivo / sem aviso prévio razoável.
- Métricas/KPIs garantidos (entrega de resultados é arriscado).
- Compliance, LGPD, anticorrupção, código de conduta com sanções automáticas.

Seja objetivo, técnico, sem juridiquês desnecessário. Foque em RISCO REAL para o Miguel.

Responda SEMPRE em JSON válido, sem markdown, no formato exato:
{
  "resumo": "Texto corrido de 1 a 3 parágrafos resumindo os principais pontos de atenção e o nível de risco geral (baixo/médio/alto).",
  "nivel_risco": "baixo" | "medio" | "alto",
  "pontos_atencao": [
    { "clausula": "referência da cláusula", "risco": "descrição do risco", "severidade": "baixa" | "media" | "alta" }
  ],
  "sugestoes_alteracao": [
    { "clausula": "referência", "texto_atual": "trecho problemático (resumo)", "sugestao": "como reescrever ou negociar" }
  ],
  "perguntas_para_cliente": ["perguntas que Miguel deveria fazer ao cliente antes de assinar"]
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { attachment_id, force } = await req.json();
    if (!attachment_id) throw new Error("attachment_id is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: att, error: attErr } = await supabase
      .from("email_attachments")
      .select("id, filename, content_type, storage_path, legal_analysis")
      .eq("id", attachment_id)
      .maybeSingle();

    if (attErr || !att) throw new Error("attachment not found");

    if (att.legal_analysis && !force) {
      return new Response(
        JSON.stringify({ success: true, cached: true, analysis: att.legal_analysis }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve bucket
    let bucket = "email-attachments";
    let path = att.storage_path as string;
    if (path.startsWith("whatsapp-attachments/")) {
      bucket = "whatsapp-attachments";
      path = path.replace("whatsapp-attachments/", "");
    }

    const { data: fileBlob, error: dlErr } = await supabase.storage.from(bucket).download(path);
    if (dlErr || !fileBlob) throw new Error(`erro ao baixar: ${dlErr?.message}`);
    const buffer = await fileBlob.arrayBuffer();

    const mimeType: string = att.content_type || "application/pdf";
    const isPdf = mimeType === "application/pdf";
    const isImage = mimeType.startsWith("image/");
    const isText = mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/xml";

    // 1) Extrair texto
    let extractedText = "";
    if (isText) {
      extractedText = new TextDecoder().decode(buffer);
    } else if (isPdf || isImage) {
      const base64 = arrayBufferToBase64(buffer);
      const dataUrl = `data:${mimeType};base64,${base64}`;
      const extractRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Extraia TODO o texto deste documento mantendo a estrutura (cláusulas, valores, datas, partes). Retorne apenas o texto bruto, sem comentários." },
            { role: "user", content: [
              { type: "text", text: "Extraia todo o texto deste documento." },
              { type: "image_url", image_url: { url: dataUrl } },
            ] },
          ],
        }),
      });
      if (!extractRes.ok) {
        const t = await extractRes.text();
        throw new Error(`extração falhou: ${extractRes.status} ${t}`);
      }
      const ex = await extractRes.json();
      extractedText = ex.choices?.[0]?.message?.content || "";
    } else {
      throw new Error(`tipo não suportado para análise jurídica: ${mimeType}`);
    }

    if (!extractedText || extractedText.length < 30) {
      throw new Error("documento sem texto suficiente para análise");
    }

    // 2) Análise jurídica via IA com saída JSON estruturada
    const analyzeRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: LAWYER_SYSTEM },
          { role: "user", content: `Documento: ${att.filename}\n\n---\n${extractedText.slice(0, 120000)}` },
        ],
      }),
    });

    if (!analyzeRes.ok) {
      const t = await analyzeRes.text();
      if (analyzeRes.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (analyzeRes.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`análise falhou: ${analyzeRes.status} ${t}`);
    }

    const ai = await analyzeRes.json();
    const rawContent = ai.choices?.[0]?.message?.content || "{}";
    let analysis: any;
    try {
      analysis = JSON.parse(rawContent);
    } catch {
      const m = rawContent.match(/\{[\s\S]*\}/);
      analysis = m ? JSON.parse(m[0]) : { resumo: rawContent, nivel_risco: "medio", pontos_atencao: [], sugestoes_alteracao: [], perguntas_para_cliente: [] };
    }

    await supabase
      .from("email_attachments")
      .update({ legal_analysis: analysis, legal_analysis_at: new Date().toISOString() })
      .eq("id", attachment_id);

    return new Response(
      JSON.stringify({ success: true, cached: false, analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("analyze-legal-risk error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
