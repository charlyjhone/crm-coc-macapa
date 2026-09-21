import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { setActivityContext } from "../_shared/activity-context.ts";
import { isInternalPhone } from "../_shared/internal-contacts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Z-API webhook received");
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    await setActivityContext(supabase, { source: 'webhook:zapi', actor: 'system' });

    const payload = await req.json();
    console.log("Z-API payload:", JSON.stringify(payload, null, 2));

    // ===== EARLY EXIT: Filter out non-message events =====
    const notification = payload.notification || payload.type || '';
    if (notification === 'CHAT_LABEL_ASSOCIATION') {
      console.log('⏭️ Ignorando evento CHAT_LABEL_ASSOCIATION (não é mensagem real)');
      return new Response(
        JSON.stringify({ success: true, message: 'Evento de label ignorado', skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // waitingMessage / viewOnce without actual content are media notifications, not messages
    if ((payload.waitingMessage === true || payload.viewOnce === true) && 
        !payload.text?.message && !payload.message && !payload.body && !payload.content && !payload.text &&
        !payload.audio?.audioUrl && !payload.audioUrl) {
      console.log('⏭️ Ignorando callback waitingMessage/viewOnce sem conteúdo');
      return new Response(
        JSON.stringify({ success: true, message: 'Evento waitingMessage/viewOnce sem conteúdo ignorado', skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    // ===== STEP 1: Extract identifiers =====
    const rawPhone = payload.phone || payload.from || payload.remoteJid || '';
    const chatLid = payload.chatLid || (rawPhone.includes('@lid') ? rawPhone : null);
    
    // CRITICAL: Only consider it a LID event if the PHONE itself is @lid
    // chatLid almost always contains @lid, but we should still resolve by phone when available
    const isLidEvent = rawPhone.includes('@lid');
    
    console.log('=== IDENTIFICADORES ===');
    console.log('rawPhone:', rawPhone);
    console.log('chatLid:', chatLid);
    console.log('isLidEvent:', isLidEvent, '(só true quando rawPhone contém @lid)');

    let message = payload.text?.message 
      || payload.message 
      || payload.body 
      || payload.content
      || payload.text
      || '';
    
    const rawTs = payload.timestamp ?? payload.momment ?? null;
    const tsMs = typeof rawTs === 'number' ? (rawTs > 1e12 ? rawTs : rawTs * 1000) : Date.now();
    const timestamp = new Date(tsMs);
    const direction = payload.fromMe ? 'outbound' : 'inbound';
    
    // Extract contact name from Z-API payload - ONLY use for inbound messages (the client's name)
    const rawContactName = payload.senderName || payload.contactName || payload.name || payload.pushName || payload.notifyName || null;
    const contactName = (direction === 'inbound' && rawContactName) ? rawContactName : null;
    if (contactName) {
      console.log('Nome do contato (inbound) recebido:', contactName);
    }
    
    let isAudio = false;
    const audioUrl = payload.audio?.audioUrl || payload.audioUrl;
    
    if (audioUrl && !message) {
      console.log('Áudio detectado, URL:', audioUrl);
      isAudio = true;
      
      try {
        const transcribeResponse = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ audioUrl })
        });
        
        if (transcribeResponse.ok) {
          const { text } = await transcribeResponse.json();
          message = text || '[Áudio não transcrito]';
          console.log('Áudio transcrito:', message);
        } else {
          console.error('Erro ao transcrever áudio');
          message = '[Mensagem de áudio - erro na transcrição]';
        }
      } catch (error) {
        console.error('Erro ao processar áudio:', error);
        message = '[Mensagem de áudio - erro ao processar]';
      }
    }

    // ===== STEP 2: Handle phone normalization (only if NOT a LID event) =====
    let normalizedPhone: string | null = null;
    let localPhone: string | null = null;
    let suffix11: string | null = null;
    let suffix10: string | null = null;
    let suffix8: string | null = null; // Last 8 digits for flexible matching

    if (!isLidEvent && rawPhone) {
      const onlyDigits = rawPhone.toString().replace(/@.*$/, '').replace(/\D/g, '');
      
      const isInternational = onlyDigits.startsWith('351') || 
                             onlyDigits.startsWith('1') || 
                             onlyDigits.startsWith('44') ||
                             onlyDigits.startsWith('33') ||
                             onlyDigits.startsWith('34') ||
                             onlyDigits.startsWith('39') ||
                             onlyDigits.startsWith('49') ||
                             (onlyDigits.length > 10 && !onlyDigits.startsWith('55'));
      
      if (isInternational) {
        normalizedPhone = onlyDigits;
        localPhone = onlyDigits;
      } else {
        localPhone = onlyDigits.startsWith('55') ? onlyDigits.slice(2) : onlyDigits;
        normalizedPhone = '55' + localPhone;
      }
      
      suffix11 = localPhone && localPhone.length >= 11 ? localPhone.slice(-11) : null;
      suffix10 = localPhone && localPhone.length >= 10 ? localPhone.slice(-10) : null;
      suffix8 = localPhone && localPhone.length >= 8 ? localPhone.slice(-8) : null;
      
      console.log('Telefone normalizado:', normalizedPhone, 'local:', localPhone, 'suffix8:', suffix8);
    } else if (isLidEvent) {
      console.log('Evento @lid detectado - NÃO será tratado como telefone');
    }

    // ===== EARLY EXIT: Contato interno (funcionário) =====
    // Funcionários/equipe NUNCA viram lead. Mensagens são descartadas pelo webhook.
    if (normalizedPhone && isInternalPhone(normalizedPhone)) {
      console.log('⏭️ Ignorando mensagem de contato interno (funcionário):', normalizedPhone);
      return new Response(
        JSON.stringify({ success: true, message: 'Contato interno ignorado', skipped: true, internal: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== STEP 3: Check for duplicate message =====
    const messageId = payload.messageId ?? null;
    if (messageId) {
      const { data: existingMsg } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('raw_data->>messageId', messageId)
        .limit(1)
        .maybeSingle();

      if (existingMsg) {
        console.log('Mensagem duplicada detectada (messageId):', messageId);
        return new Response(
          JSON.stringify({ success: true, message: 'Mensagem duplicada ignorada', messageId }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    let leadId: string | null = null;
    let chosenLead: any = null;
    let duplicateLeadsCount = 0;
    let resolveMethod: string = 'none';

    // ===== STEP 4: Try to resolve lead by chatLid first =====
    if (chatLid) {
      console.log('=== RESOLUÇÃO POR CHAT_LID ===');
      
      // First check if any lead has this chatLid in whatsapp_chat_lids array
      const { data: leadsWithChatLid, error: chatLidError } = await supabase
        .from('leads')
        .select('id, phones, emails, email, phone, status, delivered_at, archived, unclassified, name, whatsapp_chat_lids')
        .contains('whatsapp_chat_lids', [chatLid]);
      
      if (chatLidError) {
        console.error('Erro ao buscar leads por chatLid:', chatLidError);
      }
      
      if (leadsWithChatLid && leadsWithChatLid.length > 0) {
        console.log(`Encontrados ${leadsWithChatLid.length} leads com este chatLid no campo whatsapp_chat_lids`);
        duplicateLeadsCount = leadsWithChatLid.length;
        
        // Prioritize by status
        const activeLead = leadsWithChatLid.find((l: any) => 
          l.archived === false && 
          l.unclassified === false && 
          (l.status === 'em_aberto' || l.status === 'em_negociacao' || l.status === 'produzido')
        );
        
        if (activeLead) {
          leadId = activeLead.id;
          chosenLead = activeLead;
          resolveMethod = 'chatLid_field_active';
          console.log('Lead ativo encontrado por whatsapp_chat_lids:', leadId, 'name:', activeLead.name);
        } else {
          const wonLead = leadsWithChatLid.find((l: any) => (l.status === 'ganho' || l.status === 'produzido') && l.archived === false);
          if (wonLead) {
            leadId = wonLead.id;
            chosenLead = wonLead;
            resolveMethod = 'chatLid_field_ganho';
            console.log('Lead ganho/produzido encontrado por whatsapp_chat_lids:', leadId, 'name:', wonLead.name);
          }
        }
      }
      
      // If not found by field, search in whatsapp_messages history
      if (!leadId) {
        console.log('Buscando leads por histórico de mensagens com chatLid...');
        
        const { data: messagesWithChatLid, error: msgError } = await supabase
          .from('whatsapp_messages')
          .select('lead_id')
          .eq('raw_data->>chatLid', chatLid)
          .order('created_at', { ascending: false })
          .limit(50);
        
        if (msgError) {
          console.error('Erro ao buscar mensagens por chatLid:', msgError);
        }
        
        if (messagesWithChatLid && messagesWithChatLid.length > 0) {
          const uniqueLeadIds = [...new Set(messagesWithChatLid.map(m => m.lead_id).filter(Boolean))];
          console.log('Lead IDs encontrados via histórico de mensagens:', uniqueLeadIds);
          
          if (uniqueLeadIds.length > 0) {
            const { data: candidateLeads, error: candidateError } = await supabase
              .from('leads')
              .select('id, phones, emails, email, phone, status, delivered_at, archived, unclassified, name, whatsapp_chat_lids')
              .in('id', uniqueLeadIds);
            
            if (candidateError) {
              console.error('Erro ao buscar leads candidatos:', candidateError);
            }
            
            if (candidateLeads && candidateLeads.length > 0) {
              duplicateLeadsCount = Math.max(duplicateLeadsCount, candidateLeads.length);
              
              // Prioritize active leads (em_aberto/em_negociacao/produzido)
              const activeLead = candidateLeads.find((l: any) => 
                l.archived === false && 
                l.unclassified === false && 
                (l.status === 'em_aberto' || l.status === 'em_negociacao' || l.status === 'produzido')
              );
              
              if (activeLead) {
                leadId = activeLead.id;
                chosenLead = activeLead;
                resolveMethod = 'chatLid_history_active';
                console.log('Lead ativo encontrado por histórico chatLid:', leadId, 'name:', activeLead.name);
              } else {
                // Try ganho/produzido
                const wonLead = candidateLeads.find((l: any) => (l.status === 'ganho' || l.status === 'produzido') && l.archived === false);
                if (wonLead) {
                  leadId = wonLead.id;
                  chosenLead = wonLead;
                  resolveMethod = 'chatLid_history_ganho';
                  console.log('Lead ganho/produzido encontrado por histórico chatLid:', leadId, 'name:', wonLead.name);
                } else {
                  // Check for entregue - but first cross-check by phone for ganho/produzido
                  const deliveredLead = candidateLeads.find((l: any) => l.status === 'entregue');
                  if (deliveredLead) {
                    // CROSS-CHECK: before creating recurring, check if there's a ganho/produzido lead with same phone
                    const deliveredPhones = [deliveredLead.phone, ...(deliveredLead.phones || [])].map((p: any) => (p ?? '').toString().replace(/\D/g, '')).filter(Boolean);
                    let crossCheckLead: any = null;
                    
                    if (deliveredPhones.length > 0) {
                      const crossOrConditions = deliveredPhones.flatMap((p: string) => [`phone.ilike.%${p.slice(-8)}%`, `phones.cs.{${p}}`]);
                      const { data: crossLeads } = await supabase
                        .from('leads')
                        .select('id, name, phone, phones, status, archived, whatsapp_chat_lids')
                        .or(crossOrConditions.join(','))
                        .in('status', ['ganho', 'produzido', 'em_negociacao'])
                        .eq('archived', false);
                      
                      if (crossLeads && crossLeads.length > 0) {
                        crossCheckLead = crossLeads[0];
                        console.log('Cross-check encontrou lead ganho/produzido por telefone:', crossCheckLead.id, crossCheckLead.name);
                      }
                    }
                    
                    if (crossCheckLead) {
                      leadId = crossCheckLead.id;
                      chosenLead = crossCheckLead;
                      resolveMethod = 'chatLid_history_crosscheck_ganho';
                      // Propagate chatLid to this lead
                      const existingLids = crossCheckLead.whatsapp_chat_lids || [];
                      if (!existingLids.includes(chatLid)) {
                        await supabase.from('leads').update({ whatsapp_chat_lids: [...existingLids, chatLid] }).eq('id', crossCheckLead.id);
                        console.log('ChatLid propagado para lead ganho/produzido:', crossCheckLead.id);
                      }
                    } else {
                      // Política jun/2026: NÃO cria recorrente. Anexa mensagem ao próprio lead entregue.
                      leadId = deliveredLead.id;
                      chosenLead = deliveredLead;
                      resolveMethod = 'chatLid_history_attach_to_delivered';
                      console.log('Anexando mensagem ao lead entregue existente:', leadId);
                    }
                  } else {
                    // Use any non-unclassified lead, avoid phantom leads
                    const validLead = candidateLeads.find((l: any) => 
                      !l.unclassified || (l.phones && l.phones.length > 0 && !l.phones[0]?.includes('@'))
                    );
                    if (validLead) {
                      leadId = validLead.id;
                      chosenLead = validLead;
                      resolveMethod = 'chatLid_history_any';
                      console.log('Lead encontrado por histórico chatLid:', leadId, 'name:', validLead.name);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // ===== STEP 5: If not resolved by chatLid, try phone (only for non-LID events) =====
    if (!leadId && normalizedPhone && localPhone) {
      console.log('=== RESOLUÇÃO POR TELEFONE ===');
      
      // Build flexible matching conditions
      // suffix8 helps match phones with/without the 9 digit after DDD
      const orConditions: string[] = [
        ...[normalizedPhone, localPhone].map(v => `phones.cs.{${v}}`),
        `phone.ilike.*${localPhone}*`,
      ];
      if (suffix11) {
        orConditions.push(`phone.ilike.*${suffix11}*`);
      }
      if (suffix10) {
        orConditions.push(`phone.ilike.*${suffix10}*`);
      }
      // suffix8 is the most flexible - matches even with different DDD or 9 variations
      if (suffix8) {
        orConditions.push(`phone.ilike.*${suffix8}*`);
      }
      orConditions.push(`phone.eq.${normalizedPhone}`);
      orConditions.push(`phone.eq.${localPhone}`);

      const { data: leads, error: leadError } = await supabase
        .from('leads')
        .select('id, phones, emails, email, phone, status, delivered_at, archived, unclassified, name, whatsapp_chat_lids')
        .or(orConditions.join(','));

      if (leadError) {
        console.error('Erro ao buscar lead por telefone:', leadError);
      }

      if (leads && leads.length > 0) {
        duplicateLeadsCount = Math.max(duplicateLeadsCount, leads.length);
        console.log(`Encontrados ${leads.length} leads com este número`);
        
        if (leads.length > 1) {
          console.log('⚠️ LEADS DUPLICADOS DETECTADOS:', leads.map(l => ({ id: l.id, name: l.name, status: l.status, archived: l.archived })));
        }
        
        // Priority: em_aberto/em_negociacao/produzido > ganho/produzido > entregue (create new) > others
        const activeLead = leads.find((l: any) => 
          l.archived === false && 
          l.unclassified === false && 
          (l.status === 'em_aberto' || l.status === 'em_negociacao' || l.status === 'produzido')
        );
        
        if (activeLead) {
          leadId = activeLead.id;
          chosenLead = activeLead;
          resolveMethod = 'phone_active';
          console.log('Lead ativo encontrado por telefone:', leadId, 'name:', activeLead.name);
          // Propagate chatLid if missing
          if (chatLid) {
            const existingLids = activeLead.whatsapp_chat_lids || [];
            if (!existingLids.includes(chatLid)) {
              await supabase.from('leads').update({ whatsapp_chat_lids: [...existingLids, chatLid] }).eq('id', activeLead.id);
              console.log('ChatLid propagado para lead ativo:', activeLead.id);
            }
          }
        } else {
          const wonLead = leads.find((l: any) => (l.status === 'ganho' || l.status === 'produzido') && l.archived === false);
          
          if (wonLead) {
            leadId = wonLead.id;
            chosenLead = wonLead;
            resolveMethod = 'phone_ganho';
            console.log('Lead ganho/produzido encontrado por telefone:', leadId, 'name:', wonLead.name);
            // Propagate chatLid if missing
            if (chatLid) {
              const existingLids = wonLead.whatsapp_chat_lids || [];
              if (!existingLids.includes(chatLid)) {
                await supabase.from('leads').update({ whatsapp_chat_lids: [...existingLids, chatLid] }).eq('id', wonLead.id);
                console.log('ChatLid propagado para lead ganho/produzido:', wonLead.id);
              }
            }
          } else {
            const deliveredLead = leads.find((l: any) => l.status === 'entregue');
            
            if (deliveredLead) {
              // CROSS-CHECK: before creating recurring, verify no ganho/produzido exists with same phone
              // (may not be in current results if phone format differs)
              let crossCheckLead: any = null;
              const delPhones = [deliveredLead.phone, ...(deliveredLead.phones || [])].map((p: any) => (p ?? '').toString().replace(/\D/g, '')).filter(Boolean);
              if (delPhones.length > 0) {
                const crossOr = delPhones.flatMap((p: string) => [`phone.ilike.%${p.slice(-8)}%`, `phones.cs.{${p}}`]);
                const { data: crossLeads } = await supabase
                  .from('leads')
                  .select('id, name, phone, phones, status, archived, whatsapp_chat_lids')
                  .or(crossOr.join(','))
                  .in('status', ['ganho', 'produzido', 'em_negociacao'])
                  .eq('archived', false);
                if (crossLeads && crossLeads.length > 0) {
                  crossCheckLead = crossLeads[0];
                  console.log('Cross-check encontrou lead ganho/produzido:', crossCheckLead.id, crossCheckLead.name);
                }
              }
              
              if (crossCheckLead) {
                leadId = crossCheckLead.id;
                chosenLead = crossCheckLead;
                resolveMethod = 'phone_crosscheck_ganho';
                // Propagate chatLid
                const existingLids = crossCheckLead.whatsapp_chat_lids || [];
                if (chatLid && !existingLids.includes(chatLid)) {
                  await supabase.from('leads').update({ whatsapp_chat_lids: [...existingLids, chatLid] }).eq('id', crossCheckLead.id);
                  console.log('ChatLid propagado para lead ganho/produzido:', crossCheckLead.id);
                }
              } else {
                // Política jun/2026: NÃO cria recorrente. Anexa mensagem ao próprio lead entregue.
                leadId = deliveredLead.id;
                chosenLead = deliveredLead;
                resolveMethod = 'phone_attach_to_delivered';
                console.log('Anexando mensagem ao lead entregue existente:', leadId);
              }
            } else {
              // Use best match from remaining leads
              const normalize = (v: any) => (v ?? '').toString().replace(/\D/g, '');
              type Scored = { lead: any; score: number };
              const scored: Scored[] = leads.map((l: any) => {
                const candidatePhones = [l.phone, ...(l.phones || [])]
                  .map(normalize)
                  .filter(Boolean);
                let score = 0;
                if (candidatePhones.includes(normalizedPhone!) || candidatePhones.includes(localPhone!)) {
                  score = 3;
                } else if (candidatePhones.some((p: string) => p.endsWith(localPhone!))) {
                  score = 2;
                } else if (normalize(l.phone || '').endsWith(localPhone!)) {
                  score = 1;
                }
                if (!l.archived && !l.unclassified) score += 10;
                else if (!l.archived) score += 5;
                return { lead: l, score };
              });

              const maxScore = Math.max(...scored.map(s => s.score));
              const top = scored.filter(s => s.score === maxScore).map(s => s.lead);

              chosenLead = top.find((l: any) => l.emails && l.emails.some((e: string) => !e.endsWith('@whatsapp.temp')))
                || top[0];
              leadId = chosenLead?.id || null;
              resolveMethod = 'phone_scored';
              console.log('Lead encontrado por score:', leadId, 'name:', chosenLead?.name);
            }
          }
        }
      }
      
      // Fallback: search through all leads with phones array
      if (!leadId) {
        console.log('Fallback: buscando em todos os leads com phones...');
        
        const { data: leadsWithPhones, error: leadsWithPhonesError } = await supabase
          .from('leads')
          .select('id, phones, phone, emails, email, status, delivered_at, archived, unclassified, name, whatsapp_chat_lids')
          .not('phones', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(1000);

        if (leadsWithPhonesError) {
          console.error('Erro no fallback de busca por phones:', leadsWithPhonesError);
        }

        if (leadsWithPhones && leadsWithPhones.length > 0) {
          const onlyDigitsFn = (v: any) => (v ?? '').toString().replace(/\D/g, '');
          
          // First pass: find active leads
          for (const l of leadsWithPhones) {
            const list = [l.phone, ...(l.phones || [])].map(onlyDigitsFn).filter(Boolean);
            const hasMatch = list.includes(normalizedPhone!) || 
                            list.includes(localPhone!) || 
                            list.some((p: string) => 
                              p.endsWith(localPhone!) || 
                              (suffix11 && p.endsWith(suffix11)) || 
                              (suffix10 && p.endsWith(suffix10))
                            );
            
            if (hasMatch && l.archived === false && l.unclassified === false && 
                (l.status === 'em_aberto' || l.status === 'em_negociacao' || l.status === 'produzido')) {
              leadId = l.id;
              chosenLead = l;
              resolveMethod = 'phone_fallback_active';
              console.log('Lead ativo encontrado no fallback:', leadId, 'name:', l.name);
              break;
            }
          }
          
          // Second pass: find ganho
          if (!leadId) {
            for (const l of leadsWithPhones) {
              const list = [l.phone, ...(l.phones || [])].map(onlyDigitsFn).filter(Boolean);
              const hasMatch = list.includes(normalizedPhone!) || 
                              list.includes(localPhone!) || 
                              list.some((p: string) => 
                                p.endsWith(localPhone!) || 
                                (suffix11 && p.endsWith(suffix11)) || 
                                (suffix10 && p.endsWith(suffix10))
                              );
              
              if (hasMatch && (l.status === 'ganho' || l.status === 'produzido') && l.archived === false) {
                leadId = l.id;
                chosenLead = l;
                resolveMethod = 'phone_fallback_ganho';
                console.log('Lead ganho encontrado no fallback:', leadId, 'name:', l.name);
                break;
              }
            }
          }
          
          // Third pass: entregue -> create new recurring
          if (!leadId) {
            for (const l of leadsWithPhones) {
              const list = [l.phone, ...(l.phones || [])].map(onlyDigitsFn).filter(Boolean);
              const hasMatch = list.includes(normalizedPhone!) || 
                              list.includes(localPhone!) || 
                              list.some((p: string) => 
                                p.endsWith(localPhone!) || 
                                (suffix11 && p.endsWith(suffix11)) || 
                                (suffix10 && p.endsWith(suffix10))
                              );
              
              if (hasMatch && l.status === 'entregue') {
                // CROSS-CHECK: before creating recurring, check for ganho/produzido with same phone
                const entPhones = [l.phone, ...(l.phones || [])].map((p: any) => (p ?? '').toString().replace(/\D/g, '')).filter(Boolean);
                let crossCheckLead: any = null;
                if (entPhones.length > 0) {
                  const crossOr = entPhones.flatMap((p: string) => [`phone.ilike.%${p.slice(-8)}%`, `phones.cs.{${p}}`]);
                  const { data: crossLeads } = await supabase
                    .from('leads')
                    .select('id, name, phone, phones, status, archived, whatsapp_chat_lids')
                    .or(crossOr.join(','))
                    .in('status', ['ganho', 'produzido', 'em_negociacao'])
                    .eq('archived', false);
                  if (crossLeads && crossLeads.length > 0) {
                    crossCheckLead = crossLeads[0];
                    console.log('Cross-check fallback encontrou lead ganho/produzido:', crossCheckLead.id, crossCheckLead.name);
                  }
                }
                
                if (crossCheckLead) {
                  leadId = crossCheckLead.id;
                  chosenLead = crossCheckLead;
                  resolveMethod = 'phone_fallback_crosscheck_ganho';
                  const existingLids = crossCheckLead.whatsapp_chat_lids || [];
                  if (chatLid && !existingLids.includes(chatLid)) {
                    await supabase.from('leads').update({ whatsapp_chat_lids: [...existingLids, chatLid] }).eq('id', crossCheckLead.id);
                    console.log('ChatLid propagado para lead ganho/produzido:', crossCheckLead.id);
                  }
                } else {
                  // Política jun/2026: NÃO cria recorrente. Anexa mensagem ao próprio lead entregue.
                  leadId = l.id;
                  chosenLead = l;
                  resolveMethod = 'phone_fallback_attach_to_delivered';
                  console.log('Anexando mensagem ao lead entregue existente (fallback):', leadId);
                }
                break;
              }
            }
          }
          
          // Fourth pass: any matching
          if (!leadId) {
            for (const l of leadsWithPhones) {
              const list = [l.phone, ...(l.phones || [])].map(onlyDigitsFn).filter(Boolean);
              const hasMatch = list.includes(normalizedPhone!) || 
                              list.includes(localPhone!) || 
                              list.some((p: string) => 
                                p.endsWith(localPhone!) || 
                                (suffix11 && p.endsWith(suffix11)) || 
                                (suffix10 && p.endsWith(suffix10))
                              );
              
              if (hasMatch) {
                chosenLead = l;
                leadId = l.id;
                resolveMethod = 'phone_fallback_any';
                console.log('Lead encontrado no fallback:', leadId, 'name:', l.name);
                break;
              }
            }
          }
        }
      }
    }

    // ===== STEP 6: If still not resolved and it's a LID event, do NOT create phantom lead =====
    if (!leadId && isLidEvent) {
      console.log('⚠️ Evento @lid sem lead associável - NÃO criando lead fantasma');
      console.log('chatLid:', chatLid);
      console.log('Esta mensagem não será associada a nenhum lead.');
      
      // Still save the message but without lead association for future reconciliation
      const { error: insertError } = await supabase
        .from('whatsapp_messages')
        .insert({
          lead_id: null,
          phone: rawPhone,
          message,
          direction,
          timestamp,
          is_audio: isAudio,
          raw_data: payload
        });

      if (insertError) {
        console.error('Erro ao inserir mensagem órfã:', insertError);
      } else {
        console.log('Mensagem órfã salva para reconciliação futura');
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Mensagem salva sem associação (evento @lid sem lead encontrado)', 
          leadId: null,
          chatLid,
          direction,
          resolveMethod: 'lid_orphan'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== STEP 7: Telefone novo =====
    // O contato escolar será criado/classificado pela Ana (school-triage) após
    // a mensagem inbound ser persistida. A mensagem continua vinculada ao telefone,
    // preservando a arquitetura phone-based e evitando cadastros duplicados aqui.
    if (!leadId && normalizedPhone) {
      console.log('Telefone novo — Ana fará a criação/classificação do contato escolar');
      resolveMethod = 'new_school_contact_pending_triage';
    }


    // ===== STEP 8: Persist chatLid + phone→chatLid map in lead if not already there =====
    if (chatLid && leadId) {
      try {
        const { data: leadRow, error: leadRowErr } = await supabase
          .from('leads')
          .select('whatsapp_chat_lids, whatsapp_phone_lid_map')
          .eq('id', leadId)
          .maybeSingle();
        if (leadRowErr) throw leadRowErr;

        const chatLidsToUse: string[] = leadRow?.whatsapp_chat_lids || chosenLead?.whatsapp_chat_lids || [];
        const existingPhoneLidMap = ((leadRow as any)?.whatsapp_phone_lid_map || {}) as Record<string, string>;
        const nextPhoneLidMap: Record<string, string> = { ...existingPhoneLidMap };

        // Para eventos com telefone real, grava explicitamente qual @lid pertence
        // àquele número. Isso evita que outbound via WhatsApp mobile caia na aba errada
        // quando o lead tem múltiplos telefones.
        if (normalizedPhone) nextPhoneLidMap[normalizedPhone] = chatLid;
        if (localPhone) nextPhoneLidMap[localPhone] = chatLid;

        const updatedChatLids = chatLidsToUse.includes(chatLid) ? chatLidsToUse : [...chatLidsToUse, chatLid];
        const mapChanged = JSON.stringify(nextPhoneLidMap) !== JSON.stringify(existingPhoneLidMap);

        if (!chatLidsToUse.includes(chatLid) || mapChanged) {
          const { error: updateChatLidError } = await supabase
            .from('leads')
            .update({
              whatsapp_chat_lids: updatedChatLids,
              whatsapp_phone_lid_map: nextPhoneLidMap,
            })
            .eq('id', leadId);

          if (updateChatLidError) {
            console.error('Erro ao atualizar whatsapp_chat_lids/whatsapp_phone_lid_map:', updateChatLidError);
          } else {
            console.log('chatLid/mapa de telefone atualizado no lead:', chatLid, nextPhoneLidMap);
          }
        }
        if (chosenLead) {
          chosenLead.whatsapp_chat_lids = updatedChatLids;
          chosenLead.whatsapp_phone_lid_map = nextPhoneLidMap;
        }
      } catch (e) {
        console.error('Erro ao persistir chatLid/mapa de telefone no lead:', e);
      }
    }

    // ===== STEP 8.5: Update lead name if still default =====
    if (contactName && leadId && chosenLead?.name === 'Lead WhatsApp') {
      const { error: nameError } = await supabase
        .from('leads')
        .update({ name: contactName })
        .eq('id', leadId);
      
      if (nameError) {
        console.error('Erro ao atualizar nome do lead:', nameError);
      } else {
        console.log('Nome do lead atualizado para:', contactName);
        if (chosenLead) chosenLead.name = contactName;
      }
    }

    // STEP 8.7 removido: comandos comerciais do CRM legado não pertencem ao CRM escolar.

    // ===== STEP 9: Insert the message =====
    // Skip saving if message is empty AND it's not an audio (nothing useful to store)
    if (!message && !isAudio) {
      console.log('⏭️ Mensagem vazia e sem áudio — não salvando no banco');
      return new Response(
        JSON.stringify({ success: true, message: 'Mensagem vazia ignorada', skipped: true, leadId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine the phone to store - prefer lead's real phone over chatLid/raw phone
    let phoneToStore = normalizedPhone || rawPhone;
    
    // If this is a LID event and the lead has a real phone, use that instead
    if (isLidEvent && leadId) {
      let mappedPhoneForLid: string | null = null;
      const phoneLidMap = ((chosenLead as any)?.whatsapp_phone_lid_map || {}) as Record<string, string>;
      for (const [phoneKey, lidValue] of Object.entries(phoneLidMap)) {
        if (lidValue === chatLid || lidValue?.replace('@lid', '') === chatLid?.replace('@lid', '')) {
          mappedPhoneForLid = phoneKey;
          break;
        }
      }

      const realPhone = mappedPhoneForLid || chosenLead?.phones?.[0] || chosenLead?.phone;
      // Make sure it's a real phone (not a LID or temp)
      if (realPhone && !realPhone.includes('@') && realPhone.length >= 10) {
        phoneToStore = realPhone;
        console.log('Usando telefone real do lead ao invés do chatLid:', phoneToStore, mappedPhoneForLid ? '(via mapa)' : '(fallback)');
      }
    }
    
    // Insere mensagem associada APENAS ao telefone. O cache do(s) lead(s) que
    // têm esse número é recalculado por trigger via recompute_lead_whatsapp_cache.
    const { data: insertedWaMsg, error: insertError } = await supabase
      .from('whatsapp_messages')
      .insert({
        lead_id: null,
        phone: phoneToStore,
        message,
        direction,
        timestamp,
        is_audio: isAudio,
        raw_data: payload
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Erro ao inserir mensagem:', insertError);
      return new Response(
        JSON.stringify({ error: 'Erro ao inserir mensagem' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const insertedWhatsappMessageId = insertedWaMsg?.id || null;

    console.log('=== RESULTADO ===');
    console.log('Mensagem WhatsApp salva com sucesso');
    console.log('leadId:', leadId);
    console.log('leadName:', chosenLead?.name);
    console.log('direction:', direction);
    console.log('resolveMethod:', resolveMethod);

    // ===== STEP 10: (removido) Nota de duplicidade =====
    // Clientes recorrentes têm legitimamente o mesmo telefone em vários leads.
    // Não gerar mais notas automáticas de "duplicidade detectada".


    // ===== STEP 11: Extract and add emails from message =====
    if (message && leadId && chosenLead) {
      const extractEmails = (text: string): string[] => {
        if (!text) return [];
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
        const matches = text.match(emailRegex) || [];
        return [...new Set(matches.map(e => e.toLowerCase()))];
      };

      const filterValidEmails = (emails: string[]): string[] => {
        return emails.filter(email => {
          const lowerEmail = email.toLowerCase();
          if (lowerEmail.endsWith('@whatsapp.temp')) return false;
          return true;
        });
      };

      const extractedEmails = extractEmails(message);
      const validEmails = filterValidEmails(extractedEmails);

      if (validEmails.length > 0) {
        console.log('E-mails extraídos da mensagem:', validEmails);

        const currentEmails: string[] = chosenLead.emails || [];

        const newEmails = validEmails.filter(email =>
          !currentEmails.some((existing: string) =>
            existing.toLowerCase() === email.toLowerCase()
          )
        );

        if (newEmails.length > 0) {
          const updatedEmails = [...currentEmails, ...newEmails];

          // Se o contato só tem placeholder @whatsapp.temp (ou nada) como e-mail
          // principal, promove o primeiro e-mail real extraído.
          const leadUpdate: Record<string, unknown> = { emails: updatedEmails };
          const currentPrimary = (chosenLead.email || '').toLowerCase();
          if (!currentPrimary || currentPrimary.endsWith('@whatsapp.temp')) {
            leadUpdate.email = newEmails[0];
            console.log('E-mail principal do lead promovido a partir do WhatsApp:', newEmails[0]);
          }

          const { error: updateError } = await supabase
            .from('leads')
            .update(leadUpdate)
            .eq('id', leadId);

          if (updateError) {
            console.error('Erro ao adicionar e-mails ao lead:', updateError);
          } else {
            console.log('E-mails adicionados ao lead:', newEmails);
          }
        }
      }
    }

    // ===== STEP 12: Process file attachments (documents, images, etc.) =====
    if (leadId) {
      // Z-API sends file URLs in various fields depending on type
      const documentUrl = payload.document?.documentUrl || payload.documentUrl || null;
      const documentFileName = payload.document?.fileName || payload.fileName || null;
      const documentMime = payload.document?.mimeType || payload.documentMimeType || null;
      
      const imageUrl = payload.image?.imageUrl || payload.imageUrl || null;
      const imageMime = payload.image?.mimetype || payload.imageMimeType || 'image/jpeg';
      
      const videoUrl = payload.video?.videoUrl || payload.videoUrl || null;
      const videoMime = payload.video?.mimetype || payload.videoMimeType || 'video/mp4';

      // Áudios NÃO são salvos como anexo — já são transcritos para texto.


      // Determine which file to process (priority: document > image > video > audio)
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      let mimeType: string | null = null;

      if (documentUrl) {
        fileUrl = documentUrl;
        fileName = documentFileName || 'documento';
        mimeType = documentMime || 'application/octet-stream';
        console.log('📎 Documento detectado:', fileName, mimeType);
      } else if (imageUrl) {
        fileUrl = imageUrl;
        fileName = `imagem-${Date.now()}.jpg`;
        mimeType = imageMime;
        console.log('🖼️ Imagem detectada');
      } else if (videoUrl) {
        fileUrl = videoUrl;
        fileName = `video-${Date.now()}.mp4`;
        mimeType = videoMime;
        console.log('🎥 Vídeo detectado');
      }


      if (fileUrl) {
        console.log('🚀 Disparando processamento de anexo...');
        fetch(`${supabaseUrl}/functions/v1/process-whatsapp-attachment`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            leadId,
            fileUrl,
            fileName,
            mimeType,
            leadName: chosenLead?.name || 'cliente',
            whatsappMessageId: insertedWhatsappMessageId,
          })
        }).catch(err => console.error('Erro ao disparar processamento de anexo:', err));
      }
    }

    // ===== STEP 12.5: Auto-generate description if needed =====
    if (leadId) {
      try {
        const { triggerAutoDescription } = await import("../_shared/auto-generate-description.ts");
        triggerAutoDescription(leadId);
      } catch (e) {
        console.error('Erro ao disparar auto-descrição:', e);
      }
    }

    // ===== STEP 13: Fetch profile picture if needed =====
    if (direction === 'inbound' && chosenLead && !chosenLead.profile_picture_url) {
      console.log('Tentando buscar foto de perfil para o lead:', leadId);
      try {
        fetch(`${supabaseUrl}/functions/v1/fetch-profile-picture`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            phone: phoneToStore, 
            leadId 
          })
        }).catch(err => console.error('Erro ao buscar foto de perfil:', err));
      } catch (e) {
        console.error('Erro ao iniciar busca de foto de perfil:', e);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Mensagem processada com sucesso', 
        leadId,
        leadName: chosenLead?.name,
        direction,
        resolveMethod,
        chatLid: chatLid || null,
        duplicateLeadsCount: duplicateLeadsCount > 1 ? duplicateLeadsCount : 0,
        isRecurring: chosenLead?.is_recurring || false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Erro no Z-API webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
