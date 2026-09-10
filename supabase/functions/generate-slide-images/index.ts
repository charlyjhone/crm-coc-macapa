import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPrompt } from "../_shared/get-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { slideType, content, leadId, customPrompt } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let prompt = "";

    if (slideType === "cover") {
      const defaultCoverPrompt = `Crie um slide minimalista de capa para uma proposta de palestra. Formato 16:9 (1920x1080).

Requisitos de design:
- Apenas preto e branco (sem cores)
- Ultra minimalista, com bastante espaço em branco
- Tipografia limpa e elegante
- Pouquíssimos elementos

REGRAS IMPORTANTES DE IDIOMA:
- TODO o texto deve estar em português (pt-BR). Não use nenhuma palavra em inglês.
- Use exatamente estes rótulos (com acentos): "Público-alvo:", "Local:", "Data:", "Duração:".

Conteúdo a exibir (centralizado e bem espaçado):
- Nome da empresa: "{company}"
- Título da palestra: "{title}"
- Público-alvo: "{audience}"
- Local: "{location}"
- Data: "{date}"
- Duração: "{duration}"

Design preto e branco ultra minimalista. Alta resolução.`;

      prompt = await getPrompt("17", defaultCoverPrompt, {
        company: content.company || "",
        title: content.title || "",
        audience: content.audience || "Executivos e líderes",
        location: content.location || "A definir",
        date: content.date || "Data a confirmar",
        duration: content.duration || "1h30min",
      });

    } else if (slideType === "agenda") {
      const defaultAgendaPrompt = `Crie um slide minimalista com a agenda/tópicos de uma palestra. Formato 16:9 (1920x1080).

Requisitos de design:
- Apenas preto e branco (sem cores)
- Ultra minimalista, com bastante espaço em branco
- Tipografia limpa e elegante
- Lista com bullets ou numeração clara

REGRAS IMPORTANTES DE IDIOMA:
- TODO o texto deve estar em português (pt-BR). Não use inglês.

Tópicos a exibir (como lista, bem espaçados):
{topics}

Design preto e branco ultra minimalista. Alta resolução.`;

      prompt = await getPrompt("18", defaultAgendaPrompt, {
        topics: content.topics || "",
      });

    } else if (slideType === "pricing") {
      const defaultPricingPrompt = `Crie um slide minimalista de investimento/valor. Formato 16:9 (1920x1080).

Requisitos de design:
- Apenas preto e branco (sem cores)
- Ultra minimalista, com bastante espaço em branco
- Tipografia limpa e elegante
- Pouquíssimos elementos

REGRAS IMPORTANTES DE IDIOMA:
- TODO o texto deve estar em português (pt-BR). Não use inglês.

Conteúdo a exibir (centralizado):
1. Valor (bem grande): {price}
2. Abaixo, menor: "Despesas com deslocamento e hospedagem por conta do cliente"

Somente esses dois textos, sem mais nada. Design ultra minimalista. Alta resolução.`;

      prompt = await getPrompt("19", defaultPricingPrompt, {
        price: content.price || "",
      });
    }

    // Append custom user prompt if provided
    if (customPrompt && customPrompt.trim()) {
      prompt += `\n\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${customPrompt.trim()}`;
    }

    console.log(`Generating ${slideType} slide with prompt:`, prompt);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to generate image" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await response.json();
    console.log("AI response received");

    const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!imageUrl) {
      console.error("No image in response:", aiData);
      return new Response(
        JSON.stringify({ error: "No image generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl,
        slideType,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-slide-images:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
