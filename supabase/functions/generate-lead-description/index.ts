import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { getPrompt } from "../_shared/get-prompt.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { leadId } = await req.json();
    
    if (!leadId) {
      throw new Error('Lead ID is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar informações do lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError) throw leadError;

    // Helpers para últimas N inbound/outbound
    const takeLastByDirection = <T extends { direction?: string | null }>(arr: T[] | null | undefined, n: number) => {
      const inbound = (arr || []).filter(m => m.direction === 'inbound').slice(0, n);
      const outbound = (arr || []).filter(m => m.direction === 'outbound').slice(0, n);
      return [...inbound, ...outbound];
    };

    // Buscar mensagens de email (últimas 3 enviadas + 3 recebidas)
    const { data: emailMessagesAll } = await supabase
      .from('email_messages')
      .select('direction, subject, message, timestamp, created_at')
      .eq('lead_id', leadId)
      .order('timestamp', { ascending: false, nullsFirst: false })
      .limit(20);
    const emailMessages = takeLastByDirection(emailMessagesAll, 3);

    // Resolver variantes de telefone via RPC para buscar WhatsApp por telefone (não por lead_id)
    let phoneVariants: string[] = [];
    const allPhones: string[] = [];
    if (lead.phone) allPhones.push(lead.phone);
    if (Array.isArray(lead.phones)) allPhones.push(...lead.phones);
    for (const p of allPhones) {
      const { data: variants } = await supabase.rpc('whatsapp_phone_variants', { p_phone: p });
      if (Array.isArray(variants)) phoneVariants.push(...variants);
    }
    phoneVariants = Array.from(new Set(phoneVariants.filter(Boolean)));

    let whatsappMessages: any[] = [];
    if (phoneVariants.length > 0) {
      const { data: waAll } = await supabase
        .from('whatsapp_messages')
        .select('direction, message, is_audio, created_at, timestamp')
        .in('phone', phoneVariants)
        .order('created_at', { ascending: false })
        .limit(40);
      whatsappMessages = takeLastByDirection(waAll, 3);
    }

    // Buscar notas do lead
    const { data: leadNotes } = await supabase
      .from('lead_notes')
      .select('note, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true });

    // Buscar pareceres jurídicos dos anexos
    const { data: legalAttachments } = await supabase
      .from('email_attachments')
      .select('filename, legal_analysis, legal_analysis_at')
      .eq('lead_id', leadId)
      .not('legal_analysis', 'is', null);

    // Preparar contexto para a IA
    const emailContext = emailMessages?.map(m => 
      `Email (${m.direction}): ${m.subject || 'Sem assunto'}\n${(m.message || '').replace(/^>.*$/gm, '').replace(/On .+ wrote:/g, '').replace(/De:.*\nEnviado:.*\nPara:.*\nAssunto:.*/g, '').trim()}`
    ).join('\n\n') || 'Nenhum email registrado';

    const whatsappContext = whatsappMessages?.map(m => 
      `WhatsApp (${m.direction}): ${m.is_audio ? `[áudio] ${m.message || ''}` : (m.message || '')}`
    ).join('\n\n') || 'Nenhuma mensagem WhatsApp registrada';

    const notesContext = leadNotes?.map(n => 
      `[${new Date(n.created_at).toLocaleDateString('pt-BR')}] ${n.note}`
    ).join('\n\n') || 'Nenhuma nota registrada';

    const legalContext = (legalAttachments && legalAttachments.length > 0)
      ? legalAttachments.map((a: any) => {
          const la = a.legal_analysis || {};
          return `[Parecer jurídico — ${a.filename}]\nResumo: ${la.summary || ''}\nPontos de atenção: ${(la.attention_points || []).join('; ')}\nValores/condições: ${la.values || la.financial_terms || ''}`;
        }).join('\n\n')
      : 'Nenhum parecer jurídico registrado';


    const defaultPrompt = `Você é um analista comercial experiente. Analise TODAS as informações abaixo (emails, WhatsApp e notas) e extraia dados estruturados do negócio.

CONTEXTO DO LEAD:
- Nome: {leadName}
- Emails: {leadEmails}
- Telefones: {leadPhones}
- Fonte: {leadSource}

Últimas Interações por Email:
{emailContext}

Últimas Interações por WhatsApp:
{whatsappContext}

Notas do Lead (IMPORTANTE - frequentemente contêm detalhes exatos da entrega combinada):
{notesContext}

Pareceres jurídicos de anexos (use para confirmar valores, condições e produto):
{legalContext}

INSTRUÇÕES DE EXTRAÇÃO:

1. DESCRIÇÃO - Escreva uma frase clara e direta que a equipe comercial entenda imediatamente qual é o negócio. Formato:
   "[Nome do cliente] - [O que exatamente precisa ser entregue, com quantidade e tipo]. [Prazo se mencionado]."
   
   EXEMPLOS BONS:
   - "Wery.ai - 2 Reels para TikTok/Shorts + 1 inserção em vídeo do YouTube. Prazo: até 15/04."
   - "FlexClip - 1 vídeo dedicado para YouTube (review do produto). Sem prazo definido."
   - "TechCorp - Palestra sobre IA para evento corporativo em São Paulo, 50 pessoas. Data: 20/05."
   - "StartupXYZ - Consultoria de 4h sobre estratégia de marketing digital."
   
   REGRAS:
   - Seja ESPECÍFICO: diga exatamente o que é (Reels, vídeo longo, inserção, palestra, etc.)
   - Inclua QUANTIDADE quando aplicável (2 Reels, 1 vídeo, 3 Stories)
   - Inclua PRAZO se mencionado em qualquer mensagem ou nota
   - NUNCA mencione valores monetários na descrição
   - Use detalhes das notas e dos pareceres jurídicos — eles são a fonte mais confiável

2. VALOR - Número do valor do negócio (sem formatação). Use SEMPRE o valor mais recente confirmado pelo cliente nas últimas mensagens/notas/pareceres. Null se não mencionado.

3. MOEDA - "USD", "EUR" ou "BRL" (padrão BRL se não especificado).

4. PRODUTO - Exatamente um de: "palestra", "consultoria", "mentoria", "treinamento", "publicidade", "documentario". Null se incerto.

5. SUBTIPO DE PUBLICIDADE (só se produto = publicidade):
   - "longo" = vídeo dedicado YouTube
   - "curto" = Reels/TikTok/Shorts
   - "insercao" = inserção/menção em vídeo existente
   - "longo_curto" = vídeo longo + curtos juntos
   - "linkedin" = post LinkedIn
   - "newsletter" = menção em newsletter

6. QUANTIDADE DE PUBLICIDADE - Total de peças a entregar.

7. FOLLOW-UP para WhatsApp: mensagem curta (2-3 frases), objetiva, focada em fechar o negócio.`;

    const prompt = await getPrompt("13", defaultPrompt, {
      leadName: lead.name,
      leadEmails: lead.emails?.join(', ') || lead.email || '',
      leadPhones: lead.phones?.join(', ') || lead.phone || 'Não registrado',
      leadSource: lead.source || '',
      emailContext,
      whatsappContext,
      notesContext,
      legalContext,
    });

    // Chamar Lovable AI com tool calling
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente especializado em analisar leads e extrair informações estruturadas.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "update_lead_info",
              description: "Atualizar informações do lead com descrição, valor, moeda e produto",
              parameters: {
                type: "object",
                properties: {
                  description: { 
                    type: "string",
                    description: "Frase clara e direta: '[Cliente] - [entrega específica com quantidade e tipo]. [Prazo].' Ex: 'Wery.ai - 2 Reels para TikTok/Shorts + 1 inserção em vídeo do YouTube. Prazo: até 15/04.' NUNCA inclua valores monetários. Use detalhes das notas do lead como fonte prioritária."
                  },
                  valor: { 
                    type: ["number", "null"],
                    description: "Valor estimado do negócio (apenas número, sem formatação ou símbolos de moeda)"
                  },
                  moeda: {
                    type: "string",
                    enum: ["BRL", "USD", "EUR"],
                    description: "Moeda do valor (BRL, USD ou EUR)"
                  },
                  produto: { 
                    type: ["string", "null"],
                    enum: ["palestra", "consultoria", "mentoria", "treinamento", "publicidade", "documentario", null],
                    description: "Tipo de produto/serviço de interesse"
                  },
                  publicidade_subtipo: {
                    type: ["string", "null"],
                    enum: ["longo", "curto", "insercao", "longo_curto", "linkedin", "newsletter", null],
                    description: "Apenas para publicidade. 'longo' = vídeo dedicado YouTube. 'curto' = Reels/TikTok/Shorts. 'insercao' = inserção/menção em vídeo existente. 'longo_curto' = YouTube + Reels/TikTok. 'linkedin' = post LinkedIn. 'newsletter' = menção em newsletter. Null se não for publicidade."
                  },
                  publicidade_quantidade: {
                    type: ["integer", "null"],
                    description: "Quantidade de peças/entregas para publicidade (ex: 3 Reels = 3, 1 vídeo dedicado = 1, 2 inserções = 2). Extraia das mensagens e notas. Null se não for publicidade."
                  },
                  suggested_followup: {
                    type: "string",
                    description: "Sugestão de mensagem de follow-up para WhatsApp: objetiva, curta (2-3 frases), focada em fechar negócio sem reunião, continuando naturalmente a conversa"
                  }
                },
                required: ["description", "valor", "moeda", "produto", "publicidade_subtipo", "publicidade_quantidade", "suggested_followup"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "update_lead_info" } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      throw new Error('Erro ao gerar descrição com IA');
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error('Não foi possível processar as informações do lead');
    }

    const leadInfo = JSON.parse(toolCall.function.arguments);
    console.log('Informações extraídas:', leadInfo);

    // Preparar objeto de atualização
    const updateData: any = {
      description: leadInfo.description,
      produto: leadInfo.produto,
      suggested_followup: leadInfo.suggested_followup,
      description_updated_at: new Date().toISOString()
    };

    // Atualizar subtipo e quantidade de publicidade se aplicável
    if (leadInfo.produto === 'publicidade') {
      if (leadInfo.publicidade_subtipo) {
        updateData.publicidade_subtipo = leadInfo.publicidade_subtipo;
      }
      if (leadInfo.publicidade_quantidade) {
        updateData.publicidade_quantidade = leadInfo.publicidade_quantidade;
      }
    }

    // Só atualizar valor e moeda se não foram editados manualmente
    if (!lead.valor_manually_edited) {
      updateData.valor = leadInfo.valor;
      updateData.moeda = leadInfo.moeda || 'BRL';
    }

    // Atualizar lead com as informações
    const { error: updateError } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', leadId);

    if (updateError) throw updateError;

    // Auto-schedule follow-up for publicidade leads
    if (leadInfo.produto === 'publicidade' && lead.status === 'em_aberto'
        && !lead.unclassified
        && lead.email && !lead.email.includes('@whatsapp.temp')) {
      // First follow-up after 24h (progressive: 24h, 48h, 72h...)
      const nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from('scheduled_followups')
        .upsert({
          lead_id: leadId,
          next_run_at: nextRun,
          attempt_number: 1,
          status: 'pending',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'lead_id' });
      console.log('Auto-scheduled follow-up for publicidade lead:', leadId);
    }

    return new Response(
      JSON.stringify({ 
        description: leadInfo.description,
        valor: leadInfo.valor,
        moeda: leadInfo.moeda || 'BRL',
        produto: leadInfo.produto,
        publicidade_subtipo: leadInfo.publicidade_subtipo || null,
        publicidade_quantidade: leadInfo.publicidade_quantidade || null,
        suggested_followup: leadInfo.suggested_followup
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error generating lead description:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});