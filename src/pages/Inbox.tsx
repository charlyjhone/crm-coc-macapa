import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mail, Send, Search, ArrowRight, Loader2, ExternalLink, Reply, X } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import DOMPurify from "dompurify";
import { extractNewEmailContent, htmlToPlainText } from "@/lib/emailUtils";
import { toast } from "sonner";

interface EmailWithLead {
  id: string;
  lead_id: string | null;
  direction: string;
  subject: string | null;
  message: string | null;
  html_body: string | null;
  timestamp: string;
  raw_data: any;
  lead_name?: string;
  lead_email?: string;
}

function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: raw.trim(), email: raw.trim() };
}

function parseCcList(cc: string): Array<{ name: string; email: string }> {
  if (!cc) return [];
  // Split by comma but respect angle brackets
  const parts: string[] = [];
  let current = "";
  let inBracket = false;
  for (const ch of cc) {
    if (ch === "<") inBracket = true;
    if (ch === ">") inBracket = false;
    if (ch === "," && !inBracket) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  
  return parts
    .map(parseEmailAddress)
    .filter((p) => !p.email.includes("cloudmailin.net")); // Remove o relay
}

function extractSenderInfo(email: EmailWithLead) {
  const rd = email.raw_data;
  if (!rd) return { from: null, to: null, cc: [] as Array<{ name: string; email: string }> };

  // Formato do relay antigo
  const hdrFrom = rd["headers[from]"];
  const hdrTo = rd["headers[to]"];
  const hdrCc = rd["headers[cc]"];

  // Imported/reprocessed format
  const senderEmail = rd["sender_email"];
  const recipientEmail = rd["recipient_email"];

  const from = hdrFrom ? parseEmailAddress(hdrFrom) : senderEmail ? { name: "", email: senderEmail } : null;
  const to = hdrTo ? parseEmailAddress(hdrTo) : recipientEmail ? { name: "", email: recipientEmail } : null;
  const cc = hdrCc ? parseCcList(hdrCc) : [];

  return { from, to, cc };
}

const PAGE_SIZE = 30;

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  em_atendimento: "Em Atendimento",
  em_negociacao: "Em Negociação",
  matriculado: "Matriculado",
  resolvido: "Resolvido",
  nao_convertido: "Não Convertido",
};

const STATUS_COLORS: Record<string, string> = {
  novo: "bg-muted text-muted-foreground",
  em_atendimento: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  em_negociacao: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  matriculado: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  resolvido: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  nao_convertido: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

interface MatchingLead {
  id: string;
  name: string;
  status: string | null;
  produto: string | null;
  valor: number | null;
  moeda: string | null;
  created_at: string;
}

const Inbox = () => {
  const [inboundEmails, setInboundEmails] = useState<EmailWithLead[]>([]);
  const [outboundEmails, setOutboundEmails] = useState<EmailWithLead[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreInbound, setHasMoreInbound] = useState(true);
  const [hasMoreOutbound, setHasMoreOutbound] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [searchResults, setSearchResults] = useState<EmailWithLead[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailWithLead | null>(null);
  const [tab, setTab] = useState<"inbound" | "outbound">("inbound");
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [matchingLeads, setMatchingLeads] = useState<MatchingLead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("inbox_read_ids");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const navigate = useNavigate();
  const leadCacheRef = useRef<Record<string, { name: string; email: string | null }>>({});
  const [activeLeadIds, setActiveLeadIds] = useState<string[] | null>(null);

  // Carrega IDs de leads ativos (novo, em_atendimento, em_negociacao, matriculado). Outros statuses ficam ocultos do Inbox.
  useEffect(() => {
    const loadActive = async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id")
        .in("status", ["novo", "em_atendimento", "em_negociacao", "matriculado"]);
      if (error) {
        console.error("Erro carregando leads ativos:", error);
        setActiveLeadIds([]);
        return;
      }
      setActiveLeadIds((data || []).map((l) => l.id));
    };
    loadActive();
  }, []);

  // Reply state
  const [replyMode, setReplyMode] = useState(false);
  const [replyGenerating, setReplyGenerating] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");

  const handleReply = async (email: EmailWithLead) => {
    if (!email.lead_id) {
      toast.error("Este e-mail não está vinculado a um lead");
      return;
    }
    setReplyMode(true);
    setReplyGenerating(false);
    setReplySubject(email.subject?.startsWith("Re:") ? email.subject : `Re: ${email.subject || "Contato com a escola"}`);
    setReplyBody("");
  };

  const handleSendReply = async () => {
    if (!selectedEmail?.lead_id || !replyBody.trim()) return;
    setReplySending(true);

    try {
      const leadInfo = leadCacheRef.current[selectedEmail.lead_id];
      const recipientEmail = leadInfo?.email || selectedEmail.lead_email;

      if (!recipientEmail) throw new Error("E-mail do lead não encontrado");

      const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">${replyBody.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>`;

      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          leadId: selectedEmail.lead_id,
          to: recipientEmail,
          subject: replySubject.startsWith("Re:") ? replySubject : `Re: ${replySubject}`,
          body: htmlBody,
          threadQuote: true,
        },
      });

      if (error) throw error;

      toast.success("E-mail enviado com sucesso!");
      setReplyMode(false);
      setReplyBody("");
      setReplySubject("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar e-mail");
    } finally {
      setReplySending(false);
    }
  };

  const markAsRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      // Keep only last 2000 ids in localStorage
      const arr = [...next];
      const trimmed = arr.length > 2000 ? arr.slice(arr.length - 2000) : arr;
      localStorage.setItem("inbox_read_ids", JSON.stringify(trimmed));
      return new Set(trimmed);
    });
  }, []);

  const enrichWithLeads = useCallback(async (emails: any[]): Promise<EmailWithLead[]> => {
    const missingIds = [...new Set(emails.map((e: any) => e.lead_id).filter(Boolean))]
      .filter((id) => !leadCacheRef.current[id as string]);

    if (missingIds.length > 0) {
      const { data: leads } = await supabase
        .from("leads")
        .select("id, name, email")
        .in("id", missingIds);
      if (leads) {
        leads.forEach((l) => {
          leadCacheRef.current[l.id] = { name: l.name, email: l.email };
        });
      }
    }

    return emails.map((e: any) => ({
      ...e,
      lead_name: e.lead_id ? leadCacheRef.current[e.lead_id]?.name : undefined,
      lead_email: e.lead_id ? leadCacheRef.current[e.lead_id]?.email ?? undefined : undefined,
    }));
  }, []);

  const fetchPage = useCallback(async (direction: "inbound" | "outbound", offset: number) => {
    if (!activeLeadIds) return [];
    if (activeLeadIds.length === 0) {
      if (direction === "inbound") setHasMoreInbound(false);
      else setHasMoreOutbound(false);
      return [];
    }
    const { data, error } = await supabase
      .from("email_messages")
      .select("id, lead_id, direction, subject, message, html_body, timestamp, raw_data")
      .eq("direction", direction)
      .in("lead_id", activeLeadIds)
      .order("timestamp", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("Error fetching emails:", error);
      return [];
    }

    const hasMore = (data || []).length === PAGE_SIZE;
    if (direction === "inbound") setHasMoreInbound(hasMore);
    else setHasMoreOutbound(hasMore);

    return await enrichWithLeads(data || []);
  }, [enrichWithLeads, activeLeadIds]);

  useEffect(() => {
    if (activeLeadIds === null) return;
    const load = async () => {
      setLoadingInitial(true);
      const [inbound, outbound] = await Promise.all([
        fetchPage("inbound", 0),
        fetchPage("outbound", 0),
      ]);
      setInboundEmails(inbound);
      setOutboundEmails(outbound);
      setLoadingInitial(false);
    };
    load();
  }, [fetchPage, activeLeadIds]);

  const loadMore = async () => {
    setLoadingMore(true);
    const current = tab === "inbound" ? inboundEmails : outboundEmails;
    const newPage = await fetchPage(tab, current.length);
    if (tab === "inbound") {
      setInboundEmails((prev) => [...prev, ...newPage]);
    } else {
      setOutboundEmails((prev) => [...prev, ...newPage]);
    }
    setLoadingMore(false);
  };

  // Database search when user types
  useEffect(() => {
    if (!debouncedSearch.trim()) {
      setSearchResults(null);
      return;
    }

    const doSearch = async () => {
      setSearchLoading(true);
      try {
        const q = `%${debouncedSearch}%`;
        const direction = tab;
        
        const { data, error } = await supabase
          .from("email_messages")
          .select("id, lead_id, direction, subject, message, html_body, timestamp, raw_data")
          .eq("direction", direction)
          .in("lead_id", activeLeadIds && activeLeadIds.length > 0 ? activeLeadIds : ["00000000-0000-0000-0000-000000000000"])
          .or(`subject.ilike.${q},message.ilike.${q}`)
          .order("timestamp", { ascending: false })
          .limit(50);

        if (error) {
          console.error("Search error:", error);
          setSearchResults([]);
          return;
        }

        const enriched = await enrichWithLeads(data || []);
        setSearchResults(enriched);
      } catch (err) {
        console.error("Search error:", err);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    };

    doSearch();
  }, [debouncedSearch, tab, enrichWithLeads, activeLeadIds]);

  const handleViewLead = async (email: EmailWithLead) => {
    if (!email.lead_id) return;

    // Get the lead's email to find all matching leads
    const leadInfo = leadCacheRef.current[email.lead_id];
    const leadEmail = leadInfo?.email || email.lead_email;

    if (!leadEmail) {
      // No email to search, go directly
      window.open(`/opportunity/${email.lead_id}`, "_blank");
      return;
    }

    setLoadingLeads(true);

    // Find all leads that have this email
    const { data: leads } = await supabase
      .from("leads")
      .select("id, name, status, produto, valor, moeda, created_at, email, emails")
      .or(`email.eq.${leadEmail},emails.cs.{${leadEmail}}`)
      .order("created_at", { ascending: false });

    setLoadingLeads(false);

    if (!leads || leads.length <= 1) {
      // Only one lead, go directly
      window.open(`/opportunity/${email.lead_id}`, "_blank");
      return;
    }

    // Multiple leads - sort: non-perdido first, then by created_at desc
    const sorted = [...leads].sort((a, b) => {
      const aLost = a.status === "nao_convertido";
      const bLost = b.status === "nao_convertido";
      if (aLost !== bLost) return aLost ? 1 : -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    setMatchingLeads(sorted);
    setLeadPickerOpen(true);
  };

  const currentEmails = tab === "inbound" ? inboundEmails : outboundEmails;
  const hasMore = tab === "inbound" ? hasMoreInbound : hasMoreOutbound;

  const baseList = searchResults !== null ? searchResults : currentEmails;
  const filtered = baseList;

  const getPreview = (email: EmailWithLead) => {
    if (email.message) return email.message.substring(0, 120);
    if (email.html_body) {
      const text = htmlToPlainText(extractNewEmailContent(email.html_body));
      return text.substring(0, 120);
    }
    return "Sem conteúdo";
  };

  const getListSender = (email: EmailWithLead) => {
    const { from, to } = extractSenderInfo(email);

    // Na aba enviados, mostrar o destinatário da mensagem.
    if (email.direction === "outbound") {
      if (to?.name) return to.name;
      if (to?.email) return to.email;
      return email.lead_name || email.lead_email || "Destinatário";
    }

    // Na aba recebidos, mostrar remetente real
    if (from?.name) return from.name;
    if (from?.email) return from.email;
    return email.lead_name || email.lead_email || "Desconhecido";
  };

  const renderEmailContent = (email: EmailWithLead) => {
    if (email.html_body) {
      const isInbound = email.direction === "inbound";
      const html = isInbound ? extractNewEmailContent(email.html_body) : email.html_body;
      return (
        <div
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
        />
      );
    }
    if (email.message) {
      return <p className="text-sm text-foreground whitespace-pre-wrap">{email.message}</p>;
    }
    return <p className="text-sm text-muted-foreground">Sem conteúdo</p>;
  };

  const renderDetailHeader = (email: EmailWithLead) => {
    const { from, to, cc } = extractSenderInfo(email);
    const displayFrom = from
      ? from
      : { name: email.lead_name || "Desconhecido", email: email.lead_email || "" };

    const displayTo = to || (email.direction === "outbound" && email.lead_email
      ? { name: email.lead_name || email.lead_email, email: email.lead_email }
      : null);

    return (
      <div className="p-6 border-b space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-foreground">
              {email.subject || "(sem assunto)"}
            </h2>

            {/* From */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs font-medium text-muted-foreground w-8 shrink-0">De:</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-foreground font-medium">
                  {displayFrom.name || displayFrom.email || "Desconhecido"}
                </span>
                {displayFrom.name && displayFrom.email && (
                  <span className="text-xs text-muted-foreground">&lt;{displayFrom.email}&gt;</span>
                )}
              </div>
            </div>

            {/* To */}
            {displayTo && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-medium text-muted-foreground w-8 shrink-0">Para:</span>
                <span className="text-sm text-foreground">
                  {displayTo.name || displayTo.email}
                  {displayTo.name && displayTo.email && (
                    <span className="text-xs text-muted-foreground ml-1">&lt;{displayTo.email}&gt;</span>
                  )}
                </span>
              </div>
            )}

            {/* CC */}
            {cc.length > 0 && (
              <div className="flex items-start gap-2 mt-1">
                <span className="text-xs font-medium text-muted-foreground w-8 shrink-0 mt-0.5">Cc:</span>
                <div className="flex flex-wrap gap-1">
                  {cc.map((c, i) => (
                    <span key={i} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {c.name || c.email}
                      {c.name && c.email && ` <${c.email}>`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">
                {format(new Date(email.timestamp), "dd/MM/yyyy, HH:mm", { locale: ptBR })}
              </span>
              <span className="text-xs text-muted-foreground">
                ({formatDistanceToNow(new Date(email.timestamp), { addSuffix: true, locale: ptBR })})
              </span>
              <Badge variant={email.direction === "inbound" ? "default" : "secondary"} className="text-xs">
                {email.direction === "inbound" ? "Recebido" : "Enviado"}
              </Badge>
            </div>
          </div>

          {email.lead_id && (
            <button
              onClick={() => handleViewLead(email)}
              className="flex items-center gap-1.5 text-sm text-primary hover:underline whitespace-nowrap"
            >
              {loadingLeads ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <>Ver lead <ArrowRight className="h-3.5 w-3.5" /></>}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b px-6 py-4">
        <h1 className="text-2xl font-bold text-foreground">Inbox</h1>
        <p className="text-sm text-muted-foreground">E-mails da escola</p>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <div className="w-[400px] border-r flex flex-col min-h-0">
          <div className="p-3 border-b space-y-3">
            <Tabs value={tab} onValueChange={(v) => { setTab(v as "inbound" | "outbound"); setSelectedEmail(null); }}>
              <TabsList className="w-full">
                <TabsTrigger value="inbound" className="flex-1 gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  Recebidos ({inboundEmails.length}{hasMoreInbound ? "+" : ""})
                </TabsTrigger>
                <TabsTrigger value="outbound" className="flex-1 gap-1.5">
                  <Send className="h-3.5 w-3.5" />
                  Enviados ({outboundEmails.length}{hasMoreOutbound ? "+" : ""})
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, e-mail ou assunto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            {loadingInitial || searchLoading ? (
              <div className="p-3 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-2 p-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Mail className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum e-mail encontrado</p>
              </div>
            ) : (
              <div>
                {filtered.map((email) => {
                  const isRead = readIds.has(email.id);
                  const ts = new Date(email.timestamp);
                  return (
                    <button
                      key={email.id}
                      onClick={() => { setSelectedEmail(email); markAsRead(email.id); setReplyMode(false); }}
                      className={`w-full text-left p-3 border-b transition-colors hover:bg-accent/50 ${
                        selectedEmail?.id === email.id ? "bg-accent" : ""
                      } ${!isRead ? "bg-primary/[0.03]" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {!isRead && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                          <span className={`text-sm text-foreground ${!isRead ? "font-bold" : "font-normal"}`}>
                            {getListSender(email)}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] text-muted-foreground">
                            {format(ts, "dd/MM/yyyy, HH:mm", { locale: ptBR })}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(ts, { addSuffix: true, locale: ptBR })}
                          </p>
                        </div>
                      </div>
                      <p className={`text-sm mt-0.5 ${!isRead ? "font-semibold text-foreground" : "font-normal text-foreground/80"}`}>
                        {email.subject || "(sem assunto)"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-normal break-words">
                        {getPreview(email)}
                      </p>
                    </button>
                  );
                })}

                {hasMore && !search && (
                  <div className="p-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Carregando...</>
                      ) : (
                        "Carregar mais"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col min-h-0">
          {selectedEmail ? (
            <>
              {renderDetailHeader(selectedEmail)}
              <ScrollArea className="flex-1 p-6">
                {renderEmailContent(selectedEmail)}
              </ScrollArea>

              {/* Reply composer */}
              {replyMode ? (
                <div className="border-t p-4 space-y-3 shrink-0">
                  {replyGenerating ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Gerando resposta com IA...</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">Responder como Ana — COC Macapá Norte</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setReplyMode(false)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <Input
                        value={replySubject}
                        onChange={(e) => setReplySubject(e.target.value)}
                        placeholder="Assunto"
                        className="h-8 text-sm"
                      />
                      <Textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        rows={8}
                        className="text-sm resize-none"
                      />
                      <div className="flex justify-between items-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setReplyBody("")}
                        >Limpar</Button>
                        <Button
                          size="sm"
                          onClick={handleSendReply}
                          disabled={replySending || !replyBody.trim()}
                        >
                          {replySending ? (
                            <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Enviando...</>
                          ) : (
                            <><Send className="h-3.5 w-3.5 mr-1" />Enviar</>
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
                ) : (
                selectedEmail.lead_id && (
                  <div className="border-t p-3 shrink-0 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReply(selectedEmail)}
                      className="gap-1.5"
                    >
                      <Reply className="h-3.5 w-3.5" />
                      Responder
                    </Button>
                  </div>
                )
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Mail className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Selecione um e-mail para visualizar</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lead Picker Dialog */}
      <Dialog open={leadPickerOpen} onOpenChange={setLeadPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Escolha o lead</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            Existem {matchingLeads.length} leads com este e-mail. Qual você deseja abrir?
          </p>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {matchingLeads.map((lead) => (
              <button
                key={lead.id}
                onClick={() => {
                  setLeadPickerOpen(false);
                  window.open(`/opportunity/${lead.id}`, "_blank");
                }}
                className="w-full text-left p-3 rounded-lg border hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground">{lead.name}</span>
                      <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[lead.status || "novo"] || ""}`}>
                        {STATUS_LABELS[lead.status || "novo"] || lead.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {lead.produto && <span>{lead.produto}</span>}
                      {lead.valor != null && (
                        <span className="font-medium">
                          {lead.moeda || "BRL"} {lead.valor.toLocaleString("pt-BR")}
                        </span>
                      )}
                      <span>Criado em {format(new Date(lead.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inbox;
