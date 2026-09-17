import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { getPrompt } from "../_shared/get-prompt.ts";
import { getSettings } from "../_shared/get-settings.ts";
import { getSystemUserEmails } from "../_shared/system-users.ts";
import { AUDIENCE_FACTS } from "../_shared/audience-facts.ts";
import { generateMessageId } from "../_shared/email-threading.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// These will be overridden by system_settings at runtime
let ASSISTANT_EMAIL = 'assistant@inventorteam.link';
let ASSISTANT_NAME = 'Atendimento COC Macapá Norte';
let COMPANY_NAME = 'COC Macapá Norte';
let COMPANY_EMAIL = 'team@inventorteam.com';
const TEAM_EMAILS = [
  'team@inventorteam.com',
  'team@inventosdigitais.com.br',
];
const INTERNAL_ASSISTANT_EMAILS = ['assistant@inventorteam.link'];
let IGNORED_EMAILS: string[] = [...INTERNAL_ASSISTANT_EMAILS, ...TEAM_EMAILS];
const INTERNAL_DOMAINS = ['inventosdigitais.com.br', 'inventorteam.com', 'inventorteam.link'];
const isInternalDomain = (email: string) => INTERNAL_DOMAINS.some(d => email.toLowerCase().endsWith(`@${d}`));
// Sistema users (funcionários) — populado a cada request a partir do auth.users
let SYSTEM_USER_EMAILS: string[] = [];
const isSystemUser = (email: string) => SYSTEM_USER_EMAILS.includes(email.toLowerCase());

function normalizeMessageIdForDb(id?: string | null): string | null {
  if (!id) return null;
  const cleaned = String(id).trim().replace(/[<>]/g, '').toLowerCase();
  return cleaned || null;
}

async function associateCCEmailsToLeadSafe(supabase: any, leadId: string, candidateEmails: string[], currentEmails: string[]) {
  for (const email of candidateEmails) {
    const emailLower = email.toLowerCase();
    if (isInternalDomain(emailLower)) continue;
    if (isSystemUser(emailLower)) {
      console.log(`CC ${emailLower} é usuário do sistema (funcionário), ignorando`);
      continue;
    }
    if (currentEmails.includes(emailLower)) continue;

    // Verifica se já pertence a outro lead
    const { data: otherLead } = await supabase
      .from('leads')
      .select('id')
      .or(`email.ilike.${emailLower},emails.cs.{${emailLower}}`)
      .neq('id', leadId)
      .maybeSingle();

    if (otherLead) {
      console.log(`CC ${emailLower} já pertence a outro lead (${otherLead.id}), ignorando`);
      continue;
    }

    const updated = [...currentEmails, emailLower];
    const { error } = await supabase.from('leads').update({ emails: updated }).eq('id', leadId);
    if (error) {
      console.error('Error associating CC email to lead:', error);
    } else {
      console.log('✅ Associated CC email to lead:', emailLower);
      currentEmails.push(emailLower);
    }
  }
}

const PROPOSAL_VALUE = 3000;
const PROPOSAL_CURRENCY = 'USD';

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }
  return result;
}

function formatDate(date: Date, lang: string): string {
  const locale = lang.toLowerCase().includes('portug') ? 'pt-BR' : 'en-US';
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function sanitizeStorageKey(filename: string): string {
  return filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 100);
}

function extractCleanEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  const emailMatch = raw.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) return emailMatch[0].toLowerCase();
  return raw.trim().toLowerCase();
}

function extractDisplayName(raw: string, email: string): string {
  const beforeAddress = raw.split('<')[0]?.replace(/^"|"$/g, '').trim();
  if (beforeAddress && !beforeAddress.includes('@')) return beforeAddress;
  const handle = email.split('@')[0] || 'Lead';
  return handle
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || 'Lead';
}

function extractHeaderValue(headers: any, names: string[]): string | null {
  if (!headers) return null;
  const lowerNames = names.map((name) => name.toLowerCase());
  if (Array.isArray(headers)) {
    const found = headers.find((h: any) => lowerNames.includes(String(h?.name || h?.key || '').toLowerCase()));
    return found?.value || null;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (lowerNames.includes(key.toLowerCase())) return String(value);
  }
  return null;
}

function splitRecipientHeader(value: string): string[] {
  return value
    .split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)|;/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeRecipientList(input: any): string[] {
  if (!input) return [];
  const rawItems = Array.isArray(input) ? input : [input];
  const normalized: string[] = [];

  for (const item of rawItems) {
    if (!item) continue;
    if (typeof item === 'string') {
      const parts = splitRecipientHeader(item);
      for (const part of parts.length ? parts : [item]) {
        const email = extractCleanEmail(part);
        if (email) normalized.push(email.toLowerCase());
      }
      continue;
    }

    const candidate = item.email || item.address || item.value || item.text || item.name;
    if (candidate) {
      const email = extractCleanEmail(String(candidate));
      if (email) normalized.push(email.toLowerCase());
    }
  }

  return Array.from(new Set(normalized));
}

function isAssistantRecipient(email: string): boolean {
  const clean = extractCleanEmail(email).toLowerCase();
  return INTERNAL_ASSISTANT_EMAILS.some((assistant) => clean === assistant || email.toLowerCase().includes(assistant));
}

async function fetchEmailContent(emailId: string, resendApiKey: string): Promise<{ text: string; html: string; messageId: string | null }> {
  let text = '';
  let html = '';
  let messageId: string | null = null;
  try {
    console.log('Fetching full email content from Resend API for email_id:', emailId);
    const resp = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { 'Authorization': `Bearer ${resendApiKey}` },
    });
    if (resp.ok) {
      const fullEmail = await resp.json();
      text = fullEmail.text || '';
      html = fullEmail.html || '';
      messageId = fullEmail.message_id || fullEmail.messageId || extractHeaderValue(fullEmail.headers, ['Message-ID', 'Message-Id', 'message-id']);
      console.log('Fetched email content - text length:', text.length, 'html length:', html.length);
    } else {
      console.error('Failed to fetch email content:', resp.status);
    }
  } catch (err) {
    console.error('Error fetching email content from Resend:', err);
  }
  return { text, html, messageId };
}

async function findExistingLead(supabase: any, emails: string[]): Promise<any | null> {
  // Regras (jul/2026):
  // - Se existe lead ATIVO (em_negociacao, em_aberto, ganho, produzido) com o mesmo email, linka nele.
  // - Se o único match é `entregue` ou `perdido`, RETORNA null para criar novo lead
  //   (entregue = cliente recorrente; perdido = nova oportunidade após rejeição anterior).
  // - Match case-insensitive (ilike) para evitar duplicatas por capitalização.
  const STATUS_PRIORITY: Record<string, number> = {
    em_negociacao: 0,
    em_aberto: 1,
    ganho: 2,
    produzido: 3,
    // `entregue` e `perdido` intencionalmente fora — tratados como "sem match"
  };
  const CLOSED_STATUSES = new Set(['entregue', 'perdido']);

  const seen = new Set<string>();
  for (const rawEmail of emails) {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);

    const { data, error } = await supabase
      .from('leads')
      .select('id, name, email, emails, status, updated_at')
      .or(`email.ilike.${email},emails.cs.{${email}}`)
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error searching for existing lead:', error);
      continue;
    }
    const rows = (data || []).filter((l: any) => {
      const primary = String(l.email || '').toLowerCase();
      const arr = (l.emails || []).map((e: any) => String(e || '').toLowerCase());
      return primary === email || arr.includes(email);
    });
    if (rows.length === 0) continue;

    // Filtra fora leads `entregue` e `perdido` — inbound novo deve criar oportunidade nova
    const linkable = rows.filter((l: any) => !CLOSED_STATUSES.has(l.status));
    if (linkable.length === 0) {
      console.log(`Só existem leads fechados (entregue/perdido) para ${email} — criando lead novo.`);
      continue;
    }

    linkable.sort((a: any, b: any) => {
      const pa = STATUS_PRIORITY[a.status] ?? 99;
      const pb = STATUS_PRIORITY[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
    });
    const chosen = linkable[0];
    console.log(`Found existing lead: ${chosen.id} "${chosen.name}" (${chosen.status}) for email: ${email} — ${rows.length} candidato(s), ${rows.length - linkable.length} fechado(s) ignorado(s)`);
    return chosen;

  }
  return null;
}

// Strip Equipe's preamble from a forwarded email and return just the original client message.
// When Equipe forwards to Assistente Escolar with an instruction like "assistant, manda a proposta",
// the actual client content lives below a quote marker ("On <date>, X wrote:", "Em <data>... escreveu:",
// "----- Original Message -----", "De: ..."). This returns that quoted block, cleaned.
function extractForwardedClientMessage(text: string, html: string): { text: string; html: string; isForwarded: boolean } {
  const raw = (text || '').trim();
  if (!raw) return { text, html, isForwarded: false };

  const markers: RegExp[] = [
    /^\s*On\s+.{1,250}?\s+wrote:\s*$/im,
    /^\s*Em\s+.{1,250}?\s+(escreveu|escribi[oó]):\s*$/im,
    /^\s*Le\s+.{1,250}?\s+a\s+écrit\s*:\s*$/im,
    /^\s*Am\s+.{1,250}?\s+schrieb\s+.{0,120}?:\s*$/im,
    /^-{2,}\s*(Original Message|Mensagem original|Forwarded message|Mensagem encaminhada|Begin forwarded message|Mensaje original|Message transféré)\s*-{2,}\s*$/im,
    /^\s*(De|From|Von):\s*.+$/im,
  ];

  let earliest = -1;
  for (const re of markers) {
    const m = raw.match(re);
    if (m && typeof m.index === 'number') {
      if (earliest === -1 || m.index < earliest) earliest = m.index;
    }
  }

  if (earliest === -1) {
    const inline = raw.match(/\bOn\s+[A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4}[^\n]{0,200}?wrote:\s*/);
    if (inline && typeof inline.index === 'number') earliest = inline.index;
  }

  if (earliest === -1) return { text, html, isForwarded: false };

  const body = raw.slice(earliest);
  const lines = body.split('\n');
  lines.shift(); // drop the marker line itself
  while (lines.length && /^\s*$/.test(lines[0])) {
    lines.shift();
  }
  while (lines.length && /^\s*(From|De|To|Para|Cc|Cco|Bcc|Subject|Assunto|Date|Data|Sent|Enviada?|Reply-To)\s*:/i.test(lines[0])) {
    lines.shift();
    while (lines.length && /^\s*$/.test(lines[0])) {
      lines.shift();
    }
  }
  const cleaned = lines.map(l => l.replace(/^\s*>+\s?/, '')).join('\n').trim();

  if (cleaned.length < 20) return { text, html, isForwarded: false };

  console.log('✂️ Stripped Equipe preamble. Original len:', raw.length, '→ extracted:', cleaned.length);
  return { text: cleaned, html: '', isForwarded: true };
}



async function saveInboundEmail(supabase: any, leadId: string, subject: string, text: string, html: string, timestamp: string, messageId?: string | null): Promise<string | null> {
  const insertPayload: Record<string, any> = {
    lead_id: leadId,
    direction: 'inbound',
    subject: subject || null,
    message: text || null,
    html_body: html || null,
    timestamp: timestamp || new Date().toISOString(),
  };
  if (messageId) {
    insertPayload.resend_message_id = messageId;
    insertPayload.internet_message_id = normalizeMessageIdForDb(messageId);
    insertPayload.raw_data = { headers: { 'Message-ID': messageId } };
  }

  const { data, error } = await supabase
    .from('email_messages')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error) {
    console.error('Error saving inbound email:', error);
    return null;
  }
  console.log('✅ Inbound email saved to lead:', leadId, 'row id:', data?.id, 'rfc message-id:', messageId || '(none)');
  return data?.id || null;
}

async function saveOutboundEmail(supabase: any, leadId: string, subject: string, text: string, html: string, timestamp: string, messageId?: string | null): Promise<string | null> {
  // Deduplication: check if same outbound email already exists (saved by another webhook)
  const ts = timestamp || new Date().toISOString();
  const windowStart = new Date(new Date(ts).getTime() - 5 * 60 * 1000).toISOString();
  const windowEnd = new Date(new Date(ts).getTime() + 5 * 60 * 1000).toISOString();
  
  const { data: existing } = await supabase
    .from('email_messages')
    .select('id')
    .eq('lead_id', leadId)
    .eq('direction', 'outbound')
    .gte('created_at', windowStart)
    .lte('created_at', windowEnd)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log('⏭️ Outbound email already exists (dedup), skipping save. Existing id:', existing[0].id);
    return existing[0].id;
  }

  const insertPayload: Record<string, any> = {
    lead_id: leadId,
    direction: 'outbound',
    subject: subject || null,
    message: text || null,
    html_body: html || null,
    timestamp: ts,
  };
  if (messageId) {
    insertPayload.resend_message_id = messageId;
    insertPayload.internet_message_id = normalizeMessageIdForDb(messageId);
    insertPayload.raw_data = { headers: { 'Message-ID': messageId } };
  }

  const { data, error } = await supabase
    .from('email_messages')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error) {
    console.error('Error saving outbound email:', error);
    return null;
  }
  console.log('✅ Outbound email saved to lead:', leadId, 'message id:', data?.id);
  return data?.id || null;
}

async function createLeadFromExternalEmail(supabase: any, fromRaw: string, subject: string, text: string, html: string, timestamp: string, messageId?: string | null): Promise<{ leadId: string; leadName: string; emailMessageId: string | null }> {
  const senderEmail = extractCleanEmail(fromRaw);
  const senderName = extractDisplayName(fromRaw, senderEmail);
  const { isInternalEmail, isInternalName } = await import("../_shared/internal-contacts.ts");
  if (isInternalEmail(senderEmail) || isInternalName(senderName)) {
    throw new Error(`Contato interno bloqueado: ${senderEmail} (${senderName}) nunca pode virar lead.`);
  }
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .insert({
      name: senderName,
      email: senderEmail,
      emails: [senderEmail],
      phones: [],
      message: `Assunto: ${subject}\n\n${text || stripHtmlSimple(html || '')}`.trim(),
      source: 'resend-inbound',
      origem: 'email',
      status: 'em_aberto',
    })
    .select('id, name')
    .single();

  if (leadError) {
    console.error('Error creating lead from external Resend email:', leadError);
    throw new Error(`Failed to create lead from Resend inbound: ${leadError.message}`);
  }

  const emailMessageId = await saveInboundEmail(supabase, lead.id, subject, text, html, timestamp, messageId || null);
  console.log('✅ External Resend email created lead:', lead.id, lead.name);
  return { leadId: lead.id, leadName: lead.name, emailMessageId };
}

// --- Process and save email attachments ---
async function processEmailAttachments(supabase: any, resendApiKey: string, resendEmailId: string, leadId: string, emailMessageId: string | null) {
  try {
    console.log('Checking for attachments on email:', resendEmailId);
    
    // List attachments via Resend API
    const listResp = await fetch(`https://api.resend.com/emails/receiving/${resendEmailId}/attachments`, {
      headers: { 'Authorization': `Bearer ${resendApiKey}` },
    });
    
    if (!listResp.ok) {
      console.log('No attachments or error listing:', listResp.status);
      return;
    }
    
    const attachmentsList = await listResp.json();
    const attachments = attachmentsList.data || attachmentsList || [];
    
    if (!Array.isArray(attachments) || attachments.length === 0) {
      console.log('No attachments found for this email');
      return;
    }
    
    console.log(`Found ${attachments.length} attachment(s), processing...`);
    
    for (const att of attachments) {
      try {
        // Get attachment details with download_url
        const detailResp = await fetch(`https://api.resend.com/emails/receiving/${resendEmailId}/attachments/${att.id}`, {
          headers: { 'Authorization': `Bearer ${resendApiKey}` },
        });
        
        if (!detailResp.ok) {
          console.error('Error fetching attachment detail:', att.id, detailResp.status);
          continue;
        }
        
        const attDetail = await detailResp.json();
        const downloadUrl = attDetail.download_url;
        
        if (!downloadUrl) {
          console.error('No download_url for attachment:', att.id);
          continue;
        }
        
        // Download the file
        const fileResp = await fetch(downloadUrl);
        if (!fileResp.ok) {
          console.error('Error downloading attachment:', att.filename, fileResp.status);
          continue;
        }
        
        const fileBlob = await fileResp.blob();
        const fileBuffer = await fileBlob.arrayBuffer();

        // --- Deduplication: compute SHA-256 hash ---
        const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Check if this file (even if deleted) was already processed for this lead
        const { data: existing } = await supabase
          .from('email_attachments')
          .select('id, deleted_at')
          .eq('lead_id', leadId)
          .eq('content_hash', contentHash)
          .limit(1)
          .maybeSingle();

        if (existing) {
          console.log(`⏭️ Skipping duplicate attachment "${att.filename}" (hash already exists, deleted: ${!!existing.deleted_at})`);
          continue;
        }

        // Upload to Supabase Storage
        const safeFilename = sanitizeStorageKey(att.filename || 'attachment');
        const storagePath = `${leadId}/${Date.now()}_${safeFilename}`;
        const { error: uploadError } = await supabase.storage
          .from('email-attachments')
          .upload(storagePath, new Uint8Array(fileBuffer), {
            contentType: att.content_type || 'application/octet-stream',
            upsert: false,
          });
        
        if (uploadError) {
          console.error('Error uploading attachment to storage:', uploadError);
          continue;
        }
        
        // Save record in email_attachments table with content hash
        const { error: insertError } = await supabase
          .from('email_attachments')
          .insert({
            email_message_id: emailMessageId,
            lead_id: leadId,
            filename: att.filename || 'attachment',
            content_type: att.content_type || null,
            size_bytes: att.size || null,
            storage_path: storagePath,
            content_hash: contentHash,
          });
        
        if (insertError) {
          console.error('Error saving attachment record:', insertError);
        } else {
          console.log('✅ Attachment saved:', att.filename, storagePath);
        }
      } catch (attErr) {
        console.error('Error processing attachment:', att.filename, attErr);
      }
    }
  } catch (err) {
    console.error('Error in processEmailAttachments (non-fatal):', err);
  }
}

// --- Intent analysis: does Equipe want Assistente Escolar to take action? ---
async function analyzeIntent(
  emailContent: string, emailSubject: string, LOVABLE_API_KEY: string
): Promise<boolean> {
  console.log('Analyzing Equipe intent...');
  const defaultIntentPrompt = `Analyze this email that involves COC Macapá Norte and/or his assistant Assistente Escolar.

Your job is to determine: Is Equipe INSTRUCTING Assistente Escolar to take action (send a proposal, reply to the client, etc.)?

CRITICAL DISTINCTION:
1. If Equipe is writing DIRECTLY TO THE CLIENT (e.g. accepting an offer, negotiating, asking for a briefing, responding to a question) — even if Assistente Escolar is in CC — this means Equipe handled it himself. Assistente Escolar should NOT respond. Return false.
2. If Equipe is FORWARDING an email TO Assistente Escolar with instructions (e.g. "Assistente Escolar, manda a proposta", "envia pra ele", "faz o contato comercial", "segue com a proposta") — Assistente Escolar should act. Return true.
3. If Equipe is simply CC'ing Assistente Escolar on a conversation he is handling directly with the client — Assistente Escolar should NOT respond. Return false.

KEY SIGNALS that Equipe is handling it himself (return FALSE):
- Equipe addresses the client by name in the email
- Equipe accepts/rejects/negotiates terms directly
- Equipe asks the client for something (briefing, information, etc.)
- The email tone is a direct conversation with the client
- Assistente Escolar is only in CC for visibility

KEY SIGNALS that Equipe wants Assistente Escolar to act (return TRUE):
- Equipe addresses Assistente Escolar directly ("Assistente Escolar, ...", "Hey Assistente Escolar")
- Equipe gives explicit instructions ("manda", "envia", "faz", "segue com")
- Equipe forwards an email with instructions for Assistente Escolar to follow up
- The email is clearly an internal instruction, not a client-facing message

When in doubt, return FALSE. It's better for Assistente Escolar to not respond than to respond incorrectly.

Subject: {emailSubject}

Content:
{emailContent}`;

  const prompt = await getPrompt("3", defaultIntentPrompt, {
    emailSubject,
    emailContent: emailContent.substring(0, 3000) || '(empty)',
  });

  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You analyze emails to determine intent. Always respond using the tool provided. When in doubt, default to false — it is better to NOT act than to act incorrectly.' },
        { role: 'user', content: prompt },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'analyze_intent',
          description: 'Determine if Equipe is instructing Assistente Escolar to send a proposal or take action',
          parameters: {
            type: 'object',
            properties: {
              should_send_proposal: { type: 'boolean', description: 'True ONLY if Equipe is explicitly instructing Assistente Escolar to send a proposal/quote/price to the client. False if Equipe is handling the communication himself.' },
              reasoning: { type: 'string', description: 'Brief explanation of why this intent was determined' },
            },
            required: ['should_send_proposal', 'reasoning'],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'analyze_intent' } },
    }),
  });

  if (!resp.ok) {
    console.error('Intent analysis failed:', resp.status);
    return false;
  }

  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    console.log('No tool call returned for intent, defaulting to false');
    return false;
  }

  const result = JSON.parse(toolCall.function.arguments);
  console.log('Intent analysis result:', result.should_send_proposal, '- Reasoning:', result.reasoning);
  return result.should_send_proposal === true;
}

// --- Media Kit request analysis ---
async function analyzeMediaKitRequest(
  emailContent: string, emailHistory: string, LOVABLE_API_KEY: string
): Promise<boolean> {
  console.log('Analyzing if client is requesting Media Kit...');
  const defaultMediaKitPrompt = `Analyze this email from a client responding to a partnership/advertising proposal.

Is the client asking for any of the following:
- Media Kit / Press Kit
- Demographics / audience data
- Reach numbers / engagement metrics
- Portfolio / case studies / previous work
- Rate card / pricing table / media table
- Information about Equipe's audience, followers, or content performance

This is specifically about the client REQUESTING information/data, not about declining or accepting a proposal.

Latest client email:
{emailContent}

Conversation history for context:
{emailHistory}`;

  const prompt = await getPrompt("23", defaultMediaKitPrompt, {
    emailContent: emailContent.substring(0, 3000),
    emailHistory: emailHistory.substring(0, 5000),
  });

  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'user', content: prompt },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'detect_media_kit_request',
          description: 'Determine if the client is requesting Media Kit, demographics, or similar data',
          parameters: {
            type: 'object',
            properties: {
              is_media_kit_request: { type: 'boolean', description: 'True if the client is asking for Media Kit, demographics, reach numbers, portfolio, rate card, or similar information' },
            },
            required: ['is_media_kit_request'],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'detect_media_kit_request' } },
    }),
  });

  if (!resp.ok) {
    console.error('Media Kit request analysis failed:', resp.status);
    return false;
  }

  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    console.log('No tool call returned for Media Kit request, defaulting to false');
    return false;
  }

  const result = JSON.parse(toolCall.function.arguments);
  console.log('Media Kit request analysis result:', result.is_media_kit_request);
  return result.is_media_kit_request === true;
}

// --- Stats / audience details request analysis ---
async function analyzeStatsRequest(
  emailContent: string, emailHistory: string, LOVABLE_API_KEY: string
): Promise<boolean> {
  console.log('Analyzing if client is requesting traffic/audience stats...');
  const prompt = `Analyze this email from a client (publicidade lead) responding in an active partnership conversation.

Is the client specifically asking for any of the following DETAILED metrics/breakdowns:
- Audience sources / traffic sources
- Country breakdown / geography of audience
- Detailed view counts per post or per piece of content
- Profile activity, profile visits, external link taps
- Reach/impressions breakdown
- Top-performing content statistics
- Any Instagram/social analytics screenshot-style data

Important: This is a follow-up question after the client has already received initial info (like a Media Kit). They want MORE granular data — stats/screenshots/breakdowns.

Do NOT return true if the client is just asking for the Media Kit/Press Kit/general info — that is handled separately.
Do NOT return true if the client is rejecting, accepting, or negotiating price.

Latest client email:
${emailContent.substring(0, 3000)}

Conversation history for context:
${emailHistory.substring(0, 5000)}`;

  try {
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        tools: [{
          type: 'function',
          function: {
            name: 'detect_stats_request',
            description: 'Determine if the client is asking for detailed traffic/audience stats',
            parameters: {
              type: 'object',
              properties: {
                is_stats_request: { type: 'boolean', description: 'True if asking for detailed stats/audience sources/country breakdown/views breakdown' },
              },
              required: ['is_stats_request'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'detect_stats_request' } },
      }),
    });
    if (!resp.ok) { console.error('Stats request analysis failed:', resp.status); return false; }
    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return false;
    const result = JSON.parse(toolCall.function.arguments);
    console.log('Stats request analysis result:', result.is_stats_request);
    return result.is_stats_request === true;
  } catch (err) {
    console.error('Error in analyzeStatsRequest:', err);
    return false;
  }
}

// --- Generate Media Kit reply ---
async function generateMediaKitReply(
  lead: any, emailHistory: string, mediaKitLink: string, LOVABLE_API_KEY: string
): Promise<{ subject: string; body: string }> {
  console.log('Generating Media Kit reply for lead:', lead.name);

  const defaultMediaKitReplyPrompt = `You are ${ASSISTANT_NAME}, executive assistant to ${COMPANY_NAME}, a content creator and AI keynote speaker.

A client has asked for demographics, Media Kit, reach numbers, portfolio, or similar information. You need to reply sending the Media Kit link.

CRITICAL LANGUAGE RULE: Analyze the ENTIRE email history below. Identify the language the CLIENT uses in their messages. Write your ENTIRE reply in that SAME language.

INSTRUCTIONS:
- Write as ${ASSISTANT_NAME}, ${COMPANY_NAME}'s assistant, in first person
- Show enthusiasm - say that ${COMPANY_NAME} would love this partnership
- Share the Media Kit link: {mediaKitLink}
- Say the link contains all the information they need (demographics, reach, audience data, previous partnerships, etc.)
- Invite them to reach out with any questions
- Be professional, warm and concise - maximum 6-8 lines for the body
- DO NOT include any signature, it will be added automatically
- DO NOT include "Subject:" or "Assunto:" prefix

Lead name: {leadName}

Full email history (use this to determine the client's language):
{emailHistory}

Return ONLY in this format:
Subject: [subject line in the client's language]

[body - just the new message, no signature]`;

  const prompt = await getPrompt("24", defaultMediaKitReplyPrompt, {
    assistantName: ASSISTANT_NAME,
    companyName: COMPANY_NAME,
    leadName: lead.name,
    emailHistory,
    mediaKitLink,
  });

  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('Media Kit reply generation failed:', resp.status, errText);
    throw new Error(`Media Kit reply generation failed: ${resp.status}`);
  }

  const data = await resp.json();
  const generatedEmail = data.choices[0].message.content;

  const lines = generatedEmail.split('\n');
  let subject = '';
  let body = '';

  if (lines[0].toLowerCase().startsWith('assunto:') || lines[0].toLowerCase().startsWith('subject:')) {
    subject = lines[0].replace(/^(Assunto|Subject):\s*/i, '').trim();
    body = lines.slice(2).join('\n').trim();
  } else {
    subject = `Re: ${lead.name}`;
    body = generatedEmail.trim();
  }

  return { subject, body };
}

// --- Budget rejection analysis ---
async function analyzeBudgetRejection(
  emailContent: string, emailHistory: string, LOVABLE_API_KEY: string
): Promise<boolean> {
  console.log('Analyzing if client email is a budget rejection...');
  const defaultBudgetPrompt = `Analyze this email from a client responding to a partnership/advertising proposal.

Is the client raising a BUDGET OBJECTION — saying the proposed price is above their budget, that they have budget constraints, or that they need internal budget confirmation BECAUSE the price is high — WITHOUT offering a concrete alternative amount?

This includes SOFT objections, not only hard rejections. Examples: "budget constraints", "above our current budget", "exceeds our budget", "unable to move forward", "limited budget", "we don't have the budget", "waiting for internal confirmation on budget", "need to check the budget internally", "não temos verba", "acima do nosso orçamento", "pas de budget pour le moment", "limited creator slots for this campaign".

Do NOT flag as budget objection if: the client already proposed a specific alternative amount (e.g. "we can do $1,500"), or the hesitation is about timing/formats/other topics unrelated to price.

This does NOT include: rejections for timing, fit, relevance, or other non-financial reasons.

Latest client email:
{emailContent}

Conversation history for context:
{emailHistory}`;

  const prompt = await getPrompt("4", defaultBudgetPrompt, {
    emailContent: emailContent.substring(0, 3000),
    emailHistory: emailHistory.substring(0, 5000),
  });

  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You analyze client emails to detect budget-related rejections. Always respond using the tool provided.' },
        { role: 'user', content: prompt },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'detect_budget_rejection',
          description: 'Determine if the client is raising a budget objection (price above budget, budget constraints, or awaiting internal budget confirmation because of price) without offering a concrete alternative amount. Includes soft objections, not only hard rejections.',
          parameters: {
            type: 'object',
            properties: {
              is_budget_rejection: { type: 'boolean', description: 'True if the client raises a budget/price objection (including soft ones like "above our budget, awaiting internal confirmation") without offering a concrete alternative amount' },
            },
            required: ['is_budget_rejection'],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'detect_budget_rejection' } },
    }),
  });

  if (!resp.ok) {
    console.error('Budget rejection analysis failed:', resp.status);
    return false;
  }

  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    console.log('No tool call returned for budget rejection, defaulting to false');
    return false;
  }

  const result = JSON.parse(toolCall.function.arguments);
  console.log('Budget rejection analysis result:', result.is_budget_rejection);
  return result.is_budget_rejection === true;
}

// --- Generate rejection counter-reply ---
async function generateRejectionReply(
  lead: any, emailHistory: string, LOVABLE_API_KEY: string
): Promise<{ subject: string; body: string }> {
  console.log('Generating rejection counter-reply for lead:', lead.name);

  const defaultRejectionPrompt = `You are ${ASSISTANT_NAME}, executive assistant to ${COMPANY_NAME}, a content creator and AI keynote speaker.

A client has raised a BUDGET OBJECTION to a partnership proposal (price above their budget, or awaiting internal budget confirmation). You need to write a persuasive counter-reply with a specific negotiation strategy.

CRITICAL LANGUAGE RULE: Analyze the ENTIRE email history below. Identify the language the CLIENT uses in their messages. Write your ENTIRE reply in that SAME language. Do NOT write in a different language than the client.

NEGOTIATION STRATEGY (follow this order):
1. Open warmly: Equipe genuinely loved their product — it has strong resonance with his audience (creators and AI/tech enthusiasts) — and he really wants to make this partnership happen.
2. MAIN MOVE — same value, longer commitment: propose keeping the proposed value per piece, but structuring a LONGER-TERM collaboration (multiple contents over several months). Explain briefly WHY this is the ideal format: recurring partnerships perform much better than one-off posts — the audience builds familiarity and trust with the product over repeated exposure, which is what actually converts.
3. ALTERNATIVE — their number: if a longer-term commitment isn't possible right now, ask directly how they would like to structure it and what budget they DO have available, so you can bring a tailored proposal to Equipe and make this work.
4. Close with genuine eagerness to find a path together.

STYLE:
- Write as Assistente Escolar, Equipe's assistant, in first person
- Persuasive but respectful — never aggressive, never desperate
- Maximum 8-10 lines for the body
- Do NOT invent numbers, metrics or facts that are not in the history
- DO NOT include any signature, it will be added automatically
- DO NOT include "Subject:" or "Assunto:" prefix in the body

Lead name: {leadName}

Full email history (use this to determine the client's language):
{emailHistory}

Return ONLY in this format:
Subject: [subject line in the client's language]

[body - just the new message, no signature]`;

  const prompt = (await getPrompt("5", defaultRejectionPrompt, {
    leadName: lead.name,
    emailHistory,
  })) + AUDIENCE_FACTS;

  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: `You are ${ASSISTANT_NAME} writing professional emails. You MUST write in the same language the client uses in the conversation history.` },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('Rejection reply generation failed:', resp.status, errText);
    throw new Error(`Rejection reply generation failed: ${resp.status}`);
  }

  const data = await resp.json();
  const generatedEmail = data.choices[0].message.content;

  const lines = generatedEmail.split('\n');
  let subject = '';
  let body = '';

  if (lines[0].toLowerCase().startsWith('assunto:') || lines[0].toLowerCase().startsWith('subject:')) {
    subject = lines[0].replace(/^(Assunto|Subject):\s*/i, '').trim();
    body = lines.slice(2).join('\n').trim();
  } else {
    subject = `Re: ${lead.name}`;
    body = generatedEmail.trim();
  }

  return { subject, body };
}

// --- Commercial intent (3 vias): pedido de cotação / contraproposta muito baixa / objeção de budget ---
interface CommercialIntent {
  type: 'quote_request' | 'lowball_counter' | 'budget_objection' | 'call_request' | 'none';
  counter_amount: number;
  counter_currency: string;
  our_last_amount: number;
}

async function analyzeCommercialIntent(
  emailContent: string, emailHistory: string, LOVABLE_API_KEY: string
): Promise<CommercialIntent> {
  const defaultPrompt = `Analyze the latest client email in a partnership/advertising negotiation and classify the COMMERCIAL INTENT.

Categories:
- "quote_request": the client explicitly asks for our price/quote/rates ("what's your quote?", "pricing?", "qual o valor?") AND we have NOT yet given a number in this thread.
- "lowball_counter": the client proposes a CONCRETE amount that is drastically below the amount WE proposed earlier in the thread (roughly 4x lower or more).
- "budget_objection": the client raises price concerns or says they need internal budget confirmation, WITHOUT proposing a concrete alternative amount.
- "call_request": the client proposes or asks to SCHEDULE A CALL/MEETING as the next step (sends a calendar link, "best covered on a quick call", "let's hop on a call") — especially when commercial terms are still unclear.
- "none": anything else (acceptance, questions about format/timing, reasonable counter-offers, etc.)

Also extract:
- counter_amount: the concrete amount the CLIENT proposed in their latest email (0 if none)
- counter_currency: USD, EUR or BRL (empty if none)
- our_last_amount: the last amount WE proposed in the thread (0 if none)

Latest client email:
{emailContent}

Conversation history:
{emailHistory}`;

  const prompt = await getPrompt("29", defaultPrompt, { emailContent, emailHistory });

  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You classify commercial intent in sales negotiations. Always respond using the tool provided.' },
        { role: 'user', content: prompt },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'classify_commercial_intent',
          description: 'Classify the commercial intent of the latest client email',
          parameters: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['quote_request', 'lowball_counter', 'budget_objection', 'call_request', 'none'] },
              counter_amount: { type: 'number', description: 'Concrete amount proposed by the client in the latest email; 0 if none' },
              counter_currency: { type: 'string', enum: ['USD', 'EUR', 'BRL', ''] },
              our_last_amount: { type: 'number', description: 'Last amount WE proposed in the thread; 0 if none' },
            },
            required: ['type', 'counter_amount', 'counter_currency', 'our_last_amount'],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'classify_commercial_intent' } },
    }),
  });

  const none: CommercialIntent = { type: 'none', counter_amount: 0, counter_currency: '', our_last_amount: 0 };
  if (!resp.ok) {
    console.error('Commercial intent analysis failed:', resp.status);
    return none;
  }
  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return none;
  let args: any;
  try { args = JSON.parse(toolCall.function.arguments); } catch { return none; }

  const intent: CommercialIntent = {
    type: ['quote_request', 'lowball_counter', 'budget_objection', 'call_request', 'none'].includes(args.type) ? args.type : 'none',
    counter_amount: typeof args.counter_amount === 'number' && args.counter_amount > 0 ? args.counter_amount : 0,
    counter_currency: ['USD', 'EUR', 'BRL'].includes(args.counter_currency) ? args.counter_currency : '',
    our_last_amount: typeof args.our_last_amount === 'number' && args.our_last_amount > 0 ? args.our_last_amount : 0,
  };

  // Trava determinística do lowball: só vale se o valor do cliente for <= 25%
  // do que NÓS propusemos (regra do Equipe: "10x abaixo" merece a contra do dobro).
  if (intent.type === 'lowball_counter') {
    const isRealLowball = intent.counter_amount > 0 && intent.our_last_amount > 0
      && intent.counter_amount <= intent.our_last_amount * 0.25;
    if (!isRealLowball) {
      // Contraproposta razoável → decisão do Equipe, não automação
      intent.type = intent.counter_amount > 0 ? 'none' : 'budget_objection';
    }
  }
  console.log('Commercial intent:', JSON.stringify(intent));
  return intent;
}

// --- Resposta ao lowball: dobro do valor oferecido + pacote curto + newsletter ---
async function generateLowballReply(
  lead: any, emailHistory: string, intent: CommercialIntent, LOVABLE_API_KEY: string
): Promise<{ subject: string; body: string }> {
  const sym = intent.counter_currency === 'USD' ? 'US$' : intent.counter_currency === 'EUR' ? '€' : 'R$';
  const counterOffer = `${sym} ${intent.counter_amount.toLocaleString('en-US')}`;
  const doubledOffer = `${sym} ${(intent.counter_amount * 2).toLocaleString('en-US')}`;

  const defaultPrompt = `You are ${ASSISTANT_NAME}, executive assistant to ${COMPANY_NAME}, a content creator and AI keynote speaker.

The client counter-offered {counterOffer} — drastically below our original proposal. Equipe's standing negotiation play for this situation: accept to move forward on a FIRST collaboration if they can reach DOUBLE their offer, with a specific lighter package.

CRITICAL LANGUAGE RULE: Analyze the ENTIRE email history below. Identify the language the CLIENT uses. Write your ENTIRE reply in that SAME language.

MESSAGE STRUCTURE (follow exactly):
1. Say you spoke with Equipe: he genuinely loves the product and really wants to bring it to his audience in a first collaboration.
2. Be transparent: {counterOffer} is far below his usual partnership investment — but because he believes in the fit, he can make a first collaboration work at {doubledOffer}.
3. For that amount, the package is: ONE short video distributed across YouTube Shorts, TikTok and Instagram Reels, PLUS a mention in Equipe's newsletter (50,000 subscribers, ~20% open rate) with placement on inventorteam.com — the largest curated AI catalog in Portuguese, 30,000+ monthly visitors.
4. If they can meet {doubledOffer}, you'll move straight to contract. Ask for a quick confirmation.

STYLE:
- First person as Assistente Escolar, warm and confident — never desperate, never offended by the low offer
- Maximum 8-10 lines
- Do NOT invent metrics beyond the newsletter numbers above
- DO NOT include any signature
- DO NOT include "Subject:" prefix in the body

Lead name: {leadName}

Full email history:
{emailHistory}

Return ONLY in this format:
Subject: [subject line in the client's language]

[body - just the new message, no signature]`;

  const prompt = (await getPrompt("28", defaultPrompt, {
    leadName: lead.name,
    counterOffer,
    doubledOffer,
    emailHistory,
  })) + AUDIENCE_FACTS;

  return await generateReplyFromPrompt(prompt, lead, LOVABLE_API_KEY);
}

// --- Resposta a pedido de cotação: manda a tabela padrão adaptada ao escopo ---
async function generateQuoteReply(
  lead: any, emailHistory: string, LOVABLE_API_KEY: string
): Promise<{ subject: string; body: string }> {
  const defaultPrompt = `You are ${ASSISTANT_NAME}, executive assistant to ${COMPANY_NAME}, a content creator and AI keynote speaker.

The client explicitly asked for our quote/pricing and we haven't given a number yet. Send the quote — do NOT stall or ask more questions before giving prices.

STANDARD RATE CARD (Equipe's anchors — adapt to the scope discussed in the thread):
- Dedicated YouTube video (review/integration): US$ 3,000
- Pack of 3 short videos (Shorts/TikTok/Reels): US$ 3,000
- 1 short video (distributed on YouTube Shorts + TikTok + Instagram Reels) + mention in Equipe's newsletter (50,000 subscribers, ~20% open rate) with placement on inventorteam.com, the largest curated AI catalog in Portuguese (30,000+ monthly visitors): US$ 1,500

CRITICAL LANGUAGE RULE: Analyze the ENTIRE email history below. Identify the language the CLIENT uses. Write your ENTIRE reply in that SAME language.

INSTRUCTIONS:
- Quote ONLY the format(s) the client discussed in the thread; if unclear, present the dedicated video and the short+newsletter options
- Mention that Equipe loved the product and wants to make this work for his audience
- Add that for longer-term collaborations (multiple contents over months) there's room to build a better package — recurring partnerships perform best
- Invite them to confirm scope so you can move to contract
- Maximum 10-12 lines
- DO NOT include any signature
- DO NOT include "Subject:" prefix in the body

Lead name: {leadName}

Full email history:
{emailHistory}

Return ONLY in this format:
Subject: [subject line in the client's language]

[body - just the new message, no signature]`;

  const prompt = (await getPrompt("27", defaultPrompt, {
    leadName: lead.name,
    emailHistory,
  })) + AUDIENCE_FACTS;

  return await generateReplyFromPrompt(prompt, lead, LOVABLE_API_KEY);
}

// --- Resposta a pedido de call: checar agenda + qualificar a parceria ANTES de marcar ---
async function generateCallRequestReply(
  lead: any, emailHistory: string, LOVABLE_API_KEY: string
): Promise<{ subject: string; body: string }> {
  const defaultPrompt = `You are ${ASSISTANT_NAME}, executive assistant to ${COMPANY_NAME}, a content creator and AI keynote speaker.

The client asked to schedule a call as the next step. Equipe's standing play: do NOT book yet — first extract how the partnership actually works, so Equipe can assess viability before anyone spends time on a call that may not be feasible.

CRITICAL LANGUAGE RULE: Analyze the ENTIRE email history below. Identify the language the CLIENT uses. Write your ENTIRE reply in that SAME language.

MESSAGE STRUCTURE (follow exactly):
1. Thank them; say Equipe really liked the product and you will check his calendar availability.
2. BEFORE booking, ask them to briefly share how they usually structure partnerships with other creators: fixed fee for the content, affiliate/commission only, or a hybrid — and the typical ranges/budgets involved.
3. Frame it as respect for THEIR time: Equipe likes to assess fit upfront so nobody spends a call on a partnership that might not be viable — with that context, the call (if booked) becomes a decision call, much more productive.
4. Close warmly, saying that with that info you will come back right away with Equipe's availability.

STYLE:
- First person as Assistente Escolar, warm, efficient, protective of everyone's time — never dismissive of the call
- Maximum 8-10 lines
- Do NOT invent numbers or facts beyond the history and the audience block below
- DO NOT include any signature
- DO NOT include "Subject:" prefix in the body

Lead name: {leadName}

Full email history:
{emailHistory}

Return ONLY in this format:
Subject: [subject line in the client's language]

[body - just the new message, no signature]`;

  const prompt = (await getPrompt("30", defaultPrompt, {
    leadName: lead.name,
    emailHistory,
  })) + AUDIENCE_FACTS;

  return await generateReplyFromPrompt(prompt, lead, LOVABLE_API_KEY);
}

// Helper compartilhado: chama a IA e separa Subject/body
async function generateReplyFromPrompt(
  prompt: string, lead: any, LOVABLE_API_KEY: string
): Promise<{ subject: string; body: string }> {
  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: `You are ${ASSISTANT_NAME} writing professional emails. You MUST write in the same language the client uses in the conversation history.` },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Reply generation failed: ${resp.status} ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  const generated = data.choices[0].message.content as string;
  const lines = generated.split('\n');
  if (lines[0].toLowerCase().startsWith('assunto:') || lines[0].toLowerCase().startsWith('subject:')) {
    return {
      subject: lines[0].replace(/^(Assunto|Subject):\s*/i, '').trim(),
      body: lines.slice(2).join('\n').trim(),
    };
  }
  return { subject: `Re: ${lead.name}`, body: generated.trim() };
}

// --- Generate and send proposal (reusable for new and existing leads) ---
interface ProposalParams {
  supabase: any;
  resendApiKey: string;
  LOVABLE_API_KEY: string;
  leadId: string | null; // null = create new lead
  clientEmails: string[];
  emailSubject: string;
  emailText: string;
  emailHtml: string;
  fromRaw: string;
  toAddresses: string[];
  ccAddresses: string[];
  data: any; // original payload for threading
  createOnly?: boolean; // true = create lead + save Equipe's outbound, no Assistente Escolar proposal
}

async function generateAndSendProposal(params: ProposalParams): Promise<{
  success: boolean;
  lead_id: string;
  lead_name: string;
  email_sent: boolean;
}> {
  const {
    supabase, resendApiKey, LOVABLE_API_KEY, leadId,
    clientEmails, emailSubject, emailText, emailHtml,
    fromRaw, toAddresses, ccAddresses, data, createOnly,
  } = params;

  // IMPORTANT: quando é um encaminhamento do Equipe para a Assistente Escolar, o preâmbulo
  // do Equipe costuma estar em português ("Assistente Escolar, manda a proposta...") mesmo
  // quando a mensagem original do cliente é em inglês. Se passarmos o email
  // inteiro para a IA, ela detecta português e a Assistente Escolar responde no idioma
  // errado. Extraímos primeiro a mensagem ORIGINAL do cliente e usamos ela
  // para a extração de idioma / info.
  const _rawContent = emailText || emailHtml;
  const _forwardExtract = extractForwardedClientMessage(emailText, emailHtml);
  const emailContent = _forwardExtract.isForwarded && _forwardExtract.text
    ? _forwardExtract.text
    : _rawContent;
  if (_forwardExtract.isForwarded) {
    console.log('🌐 Using forwarded client body for language/info extraction (isolated from Equipe preamble).');
  }

  // 1. Extract client info via AI
  const defaultExtractionPrompt = `Analyze the following email thread. This is an email forwarded by COC Macapá Norte to his assistant Assistente Escolar.
Equipe is forwarding a client's email asking Assistente Escolar to generate a proposal.

From: {from}
To: {to}
CC: {cc}
Subject: {subject}

Email content (this is the CLIENT's original message, not Equipe's forward preamble):
{emailContent}

Extract the following information:
1. The client's first name (just the first name, e.g. "John" not "John Smith") - this is the person who originally sent the email to Equipe, NOT COC Macapá Norte himself. Look for names in the email signature, greeting, or CC field. If the body is empty, try to find the name from the CC email address or Subject.
2. The client's full name for formal records. If you cannot determine a real name, use the company name or a clean version of the email handle (e.g. "parcerias@company.com" -> use the company name).
3. The company/organization name if mentioned (check email domain, subject, or body)
4. The predominant language THE CLIENT ORIGINALLY WROTE IN. Detect from the client's own body and signature above. IGNORE any Portuguese preamble/instruction Equipe may have added when forwarding — the response must match the CLIENT's language, not Equipe's. If the client wrote in English, return "English", even if Equipe's forward text was in Portuguese.
5. What the client is requesting (the scope/details of what they want - infer from subject if body is empty)
6. The PRODUCT TYPE being requested. Classify as one of:
   - "publicidade": ad/sponsorship/branded content/post/story/video/review/parceria de mídia/divulgação em redes sociais
   - "palestra": keynote/speaking engagement/talk/lecture/conference/event speaker/palestrante/palestra/evento
   - "mentoria": 1:1 mentorship/coaching
   - "consultoria": project-based consulting/advisory
   - "curso": training/course/workshop/treinamento
   - "outros": anything else or unclear
   Be conservative — if the email clearly mentions "palestra", "palestrante", "speaker", "keynote", "talk at", "evento" → it's "palestra", NOT "publicidade".`;

  const extractionPrompt = await getPrompt("6", defaultExtractionPrompt, {
    from: fromRaw,
    to: toAddresses.join(', '),
    cc: ccAddresses.join(', '),
    subject: emailSubject,
    emailContent: emailContent.substring(0, 5000) || '(empty body)',
  });

  console.log('Calling AI for extraction...');
  const extractResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You extract structured information from emails. Always respond using the tool provided.' },
        { role: 'user', content: extractionPrompt },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'extract_client_info',
          description: 'Extract client information from the email',
          parameters: {
            type: 'object',
            properties: {
              client_name: { type: 'string', description: 'Full name of the client/contact person for records' },
              client_first_name: { type: 'string', description: 'Just the first name of the client, e.g. "John"' },
              company_name: { type: 'string', description: 'Company or organization name, or empty if not found' },
              scope: { type: 'string', description: 'What the client is requesting' },
              language: { type: 'string', description: 'The language the client wrote in, e.g. English, Portuguese, Spanish' },
              product_type: {
                type: 'string',
                enum: ['publicidade', 'palestra', 'mentoria', 'consultoria', 'curso', 'outros'],
                description: 'Type of product/service being requested. Be conservative — palestra/speaker/keynote/event is NEVER publicidade.',
              },
            },
            required: ['client_name', 'client_first_name', 'company_name', 'scope', 'language', 'product_type'],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'extract_client_info' } },
    }),
  });

  if (!extractResponse.ok) {
    const errText = await extractResponse.text();
    console.error('AI extraction error:', extractResponse.status, errText);
    throw new Error(`AI extraction failed: ${extractResponse.status}`);
  }

  const extractData = await extractResponse.json();
  const toolCall = extractData.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error('AI did not return tool call for extraction');

  const clientInfo = JSON.parse(toolCall.function.arguments);
  console.log('Extracted client info:', JSON.stringify(clientInfo));

  const clientName = clientInfo.client_name || 'Client';
  const clientFirstName = clientInfo.client_first_name || clientName.split(' ')[0] || 'Client';
  const companyName = clientInfo.company_name || '';
  const scope = clientInfo.scope || '';
  const clientLanguage = clientInfo.language || 'English';
  const rawProductType = String(clientInfo.product_type || 'outros').toLowerCase();
  const productType = rawProductType === 'curso' ? 'treinamento' : rawProductType;
  const isPublicidade = productType === 'publicidade';

  const leadName = companyName ? `${clientName} - ${companyName}` : clientName;

  // 2. Create lead if needed
  let finalLeadId = leadId;
  let finalLeadName = leadName;

  if (!finalLeadId) {
    // GUARD: bloquear criação se cliente identificado for um contato interno
    // (endereços @inventorteam.link/.com, @inventosdigitais.com.br ou nomes
    // contendo "InventorEquipe" / "Inventos Digitais").
    const { isInternalEmail, isInternalName } = await import("../_shared/internal-contacts.ts");
    const anyInternalEmail = (clientEmails || []).some((e: string) => isInternalEmail(e));
    if (anyInternalEmail || isInternalName(leadName) || isInternalName(clientName) || isInternalName(companyName)) {
      console.log(`[BLOCK] Contato interno bloqueado na criação: name="${leadName}" emails=${JSON.stringify(clientEmails)}`);
      throw new Error(`Contato interno bloqueado: ${leadName} nunca pode virar lead.`);
    }
    console.log(`Creating lead: ${leadName} (product_type=${productType}, isPublicidade=${isPublicidade}, createOnly=${!!createOnly})`);
    const leadInsert: Record<string, any> = {
      name: leadName,
      emails: clientEmails,
      email: clientEmails[0],
      status: 'em_aberto',
      origem: 'email',
      source: createOnly ? 'team-direct' : 'assistant-webhook',
      description: `${companyName ? companyName + ' - ' : ''}${scope}`,
    };
    if (['publicidade', 'palestra', 'mentoria', 'consultoria', 'treinamento'].includes(productType)) {
      leadInsert.produto = productType;
    }
    // Only set the canned proposal value for publicidade leads (Assistente Escolar flow).
    if (isPublicidade && !createOnly) {
      leadInsert.valor = PROPOSAL_VALUE;
      leadInsert.moeda = PROPOSAL_CURRENCY;
    }

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert(leadInsert)
      .select()
      .single();

    if (leadError) {
      console.error('Error creating lead:', leadError);
      throw new Error(`Failed to create lead: ${leadError.message}`);
    }

    finalLeadId = lead.id;
    console.log('Lead created:', finalLeadId);

    const extracted = extractForwardedClientMessage(emailText, emailHtml);

    if (createOnly) {
      // Equipe wrote directly to the client → save HIS email as outbound (not inbound)
      await saveOutboundEmail(
        supabase,
        finalLeadId,
        emailSubject,
        emailText,
        emailHtml,
        data.created_at || new Date().toISOString(),
        data.message_id || data.messageId || null
      );

      // If Equipe's email is a forward, also save the forwarded client's original
      // content as an inbound message so the lead history includes what the client sent.
      if (extracted.isForwarded) {
        await saveInboundEmail(
          supabase,
          finalLeadId,
          emailSubject,
          extracted.text,
          extracted.html,
          data.created_at || new Date().toISOString(),
          null
        );
      }
    } else {
      // Save inbound email for new leads — strip Equipe's forward preamble so the saved
      // inbound message is the client's actual content, not Equipe's "assistant, manda a proposta".
      await saveInboundEmail(supabase, finalLeadId, emailSubject, extracted.text, extracted.html || emailHtml, data.created_at || new Date().toISOString(), data.message_id || data.messageId || null);
    }
  }

  // createOnly mode: lead + outbound email saved, no Assistente Escolar automation. Return.
  if (createOnly) {
    return {
      success: true,
      lead_id: finalLeadId!,
      lead_name: finalLeadName,
      email_sent: false,
    };
  }

  // GATE: Assistente Escolar only sends automated proposals (with price) for publicidade leads.
  // For palestra/keynote/consultoria/etc, create the lead but DO NOT send any email —
  // Equipe handles pricing and the reply manually.
  if (!isPublicidade) {
    console.log(`⏭️ Product type is "${productType}" (not publicidade). Lead created, NO proposal email sent.`);
    return {
      success: true,
      lead_id: finalLeadId!,
      lead_name: finalLeadName,
      email_sent: false,
    };
  }

  // 3. Generate proposal email
  const emailDate = data.created_at ? new Date(data.created_at) : new Date();
  const deadline = addBusinessDays(emailDate, 2);
  const deadlineFormatted = formatDate(deadline, clientLanguage);

  const isPortuguese = clientLanguage.toLowerCase().includes('portug');
  const langInstruction = isPortuguese
    ? 'Escreva TODO o email em portugues brasileiro.'
    : `Escreva o email em ${clientLanguage}.`;

  const defaultProposalPrompt = `Voce e Assistente Escolar, assistente executiva de COC Macapá Norte, palestrante e especialista em IA.

Escreva um email para o cliente enviando a proposta de parceria.

DADOS:
- Nome do cliente (usar para cumprimentar): {clientFirstName}
- Empresa: {companyName}
- Escopo solicitado: {scope}
- Valor: US$ 3.000 (tres mil dolares)
- Prazo para resposta: {deadline}

REGRAS:
1. {langInstruction}
2. Cumprimente o cliente pelo primeiro nome: "{clientFirstName}"
3. Diga que Equipe ADOROU o produto/projeto e viu muito fit com o publico dele
4. Diga que Equipe quer muito viabilizar essa parceria
5. Apresente o valor de US$ 3.000 (tres mil dolares) para o escopo solicitado. NAO escreva "dolares americanos", apenas "dolares"
6. Pergunte como podemos fazer para viabilizar, estimulando o cliente a propor algo mesmo que o valor pareca alto
7. Peca resposta ate {deadline} pois a agenda de gravacoes esta apertada
8. Assine como "Assistente Escolar" - Assistente Executiva de COC Macapá Norte
9. NAO inclua prefixo "Subject:" ou "Assunto:" - apenas o corpo
10. Seja profissional, objetiva e persuasiva - maximo 10 linhas no corpo
11. REGRA DO MEDIA KIT: SOMENTE inclua o link https://inventorteam.link/kit se o cliente EXPLICITAMENTE pediu Media Kit, press kit, kit de midia, tabela de precos, numeros do Equipe, portfolio, ou informacoes sobre o alcance do Equipe nas mensagens dele. Se o cliente NAO pediu explicitamente essas informacoes, NAO inclua este link de forma alguma.

Formato:
Subject: [assunto]

[corpo]`;

  const proposalPrompt = await getPrompt("7", defaultProposalPrompt, {
    clientFirstName,
    companyName: companyName || 'nao especificada',
    scope,
    deadline: deadlineFormatted,
    langInstruction,
  });

  console.log('Generating proposal email...');
  const proposalResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: `Voce e Assistente Escolar, assistente executiva de COC Macapá Norte. Escreva emails curtos e objetivos. ${langInstruction}` },
        { role: 'user', content: proposalPrompt },
      ],
    }),
  });

  if (!proposalResponse.ok) {
    const errText = await proposalResponse.text();
    console.error('AI proposal error:', proposalResponse.status, errText);
    throw new Error(`AI proposal generation failed: ${proposalResponse.status}`);
  }

  const proposalData = await proposalResponse.json();
  const generatedEmail = proposalData.choices[0].message.content;

  // Parse subject and body
  const lines = generatedEmail.split('\n');
  let emailBody = '';

  if (lines[0].toLowerCase().startsWith('assunto:') || lines[0].toLowerCase().startsWith('subject:')) {
    emailBody = lines.slice(2).join('\n').trim();
  } else {
    emailBody = generatedEmail.trim();
  }

  // Build reply subject
  const replySubject = emailSubject.toLowerCase().startsWith('re:')
    ? emailSubject
    : `Re: ${emailSubject}`;

  // Build quoted thread from ALL emails of this lead (not just the original)
  let emailThreadHtml = '';
  if (finalLeadId) {
    const { data: allLeadEmails } = await supabase
      .from('email_messages')
      .select('*')
      .eq('lead_id', finalLeadId)
      .order('timestamp', { ascending: false })
      .limit(20);

    if (allLeadEmails && allLeadEmails.length > 0) {
      emailThreadHtml = allLeadEmails.map((e: any) => {
        const from = e.direction === 'inbound' ? (clientName || 'Client') : ASSISTANT_NAME;
        const date = new Date(e.timestamp).toLocaleString();
        const subj = e.subject ? `<strong>Subject:</strong> ${e.subject}<br>` : '';
        const content = (e.html_body || e.message || '').replace(/\n/g, '<br>');
        return `<div style="margin-top: 20px; padding-left: 10px; border-left: 3px solid #ccc;">
          <p style="color: #666; font-size: 0.9em; margin-bottom: 5px;">On ${date}, ${from} wrote:</p>
          ${subj}<div>${content}</div>
        </div>`;
      }).join('');
    }
  }

  // Fallback: if no thread from DB, quote the original email
  if (!emailThreadHtml) {
    const originalDate = data.created_at ? new Date(data.created_at).toLocaleString() : '';
    const quotedOriginal = emailHtml
      ? emailHtml
      : `<pre style="white-space: pre-wrap;">${emailText}</pre>`;
    emailThreadHtml = `<div style="border-left: 2px solid #ccc; padding-left: 12px; margin-top: 16px; color: #555;">
      <p style="font-size: 12px; color: #999;">On ${originalDate}, ${fromRaw} wrote:</p>
      ${quotedOriginal}
    </div>`;
  }

  const emailBodyHtml = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
${emailBody.replace(/\n/g, '<br>')}
</div>
<br>
${emailThreadHtml}`;

  // 4. Send via Resend
  console.log('Sending proposal email via Resend to:', clientEmails);
  const replyHeaders: Record<string, string> = {};
  const messageId = data.message_id || data.messageId;
  const outgoingMessageId = generateMessageId(ASSISTANT_EMAIL);

  // Build complete References chain from all resend_message_ids
  if (finalLeadId) {
    const { data: allMsgIds } = await supabase
      .from('email_messages')
      .select('resend_message_id')
      .eq('lead_id', finalLeadId)
      .not('resend_message_id', 'is', null)
      .order('timestamp', { ascending: true });

    const ids = (allMsgIds || []).map((e: any) => e.resend_message_id).filter(Boolean);
    if (messageId) ids.push(messageId);
    
    if (ids.length > 0) {
      replyHeaders['In-Reply-To'] = ids[ids.length - 1];
      replyHeaders['References'] = ids.join(' ');
    }
  } else if (messageId) {
    replyHeaders['In-Reply-To'] = messageId;
    replyHeaders['References'] = messageId;
  }

  const sendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${ASSISTANT_NAME} - ${COMPANY_NAME} <${ASSISTANT_EMAIL}>`,
      to: clientEmails,
      cc: [COMPANY_EMAIL],
      subject: replySubject,
      html: emailBodyHtml,
      headers: { ...replyHeaders, 'Message-ID': outgoingMessageId },
    }),
  });

  if (!sendResponse.ok) {
    const sendErr = await sendResponse.text();
    console.error('Resend send error:', sendResponse.status, sendErr);
    throw new Error(`Failed to send email: ${sendErr}`);
  }

  const sendData = await sendResponse.json();
  console.log('✅ Proposal email sent:', sendData);

  // 5. Save outbound email with resend_message_id
  const proposalResendMessageId = outgoingMessageId;
  const { error: saveOutboundError } = await supabase
    .from('email_messages')
    .insert({
      lead_id: finalLeadId,
      direction: 'outbound',
      subject: replySubject,
      message: emailBody,
      html_body: emailBodyHtml,
      timestamp: new Date().toISOString(),
      resend_message_id: proposalResendMessageId,
      internet_message_id: normalizeMessageIdForDb(proposalResendMessageId),
      recipients_to: clientEmails,
      recipients_cc: [COMPANY_EMAIL],
      raw_data: {
        headers: { 'Message-ID': proposalResendMessageId, ...replyHeaders },
        resend_id: sendData.id || null,
        from: ASSISTANT_EMAIL,
        to: clientEmails,
        cc: [COMPANY_EMAIL],
      },
    });

  if (saveOutboundError) {
    console.error('Error saving outbound email:', saveOutboundError);
  } else {
    console.log('✅ Outbound email saved');
  }

  return {
    success: true,
    lead_id: finalLeadId!,
    lead_name: finalLeadName,
    email_sent: true,
  };
}



function stripHtmlSimple(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// === MAIN HANDLER ===
serve(async (req) => {
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET") || "";
  const suppliedSecret =
    req.headers.get("x-webhook-secret") ||
    new URL(req.url).searchParams.get("secret") ||
    "";
  if (!webhookSecret || suppliedSecret !== webhookSecret) {
    return new Response(JSON.stringify({ error: "unauthorized_webhook" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Load dynamic settings
    const settings = await getSettings(['assistant_name', 'assistant_email', 'company_name', 'company_email']);
    ASSISTANT_NAME = settings.assistant_name;
    ASSISTANT_EMAIL = settings.assistant_email;
    COMPANY_NAME = settings.company_name;
    COMPANY_EMAIL = settings.company_email;

    // Carrega emails de usuários do sistema (funcionários) para nunca tratá-los como leads
    SYSTEM_USER_EMAILS = await getSystemUserEmails();
    IGNORED_EMAILS = [...INTERNAL_ASSISTANT_EMAILS, ...TEAM_EMAILS, ...SYSTEM_USER_EMAILS];
    console.log(`Loaded ${SYSTEM_USER_EMAILS.length} system user emails to ignore as leads`);

    const payload = await req.json();
    console.log('=== RESEND INBOUND WEBHOOK ===');
    console.log(`Sender identity: ${ASSISTANT_NAME} <${ASSISTANT_EMAIL}>`);
    console.log('Event type:', payload.type);

    if (payload.type !== 'email.received') {
      console.log('Ignoring event type:', payload.type);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = payload.data;

    console.log('Raw From:', JSON.stringify(data.from));
    console.log('Raw To:', JSON.stringify(data.to));
    console.log('Raw CC:', JSON.stringify(data.cc));

    const toAddresses: string[] = normalizeRecipientList(data.to);
    const ccAddresses: string[] = normalizeRecipientList(data.cc);
    const fromRaw: string = data.from || '';
    const allRecipients = [...toAddresses, ...ccAddresses];

    // 1. Check if email is for Assistente Escolar or Sara (internal assistants), whether in TO or CC.
    // Resend can deliver both as arrays or comma-separated header strings, so normalize first.
    const isForAssistant = allRecipients.some(isAssistantRecipient);
    if (!isForAssistant) {
      console.log('Email not addressed to any assistant (Assistente Escolar/Sara), ignoring.');
      return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'not_for_assistant' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Initialize Supabase and keys
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) throw new Error('RESEND_API_KEY not configured');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    // 3. Get email content
    let emailText = data.text || data.body || '';
    let emailHtml = data.html || '';
    const emailId = data.email_id;
    let inboundMessageId = data.message_id || data.messageId || null;

    if (emailId && (!emailText && !emailHtml)) {
      const fetched = await fetchEmailContent(emailId, resendApiKey);
      emailText = fetched.text;
      emailHtml = fetched.html;
      inboundMessageId = inboundMessageId || fetched.messageId;
    }

    if (inboundMessageId && !data.message_id && !data.messageId) {
      data.message_id = inboundMessageId;
    }

    const emailSubject = data.subject || '';
    const emailTimestamp = data.created_at || new Date().toISOString();

    console.log('Subject:', emailSubject);
    console.log('Email text length:', emailText.length, 'HTML length:', emailHtml.length);

    // 4. Determine if from Equipe
    const fromEmailClean = extractCleanEmail(fromRaw);
    const isFromEquipe = TEAM_EMAILS.some(me => fromEmailClean.includes(me));



    if (!isFromEquipe) {
      // === FLOW: Email from client (not Equipe) ===
      console.log('Email from external sender:', fromEmailClean);

      // Anti-duplicação: procura o lead pelo REMETENTE e também pelos demais
      // destinatários externos do e-mail. Caso clássico: um segundo contato da
      // empresa escreve copiando o contato original (que já é lead) — sem isso
      // o sistema criava uma oportunidade nova pro mesmo negócio.
      const externalRecipientEmails = allRecipients
        .map(addr => extractCleanEmail(addr))
        .filter(e => e && e !== fromEmailClean && !IGNORED_EMAILS.includes(e) && !isSystemUser(e));
      const existingLead = await findExistingLead(supabase, [fromEmailClean, ...externalRecipientEmails]);
      if (existingLead && !existingLead.emails?.includes(fromEmailClean) && existingLead.email !== fromEmailClean) {
        console.log(`Lead encontrado via destinatário externo (não pelo remetente): ${existingLead.name} — associando ${fromEmailClean} ao lead`);
      }

      if (!existingLead) {
        // GUARD: nunca criar oportunidade a partir de endereço interno
        // (@inventorteam.link/.com, @inventosdigitais.com.br, etc.)
        const { isInternalEmail, isInternalName } = await import("../_shared/internal-contacts.ts");
        const fromDisplay = extractDisplayName(fromRaw, fromEmailClean);
        if (isInternalEmail(fromEmailClean) || isInternalName(fromDisplay)) {
          console.log(`[BLOCK] Remetente interno ignorado (nunca vira lead): ${fromEmailClean} / ${fromDisplay}`);
          return new Response(
            JSON.stringify({ ok: true, skipped: 'internal_sender', from: fromEmailClean }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        console.log('No existing lead found for external sender. Creating lead from Resend inbound.');
        const created = await createLeadFromExternalEmail(
          supabase,
          fromRaw,
          emailSubject,
          emailText,
          emailHtml,
          emailTimestamp,
          inboundMessageId,
        );

        if (emailId) {
          await processEmailAttachments(supabase, resendApiKey, emailId, created.leadId, created.emailMessageId);
        }

        try {
          const { triggerAutoDescription } = await import("../_shared/auto-generate-description.ts");
          triggerAutoDescription(created.leadId);
        } catch (e) {
          console.error('Erro ao disparar auto-descrição:', e);
        }

        // Extrai telefone/WhatsApp da assinatura do primeiro e-mail
        try {
          const { extractAndAttachPhones } = await import("../_shared/contact-extraction.ts");
          await extractAndAttachPhones(supabase, created.leadId, emailText || emailHtml || '');
        } catch (e) {
          console.error('Extração de telefone falhou (não fatal):', e);
        }

        // Aviso de possível duplicata: outro lead com e-mail do mesmo domínio
        // corporativo (agências costumam escrever de vários endereços)
        try {
          const senderDomain = (fromEmailClean.split('@')[1] || '').toLowerCase();
          const FREE_MAIL_DOMAINS = ['gmail.com','googlemail.com','hotmail.com','outlook.com','live.com','msn.com','yahoo.com','yahoo.com.br','icloud.com','me.com','proton.me','protonmail.com','uol.com.br','bol.com.br','terra.com.br','globo.com','aol.com','gmx.com','zoho.com','mail.com'];
          if (senderDomain && !FREE_MAIL_DOMAINS.includes(senderDomain)) {
            const { data: sameDomainLeads } = await supabase
              .from('leads')
              .select('id, name, status')
              .neq('id', created.leadId)
              .eq('archived', false)
              .ilike('email', `%@${senderDomain}`)
              .limit(3);
            if (sameDomainLeads && sameDomainLeads.length > 0) {
              const list = sameDomainLeads.map((l: any) => `"${l.name}" (${l.status || 'sem status'})`).join(', ');
              await supabase.from('lead_notes').insert({
                lead_id: created.leadId,
                note: `[Sistema] ⚠️ Possível duplicata: já existe oportunidade com e-mail @${senderDomain} — ${list}. Se for o mesmo negócio, use o merge (tool merge_leads do MCP).`,
              });
              console.log(`Aviso de possível duplicata por domínio @${senderDomain} adicionado ao lead ${created.leadId}`);
            }
          }
        } catch (e) {
          console.error('Checagem de duplicata por domínio falhou (não fatal):', e);
        }

        // === Loop-in Equipe também no PRIMEIRO email (lead novo): se ele não
        // estiver em To/CC, Assistente Escolar responde reply-all colocando Equipe em cópia ===
        try {
          const { maybeLoopInEquipe } = await import("../_shared/loop-in-team.ts");
          await maybeLoopInEquipe({
            supabase,
            lead: { id: created.leadId, name: created.leadName, language: null },
            originalFrom: fromEmailClean,
            originalTo: toAddresses,
            originalCc: ccAddresses,
            subject: emailSubject,
            bodySample: (emailText || emailHtml || '').slice(0, 2000),
            inboundMessageId,
            priorMessageIds: [],
            resendApiKey,
            assistantEmail: ASSISTANT_EMAIL,
            assistantName: ASSISTANT_NAME,
            companyName: COMPANY_NAME,
            companyEmail: COMPANY_EMAIL,
            systemUserEmails: SYSTEM_USER_EMAILS,
          });
        } catch (loopErr) {
          console.error("Erro ao executar loop-in Equipe em lead novo (não fatal):", loopErr);
        }

        return new Response(JSON.stringify({ success: true, created: true, lead_id: created.leadId, lead_name: created.leadName }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const savedEmailId = await saveInboundEmail(supabase, existingLead.id, emailSubject, emailText, emailHtml, emailTimestamp, inboundMessageId);

      // Auto-generate description if needed
      try {
        const { triggerAutoDescription } = await import("../_shared/auto-generate-description.ts");
        triggerAutoDescription(existingLead.id);
      } catch (e) {
        console.error('Erro ao disparar auto-descrição:', e);
      }

      // Process attachments if email has an email_id from Resend
      if (emailId) {
        await processEmailAttachments(supabase, resendApiKey, emailId, existingLead.id, savedEmailId);
      }

      // Associate CC emails to lead
      const externalCCEmails = allRecipients.map(addr => extractCleanEmail(addr));
      await associateCCEmailsToLeadSafe(supabase, existingLead.id, [fromEmailClean, ...externalCCEmails], existingLead.emails || []);

      // Extrai telefone/WhatsApp da assinatura do e-mail e anexa ao lead
      try {
        const { extractAndAttachPhones } = await import("../_shared/contact-extraction.ts");
        await extractAndAttachPhones(supabase, existingLead.id, emailText || emailHtml || '');
      } catch (e) {
        console.error('Extração de telefone falhou (não fatal):', e);
      }

      // === Loop-in Equipe: se ele não estiver em To/CC, Assistente Escolar responde reply-all com Equipe em cópia ===
      try {
        const { maybeLoopInEquipe } = await import("../_shared/loop-in-team.ts");
        const { data: leadForLoop } = await supabase
          .from("leads").select("id, name, language").eq("id", existingLead.id).maybeSingle();
        if (leadForLoop) {
          await maybeLoopInEquipe({
            supabase,
            lead: leadForLoop,
            originalFrom: fromEmailClean,
            originalTo: toAddresses,
            originalCc: ccAddresses,
            subject: emailSubject,
            bodySample: (emailText || emailHtml || '').slice(0, 2000),
            inboundMessageId,
            priorMessageIds: [],
            resendApiKey,
            assistantEmail: ASSISTANT_EMAIL,
            assistantName: ASSISTANT_NAME,
            companyName: COMPANY_NAME,
            companyEmail: COMPANY_EMAIL,
            systemUserEmails: SYSTEM_USER_EMAILS,
          });
        }
      } catch (loopErr) {
        console.error("Erro ao executar loop-in Equipe (não fatal):", loopErr);
      }

      // === Detectar declínio explícito do cliente (SOMENTE registrar nota) ===
      // IMPORTANTE: NUNCA alterar status para 'perdido' automaticamente.
      // O status 'perdido' é exclusivamente manual, definido pelo usuário.
      // Aqui apenas registramos uma observação para o Equipe avaliar.
      try {
        const noteEligibleStatuses = ['em_aberto', 'em_negociacao'];
        const { data: currentLead } = await supabase
          .from('leads')
          .select('status')
          .eq('id', existingLead.id)
          .maybeSingle();

        if (currentLead && noteEligibleStatuses.includes(currentLead.status)) {
          const { analyzeClientDeclined } = await import('../_shared/analyze-client-decline.ts');

          const { data: histEmails } = await supabase
            .from('email_messages')
            .select('direction, subject, message, html_body, timestamp')
            .eq('lead_id', existingLead.id)
            .order('timestamp', { ascending: true })
            .limit(20);

          const histText = (histEmails || []).map((e: any) => {
            const dir = e.direction === 'inbound' ? 'Cliente' : 'Assistente Escolar';
            const content = (e.message || e.html_body || '').substring(0, 1500);
            return `[${dir} - ${new Date(e.timestamp).toLocaleString()}]\n${e.subject ? 'Assunto: ' + e.subject + '\n' : ''}${content}`;
          }).join('\n\n---\n\n');

          const declineResult = await analyzeClientDeclined(
            emailText || emailHtml || '',
            histText,
            LOVABLE_API_KEY!,
          );

          if (declineResult.is_decline) {
            console.log('⚠️ Possível declínio detectado — registrando NOTA apenas (status NÃO alterado). Motivo:', declineResult.reasoning);
            await supabase.from('lead_notes').insert({
              lead_id: existingLead.id,
              note: `[IA] Possível sinal de desistência/cancelamento detectado no último e-mail do cliente. Avalie manualmente se deve marcar como perdido.\n\nMotivo IA: ${declineResult.reasoning}`,
            });
          }
        }
      } catch (declineErr) {
        console.error('Erro na análise de declínio (não-fatal):', declineErr);
      }


      // Analyze if this is a budget rejection and auto-reply — ONLY for publicidade leads

      try {
        // Check if lead is publicidade before auto-replying
        let clientLeadProduto = null;
        {
          const { data: lpData } = await supabase.from('leads').select('produto').eq('id', existingLead.id).single();
          clientLeadProduto = lpData?.produto;
        }

        if (clientLeadProduto !== 'publicidade') {
          console.log(`Lead produto is "${clientLeadProduto}", skipping budget rejection and media kit auto-replies (only for publicidade).`);
          return new Response(
            JSON.stringify({ success: true, associated: true, lead_id: existingLead.id, lead_name: existingLead.name }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const emailContent = emailText || emailHtml || '';
        
        // Fetch full email history for this lead
        const { data: allEmails, error: historyError } = await supabase
          .from('email_messages')
          .select('*')
          .eq('lead_id', existingLead.id)
          .order('timestamp', { ascending: true });

        if (historyError) {
          console.error('Error fetching email history:', historyError);
        }

        const emails = allEmails || [];
        const emailHistoryText = emails.map((e: any) => {
          const dir = e.direction === 'inbound' ? 'Client' : 'Assistente Escolar';
          const content = (e.message || e.html_body || '').substring(0, 2000);
          return `[${dir} - ${new Date(e.timestamp).toLocaleString()}]\n${e.subject ? 'Subject: ' + e.subject + '\n' : ''}${content}`;
        }).join('\n\n---\n\n');

        const commercialIntent = await analyzeCommercialIntent(emailContent, emailHistoryText, LOVABLE_API_KEY!);

        if (commercialIntent.type !== 'none') {
          console.log(`Commercial intent "${commercialIntent.type}" detected! Generating auto-reply...`);

          let subject: string, body: string;
          if (commercialIntent.type === 'lowball_counter') {
            // Contraproposta muito baixa → dobro do valor + pacote curto + newsletter
            ({ subject, body } = await generateLowballReply(existingLead, emailHistoryText, commercialIntent, LOVABLE_API_KEY!));
          } else if (commercialIntent.type === 'quote_request') {
            // Cliente pediu cotação → manda a tabela padrão adaptada ao escopo
            ({ subject, body } = await generateQuoteReply(existingLead, emailHistoryText, LOVABLE_API_KEY!));
          } else if (commercialIntent.type === 'call_request') {
            // Cliente quer marcar call → checa agenda + qualifica a parceria antes
            ({ subject, body } = await generateCallRequestReply(existingLead, emailHistoryText, LOVABLE_API_KEY!));
          } else {
            // Objeção de budget sem valor concreto → mesmo valor por mais tempo
            ({ subject, body } = await generateRejectionReply(existingLead, emailHistoryText, LOVABLE_API_KEY!));
          }

          // Build HTML with signature and thread
          const bodyHtml = body.replace(/\n/g, '<br>');
          const emailThread = emails
            .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .map((e: any) => {
              const from = e.direction === 'inbound' ? existingLead.name : ASSISTANT_NAME;
              const date = new Date(e.timestamp).toLocaleString();
              const subj = e.subject ? `<strong>Subject:</strong> ${e.subject}<br>` : '';
              const content = (e.html_body || e.message || '').replace(/\n/g, '<br>');
              return `<div style="margin-top: 20px; padding-left: 10px; border-left: 3px solid #ccc;">
                <p style="color: #666; font-size: 0.9em; margin-bottom: 5px;">On ${date}, ${from} wrote:</p>
                ${subj}<div>${content}</div>
              </div>`;
            }).join('');

          const fullBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
            ${bodyHtml}
            <br><br>
            <p style="color: #666; font-size: 12px;">—<br>${ASSISTANT_NAME}<br>Atendimento ${COMPANY_NAME}<br>${ASSISTANT_EMAIL}</p>
            ${emailThread}
          </div>`;

          // Get recipient emails
          const recipientEmails = existingLead.emails && existingLead.emails.length > 0
            ? existingLead.emails
            : [existingLead.email];
          const uniqueRecipients = Array.from(new Set(recipientEmails.filter(Boolean))) as string[];

          // Build reply subject
          const replySubject = subject.toLowerCase().startsWith('re:') ? subject : `Re: ${emailSubject || subject}`;

          // Threading headers - build complete References chain
          const replyHeaders: Record<string, string> = {};
          const messageId = data.message_id || data.messageId;
          const outgoingMessageId = generateMessageId(ASSISTANT_EMAIL);
          
          const allMsgIds = emails
            .map((e: any) => e.resend_message_id)
            .filter(Boolean);
          if (messageId) allMsgIds.push(messageId);
          
          if (allMsgIds.length > 0) {
            replyHeaders['In-Reply-To'] = allMsgIds[allMsgIds.length - 1];
            replyHeaders['References'] = allMsgIds.join(' ');
          }

          // Send via Resend
          const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
          const sendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: `${ASSISTANT_NAME} - ${COMPANY_NAME} <${ASSISTANT_EMAIL}>`,
              to: uniqueRecipients,
              cc: [COMPANY_EMAIL],
              subject: replySubject,
              html: fullBody,
              headers: { ...replyHeaders, 'Message-ID': outgoingMessageId },
            }),
          });

          if (!sendResponse.ok) {
            const sendErr = await sendResponse.text();
            console.error('Error sending rejection reply:', sendErr);
          } else {
            const sendData = await sendResponse.json();
            console.log('✅ Rejection counter-reply sent:', sendData);

            // Save outbound email with resend_message_id
            const rejectionResendMsgId = outgoingMessageId;
            await supabase
              .from('email_messages')
              .insert({
                lead_id: existingLead.id,
                direction: 'outbound',
                subject: replySubject,
                message: body,
                html_body: fullBody,
                timestamp: new Date().toISOString(),
                resend_message_id: rejectionResendMsgId,
                internet_message_id: normalizeMessageIdForDb(rejectionResendMsgId),
                recipients_to: uniqueRecipients,
                recipients_cc: [COMPANY_EMAIL],
                raw_data: {
                  headers: { 'Message-ID': rejectionResendMsgId, ...replyHeaders },
                  resend_id: sendData.id || null,
                  auto_reply: 'rejection_counter_reply',
                  from: ASSISTANT_EMAIL,
                  to: uniqueRecipients,
                  cc: [COMPANY_EMAIL],
                },
              });
            console.log('✅ Outbound rejection reply saved');
          }

          return new Response(
            JSON.stringify({ success: true, associated: true, lead_id: existingLead.id, lead_name: existingLead.name, rejection_reply_sent: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (rejectionError) {
        console.error('Error in rejection analysis (non-fatal):', rejectionError);
      }

      // Analyze if this is a Media Kit / demographics request and auto-reply
      try {
        const mediaKitEmailContent = emailText || emailHtml || '';

        // Reuse email history if available, otherwise fetch
        let mediaKitEmailHistory = '';
        const { data: mkEmails, error: mkHistoryError } = await supabase
          .from('email_messages')
          .select('*')
          .eq('lead_id', existingLead.id)
          .order('timestamp', { ascending: true });

        if (mkHistoryError) {
          console.error('Error fetching email history for Media Kit analysis:', mkHistoryError);
        }

        const mkEmailsList = mkEmails || [];
        mediaKitEmailHistory = mkEmailsList.map((e: any) => {
          const dir = e.direction === 'inbound' ? 'Client' : 'Assistente Escolar';
          const content = (e.message || e.html_body || '').substring(0, 2000);
          return `[${dir} - ${new Date(e.timestamp).toLocaleString()}]\n${e.subject ? 'Subject: ' + e.subject + '\n' : ''}${content}`;
        }).join('\n\n---\n\n');

        const isMediaKitRequest = await analyzeMediaKitRequest(mediaKitEmailContent, mediaKitEmailHistory, LOVABLE_API_KEY!);

        if (isMediaKitRequest) {
          console.log('Media Kit request detected! Generating reply with link...');

          // Fetch media_kit_link from settings
          const mkSettings = await getSettings(['media_kit_link']);
          const mediaKitLink = mkSettings.media_kit_link || 'https://inventorteam.link/kit';

          const { subject, body } = await generateMediaKitReply(existingLead, mediaKitEmailHistory, mediaKitLink, LOVABLE_API_KEY!);

          // Build HTML with signature and thread
          const bodyHtml = body.replace(/\n/g, '<br>');
          const emailThread = mkEmailsList
            .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .map((e: any) => {
              const from = e.direction === 'inbound' ? existingLead.name : ASSISTANT_NAME;
              const date = new Date(e.timestamp).toLocaleString();
              const subj = e.subject ? `<strong>Subject:</strong> ${e.subject}<br>` : '';
              const content = (e.html_body || e.message || '').replace(/\n/g, '<br>');
              return `<div style="margin-top: 20px; padding-left: 10px; border-left: 3px solid #ccc;">
                <p style="color: #666; font-size: 0.9em; margin-bottom: 5px;">On ${date}, ${from} wrote:</p>
                ${subj}<div>${content}</div>
              </div>`;
            }).join('');

          const fullBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
            ${bodyHtml}
            <br><br>
            <p style="color: #666; font-size: 12px;">—<br>${ASSISTANT_NAME}<br>Atendimento ${COMPANY_NAME}<br>${ASSISTANT_EMAIL}</p>
            ${emailThread}
          </div>`;

          // Get recipient emails
          const recipientEmails = existingLead.emails && existingLead.emails.length > 0
            ? existingLead.emails
            : [existingLead.email];
          const uniqueRecipients = Array.from(new Set(recipientEmails.filter(Boolean))) as string[];

          // Build reply subject
          const replySubject = subject.toLowerCase().startsWith('re:') ? subject : `Re: ${emailSubject || subject}`;

          // Threading headers
          const replyHeaders: Record<string, string> = {};
          const messageId = data.message_id || data.messageId;
          const outgoingMessageId = generateMessageId(ASSISTANT_EMAIL);
          
          const allMsgIds = mkEmailsList
            .map((e: any) => e.resend_message_id)
            .filter(Boolean);
          if (messageId) allMsgIds.push(messageId);
          
          if (allMsgIds.length > 0) {
            replyHeaders['In-Reply-To'] = allMsgIds[allMsgIds.length - 1];
            replyHeaders['References'] = allMsgIds.join(' ');
          }

          // Send via Resend
          const mkResendApiKey = Deno.env.get('RESEND_API_KEY')!;
          const sendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${mkResendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: `${ASSISTANT_NAME} - ${COMPANY_NAME} <${ASSISTANT_EMAIL}>`,
              to: uniqueRecipients,
              cc: [COMPANY_EMAIL],
              subject: replySubject,
              html: fullBody,
              headers: { ...replyHeaders, 'Message-ID': outgoingMessageId },
            }),
          });

          if (!sendResponse.ok) {
            const sendErr = await sendResponse.text();
            console.error('Error sending Media Kit reply:', sendErr);
          } else {
            const sendData = await sendResponse.json();
            console.log('✅ Media Kit reply sent:', sendData);

            // Save outbound email with resend_message_id
            const mkResendMsgId = outgoingMessageId;
            await supabase
              .from('email_messages')
              .insert({
                lead_id: existingLead.id,
                direction: 'outbound',
                subject: replySubject,
                message: body,
                html_body: fullBody,
                timestamp: new Date().toISOString(),
                resend_message_id: mkResendMsgId,
                internet_message_id: normalizeMessageIdForDb(mkResendMsgId),
                recipients_to: uniqueRecipients,
                recipients_cc: [COMPANY_EMAIL],
                raw_data: {
                  headers: { 'Message-ID': mkResendMsgId, ...replyHeaders },
                  resend_id: sendData.id || null,
                  auto_reply: 'media_kit',
                  from: ASSISTANT_EMAIL,
                  to: uniqueRecipients,
                  cc: [COMPANY_EMAIL],
                },
              });
            console.log('✅ Outbound Media Kit reply saved');
          }

          return new Response(
            JSON.stringify({ success: true, associated: true, lead_id: existingLead.id, lead_name: existingLead.name, media_kit_reply_sent: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (mediaKitError) {
        console.error('Error in Media Kit analysis (non-fatal):', mediaKitError);
      }

      // Analyze if this is a stats/audience details request and auto-reply with image
      try {
        const statsEmailContent = emailText || emailHtml || '';

        const { data: stEmails } = await supabase
          .from('email_messages')
          .select('*')
          .eq('lead_id', existingLead.id)
          .order('timestamp', { ascending: true });

        const stEmailsList = stEmails || [];
        const statsEmailHistory = stEmailsList.map((e: any) => {
          const dir = e.direction === 'inbound' ? 'Client' : 'Assistente Escolar';
          const content = (e.message || e.html_body || '').substring(0, 2000);
          return `[${dir} - ${new Date(e.timestamp).toLocaleString()}]\n${e.subject ? 'Subject: ' + e.subject + '\n' : ''}${content}`;
        }).join('\n\n---\n\n');

        const isStatsRequest = await analyzeStatsRequest(statsEmailContent, statsEmailHistory, LOVABLE_API_KEY!);

        if (isStatsRequest) {
          console.log('Stats request detected! Sending reply with stats image attached...');

          const stSettings = await getSettings(['stats_image_url']);
          const statsImageUrl = stSettings.stats_image_url || 'https://tisdewbfpkrrtacppdwt.supabase.co/storage/v1/object/public/email-assets/instagram-stats.png';

          // Detect language from latest inbound emails
          const inboundSample = stEmailsList
            .filter((e: any) => e.direction === 'inbound')
            .slice(-3)
            .map((e: any) => (e.message || e.html_body || '').substring(0, 500))
            .join(' ').toLowerCase();
          let lang = 'English';
          if (/\b(obrigado|olá|você|para|nós|como|porque)\b/.test(inboundSample)) lang = 'Portuguese';
          else if (/\b(gracias|hola|para|nosotros|como|porque)\b/.test(inboundSample)) lang = 'Spanish';
          else if (/\b(merci|bonjour|pour|nous|comment|parce)\b/.test(inboundSample)) lang = 'French';

          // Generate short reply body in detected language
          const replyPrompts: Record<string, { subject: string; body: string }> = {
            English: {
              subject: emailSubject?.toLowerCase().startsWith('re:') ? emailSubject : `Re: ${emailSubject || 'Partnership'}`,
              body: `Hi ${existingLead.name?.split(' ')[0] || 'there'},\n\nPlease find attached a screenshot from Equipe's Instagram insights showing the audience sources, top countries, and profile activity for the last 30 days, along with his most viewed reels.\n\nLet me know if you need anything else.`,
            },
            Portuguese: {
              subject: emailSubject?.toLowerCase().startsWith('re:') ? emailSubject : `Re: ${emailSubject || 'Parceria'}`,
              body: `Olá ${existingLead.name?.split(' ')[0] || ''},\n\nSegue em anexo um print das estatísticas do Instagram do Equipe mostrando as fontes de audiência, principais países e atividade de perfil dos últimos 30 dias, junto com os reels mais vistos.\n\nQualquer outra informação que precise é só avisar.`,
            },
            Spanish: {
              subject: emailSubject?.toLowerCase().startsWith('re:') ? emailSubject : `Re: ${emailSubject || 'Colaboración'}`,
              body: `Hola ${existingLead.name?.split(' ')[0] || ''},\n\nAdjunto un print de las estadísticas de Instagram de Equipe mostrando las fuentes de audiencia, principales países y actividad de perfil de los últimos 30 días, junto con los reels más vistos.\n\nCualquier otra información que necesites, avísame.`,
            },
            French: {
              subject: emailSubject?.toLowerCase().startsWith('re:') ? emailSubject : `Re: ${emailSubject || 'Partenariat'}`,
              body: `Bonjour ${existingLead.name?.split(' ')[0] || ''},\n\nVeuillez trouver ci-joint une capture des statistiques Instagram de Equipe montrant les sources d'audience, les principaux pays et l'activité du profil des 30 derniers jours, ainsi que les reels les plus vus.\n\nN'hésitez pas si vous avez besoin d'autre chose.`,
            },
          };
          const { subject: replySubject, body } = replyPrompts[lang] || replyPrompts.English;
          const bodyHtml = body.replace(/\n/g, '<br>');

          const fullBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
            ${bodyHtml}
            <br><br>
            <p style="color: #666; font-size: 12px;">—<br>${ASSISTANT_NAME}<br>Atendimento ${COMPANY_NAME}<br>${ASSISTANT_EMAIL}</p>
          </div>`;

          const recipientEmails = existingLead.emails && existingLead.emails.length > 0
            ? existingLead.emails
            : [existingLead.email];
          const uniqueRecipients = Array.from(new Set(recipientEmails.filter(Boolean))) as string[];

          // Threading
          const replyHeaders: Record<string, string> = {};
          const messageId = data.message_id || data.messageId;
          const outgoingMessageId = generateMessageId(ASSISTANT_EMAIL);
          const allMsgIds = stEmailsList.map((e: any) => e.resend_message_id).filter(Boolean);
          if (messageId) allMsgIds.push(messageId);
          if (allMsgIds.length > 0) {
            replyHeaders['In-Reply-To'] = allMsgIds[allMsgIds.length - 1];
            replyHeaders['References'] = allMsgIds.join(' ');
          }

          // Fetch the image and convert to base64 for Resend attachment
          let attachments: any[] | undefined;
          try {
            const imgResp = await fetch(statsImageUrl);
            if (imgResp.ok) {
              const imgBuf = new Uint8Array(await imgResp.arrayBuffer());
              let bin = '';
              const chunkSize = 0x8000;
              for (let i = 0; i < imgBuf.length; i += chunkSize) {
                bin += String.fromCharCode(...imgBuf.subarray(i, i + chunkSize));
              }
              const base64 = btoa(bin);
              attachments = [{ filename: 'instagram-stats.png', content: base64, type: 'image/png' }];
            }
          } catch (imgErr) {
            console.error('Failed to fetch stats image, sending without attachment:', imgErr);
          }

          const stResendApiKey = Deno.env.get('RESEND_API_KEY')!;
          const sendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${stResendApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: `${ASSISTANT_NAME} - ${COMPANY_NAME} <${ASSISTANT_EMAIL}>`,
              to: uniqueRecipients,
              cc: [COMPANY_EMAIL],
              subject: replySubject,
              html: fullBody,
              ...(attachments && { attachments }),
              headers: { ...replyHeaders, 'Message-ID': outgoingMessageId },
            }),
          });

          if (!sendResponse.ok) {
            const sendErr = await sendResponse.text();
            console.error('Error sending stats reply:', sendErr);
          } else {
            const sendData = await sendResponse.json();
            console.log('✅ Stats reply with image sent:', sendData);
            await supabase.from('email_messages').insert({
              lead_id: existingLead.id,
              direction: 'outbound',
              subject: replySubject,
              message: body,
              html_body: fullBody,
              timestamp: new Date().toISOString(),
              resend_message_id: outgoingMessageId,
              internet_message_id: normalizeMessageIdForDb(outgoingMessageId),
              recipients_to: uniqueRecipients,
              recipients_cc: [COMPANY_EMAIL],
              raw_data: {
                headers: { 'Message-ID': outgoingMessageId, ...replyHeaders },
                resend_id: sendData.id || null,
                auto_reply: 'stats',
                from: ASSISTANT_EMAIL,
                to: uniqueRecipients,
                cc: [COMPANY_EMAIL],
              },
            });
            console.log('✅ Outbound stats reply saved');
          }

          return new Response(
            JSON.stringify({ success: true, associated: true, lead_id: existingLead.id, lead_name: existingLead.name, stats_reply_sent: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (statsError) {
        console.error('Error in stats analysis (non-fatal):', statsError);
      }

      return new Response(
        JSON.stringify({ success: true, associated: true, lead_id: existingLead.id, lead_name: existingLead.name }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === FLOW: Email from Equipe ===
    console.log('Email from Equipe, extracting client emails...');

    const clientEmails = allRecipients.filter(addr => {
      const clean = addr.replace(/<|>/g, '').trim().toLowerCase();
      return !IGNORED_EMAILS.some(ignored => clean.includes(ignored)) && !isInternalDomain(clean);
    }).map(addr => extractCleanEmail(addr));

    // Fallback 1: extract emails from body text
    if (clientEmails.length === 0) {
      console.log('No client emails in To/CC, scanning email body...');
      const bodyToScan = emailText || emailHtml || '';
      const bodyEmails = bodyToScan.match(/[\w.-]+@[\w.-]+\.\w+/g) || [];
      const uniqueBodyEmails = [...new Set(bodyEmails.map((e: string) => e.toLowerCase()))];
      for (const be of uniqueBodyEmails) {
        if (!IGNORED_EMAILS.some(ig => be.includes(ig)) && !isInternalDomain(be)) {
          clientEmails.push(be);
        }
      }
      if (clientEmails.length > 0) {
        console.log('Client emails extracted from body:', clientEmails);
      }
    }

    // Fallback 2: fetch full email from Resend API to get original To/CC headers
    if (clientEmails.length === 0 && emailId) {
      console.log('No client emails found yet, fetching full email from Resend API...');
      try {
        const fullEmailResp = await fetch(`https://api.resend.com/emails/${emailId}`, {
          headers: { 'Authorization': `Bearer ${resendApiKey}` },
        });
        if (fullEmailResp.ok) {
          const fullEmail = await fullEmailResp.json();
          console.log('Resend full email To:', JSON.stringify(fullEmail.to));
          console.log('Resend full email CC:', JSON.stringify(fullEmail.cc));
          
          const resendRecipients = [
            ...(fullEmail.to || []),
            ...(fullEmail.cc || []),
          ];
          for (const addr of resendRecipients) {
            const clean = typeof addr === 'string' ? extractCleanEmail(addr) : (addr?.email || '').toLowerCase();
            if (clean && !IGNORED_EMAILS.some(ig => clean.includes(ig)) && !isInternalDomain(clean)) {
              clientEmails.push(clean);
            }
          }
          if (clientEmails.length > 0) {
            console.log('Client emails extracted from Resend API:', clientEmails);
          }
        } else {
          console.log('Failed to fetch full email from Resend:', fullEmailResp.status);
          await fullEmailResp.text(); // consume body
        }
      } catch (e) {
        console.error('Error fetching full email from Resend API:', e);
      }
    }

    // Fallback 3: extract from HTML headers (e.g. "To: name <email>" patterns in forwarded content)
    if (clientEmails.length === 0 && emailHtml) {
      console.log('Scanning HTML for email headers...');
      const headerPatterns = [
        /(?:To|Para|Cc|CC|Cco):\s*(?:[^<]*<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/gi,
      ];
      for (const pattern of headerPatterns) {
        let match;
        while ((match = pattern.exec(emailHtml)) !== null) {
          const email = match[1].toLowerCase();
          if (!IGNORED_EMAILS.some(ig => email.includes(ig)) && !isInternalDomain(email) && !clientEmails.includes(email)) {
            clientEmails.push(email);
          }
        }
      }
      if (clientEmails.length > 0) {
        console.log('Client emails extracted from HTML headers:', clientEmails);
      }
    }

    console.log('Client emails found:', clientEmails);

    // Fallback 4: se ainda não achamos o cliente (ex.: Equipe respondeu do Outlook
    // com Assistente Escolar em BCC, então o envelope só tem assistant@ em TO/CC), tenta resolver
    // o lead via In-Reply-To/References — que apontam para uma mensagem do cliente
    // já registrada em email_messages.
    let leadFromHeaders: any = null;
    if (clientEmails.length === 0 && emailId) {
      try {
        const fullResp = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
          headers: { 'Authorization': `Bearer ${resendApiKey}` },
        });
        if (fullResp.ok) {
          const full = await fullResp.json();
          const hdrs = full.headers || {};
          const irt = extractHeaderValue(hdrs, ['In-Reply-To', 'in-reply-to']) || '';
          const refs = extractHeaderValue(hdrs, ['References', 'references']) || '';
          const candidateIds = [irt, ...refs.split(/\s+/)]
            .map((s: string) => normalizeMessageIdForDb(s))
            .filter(Boolean) as string[];
          if (candidateIds.length > 0) {
            console.log('Trying header-based lead resolution via In-Reply-To/References:', candidateIds.slice(0, 5));
            const { data: matches } = await supabase
              .from('email_messages')
              .select('lead_id, leads(id, name, email, emails, status)')
              .in('internet_message_id', candidateIds)
              .not('lead_id', 'is', null)
              .limit(5);
            if (matches && matches.length > 0) {
              const found = matches.find((m: any) => m.leads) || matches[0];
              leadFromHeaders = found.leads || { id: found.lead_id };
              console.log('✅ Lead resolved via thread headers:', leadFromHeaders.id, leadFromHeaders.name);
            }
          }
        }
      } catch (e) {
        console.error('Header-based lead lookup failed:', e);
      }
    }

    if (clientEmails.length === 0 && leadFromHeaders?.id) {
      // Salva o e-mail outbound e para por aqui — não tentamos enviar proposta
      // porque não temos endereço de cliente confiável no envelope.
      const savedEmailId = await saveOutboundEmail(
        supabase,
        leadFromHeaders.id,
        emailSubject,
        emailText,
        emailHtml,
        emailTimestamp,
        data.message_id || data.messageId || null,
      );
      if (emailId) {
        await processEmailAttachments(supabase, resendApiKey, emailId, leadFromHeaders.id, savedEmailId);
      }
      return new Response(
        JSON.stringify({
          success: true,
          associated: true,
          lead_id: leadFromHeaders.id,
          lead_name: leadFromHeaders.name || null,
          resolved_via: 'thread_headers',
          email_sent: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (clientEmails.length === 0) {
      console.log('No client emails found after all fallbacks, ignoring.');
      return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'no_client_emails' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Check if lead already exists
    const existingLead = await findExistingLead(supabase, clientEmails);

    if (existingLead) {
      // Lead exists — save email first
      console.log('Lead already exists, saving email and analyzing intent...');
      const savedEmailId = await saveOutboundEmail(supabase, existingLead.id, emailSubject, emailText, emailHtml, emailTimestamp, data.message_id || data.messageId || null);

      // Process attachments if email has an email_id from Resend
      if (emailId) {
        await processEmailAttachments(supabase, resendApiKey, emailId, existingLead.id, savedEmailId);
      }

      // Associate CC emails to lead
      await associateCCEmailsToLeadSafe(supabase, existingLead.id, clientEmails, existingLead.emails || []);

      // Analyze if Equipe wants to send a proposal
      const emailContent = emailText || emailHtml || '';
      const shouldSend = await analyzeIntent(emailContent, emailSubject, LOVABLE_API_KEY);

      if (!shouldSend) {
        console.log('Intent: NO proposal requested. Only saved email.');
        return new Response(
          JSON.stringify({ success: true, associated: true, lead_id: existingLead.id, lead_name: existingLead.name, email_sent: false, intent: 'no_proposal' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Intent: send proposal for existing lead — but ONLY if produto is publicidade
      console.log('Intent: PROPOSAL requested for existing lead!');

      // Check produto — if null, classify first
      let leadProduto = null;
      {
        const { data: leadData } = await supabase.from('leads').select('produto').eq('id', existingLead.id).single();
        leadProduto = leadData?.produto;
      }

      if (!leadProduto) {
        console.log('Lead has no produto, running generate-lead-description to classify...');
        try {
          const descResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-lead-description`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ leadId: existingLead.id }),
          });
          if (descResp.ok) {
            const descData = await descResp.json();
            leadProduto = descData.produto;
            console.log('Lead classified as:', leadProduto);
          }
        } catch (e) {
          console.error('Error classifying lead produto:', e);
        }
      }

      if (leadProduto !== 'publicidade') {
        console.log(`Lead produto is "${leadProduto}", NOT publicidade. Skipping proposal. Assistente Escolar only sends proposals for publicidade.`);
        return new Response(
          JSON.stringify({ success: true, associated: true, lead_id: existingLead.id, lead_name: existingLead.name, email_sent: false, intent: 'proposal_skipped_not_publicidade', produto: leadProduto }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const proposalResult = await generateAndSendProposal({
        supabase, resendApiKey, LOVABLE_API_KEY,
        leadId: existingLead.id,
        clientEmails: existingLead.emails || clientEmails,
        emailSubject, emailText, emailHtml,
        fromRaw, toAddresses, ccAddresses, data,
      });

      return new Response(
        JSON.stringify({ ...proposalResult, intent: 'proposal_sent' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Lead does NOT exist — check intent first, then create lead
    console.log('No existing lead found, checking intent before creating lead...');
    const emailContent = emailText || emailHtml || '';
    const shouldSendForNew = await analyzeIntent(emailContent, emailSubject, LOVABLE_API_KEY);

    if (!shouldSendForNew) {
      console.log('Intent: NO proposal requested for new lead. Creating lead (createOnly) and saving Equipe outbound email...');
      const createResult = await generateAndSendProposal({
        supabase, resendApiKey, LOVABLE_API_KEY,
        leadId: null,
        clientEmails,
        emailSubject, emailText, emailHtml,
        fromRaw, toAddresses, ccAddresses, data,
        createOnly: true,
      });

      // Classify product (fire-and-forget)
      if (createResult.lead_id) {
        try {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-lead-description`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ leadId: createResult.lead_id }),
          });
        } catch (e) {
          console.error('Error classifying new lead (createOnly):', e);
        }
      }

      return new Response(
        JSON.stringify({ ...createResult, intent: 'no_proposal_lead_created' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // New lead + intent = true → create lead and send proposal as instructed by Equipe
    console.log('Intent: PROPOSAL requested for NEW lead. Creating lead and sending proposal...');
    const proposalResult = await generateAndSendProposal({
      supabase, resendApiKey, LOVABLE_API_KEY,
      leadId: null,
      clientEmails,
      emailSubject, emailText, emailHtml,
      fromRaw, toAddresses, ccAddresses, data,
    });

    // After creating, classify the lead product (fire-and-forget)
    if (proposalResult.lead_id) {
      try {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-lead-description`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ leadId: proposalResult.lead_id }),
        });
      } catch (e) {
        console.error('Error classifying new lead after proposal:', e);
      }
    }

    return new Response(
      JSON.stringify({ ...proposalResult, intent: 'proposal_sent_new_lead' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in resend-inbound-webhook:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
