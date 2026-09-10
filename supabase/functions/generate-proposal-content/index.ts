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
    const { leadId } = await req.json();

    if (!leadId) {
      return new Response(
        JSON.stringify({ error: "leadId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch lead info
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("name, description, produto, ai_diagnosis, ai_next_step, origem, publicidade_subtipo")
      .eq("id", leadId)
      .single();

    if (leadError) {
      console.error("Error fetching lead:", leadError);
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch ALL lead notes (sem limite — todas as notas devem ir para a IA)
    const { data: leadNotes, error: notesError } = await supabase
      .from("lead_notes")
      .select("note, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });

    if (notesError) {
      console.error("Error fetching lead notes:", notesError);
    }

    // Fetch WhatsApp messages
    const { data: whatsappMessages, error: whatsappError } = await supabase
      .from("whatsapp_messages")
      .select("message, direction, timestamp")
      .eq("lead_id", leadId)
      .order("timestamp", { ascending: true });

    if (whatsappError) {
      console.error("Error fetching WhatsApp messages:", whatsappError);
    }

    // Fetch email messages
    const { data: emailMessages, error: emailError } = await supabase
      .from("email_messages")
      .select("message, subject, direction, timestamp")
      .eq("lead_id", leadId)
      .order("timestamp", { ascending: true });

    if (emailError) {
      console.error("Error fetching email messages:", emailError);
    }

    // Build conversation history
    let conversationText = `Cliente: ${lead.name}\n`;
    if (lead.produto) conversationText += `Produto solicitado: ${lead.produto}\n`;
    if (lead.origem) conversationText += `Origem do lead: ${lead.origem}\n`;
    if (lead.description) {
      conversationText += `\nDescrição do lead:\n${lead.description}\n`;
    }
    if (lead.ai_diagnosis) {
      conversationText += `\nDiagnóstico IA:\n${lead.ai_diagnosis}\n`;
    }
    if (lead.ai_next_step) {
      conversationText += `\nPróximo passo sugerido: ${lead.ai_next_step}\n`;
    }

    // Add ALL lead notes (especially important for import text with event details and target audience info)
    if (leadNotes && leadNotes.length > 0) {
      conversationText += `\n--- NOTAS DO LEAD (${leadNotes.length} no total) ---\n`;
      for (const note of leadNotes) {
        const when = note.created_at ? new Date(note.created_at).toISOString().slice(0, 10) : "";
        conversationText += `[${when}] ${note.note}\n\n`;
      }
    } else {
      conversationText += `\n--- NOTAS DO LEAD ---\n(nenhuma nota registrada)\n`;
    }

    conversationText += "\n--- HISTÓRICO DE CONVERSAS ---\n\n";

    // Add WhatsApp messages
    if (whatsappMessages && whatsappMessages.length > 0) {
      conversationText += "=== MENSAGENS WHATSAPP ===\n";
      for (const msg of whatsappMessages) {
        const sender = msg.direction === "inbound" ? lead.name : "Eu";
        conversationText += `[${sender}]: ${msg.message || "(sem texto)"}\n`;
      }
      conversationText += "\n";
    }

    // Add email messages
    if (emailMessages && emailMessages.length > 0) {
      conversationText += "=== EMAILS ===\n";
      for (const email of emailMessages) {
        const sender = email.direction === "inbound" ? lead.name : "Eu";
        conversationText += `[${sender}] Assunto: ${email.subject || "(sem assunto)"}\n`;
        conversationText += `${email.message || "(sem conteúdo)"}\n\n`;
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call AI to extract event details and generate agenda
    const defaultSystemPrompt = `Você é um assistente especializado em extrair informações de conversas sobre palestras e eventos corporativos.

Analise TODO o histórico fornecido (descrição do lead, NOTAS — todas elas, sem exceção —, e-mails e WhatsApp) e extraia os campos do evento com a MAIOR precisão possível. As notas (especialmente as do tipo "[Texto de Importação]") e os e-mails costumam conter o briefing completo: cliente, evento, data, local, horário, PÚBLICO-ALVO (perfil, setor, cargos), expectativas e observações fiscais. Use TUDO. Não invente: se algum dado não estiver no contexto, use os valores padrão indicados no schema da ferramenta.

Regras:
- "companyName": empresa que está pedindo o orçamento (ex.: agência como "Oroboro Entertainment").
- "endClient": cliente final/anunciante quando o solicitante é uma agência (ex.: "Nubank"). Se não houver, retorne string vazia.
- "eventName": nome do evento (ex.: "Ops BR Day"). String vazia se não houver.
- "lectureTitle": tema/título da palestra. Se não houver título claro, use "O Futuro da Inteligência".
- "audience": perfil do público (ex.: "Executivos e líderes do setor financeiro", "Equipe de operações de e-commerce"). Seja específico ao setor quando o contexto permitir. Padrão: "Executivos e líderes".
- "audienceSize": quantidade de pessoas como número inteiro. 0 se não houver.
- "location": cidade/estado e/ou nome do venue. "Remoto" para online. "A definir" se não houver.
- "date": data do evento no formato DD/MM/AAAA quando possível, senão texto livre. "A confirmar" se não houver.
- "time": horário ex.: "16h30". "A combinar" se não houver.
- "duration": duração da palestra. Padrão "1h30min".
- "observations": observações relevantes (nota fiscal, comissões, produção, logística, etc.) em texto curto. String vazia se não houver.
- "suggestedTopics": EXATAMENTE 5 tópicos CURTOS (máx. 10 palavras cada), altamente relevantes para o público-alvo e o SETOR do cliente final. Foco obrigatório em PRODUTIVIDADE e INTELIGÊNCIA ARTIFICIAL APLICADA àquele setor específico. Antes de propor, mapeie mentalmente as principais dores conhecidas do setor (eficiência operacional, automação, custos, escala, atendimento, decisão baseada em dados, etc.) e proponha tópicos que ataquem essas dores com IA. Evite tópicos genéricos como "Introdução à IA" — seja específico ao setor identificado nas notas/conversas.`;

    // Template "16" — proposal briefing (distinct from "12" used by followup-engine)
    const systemPrompt = await getPrompt("16", defaultSystemPrompt);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: conversationText },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "structure_proposal_briefing",
              description: "Retorna os campos estruturados do briefing da proposta extraídos do contexto.",
              parameters: {
                type: "object",
                properties: {
                  eventDetails: {
                    type: "object",
                    properties: {
                      companyName: { type: "string" },
                      endClient: { type: "string" },
                      eventName: { type: "string" },
                      lectureTitle: { type: "string" },
                      audience: { type: "string" },
                      audienceSize: { type: "integer" },
                      location: { type: "string" },
                      date: { type: "string" },
                      time: { type: "string" },
                      duration: { type: "string" },
                      observations: { type: "string" },
                    },
                    required: [
                      "companyName",
                      "endClient",
                      "eventName",
                      "lectureTitle",
                      "audience",
                      "audienceSize",
                      "location",
                      "date",
                      "time",
                      "duration",
                      "observations",
                    ],
                    additionalProperties: false,
                  },
                  suggestedTopics: {
                    type: "array",
                    description: "EXATAMENTE 5 tópicos curtos (máx 10 palavras) sobre produtividade + IA aplicada ao setor do cliente. NUNCA retornar menos de 5.",
                    items: { type: "string", minLength: 5 },
                    minItems: 5,
                    maxItems: 5,
                  },
                },
                required: ["eventDetails", "suggestedTopics"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "structure_proposal_briefing" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI processing failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    const rawArgs = toolCall?.function?.arguments;

    console.log("AI tool args:", rawArgs);

    // Parse tool call arguments (always JSON, no markdown stripping needed)
    let parsedContent: any;
    try {
      parsedContent = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
      if (!parsedContent?.eventDetails) throw new Error("missing eventDetails");
    } catch (parseError) {
      console.error("Error parsing AI tool call:", parseError);
      parsedContent = {
        eventDetails: {
          companyName: lead.name,
          endClient: "",
          eventName: "",
          lectureTitle: "O Futuro da Inteligência",
          audience: "Executivos e líderes",
          audienceSize: 0,
          location: "A definir",
          date: "A confirmar",
          time: "A combinar",
          duration: "1h30min",
          observations: "",
        },
        suggestedTopics: [
          "Introdução à Inteligência Artificial e seu impacto no mundo corporativo",
          "Casos práticos de aplicação de IA em diferentes setores",
          "Demonstrações ao vivo de ferramentas de IA generativa",
          "Como implementar IA de forma estratégica na sua empresa",
          "Tendências e o futuro da IA nos próximos anos",
          "Sessão de perguntas e respostas",
        ],
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        leadName: lead.name,
        eventDetails: parsedContent.eventDetails,
        suggestedTopics: parsedContent.suggestedTopics,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-proposal-content:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
