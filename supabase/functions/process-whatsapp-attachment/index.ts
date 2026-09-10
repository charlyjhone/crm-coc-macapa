import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const { leadId, fileUrl, fileName, mimeType, leadName, whatsappMessageId } = await req.json();

    if (!leadId || !fileUrl) {
      return new Response(
        JSON.stringify({ error: 'leadId and fileUrl are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📎 Processando anexo WhatsApp para lead ${leadId}: ${fileName || 'sem nome'}`);
    console.log(`   URL: ${fileUrl}`);
    console.log(`   MIME: ${mimeType || 'desconhecido'}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ===== STEP 1: Download the file =====
    console.log('⬇️ Baixando arquivo...');
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      console.error('Erro ao baixar arquivo:', fileResponse.status, fileResponse.statusText);
      return new Response(
        JSON.stringify({ error: 'Failed to download file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fileBuffer = await fileResponse.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);
    const fileSizeBytes = fileBytes.length;
    console.log(`   Tamanho: ${(fileSizeBytes / 1024).toFixed(1)} KB`);

    // ===== STEP 2: Determine file name and extension =====
    const detectedMime = mimeType || fileResponse.headers.get('content-type') || 'application/octet-stream';
    const ext = getExtensionFromMime(detectedMime, fileName);
    const sanitizedName = sanitizeFileName(fileName || `whatsapp-attachment-${Date.now()}.${ext}`);
    const storagePath = `${leadId}/${Date.now()}-${sanitizedName}`;

    // ===== STEP 3: Upload to storage =====
    console.log('⬆️ Fazendo upload para storage:', storagePath);
    const { error: uploadError } = await supabase.storage
      .from('whatsapp-attachments')
      .upload(storagePath, fileBytes, {
        contentType: detectedMime,
        upsert: false,
      });

    if (uploadError) {
      console.error('Erro no upload:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Upload failed', details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== STEP 4: Save record in email_attachments table (reusing for all attachments) =====
    const { error: dbError } = await supabase
      .from('email_attachments')
      .insert({
        lead_id: leadId,
        filename: fileName || sanitizedName,
        storage_path: `whatsapp-attachments/${storagePath}`,
        content_type: detectedMime,
        size_bytes: fileSizeBytes,
        whatsapp_message_id: whatsappMessageId || null,
      });

    if (dbError) {
      console.error('Erro ao salvar registro do anexo:', dbError);
    } else {
      console.log('✅ Registro do anexo salvo no banco');
    }

    // ===== STEP 5: If PDF, interpret with AI and save as note =====
    const isPdf = detectedMime === 'application/pdf' || 
                  (fileName && fileName.toLowerCase().endsWith('.pdf'));

    if (isPdf) {
      console.log('📄 Arquivo PDF detectado — enviando para interpretação com IA...');
      
      try {
        const base64Content = arrayBufferToBase64(fileBuffer);
        
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        if (!LOVABLE_API_KEY) {
          console.error('LOVABLE_API_KEY não configurada, pulando interpretação do PDF');
        } else {
          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                {
                  role: 'system',
                  content: `Você é um assistente que interpreta documentos PDF recebidos via WhatsApp. 
Extraia todas as informações relevantes do documento de forma estruturada e clara.
Inclua: título/tipo do documento, datas, valores, nomes, detalhes de eventos, endereços, requisitos e quaisquer outras informações importantes.
Responda em português do Brasil. Seja detalhado mas organizado.`
                },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `Interprete o conteúdo deste arquivo PDF chamado "${fileName || 'documento.pdf'}" recebido via WhatsApp do lead "${leadName || 'cliente'}". Extraia todas as informações relevantes.`
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:application/pdf;base64,${base64Content}`
                      }
                    }
                  ]
                }
              ],
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const interpretation = aiData.choices?.[0]?.message?.content;
            
            if (interpretation) {
              console.log('🤖 Interpretação do PDF recebida, salvando como nota...');
              
              const noteContent = `[Documento WhatsApp] Interpretação do arquivo "${fileName || 'documento.pdf'}":\n\n${interpretation}`;
              
              const { error: noteError } = await supabase
                .from('lead_notes')
                .insert({
                  lead_id: leadId,
                  note: noteContent,
                });

              if (noteError) {
                console.error('Erro ao salvar nota de interpretação:', noteError);
              } else {
                console.log('✅ Nota de interpretação do PDF salva com sucesso');
              }
            }
          } else {
            const errText = await aiResponse.text();
            console.error('Erro na resposta da IA:', aiResponse.status, errText);
          }
        }
      } catch (aiError) {
        console.error('Erro ao interpretar PDF com IA:', aiError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        storagePath, 
        fileName: sanitizedName,
        isPdf,
        fileSizeBytes,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Erro ao processar anexo WhatsApp:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100);
}

function getExtensionFromMime(mime: string, fileName?: string): string {
  if (fileName) {
    const ext = fileName.split('.').pop();
    if (ext) return ext;
  }
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/msword': 'doc',
    'text/plain': 'txt',
  };
  return map[mime] || 'bin';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
