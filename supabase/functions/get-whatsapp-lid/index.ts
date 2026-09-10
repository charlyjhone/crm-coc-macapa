import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  phones: string[] | null;
  whatsapp_chat_lids: string[] | null;
}

interface ZApiPhoneExistsResponse {
  exists: boolean;
  lid?: string;
  numberFormatted?: string;
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { leadId, phone } = await req.json();
    
    if (!leadId) {
      return new Response(
        JSON.stringify({ error: 'leadId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`=== GET-WHATSAPP-LID para lead ${leadId} ===`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID');
    const zapiToken = Deno.env.get('ZAPI_TOKEN');
    const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

    if (!zapiInstanceId || !zapiToken || !zapiClientToken) {
      return new Response(
        JSON.stringify({ error: 'Configuração do Z-API não encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, name, phone, phones, whatsapp_chat_lids, whatsapp_phone_lid_map')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      console.error('Lead não encontrado:', leadError);
      return new Response(
        JSON.stringify({ error: 'Lead não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Collect all phones to check
    const phonesToCheck: string[] = [];
    
    if (phone) {
      phonesToCheck.push(phone);
    } else {
      // Check all phones from lead
      if (lead.phones && lead.phones.length > 0) {
        phonesToCheck.push(...lead.phones);
      }
      if (lead.phone && !phonesToCheck.includes(lead.phone)) {
        phonesToCheck.push(lead.phone);
      }
    }

    if (phonesToCheck.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Lead não possui telefones cadastrados', chatLidsAdded: [], messagesReconciled: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Verificando ${phonesToCheck.length} telefones:`, phonesToCheck);

    const existingChatLids = lead.whatsapp_chat_lids || [];
    const newChatLids: string[] = [];
    // Mapeamento telefone(digits) -> @lid descoberto agora
    const phoneLidMap: Record<string, string> = {};

    // Query Z-API for each phone
    for (const rawPhone of phonesToCheck) {
      const normalizedPhone = rawPhone.replace(/\D/g, '');
      // Se o número já tem 11+ dígitos (já inclui código de país), usa como está.
      // Só assume Brasil (55) para números locais curtos (10-11 dígitos começando com DDD BR).
      const looksLikeBRLocal = normalizedPhone.length >= 10 && normalizedPhone.length <= 11 && !normalizedPhone.startsWith('55');
      const phoneWithCountry = looksLikeBRLocal ? `55${normalizedPhone}` : normalizedPhone;

      console.log(`Consultando Z-API para ${phoneWithCountry}...`);

      try {
        const response = await fetch(
          `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/phone-exists/${phoneWithCountry}`,
          {
            method: 'GET',
            headers: {
              'Client-Token': zapiClientToken,
            },
          }
        );

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          console.error(
            `Erro Z-API para ${phoneWithCountry}: ${response.status}${errorBody ? ` - ${errorBody}` : ''}`
          );
          continue;
        }

        const data: ZApiPhoneExistsResponse = await response.json();
        console.log(`Resposta Z-API para ${phoneWithCountry}:`, data);

        if (data.exists && data.lid) {
          const formattedLid = data.lid.includes('@') ? data.lid : `${data.lid}@lid`;
          // Registra mapeamento (variações do telefone -> lid)
          phoneLidMap[phoneWithCountry] = formattedLid;
          phoneLidMap[normalizedPhone] = formattedLid;

          if (!existingChatLids.includes(formattedLid) && !newChatLids.includes(formattedLid)) {
            newChatLids.push(formattedLid);
            console.log(`Novo chatLid encontrado: ${formattedLid}`);
          }
        }
      } catch (zapiError) {
        console.error(`Erro ao consultar Z-API para ${phoneWithCountry}:`, zapiError);
      }
    }

    // Update lead with new chatLids e phone_lid_map
    let chatLidsAdded: string[] = [];
    const existingMap = ((lead as any).whatsapp_phone_lid_map || {}) as Record<string, string>;
    const mergedMap = { ...existingMap, ...phoneLidMap };
    const mapChanged = JSON.stringify(mergedMap) !== JSON.stringify(existingMap);

    if (newChatLids.length > 0 || mapChanged) {
      const updatedChatLids = [...existingChatLids, ...newChatLids];
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          whatsapp_chat_lids: updatedChatLids,
          whatsapp_phone_lid_map: mergedMap,
        })
        .eq('id', leadId);

      if (updateError) {
        console.error('Erro ao atualizar lead:', updateError);
      } else {
        chatLidsAdded = newChatLids;
        console.log(`Lead atualizado. Novos chatLids: ${newChatLids.join(', ')}. Map:`, mergedMap);
      }
    }

    // Reconcile orphan messages
    const allChatLids = [...existingChatLids, ...newChatLids];
    let messagesReconciled = 0;

    if (allChatLids.length > 0) {
      // Find orphan messages that have phone matching any of the lids (without @lid suffix too)
      const lidPatterns = allChatLids.map(lid => {
        const cleanLid = lid.replace('@lid', '');
        return [`phone.eq.${lid}`, `phone.eq.${cleanLid}@lid`, `phone.ilike.%${cleanLid}%`];
      }).flat();

      console.log(`Buscando mensagens órfãs com patterns:`, lidPatterns.slice(0, 5));

      const { data: orphanMessages, error: orphanError } = await supabase
        .from('whatsapp_messages')
        .select('id, phone')
        .is('lead_id', null)
        .or(lidPatterns.join(','));

      if (orphanError) {
        console.error('Erro ao buscar mensagens órfãs:', orphanError);
      } else if (orphanMessages && orphanMessages.length > 0) {
        console.log(`Encontradas ${orphanMessages.length} mensagens órfãs para reconciliar`);

        const { error: reconError } = await supabase
          .from('whatsapp_messages')
          .update({ lead_id: leadId })
          .in('id', orphanMessages.map(m => m.id));

        if (reconError) {
          console.error('Erro ao reconciliar mensagens:', reconError);
        } else {
          messagesReconciled = orphanMessages.length;
          console.log(`${messagesReconciled} mensagens reconciliadas`);
        }
      }
    }

    // Also try to reconcile by phone number patterns (for messages that came via regular phone)
    const phonePatterns: string[] = [];
    for (const rawPhone of phonesToCheck) {
      const digits = rawPhone.replace(/\D/g, '');
      const suffix8 = digits.slice(-8);
      if (suffix8.length >= 8) {
        phonePatterns.push(`phone.ilike.%${suffix8}%`);
      }
    }

    if (phonePatterns.length > 0) {
      const { data: phoneOrphans, error: phoneOrphanError } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .is('lead_id', null)
        .or(phonePatterns.join(','));

      if (!phoneOrphanError && phoneOrphans && phoneOrphans.length > 0) {
        console.log(`Encontradas ${phoneOrphans.length} mensagens órfãs por telefone`);

        const { error: updateErr } = await supabase
          .from('whatsapp_messages')
          .update({ lead_id: leadId })
          .in('id', phoneOrphans.map(m => m.id));

        if (!updateErr) {
          messagesReconciled += phoneOrphans.length;
          console.log(`${phoneOrphans.length} mensagens adicionais reconciliadas por telefone`);
        }
      }
    }

    console.log(`=== RESULTADO: ${chatLidsAdded.length} chatLids adicionados, ${messagesReconciled} mensagens reconciliadas ===`);

    return new Response(
      JSON.stringify({
        success: true,
        chatLidsAdded,
        messagesReconciled,
        leadName: lead.name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Erro no get-whatsapp-lid:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
