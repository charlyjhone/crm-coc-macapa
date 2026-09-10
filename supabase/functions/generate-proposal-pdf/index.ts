import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      slide30ImageUrl, 
      slide31ImageUrl, 
      slide32ImageUrl, 
      clientName, 
      month, 
      year 
    } = await req.json();

    console.log("Generating proposal PDF for:", clientName, month, year);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Download the template PDF from storage
    console.log("Downloading template PDF...");
    const { data: templateData, error: downloadError } = await supabase
      .storage
      .from('proposal-templates')
      .download('template.pdf');

    if (downloadError || !templateData) {
      console.error("Error downloading template:", downloadError);
      throw new Error(`Failed to download template: ${downloadError?.message}`);
    }

    // Load the PDF document
    console.log("Loading PDF document...");
    const pdfBytes = await templateData.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Get the page count (should be 33)
    const pageCount = pdfDoc.getPageCount();
    console.log(`Template has ${pageCount} pages`);

    // Remove pages 30, 31, 32 (indices 29, 30, 31)
    // We need to remove from highest index to lowest to avoid shifting issues
    console.log("Removing original slides 30, 31, 32...");
    pdfDoc.removePage(31); // Original page 32 (index 31)
    pdfDoc.removePage(30); // Original page 31 (index 30)
    pdfDoc.removePage(29); // Original page 30 (index 29)

    // Helper function to fetch and embed image
    const embedImageFromUrl = async (imageUrl: string) => {
      console.log("Processing image...");
      let imageBytes: ArrayBuffer;
      let isPng = false;

      if (imageUrl.startsWith('data:')) {
        const matches = imageUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
        if (!matches) {
          throw new Error('Invalid data URL format');
        }
        isPng = matches[1] === 'png';
        const base64Data = matches[2];
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        imageBytes = bytes.buffer;
      } else {
        const response = await fetch(imageUrl);
        imageBytes = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || '';
        isPng = contentType.includes('png');
      }

      try {
        if (isPng) {
          return await pdfDoc.embedPng(imageBytes);
        } else {
          return await pdfDoc.embedJpg(imageBytes);
        }
      } catch (e) {
        console.log("First format failed, trying alternative...");
        try {
          if (isPng) {
            return await pdfDoc.embedJpg(imageBytes);
          } else {
            return await pdfDoc.embedPng(imageBytes);
          }
        } catch (e2) {
          throw new Error(`Failed to embed image: ${e2}`);
        }
      }
    };

    // Create new pages for each slide (16:9 aspect ratio - 1920x1080 scaled to PDF dimensions)
    const slideWidth = 960; // points (landscape)
    const slideHeight = 540; // points (16:9 ratio)

    // Fetch and embed all images
    console.log("Embedding slide images...");
    const [image30, image31, image32] = await Promise.all([
      embedImageFromUrl(slide30ImageUrl),
      embedImageFromUrl(slide31ImageUrl),
      embedImageFromUrl(slide32ImageUrl),
    ]);

    // Insert new pages at position 29 (will become pages 30, 31, 32)
    // Insert in reverse order so they end up in correct order
    
    // Create page for slide 32 (pricing)
    console.log("Creating slide 32 page...");
    const page32 = pdfDoc.insertPage(29, [slideWidth, slideHeight]);
    page32.drawImage(image32, {
      x: 0,
      y: 0,
      width: slideWidth,
      height: slideHeight,
    });

    // Create page for slide 31 (agenda)
    console.log("Creating slide 31 page...");
    const page31 = pdfDoc.insertPage(29, [slideWidth, slideHeight]);
    page31.drawImage(image31, {
      x: 0,
      y: 0,
      width: slideWidth,
      height: slideHeight,
    });

    // Create page for slide 30 (cover)
    console.log("Creating slide 30 page...");
    const page30 = pdfDoc.insertPage(29, [slideWidth, slideHeight]);
    page30.drawImage(image30, {
      x: 0,
      y: 0,
      width: slideWidth,
      height: slideHeight,
    });

    // Save the modified PDF
    console.log("Saving PDF...");
    const modifiedPdfBytes = await pdfDoc.save();

    // Generate filename
    const cleanClientName = clientName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    const filename = `proposta palestra- inteligencia artificial ${cleanClientName} , inventormiguel - ${month}${year}.pdf`;
    const storagePath = `generated/${cleanClientName}_${Date.now()}.pdf`;
    
    console.log("Generated filename:", filename);
    console.log("Uploading PDF to storage:", storagePath);

    // Upload PDF directly to Storage (avoids CPU-intensive base64 encoding)
    const { error: uploadError } = await supabase.storage
      .from('proposal-templates')
      .upload(storagePath, modifiedPdfBytes, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error("Error uploading PDF:", uploadError);
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('proposal-templates')
      .getPublicUrl(storagePath);

    console.log("PDF uploaded successfully:", urlData.publicUrl);

    return new Response(
      JSON.stringify({ 
        success: true, 
        pdfUrl: urlData.publicUrl,
        filename: filename
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error generating proposal PDF:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
