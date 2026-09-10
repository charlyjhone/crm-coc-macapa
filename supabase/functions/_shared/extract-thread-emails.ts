// Shared helper: extracts individual emails from a quoted thread using AI,
// dedupes them against existing email_messages, and inserts the missing ones.

export interface ExtractedEmail {
  subject: string;
  message: string;
  direction: 'inbound' | 'outbound';
  timestamp: string;
  sender_email: string;
  recipient_email: string;
}

const INTERNAL_DOMAINS = ['inventosdigitais.com.br', 'inventormiguel.com', 'inventormiguel.link'];

export async function extractEmailsFromThread(
  content: string,
  subject: string,
  userName = 'Miguel'
): Promise<ExtractedEmail[]> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableApiKey) return [];
  if (!content || content.length < 50) return [];

  try {
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: `Você analisa o corpo de um email (HTML ou texto) e extrai TODOS os emails individuais presentes, incluindo os citados em threads/replies.

O usuário se chama "${userName}". Domínios internos (outbound): @inventosdigitais.com.br, @inventormiguel.com, @inventormiguel.link.

Regras:
- Identifique CADA email separado, incluindo os abaixo de marcadores como "On ... wrote:", "Em ... escreveu:", "----- Original Message -----", "De: ...".
- Para cada email: subject, message (corpo limpo, sem citações aninhadas/assinatura/disclaimer), direction (outbound se remetente interno, inbound caso contrário), timestamp ISO 8601 (use o cabeçalho do trecho), sender_email, recipient_email.
- NÃO repita o mesmo email.
- Ordem cronológica (mais antigo primeiro).
- Se não houver thread/citação, retorne array vazio.`
          },
          { role: 'user', content: `Assunto: ${subject}\n\nConteúdo:\n${content}` }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'extract_individual_emails',
            description: 'Extrai emails individuais de threads',
            parameters: {
              type: 'object',
              properties: {
                emails: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      subject: { type: 'string' },
                      message: { type: 'string' },
                      direction: { type: 'string', enum: ['inbound', 'outbound'] },
                      timestamp: { type: 'string' },
                      sender_email: { type: 'string' },
                      recipient_email: { type: 'string' }
                    },
                    required: ['subject', 'message', 'direction', 'timestamp', 'sender_email', 'recipient_email'],
                    additionalProperties: false
                  }
                }
              },
              required: ['emails'],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'extract_individual_emails' } }
      })
    });

    if (!resp.ok) {
      console.error('extract-thread AI error:', await resp.text());
      return [];
    }
    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return [];
    const parsed = JSON.parse(toolCall.function.arguments);
    const emails: ExtractedEmail[] = parsed.emails || [];

    // Post-correction: enforce direction by sender domain
    for (const e of emails) {
      const sender = (e.sender_email || '').toLowerCase();
      if (INTERNAL_DOMAINS.some(d => sender.endsWith(`@${d}`))) e.direction = 'outbound';
    }
    return emails;
  } catch (err) {
    console.error('extract-thread error:', err);
    return [];
  }
}

export async function emailExistsInLead(
  supabase: any,
  leadId: string,
  email: ExtractedEmail
): Promise<boolean> {
  const ts = new Date(email.timestamp);
  if (!isNaN(ts.getTime())) {
    const start = new Date(ts.getTime() - 60000).toISOString();
    const end = new Date(ts.getTime() + 60000).toISOString();
    const { data } = await supabase
      .from('email_messages')
      .select('id')
      .eq('lead_id', leadId)
      .eq('direction', email.direction)
      .gte('timestamp', start)
      .lte('timestamp', end)
      .limit(1);
    if (data && data.length > 0) return true;
  }
  const prefix = (email.message || '').substring(0, 100).trim();
  if (prefix) {
    const { data } = await supabase
      .from('email_messages')
      .select('id, message')
      .eq('lead_id', leadId);
    if (data) {
      for (const ex of data) {
        if (ex.message && ex.message.substring(0, 100).trim() === prefix) return true;
      }
    }
  }
  return false;
}

export async function extractAndSaveThreadEmails(
  supabase: any,
  leadId: string,
  content: string,
  subject: string,
  userName = 'Miguel'
): Promise<number> {
  const emails = await extractEmailsFromThread(content, subject, userName);
  let saved = 0;
  for (const e of emails) {
    if (!e.message?.trim()) continue;
    const exists = await emailExistsInLead(supabase, leadId, e);
    if (exists) continue;
    const { error } = await supabase.from('email_messages').insert({
      lead_id: leadId,
      subject: e.subject || subject,
      message: e.message,
      html_body: `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">${e.message.replace(/\n/g, '<br>')}</div>`,
      direction: e.direction,
      timestamp: e.timestamp,
      raw_data: { extracted_from_thread: true, sender_email: e.sender_email, recipient_email: e.recipient_email }
    });
    if (error) {
      console.error('extract-thread insert error:', error);
    } else {
      saved++;
      console.log('extract-thread saved:', e.direction, e.sender_email, e.timestamp);
    }
  }
  return saved;
}
