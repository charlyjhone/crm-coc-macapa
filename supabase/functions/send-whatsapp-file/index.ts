// Envio de arquivo pela secretaria (PDF, imagem, Word, Excel) ou do folder digital da escola.
// Mesmo modelo do send-whatsapp-audio: o navegador sobe o arquivo num bucket privado, esta
// função confere a sessão, gera um link temporário e pede à Z-API para enviar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FILE_BUCKET = "whatsapp-sent-files";
const FOLDER_BUCKET = "school-materials";
const FOLDER_PATH = "folder-digital.pdf";
const FOLDER_NAME = "Folder digital da escola.pdf";

// mime → extensão aceita pela Z-API em send-document/{extensão}
const DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function normalizePhone(value: string) {
  const digits = value.replace(/@.*$/, "").replace(/\D/g, "");
  if (!digits) return "";
  if (!digits.startsWith("55")) {
    const international = digits.startsWith("351") || digits.startsWith("1") || digits.startsWith("44") ||
      digits.startsWith("33") || digits.startsWith("34") || digits.startsWith("39") || digits.startsWith("49") || digits.length > 11;
    if (international) return digits;
  }
  let local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 10 && /^[6-9]/.test(local.slice(2, 3))) local = `${local.slice(0, 2)}9${local.slice(2)}`;
  return local.length === 10 || local.length === 11 ? `55${local}` : digits;
}

const cleanFileName = (value: string) =>
  value.replace(/[\r\n\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "arquivo";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") || "")?.[1];
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!token || !supabaseUrl || !serviceKey) return json({ error: "Sessão inválida." }, 401);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return json({ error: "Sessão inválida." }, 401);
    const { data: roles, error: rolesError } = await admin.from("user_roles").select("role")
      .eq("user_id", user.id).in("role", ["admin", "user"]);
    if (rolesError || !roles?.length) return json({ error: "Acesso não autorizado." }, 403);

    // Mesmo nome e assinatura usados no envio de texto pela secretaria.
    const rawName = user.user_metadata?.full_name;
    const operatorName = typeof rawName === "string"
      ? rawName.replace(/[\r\n*_~`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60)
      : "";
    if (!operatorName) return json({ error: "Cadastre seu nome em Meu perfil antes de enviar arquivos." }, 422);

    const body = await req.json().catch(() => ({}));
    const leadId = typeof body.leadId === "string" && /^[0-9a-f-]{36}$/i.test(body.leadId) ? body.leadId : "";
    const isFolder = body.material === "school_folder";
    const typedCaption = typeof body.caption === "string" ? body.caption.trim().slice(0, 900) : "";
    if (!leadId) return json({ error: "Contato inválido." }, 400);

    const { data: lead, error: leadError } = await admin.from("leads").select("id, phone, archived").eq("id", leadId).maybeSingle();
    if (leadError || !lead?.phone) return json({ error: "Contato sem WhatsApp cadastrado." }, 422);
    if (lead.archived) return json({ error: "Este contato está arquivado." }, 422);
    const phone = normalizePhone(lead.phone);
    if (!phone) return json({ error: "Telefone inválido." }, 422);

    let bucket: string, storagePath: string, mimeType: string, fileName: string;
    if (isFolder) {
      bucket = FOLDER_BUCKET; storagePath = FOLDER_PATH; mimeType = "application/pdf"; fileName = FOLDER_NAME;
    } else {
      bucket = FILE_BUCKET;
      storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
      mimeType = typeof body.mimeType === "string" ? body.mimeType.split(";")[0].trim().toLowerCase() : "";
      fileName = cleanFileName(typeof body.fileName === "string" ? body.fileName : "");
      if (!storagePath.startsWith(`${user.id}/${leadId}/`) || storagePath.includes("..") ||
          !(mimeType in DOCUMENT_TYPES || IMAGE_TYPES.has(mimeType))) {
        return json({ error: "Arquivo inválido ou tipo não permitido." }, 400);
      }
    }

    const { data: signed, error: signError } = await admin.storage.from(bucket).createSignedUrl(storagePath, 900);
    if (signError || !signed?.signedUrl) {
      return json({ error: isFolder ? "O folder digital não está disponível. Envie o PDF em Configurações." : "Não foi possível preparar o arquivo." }, 422);
    }

    const instanceId = Deno.env.get("ZAPI_INSTANCE_ID");
    const zapiToken = Deno.env.get("ZAPI_TOKEN");
    const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");
    if (!instanceId || !zapiToken || !clientToken) return json({ error: "Credenciais Z-API não configuradas." }, 500);

    const defaultCaption = isFolder ? "Aqui está o folder digital da escola." : "";
    const captionText = typedCaption || defaultCaption;
    const caption = `*${operatorName} — Secretaria COC*` + (captionText ? `\n${captionText}` : "");
    const isImage = IMAGE_TYPES.has(mimeType);
    const endpoint = isImage ? "send-image" : `send-document/${DOCUMENT_TYPES[mimeType]}`;
    const payload = isImage
      ? { phone, image: signed.signedUrl, caption }
      : { phone, document: signed.signedUrl, fileName, caption };

    const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${zapiToken}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body: JSON.stringify(payload),
    });
    const zapiData = await response.json().catch(() => ({}));
    const confirmed = response.ok && !!(zapiData?.messageId || zapiData?.zaapId || zapiData?.id);
    if (!confirmed) {
      console.error("[send-whatsapp-file] provider did not confirm", response.status);
      return json({ error: "O WhatsApp não confirmou o envio do arquivo. Tente novamente." }, 502);
    }

    await admin.rpc("set_activity_context", { p_source: "edge_function:send-whatsapp-file", p_actor: operatorName });
    const media = { fileName, mimeType, caption: captionText || null, storagePath, storageBucket: bucket };
    const { error: insertError } = await admin.from("whatsapp_messages").insert({
      lead_id: null, phone, message: caption, direction: "outbound", timestamp: new Date().toISOString(),
      raw_data: {
        ...zapiData,
        ...(isImage ? { image: media } : { document: media }),
        operator_id: user.id, operator_name: operatorName, sender_type: "human", source: "manual",
        ...(isFolder ? { material: "school_folder" } : {}),
      },
    });
    if (insertError) {
      console.error("[send-whatsapp-file] message log insert failed", insertError.message);
      return json({ success: true, logged: false, warning: "Arquivo enviado, mas o histórico ainda não foi atualizado." });
    }
    return json({ success: true, messageId: zapiData.messageId || zapiData.zaapId || zapiData.id });
  } catch (error) {
    console.error("[send-whatsapp-file] failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Não foi possível enviar o arquivo." }, 500);
  }
});
