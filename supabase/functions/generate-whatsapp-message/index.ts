import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getPrompt } from "../_shared/get-prompt.ts";
import { getSettings } from "../_shared/get-settings.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function stripHtml(html: string): string {
  let text = html;
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { leadId, context } = await req.json();

    if (!leadId || !context) {
      return new Response(
        JSON.stringify({ error: 'leadId e context são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const settings = await getSettings(['susan_name', 'company_name']);

    // Buscar dados do lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError) throw leadError;

    // Buscar mensagens de email e WhatsApp em paralelo
    const [emailsResult, whatsappResult] = await Promise.all([
      supabase
        .from('email_messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('timestamp', { ascending: true }),
      supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true }),
    ]);

    const emails = emailsResult.data;
    const whatsappMsgs = whatsappResult.data;

    // Construir contexto COMPLETO para a IA
    let historico = `=== INFORMAÇÕES DO LEAD ===\n`;
    historico += `Nome: ${lead.name}\n`;
    if (lead.description) historico += `Descrição: ${lead.description}\n`;
    if (lead.valor) {
      historico += `Valor: ${lead.moeda === 'USD' ? 'USD' : lead.moeda === 'EUR' ? 'EUR' : 'R$'} ${lead.valor}\n`;
    }
    if (lead.produto) historico += `Produto: ${lead.produto}\n`;
    if (lead.status) historico += `Status: ${lead.status}\n`;

    // Histórico de emails
    historico += '\n=== HISTÓRICO COMPLETO DE EMAILS (cronológico) ===\n';
    if (emails && emails.length > 0) {
      emails.forEach((email: any, idx: number) => {
        const direction = email.direction === 'inbound' ? '📥 RECEBIDO DO CLIENTE' : '📤 ENVIADO POR MIM';
        historico += `\n[${idx + 1}] ${direction} em ${new Date(email.timestamp).toLocaleString('pt-BR')}\n`;
        if (email.subject) historico += `Assunto: ${email.subject}\n`;
        const content = email.message || (email.html_body ? stripHtml(email.html_body) : '(sem conteúdo)');
        historico += `${content}\n---\n`;
      });
    } else {
      historico += '(Nenhum email trocado até o momento)\n';
    }

    // Histórico de WhatsApp
    historico += '\n=== HISTÓRICO COMPLETO DE WHATSAPP (cronológico) ===\n';
    if (whatsappMsgs && whatsappMsgs.length > 0) {
      whatsappMsgs.forEach((msg: any, idx: number) => {
        const direction = msg.direction === 'inbound' ? '📥 LEAD' : `📤 EU (${settings.company_name})`;
        const timestamp = new Date(msg.timestamp || msg.created_at).toLocaleString('pt-BR');
        historico += `\n[${idx + 1}] ${direction} em ${timestamp}\n`;
        historico += `${msg.message || '(sem conteúdo)'}\n---\n`;
      });
    } else {
      historico += '(Nenhuma mensagem de WhatsApp trocada até o momento)\n';
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    const hasWhatsAppHistory = whatsappMsgs && whatsappMsgs.length > 0;
    const lastMessages = hasWhatsAppHistory
      ? whatsappMsgs!.slice(-3).map((m: any) => `${m.direction === 'inbound' ? 'Lead' : 'Eu'}: ${m.message}`).join('\n')
      : 'Primeira mensagem';

    // Default prompt que será usado APENAS se o usuário não customizou o template #8
    const defaultPrompt = `Você é o ${settings.company_name} escrevendo mensagens de WhatsApp para seus leads e clientes.

🎯 OBJETIVO PRINCIPAL:
Gerar uma mensagem que soa NATURAL, CORDIAL e EMPÁTICA, como se fosse a próxima mensagem lógica na conversa, levando em conta TODO o contexto e histórico fornecido.

📋 REGRAS CRÍTICAS:

1. CONTEXTO É INSTRUÇÃO:
   - O "Contexto da mensagem" que você recebe É UMA INSTRUÇÃO do que deve ser feito/dito

2. LEIA TODO O HISTÓRICO:
   - Veja TODAS as mensagens anteriores de WhatsApp e email
   - Identifique: qual foi a última mensagem? Do lead ou sua?
   - Responda de forma coerente com o que foi dito antes
   - NÃO repita saudações genéricas se a conversa já está em andamento

3. TOM E FORMATO:
   ${hasWhatsAppHistory
     ? '- Conversa JÁ EM ANDAMENTO: continue naturalmente'
     : '- PRIMEIRA MENSAGEM: use saudação informal e amigável'}
   - Tom: CORDIAL, AMIGÁVEL, CONSULTIVO e EMPÁTICO
   - Tamanho: 2-5 linhas
   - NÃO use emojis

4. DETECÇÃO DE IDIOMA:
   - Detecte o idioma usado pelo lead nas mensagens
   - Responda SEMPRE no mesmo idioma do lead

=== CONTEXTO DA MENSAGEM ===
{context}

{historico}

ÚLTIMAS 3 MENSAGENS:
{lastMessages}

Gere APENAS a mensagem de WhatsApp, sem explicações ou comentários.`;

    const prompt = await getPrompt("8", defaultPrompt, {
      context,
      historico,
      lastMessages,
      leadName: lead.name,
      leadDescription: lead.description || '',
      companyName: settings.company_name,
    });

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido, tente novamente mais tarde.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes para usar a IA.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      throw new Error('Erro ao gerar mensagem com IA');
    }

    const aiData = await aiResponse.json();
    const generatedMessage = aiData.choices?.[0]?.message?.content;

    if (!generatedMessage) {
      throw new Error('Nenhuma mensagem gerada pela IA');
    }

    return new Response(
      JSON.stringify({ message: generatedMessage }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
