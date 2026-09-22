import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { setActivityContext } from "../_shared/activity-context.ts";
import { normalizeWhatsAppPhone } from "../_shared/whatsapp-phone.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, message, leadId, senderType = 'human' } = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: 'phone e message são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'Credenciais Z-API não configuradas' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalizar telefone (remover caracteres especiais)
    // O número deve estar cadastrado com código de país incluso (ex: 5511999998888)
    const normalizedPhone = normalizeWhatsAppPhone(phone);

    // Ao iniciar um chat (primeiro outbound), precisamos persistir o chatLid no lead
    // para que callbacks do webhook que chegam como "@lid" nunca mais virem órfãos.
    let resolvedChatLid: string | null = null;
    if (leadId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: lead } = await supabase
          .from('leads')
          .select('id, whatsapp_chat_lids, whatsapp_phone_lid_map')
          .eq('id', leadId)
          .maybeSingle();

        const existingChatLids: string[] = lead?.whatsapp_chat_lids || [];
        const existingPhoneLidMap = ((lead as any)?.whatsapp_phone_lid_map || {}) as Record<string, string>;

        const phoneExistsUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/phone-exists/${normalizedPhone}`;
        const phoneExistsRes = await fetch(phoneExistsUrl, {
          method: 'GET',
          headers: {
            'Client-Token': ZAPI_CLIENT_TOKEN,
          },
        });

        if (!phoneExistsRes.ok) {
          const errTxt = await phoneExistsRes.text().catch(() => '');
          console.error(
            `Erro Z-API phone-exists para ${normalizedPhone}: ${phoneExistsRes.status}${errTxt ? ` - ${errTxt}` : ''}`
          );
        } else {
          const phoneExistsData = await phoneExistsRes.json();
          if (phoneExistsData?.exists && phoneExistsData?.lid) {
            const formatted = (phoneExistsData.lid as string).includes('@')
              ? (phoneExistsData.lid as string)
              : `${phoneExistsData.lid}@lid`;

            resolvedChatLid = formatted;

            const mergedPhoneLidMap = {
              ...existingPhoneLidMap,
              [normalizedPhone]: formatted,
              [normalizedPhone.startsWith('55') ? normalizedPhone.slice(2) : normalizedPhone]: formatted,
            };

            if (!existingChatLids.includes(formatted) || JSON.stringify(mergedPhoneLidMap) !== JSON.stringify(existingPhoneLidMap)) {
              const { error: updateErr } = await supabase
                .from('leads')
                .update({
                  whatsapp_chat_lids: existingChatLids.includes(formatted) ? existingChatLids : [...existingChatLids, formatted],
                  whatsapp_phone_lid_map: mergedPhoneLidMap,
                })
                .eq('id', leadId);

              if (updateErr) {
                console.error('Erro ao salvar whatsapp_chat_lids no lead:', updateErr);
              } else {
                console.log('chatLid persistido no lead (início de chat):', formatted);
              }
            }

            // Se já existir algum callback órfão com @lid, tentar reconciliar imediatamente.
            const { error: reconcileErr } = await supabase
              .from('whatsapp_messages')
              .update({ lead_id: leadId })
              .is('lead_id', null)
              .or(`phone.eq.${formatted},raw_data->>chatLid.eq.${formatted}`);

            if (reconcileErr) {
              console.error('Erro ao reconciliar mensagens órfãs (pre-send):', reconcileErr);
            }
          }
        }
        // Fallback: usa o LID já salvo no lead quando o phone-exists não resolver
        if (!resolvedChatLid && existingChatLids.length > 0) {
          resolvedChatLid = existingChatLids[0];
          console.log('Usando chatLid já salvo no lead como fallback:', resolvedChatLid);
        }
      } catch (e) {
        console.error('Falha ao resolver/persistir chatLid antes de enviar:', e);
      }
    }

    // Enviar mensagem via Z-API
    const zapiUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
    
    console.log('Enviando mensagem para:', normalizedPhone);
    
    const sendViaZapi = async (target: string) => {
      const resp = await fetch(zapiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': ZAPI_CLIENT_TOKEN,
        },
        body: JSON.stringify({ phone: target, message: message }),
      });
      const data = await resp.json().catch(() => ({}));
      console.log(`Resposta Z-API (${target}):`, data);
      // Sucesso REAL exige id de mensagem no corpo — a Z-API pode devolver
      // HTTP 200 com erro, e "200 sem id" já produziu mensagem fantasma
      // (registrada no CRM sem nunca chegar no cliente).
      const ok = resp.ok && !!(data?.messageId || data?.zaapId || data?.id);
      return { ok, data };
    };

    let sendResult = await sendViaZapi(normalizedPhone);

    // Fallback: chats que vivem sob LID (frequente com números internacionais)
    // podem não aceitar envio pelo número — tenta pelo chatLid resolvido.
    if (!sendResult.ok && resolvedChatLid) {
      console.warn(`Envio pelo número falhou; tentando pelo chatLid ${resolvedChatLid}`);
      sendResult = await sendViaZapi(resolvedChatLid);
      if (!sendResult.ok) {
        sendResult = await sendViaZapi(resolvedChatLid.replace('@lid', ''));
      }
    }

    const zapiData = sendResult.data;
    if (!sendResult.ok) {
      // NÃO registra a mensagem no banco — falha precisa ser visível pra quem chamou
      throw new Error(`Z-API não confirmou o envio (sem messageId): ${JSON.stringify(zapiData).slice(0, 300)}`);
    }

    // Salvar mensagem no banco — associada APENAS ao número de telefone (não ao lead).
    // O lead "vê" a mensagem porque o número está cadastrado nele; o cache é recalculado por trigger.
    {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      await setActivityContext(supabase, { source: 'edge_function:send-whatsapp', actor: 'ana' });

      await supabase
        .from('whatsapp_messages')
        .insert({
          lead_id: null,
          phone: normalizedPhone,
          message: message,
          direction: 'outbound',
          timestamp: new Date().toISOString(),
          raw_data: {
            ...zapiData,
            resolvedChatLid,
            sender_type: senderType === 'ana' ? 'ana' : 'human',
            source: senderType === 'ana' ? 'school-triage' : 'manual',
          },
        });
    }

    return new Response(
      JSON.stringify({ success: true, data: zapiData }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
