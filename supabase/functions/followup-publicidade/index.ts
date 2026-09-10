import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { getPrompt } from "../_shared/get-prompt.ts";
import { getSettings } from "../_shared/get-settings.ts";
import { setActivityContext } from "../_shared/activity-context.ts";
import { generateMessageId, buildThreadHeaders } from "../_shared/email-threading.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_FOLLOWUPS = 7;
const MAX_THREAD_EMAILS = 3;
const MAX_CONTENT_LENGTH = 1500;

function isWeekendInBrazil(): boolean {
  const now = new Date();
  const brHour = now.getUTCHours() - 3;
  const brDate = new Date(now);
  if (brHour < 0) brDate.setUTCDate(brDate.getUTCDate() - 1);
  const day = brDate.getUTCDay();
  return day === 0 || day === 6;
}

function truncate(text: string, max: number): string {
  if (!text || text.length <= max) return text || '';
  return text.slice(0, max) + '...';
}

async function scheduleNextFollowup(
  supabase: any,
  leadId: string,
  nextAttempt: number
): Promise<void> {
  if (nextAttempt > MAX_FOLLOWUPS) {
    await supabase
      .from('scheduled_followups')
      .upsert({
        lead_id: leadId,
        status: 'completed',
        attempt_number: nextAttempt,
        next_run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'lead_id' });
    console.log(`Lead ${leadId}: max follow-ups reached, marked completed`);
    return;
  }

  // Progressive intervals: #1=24h, #2=48h, #3=72h, #4=96h, #5=120h, #6=144h, #7=168h
  const intervalHours = nextAttempt * 24;
  const nextRun = new Date(Date.now() + intervalHours * 60 * 60 * 1000);
  
  await supabase
    .from('scheduled_followups')
    .upsert({
      lead_id: leadId,
      status: 'pending',
      attempt_number: nextAttempt,
      next_run_at: nextRun.toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'lead_id' });

  console.log(`Lead ${leadId}: next follow-up #${nextAttempt} scheduled at ${nextRun.toISOString()}`);
}

async function processLead(
  supabase: any,
  lead: any,
  followUpNumber: number,
  susanName: string,
  susanEmail: string,
  companyName: string,
  companyEmail: string,
  resendApiKey: string,
  LOVABLE_API_KEY: string,
  emails: any[]
): Promise<{ lead: string; status: string; followUpNumber?: number; reason?: string; error?: string }> {
  // Build email history for AI (last 5, truncated)
  const recentEmails = emails.slice(-5);
  const emailHistory = recentEmails.map(e => {
    const dir = e.direction === 'inbound' ? 'Received' : 'Sent';
    const subj = e.subject ? `Subject: ${e.subject}\n` : '';
    const content = truncate(e.message || '', MAX_CONTENT_LENGTH);
    return `[${dir} on ${new Date(e.timestamp).toLocaleString('en-US')}]\n${subj}${content}`;
  }).join('\n\n---\n\n');

  // Thread quote removed — emails now contain only the new message body
  const threadQuoteHtml = '';

  // Threading headers (RFC 5322 com `<id@domínio>`)
  const threadHeaders = buildThreadHeaders(emails as any);
  const lastEmail = emails[emails.length - 1];


  // Build prompt
  let prompt: string;
  if (followUpNumber <= 6) {
    const defaultPrompt = `You are ${susanName}, executive assistant to ${companyName}, a content creator and AI keynote speaker.

CRITICAL LANGUAGE RULE:
- Read the email history below carefully
- Identify the language the CLIENT (inbound/received messages) is using
- Write your ENTIRE reply (subject + body) in that SAME language
- If there are no inbound messages, default to English
- NEVER mix languages.

WRITING STYLE - MANDATORY:
- Be EXTREMELY OBJECTIVE, CLEAR and DIRECT. Short sentences. No fluff.
- Always maintain CORDIAL and PROFESSIONAL tone — warm but concise.
- Every sentence must have a purpose.

RECAPITULATION - MANDATORY:
- Start with a brief, natural recap of what happened so far (1-2 sentences). Example: "You reached out about a partnership with Miguel, we replied on [date], but haven't heard back."
- If previous follow-ups were sent, mention naturally how long it's been (e.g., "It's been about a week since our last message...").
- Do NOT copy/paste previous messages. Summarize the timeline in your own words.

You are writing follow-up #{followUpNumber} to {leadName} about an advertising/sponsorship partnership.

Context - this is a brand that reached out to Miguel for a content partnership (publicidade). Susan is following up because they haven't responded.

INSTRUCTIONS:
- Write as Susan, Miguel's assistant, in first person
- Ask if they can give a response within 2 days
- Mention that Miguel's recording schedule is very tight right now
- Miguel really wants to make this partnership work
- Miguel's audience will love their product
- Be professional but show eagerness/urgency
- Keep it concise (4-6 lines max for the body)
- This is follow-up #{followUpNumber} - don't mention the exact number, just naturally follow up
- DO NOT include any signature, it will be added automatically
- Do NOT include the previous email thread or quote previous messages — write ONLY the new message
- MEDIA KIT RULE: ONLY include the link https://inventormiguel.link/kit if the client EXPLICITLY asked for Media Kit, press kit, kit de mídia, rate card, portfolio, pricing, or information about Miguel's numbers/reach in their messages. If the client did NOT explicitly request this information, do NOT include this link under any circumstances.

Email history for context:
{emailHistory}

Return ONLY in this format:
Subject: [subject line]

[body - just the new message, no signature, no previous thread]`;

    prompt = await getPrompt("10", defaultPrompt, {
      followUpNumber: String(followUpNumber),
      leadName: lead.name,
      emailHistory,
    });
  } else {
    const defaultPrompt = `You are ${susanName}, executive assistant to ${companyName}, a content creator and AI keynote speaker.

CRITICAL LANGUAGE RULE:
- Read the email history below carefully
- Identify the language the CLIENT (inbound/received messages) is using
- Write your ENTIRE reply (subject + body) in that SAME language
- If there are no inbound messages, default to English
- NEVER mix languages.

WRITING STYLE - MANDATORY:
- Be EXTREMELY OBJECTIVE, CLEAR and DIRECT. Short sentences. No fluff.
- Always maintain CORDIAL and PROFESSIONAL tone — warm but concise.
- Every sentence must have a purpose.

RECAPITULATION - MANDATORY:
- Start with a brief recap of the entire timeline: when they first reached out, how many times you followed up, how long it's been. (1-2 sentences)
- Do NOT copy/paste previous messages. Summarize in your own words.

You are writing the FINAL follow-up to {leadName} about an advertising/sponsorship partnership. This is the last attempt after multiple unanswered emails.

Context - this brand REACHED OUT TO MIGUEL first, proposing a content partnership. Then they simply stopped responding.

INSTRUCTIONS - DISAPPOINTED TONE:
- Write as Susan, Miguel's assistant
- Express that you've tried to reach them multiple times without any response
- Say that Miguel is personally disappointed - this brand reached out to HIM and then went silent
- If they're not interested, they could at least say so
- Miguel personally loves their product and was genuinely excited to create content about it
- This attitude is not compatible with such a great product
- This is the FINAL contact - after this, no more follow-ups
- Be direct but professional, showing genuine disappointment
- Keep it 6-8 lines
- DO NOT include any signature
- Do NOT include the previous email thread or quote previous messages — write ONLY the new message
- MEDIA KIT RULE: ONLY include the link https://inventormiguel.link/kit if the client EXPLICITLY asked for Media Kit, press kit, kit de mídia, rate card, portfolio, pricing, or information about Miguel's numbers/reach in their messages. If the client did NOT explicitly request this information, do NOT include this link under any circumstances.

Email history for context:
{emailHistory}

Return ONLY in this format:
Subject: [subject line]

[body - just the new message, no signature, no previous thread]`;

    prompt = await getPrompt("11", defaultPrompt, {
      leadName: lead.name,
      emailHistory,
    });
  }

  // Detect language from inbound emails
  const inboundContent = emails
    .filter((e: any) => e.direction === 'inbound')
    .map((e: any) => (e.message || '').substring(0, 500))
    .join(' ').toLowerCase();

  let detectedLang = 'English'; // default to English
  if (/\b(obrigad|proposta|parceria|publicidade|olá|você|nosso|prezad|bom dia|boa tarde)\b/.test(inboundContent)) detectedLang = 'Portuguese';
  else if (/\b(el|los|las|con|este|esta|tiene|desde|hola|gracias)\b/.test(inboundContent)) detectedLang = 'Spanish';
  else if (/\b(le|les|avec|pour|cette|sont|dans|qui|bonjour|merci)\b/.test(inboundContent)) detectedLang = 'French';
  else if (/\b(der|die|das|und|mit|für|dieser|haben)\b/.test(inboundContent)) detectedLang = 'German';
  else if (/\b(il|gli|con|per|questo|questa|sono|dalla|grazie|buongiorno)\b/.test(inboundContent)) detectedLang = 'Italian';

  console.log(`Language detected for ${lead.name}: ${detectedLang} (from ${inboundContent.length} chars of inbound content)`);

  // Inject language override into prompt
  prompt += `\n\nCRITICAL LANGUAGE OVERRIDE: You MUST write the ENTIRE email (subject + body) in ${detectedLang}. Do NOT use any other language under any circumstances.`;

  // AI call
  const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: `You are ${susanName} writing professional follow-up emails. Write 100% in ${detectedLang}. No other language allowed.` },
        { role: 'user', content: prompt }
      ],
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error(`AI error for ${lead.name}:`, aiResponse.status, errorText);
    if (aiResponse.status === 429) {
      throw { message: 'rate_limited', status: 429 };
    }
    return { lead: lead.name, status: 'error', error: `AI error: ${aiResponse.status}` };
  }

  const aiData = await aiResponse.json();
  const generatedEmail = aiData.choices[0].message.content;

  // Parse subject/body
  const lines = generatedEmail.split('\n');
  let newMessage = '';
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cleaned = lines[i].replace(/\*\*/g, '').trim();
    if (cleaned.toLowerCase().startsWith('assunto:') || cleaned.toLowerCase().startsWith('subject:')) {
      newMessage = lines.slice(i + 2).join('\n').trim();
      break;
    }
  }
  if (!newMessage) newMessage = generatedEmail.trim();

  // Use last email's subject for threading
  const lastEmailInThread = emails[emails.length - 1];
  const lastSubject = lastEmailInThread?.subject || `Follow-up - ${lead.name}`;
  const subject = lastSubject.toLowerCase().startsWith('re:') ? lastSubject : `Re: ${lastSubject}`;

  const newMessageHtml = newMessage.replace(/\n/g, '<br>');
  const fullBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;">
    ${newMessageHtml}
    <br><br>
    <p style="color:#666;font-size:12px;">—<br>${susanName}<br>Executive Assistant to ${companyName}<br>${susanEmail}</p>
  </div>`;

  // Send via Resend
  const recipientEmails = lead.emails && lead.emails.length > 0 ? lead.emails : [lead.email];
  const uniqueRecipients = Array.from(new Set(recipientEmails.filter(Boolean)));

  const outgoingMessageId = generateMessageId(susanEmail);
  const resendPayload: any = {
    from: `${susanName} <${susanEmail}>`,
    to: uniqueRecipients,
    cc: [companyEmail],
    subject,
    html: fullBody,
    headers: { ...threadHeaders, 'Message-ID': outgoingMessageId },
  };

  console.log(`Sending follow-up #${followUpNumber} to ${lead.name} (${uniqueRecipients.join(', ')})`);

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(resendPayload),
  });

  if (!emailResponse.ok) {
    const errorText = await emailResponse.text();
    console.error(`Resend error for ${lead.name}:`, errorText);
    return { lead: lead.name, status: 'error', error: `Resend: ${errorText}` };
  }

  await emailResponse.json();
  console.log(`✅ Follow-up #${followUpNumber} sent to ${lead.name}`);

  // Save to email_messages
  const { error: insertError } = await supabase.from('email_messages').insert({
    lead_id: lead.id,
    direction: 'outbound',
    subject,
    message: newMessage,
    html_body: fullBody,
    resend_message_id: outgoingMessageId,
  });

  if (insertError) console.error(`DB save error for ${lead.name}:`, insertError);

  // Schedule NEXT follow-up
  await scheduleNextFollowup(supabase, lead.id, followUpNumber + 1);

  return { lead: lead.name, status: 'sent', followUpNumber };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    await setActivityContext(supabase, { source: 'automation:followup-publicidade', actor: 'susan' });

    // Parse request body
    let forceAll = false;
    let stream = false;
    try {
      const body = await req.json();
      forceAll = body?.force_all === true;
      stream = body?.stream === true;
    } catch {
      // No body or invalid JSON — normal cron call
    }

    // Skip weekends (unless force_all)
    if (!forceAll && isWeekendInBrazil()) {
      console.log('Weekend in Brazil (UTC-3), skipping follow-ups');
      return new Response(JSON.stringify({ message: 'Weekend - skipped' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const settings = await getSettings(['susan_name', 'susan_email', 'company_name', 'company_email']);
    const susanName = settings.susan_name;
    const susanEmail = settings.susan_email;
    const companyName = settings.company_name;
    const companyEmail = settings.company_email;

    const now = new Date().toISOString();
    const results: any[] = [];

    if (forceAll) {
      // ============ FORCE ALL MODE ============
      console.log('=== FOLLOWUP PUBLICIDADE (FORCE ALL) - INÍCIO ===');

      const { data: allLeads, error: leadsError } = await supabase
        .from('leads')
        .select('id, name, email, emails, produto, status, unclassified, archived')
        .eq('produto', 'publicidade')
        .eq('status', 'em_aberto')
        .eq('archived', false)
        .eq('unclassified', false);

      if (leadsError) throw leadsError;

      const totalLeads = allLeads?.length || 0;
      console.log(`Total publicidade/em_aberto leads: ${totalLeads}`);

      // If streaming, use ReadableStream to send progress
      if (stream && forceAll) {
        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
          async start(controller) {
            // Send total count first
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'total', total: totalLeads }) + '\n'));
            
            let sent = 0, skipped = 0, errors = 0;

            for (let idx = 0; idx < totalLeads; idx++) {
              const lead = allLeads![idx];
              try {
                // Send processing event
                controller.enqueue(encoder.encode(JSON.stringify({ 
                  type: 'processing', 
                  lead: lead.name, 
                  current: idx + 1, 
                  total: totalLeads 
                }) + '\n'));

                if (!lead.email || lead.email.includes('@whatsapp.temp')) {
                  skipped++;
                  controller.enqueue(encoder.encode(JSON.stringify({ type: 'result', lead: lead.name, status: 'skipped', reason: 'no_valid_email' }) + '\n'));
                  continue;
                }

                const { data: emails, error: emailsError } = await supabase
                  .from('email_messages')
                  .select('id, direction, subject, message, timestamp, resend_message_id, raw_data')
                  .eq('lead_id', lead.id)
                  .order('timestamp', { ascending: true });

                if (emailsError || !emails || emails.length === 0) {
                  skipped++;
                  controller.enqueue(encoder.encode(JSON.stringify({ type: 'result', lead: lead.name, status: 'skipped', reason: 'no_emails' }) + '\n'));
                  continue;
                }

                const lastInboundStream = [...emails].reverse().find((e: any) => e.direction === 'inbound');
                if (lastInboundStream) {
                  const hSinceIn = (Date.now() - new Date(lastInboundStream.timestamp).getTime()) / (1000 * 60 * 60);
                  if (hSinceIn < 48) {
                    skipped++;
                    controller.enqueue(encoder.encode(JSON.stringify({ type: 'result', lead: lead.name, status: 'skipped', reason: `client_replied_${Math.round(hSinceIn)}h_ago` }) + '\n'));
                    continue;
                  }
                }

                let unansweredCount = 0;
                for (let i = emails.length - 1; i >= 0; i--) {
                  if (emails[i].direction === 'outbound') unansweredCount++;
                  else if (emails[i].direction === 'inbound') break;
                }

                if (unansweredCount === 0) {
                  skipped++;
                  controller.enqueue(encoder.encode(JSON.stringify({ type: 'result', lead: lead.name, status: 'skipped', reason: 'client_responded' }) + '\n'));
                  continue;
                }

                if (emails[emails.length - 1].direction === 'inbound') {
                  skipped++;
                  controller.enqueue(encoder.encode(JSON.stringify({ type: 'result', lead: lead.name, status: 'skipped', reason: 'last_email_is_inbound' }) + '\n'));
                  continue;
                }

                if (unansweredCount >= MAX_FOLLOWUPS) {
                  await supabase.from('scheduled_followups').upsert({
                    lead_id: lead.id, status: 'completed', attempt_number: unansweredCount,
                    next_run_at: now, updated_at: now,
                  }, { onConflict: 'lead_id' });
                  skipped++;
                  controller.enqueue(encoder.encode(JSON.stringify({ type: 'result', lead: lead.name, status: 'completed', reason: 'max_followups_reached' }) + '\n'));
                  continue;
                }

                const lastOutbound = [...emails].reverse().find(e => e.direction === 'outbound');
                if (lastOutbound) {
                  const hoursSince = (Date.now() - new Date(lastOutbound.timestamp).getTime()) / (1000 * 60 * 60);
                  if (hoursSince < 24) {
                    skipped++;
                    controller.enqueue(encoder.encode(JSON.stringify({ type: 'result', lead: lead.name, status: 'skipped', reason: `last_outbound_${Math.round(hoursSince)}h_ago` }) + '\n'));
                    continue;
                  }
                }

                const followUpNumber = unansweredCount + 1;
                const result = await processLead(
                  supabase, lead, followUpNumber,
                  susanName, susanEmail, companyName, companyEmail,
                  resendApiKey, LOVABLE_API_KEY, emails
                );
                
                if (result.status === 'sent') sent++;
                else if (result.status === 'error') errors++;
                else skipped++;
                
                controller.enqueue(encoder.encode(JSON.stringify({ type: 'result', ...result }) + '\n'));

              } catch (err: any) {
                if (err?.status === 429) {
                  errors++;
                  controller.enqueue(encoder.encode(JSON.stringify({ type: 'result', lead: lead.name, status: 'error', error: 'rate_limited' }) + '\n'));
                  break;
                }
                errors++;
                controller.enqueue(encoder.encode(JSON.stringify({ type: 'result', lead: lead.name, status: 'error', error: err.message }) + '\n'));
              }
            }

            // Send final summary
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'done', sent, skipped, errors, total: totalLeads }) + '\n'));
            controller.close();
          }
        });

        return new Response(readableStream, {
          headers: { ...corsHeaders, 'Content-Type': 'application/x-ndjson', 'Transfer-Encoding': 'chunked' },
        });
      }

      // Non-streaming force_all (fallback)
      for (const lead of (allLeads || [])) {
        try {
          if (!lead.email || lead.email.includes('@whatsapp.temp')) {
            results.push({ lead: lead.name, status: 'skipped', reason: 'no_valid_email' });
            continue;
          }

          const { data: emails, error: emailsError } = await supabase
            .from('email_messages')
            .select('id, direction, subject, message, timestamp, resend_message_id, raw_data')
            .eq('lead_id', lead.id)
            .order('timestamp', { ascending: true });

          if (emailsError || !emails || emails.length === 0) {
            results.push({ lead: lead.name, status: 'skipped', reason: 'no_emails' });
            continue;
          }

          const lastInboundFA = [...emails].reverse().find((e: any) => e.direction === 'inbound');
          if (lastInboundFA) {
            const hSinceFA = (Date.now() - new Date(lastInboundFA.timestamp).getTime()) / (1000 * 60 * 60);
            if (hSinceFA < 48) {
              results.push({ lead: lead.name, status: 'skipped', reason: `client_replied_${Math.round(hSinceFA)}h_ago` });
              continue;
            }
          }

          let unansweredCount = 0;
          for (let i = emails.length - 1; i >= 0; i--) {
            if (emails[i].direction === 'outbound') unansweredCount++;
            else if (emails[i].direction === 'inbound') break;
          }

          if (unansweredCount === 0) {
            results.push({ lead: lead.name, status: 'skipped', reason: 'client_responded' });
            continue;
          }

          if (emails[emails.length - 1].direction === 'inbound') {
            results.push({ lead: lead.name, status: 'skipped', reason: 'last_email_is_inbound' });
            continue;
          }

          if (unansweredCount >= MAX_FOLLOWUPS) {
            await supabase.from('scheduled_followups').upsert({
              lead_id: lead.id, status: 'completed', attempt_number: unansweredCount,
              next_run_at: now, updated_at: now,
            }, { onConflict: 'lead_id' });
            results.push({ lead: lead.name, status: 'completed', reason: 'max_followups_reached' });
            continue;
          }

          const lastOutbound = [...emails].reverse().find(e => e.direction === 'outbound');
          if (lastOutbound) {
            const hoursSince = (Date.now() - new Date(lastOutbound.timestamp).getTime()) / (1000 * 60 * 60);
            if (hoursSince < 24) {
              results.push({ lead: lead.name, status: 'skipped', reason: `last_outbound_${Math.round(hoursSince)}h_ago` });
              continue;
            }
          }

          const followUpNumber = unansweredCount + 1;
          const result = await processLead(
            supabase, lead, followUpNumber,
            susanName, susanEmail, companyName, companyEmail,
            resendApiKey, LOVABLE_API_KEY, emails
          );
          results.push(result);

        } catch (err: any) {
          if (err?.status === 429) {
            results.push({ lead: lead.name, status: 'error', error: 'rate_limited' });
            break;
          }
          results.push({ lead: lead.name, status: 'error', error: err.message });
        }
      }

    } else {
      // ============ NORMAL QUEUE MODE ============
      console.log('=== FOLLOWUP PUBLICIDADE (QUEUE-BASED) - INÍCIO ===');

      const { data: dueFollowups, error: queueError } = await supabase
        .from('scheduled_followups')
        .select('id, lead_id, attempt_number')
        .eq('status', 'pending')
        .lte('next_run_at', now)
        .order('next_run_at', { ascending: true });

      if (queueError) throw queueError;

      console.log(`Follow-ups due: ${dueFollowups?.length || 0}`);
      if (!dueFollowups || dueFollowups.length === 0) {
        return new Response(JSON.stringify({ message: 'Nenhum follow-up pendente', processed: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      for (const job of dueFollowups) {
        try {
          const { data: lead, error: leadError } = await supabase
            .from('leads')
            .select('id, name, email, emails, produto, status, unclassified, archived')
            .eq('id', job.lead_id)
            .single();

          if (leadError || !lead) {
            await supabase.from('scheduled_followups').update({ status: 'cancelled', updated_at: now }).eq('id', job.id);
            results.push({ lead_id: job.lead_id, status: 'cancelled', reason: 'lead_not_found' });
            continue;
          }

          console.log(`\n--- ${lead.name} (${lead.id}) attempt #${job.attempt_number} ---`);

          // Eligibility checks
          if (lead.produto !== 'publicidade') {
            await supabase.from('scheduled_followups').update({ status: 'cancelled', updated_at: now }).eq('id', job.id);
            results.push({ lead: lead.name, status: 'cancelled', reason: 'not_publicidade' });
            continue;
          }
          if (lead.status !== 'em_aberto') {
            await supabase.from('scheduled_followups').update({ status: 'cancelled', updated_at: now }).eq('id', job.id);
            results.push({ lead: lead.name, status: 'cancelled', reason: `status_${lead.status}` });
            continue;
          }
          if (lead.archived || lead.unclassified) {
            await supabase.from('scheduled_followups').update({ status: 'cancelled', updated_at: now }).eq('id', job.id);
            results.push({ lead: lead.name, status: 'cancelled', reason: 'archived_or_unclassified' });
            continue;
          }
          if (!lead.email || lead.email.includes('@whatsapp.temp')) {
            await supabase.from('scheduled_followups').update({ status: 'cancelled', updated_at: now }).eq('id', job.id);
            results.push({ lead: lead.name, status: 'cancelled', reason: 'no_valid_email' });
            continue;
          }

          // Fetch emails
          const { data: emails, error: emailsError } = await supabase
            .from('email_messages')
            .select('id, direction, subject, message, timestamp, resend_message_id, raw_data')
            .eq('lead_id', lead.id)
            .order('timestamp', { ascending: true });

          if (emailsError || !emails || emails.length === 0) {
            results.push({ lead: lead.name, status: 'skipped', reason: 'no_emails' });
            await scheduleNextFollowup(supabase, lead.id, job.attempt_number + 1);
            continue;
          }

          // Check unanswered count
          // Guard: se o cliente respondeu recentemente (últimas 48h), NÃO mandar follow-up
          // mesmo que já tenhamos respondido depois. Isso evita duplicação quando a conversa está viva.
          const lastInbound = [...emails].reverse().find((e: any) => e.direction === 'inbound');
          if (lastInbound) {
            const hoursSinceInbound = (Date.now() - new Date(lastInbound.timestamp).getTime()) / (1000 * 60 * 60);
            if (hoursSinceInbound < 48) {
              await supabase.from('scheduled_followups').update({ status: 'cancelled', updated_at: now }).eq('id', job.id);
              results.push({ lead: lead.name, status: 'cancelled', reason: `client_replied_${Math.round(hoursSinceInbound)}h_ago` });
              continue;
            }
          }

          let unansweredCount = 0;
          for (let i = emails.length - 1; i >= 0; i--) {
            if (emails[i].direction === 'outbound') {
              unansweredCount++;
            } else if (emails[i].direction === 'inbound') {
              break;
            }
          }

          if (unansweredCount >= MAX_FOLLOWUPS) {
            await supabase.from('scheduled_followups').update({ status: 'completed', attempt_number: unansweredCount, updated_at: now }).eq('id', job.id);
            results.push({ lead: lead.name, status: 'completed', reason: 'max_followups_reached', count: unansweredCount });
            continue;
          }

          if (unansweredCount === 0) {
            await supabase.from('scheduled_followups').update({ status: 'cancelled', updated_at: now }).eq('id', job.id);
            results.push({ lead: lead.name, status: 'cancelled', reason: 'client_responded' });
            continue;
          }

          // Guard: último email DEVE ser outbound (estamos esperando o cliente).
          // Se o último for inbound, a conversa está com a bola do nosso lado — não é caso de follow-up.
          const lastEmailInList = emails[emails.length - 1];
          if (lastEmailInList.direction === 'inbound') {
            await supabase.from('scheduled_followups').update({ status: 'cancelled', updated_at: now }).eq('id', job.id);
            results.push({ lead: lead.name, status: 'cancelled', reason: 'last_email_is_inbound' });
            continue;
          }

          const followUpNumber = unansweredCount + 1;
          console.log(`Follow-up #${followUpNumber} for ${lead.name}`);

          const result = await processLead(
            supabase, lead, followUpNumber,
            susanName, susanEmail, companyName, companyEmail,
            resendApiKey, LOVABLE_API_KEY, emails
          );

          if (result.status === 'error') {
            await supabase.from('scheduled_followups').update({ 
              last_error: result.error, 
              updated_at: now 
            }).eq('id', job.id);
          }

          results.push(result);

        } catch (err: any) {
          if (err?.status === 429) {
            results.push({ lead_id: job.lead_id, status: 'error', error: 'rate_limited' });
            break;
          }
          console.error(`Error processing lead ${job.lead_id}:`, err);
          results.push({ lead_id: job.lead_id, status: 'error', error: err.message });
        }
      }
    }

    console.log('\n=== FOLLOWUP PUBLICIDADE - FIM ===');
    console.log('Results:', JSON.stringify(results));

    const sent = results.filter(r => r.status === 'sent').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const errors = results.filter(r => r.status === 'error').length;

    return new Response(JSON.stringify({ 
      results, 
      processed: results.length,
      sent,
      skipped,
      errors,
      mode: forceAll ? 'force_all' : 'queue',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('General error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
