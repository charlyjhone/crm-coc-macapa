import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractExternalUrl } from "../_shared/extract-external-url.ts";
import {
  buildTiffanyPayload,
  externalErrorMessage,
  getTiffanyMissingFields,
} from "../_shared/tiffany-export.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { context = "", leadName, lead } = await req.json();
    const exportData = buildTiffanyPayload(lead, context, leadName);
    console.log(`Gerando export determinístico para lead: ${exportData.nome_empresa || "sem nome"}`);

    const missingFields = getTiffanyMissingFields(exportData);
    if (missingFields.length > 0) {
      const error = `Não foi possível exportar para o financeiro. Campos faltando no lead: ${missingFields.join(", ")}. Preencha esses dados no lead antes de exportar.`;
      console.error("Validação falhou:", error);
      return jsonResponse({ success: false, error });
    }

    const webhookUrl = "https://mnxukwxeulnxunrexhra.supabase.co/functions/v1/client-intake";
    let webhookPayload: unknown = null;

    try {
      const webhookResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exportData),
      });

      const rawBody = await webhookResponse.text();
      try {
        webhookPayload = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        webhookPayload = { raw: rawBody };
      }

      if (!webhookResponse.ok) {
        const detail = externalErrorMessage(webhookPayload, webhookResponse.status);
        console.error("Webhook error:", webhookResponse.status, detail);
        return jsonResponse({
          success: false,
          error: `Não foi possível enviar para a Tiffany: ${detail}`,
          export: exportData,
        });
      }
    } catch (error) {
      console.error("Erro de conexão com o webhook:", error);
      return jsonResponse({
        success: false,
        error: "Não foi possível conectar ao sistema financeiro da Tiffany. Tente novamente em alguns minutos.",
        export: exportData,
      });
    }

    const url = extractExternalUrl(webhookPayload) || exportData.invoice_url || null;
    console.log("Webhook enviado com sucesso. URL extraída:", url);
    return jsonResponse({ success: true, export: exportData, url, response: webhookPayload });
  } catch (error) {
    console.error("Erro ao gerar export:", error);
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return jsonResponse({ success: false, error: `Não foi possível preparar a exportação: ${message}` });
  }
});
