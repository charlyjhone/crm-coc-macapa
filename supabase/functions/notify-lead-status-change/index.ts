import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOTIFY_TO = 'miguel@inventosdigitais.com.br';
const FROM_NAME = 'Susan Whitfield';
const FROM_EMAIL = 'susan@inventormiguel.link';
const APP_BASE_URL = 'https://autolead.inventormiguel.com';

const STATUS_LABELS: Record<string, string> = {
  em_aberto: 'Em Aberto',
  em_negociacao: 'Negociação',
  ganho: 'Ganho',
  perdido: 'Perdido',
  produzido: 'Produzido',
  entregue: 'Entregue',
};

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  status_change: 'Mudança de status',
  email_sent: 'E-mail enviado',
  email_received: 'E-mail recebido',
  whatsapp_sent: 'WhatsApp enviado',
  whatsapp_received: 'WhatsApp recebido',
  note_added: 'Nota',
  note_updated: 'Nota editada',
  note_deleted: 'Nota removida',
  meeting_added: 'Reunião',
  worker_action: 'Worker',
  delivery_sent: 'Envio',
  proposal_sent: 'Proposta',
  diagnosis_created: 'Diagnóstico IA',
  attachment_added: 'Anexo',
  payment_recorded: 'Pagamento',
  lead_created: 'Lead criado',
  lead_field_updated: 'Atualização',
  notification_sent: 'Notificação',
};

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR', { timeZone: 'Europe/Lisbon' });
  } catch {
    return '—';
  }
}

function fmtMoney(v: any, moeda: string = 'BRL'): string {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(n);
  } catch {
    return `${n} ${moeda}`;
  }
}

function escapeHtml(s: any): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { lead_id, to_status, from_status, actor, source } = body || {};

    if (!lead_id || !to_status) {
      return new Response(JSON.stringify({ error: 'lead_id and to_status required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['ganho', 'perdido'].includes(to_status)) {
      return new Response(JSON.stringify({ skipped: true, reason: 'status not ganho/perdido' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Idempotência: já notificamos esse lead+status nos últimos 60s?
    const sixtySecAgo = new Date(Date.now() - 60_000).toISOString();
    const { data: recent } = await supabase
      .from('activity_log')
      .select('id')
      .eq('lead_id', lead_id)
      .eq('activity_type', 'notification_sent')
      .gte('created_at', sixtySecAgo)
      .filter('metadata->>to_status', 'eq', to_status)
      .limit(1);

    if (recent && recent.length > 0) {
      console.log('Notification already sent recently, skipping');
      return new Response(JSON.stringify({ skipped: true, reason: 'already sent' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Busca lead
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('*')
      .eq('id', lead_id)
      .maybeSingle();

    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: 'lead not found', detail: leadErr?.message }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Busca activity_log (últimas 50)
    const { data: activities } = await supabase
      .from('activity_log')
      .select('*')
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: false })
      .limit(50);

    const isWin = to_status === 'ganho';
    const emoji = isWin ? '🎉' : '❌';
    const statusWord = isWin ? 'GANHO' : 'PERDIDO';
    const valorStr = lead.valor ? ` — ${fmtMoney(lead.valor, lead.moeda || 'BRL')}` : '';
    const produtoStr = lead.produto ? ` — ${lead.produto}` : '';
    const subject = `${emoji} Lead ${statusWord}: ${lead.name}${produtoStr}${isWin ? valorStr : ''}`;

    // ---------- HTML ----------
    const summaryRows: [string, string][] = [
      ['Nome', escapeHtml(lead.name)],
      ['Status', `${escapeHtml(STATUS_LABELS[from_status] || from_status || '—')} → <strong>${escapeHtml(STATUS_LABELS[to_status] || to_status)}</strong>`],
      ['Quando', fmtDate(new Date().toISOString())],
      ['Por quem', `${escapeHtml(actor || '—')} (${escapeHtml(source || '—')})`],
      ['Produto', escapeHtml(lead.produto || '—') + (lead.publicidade_subtipo ? ` · ${escapeHtml(lead.publicidade_subtipo)}` : '')],
      ['Valor', escapeHtml(fmtMoney(lead.valor, lead.moeda || 'BRL'))],
      ['Pago', escapeHtml(fmtMoney(lead.valor_pago, lead.moeda || 'BRL'))],
      ['E-mails', escapeHtml((lead.emails || []).join(', ') || lead.email || '—')],
      ['Telefones', escapeHtml((lead.phones || []).join(', ') || lead.phone || '—')],
      ['Origem', escapeHtml(lead.origem || lead.source || '—')],
    ];

    const summaryHtml = `<table style="border-collapse:collapse;width:100%;font-size:14px;">
${summaryRows.map(([k, v]) => `<tr><td style="padding:6px 12px;background:#f7f7f7;color:#666;width:120px;border-bottom:1px solid #eee;">${k}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${v}</td></tr>`).join('')}
</table>`;

    // Diagnóstico IA
    let diagnosisHtml = '';
    if (lead.ai_diagnosis) {
      diagnosisHtml = `
<h3 style="font-size:15px;margin:24px 0 8px;color:#333;">Diagnóstico IA${lead.ai_close_probability != null ? ` · ${lead.ai_close_probability}%` : ''}</h3>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#444;">${escapeHtml(lead.ai_diagnosis)}</p>
${lead.ai_next_step ? `<p style="margin:0;font-size:13px;color:#666;"><strong>Próximo passo:</strong> ${escapeHtml(lead.ai_next_step)}</p>` : ''}`;
    }

    // Descrição
    let descriptionHtml = '';
    if (lead.description) {
      descriptionHtml = `
<h3 style="font-size:15px;margin:24px 0 8px;color:#333;">Descrição</h3>
<p style="margin:0;font-size:13px;line-height:1.5;color:#444;white-space:pre-wrap;">${escapeHtml(lead.description)}</p>`;
    }

    // Linha do tempo
    const timeline: [string, string | null][] = [
      ['Criado', lead.created_at],
      ['Negociação', lead.negociacao_at],
      ['Ganho', lead.ganho_at],
      ['Perdido', lead.perdido_at],
      ['Reaberto', lead.reopened_at],
      ['Produzido', lead.produzido_at],
      ['Entregue', lead.delivered_at],
      ['Próximo pagamento', lead.data_proximo_pagamento],
    ].filter(([, v]) => v) as [string, string][];

    const timelineHtml = `
<h3 style="font-size:15px;margin:24px 0 8px;color:#333;">Linha do tempo</h3>
<table style="border-collapse:collapse;width:100%;font-size:13px;">
${timeline.map(([k, v]) => `<tr><td style="padding:4px 12px;color:#666;width:140px;">${k}</td><td style="padding:4px 12px;color:#222;">${fmtDate(v)}</td></tr>`).join('')}
</table>`;

    // Activity log
    const activitiesHtml = `
<h3 style="font-size:15px;margin:24px 0 8px;color:#333;">Log de atividades (últimas ${activities?.length || 0})</h3>
<table style="border-collapse:collapse;width:100%;font-size:12px;">
<thead><tr style="background:#f7f7f7;color:#666;">
<th style="padding:6px 8px;text-align:left;border-bottom:1px solid #ddd;width:130px;">Quando</th>
<th style="padding:6px 8px;text-align:left;border-bottom:1px solid #ddd;width:110px;">Tipo</th>
<th style="padding:6px 8px;text-align:left;border-bottom:1px solid #ddd;">Descrição</th>
<th style="padding:6px 8px;text-align:left;border-bottom:1px solid #ddd;width:90px;">Quem</th>
<th style="padding:6px 8px;text-align:left;border-bottom:1px solid #ddd;width:130px;">Origem</th>
</tr></thead>
<tbody>
${(activities || []).map((a: any) => `<tr>
<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;color:#666;">${fmtDate(a.created_at)}</td>
<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;">${escapeHtml(ACTIVITY_TYPE_LABELS[a.activity_type] || a.activity_type)}</td>
<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;color:#222;">${escapeHtml(a.description || '')}</td>
<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;color:#444;">${escapeHtml(a.actor || '—')}</td>
<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;color:#666;">${escapeHtml(a.source || '—')}</td>
</tr>`).join('')}
</tbody>
</table>`;

    const linkHtml = `
<p style="margin:32px 0 0;font-size:13px;">
<a href="${APP_BASE_URL}/opportunity/${lead.id}" style="background:${isWin ? '#16a34a' : '#dc2626'};color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Abrir lead no autolead</a>
</p>`;

    const html = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#222;background:#ffffff;margin:0;padding:24px;">
<div style="max-width:760px;margin:0 auto;">
<h2 style="font-size:20px;margin:0 0 4px;color:${isWin ? '#16a34a' : '#dc2626'};">${emoji} Lead ${escapeHtml(statusWord)}</h2>
<p style="margin:0 0 20px;color:#666;font-size:14px;">${escapeHtml(lead.name)}</p>
${summaryHtml}
${diagnosisHtml}
${descriptionHtml}
${timelineHtml}
${activitiesHtml}
${linkHtml}
<p style="margin:32px 0 0;font-size:11px;color:#999;">Notificação automática · autolead.inventormiguel.com</p>
</div></body></html>`;

    // Envia via Resend
    const sendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [NOTIFY_TO],
        subject,
        html,
      }),
    });

    if (!sendResp.ok) {
      const errTxt = await sendResp.text();
      console.error('Resend error:', sendResp.status, errTxt);
      return new Response(JSON.stringify({ error: 'send failed', detail: errTxt }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sendData = await sendResp.json();
    console.log('✅ Notification sent:', sendData);

    // Registra no activity_log
    await supabase.from('activity_log').insert({
      lead_id,
      activity_type: 'notification_sent',
      description: `Notificação por e-mail enviada para ${NOTIFY_TO} (${statusWord})`,
      source: 'edge_function:notify-lead-status-change',
      actor: 'system',
      metadata: {
        to_status,
        from_status: from_status || null,
        triggered_by_actor: actor || null,
        triggered_by_source: source || null,
        recipient: NOTIFY_TO,
        resend_id: sendData.id || null,
      },
    });

    return new Response(JSON.stringify({ success: true, resend_id: sendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('notify-lead-status-change error:', e);
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
