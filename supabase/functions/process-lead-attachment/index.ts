import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }

  return btoa(binary);
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const leadId = formData.get("leadId") as string | null;

    if (!file || !leadId) {
      throw new Error("file and leadId are required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Processing attachment for lead ${leadId}: ${file.name} (${file.type}, ${file.size} bytes)`);

    const fileBuffer = await file.arrayBuffer();
    const contentHash = await sha256Hex(fileBuffer);

    // Evita duplicatas: primeiro por hash (mais confiável)
    const { data: existingByHash, error: existingByHashError } = await supabase
      .from("email_attachments")
      .select("id, storage_path")
      .eq("lead_id", leadId)
      .eq("content_hash", contentHash)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (existingByHashError) {
      console.error("Duplicate hash lookup error:", existingByHashError);
    }

    if (existingByHash) {
      return new Response(
        JSON.stringify({
          success: true,
          duplicate: true,
          filename: file.name,
          extractedTextLength: 0,
          storagePath: existingByHash.storage_path,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fallback para anexos antigos sem hash: nome + tamanho + tipo
    const { data: existingByMeta, error: existingByMetaError } = await supabase
      .from("email_attachments")
      .select("id, storage_path, content_hash")
      .eq("lead_id", leadId)
      .eq("filename", file.name)
      .eq("size_bytes", file.size)
      .eq("content_type", file.type)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingByMetaError) {
      console.error("Duplicate metadata lookup error:", existingByMetaError);
    }

    if (existingByMeta) {
      if (!existingByMeta.content_hash) {
        await supabase
          .from("email_attachments")
          .update({ content_hash: contentHash })
          .eq("id", existingByMeta.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          duplicate: true,
          filename: file.name,
          extractedTextLength: 0,
          storagePath: existingByMeta.storage_path,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1. Upload file to storage
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${leadId}/${timestamp}_${sanitizedName}`;

    const { error: uploadError } = await supabase.storage
      .from("email-attachments")
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Erro ao fazer upload: ${uploadError.message}`);
    }

    // 2. Save attachment record in DB
    const { error: insertError } = await supabase
      .from("email_attachments")
      .insert({
        lead_id: leadId,
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
        storage_path: storagePath,
        content_hash: contentHash,
      });

    if (insertError) {
      console.error("Insert error:", insertError);
    }

    // 3. Extract text from the file using AI
    let extractedText = "";
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    const isText =
      file.type.startsWith("text/") ||
      file.type === "application/json" ||
      file.type === "application/xml";

    if (isText) {
      // Plain text files - read directly
      extractedText = new TextDecoder().decode(fileBuffer);
    } else if (isPdf || isImage) {
      // Use AI to extract text from PDF/image
      // Convert to base64 in chunks to avoid stack overflow on large files
      const base64 = arrayBufferToBase64(fileBuffer);
      const mimeType = file.type;
      const dataUrl = `data:${mimeType};base64,${base64}`;

      const systemPrompt = isPdf
        ? `Você é um assistente que extrai TODO o texto de documentos PDF. Extraia absolutamente todo o conteúdo textual, mantendo a estrutura e formatação. Se for um contrato, extraia todas as cláusulas, valores, datas, partes envolvidas e condições. Retorne APENAS o texto extraído.`
        : `Você é um assistente que extrai TODO o texto de imagens. Extraia absolutamente todo o conteúdo textual visível. Retorne APENAS o texto extraído.`;

      const aiResponse = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Extraia todo o texto deste ${isPdf ? "documento PDF" : "imagem"}. Se for um contrato ou documento formal, extraia todas as cláusulas, valores, datas e condições.`,
                  },
                  {
                    type: "image_url",
                    image_url: { url: dataUrl },
                  },
                ],
              },
            ],
          }),
        }
      );

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error("AI extraction error:", aiResponse.status, errText);
        throw new Error("Erro ao extrair texto do arquivo com IA");
      }

      const aiData = await aiResponse.json();
      extractedText =
        aiData.choices?.[0]?.message?.content || "";
    } else {
      // Unsupported file type for text extraction
      console.log(`Tipo de arquivo não suportado para extração: ${file.type}`);
      extractedText = `[Arquivo anexado: ${file.name} (${file.type})]`;
    }

    console.log(`Extracted ${extractedText.length} chars from ${file.name}`);

    // 4. Save extracted text as a lead note
    if (extractedText && extractedText.length > 10) {
      const notePrefix = isPdf
        ? "[Documento Anexado]"
        : isImage
        ? "[Imagem Anexada]"
        : "[Arquivo Anexado]";

      const { error: noteError } = await supabase
        .from("lead_notes")
        .insert({
          lead_id: leadId,
          note: `${notePrefix} ${file.name}\n\n${extractedText}`,
        });

      if (noteError) {
        console.error("Note insert error:", noteError);
      }
    }

    // 5. Trigger description regeneration (fire-and-forget)
    // Reset description_updated_at so auto-generate picks it up fresh
    await supabase
      .from("leads")
      .update({ description_updated_at: null, ai_diagnosis_updated_at: null })
      .eq("id", leadId);

    // Call generate-lead-description
    fetch(`${supabaseUrl}/functions/v1/generate-lead-description`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ leadId }),
    })
      .then(() => {
        // After description, trigger diagnosis
        fetch(`${supabaseUrl}/functions/v1/diagnose-leads`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ leadId }),
        }).catch((err) =>
          console.error("Error triggering diagnosis:", err)
        );
      })
      .catch((err) =>
        console.error("Error triggering description:", err)
      );

    return new Response(
      JSON.stringify({
        success: true,
        filename: file.name,
        extractedTextLength: extractedText.length,
        storagePath,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing attachment:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Erro desconhecido",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
