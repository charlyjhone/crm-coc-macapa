// Agente de triagem da escola.
//
// Recebe TODA mensagem inbound (WhatsApp via trigger, e-mail via trigger),
// classifica o assunto, responde sozinho os assuntos simples (currículo,
// horário, localização) e também matrícula até o nível de valores.
// Quando a conversa aprofunda ou a família pede atendimento humano,
// marca o contato como "aguardando secretaria" e avisa a família.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_INFO = `Horário de funcionamento: 7h30 às 18h, de segunda a sexta.
Endereço: R. Adílson José Pinto Pereira, 1089 - Infraero, Macapá - AP, CEP 68908-530.
Currículos devem ser enviados para o e-mail rhcocmacapanorte@gmail.com.`;

const ASSUNTOS = ["matricula", "curriculo", "horario", "localizacao", "outros"] as const;
type Assunto = typeof ASSUNTOS[number];

// Assuntos que o agente resolve por completo sozinho.
const AUTO_RESOLVE: Assunto[] = ["curriculo", "horario", "localizacao"];

interface Triagem {
  assunto: Assunto;
  interesse: "alto" | "medio" | "baixo" | "indefinido";
  precisa_humano: boolean;
  motivo_humano: string | null;
  resumo: string;
  resposta: string;
  origem: string | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const payload = await req.json().catch(() => ({}));
    const channel: "whatsapp" | "email" = payload.channel === "email" ? "email" : "whatsapp";
    const text: string = (payload.text || "").toString().trim();
    const phone: string | null = payload.phone || null;
    let leadId: string | null = payload.lead_id || null;

    if (!text) return json({ skipped: "empty_text" });

    // ---- Configurações da escola ----
    const { data: settingsRows } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["escola_agente_ativo", "escola_info", "escola_valores", "escola_nome"]);
    const settings: Record<string, string> = {};
    (settingsRows || []).forEach((r: any) => { if (r.value) settings[r.key] = r.value; });

    if ((settings.escola_agente_ativo || "true") !== "true") {
      return json({ skipped: "agent_disabled" });
    }

    const escolaNome = settings.escola_nome || "a escola";
    const escolaInfo = settings.escola_info || DEFAULT_INFO;
    const escolaValores = settings.escola_valores || "";

    // ---- Resolver ou criar o contato ----
    if (!leadId && phone) {
      const { data: ids } = await supabase.rpc("resolve_lead_ids_by_phone", { p_phone: phone });
      const first = Array.isArray(ids) ? ids[0] : null;
      leadId = typeof first === "string" ? first : (first?.resolve_lead_ids_by_phone ?? null);
    }

    if (!leadId) {
      const { data: created, error: createErr } = await supabase
        .from("leads")
        .insert({
          name: phone ? `Contato ${phone}` : "Contato por e-mail",
          phone,
          source: channel,
          status: "em_aberto",
          unclassified: false,
          triage_status: "novo",
        })
        .select("id")
        .single();
      if (createErr) {
        console.error("Falha ao criar contato:", createErr);
        return json({ error: "create_lead_failed" }, 500);
      }
      leadId = created.id;
    }

    const { data: lead } = await supabase
      .from("leads")
      .select("id, name, email, phone, triage_status, assunto, origem, handoff_at")
      .eq("id", leadId!)
      .maybeSingle();

    // Já está com a secretaria: não responder mais, só registrar pendência.
    if (lead?.triage_status === "aguardando_secretaria") {
      return json({ skipped: "waiting_human", lead_id: leadId });
    }

    // ---- Histórico curto para dar contexto ao agente ----
    let historico = "";
    if (phone) {
      const { data: msgs } = await supabase
        .from("whatsapp_messages")
        .select("direction, message, timestamp, created_at")
        .eq("phone", phone)
        .order("created_at", { ascending: false })
        .limit(12);
      historico = (msgs || [])
        .reverse()
        .map((m: any) => `${m.direction === "inbound" ? "Família" : "Escola"}: ${(m.message || "").slice(0, 400)}`)
        .join("\n");
    } else if (leadId) {
      const { data: msgs } = await supabase
        .from("email_messages")
        .select("direction, subject, message, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(8);
      historico = (msgs || [])
        .reverse()
        .map((m: any) => `${m.direction === "inbound" ? "Família" : "Escola"}: ${(m.message || m.subject || "").slice(0, 400)}`)
        .join("\n");
    }

    // ---- Chamada de IA ----
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY ausente" }, 500);

    const systemPrompt = `Você é Ana, assistente virtual oficial de ${escolaNome}. Responda em português do Brasil, de forma acolhedora, curta, cordial e objetiva (no máximo 5 linhas), pelo canal ${channel === "whatsapp" ? "WhatsApp" : "e-mail"}.
Quando for natural na primeira interação, apresente-se como Ana, assistente virtual do COC Macapá Norte. Não repita sua apresentação a cada mensagem.

INFORMAÇÕES OFICIAIS DA ESCOLA:
${escolaInfo}

${escolaValores ? `VALORES DE MATRÍCULA E MENSALIDADE:\n${escolaValores}` : "VALORES: ainda não cadastrados. Se perguntarem valores, diga que a secretaria vai passar os valores e marque precisa_humano = true."}

REGRAS:
- Assuntos "curriculo", "horario" e "localizacao": responda com a informação oficial e encerre com cordialidade. precisa_humano = false.
- Assunto "matricula": você pode explicar o processo e informar os valores acima. Se a família pedir falar com uma pessoa, negociar, pedir desconto, tratar de caso específico da criança, documentos, vaga em turma específica, ou fizer qualquer pergunta que não esteja nas informações oficiais → precisa_humano = true.
- Nunca invente informação que não esteja acima. Se não souber → precisa_humano = true.
- Se precisa_humano = true, a "resposta" deve avisar de forma gentil que a secretaria vai continuar o atendimento em breve.
- Nunca prometa prazos que não estejam nas informações oficiais.
- Quando a dúvida estiver resolvida e a família demonstrar que encerrou a conversa (por exemplo: "obrigado", "era só isso", "tá bom", "perfeito"), pergunte antes de finalizar: "Antes de encerrarmos, você poderia me dizer como conheceu o COC Macapá Norte? Foi pelas redes sociais, indicação de amigos ou familiares, Google, site, evento ou outro meio?"
- Se a conversa precisar ser encaminhada para a secretaria e a origem ainda não estiver registrada, faça essa mesma pergunta de forma breve antes de encaminhar.
- Se a família informar a origem, registre-a no campo origem usando uma descrição curta e não repita a pergunta na mesma conversa.
- Se a origem já estiver registrada, não pergunte novamente.

Responda SOMENTE com JSON válido:
{"assunto":"matricula|curriculo|horario|localizacao|outros","interesse":"alto|medio|baixo|indefinido","precisa_humano":true|false,"motivo_humano":"texto curto ou null","resumo":"1 frase sobre o que a pessoa quer","resposta":"mensagem a enviar"}`;

    const userPrompt = `Origem já registrada para este contato: ${lead?.origem || "(não informada)"}\n\nHistórico recente da conversa:\n${historico || "(sem histórico)"}\n\nÚltima mensagem recebida:\n${text}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      console.error("Erro no gateway de IA:", aiRes.status, detail);
      await supabase.from("leads").update({ triage_status: "aguardando_secretaria", handoff_at: new Date().toISOString(), handoff_reason: "Falha do agente de IA" }).eq("id", leadId!);
      return json({ error: "ai_gateway_error", status: aiRes.status, detail }, aiRes.status === 429 || aiRes.status >= 500 ? 503 : 500);
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "";
    let triagem: Triagem;
    try {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      triagem = JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1));
    } catch (e) {
      console.error("Resposta da IA não é JSON:", raw);
      await supabase.from("leads").update({ triage_status: "aguardando_secretaria", handoff_at: new Date().toISOString(), handoff_reason: "Resposta do agente ilegível" }).eq("id", leadId!);
      return json({ error: "ai_parse_error" }, 500);
    }

    const assunto: Assunto = ASSUNTOS.includes(triagem.assunto) ? triagem.assunto : "outros";
    const precisaHumano = !!triagem.precisa_humano || assunto === "outros";
    const resposta = (triagem.resposta || "").trim();

    // ---- Enviar resposta ----
    let enviado = false;
    if (resposta) {
      try {
        if (channel === "whatsapp" && phone) {
          const r = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ phone, message: resposta, leadId }),
          });
          enviado = r.ok;
          if (!r.ok) console.error("Falha ao enviar WhatsApp:", await r.text());
        } else if (channel === "email" && lead?.email) {
          const r = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({
              leadId,
              to: lead.email,
              subject: `Re: contato com ${escolaNome}`,
              body: resposta,
            }),
          });
          enviado = r.ok;
          if (!r.ok) console.error("Falha ao enviar e-mail:", await r.text());
        }
      } catch (e) {
        console.error("Erro no envio da resposta:", e);
      }
    }

    // ---- Atualizar situação do contato ----
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      assunto,
      interesse: triagem.interesse || "indefinido",
      triage_summary: triagem.resumo || null,
    };
    if (triagem.origem && !lead?.origem) update.origem = triagem.origem.trim().slice(0, 200);

    // Uma resposta só pode ser considerada atendida se realmente foi entregue.
    // Falha de envio sempre vira handoff para evitar atendimento "fantasma" no CRM.
    const falhaEnvio = !!resposta && !enviado;

    if (falhaEnvio) {
      update.triage_status = "aguardando_secretaria";
      update.handoff_at = now;
      update.handoff_reason = "Falha no envio automático da resposta";
    } else if (precisaHumano) {
      update.triage_status = "aguardando_secretaria";
      update.handoff_at = now;
      update.handoff_reason = triagem.motivo_humano || "Pergunta fora das informações padrão";
    } else if (AUTO_RESOLVE.includes(assunto)) {
      update.triage_status = "resolvido";
      update.resolved_at = now;
    } else {
      update.triage_status = "respondido_agente";
    }
    if (enviado) update.agent_replied_at = now;

    await supabase.from("leads").update(update).eq("id", leadId!);

    await supabase.from("activity_log").insert({
      lead_id: leadId,
      activity_type: "agent_triage",
      description: falhaEnvio
        ? `Ana não conseguiu enviar a resposta (${assunto}): ${update.handoff_reason}`
        : precisaHumano
          ? `Ana encaminhou para a secretaria (${assunto}): ${update.handoff_reason}`
          : `Ana respondeu sozinha (${assunto})`,
      source: "school-triage",
      actor: "agente",
      metadata: { assunto, canal: channel, enviado, interesse: triagem.interesse, resumo: triagem.resumo },
    });

    return json({ success: true, lead_id: leadId, assunto, precisa_humano: precisaHumano, enviado, triage_status: update.triage_status });
  } catch (error: any) {
    console.error("Erro no school-triage:", error);
    return json({ error: error?.message || "unknown" }, 500);
  }
});
