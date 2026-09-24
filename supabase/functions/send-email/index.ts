import { authorizeSchoolRequest } from "../_shared/authorize-school-request.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { getSettings } from "../_shared/get-settings.ts";
import { setActivityContext } from "../_shared/activity-context.ts";
import { extractAndSaveThreadEmails } from "../_shared/extract-thread-emails.ts";
import { generateMessageId, buildThreadHeaders, ensureAngleBrackets } from "../_shared/email-threading.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: detecta se o body já é HTML estruturado (tem tags de bloco / quebras)
function isStructuredHtml(input: string): boolean {
  if (!input) return false;
  return /<\s*(p|br|div|ul|ol|li|h[1-6]|table|blockquote)\b/i.test(input);
}

// Helper: escapa HTML básico
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Helper: converte Markdown [text](url) e URLs nuas em <a>
function linkify(s: string): string {
  // Markdown links primeiro
  let out = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">${text}</a>`;
  });
  // URLs nuas (que não estão dentro de href/>)
  out = out.replace(/(^|[\s(])((https?:\/\/)[^\s<)]+)/g, (_m, pre, url) => {
    return `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">${url}</a>`;
  });
  return out;
}

/**
 * Pré-processa o corpo do email para garantir formatação legível.
 * - Se já for HTML estruturado, aplica linkify e devolve.
 * - Se for texto plano (caso típico do MCP/IA), divide em parágrafos por
 *   linhas em branco; e se vier tudo em linha única, quebra em parágrafos
 *   curtos por agrupamento de sentenças.
 */
function formatBodyForEmail(body: string): string {
  if (!body) return '';

  if (isStructuredHtml(body)) {
    // já tem estrutura — apenas garante que links Markdown virem <a>
    return linkify(body);
  }

  // normaliza quebras
  let text = body.replace(/\r\n/g, '\n').trim();

  // Se vier tudo em uma linha só (sem \n), tenta quebrar em parágrafos
  // agrupando sentenças (~2 por parágrafo).
  if (!text.includes('\n')) {
    const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
    const groups: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) {
      groups.push((sentences[i] + (sentences[i + 1] || '')).trim());
    }
    text = groups.filter(Boolean).join('\n\n');
  }

  // Divide em parágrafos por linhas em branco; quebras simples viram <br>
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => {
      const escaped = escapeHtml(p).replace(/\n/g, '<br>');
      return `<p style="margin:0 0 12px 0;">${linkify(escaped)}</p>`;
    });

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">${paragraphs.join('')}</div>`;
}

// Helper: build email thread quote HTML from previous emails
function buildThreadQuoteHtml(emails: any[], leadName: string, senderName: string): string {
  if (!emails || emails.length === 0) return '';

  const sorted = [...emails].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Only include last 5 emails in quote to save memory
  const limited = sorted.slice(0, 5);

  // Build nested blockquotes (most recent first, each wrapping the next)
  // Gmail/Spark/Outlook collapse content inside <blockquote> and <div class="gmail_quote">
  let nested = '';
  for (let i = limited.length - 1; i >= 0; i--) {
    const email = limited[i];
    const from = email.direction === 'inbound' ? leadName : senderName;
    const fromEmail = email.direction === 'inbound' ? '' : '';
    const date = new Date(email.timestamp).toLocaleString('en-US');
    let content = (email.html_body || email.message || '');
    if (content.length > 3000) content = content.substring(0, 3000) + '...';
    content = content.replace(/\n/g, '<br>');

    nested = `<div class="gmail_quote"><p class="MsoNormal" style="color:#666;font-size:0.9em;margin:0 0 5px 0;">On ${date}, ${from} wrote:</p><blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${content}${nested ? '<br>' + nested : ''}</blockquote></div>`;
  }

  return nested;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authorization = await authorizeSchoolRequest(req, corsHeaders);
    if (authorization.response) return authorization.response;

    const { leadId, to, subject, body, threadQuote = true, fromOverride, attachments, replyToMessageId } = await req.json();

    console.log('=== SEND EMAIL REQUEST ===');
    console.log('leadId:', leadId);


    console.log('body length:', body?.length);
    console.log('threadQuote:', threadQuote);

    if (!to || !subject || !body) {
      console.error('ERRO: Campos obrigatórios faltando');
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios faltando: to, subject, body' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    // Fetch sender identity from system settings
    const settings = await getSettings(['susan_name', 'susan_email', 'company_name', 'company_email']);
    const senderName = fromOverride?.name || settings.susan_name;
    const senderEmail = fromOverride?.email || settings.susan_email;
    const ccEmail = settings.company_email;
    if (!senderEmail || !resendApiKey) {
      return new Response(JSON.stringify({ error: 'email_not_configured' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Handle both array and string formats for 'to'
    let emailList: string[] = [];
    if (Array.isArray(to)) {
      emailList = to.map((email: string) => email.trim()).filter((e: string) => !!e);
    } else if (typeof to === 'string') {
      emailList = to.split(',').map((email: string) => email.trim()).filter((e: string) => !!e);
    }
    const dedupedRecipients = Array.from(new Set(emailList));

    // GUARD: nunca enviar para emails sintéticos (@whatsapp.temp / placeholders).
    // Esses endereços existem apenas como chave técnica para leads sem email real.
    const recipients = dedupedRecipients.filter((e) => {
      const lower = e.toLowerCase();
      if (lower.endsWith('@whatsapp.temp')) return false;
      if (lower.endsWith('@whatsapp.placeholder')) return false;
      return true;
    });

    if (recipients.length === 0) {
      console.warn('Nenhum destinatário válido após filtrar emails sintéticos:', dedupedRecipients);
      return new Response(
        JSON.stringify({ error: 'Nenhum email real disponível para este lead (apenas placeholders @whatsapp.temp).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Recipients processados:', recipients);

    // Initialize supabase for threading
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = (supabaseUrl && supabaseServiceRoleKey)
      ? createClient(supabaseUrl, supabaseServiceRoleKey)
      : null;
    if (supabase) {
      // Susan envia automaticamente; quando é resposta manual do Miguel via UI, ele já fica como actor=miguel via frontend
      await setActivityContext(supabase, { source: 'edge_function:send-email', actor: 'susan' });
    }

    // Build threading headers and thread quote if leadId provided
    let replyHeaders: Record<string, string> = {};
    let threadHtml = '';
    let leadName = 'Client';

    if (leadId && supabase) {
      // Fetch lead name
      const { data: lead } = await supabase
        .from('leads')
        .select('name')
        .eq('id', leadId)
        .maybeSingle();

      if (lead) leadName = lead.name;

      // Fetch previous emails for this lead (only fields needed for threading)
      const { data: previousEmails } = await supabase
        .from('email_messages')
        .select('resend_message_id, timestamp, direction, subject, message, html_body, raw_data')
        .eq('lead_id', leadId)
        .order('timestamp', { ascending: false })
        .limit(10);

      if (previousEmails && previousEmails.length > 0) {
        replyHeaders = buildThreadHeaders(previousEmails as any);

        // Override In-Reply-To if caller specified a specific message to reply to
        if (replyToMessageId) {
          const forced = ensureAngleBrackets(replyToMessageId);
          if (forced) {
            replyHeaders['In-Reply-To'] = forced;
            const existingRefs = (replyHeaders['References'] || '').split(/\s+/).filter(Boolean);
            if (!existingRefs.includes(forced)) existingRefs.push(forced);
            replyHeaders['References'] = existingRefs.join(' ');
            console.log('Forced In-Reply-To override:', forced);
          }
        }

        if (replyHeaders['In-Reply-To']) {
          console.log('Threading headers set - In-Reply-To:', replyHeaders['In-Reply-To']);
        }

        // Build thread quote HTML
        if (threadQuote) {
          threadHtml = buildThreadQuoteHtml(previousEmails, leadName, senderName);
          console.log('Thread quote built with', previousEmails.length, 'emails');
        }
      }
    }

    // Gera Message-ID próprio para garantir threading consistente em todos os clientes.
    const outgoingMessageId = generateMessageId(senderEmail);

    // Send only the new message body — no thread quote appended
    // Pré-processa o body: se vier texto plano (ex: MCP/IA), formata em parágrafos legíveis.
    const finalBody = formatBodyForEmail(body);

    console.log('Enviando para Resend API...');

    const resendPayload: any = {
      from: `${senderName} <${senderEmail}>`,
      to: [...recipients, ccEmail],
      subject: subject,
      html: finalBody,
    };

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      resendPayload.attachments = attachments.map((att: any) => ({
        filename: att.filename,
        content: att.content, // base64 string
        type: att.type || 'application/octet-stream',
      }));
      console.log('Attachments included:', attachments.map((a: any) => a.filename));
    }

    resendPayload.headers = {
      ...(Object.keys(replyHeaders).length > 0 ? replyHeaders : {}),
      'Message-ID': outgoingMessageId,
    };

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendPayload),
    });

    console.log('Resend API status:', emailResponse.status);

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('ERRO DO RESEND:', errorText);
      throw new Error(`Erro ao enviar email: ${errorText}`);
    }

    const emailData = await emailResponse.json();
    const resendMessageId = outgoingMessageId; // usamos o Message-ID RFC que enviamos no header

    console.log('✅ Email enviado com SUCESSO via Resend!');
    console.log('Resend response:', emailData);
    console.log('Resend message ID:', resendMessageId);

    // Salvar na tabela email_messages se leadId foi fornecido
    if (leadId && supabase) {
      console.log('Salvando email no banco de dados...');
      
      // Deduplication: check if same outbound email was already saved by a webhook
      const windowStart = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: existingMsg } = await supabase
        .from('email_messages')
        .select('id')
        .eq('lead_id', leadId)
        .eq('direction', 'outbound')
        .eq('resend_message_id', resendMessageId)
        .limit(1);

      const { data: existingByTime } = !existingMsg?.length ? await supabase
        .from('email_messages')
        .select('id')
        .eq('lead_id', leadId)
        .eq('direction', 'outbound')
        .gte('created_at', windowStart)
        .eq('subject', subject)
        .limit(1) : { data: existingMsg };

      if (existingByTime && existingByTime.length > 0) {
        console.log('⏭️ Outbound email already exists (dedup), skipping. Existing id:', existingByTime[0].id);
      } else {
        // Normaliza Message-ID (remove <> e lowercase) para bater com o dedup trigger
        const normalizedMsgId = outgoingMessageId.replace(/[<>]/g, '').toLowerCase().trim();
        const { error: insertError } = await supabase
          .from('email_messages')
          .insert({
            lead_id: leadId,
            direction: 'outbound',
            subject: subject,
            message: body,
            html_body: finalBody,
            resend_message_id: resendMessageId,
            internet_message_id: normalizedMsgId,
            recipients_to: recipients,
            recipients_cc: [ccEmail],
            raw_data: {
              headers: { 'Message-ID': outgoingMessageId, ...replyHeaders },
              from: senderEmail,
              to: recipients,
              cc: [ccEmail],
            },
          });

        if (insertError) {
          console.error('❌ ERRO ao salvar email no banco:', insertError);
        } else {
          console.log('✅ Email salvo no banco com sucesso (resend_message_id:', resendMessageId, ')');
        }


        // Extrair e salvar emails citados na thread (ex.: a mensagem original
        // do cliente que aparece abaixo de "On ... wrote:" no corpo do reply).
        try {
          const saved = await extractAndSaveThreadEmails(
            supabase,
            leadId,
            finalBody || body,
            subject
          );
          if (saved > 0) console.log(`✅ ${saved} email(s) da thread salvos como histórico`);
        } catch (e) {
          console.error('Erro ao extrair thread:', e);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: emailData }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Erro em send-email:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);
