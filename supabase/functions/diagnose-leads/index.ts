import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPrompt } from "../_shared/get-prompt.ts";
import { applyProbabilityGuardrails, hasRecentClientPriceCommitment } from "../_shared/sales-signals.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Lead {
  id: string;
  name: string;
  email: string;
  emails?: string[];
  phones?: string[];
  description?: string | null;
  valor?: number | null;
  moeda?: string | null;
  produto?: string | null;
  publicidade_subtipo?: string | null;
  status?: string | null;
  origem?: string | null;
  valor_manually_edited?: boolean | null;
  created_at: string;
  updated_at?: string;
  last_interaction?: string;
}

interface LeadNote {
  note: string;
  created_at: string;
}

interface WhatsAppMessage {
  message: string | null;
  direction: string;
  timestamp: string | null;
  created_at: string;
}

interface EmailMessage {
  subject?: string;
  message: string | null;
  direction: string;
  timestamp: string;
  raw_data?: Record<string, unknown> | null;
}

const CLOSING_PROBABILITY_CALIBRATION = `
REGRAS NÃO NEGOCIÁVEIS PARA A CHANCE DE FECHAMENTO:
1. Ignore a chance, o diagnóstico e o status já gravados no CRM. Recalcule do zero usando somente mensagens, notas factuais e datas.
2. Identifique quem propôs o valor. Preço enviado apenas por Miguel/Susan e ainda não aceito não é orçamento do cliente e, sozinho, não justifica mais de 55%.
3. Diferencie rigorosamente:
   - pedido genérico de rate card, sem budget: 25–45%;
   - proposta nossa sem resposta/aceite: 20–55%, conforme recência e engajamento;
   - objeção “caro/acima do budget” sem contraproposta: 15–40%;
   - cifra/contraproposta concreta trazida pelo cliente: 68–82%;
   - cliente afirma que uma cifra concreta é justa, aceitável ou faz sentido e está buscando aprovação: 78–88%;
   - aceite explícito, termos essenciais alinhados, aguardando contrato/pagamento: 86–95%.
4. “Preciso de aprovação interna” reduz a chance em relação a um aceite final, mas não apaga o forte sinal de o cliente ter defendido um valor concreto.
5. Permuta, produto grátis e comissão de afiliado não são fee publicitário. Não registre como valor de receita.
6. Não confunda quantidade de plataformas com quantidade de peças. Cross-post da mesma peça continua sendo uma peça até o briefing dizer o contrário.
7. Se não há mensagens na Susan, mas há nota factual de que Miguel respondeu pelo Outlook, declare o histórico incompleto. Não invente silêncio, recusa ou ausência de interação.
8. Fundamente a nota citando: quem propôs o valor, último avanço comercial, quem deve responder agora, recência, número de follow-ups sem resposta e bloqueio restante.
9. Não use números terminados sempre em 0 ou 5 por conveniência. Escolha a probabilidade que represente a evidência relativa e permita ordenar o pipeline.
10. A nota mede chance de virar receita paga desta oportunidade específica — não simpatia do contato nem chance de receber uma resposta.
11. Convite de marketplace/curadoria (“seu perfil pode ser o match”, “candidate-se no portal”) não é seleção final nem negociação. Sem candidatura e aprovação: normalmente 5–25%, mesmo que o portal mostre cachê. Suba a nota somente após candidatura aceita/seleção/contato individual.
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if a specific leadId was provided
    let specificLeadId: string | null = null;
    let filter: { status?: string[]; produto?: string } | null = null;
    try {
      const body = await req.json();
      specificLeadId = body.leadId || null;
      filter = body.filter || null;
    } catch {
      // No body or invalid JSON - process all leads
    }

    let leads: Lead[] = [];

    if (specificLeadId) {
      console.log(`Diagnóstico individual para lead: ${specificLeadId}`);
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", specificLeadId)
        .single();

      if (error) {
        throw new Error(`Erro ao buscar lead: ${error.message}`);
      }
      leads = data ? [data] : [];
    } else if (filter) {
      console.log(`Diagnóstico com filtro:`, filter);
      let query = supabase.from("leads").select("*");
      if (filter.status && filter.status.length > 0) {
        query = query.in("status", filter.status);
      }
      if (filter.produto) {
        query = query.eq("produto", filter.produto);
      }
      const { data, error: filterError } = await query;
      if (filterError) {
        throw new Error(`Erro ao buscar leads com filtro: ${filterError.message}`);
      }
      leads = data || [];
    } else {
      const { data, error: leadsError } = await supabase
        .from("leads")
        .select("*")
        .in("status", ["em_aberto", "em_negociacao"])
        .eq("archived", false)
        .eq("unclassified", false);

      if (leadsError) {
        throw new Error(`Erro ao buscar leads: ${leadsError.message}`);
      }
      leads = data || [];
    }

    console.log(`Encontrados ${leads.length} leads para diagnóstico`);

    const results: Array<{ leadId: string; name: string; probability: number; success: boolean; error?: string }> = [];

    // Um lead por vez fazia o rediagnóstico de todo o pipeline ultrapassar a
    // janela do cron. Cinco em paralelo mantém pressão moderada na API e faz a
    // atualização diária terminar dentro da execução agendada.
    const concurrency = 5;
    for (let start = 0; start < (leads || []).length; start += concurrency) {
      const batch = leads.slice(start, start + concurrency);
      await Promise.all(batch.map(async (lead) => {
      try {
        console.log(`Processando lead: ${lead.name} (${lead.id})`);

        const { data: notes } = await supabase
          .from("lead_notes")
          .select("note, created_at")
          .eq("lead_id", lead.id)
          .order("created_at", { ascending: true });

        const { data: whatsappMessages } = await supabase
          .from("whatsapp_messages")
          .select("message, direction, timestamp, created_at")
          .eq("lead_id", lead.id)
          .order("created_at", { ascending: true });

        let { data: emailMessages } = await supabase
          .from("email_messages")
          .select("subject, message, direction, timestamp, raw_data")
          .eq("lead_id", lead.id)
          .order("timestamp", { ascending: true });

        // (Integração com Outlook removida — o histórico vem apenas do CRM.)


        const customerEmails = (emailMessages || []).filter((message) => message.raw_data?.internal_handoff !== true);
        const stats = computeEngagementStats(lead, whatsappMessages || [], customerEmails);
        const context = buildLeadContext(lead, notes || [], whatsappMessages || [], customerEmails) + buildStatsSection(stats);

        const diagnosis = await getDiagnosis(lovableApiKey, context);

        // Trava determinística anti-otimismo: lead que sumiu não pode ter
        // probabilidade alta, por mais animado que o histórico pareça.
        diagnosis.probability = applyProbabilityGuardrails(diagnosis.probability, stats);

        const updateData: any = {
          ai_diagnosis: diagnosis.diagnosis,
          ai_close_probability: diagnosis.probability,
          ai_next_step: diagnosis.nextStep,
          ai_diagnosis_reason: diagnosis.reason,
          ai_diagnosis_updated_at: new Date().toISOString(),
        };
        if (diagnosis.produto && !lead.produto) {
          updateData.produto = diagnosis.produto;
        }
        const effectiveProduto = updateData.produto || lead.produto;
        // Subtipo/quantidade de publicidade evoluem ao longo da negociação
        // ("1 vídeo" vira "2 longos + 4 shorts") — o rediagnóstico mantém
        // ambos atualizados a partir das mensagens mais recentes.
        if (effectiveProduto === 'publicidade') {
          if (diagnosis.publicidade_subtipo) {
            updateData.publicidade_subtipo = diagnosis.publicidade_subtipo;
          }
          if (diagnosis.publicidade_quantidade > 0) {
            updateData.publicidade_quantidade = diagnosis.publicidade_quantidade;
          }
        }
        if (diagnosis.valor > 0 && !lead.valor_manually_edited) {
          updateData.valor = diagnosis.valor;
          if (diagnosis.moeda) {
            updateData.moeda = diagnosis.moeda;
          }
        }
        const { error: updateError } = await supabase
          .from("leads")
          .update(updateData)
          .eq("id", lead.id);

        if (updateError) {
          throw new Error(`Erro ao atualizar lead: ${updateError.message}`);
        }

        // Snapshot histórico do diagnóstico: sem isso cada rediagnóstico
        // sobrescreve o anterior e perdemos a série temporal — que é a base
        // para calibrar previsibilidade (probabilidade prevista × desfecho real).
        try {
          await supabase.from("activity_log").insert({
            lead_id: lead.id,
            activity_type: "diagnosis_created",
            description: `Diagnóstico IA: ${diagnosis.probability}% de chance de fechar`,
            source: "automation:diagnose-leads",
            actor: "susan",
            metadata: {
              probability: diagnosis.probability,
              previous_probability: (lead as any).ai_close_probability ?? null,
              status: lead.status || null,
              produto: effectiveProduto || null,
              publicidade_subtipo: updateData.publicidade_subtipo || lead.publicidade_subtipo || null,
              publicidade_quantidade: updateData.publicidade_quantidade || null,
              valor: updateData.valor ?? lead.valor ?? null,
              moeda: updateData.moeda ?? lead.moeda ?? null,
            },
          });
        } catch (logErr) {
          console.error("Falha ao registrar snapshot do diagnóstico (não fatal):", logErr);
        }

        results.push({
          leadId: lead.id,
          name: lead.name,
          probability: diagnosis.probability,
          success: true,
        });

        console.log(`Lead ${lead.name} diagnosticado: ${diagnosis.probability}% chance de fechar`);
      } catch (error: any) {
        console.error(`Erro ao processar lead ${lead.id}:`, error);
        results.push({
          leadId: lead.id,
          name: lead.name,
          probability: 0,
          success: false,
          error: error.message,
        });
      }
      }));
    }

    results.sort((a, b) => b.probability - a.probability);

    return new Response(
      JSON.stringify({
        success: true,
        totalProcessed: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Erro no diagnóstico:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

interface EngagementStats {
  inboundCount: number;
  outboundCount: number;
  daysSinceLastInbound: number | null;
  daysSinceLastOutbound: number | null;
  consecutiveUnansweredOutbound: number;
  ballInOurCourt: boolean; // última mensagem é do cliente (devemos resposta)
  avgClientResponseHours: number | null;
  daysSinceCreated: number;
  recentClientPriceCommitment: boolean;
  hasExternalCampaignEvidence: boolean;
}

function computeEngagementStats(
  lead: Lead,
  whatsappMessages: WhatsAppMessage[],
  emailMessages: EmailMessage[]
): EngagementStats {
  const DAY = 24 * 60 * 60 * 1000;
  const all = [
    ...whatsappMessages.map((m) => ({ direction: m.direction, ts: Date.parse(m.timestamp || m.created_at) })),
    ...emailMessages.map((m) => ({ direction: m.direction, ts: Date.parse(m.timestamp) })),
  ]
    .filter((m) => !Number.isNaN(m.ts))
    .sort((a, b) => a.ts - b.ts);

  const inbound = all.filter((m) => m.direction === "inbound");
  const outbound = all.filter((m) => m.direction === "outbound");
  const lastInbound = inbound.length ? inbound[inbound.length - 1].ts : null;
  const lastOutbound = outbound.length ? outbound[outbound.length - 1].ts : null;

  let consecutiveUnanswered = 0;
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].direction === "outbound") consecutiveUnanswered++;
    else break;
  }

  // Tempo médio de resposta do cliente (outbound → primeira inbound seguinte)
  const responseTimes: number[] = [];
  for (let i = 0; i < all.length - 1; i++) {
    if (all[i].direction === "outbound" && all[i + 1].direction === "inbound") {
      responseTimes.push((all[i + 1].ts - all[i].ts) / (60 * 60 * 1000));
    }
  }
  const avgResp = responseTimes.length
    ? responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length
    : null;

  const recentInboundMessages = [
    ...whatsappMessages
      .filter((m) => m.direction === "inbound")
      .map((m) => ({ text: m.message || "", ts: Date.parse(m.timestamp || m.created_at) })),
    ...emailMessages
      .filter((m) => m.direction === "inbound")
      .map((m) => ({ text: `${m.subject || ""}\n${m.message || ""}`, ts: Date.parse(m.timestamp) })),
  ];
  const recentClientPriceCommitment = hasRecentClientPriceCommitment(
    recentInboundMessages.map((message) => ({ text: message.text, timestamp: message.ts })),
  );

  return {
    inboundCount: inbound.length,
    outboundCount: outbound.length,
    daysSinceLastInbound: lastInbound ? (Date.now() - lastInbound) / DAY : null,
    daysSinceLastOutbound: lastOutbound ? (Date.now() - lastOutbound) / DAY : null,
    consecutiveUnansweredOutbound: consecutiveUnanswered,
    ballInOurCourt: lastInbound !== null && (lastOutbound === null || lastInbound > lastOutbound),
    avgClientResponseHours: avgResp,
    daysSinceCreated: (Date.now() - Date.parse(lead.created_at)) / DAY,
    recentClientPriceCommitment,
    hasExternalCampaignEvidence: lead.origem === "outlook-campaign-platform",
  };
}

function buildStatsSection(s: EngagementStats): string {
  let out = `\n## Sinais Quantitativos (calculados pelo sistema — use como âncora da probabilidade)\n`;
  out += `- Mensagens recebidas do cliente: ${s.inboundCount}\n`;
  out += `- Mensagens enviadas por nós: ${s.outboundCount}\n`;
  out += `- Dias desde a última mensagem DO CLIENTE: ${s.daysSinceLastInbound !== null ? s.daysSinceLastInbound.toFixed(1) : "nunca respondeu"}\n`;
  out += `- Dias desde a nossa última mensagem: ${s.daysSinceLastOutbound !== null ? s.daysSinceLastOutbound.toFixed(1) : "nunca enviamos"}\n`;
  out += `- Nossas mensagens consecutivas SEM resposta do cliente: ${s.consecutiveUnansweredOutbound}\n`;
  out += `- Última mensagem é do cliente (bola conosco): ${s.ballInOurCourt ? "SIM — cliente aguarda nossa resposta" : "não"}\n`;
  if (s.avgClientResponseHours !== null) {
    out += `- Tempo médio de resposta do cliente: ${s.avgClientResponseHours.toFixed(1)}h\n`;
  }
  out += `- Idade do lead: ${s.daysSinceCreated.toFixed(0)} dias\n`;
  out += `- Cliente propôs/validou um valor concreto nos últimos 10 dias: ${s.recentClientPriceCommitment ? "SIM" : "não"}\n`;
  out += `- Evidência importada de portal/curadoria externa: ${s.hasExternalCampaignEvidence ? "SIM — não confundir curadoria com seleção final" : "não"}\n`;
  return out;
}


function buildLeadContext(
  lead: Lead,
  notes: LeadNote[],
  whatsappMessages: WhatsAppMessage[],
  emailMessages: EmailMessage[]
): string {
  let context = `# Lead: ${lead.name}\n\n`;

  context += `## Informações Básicas\n`;
  context += `- Email: ${lead.email || "Não informado"}\n`;
  context += `- Telefones: ${lead.phones?.join(", ") || "Não informado"}\n`;
  context += `- Produto de interesse: ${lead.produto || "Não identificado"}\n`;
  if (lead.produto === 'publicidade') {
    context += `- Subtipo publicidade: ${lead.publicidade_subtipo || "Não identificado"}\n`;
  }
  context += `- Valor estimado: ${lead.moeda || "BRL"} ${lead.valor?.toLocaleString("pt-BR") || "Não definido"}\n`;
  context += `- Status atual: ${lead.status || "Em aberto"}\n`;
  context += `- Criado em: ${new Date(lead.created_at).toLocaleDateString("pt-BR")}\n`;
  if (lead.description) {
    context += `- Descrição: ${lead.description}\n`;
  }
  context += "\n";

  if (notes.length > 0) {
    context += `## Notas (${notes.length})\n`;
    notes.forEach((note, i) => {
      const date = new Date(note.created_at).toLocaleDateString("pt-BR");
      context += `### Nota ${i + 1} (${date}):\n${note.note}\n\n`;
    });
  }

  if (whatsappMessages.length > 0) {
    context += `## Mensagens WhatsApp (${whatsappMessages.length})\n`;
    context += `> Nota: "Miguel (nós)" são mensagens enviadas por nós (o vendedor). "Cliente (lead)" são mensagens recebidas do prospect/cliente.\n\n`;
    const recentMessages = whatsappMessages.slice(-30);
    recentMessages.forEach((msg) => {
      const date = msg.timestamp
        ? new Date(msg.timestamp).toLocaleString("pt-BR")
        : new Date(msg.created_at).toLocaleString("pt-BR");
      const sender = msg.direction === "inbound" ? "Cliente (lead)" : "Miguel (nós)";
      context += `[${date}] ${sender}: ${msg.message || "(sem texto)"}\n`;
    });
    context += "\n";
  }

  if (emailMessages.length > 0) {
    context += `## Emails (${emailMessages.length})\n`;
    context += `> Nota: "Miguel (nós)" são emails enviados por nós (o vendedor). "Cliente (lead)" são emails recebidos do prospect/cliente.\n\n`;
    const recentEmails = emailMessages.slice(-20);
    recentEmails.forEach((email) => {
      const date = new Date(email.timestamp).toLocaleString("pt-BR");
      const sender = email.direction === "inbound" ? "Cliente (lead)" : "Miguel (nós)";
      const subject = email.subject ? `[${email.subject}] ` : "";
      const messageContent = email.message || "(sem conteúdo)";
      context += `[${date}] ${sender}: ${subject}${messageContent}\n---\n`;
    });
    context += "\n";
  }

  return context;
}

async function getDiagnosis(
  apiKey: string,
  context: string
): Promise<{
  diagnosis: string;
  probability: number;
  nextStep: string;
  reason: string;
  produto: string;
  publicidade_subtipo: string;
  publicidade_quantidade: number;
  valor: number;
  moeda: string;
}> {
  const defaultPrompt = `Você é um especialista em vendas B2B com foco em palestras, consultorias, mentorias e treinamentos corporativos.

Sua tarefa é analisar todas as informações de um lead e fornecer:
1. Um diagnóstico geral da situação do lead
2. A probabilidade de fechamento (0-100%)
3. O próximo passo concreto para avançar a venda
4. A justificativa para a nota de probabilidade

Considere os seguintes fatores para avaliar a probabilidade:
- Interesse demonstrado (perguntas sobre preço, datas, disponibilidade = positivo)
- Engajamento nas conversas (respostas rápidas, perguntas detalhadas = positivo)
- Objeções levantadas (preço alto, timing ruim, precisa de aprovação = negativo)
- Tempo desde o primeiro contato (muito tempo sem avanço = negativo)
- Clareza sobre o que querem (sabem exatamente o que precisam = positivo)
- Poder de decisão (é o decisor ou precisa aprovar com outros = impacta probabilidade)
- Orçamento definido (tem verba aprovada = muito positivo)
- Cliente propôs uma cifra concreta ou afirmou que o preço é justo/faz sentido e está buscando aprovação = negociação real, mínimo 78% enquanto essa mensagem tiver até 10 dias
- Urgência (precisa para data específica = positivo)

Seja realista e objetivo. Use a seção "Sinais Quantitativos" como âncora — o silêncio do cliente vale mais que o entusiasmo antigo da conversa.

RÉGUA DE CALIBRAÇÃO (obrigatória):
- 0-10%: cliente nunca respondeu, recusou, ou sumiu há 30+ dias apesar de vários follow-ups
- 11-25%: houve interesse, mas cliente está em silêncio há 2+ semanas com 3+ mensagens nossas sem resposta
- 26-45%: conversa morna — cliente responde devagar, sem urgência nem orçamento claro
- 46-65%: conversa ativa — cliente respondeu na última semana, fez perguntas concretas (preço, datas, formato)
- 66-85%: negociação real — proposta em discussão, objeções tratáveis, cliente engajado e respondendo rápido
- 86-100%: praticamente fechado — acordo verbal, aguardando contrato/pagamento/agenda

REGRAS DE DECAIMENTO (obrigatórias):
- Cada semana de silêncio do cliente derruba a probabilidade — entusiasmo de 1 mês atrás NÃO sustenta nota alta hoje
- 3+ mensagens nossas consecutivas sem resposta = máximo 25%, mesmo que a conversa anterior fosse ótima
- Se a última mensagem é DO CLIENTE (bola conosco), a probabilidade NÃO deve ser penalizada por tempo — o atraso é nosso, não dele.`;

  const customOrDefaultPrompt = await getPrompt("14", defaultPrompt);
  // A calibração crítica é anexada mesmo quando existe prompt customizado no
  // banco; caso contrário um template antigo volta a introduzir o erro.
  const systemPrompt = `${customOrDefaultPrompt}\n\n${CLOSING_PROBABILITY_CALIBRATION}`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analise este lead e forneça o diagnóstico:\n\n${context}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "provide_lead_diagnosis",
            description: "Fornecer diagnóstico completo do lead com probabilidade de fechamento",
            parameters: {
              type: "object",
              properties: {
                diagnosis: {
                  type: "string",
                  description: "Diagnóstico geral da situação do lead em 2-3 frases",
                },
                probability: {
                  type: "integer",
                  description: "Probabilidade de fechamento de 0 a 100",
                  minimum: 0,
                  maximum: 100,
                },
                nextStep: {
                  type: "string",
                  description: "Próximo passo concreto e acionável para avançar a venda",
                },
                reason: {
                  type: "string",
                  description: "Justificativa para a nota de probabilidade atribuída",
                },
                produto: {
                  type: "string",
                  enum: ["palestra", "consultoria", "mentoria", "treinamento", "publicidade", "documentario", ""],
                  description: "Tipo de produto/serviço que o lead pretende contratar. Use apenas os valores permitidos: palestra, consultoria, mentoria, treinamento, publicidade. Se não souber, use string vazia.",
                },
                publicidade_subtipo: {
                  type: "string",
                  enum: ["longo", "curto", "insercao", "longo_curto", "linkedin", "newsletter", ""],
                  description: "Apenas para leads de publicidade — o FORMATO combinado (releia as mensagens mais recentes, o formato muda ao longo da negociação). Mapeamento: 'longo' = vídeo dedicado/review no YouTube; 'curto' = Reels/TikTok/Shorts/vídeo curto; 'insercao' = inserção/integração/menção dentro de vídeo existente do canal; 'longo_curto' = pacote com vídeo longo E curtos juntos; 'linkedin' = post no LinkedIn; 'newsletter' = menção em newsletter. Termos em inglês: 'dedicated video'/'integration video' = longo; 'short-form'/'reel' = curto; 'integration'/'mention'/'ad read' = insercao. Se o formato ainda não foi discutido ou não for publicidade, use string vazia.",
                },
                publicidade_quantidade: {
                  type: "integer",
                  description: "Apenas para publicidade: número TOTAL de peças combinadas (ex.: '2 vídeos dedicados + 4 shorts' = 6; '1 inserção' = 1). Use o acordo mais RECENTE nas mensagens. 0 se não definido ou não for publicidade.",
                },
                valor: {
                  type: "number",
                  description: "Valor monetário identificado na conversa. Apenas o número, sem símbolo de moeda. Se não mencionado, use 0.",
                },
                moeda: {
                  type: "string",
                  enum: ["BRL", "USD", "EUR", ""],
                  description: "Moeda do valor identificado. BRL para reais, USD para dólares, EUR para euros. Se não souber, use string vazia.",
                },
              },
              required: ["diagnosis", "probability", "nextStep", "reason", "produto", "publicidade_subtipo", "publicidade_quantidade", "valor", "moeda"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "provide_lead_diagnosis" } },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Erro na API:", response.status, errorText);
    throw new Error(`Erro na API de IA: ${response.status}`);
  }

  const data = await response.json();
  console.log("finish_reason:", data.choices?.[0]?.finish_reason);

  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

  // Fallback: se não houver tool_call, tenta extrair JSON do conteúdo textual
  let args: any;
  if (toolCall) {
    args = JSON.parse(toolCall.function.arguments);
  } else {
    const textContent = data.choices?.[0]?.message?.content || "";
    console.warn("Tool call ausente. Conteúdo:", textContent.substring(0, 500));
    const jsonMatch = textContent.match(/```json\s*([\s\S]*?)```/) || textContent.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) {
      throw new Error("Resposta da IA não contém tool call nem JSON parseável");
    }
    try {
      args = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    } catch {
      throw new Error("Resposta da IA não pôde ser parseada como JSON");
    }
  }

  const validProdutos = ['palestra', 'consultoria', 'mentoria', 'treinamento', 'publicidade', 'documentario'];
  const rawProduto = (args.produto || '').toLowerCase().trim();
  const produto = validProdutos.includes(rawProduto) ? rawProduto : '';

  const validSubtipos = ['longo', 'curto', 'insercao', 'longo_curto', 'linkedin', 'newsletter'];
  const rawSubtipo = (args.publicidade_subtipo || '').toLowerCase().trim();
  const publicidade_subtipo = validSubtipos.includes(rawSubtipo) ? rawSubtipo : '';
  const publicidade_quantidade =
    typeof args.publicidade_quantidade === 'number' && args.publicidade_quantidade > 0
      ? Math.round(args.publicidade_quantidade)
      : 0;

  const validMoedas = ['BRL', 'USD', 'EUR'];
  const rawMoeda = (args.moeda || '').toUpperCase().trim();
  const moeda = validMoedas.includes(rawMoeda) ? rawMoeda : '';
  const valor = typeof args.valor === 'number' && args.valor > 0 ? args.valor : 0;

  return {
    diagnosis: args.diagnosis || "Sem diagnóstico disponível",
    probability: Math.min(100, Math.max(0, parseInt(args.probability) || 0)),
    nextStep: args.nextStep || "Revisar manualmente",
    reason: args.reason || "Sem justificativa",
    produto,
    publicidade_subtipo,
    publicidade_quantidade,
    valor,
    moeda,
  };
}
