import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { extractExternalUrl } from "../_shared/extract-external-url.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DELIVERY_API_URL = "https://ocgxmzerwyyzsokuztnx.supabase.co/functions/v1/create-delivery";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { leadId } = await req.json();
    if (!leadId) {
      return new Response(JSON.stringify({ error: 'leadId é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch lead, notes, emails, whatsapp in parallel
    const [leadRes, notesRes, emailsRes, whatsappRes] = await Promise.all([
      supabase.from('leads').select('*').eq('id', leadId).single(),
      supabase.from('lead_notes').select('note').eq('lead_id', leadId),
      supabase.from('email_messages').select('subject, message, direction, timestamp').eq('lead_id', leadId).order('timestamp', { ascending: true }).limit(30),
      supabase.from('whatsapp_messages').select('message, direction, created_at').eq('lead_id', leadId).order('created_at', { ascending: true }).limit(30),
    ]);

    if (leadRes.error) throw leadRes.error;
    const lead = leadRes.data;

    const notesText = (notesRes.data || []).map((n: any) => n.note).join('\n');
    const emailsText = (emailsRes.data || []).map((e: any) =>
      `[${e.direction === 'inbound' ? 'Cliente (lead)' : 'Miguel (nós)'}] ${e.subject || ''}: ${e.message?.substring(0, 500) || ''}`
    ).join('\n');
    const whatsappText = (whatsappRes.data || []).map((m: any) =>
      `${m.direction === 'inbound' ? 'Cliente (lead)' : 'Miguel (nós)'}: ${m.message || ''}`
    ).join('\n');

    const allEmails = lead.emails?.length ? lead.emails : [lead.email].filter(Boolean);

    // Build full communications text
    const communications = [emailsText, whatsappText].filter(Boolean).join('\n\n');

    // Use AI to extract delivery fields from context
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY não configurada');

    const aiPrompt = `Analise os dados deste lead/cliente e extraia as informações para criar uma entrega de vídeo no sistema de operações.

DADOS DO LEAD:
Nome: ${lead.name}
Email(s): ${allEmails.join(', ')}
Telefone(s): ${lead.phones?.join(', ') || 'N/A'}
Produto: ${lead.produto || 'N/A'}
Valor: ${lead.valor || 'N/A'}
Moeda: ${lead.moeda || 'BRL'}
Status: ${lead.status}
Descrição: ${lead.description || 'N/A'}
Data de entrega: ${lead.delivered_at || 'N/A'}
Data próximo pagamento: ${lead.data_proximo_pagamento || 'N/A'}

NOTAS:
${notesText || 'Nenhuma'}

EMAILS:
${emailsText || 'Nenhum'}

WHATSAPP:
${whatsappText || 'Nenhuma'}

Retorne APENAS um JSON válido (sem markdown, sem comentários) com estes campos:
{
  "title": "Título descritivo da entrega (baseado no produto/projeto) - OBRIGATÓRIO",
  "description": "Descrição curta do que será entregue (opcional)",
  "briefing": "Briefing completo extraído das conversas e notas - tudo que a equipe de operações precisa saber para produzir (opcional)",
  "video_type": "reels" ou "youtube" (APENAS essas duas opções, default "reels"),
  "content_type": "organic" ou "publicity" (APENAS essas duas opções, default "publicity"),
  "networks": array APENAS com: "youtube", "instagram", "tiktok", "facebook", "linkedin", "twitter",
  "due_date": "YYYY-MM-DD" ou null,
  "duration": texto livre como "60s", "15min", "10-15min" ou null,
  "language": "pt" ou "en" (APENAS essas duas opções, default "pt"),
  "ai_summary": "Resumo em 1-2 frases do que este projeto envolve"
}

REGRAS:
- video_type: se for vídeo longo/YouTube use "youtube", senão "reels"
- Se video_type="youtube", networks default é ["youtube"]. Se "reels", default é ["instagram", "tiktok"]
- content_type: apenas "organic" ou "publicity"
- language: apenas "pt" ou "en"
- Extraia o máximo de informação possível das conversas.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: aiPrompt }],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errText);
      throw new Error('Erro ao gerar dados com IA');
    }

    const aiData = await aiResponse.json();
    let aiContent = aiData.choices?.[0]?.message?.content || '';
    
    // Clean markdown code blocks if present
    aiContent = aiContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    let extractedData;
    try {
      extractedData = JSON.parse(aiContent);
    } catch {
      console.error('Failed to parse AI response:', aiContent);
      extractedData = {
        title: lead.produto ? `${lead.produto} - ${lead.name}` : lead.name,
        description: lead.description || 'Entrega de vídeo',
        briefing: `${lead.description || ''}\n\nNotas:\n${notesText}`,
        video_type: 'reels',
        content_type: 'publicity',
        networks: ['instagram', 'tiktok'],
        due_date: null,
        duration: null,
        language: 'pt',
        ai_summary: lead.description || '',
      };
    }

    // Ensure valid enums
    const videoType = ['youtube', 'reels'].includes(extractedData.video_type) ? extractedData.video_type : 'reels';
    const contentType = ['organic', 'publicity'].includes(extractedData.content_type) ? extractedData.content_type : 'publicity';
    const language = ['pt', 'en'].includes(extractedData.language) ? extractedData.language : 'pt';
    const validNetworks = ['youtube', 'instagram', 'tiktok', 'facebook', 'linkedin', 'twitter'];
    const networks = Array.isArray(extractedData.networks) 
      ? extractedData.networks.filter((n: string) => validNetworks.includes(n))
      : (videoType === 'youtube' ? ['youtube'] : ['instagram', 'tiktok']);

    // Build contacts
    const contacts = allEmails.map((email: string, idx: number) => ({
      email,
      name: idx === 0 ? lead.name : email,
      role: 'cliente',
    }));

    const primaryEmail = allEmails[0] || '';
    
    if (!primaryEmail) {
      // No email available — return a clear error to the user
      return new Response(JSON.stringify({ 
        error: 'Este lead não tem email cadastrado. Adicione um email ao lead antes de enviar para a Sara.' 
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const deliveryPayload: Record<string, any> = {
      title: extractedData.title || lead.name,
      client_email: primaryEmail,
      client_name: lead.name,
      video_type: videoType,
      content_type: contentType,
      status: 'awaiting_briefing',
      language,
      networks,
      contacts,
    };

    // Only include optional fields if they have values
    if (extractedData.description) deliveryPayload.description = extractedData.description;
    if (extractedData.briefing) deliveryPayload.briefing = extractedData.briefing;
    if (communications) deliveryPayload.communications = communications;
    if (extractedData.due_date) deliveryPayload.due_date = extractedData.due_date;
    if (extractedData.duration) deliveryPayload.duration = extractedData.duration;
    if (extractedData.ai_summary) deliveryPayload.ai_summary = extractedData.ai_summary;

    console.log('Sending delivery payload:', JSON.stringify(deliveryPayload));

    // Call the external delivery API
    const deliveryResponse = await fetch(DELIVERY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deliveryPayload),
    });

    const deliveryResult = await deliveryResponse.json();
    console.log('Delivery API response:', deliveryResponse.status, JSON.stringify(deliveryResult));

    if (!deliveryResponse.ok) {
      throw new Error(`Erro da API de entregas: ${deliveryResponse.status} - ${JSON.stringify(deliveryResult)}`);
    }

    const externalUrl = extractExternalUrl(deliveryResult);

    return new Response(JSON.stringify({ success: true, delivery: deliveryResult, url: externalUrl }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Erro:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
