import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STATUS_CONTEXT: Record<string, string> = {
  em_aberto: "Lead em aberto — ainda não houve negociação formal. O objetivo é qualificar e iniciar negociação.",
  em_negociacao: "Lead em negociação — já há interesse mútuo, o objetivo é fechar o negócio.",
  ganho: "Negócio GANHO — o cliente já fechou, mas a produção do conteúdo/serviço ainda NÃO foi iniciada. Próximo passo natural: iniciar produção (roteirização, briefing, agendamento). Também avaliar cobranças pendentes.",
  produzido: "Negócio PRODUZIDO — o conteúdo/serviço já foi produzido/entregue. Verificar se o pagamento foi feito. Se não foi pago, cobrar. Se foi pago, verificar se há oportunidade de upsell ou novo projeto.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lead } = await req.json();
    if (!lead) throw new Error("Lead data is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all context in parallel
    const [recentActionsRes, whatsappRes, emailsRes, notesRes] = await Promise.all([
      supabase
        .from("worker_actions")
        .select("action_type, action_label, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("whatsapp_messages")
        .select("message, direction, timestamp")
        .eq("lead_id", lead.id)
        .order("timestamp", { ascending: false })
        .limit(10),
      supabase
        .from("email_messages")
        .select("subject, message, direction, timestamp")
        .eq("lead_id", lead.id)
        .order("timestamp", { ascending: false })
        .limit(10),
      supabase
        .from("lead_notes")
        .select("note, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const recentActions = recentActionsRes.data || [];
    const lastWhatsapp = whatsappRes.data || [];
    const lastEmails = emailsRes.data || [];
    const notes = notesRes.data || [];

    const hasPhone = !!(lead.phone || (lead.phones && lead.phones.length > 0));
    const hasWhatsappHistory = lastWhatsapp.length > 0;
    const hasEmailHistory = lastEmails.length > 0;
    const statusContext = STATUS_CONTEXT[lead.status || "em_aberto"] || "";

    const actionsLog = recentActions.length
      ? `Ações já realizadas pelo operador:\n${recentActions.map(a => `- ${a.action_label} (${new Date(a.created_at).toLocaleDateString('pt-BR')})`).join('\n')}`
      : "Nenhuma ação registrada ainda pelo operador.";

    const messagesContext = [
      ...(lastWhatsapp).map(m => `[WhatsApp ${m.direction === 'inbound' ? 'Cliente' : 'Miguel'}] ${m.message?.substring(0, 300)}`),
      ...(lastEmails).map(m => `[Email ${m.direction === 'inbound' ? 'Cliente' : 'Miguel'}] ${m.subject}: ${m.message?.substring(0, 300)}`),
    ].join('\n');

    const notesContext = notes.length
      ? `Notas internas:\n${notes.map(n => `- (${new Date(n.created_at).toLocaleDateString('pt-BR')}) ${n.note.substring(0, 200)}`).join('\n')}`
      : "";

    // Calculate days since last interaction
    const lastInteraction = Math.max(
      new Date(lead.last_inbound_message_at || 0).getTime(),
      new Date(lead.last_outbound_message_at || 0).getTime()
    );
    const daysSinceInteraction = lastInteraction > 0
      ? Math.floor((Date.now() - lastInteraction) / (1000 * 60 * 60 * 24))
      : null;

    const valorPendente = (lead.valor || 0) - (lead.valor_pago || 0);

    const prompt = `Você é Susan, assistente executiva de Miguel Fernandes. Analise este lead e sugira as 3-5 ações mais importantes a tomar AGORA.

## CONTEXTO DO STATUS
${statusContext}

## INFORMAÇÕES DO LEAD
- Nome: ${lead.name}
- Status: ${lead.status || 'em_aberto'}
- Produto: ${lead.produto || 'não definido'}${lead.publicidade_subtipo ? ` (${lead.publicidade_subtipo})` : ''}
- Valor total: ${lead.valor ? `${lead.moeda || 'BRL'} ${lead.valor}` : 'não definido'}
- Valor pago: ${lead.valor_pago ? `${lead.moeda || 'BRL'} ${lead.valor_pago}` : 'nada pago'}
- Valor pendente: ${valorPendente > 0 ? `${lead.moeda || 'BRL'} ${valorPendente}` : 'nenhum'}
- Probabilidade de fechar: ${lead.ai_close_probability != null ? `${lead.ai_close_probability}%` : 'não avaliada'}
- Diagnóstico IA: ${lead.ai_diagnosis || 'sem diagnóstico'}
- Próximo passo sugerido: ${lead.ai_next_step || 'não definido'}
- Descrição: ${lead.description || 'sem descrição'}
- Recorrente: ${lead.is_recurring ? 'Sim' : 'Não'}

## CANAIS DISPONÍVEIS
- Tem telefone cadastrado: ${hasPhone ? 'Sim' : 'NÃO — NÃO sugerir WhatsApp ou ligação'}
- Tem histórico WhatsApp: ${hasWhatsappHistory ? 'Sim' : 'NÃO — nunca trocaram WhatsApp'}
- Tem histórico Email: ${hasEmailHistory ? 'Sim' : 'Não'}
- Email: ${lead.email || 'não tem'}

## TIMING
- Dias desde última interação: ${daysSinceInteraction !== null ? `${daysSinceInteraction} dias` : 'sem interações registradas'}
- Última msg recebida: ${lead.last_inbound_message_at ? new Date(lead.last_inbound_message_at).toLocaleDateString('pt-BR') : 'nunca'}
- Última msg enviada: ${lead.last_outbound_message_at ? new Date(lead.last_outbound_message_at).toLocaleDateString('pt-BR') : 'nunca'}
- Proposta enviada: ${lead.proposal_sent_at ? `Sim (${new Date(lead.proposal_sent_at).toLocaleDateString('pt-BR')})` : 'Não'}
- Proposta visualizada: ${lead.proposal_view_count || 0} vezes

${actionsLog}

${notesContext}

Últimas mensagens trocadas:
${messagesContext || 'Sem mensagens recentes.'}

## REGRAS IMPORTANTES
1. NÃO sugira WhatsApp ou ligação se o lead NÃO tem telefone cadastrado.
2. Para leads com status "ganho", foque em iniciar produção (roteiro, briefing, agendamento).
3. Para leads com status "produzido", foque em cobranças e follow-up de pagamento se houver valor pendente.
4. Considere há quanto tempo o lead está parado — leads parados há muito tempo merecem ação urgente.
5. Se o valor é alto e está parado, sugira cobrar ou renegociar.`;

    const availableActions = [
      "followup_whatsapp",
      "followup_email",
      "send_proposal",
      "wait",
      "research",
      "call",
      "update_status",
      "start_production",
      "collect_payment",
      "schedule_meeting",
      "send_briefing",
      "custom",
    ];

    // Filter out phone-dependent actions if no phone
    const filteredActions = hasPhone
      ? availableActions
      : availableActions.filter(a => !["followup_whatsapp", "call"].includes(a));

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você sugere ações práticas e contextuais para avançar negócios. Responda em português. Considere o status do lead (ganho = produzir; produzido = cobrar; negociação = fechar; aberto = qualificar). Nunca sugira canais que o lead não possui." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_actions",
              description: "Retorna ações sugeridas para o lead",
              parameters: {
                type: "object",
                properties: {
                  actions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: {
                          type: "string",
                          enum: filteredActions,
                        },
                        label: { type: "string", description: "Descrição curta da ação (max 60 chars)" },
                        priority: { type: "string", enum: ["high", "medium", "low"] },
                        reasoning: { type: "string", description: "Por que esta ação é importante (1 frase)" },
                      },
                      required: ["type", "label", "priority", "reasoning"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["actions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_actions" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    let actions = [];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      actions = parsed.actions || [];
    }

    // Post-process: remove WhatsApp/call actions if no phone (safety net)
    if (!hasPhone) {
      actions = actions.filter((a: any) => !["followup_whatsapp", "call"].includes(a.type));
    }

    // Fallback if AI returned nothing
    if (!actions.length) {
      const fallback = [];
      if (hasPhone && hasWhatsappHistory) {
        fallback.push({ type: "followup_whatsapp", label: "Enviar follow-up no WhatsApp", priority: "high", reasoning: "Manter contato ativo" });
      }
      if (lead.email) {
        fallback.push({ type: "followup_email", label: "Enviar follow-up por e-mail", priority: "medium", reasoning: "Reforçar por outro canal" });
      }
      if (lead.status === "ganho") {
        fallback.push({ type: "start_production", label: "Iniciar produção do conteúdo", priority: "high", reasoning: "Negócio fechado, iniciar entrega" });
      }
      if (lead.status === "produzido" && valorPendente > 0) {
        fallback.push({ type: "collect_payment", label: "Cobrar pagamento pendente", priority: "high", reasoning: `Valor pendente: ${lead.moeda || 'BRL'} ${valorPendente}` });
      }
      if (!fallback.length) {
        fallback.push({ type: "research", label: "Pesquisar mais sobre o lead", priority: "medium", reasoning: "Entender melhor o contexto" });
      }
      actions = fallback;
    }

    return new Response(JSON.stringify({ actions, recentActions: recentActions || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-worker-actions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
