import { AUDIENCE_FACTS } from "../_shared/audience-facts.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const { emails, leadName, leadDescription, leadStatus, leadValor, leadValorPago, leadMoeda, leadProduto, leadLanguage, fastMode } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não está configurada');
    }

    if (!emails || !Array.isArray(emails)) {
      throw new Error('Nenhum email encontrado para gerar resposta');
    }

    const settings = await getSettings(['susan_name', 'company_name']);

    const recentEmails = emails
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);

    console.log('Generating email reply for', leadName, '- Total emails:', emails.length, '- Using:', recentEmails.length);

    const emailHistory = recentEmails.map((email: any) => {
      const direction = email.direction === 'inbound' ? 'Cliente (lead)' : `${settings.susan_name} (nós)`;
      const subject = email.subject ? `Subject: ${email.subject}\n` : '';
      const rawContent = email.message || (email.html_body ? stripHtml(email.html_body) : '');
      const content = rawContent.substring(0, 2000);
      return `[${direction} — ${new Date(email.timestamp).toISOString()}]\n${subject}${content}`;
    }).join('\n\n---\n\n');

    const historyNote = `IMPORTANTE: '${settings.susan_name} (nós)' = mensagens enviadas por nós. 'Cliente (lead)' = mensagens recebidas do prospect/cliente.\n\n`;

    // Build status-aware context
    let statusContext = '';
    if (leadStatus === 'ganho' || leadStatus === 'produzido') {
      const valorPendente = (leadValor || 0) - (leadValorPago || 0);
      const currency = leadMoeda || 'BRL';
      const symbols: Record<string, string> = { BRL: 'R$', USD: 'US$', EUR: '€' };
      const sym = symbols[currency] || currency;
      
      if (leadStatus === 'ganho') {
        statusContext = `\n\nSTATUS CONTEXT - CRITICAL:
This deal is WON (status: ganho). The client has already agreed to work with ${settings.company_name}.
${valorPendente > 0 ? `Outstanding amount: ${sym} ${valorPendente} (Total: ${sym} ${leadValor}, Paid: ${sym} ${leadValorPago || 0})` : ''}
Product/Service: ${leadProduto || 'not specified'}

YOUR FOLLOW-UP MUST focus on advancing the deal toward delivery and payment:
- Ask about payment timeline/forecast if there's an outstanding amount
- Check if there are pending items (contract to sign, briefing to send, materials needed)
- Ask what's needed to move forward with production/delivery
- Be proactive about next steps — the deal is closed, now execute
- DO NOT pitch or sell — this is already won. Focus on operations and collecting payment.`;
      } else if (leadStatus === 'produzido') {
        statusContext = `\n\nSTATUS CONTEXT - CRITICAL:
The work has been PRODUCED/DELIVERED (status: produzido).
${valorPendente > 0 ? `OUTSTANDING PAYMENT: ${sym} ${valorPendente} (Total: ${sym} ${leadValor}, Paid: ${sym} ${leadValorPago || 0})` : `Fully paid.`}
Product/Service: ${leadProduto || 'not specified'}

YOUR FOLLOW-UP MUST focus on:
${valorPendente > 0 ? `- PRIORITY: Politely but firmly ask about the payment status and expected payment date
- Mention the outstanding amount naturally
- Ask if there's anything blocking the payment (invoice needed, approval pending, etc.)` : `- Thank them for the partnership
- Ask about satisfaction with the delivered work
- Explore upsell opportunities or new projects`}
- DO NOT pitch or sell the original deal — it's already delivered.`;
      }
    }

    const defaultPrompt = `You are ${settings.susan_name} writing a professional follow-up email on behalf of ${settings.company_name}.

ABSOLUTE LANGUAGE REQUIREMENT - THIS IS THE MOST IMPORTANT RULE:
- Analyze the email history below carefully. Detect the language that the LEAD (inbound messages) is using.
- If there are no inbound messages, detect the language from the outbound messages.
- You MUST write the ENTIRE follow-up email in that SAME language (Portuguese, English, French, Spanish, German, Italian, or any other language detected).
- The subject line MUST also be in the detected language.
- DO NOT mix languages under any circumstances.
- DO NOT default to Portuguese. Match the conversation language exactly.

CRITICAL: Write in FIRST PERSON (I/we, not "${settings.susan_name}" or "he/she"). You ARE ${settings.susan_name} responding directly.

WRITING STYLE - MANDATORY:
- Be EXTREMELY OBJECTIVE, CLEAR and DIRECT. Short sentences. No fluff, no filler, no unnecessary pleasantries beyond a brief greeting.
- Always maintain CORDIAL and PROFESSIONAL tone — be warm but concise.
- Get straight to the point. Every sentence must have a purpose.

RECAPITULATION - MANDATORY:
- The email MUST include a brief, natural recapitulation of what has happened so far in the conversation. For example: "You reached out about X, we sent over a proposal on [date], and we haven't heard back yet" or "Following up on our last exchange where we discussed Y."
- This recap should be 1-2 sentences MAX, woven naturally into the opening of the email.
- Do NOT copy/paste previous messages. Summarize the timeline in your own words.
- If our last follow-up was sent N days ago, mention that naturally (e.g., "I reached out a few days ago..." or "It's been about a week since...").

Lead: {leadName}
{leadDescriptionLine}
{statusContext}

{historyNote}Email history:
{emailHistory}

Based on the history above, write a professional and contextual follow-up email AS ${settings.susan_name} in first person. The email should:
- Start with a brief recap of the conversation timeline (1-2 sentences)
- Be objective, clear, and direct while remaining cordial
- Have a clear call-to-action appropriate to the deal stage
- Provide an appropriate subject line in the detected language
- Do NOT include the previous email thread or quote previous messages — write ONLY the new message
- Read the conversation history carefully to understand WHAT IS PENDING — if the client owes something (contract, payment, materials, briefing), ask about it specifically

Return ONLY the new email message in this exact format:
Subject: [subject]

[body (do NOT include the previous email thread, just the new message)]`;

    const prompt = (await getPrompt("9", defaultPrompt, {
      leadName,
      leadDescriptionLine: leadDescription ? `Lead description: ${leadDescription}` : '',
      statusContext: statusContext || '',
      emailHistory,
      historyNote,
    })) + AUDIENCE_FACTS;

    // Idioma: prioriza leadLanguage persistido (ISO 639-1) → nome legível
    const LANG_NAMES: Record<string, string> = {
      pt: 'Portuguese', en: 'English', es: 'Spanish', fr: 'French', de: 'German',
      it: 'Italian', nl: 'Dutch', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
      ru: 'Russian', ar: 'Arabic', tr: 'Turkish', pl: 'Polish', sv: 'Swedish',
    };
    let languageInstruction = '';
    let detectedLang: string | null = leadLanguage ? (LANG_NAMES[String(leadLanguage).toLowerCase()] || null) : null;

    if (!detectedLang && fastMode) {
      const inboundContent = recentEmails
        .filter((e: any) => e.direction === 'inbound')
        .map((e: any) => (e.message || (e.html_body ? stripHtml(e.html_body) : '')).substring(0, 500))
        .join(' ');
      const sample = (inboundContent || emailHistory).toLowerCase();
      detectedLang = 'Portuguese';
      if (/\b(the|and|with|for|this|that|have|from|would|could)\b/.test(sample)) detectedLang = 'English';
      else if (/\b(el|los|las|con|para|este|esta|tiene|desde)\b/.test(sample)) detectedLang = 'Spanish';
      else if (/\b(le|les|avec|pour|cette|sont|dans|qui)\b/.test(sample)) detectedLang = 'French';
      else if (/\b(der|die|das|und|mit|für|dieser|haben)\b/.test(sample)) detectedLang = 'German';
      else if (/\b(il|gli|con|per|questo|questa|sono|dalla)\b/.test(sample)) detectedLang = 'Italian';
    }

    if (detectedLang) {
      languageInstruction = `\n\nCRITICAL LANGUAGE INSTRUCTION: You MUST write the entire email in ${detectedLang}. The subject line MUST also be in ${detectedLang}. Do NOT use any other language.`;
      console.log('Locked language:', detectedLang, '(from leadLanguage:', leadLanguage, ')');
    }

    const finalPrompt = prompt + languageInstruction;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: fastMode ? 'google/gemini-2.5-flash-lite' : 'google/gemini-2.5-pro',
        messages: [
          { role: 'user', content: finalPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro da Lovable AI:', response.status, errorText);
      throw new Error(`Erro da Lovable AI: ${response.status}`);
    }

    const data = await response.json();
    const generatedEmail = data.choices[0].message.content;

    const lines = generatedEmail.split('\n');
    let subject = '';
    let newMessage = '';
    
    if (lines[0].startsWith('Assunto:') || lines[0].startsWith('Subject:')) {
      subject = lines[0].replace(/^(Assunto|Subject):/, '').trim();
      newMessage = lines.slice(2).join('\n').trim();
    } else {
      subject = 'Follow-up';
      newMessage = generatedEmail.trim();
    }

    // Validação: rejeitar se o corpo for muito curto
    if (newMessage.length < 50) {
      console.error('Email gerado muito curto:', newMessage.length, 'chars -', newMessage);
      throw new Error('O email gerado pela IA é muito curto e provavelmente inválido. Tente novamente.');
    }

    // Validação: rejeitar se for idêntico a alguma mensagem existente
    const existingMessages = recentEmails.map((e: any) => {
      const raw = e.message || (e.html_body ? stripHtml(e.html_body) : '');
      return raw.trim().toLowerCase();
    }).filter(Boolean);

    if (existingMessages.some((msg: string) => msg.includes(newMessage.trim().toLowerCase()) || newMessage.trim().toLowerCase().includes(msg))) {
      console.error('Email gerado é idêntico a uma mensagem existente:', newMessage.substring(0, 100));
      throw new Error('O email gerado pela IA é uma cópia de uma mensagem existente. Tente novamente.');
    }

    const newMessageHtml = newMessage.replace(/\n/g, '<br>');
    const body = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
        ${newMessageHtml}
      </div>`;

    return new Response(
      JSON.stringify({ subject, body }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Erro em generate-email-reply:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
