import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== RECONCILIAÇÃO DE MENSAGENS ÓRFÃS ===");
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch orphan messages (lead_id IS NULL) from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: orphanMessages, error: orphanError } = await supabase
      .from('whatsapp_messages')
      .select('id, phone, raw_data, created_at')
      .is('lead_id', null)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(500);

    if (orphanError) {
      console.error('Erro ao buscar mensagens órfãs:', orphanError);
      throw orphanError;
    }

    console.log(`Encontradas ${orphanMessages?.length || 0} mensagens órfãs`);

    if (!orphanMessages || orphanMessages.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Nenhuma mensagem órfã encontrada', reconciled: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let reconciledCount = 0;
    const results: Array<{ messageId: string; leadId: string | null; method: string }> = [];

    for (const msg of orphanMessages) {
      const chatLid = msg.raw_data?.chatLid || null;
      const rawPhone = msg.phone || '';
      
      // Normalize phone number
      const onlyDigits = rawPhone.toString().replace(/@.*$/, '').replace(/\D/g, '');
      const isLidPhone = rawPhone.includes('@lid');
      
      let leadId: string | null = null;
      let resolveMethod = 'none';

      // Try to resolve by chatLid first
      if (chatLid && !leadId) {
        const { data: leadsWithChatLid } = await supabase
          .from('leads')
          .select('id, name, status, archived')
          .contains('whatsapp_chat_lids', [chatLid]);

        if (leadsWithChatLid && leadsWithChatLid.length > 0) {
          // Prioritize active leads
          const activeLead = leadsWithChatLid.find(l => 
            !l.archived && (l.status === 'em_aberto' || l.status === 'em_negociacao')
          );
          const wonLead = leadsWithChatLid.find(l => l.status === 'ganho' && !l.archived);
          const anyLead = leadsWithChatLid[0];

          leadId = activeLead?.id || wonLead?.id || anyLead?.id || null;
          if (leadId) {
            resolveMethod = 'chatLid_field';
            console.log(`Mensagem ${msg.id} -> Lead ${leadId} via chatLid_field`);
          }
        }
      }

      // If not resolved by chatLid, try phone (only if it's a real phone)
      if (!leadId && onlyDigits && !isLidPhone && onlyDigits.length >= 10) {
        const localPhone = onlyDigits.startsWith('55') ? onlyDigits.slice(2) : onlyDigits;
        const normalizedPhone = '55' + localPhone;
        const suffix11 = localPhone.length >= 11 ? localPhone.slice(-11) : null;
        const suffix10 = localPhone.length >= 10 ? localPhone.slice(-10) : null;

        const orConditions: string[] = [
          `phones.cs.{${normalizedPhone}}`,
          `phones.cs.{${localPhone}}`,
          `phone.ilike.*${localPhone}*`,
        ];
        if (suffix11) {
          orConditions.push(`phone.ilike.*${suffix11}*`);
        }
        if (suffix10) {
          orConditions.push(`phone.ilike.*${suffix10}*`);
        }

        const { data: leads } = await supabase
          .from('leads')
          .select('id, name, status, archived, whatsapp_chat_lids')
          .or(orConditions.join(','));

        if (leads && leads.length > 0) {
          // Prioritize active leads
          const activeLead = leads.find(l => 
            !l.archived && (l.status === 'em_aberto' || l.status === 'em_negociacao')
          );
          const wonLead = leads.find(l => l.status === 'ganho' && !l.archived);
          const anyLead = leads[0];

          const chosenLead = activeLead || wonLead || anyLead;
          leadId = chosenLead?.id || null;
          
          if (leadId) {
            resolveMethod = 'phone';
            console.log(`Mensagem ${msg.id} -> Lead ${leadId} via phone`);

            // Also persist chatLid if we have one and lead doesn't have it
            if (chatLid && chosenLead) {
              const existingChatLids = chosenLead.whatsapp_chat_lids || [];
              if (!existingChatLids.includes(chatLid)) {
                await supabase
                  .from('leads')
                  .update({ whatsapp_chat_lids: [...existingChatLids, chatLid] })
                  .eq('id', leadId);
                console.log(`ChatLid ${chatLid} adicionado ao lead ${leadId}`);
              }
            }
          }
        }
      }

      // Update message if we found a lead
      if (leadId) {
        const { error: updateError } = await supabase
          .from('whatsapp_messages')
          .update({ lead_id: leadId })
          .eq('id', msg.id);

        if (updateError) {
          console.error(`Erro ao atualizar mensagem ${msg.id}:`, updateError);
        } else {
          reconciledCount++;
        }
      }

      results.push({ messageId: msg.id, leadId, method: resolveMethod });
    }

    console.log(`=== RECONCILIAÇÃO COMPLETA: ${reconciledCount}/${orphanMessages.length} mensagens reconciliadas ===`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Reconciliação completa`,
        total: orphanMessages.length,
        reconciled: reconciledCount,
        results: results.slice(0, 50) // Limit response size
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Erro na reconciliação:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
