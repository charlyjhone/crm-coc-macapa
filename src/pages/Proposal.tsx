import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, ArrowRight, Loader2, Download, RefreshCw, FileDown, Sparkles, Link, Copy, Mail, ExternalLink, Send } from "lucide-react";

interface EventDetails {
  companyName: string | null;
  lectureTitle: string | null;
  audience: string | null;
  location: string | null;
  date: string | null;
  time: string | null;
  duration: string | null;
}

const Proposal = () => {
  const [searchParams] = useSearchParams();
  const leadId = searchParams.get("leadId");
  const { toast } = useToast();

  const [leadName, setLeadName] = useState("");
  const [leadValue, setLeadValue] = useState<number | null>(null);
  const [leadCurrency, setLeadCurrency] = useState<string>("BRL");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingSlides, setGeneratingSlides] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Step control
  const [step, setStep] = useState<"edit" | "preview">("edit");

  // Slide 30 - Capa
  const [slide30Company, setSlide30Company] = useState("");
  const [slide30Title, setSlide30Title] = useState("O Futuro da Inteligência");
  const [slide30Audience, setSlide30Audience] = useState("");
  const [slide30Location, setSlide30Location] = useState("");
  const [slide30Date, setSlide30Date] = useState("");
  const [slide30Duration, setSlide30Duration] = useState("1h30min");
  const [slide30EventName, setSlide30EventName] = useState("");
  const [slide30EndClient, setSlide30EndClient] = useState("");
  const [slide30Observations, setSlide30Observations] = useState("");


  // Slide 31 - Conteúdo da palestra
  const [slide31Content, setSlide31Content] = useState("");

  // Generated slide images
  const [slide30Image, setSlide30Image] = useState<string | null>(null);
  const [slide31Image, setSlide31Image] = useState<string | null>(null);
  const [slide32Image, setSlide32Image] = useState<string | null>(null);

  // Regenerate states
  const [regeneratingSlide, setRegeneratingSlide] = useState<string | null>(null);
  const [showRegeneratePrompt, setShowRegeneratePrompt] = useState<string | null>(null);
  const [regeneratePrompt, setRegeneratePrompt] = useState("");

  // Generated PDF state
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
  const [proposalShareLink, setProposalShareLink] = useState<string | null>(null);

  // Email generation state
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [generatedEmailSubject, setGeneratedEmailSubject] = useState("");
  const [generatedEmailBody, setGeneratedEmailBody] = useState("");
  const [leadDescription, setLeadDescription] = useState("");
  const [leadProduto, setLeadProduto] = useState("");
  const [leadEmails, setLeadEmails] = useState<string[]>([]);

  useEffect(() => {
    const generateProposalContent = async () => {
      if (!leadId) {
        setLoading(false);
        return;
      }

      setGenerating(true);

      try {
        // Fetch lead value, currency and additional info
        const { data: leadData } = await supabase
          .from("leads")
          .select("valor, moeda, description, produto, emails")
          .eq("id", leadId)
          .single();

        if (leadData) {
          setLeadValue(leadData.valor);
          setLeadCurrency(leadData.moeda || "BRL");
          setLeadDescription(leadData.description || "");
          setLeadProduto(leadData.produto || "palestra");
          setLeadEmails(leadData.emails || []);
        }

        const { data, error } = await supabase.functions.invoke("generate-proposal-content", {
          body: { leadId },
        });

        if (error) throw error;

        if (data) {
          setLeadName(data.leadName || "");
          
          // Populate slide 30
          const details = data.eventDetails as EventDetails;
          setSlide30Company(details?.companyName || data.leadName || "");
          setSlide30Title(details?.lectureTitle || "O Futuro da Inteligência");

          // Combina perfil + tamanho do público (ex.: "Executivos — 1.400 pessoas")
          const audienceProfile = details?.audience || "Executivos e líderes";
          const audienceSize = Number((details as any)?.audienceSize) || 0;
          const audienceFinal = audienceSize > 0
            ? `${audienceProfile} — ${audienceSize.toLocaleString("pt-BR")} pessoas`
            : audienceProfile;
          setSlide30Audience(audienceFinal);

          setSlide30Location(details?.location || "A definir");

          // Build date string
          let dateStr = details?.date || "A confirmar";
          if (details?.time && details.time !== "A combinar") {
            dateStr += ` às ${details.time}`;
          } else if (!details?.time || details.time === "A combinar") {
            dateStr += " - Horário a combinar";
          }
          setSlide30Date(dateStr);
          setSlide30Duration(details?.duration || "1h30min");
          setSlide30EventName((details as any)?.eventName || "");
          setSlide30EndClient((details as any)?.endClient || "");
          setSlide30Observations((details as any)?.observations || "");


          // Populate slide 31 with topics
          if (data.suggestedTopics && Array.isArray(data.suggestedTopics)) {
            const topicsText = data.suggestedTopics.map((topic: string) => `• ${topic}`).join("\n\n");
            setSlide31Content(topicsText);
          }
        }
      } catch (error) {
        console.error("Erro ao gerar conteúdo da proposta:", error);
        toast({
          title: "Erro",
          description: "Não foi possível gerar o conteúdo da proposta automaticamente.",
          variant: "destructive",
        });
        
        // Set defaults
        setSlide31Content(`• Introdução à Inteligência Artificial e seu impacto no mundo corporativo

• Casos práticos de aplicação de IA em diferentes setores

• Demonstrações ao vivo de ferramentas de IA generativa

• Como implementar IA de forma estratégica na sua empresa

• Tendências e o futuro da IA nos próximos anos

• Sessão de perguntas e respostas`);
      } finally {
        setLoading(false);
        setGenerating(false);
      }
    };

    generateProposalContent();
  }, [leadId, toast]);

  const formatPrice = (value: number | null, currency: string) => {
    if (!value) return "Valor a definir";
    const formatter = new Intl.NumberFormat(currency === "USD" ? "en-US" : "pt-BR", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    return formatter.format(value);
  };

  const generateSlideImage = async (slideType: string, content: any, customPrompt?: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("generate-slide-images", {
        body: { slideType, content, leadId, customPrompt },
      });

      if (error) throw error;
      return data?.imageUrl || null;
    } catch (error) {
      console.error(`Erro ao gerar slide ${slideType}:`, error);
      return null;
    }
  };

  const handleRegenerateSlide = async (slideType: "cover" | "agenda" | "pricing") => {
    setRegeneratingSlide(slideType);
    
    try {
      let content: any;
      let setImage: (url: string | null) => void;
      
      if (slideType === "cover") {
        content = {
          company: slide30Company,
          title: slide30Title,
          audience: slide30Audience,
          location: slide30Location,
          date: slide30Date,
          duration: slide30Duration,
        };
        setImage = setSlide30Image;
      } else if (slideType === "agenda") {
        content = { topics: slide31Content };
        setImage = setSlide31Image;
      } else {
        content = { price: formatPrice(leadValue, leadCurrency), currency: leadCurrency };
        setImage = setSlide32Image;
      }

      const newImage = await generateSlideImage(slideType, content, regeneratePrompt || undefined);
      
      if (newImage) {
        setImage(newImage);
        toast({
          title: "Slide regenerado!",
          description: "A imagem foi atualizada com sucesso.",
        });
      } else {
        toast({
          title: "Erro",
          description: "Não foi possível regenerar o slide.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Erro ao regenerar slide:", error);
      toast({
        title: "Erro",
        description: "Não foi possível regenerar o slide.",
        variant: "destructive",
      });
    } finally {
      setRegeneratingSlide(null);
      setShowRegeneratePrompt(null);
      setRegeneratePrompt("");
    }
  };

  const handleContinue = async () => {
    setGeneratingSlides(true);
    
    try {
      toast({
        title: "Gerando slides...",
        description: "Isso pode levar alguns segundos.",
      });

      // Generate all 3 slides in parallel
      const [coverImage, agendaImage, pricingImage] = await Promise.all([
        generateSlideImage("cover", {
          company: slide30Company,
          title: slide30Title,
          audience: slide30Audience,
          location: slide30Location,
          date: slide30Date,
          duration: slide30Duration,
        }),
        generateSlideImage("agenda", {
          topics: slide31Content,
        }),
        generateSlideImage("pricing", {
          price: formatPrice(leadValue, leadCurrency),
          currency: leadCurrency,
        }),
      ]);

      setSlide30Image(coverImage);
      setSlide31Image(agendaImage);
      setSlide32Image(pricingImage);

      if (coverImage && agendaImage && pricingImage) {
        setStep("preview");
        toast({
          title: "Slides gerados!",
          description: "Confira os slides abaixo e faça o download.",
        });
      } else {
        toast({
          title: "Erro parcial",
          description: "Alguns slides não foram gerados corretamente.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Erro ao gerar slides:", error);
      toast({
        title: "Erro",
        description: "Não foi possível gerar os slides.",
        variant: "destructive",
      });
    } finally {
      setGeneratingSlides(false);
    }
  };

  const handleDownloadSlide = (imageUrl: string, filename: string) => {
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = () => {
    if (slide30Image) handleDownloadSlide(slide30Image, `${leadName}_slide30_capa.png`);
    setTimeout(() => {
      if (slide31Image) handleDownloadSlide(slide31Image, `${leadName}_slide31_agenda.png`);
    }, 500);
    setTimeout(() => {
      if (slide32Image) handleDownloadSlide(slide32Image, `${leadName}_slide32_preco.png`);
    }, 1000);
  };

  const handleBack = () => {
    setStep("edit");
  };

  const extractMonthYear = (dateStr: string): { month: string; year: string } => {
    const months: { [key: string]: string } = {
      "01": "janeiro",
      "02": "fevereiro",
      "03": "março",
      "04": "abril",
      "05": "maio",
      "06": "junho",
      "07": "julho",
      "08": "agosto",
      "09": "setembro",
      "10": "outubro",
      "11": "novembro",
      "12": "dezembro",
      janeiro: "janeiro",
      fevereiro: "fevereiro",
      março: "março",
      abril: "abril",
      maio: "maio",
      junho: "junho",
      julho: "julho",
      agosto: "agosto",
      setembro: "setembro",
      outubro: "outubro",
      novembro: "novembro",
      dezembro: "dezembro",
    };

    // Prefer DD/MM/YYYY
    const dmyMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/);
    if (dmyMatch) {
      const monthNum = String(dmyMatch[2]).padStart(2, "0");
      return { month: months[monthNum] || "mes", year: dmyMatch[3] };
    }

    // Fallback DD/MM
    const ddmmMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})/);
    if (ddmmMatch) {
      const monthNum = String(ddmmMatch[2]).padStart(2, "0");
      return { month: months[monthNum] || "mes", year: String(new Date().getFullYear()) };
    }

    // Try to find month name in the string
    for (const [key, value] of Object.entries(months)) {
      if (dateStr.toLowerCase().includes(key)) {
        const yearMatch = dateStr.match(/20\d{2}/);
        return { month: value, year: yearMatch ? yearMatch[0] : String(new Date().getFullYear()) };
      }
    }

    return { month: "mes", year: String(new Date().getFullYear()) };
  };

  const handleGenerateProposal = async () => {
    if (!slide30Image || !slide31Image || !slide32Image) {
      toast({
        title: "Erro",
        description: "Todos os slides precisam estar gerados.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingPdf(true);

    try {
      toast({
        title: "Gerando proposta...",
        description: "Isso pode levar alguns segundos.",
      });

      const { month, year } = extractMonthYear(slide30Date);
      const clientName = slide30Company || leadName || 'cliente';

      const { data, error } = await supabase.functions.invoke("generate-proposal-pdf", {
        body: {
          slide30ImageUrl: slide30Image,
          slide31ImageUrl: slide31Image,
          slide32ImageUrl: slide32Image,
          clientName,
          month,
          year,
        },
      });

      if (error) throw error;

      if (data?.pdfUrl && data?.filename) {
        // Save proposal URL to the lead
        if (leadId) {
          const { error: updateError } = await supabase
            .from('leads')
            .update({
              proposal_url: data.pdfUrl,
              proposal_sent_at: new Date().toISOString(),
              proposal_view_count: 0,
            })
            .eq('id', leadId);

          if (updateError) {
            console.error("Erro ao salvar URL da proposta:", updateError);
          }
        }

        // Generate the public share link
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const shareLink = `${supabaseUrl}/functions/v1/view-proposal?id=${leadId}`;
        
        setGeneratedPdfUrl(data.pdfUrl);
        setProposalShareLink(shareLink);

        // Open the PDF
        window.open(data.pdfUrl, '_blank');

        toast({
          title: "Proposta gerada!",
          description: `O link público foi copiado para a área de transferência.`,
        });

        // Copy share link to clipboard
        try {
          await navigator.clipboard.writeText(shareLink);
        } catch (clipboardError) {
          console.error("Erro ao copiar link:", clipboardError);
        }
      } else {
        throw new Error("Resposta inválida do servidor");
      }
    } catch (error) {
      console.error("Erro ao gerar proposta:", error);
      toast({
        title: "Erro",
        description: "Não foi possível gerar a proposta em PDF.",
        variant: "destructive",
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleGenerateProposalEmail = async () => {
    if (!proposalShareLink) return;
    
    setGeneratingEmail(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("generate-proposal-email", {
        body: {
          leadName: leadName || slide30Company,
          leadDescription,
          produto: leadProduto,
          valor: leadValue,
          moeda: leadCurrency,
          proposalUrl: proposalShareLink,
          emails: leadEmails,
        },
      });

      if (error) throw error;

      if (data?.subject && data?.body) {
        setGeneratedEmailSubject(data.subject);
        setGeneratedEmailBody(data.body);
        toast({
          title: "Email gerado!",
          description: "Revise o email abaixo antes de enviar.",
        });
      }
    } catch (error) {
      console.error("Erro ao gerar email:", error);
      toast({
        title: "Erro",
        description: "Não foi possível gerar o email.",
        variant: "destructive",
      });
    } finally {
      setGeneratingEmail(false);
    }
  };

  const handleSendProposalEmail = async () => {
    if (!leadId || !generatedEmailBody || leadEmails.length === 0) {
      toast({
        title: "Erro",
        description: "Não há destinatários de email configurados.",
        variant: "destructive",
      });
      return;
    }
    
    setSendingEmail(true);
    
    try {
      // Convert plain text body to HTML with clickable proposal link
      let htmlBody = generatedEmailBody
        .replace(/\n/g, '<br>')
        .replace(
          /(?:clique aqui para (?:acessar|ver|visualizar|abrir) a proposta|acesse a proposta|veja a proposta|abra a proposta|link da proposta)/gi,
          `<a href="${proposalShareLink}" style="color: #2563eb; text-decoration: underline; font-weight: bold;">Clique aqui para acessar a proposta</a>`
        );
      
      // Convert markdown links [text](url) to HTML anchors
      htmlBody = htmlBody.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" style="color: #2563eb; text-decoration: underline; font-weight: bold;">$1</a>'
      );
      
      // Also convert any raw URLs to clickable links as fallback
      htmlBody = htmlBody.replace(
        /(?<!href=")(https?:\/\/[^\s<>"]+)/g,
        '<a href="$1" style="color: #2563eb; text-decoration: underline;">$1</a>'
      );

      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          leadId,
          to: leadEmails,
          subject: generatedEmailSubject,
          body: htmlBody,
        },
      });

      if (error) throw error;

      // Update proposal_sent_at
      await supabase
        .from('leads')
        .update({ proposal_sent_at: new Date().toISOString() })
        .eq('id', leadId);

      toast({
        title: "Email enviado!",
        description: `Email enviado para ${leadEmails.length} destinatário(s).`,
      });

      // Clear the email form
      setGeneratedEmailSubject("");
      setGeneratedEmailBody("");
    } catch (error) {
      console.error("Erro ao enviar email:", error);
      toast({
        title: "Erro",
        description: "Não foi possível enviar o email.",
        variant: "destructive",
      });
    } finally {
      setSendingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">
          {generating ? "Analisando conversas e gerando proposta..." : "Carregando..."}
        </p>
      </div>
    );
  }

  if (step === "preview") {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Slides Gerados</h1>
                {leadName && (
                  <p className="text-muted-foreground">Cliente: {leadName}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleBack}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Editar textos
              </Button>
              <Button variant="outline" onClick={handleDownloadAll}>
                <Download className="h-4 w-4 mr-2" />
                Baixar todos
              </Button>
              <Button onClick={handleGenerateProposal} disabled={generatingPdf}>
                {generatingPdf ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando PDF...
                  </>
                ) : (
                  <>
                    <FileDown className="h-4 w-4 mr-2" />
                    Gerar Proposta
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Link da proposta gerada */}
          {proposalShareLink && (
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="p-4 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="font-semibold">Proposta gerada com sucesso!</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Compartilhe este link com seu cliente. As visualizações serão rastreadas automaticamente.
                    </p>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(proposalShareLink);
                          toast({
                            title: "Link copiado!",
                            description: "O link foi copiado para a área de transferência.",
                          });
                        } catch {
                          toast({
                            title: "Erro ao copiar",
                            description: "Não foi possível copiar o link.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar link
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => window.open(generatedPdfUrl || proposalShareLink, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Abrir proposta
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleGenerateProposalEmail}
                      disabled={generatingEmail}
                    >
                      {generatingEmail ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Gerando...
                        </>
                      ) : (
                        <>
                          <Mail className="h-4 w-4 mr-2" />
                          Gerar Email
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <div className="p-2 bg-background rounded border">
                  <code className="text-xs break-all text-muted-foreground">{proposalShareLink}</code>
                </div>

                {/* Email gerado */}
                {generatedEmailBody && (
                  <div className="mt-4 p-4 bg-background rounded border space-y-3">
                    <div className="space-y-2">
                      <Label>Assunto:</Label>
                      <Input
                        value={generatedEmailSubject}
                        onChange={(e) => setGeneratedEmailSubject(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Corpo do Email:</Label>
                      <Textarea
                        value={generatedEmailBody}
                        onChange={(e) => setGeneratedEmailBody(e.target.value)}
                        className="min-h-[200px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Destinatários: {leadEmails.length > 0 ? leadEmails.join(", ") : "Nenhum email configurado"}
                      </Label>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(`Assunto: ${generatedEmailSubject}\n\n${generatedEmailBody}`);
                            toast({
                              title: "Email copiado!",
                              description: "O email foi copiado para a área de transferência.",
                            });
                          } catch {
                            toast({
                              title: "Erro ao copiar",
                              description: "Não foi possível copiar o email.",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copiar
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSendProposalEmail}
                        disabled={sendingEmail || leadEmails.length === 0}
                      >
                        {sendingEmail ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Enviar Email
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6">
            {/* Slide 30 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-lg">Slide 30 - Capa</CardTitle>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowRegeneratePrompt(showRegeneratePrompt === "cover" ? null : "cover")}
                    disabled={regeneratingSlide !== null}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Regenerar
                  </Button>
                  {slide30Image && (
                    <Button variant="outline" size="sm" onClick={() => handleDownloadSlide(slide30Image, `${leadName}_slide30_capa.png`)}>
                      <Download className="h-4 w-4 mr-2" />
                      Baixar
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {showRegeneratePrompt === "cover" && (
                  <div className="p-4 bg-muted rounded-lg space-y-3">
                    <Label>O que você quer alterar neste slide?</Label>
                    <Textarea
                      value={regeneratePrompt}
                      onChange={(e) => setRegeneratePrompt(e.target.value)}
                      placeholder="Ex: Use um fundo mais escuro, aumente o tamanho do título..."
                      className="min-h-[80px]"
                    />
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        onClick={() => handleRegenerateSlide("cover")}
                        disabled={regeneratingSlide !== null}
                      >
                        {regeneratingSlide === "cover" ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Gerando...
                          </>
                        ) : (
                          "Aplicar alterações"
                        )}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => { setShowRegeneratePrompt(null); setRegeneratePrompt(""); }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
                {slide30Image ? (
                  <img src={slide30Image} alt="Slide 30 - Capa" className="w-full rounded-lg shadow-lg" />
                ) : (
                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                    <p className="text-muted-foreground">Erro ao gerar imagem</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Slide 31 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-lg">Slide 31 - Agenda</CardTitle>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowRegeneratePrompt(showRegeneratePrompt === "agenda" ? null : "agenda")}
                    disabled={regeneratingSlide !== null}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Regenerar
                  </Button>
                  {slide31Image && (
                    <Button variant="outline" size="sm" onClick={() => handleDownloadSlide(slide31Image, `${leadName}_slide31_agenda.png`)}>
                      <Download className="h-4 w-4 mr-2" />
                      Baixar
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {showRegeneratePrompt === "agenda" && (
                  <div className="p-4 bg-muted rounded-lg space-y-3">
                    <Label>O que você quer alterar neste slide?</Label>
                    <Textarea
                      value={regeneratePrompt}
                      onChange={(e) => setRegeneratePrompt(e.target.value)}
                      placeholder="Ex: Organize os tópicos em duas colunas, use ícones..."
                      className="min-h-[80px]"
                    />
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        onClick={() => handleRegenerateSlide("agenda")}
                        disabled={regeneratingSlide !== null}
                      >
                        {regeneratingSlide === "agenda" ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Gerando...
                          </>
                        ) : (
                          "Aplicar alterações"
                        )}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => { setShowRegeneratePrompt(null); setRegeneratePrompt(""); }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
                {slide31Image ? (
                  <img src={slide31Image} alt="Slide 31 - Agenda" className="w-full rounded-lg shadow-lg" />
                ) : (
                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                    <p className="text-muted-foreground">Erro ao gerar imagem</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Slide 32 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-lg">Slide 32 - Investimento</CardTitle>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowRegeneratePrompt(showRegeneratePrompt === "pricing" ? null : "pricing")}
                    disabled={regeneratingSlide !== null}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Regenerar
                  </Button>
                  {slide32Image && (
                    <Button variant="outline" size="sm" onClick={() => handleDownloadSlide(slide32Image, `${leadName}_slide32_preco.png`)}>
                      <Download className="h-4 w-4 mr-2" />
                      Baixar
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {showRegeneratePrompt === "pricing" && (
                  <div className="p-4 bg-muted rounded-lg space-y-3">
                    <Label>O que você quer alterar neste slide?</Label>
                    <Textarea
                      value={regeneratePrompt}
                      onChange={(e) => setRegeneratePrompt(e.target.value)}
                      placeholder="Ex: Destaque mais o valor, adicione um selo de qualidade..."
                      className="min-h-[80px]"
                    />
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        onClick={() => handleRegenerateSlide("pricing")}
                        disabled={regeneratingSlide !== null}
                      >
                        {regeneratingSlide === "pricing" ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Gerando...
                          </>
                        ) : (
                          "Aplicar alterações"
                        )}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => { setShowRegeneratePrompt(null); setRegeneratePrompt(""); }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
                {slide32Image ? (
                  <img src={slide32Image} alt="Slide 32 - Investimento" className="w-full rounded-lg shadow-lg" />
                ) : (
                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                    <p className="text-muted-foreground">Erro ao gerar imagem</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-8">
          <FileText className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Gerar Proposta de Palestra</h1>
            {leadName && (
              <p className="text-muted-foreground">Cliente: {leadName}</p>
            )}
          </div>
        </div>

        {/* Slide 30 - Título */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Slide 30 - Capa da Proposta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="slide30Company">Nome da Empresa</Label>
              <Input
                id="slide30Company"
                value={slide30Company}
                onChange={(e) => setSlide30Company(e.target.value)}
                placeholder="Nome da empresa cliente"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="slide30EndClient">Cliente Final</Label>
                <Input
                  id="slide30EndClient"
                  value={slide30EndClient}
                  onChange={(e) => setSlide30EndClient(e.target.value)}
                  placeholder="Ex.: Nubank (quando é agência)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slide30EventName">Evento</Label>
                <Input
                  id="slide30EventName"
                  value={slide30EventName}
                  onChange={(e) => setSlide30EventName(e.target.value)}
                  placeholder="Ex.: Ops BR Day"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slide30Title">Título da Palestra</Label>
              <Input
                id="slide30Title"
                value={slide30Title}
                onChange={(e) => setSlide30Title(e.target.value)}
                placeholder="O Futuro da Inteligência"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slide30Audience">Público-alvo</Label>
              <Input
                id="slide30Audience"
                value={slide30Audience}
                onChange={(e) => setSlide30Audience(e.target.value)}
                placeholder="Executivos e líderes"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slide30Location">Local</Label>
              <Input
                id="slide30Location"
                value={slide30Location}
                onChange={(e) => setSlide30Location(e.target.value)}
                placeholder="Cidade, Estado ou Remoto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slide30Date">Data e Horário</Label>
              <Input
                id="slide30Date"
                value={slide30Date}
                onChange={(e) => setSlide30Date(e.target.value)}
                placeholder="A confirmar - Horário a combinar"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slide30Duration">Duração</Label>
              <Input
                id="slide30Duration"
                value={slide30Duration}
                onChange={(e) => setSlide30Duration(e.target.value)}
                placeholder="1h30min"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slide30Observations">Observações</Label>
              <Textarea
                id="slide30Observations"
                value={slide30Observations}
                onChange={(e) => setSlide30Observations(e.target.value)}
                placeholder="Ex.: emissão de NF, comissão de 20% para a agência, requisitos de produção, etc."
                rows={3}
              />
            </div>


            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Preview do texto:</p>
              <div className="text-center space-y-1">
                <p className="font-bold text-lg">{slide30Company}</p>
                <p className="text-primary text-xl">{slide30Title}</p>
                <p className="text-sm">Público: {slide30Audience}</p>
                <p className="text-sm">Local: {slide30Location}</p>
                <p className="text-sm">{slide30Date}</p>
                <p className="text-sm">Duração: {slide30Duration}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Slide 31 - Conteúdo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Slide 31 - Conteúdo da Palestra</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="slide31Content">Tópicos da Palestra (gerados com base na conversa)</Label>
              <Textarea
                id="slide31Content"
                value={slide31Content}
                onChange={(e) => setSlide31Content(e.target.value)}
                placeholder="Liste os tópicos da palestra..."
                className="min-h-[200px]"
              />
            </div>

            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Preview do texto:</p>
              <div className="whitespace-pre-line text-sm">
                {slide31Content}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Slide 32 - Preço (preview) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Slide 32 - Investimento (automático)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-sm text-muted-foreground mb-2">Valor da oportunidade:</p>
              <p className="text-2xl font-bold text-primary">
                {formatPrice(leadValue, leadCurrency)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Botão Continuar */}
        <div className="flex justify-end">
          <Button size="lg" onClick={handleContinue} disabled={generatingSlides}>
            {generatingSlides ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando slides...
              </>
            ) : (
              <>
                Gerar Slides
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Proposal;
