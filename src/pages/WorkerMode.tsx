import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, ArrowRight, MessageCircle, Mail, FileText, Clock, Search, Phone, CheckCircle,
  Sparkles, Loader2, X, Zap, History, Play, DollarSign, Calendar, Send, Briefcase,
  RefreshCw, PackageCheck, XCircle, PenLine, Download, Users, TrendingUp, Brain
} from "lucide-react";
import { buildStatusUpdateData, type LeadStatus } from "@/lib/leadStatusUtils";
import { computeLeadPriority } from "@/lib/leadPriority";
import { extractNewEmailContent, htmlToPlainText, stripPlainTextQuotes } from "@/lib/emailUtils";
import { formatDistanceToNow, format, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phones: string[] | null;
  status: string | null;
  produto: string | null;
  emails: string[] | null;
  publicidade_subtipo: string | null;
  valor: number | null;
  moeda: string | null;
  description: string | null;
  ai_close_probability: number | null;
  ai_diagnosis: string | null;
  ai_next_step: string | null;
  ai_diagnosis_reason: string | null;
  last_inbound_message: string | null;
  last_inbound_message_at: string | null;
  last_outbound_message: string | null;
  last_outbound_message_at: string | null;
  proposal_sent_at: string | null;
  proposal_view_count: number | null;
  created_at: string;
  profile_picture_url: string | null;
  valor_pago: number | null;
  is_recurring: boolean | null;
  data_proximo_pagamento: string | null;
  delivered_at: string | null;
  origem: string | null;
  email_inbound_count: number | null;
  email_outbound_count: number | null;
  whatsapp_inbound_count: number | null;
  whatsapp_outbound_count: number | null;
  negociacao_at: string | null;
  ganho_at: string | null;
  perdido_at: string | null;
  produzido_at: string | null;
  reopened_at: string | null;
  language: string | null;
}

interface SuggestedAction {
  type: string;
  label: string;
  priority: "high" | "medium" | "low";
  reasoning: string;
}

interface WorkerAction {
  id: string;
  action_type: string;
  action_label: string;
  notes: string | null;
  created_at: string;
}

const ACTION_ICONS: Record<string, typeof MessageCircle> = {
  followup_whatsapp: MessageCircle,
  followup_email: Mail,
  send_proposal: FileText,
  wait: Clock,
  research: Search,
  call: Phone,
  update_status: CheckCircle,
  start_production: Play,
  collect_payment: DollarSign,
  schedule_meeting: Calendar,
  send_briefing: Send,
  custom: Sparkles,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-primary/10 text-primary border-primary/20",
  low: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABELS: Record<string, string> = {
  em_aberto: "Aberto",
  em_negociacao: "Negociação",
  ganho: "Ganho",
  perdido: "Perdido",
  produzido: "Produzido",
  entregue: "Entregue",
};

const STATUS_COLORS: Record<string, string> = {
  em_aberto: "bg-blue-100 text-blue-800",
  em_negociacao: "bg-yellow-100 text-yellow-800",
  ganho: "bg-green-100 text-green-800",
  perdido: "bg-red-100 text-red-800",
  produzido: "bg-purple-100 text-purple-800",
  entregue: "bg-emerald-100 text-emerald-800",
};

function formatCurrency(valor: number | null, moeda: string | null) {
  if (!valor) return "—";
  const symbols: Record<string, string> = { BRL: "R$", USD: "US$", EUR: "€" };
  return `${symbols[moeda || "BRL"] || "R$"} ${valor.toLocaleString("pt-BR")}`;
}

const WorkerMode = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [suggestedActions, setSuggestedActions] = useState<SuggestedAction[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [actionHistory, setActionHistory] = useState<WorkerAction[]>([]);
  const [completingAction, setCompletingAction] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detailData, setDetailData] = useState<{ notes: any[]; whatsapp: any[]; emails: any[] } | null>(null);
  const [lastMessages, setLastMessages] = useState<{ inbound: string | null; outbound: string | null; inboundAt: string | null; outboundAt: string | null }>({ inbound: null, outbound: null, inboundAt: null, outboundAt: null });
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [customActionText, setCustomActionText] = useState("");
  const [submittingCustom, setSubmittingCustom] = useState(false);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);
  const [previousOpps, setPreviousOpps] = useState<Array<{ id: string; delivered_at: string | null; valor: number | null; moeda: string | null; produto: string | null }>>([]);
  const [doneToday, setDoneToday] = useState(0);
  const [initialTotal, setInitialTotal] = useState(0);
  const [executingFollowup, setExecutingFollowup] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const [generatingWhatsapp, setGeneratingWhatsapp] = useState(false);
  const [exportingToFinanceiro, setExportingToFinanceiro] = useState(false);
  const [sendingToSara, setSendingToSara] = useState(false);
  const [reprocessingAI, setReprocessingAI] = useState(false);
  const [deliveryLogs, setDeliveryLogs] = useState<{ destination: string; sent_at: string }[]>([]);
  const [confirmResend, setConfirmResend] = useState<'sara' | 'tiffany' | null>(null);

  const [showMoreActions, setShowMoreActions] = useState(false);

  const currentLead = leads[currentIndex] || null;
  const visibleSuggestedActions = useMemo(() => suggestedActions.slice(0, 2), [suggestedActions]);

  // Load leads sorted by revenue priority
  useEffect(() => {
    const fetchLeads = async () => {
      setLoading(true);

      // Fetch leads and today's actions in parallel
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [leadsRes, actionsRes] = await Promise.all([
        supabase
          .from("leads")
          .select("*")
          .eq("archived", false)
          .eq("unclassified", false)
          .in("status", ["ganho", "produzido", "em_negociacao", "em_aberto"])
          .order("created_at", { ascending: false }),
        supabase
          .from("worker_actions")
          .select("lead_id")
          .gte("created_at", todayStart.toISOString()),
      ]);

      if (leadsRes.error) {
        console.error("Error fetching leads:", leadsRes.error);
        setLoading(false);
        return;
      }

      // Set of lead IDs that already had actions today
      const actionedToday = new Set((actionsRes.data || []).map((a) => a.lead_id));

      // Ordena pela MESMA prioridade do CRM (lead scoring determinístico):
      // cliente aguardando resposta > pagamento/produção pendente > probabilidade
      // > valor > engajamento. Leads já trabalhados hoje vão para o fim.
      const priorityScores = new Map<string, number>();
      for (const l of leadsRes.data || []) {
        priorityScores.set(l.id, computeLeadPriority(l)?.score ?? -1);
      }

      const sorted = (leadsRes.data || []).sort((a, b) => {
        // Leads with actions today go to the end
        const aActioned = actionedToday.has(a.id) ? 1 : 0;
        const bActioned = actionedToday.has(b.id) ? 1 : 0;
        if (aActioned !== bActioned) return aActioned - bActioned;

        const sA = priorityScores.get(a.id) ?? -1;
        const sB = priorityScores.get(b.id) ?? -1;
        if (sA !== sB) return sB - sA;

        const aValor = a.valor || 0;
        const bValor = b.valor || 0;
        return bValor - aValor;
      });

      setLeads(sorted);
      setInitialTotal(sorted.length);
      setDoneToday(actionedToday.size);
      setLoading(false);
    };
    fetchLeads();
  }, []);

  // Fetch AI suggestions when lead changes
  const fetchSuggestions = useCallback(async (lead: Lead) => {
    setLoadingActions(true);
    setSuggestedActions([]);

    try {
      const { data, error } = await supabase.functions.invoke("suggest-worker-actions", {
        body: { lead },
      });

      if (error) throw error;
      setSuggestedActions(data.actions || []);
      setActionHistory(data.recentActions || []);
    } catch (e) {
      console.error("Error fetching suggestions:", e);
      // Fallback actions
      setSuggestedActions([
        { type: "followup_whatsapp", label: "Enviar follow-up no WhatsApp", priority: "high", reasoning: "Manter contato" },
        { type: "followup_email", label: "Enviar follow-up por e-mail", priority: "medium", reasoning: "Reforçar contato" },
        { type: "send_proposal", label: "Enviar proposta", priority: "medium", reasoning: "Formalizar oferta" },
      ]);
    } finally {
      setLoadingActions(false);
    }
  }, []);

  // Fetch delivery logs for current lead
  useEffect(() => {
    if (currentLead) {
      supabase.from("delivery_logs").select("destination, sent_at").eq("lead_id", currentLead.id).order("sent_at", { ascending: false }).then(({ data }) => {
        setDeliveryLogs((data as any) || []);
      });
    } else {
      setDeliveryLogs([]);
    }
  }, [currentLead?.id]);

  const lastSaraLog = deliveryLogs.find(l => l.destination === 'sara');
  const lastTiffanyLog = deliveryLogs.find(l => l.destination === 'tiffany');

  const logDelivery = async (leadId: string, destination: 'sara' | 'tiffany') => {
    await supabase.from("delivery_logs").insert({ lead_id: leadId, destination } as any);
    setDeliveryLogs(prev => [{ destination, sent_at: new Date().toISOString() }, ...prev]);
  };

  const handleSaraClick = () => {
    if (lastSaraLog) { setConfirmResend('sara'); return; }
    sendToSara();
  };

  const handleTiffanyClick = () => {
    if (lastTiffanyLog) { setConfirmResend('tiffany'); return; }
    exportToFinanceiro();
  };

  useEffect(() => {
    if (currentLead) {
      setWhatsappMessage("");
      setLastMessages({ inbound: null, outbound: null, inboundAt: null, outboundAt: null });
      fetchSuggestions(currentLead);

      // Fetch latest messages if cached fields are empty
      if (!currentLead.last_inbound_message || !currentLead.last_outbound_message) {
        (async () => {
          const [waIn, waOut, emIn, emOut] = await Promise.all([
            !currentLead.last_inbound_message
              ? supabase.from("whatsapp_messages").select("message, timestamp, created_at").eq("lead_id", currentLead.id).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1)
              : Promise.resolve({ data: null }),
            !currentLead.last_outbound_message
              ? supabase.from("whatsapp_messages").select("message, timestamp, created_at").eq("lead_id", currentLead.id).eq("direction", "outbound").order("created_at", { ascending: false }).limit(1)
              : Promise.resolve({ data: null }),
            !currentLead.last_inbound_message
              ? supabase.from("email_messages").select("message, subject, timestamp").eq("lead_id", currentLead.id).eq("direction", "inbound").order("timestamp", { ascending: false }).limit(1)
              : Promise.resolve({ data: null }),
            !currentLead.last_outbound_message
              ? supabase.from("email_messages").select("message, subject, timestamp").eq("lead_id", currentLead.id).eq("direction", "outbound").order("timestamp", { ascending: false }).limit(1)
              : Promise.resolve({ data: null }),
          ]);

          const inMsg = waIn?.data?.[0] || emIn?.data?.[0];
          const outMsg = waOut?.data?.[0] || emOut?.data?.[0];

          setLastMessages({
            inbound: inMsg?.message || inMsg?.subject || null,
            outbound: outMsg?.message || outMsg?.subject || null,
            inboundAt: inMsg?.timestamp || inMsg?.created_at || null,
            outboundAt: outMsg?.timestamp || outMsg?.created_at || null,
          });
        })();
      }
      // Fetch previous opportunities for recurring leads
      if (currentLead.is_recurring) {
        const emailsToSearch = currentLead.emails?.length ? currentLead.emails : (currentLead.email ? [currentLead.email] : []);
        const nameToSearch = currentLead.name;
        
        if (emailsToSearch.length > 0) {
          supabase
            .from("leads")
            .select("id, delivered_at, valor, moeda, produto")
            .neq("id", currentLead.id)
            .overlaps("emails", emailsToSearch)
            .order("delivered_at", { ascending: false })
            .limit(10)
            .then(({ data }) => setPreviousOpps(data || []));
        } else if (nameToSearch) {
          // Fallback: search by name
          supabase
            .from("leads")
            .select("id, delivered_at, valor, moeda, produto")
            .neq("id", currentLead.id)
            .eq("name", nameToSearch)
            .order("delivered_at", { ascending: false })
            .limit(10)
            .then(({ data }) => setPreviousOpps(data || []));
        } else {
          setPreviousOpps([]);
        }
      } else {
        setPreviousOpps([]);
      }
    }
  }, [currentLead?.id, fetchSuggestions]);

  // Complete an action
  const completeAction = async (action: SuggestedAction) => {
    if (!currentLead) return;
    setCompletingAction(action.type);

    try {
      const { error } = await supabase.from("worker_actions").insert({
        lead_id: currentLead.id,
        action_type: action.type,
        action_label: action.label,
      });

      if (error) throw error;

      // Add to local history
      setActionHistory((prev) => [
        { id: crypto.randomUUID(), action_type: action.type, action_label: action.label, notes: null, created_at: new Date().toISOString() },
        ...prev,
      ]);

      // If it's a navigable action, open the lead detail
      if (["followup_whatsapp", "followup_email", "send_proposal", "call"].includes(action.type)) {
        window.open(`/opportunity/${currentLead.id}`, "_blank");
      }

      toast({
        title: "Ação registrada ✅",
        description: `${action.label} — ${currentLead.name}`,
      });

      // Remove completed action from suggestions
      setSuggestedActions((prev) => prev.filter((a) => a.type !== action.type));
      setDoneToday((prev) => prev + 1);

      // Move this lead to the end of the list and advance to next
      setTimeout(() => {
        setLeads((prev) => {
          const newLeads = [...prev];
          const [moved] = newLeads.splice(currentIndex, 1);
          newLeads.push(moved);
          return newLeads;
        });
        // currentIndex now points to the next lead automatically since we removed the current one
        setShowHistory(false);
      }, 600);
    } catch (e) {
      console.error("Error completing action:", e);
      toast({ title: "Erro ao registrar ação", variant: "destructive" });
    } finally {
      setCompletingAction(null);
    }
  };

  // Open inline detail panel
  const openDetail = async () => {
    if (!currentLead) return;
    setShowDetail(true);
    setLoadingDetail(true);
    try {
      const [notesRes, whatsappRes, emailsRes] = await Promise.all([
        supabase.from("lead_notes").select("note, created_at").eq("lead_id", currentLead.id).order("created_at", { ascending: false }).limit(10),
        supabase.from("whatsapp_messages").select("message, direction, timestamp, created_at").eq("lead_id", currentLead.id).order("timestamp", { ascending: false }).limit(20),
        supabase.from("email_messages").select("subject, message, direction, timestamp").eq("lead_id", currentLead.id).order("timestamp", { ascending: false }).limit(20),
      ]);
      setDetailData({
        notes: notesRes.data || [],
        whatsapp: whatsappRes.data || [],
        emails: emailsRes.data || [],
      });
    } catch (e) {
      console.error("Error fetching detail:", e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const goNext = () => {
    if (currentIndex < leads.length - 1) {
      setCurrentIndex((i) => i + 1);
      setShowHistory(false);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setShowHistory(false);
    }
  };

  // Skip lead (log "Aguardar" action and move to end of queue)
  const skipLead = async () => {
    if (!currentLead) return;
    try {
      const { error } = await supabase.from("worker_actions").insert({
        lead_id: currentLead.id,
        action_type: "wait",
        action_label: "Aguardar",
      });
      if (error) console.error("Error logging skip action:", error);

      setActionHistory((prev) => [
        { id: crypto.randomUUID(), action_type: "wait", action_label: "Aguardar", notes: null, created_at: new Date().toISOString() },
        ...prev,
      ]);

      setDoneToday((prev) => prev + 1);

      // Move lead to end of queue (same as other actions)
      setLeads((prev) => {
        const newLeads = [...prev];
        const [moved] = newLeads.splice(currentIndex, 1);
        newLeads.push(moved);
        return newLeads;
      });
      setShowHistory(false);
    } catch (e) {
      console.error("Error skipping lead:", e);
      goNext();
    }
  };

  // Keyboard shortcut: P to skip
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, leads.length]);

  // Submit custom action
  const submitCustomAction = async () => {
    if (!currentLead || !customActionText.trim()) return;
    setSubmittingCustom(true);
    try {
      const { error } = await supabase.from("worker_actions").insert({
        lead_id: currentLead.id,
        action_type: "custom",
        action_label: customActionText.trim(),
      });
      if (error) throw error;

      setActionHistory((prev) => [
        { id: crypto.randomUUID(), action_type: "custom", action_label: customActionText.trim(), notes: null, created_at: new Date().toISOString() },
        ...prev,
      ]);

      toast({ title: "Ação registrada ✅", description: `${customActionText.trim()} — ${currentLead.name}` });
      setCustomActionText("");
      setDoneToday((prev) => prev + 1);

      // Move lead to end and advance
      setTimeout(() => {
        setLeads((prev) => {
          const newLeads = [...prev];
          const [moved] = newLeads.splice(currentIndex, 1);
          newLeads.push(moved);
          return newLeads;
        });
        setShowHistory(false);
      }, 600);
    } catch (e) {
      console.error("Error submitting custom action:", e);
      toast({ title: "Erro ao registrar ação", variant: "destructive" });
    } finally {
      setSubmittingCustom(false);
    }
  };

  // Execute follow-up email (fire-and-forget)
  const executeFollowup = async () => {
    if (!currentLead) return;
    if (!currentLead.email) {
      toast({ title: "Lead sem e-mail cadastrado", variant: "destructive" });
      return;
    }

    const leadToProcess = { ...currentLead };
    const indexToProcess = currentIndex;

    // Log action and advance immediately
    await supabase.from("worker_actions").insert({
      lead_id: leadToProcess.id,
      action_type: "followup_email",
      action_label: "Follow-up enviado por e-mail",
    });

    toast({ title: "Follow-up na fila ✉️", description: `Gerando e-mail para ${leadToProcess.name}...` });
    setDoneToday((prev) => prev + 1);

    // Move lead to end and advance immediately
    setLeads((prev) => {
      const newLeads = [...prev];
      const [moved] = newLeads.splice(indexToProcess, 1);
      newLeads.push(moved);
      return newLeads;
    });
    setShowHistory(false);

    // Process email in background (fire-and-forget)
    (async () => {
      try {
        const { data: emails } = await supabase
          .from("email_messages")
          .select("subject, message, direction, timestamp, html_body, resend_message_id, raw_data")
          .eq("lead_id", leadToProcess.id)
          .order("timestamp", { ascending: true });

        if (!emails || emails.length === 0) {
          toast({ title: "⚠️ Sem histórico de e-mails", description: leadToProcess.name, variant: "destructive" });
          return;
        }

        const { data: replyData, error: replyError } = await supabase.functions.invoke("generate-email-reply", {
          body: {
            emails,
            leadName: leadToProcess.name,
            leadDescription: leadToProcess.description,
          leadLanguage: leadToProcess.language,
            leadStatus: leadToProcess.status,
            leadValor: leadToProcess.valor,
            leadValorPago: leadToProcess.valor_pago,
            leadMoeda: leadToProcess.moeda,
            leadProduto: leadToProcess.produto,
          },
        });

        if (replyError || !replyData?.body) {
          toast({ title: "❌ Erro ao gerar e-mail", description: `${leadToProcess.name}: ${replyData?.error || replyError?.message}`, variant: "destructive" });
          return;
        }

        const lastEmail = emails[emails.length - 1];
        const messageIds = emails.map((e: any) => e.resend_message_id).filter(Boolean);
        const lastRawMsgId = lastEmail.raw_data && typeof lastEmail.raw_data === 'object'
          ? (lastEmail.raw_data as any)?.headers?.['message-id'] || (lastEmail.raw_data as any)?.messageId
          : null;
        if (lastRawMsgId && messageIds.length === 0) messageIds.push(lastRawMsgId);

        const lastSubject = lastEmail?.subject || `Follow-up - ${leadToProcess.name}`;
        const subject = lastSubject.toLowerCase().startsWith('re:') ? lastSubject : `Re: ${lastSubject}`;

        const recipientEmails = leadToProcess.emails?.length ? leadToProcess.emails : [leadToProcess.email];
        const uniqueRecipients = Array.from(new Set(recipientEmails.filter(Boolean)));

        const { error: sendError } = await supabase.functions.invoke("send-email", {
          body: {
            to: uniqueRecipients,
            subject,
            body: replyData.body,
            leadId: leadToProcess.id,
          },
        });

        if (sendError) {
          toast({ title: "❌ Erro ao enviar e-mail", description: `${leadToProcess.name}: ${sendError.message}`, variant: "destructive" });
        } else {
          toast({ title: "✅ Follow-up enviado", description: leadToProcess.name });
        }
      } catch (e: any) {
        console.error("Background follow-up error:", e);
        toast({ title: "❌ Erro no follow-up", description: `${leadToProcess.name}: ${e?.message}`, variant: "destructive" });
      }
  })();
  };

  // Generate WhatsApp message via AI
  const generateWhatsappMessage = async () => {
    if (!currentLead) return;
    setGeneratingWhatsapp(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-whatsapp-message", {
        body: {
          leadId: currentLead.id,
          context: currentLead.status === 'ganho'
            ? "Follow-up sobre pagamento, próximos passos, briefing ou contrato pendente"
            : currentLead.status === 'produzido'
            ? "Follow-up sobre entrega, pagamento pendente ou satisfação"
            : "Follow-up geral sobre o projeto/proposta",
        },
      });
      if (error) throw error;
      if (data?.message) {
        setWhatsappMessage(data.message);
      }
    } catch (e: any) {
      console.error("Error generating WhatsApp message:", e);
      toast({ title: "Erro ao gerar mensagem", variant: "destructive" });
    } finally {
      setGeneratingWhatsapp(false);
    }
  };

  // Send WhatsApp message (fire-and-forget)
  const sendWhatsappMessage = async () => {
    if (!currentLead || !whatsappMessage.trim()) return;
    const phone = currentLead.phones?.[0] || currentLead.phone;
    if (!phone) return;

    const leadToProcess = { ...currentLead };
    const msgToSend = whatsappMessage.trim();
    const indexToProcess = currentIndex;

    setSendingWhatsapp(true);
    setWhatsappMessage("");

    // Log action and advance immediately
    await supabase.from("worker_actions").insert({
      lead_id: leadToProcess.id,
      action_type: "followup_whatsapp",
      action_label: "WhatsApp enviado pelo Worker",
    });

    toast({ title: "WhatsApp na fila 💬", description: `Enviando para ${leadToProcess.name}...` });
    setDoneToday((prev) => prev + 1);

    // Move lead to end and advance
    setLeads((prev) => {
      const newLeads = [...prev];
      const [moved] = newLeads.splice(indexToProcess, 1);
      newLeads.push(moved);
      return newLeads;
    });
    setShowHistory(false);
    setSendingWhatsapp(false);

    // Send in background
    (async () => {
      try {
        const { error } = await supabase.functions.invoke("send-whatsapp-message", {
          body: { phone, message: msgToSend, leadId: leadToProcess.id },
        });
        if (error) {
          toast({ title: "❌ Erro ao enviar WhatsApp", description: `${leadToProcess.name}: ${error.message}`, variant: "destructive" });
        } else {
          toast({ title: "✅ WhatsApp enviado", description: leadToProcess.name });
        }
      } catch (e: any) {
        console.error("Background WhatsApp error:", e);
        toast({ title: "❌ Erro no WhatsApp", description: `${leadToProcess.name}: ${e?.message}`, variant: "destructive" });
      }
    })();
  };

  // Export to Tiffany (Financeiro) - same as "Exportar" in detail page
  const exportToFinanceiro = async () => {
    if (!currentLead) return;
    if (!currentLead.email && !currentLead.emails?.length) {
      toast({ title: "Sem e-mail cadastrado", description: "Não é possível exportar sem e-mail.", variant: "destructive" });
      return;
    }

    const leadToProcess = { ...currentLead };
    const indexToProcess = currentIndex;
    setExportingToFinanceiro(true);

    toast({ title: "Exportando para Financeiro 💰", description: leadToProcess.name });
    setDoneToday((prev) => prev + 1);

    setLeads((prev) => {
      const newLeads = [...prev];
      const [moved] = newLeads.splice(indexToProcess, 1);
      newLeads.push(moved);
      return newLeads;
    });
    setShowHistory(false);
    setExportingToFinanceiro(false);

    // Export in background
    (async () => {
      try {
        const [notesRes, emailsRes, whatsappRes] = await Promise.all([
          supabase.from("lead_notes").select("note").eq("lead_id", leadToProcess.id),
          supabase.from("email_messages").select("subject, message, direction").eq("lead_id", leadToProcess.id).order("timestamp", { ascending: false }).limit(20),
          supabase.from("whatsapp_messages").select("message, direction").eq("lead_id", leadToProcess.id).order("created_at", { ascending: false }).limit(20),
        ]);

        const notesText = (notesRes.data || []).map((n: any) => n.note).join('\n');
        const emailsText = (emailsRes.data || []).map((e: any) => `[${e.direction}] ${e.subject || ''}: ${e.message?.substring(0, 300) || ''}`).join('\n');
        const whatsappText = (whatsappRes.data || []).map((m: any) => `${m.direction === 'inbound' ? 'Cliente' : 'Nós'}: ${m.message || ''}`).join('\n');

        const allEmails = leadToProcess.emails?.length ? leadToProcess.emails : [leadToProcess.email].filter(Boolean);

        const context = `Lead: ${leadToProcess.name}
Emails: ${allEmails.join(', ')}
Telefones: ${leadToProcess.phones?.join(', ') || 'N/A'}
Produto: ${leadToProcess.produto || 'Não definido'}
Moeda: ${leadToProcess.moeda || 'BRL'}
Valor: ${leadToProcess.valor || 'N/A'}
Valor pago: ${leadToProcess.valor_pago || 0}
Status: ${leadToProcess.status}
Descrição: ${leadToProcess.description || 'N/A'}
delivery_date: ${leadToProcess.delivered_at || 'N/A'}
expected_payment_date: ${leadToProcess.data_proximo_pagamento || 'N/A'}
Origem: ${leadToProcess.origem || 'N/A'}

Notas:
${notesText || 'Nenhuma'}

Últimos emails:
${emailsText || 'Nenhum'}

Últimas mensagens WhatsApp:
${whatsappText || 'Nenhuma'}`;

        const { data, error } = await supabase.functions.invoke('generate-lead-export', {
          body: { context, leadName: leadToProcess.name, lead: leadToProcess }
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Erro ao exportar');

        await supabase.from("worker_actions").insert({
          lead_id: leadToProcess.id,
          action_type: "export_financeiro",
          action_label: "Enviado para Tiffany (Financeiro)",
        });
        await logDelivery(leadToProcess.id, 'tiffany');

        toast({ title: "✅ Enviado para Tiffany", description: leadToProcess.name });
      } catch (e: any) {
        console.error("Export error:", e);
        const msg = e?.message || '';
        toast({
          title: "❌ Erro ao exportar",
          description: msg.toLowerCase().includes('email') ? 'Sem e-mail cadastrado.' : (msg || 'Falha na exportação.'),
          variant: "destructive",
        });
      }
    })();
  };

  // Send to Sara (Operações) - create delivery via API
  const sendToSara = async () => {
    if (!currentLead) return;

    const leadToProcess = { ...currentLead };
    const indexToProcess = currentIndex;
    setSendingToSara(true);

    // Log action and advance immediately (UX otimista no Worker)
    await supabase.from("worker_actions").insert({
      lead_id: leadToProcess.id,
      action_type: "send_to_operations",
      action_label: "Enviado para Sara (Operações)",
    });

    toast({ title: "Enviando para Operações 📋", description: `Criando entrega para ${leadToProcess.name}...` });
    setDoneToday((prev) => prev + 1);

    setLeads((prev) => {
      const newLeads = [...prev];
      const [moved] = newLeads.splice(indexToProcess, 1);
      newLeads.push(moved);
      return newLeads;
    });
    setShowHistory(false);
    setSendingToSara(false);

    // Create delivery in background — só grava delivery_log se a API externa confirmar
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("create-delivery", {
          body: { leadId: leadToProcess.id },
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Erro ao criar entrega');

        await logDelivery(leadToProcess.id, 'sara');
        toast({ title: "✅ Entrega criada", description: `${leadToProcess.name} enviado para Sara` });
      } catch (e: any) {
        console.error("Create delivery error:", e);
        toast({ title: "❌ Erro ao criar entrega", description: e?.message || "Falha", variant: "destructive" });
      }
    })();
  };


  // Quick status change
  const changeStatus = async (newStatus: LeadStatus) => {
    if (!currentLead) return;
    setChangingStatus(newStatus);
    try {
      const updateData = buildStatusUpdateData(newStatus, { negociacao_at: null, status: currentLead.status });
      const { error } = await supabase.from("leads").update(updateData).eq("id", currentLead.id);
      if (error) throw error;

      // Also log as worker action
      const statusLabel = STATUS_LABELS[newStatus] || newStatus;
      await supabase.from("worker_actions").insert({
        lead_id: currentLead.id,
        action_type: "update_status",
        action_label: `Marcou como ${statusLabel}`,
      });

      toast({ title: `Lead marcado como ${statusLabel} ✅` });
      setDoneToday((prev) => prev + 1);

      // Remove from list (entregue/perdido = no longer in worker queue)
      setTimeout(() => {
        setLeads((prev) => {
          const newLeads = [...prev];
          newLeads.splice(currentIndex, 1);
          return newLeads;
        });
        if (currentIndex >= leads.length - 1) {
          setCurrentIndex(Math.max(0, currentIndex - 1));
        }
        setShowHistory(false);
      }, 600);
    } catch (e) {
      console.error("Error changing status:", e);
      toast({ title: "Erro ao mudar status", variant: "destructive" });
    } finally {
      setChangingStatus(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Carregando modo worker...</p>
        </div>
      </div>
    );
  }

  if (!leads.length) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Nenhum lead ativo encontrado</p>
          <Button onClick={() => navigate("/")} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
        </div>
      </div>
    );
  }



  // Mobile-compact lead info renderer
  const renderMobileLayout = () => {
    if (!currentLead) return null;

    const rawInbound = currentLead.last_inbound_message || lastMessages.inbound;
    const inboundAt = currentLead.last_inbound_message_at || lastMessages.inboundAt;
    const inboundMsg = rawInbound ? stripPlainTextQuotes(htmlToPlainText(extractNewEmailContent(rawInbound))) : null;

    const daysCreated = differenceInCalendarDays(new Date(), new Date(currentLead.created_at));
    const statusDateMap: Record<string, string | null> = {
      em_aberto: currentLead.reopened_at || currentLead.created_at,
      em_negociacao: currentLead.negociacao_at,
      ganho: currentLead.ganho_at,
      produzido: currentLead.produzido_at,
      entregue: currentLead.delivered_at,
      perdido: currentLead.perdido_at,
    };
    const statusEntryDate = statusDateMap[currentLead.status || 'em_aberto'];
    const daysInStatus = statusEntryDate ? differenceInCalendarDays(new Date(), new Date(statusEntryDate)) : null;

    return (
      <div className="flex flex-col h-full">
        {/* Lead identity - compact */}
        <div className="px-3 py-2 border-b shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
              {currentLead.profile_picture_url ? (
                <img src={currentLead.profile_picture_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-semibold text-muted-foreground">
                  {currentLead.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold truncate">{currentLead.name}</h2>
                <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[currentLead.status || "em_aberto"] || "bg-muted"}`}>
                  {STATUS_LABELS[currentLead.status || "em_aberto"]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {currentLead.produto && <span className="capitalize">{currentLead.produto}</span>}
                {currentLead.produto && currentLead.valor ? " · " : ""}
                {currentLead.valor ? formatCurrency(currentLead.valor, currentLead.moeda) : ""}
                {(currentLead.produto || currentLead.valor) ? " · " : ""}
                {daysCreated}d
                {currentLead.ai_close_probability != null && ` · ${currentLead.ai_close_probability}%`}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(`/opportunity/${currentLead.id}`, "_blank")}>
                <Briefcase className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-7 w-7"
                disabled={reprocessingAI}
                onClick={async () => {
                  if (!currentLead) return;
                  setReprocessingAI(true);
                  try {
                    await supabase.functions.invoke("generate-lead-description", { body: { leadId: currentLead.id } });
                    await supabase.functions.invoke("diagnose-leads", { body: { leadIds: [currentLead.id] } });
                    const { data: updated } = await supabase.from("leads").select("*").eq("id", currentLead.id).single();
                    if (updated) setLeads(prev => prev.map(l => l.id === currentLead.id ? { ...l, ...updated } : l));
                    fetchSuggestions(updated || currentLead);
                    toast({ title: "Diagnóstico atualizado 🧠" });
                  } catch { toast({ title: "Erro ao reprocessar", variant: "destructive" }); }
                  finally { setReprocessingAI(false); }
                }}
              >
                {reprocessingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* AI diagnosis + description - compact scrollable area */}
        <div className="px-3 py-2 space-y-1.5 shrink-0 max-h-[30vh] overflow-y-auto">
          {currentLead.ai_diagnosis_reason && currentLead.ai_close_probability != null && (
            <div className={`rounded-md p-2 border text-xs ${
              (currentLead.ai_close_probability || 0) >= 60 ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
              : (currentLead.ai_close_probability || 0) >= 40 ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800"
              : "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
            }`}>
              <p className="leading-relaxed line-clamp-2">{currentLead.ai_diagnosis_reason}</p>
            </div>
          )}

          {currentLead.ai_next_step && (
            <div className="bg-primary/5 border border-primary/10 rounded-md p-2">
              <p className="text-xs flex items-center gap-1 text-primary font-medium">
                <Sparkles className="h-3 w-3" /> {currentLead.ai_next_step}
              </p>
            </div>
          )}

          {currentLead.description && !currentLead.ai_diagnosis_reason && (
            <p className="text-xs text-muted-foreground line-clamp-2">{currentLead.description}</p>
          )}

          {inboundMsg && (
            <div className="border rounded-md p-2">
              <p className="text-[10px] text-muted-foreground">Última recebida {inboundAt && `· ${formatDistanceToNow(new Date(inboundAt), { addSuffix: true, locale: ptBR })}`}</p>
              <p className="text-xs truncate">{inboundMsg.substring(0, 80)}</p>
            </div>
          )}

          {currentLead.data_proximo_pagamento && (
            <div className={`flex items-center gap-1.5 text-xs rounded-md px-2 py-1.5 ${
              new Date(currentLead.data_proximo_pagamento) < new Date() ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-muted-foreground"
            }`}>
              <Calendar className="h-3 w-3 shrink-0" />
              Pagamento: {format(new Date(currentLead.data_proximo_pagamento), "dd/MM/yyyy")}
              {new Date(currentLead.data_proximo_pagamento) < new Date() && " ⚠️"}
            </div>
          )}
        </div>

        {/* AI suggested actions */}
        <div className="px-3 py-1.5 shrink-0">
          {loadingActions ? (
            <div className="space-y-1.5">
              {[1, 2].map(i => <Skeleton key={i} className="h-10 rounded-md" />)}
            </div>
          ) : (
            <div className="space-y-1.5">
              {visibleSuggestedActions.map((action, idx) => {
                const Icon = ACTION_ICONS[action.type] || Sparkles;
                const isCompleting = completingAction === action.type;
                return (
                  <button
                    key={`${action.type}-${idx}`}
                    onClick={() => completeAction(action)}
                    disabled={isCompleting}
                    className={`w-full text-left border rounded-md p-2.5 transition-all active:scale-[0.98] ${PRIORITY_COLORS[action.priority]}`}
                  >
                    <div className="flex items-center gap-2">
                      {isCompleting ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <Icon className="h-4 w-4 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{action.label}</p>
                        <p className="text-[10px] opacity-70 truncate">{action.reasoning}</p>
                      </div>
                      <CheckCircle className="h-3.5 w-3.5 shrink-0 opacity-30" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* More actions button */}
        <div className="px-3 py-1 shrink-0">
          <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => setShowMoreActions(true)}>
            <Zap className="h-3 w-3 mr-1" /> Mais ações (email, WhatsApp, equipe...)
          </Button>
        </div>

        {/* Status buttons + Skip - pinned to bottom */}
        <div className="mt-auto px-3 py-2 border-t shrink-0">
          <div className={`grid gap-1.5 ${currentLead.status === "em_aberto" ? "grid-cols-4" : "grid-cols-3"}`}>
            {currentLead.status === "em_aberto" ? (
              <>
                <Button size="default" className="text-xs h-12 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold" onClick={() => changeStatus("em_negociacao")} disabled={!!changingStatus}>
                  {changingStatus === "em_negociacao" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ArrowRight className="h-4 w-4" /><span className="hidden min-[380px]:inline ml-1">Negoc.</span></>}
                </Button>
                <Button size="default" className="text-xs h-12 bg-green-600 hover:bg-green-700 text-white font-semibold" onClick={() => changeStatus("ganho")} disabled={!!changingStatus}>
                  {changingStatus === "ganho" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4" /><span className="hidden min-[380px]:inline ml-1">Ganho</span></>}
                </Button>
                <Button size="default" className="text-xs h-12 bg-red-600 hover:bg-red-700 text-white font-semibold" onClick={() => changeStatus("perdido")} disabled={!!changingStatus}>
                  {changingStatus === "perdido" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="h-4 w-4" /><span className="hidden min-[380px]:inline ml-1">Perdido</span></>}
                </Button>
              </>
            ) : currentLead.status === "em_negociacao" ? (
              <>
                <Button size="default" className="text-xs h-12 bg-green-600 hover:bg-green-700 text-white font-semibold" onClick={() => changeStatus("ganho")} disabled={!!changingStatus}>
                  {changingStatus === "ganho" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4 mr-1" />Ganho</>}
                </Button>
                <Button size="default" className="text-xs h-12 bg-red-600 hover:bg-red-700 text-white font-semibold" onClick={() => changeStatus("perdido")} disabled={!!changingStatus}>
                  {changingStatus === "perdido" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="h-4 w-4 mr-1" />Perdido</>}
                </Button>
              </>
            ) : (
              <>
                {currentLead.status !== "entregue" && (
                  <Button size="default" className="text-xs h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold" onClick={() => changeStatus("entregue")} disabled={!!changingStatus}>
                    {changingStatus === "entregue" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><PackageCheck className="h-4 w-4 mr-1" />Entregue</>}
                  </Button>
                )}
                {currentLead.status !== "perdido" && (
                  <Button size="default" className="text-xs h-12 bg-red-600 hover:bg-red-700 text-white font-semibold" onClick={() => changeStatus("perdido")} disabled={!!changingStatus}>
                    {changingStatus === "perdido" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="h-4 w-4 mr-1" />Perdido</>}
                  </Button>
                )}
              </>
            )}
            <Button size="default" className="text-xs h-12 bg-amber-500 hover:bg-amber-600 text-white font-semibold" onClick={skipLead} disabled={currentIndex >= leads.length - 1}>
              Pular <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>

        {/* More Actions Sheet (mobile) */}
        <Sheet open={showMoreActions} onOpenChange={setShowMoreActions}>
          <SheetContent side="bottom" className="max-h-[80vh] overflow-auto rounded-t-xl">
            <SheetHeader>
              <SheetTitle className="text-left text-sm">Ações — {currentLead.name}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-3">
              {/* Follow-up email */}
              {currentLead.email && (
                <Button variant="outline" size="default" className="w-full text-sm border-emerald-200 hover:bg-emerald-50" onClick={() => { executeFollowup(); setShowMoreActions(false); }} disabled={executingFollowup}>
                  {executingFollowup ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2 text-emerald-600" />}
                  Enviar Follow-up por E-mail
                </Button>
              )}

              {/* WhatsApp */}
              {(currentLead.phones?.[0] || currentLead.phone) && (
                <div className="border border-green-200 rounded-lg p-3 space-y-2 bg-green-50/30">
                  <p className="text-xs font-medium flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5 text-green-600" /> WhatsApp</p>
                  <textarea
                    className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 min-h-[60px] resize-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Digite ou clique em Gerar..."
                    value={whatsappMessage}
                    onChange={(e) => setWhatsappMessage(e.target.value)}
                    disabled={sendingWhatsapp}
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 text-sm" onClick={generateWhatsappMessage} disabled={generatingWhatsapp || sendingWhatsapp}>
                      {generatingWhatsapp ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />} Gerar
                    </Button>
                    <Button size="sm" className="flex-1 text-sm bg-green-600 hover:bg-green-700 text-white" onClick={() => { sendWhatsappMessage(); setShowMoreActions(false); }} disabled={!whatsappMessage.trim() || sendingWhatsapp}>
                      {sendingWhatsapp ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />} Enviar
                    </Button>
                  </div>
                </div>
              )}

              {/* Team buttons */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col items-center gap-1">
                  <Button variant="outline" size="sm" className={`text-sm w-full ${lastSaraLog ? 'bg-blue-100 border-blue-400 text-blue-800' : 'border-blue-200 hover:bg-blue-50'}`} onClick={() => { handleSaraClick(); setShowMoreActions(false); }} disabled={sendingToSara}>
                    {sendingToSara ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Users className="h-4 w-4 mr-1 text-blue-600" />} Sara {lastSaraLog ? '✓' : ''}
                  </Button>
                  {lastSaraLog && <span className="text-[10px] text-blue-600">Enviado {format(new Date(lastSaraLog.sent_at), "dd/MM HH:mm")}</span>}
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Button variant="outline" size="sm" className={`text-sm w-full ${lastTiffanyLog ? 'bg-amber-100 border-amber-400 text-amber-800' : 'border-amber-200 hover:bg-amber-50'}`} onClick={() => { handleTiffanyClick(); setShowMoreActions(false); }} disabled={exportingToFinanceiro}>
                    {exportingToFinanceiro ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <DollarSign className="h-4 w-4 mr-1 text-amber-600" />} Tiffany {lastTiffanyLog ? '✓' : ''}
                  </Button>
                  {lastTiffanyLog && <span className="text-[10px] text-amber-600">Enviado {format(new Date(lastTiffanyLog.sent_at), "dd/MM HH:mm")}</span>}
                </div>
              </div>

              {/* Custom action */}
              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-xs font-medium text-muted-foreground mb-2"><PenLine className="h-3.5 w-3.5 inline mr-1" /> Nova ação feita</p>
                <div className="flex gap-2">
                  <Input placeholder="Descreva..." value={customActionText} onChange={(e) => setCustomActionText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && customActionText.trim()) { submitCustomAction(); setShowMoreActions(false); } }} disabled={submittingCustom} className="text-sm h-9" />
                  <Button size="sm" onClick={() => { submitCustomAction(); setShowMoreActions(false); }} disabled={!customActionText.trim() || submittingCustom} className="h-9">
                    {submittingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* History */}
              {actionHistory.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1"><History className="h-3.5 w-3.5 inline mr-1" /> Histórico ({actionHistory.length})</p>
                  <div className="space-y-1">
                    {actionHistory.slice(0, 5).map((action) => {
                      const Icon = ACTION_ICONS[action.action_type] || Sparkles;
                      return (
                        <div key={action.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30">
                          <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate">{action.action_label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  };

  // Desktop layout renderer (original)
  const renderDesktopLayout = () => (
    <div className="flex-1 min-h-0 overflow-hidden">
      <div className="max-w-7xl mx-auto p-4 h-full">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 h-full">
          {/* Lead Card */}
          {currentLead && (
            <Card className="overflow-hidden lg:col-span-3 h-full overflow-y-auto">
              <CardHeader className="pb-3">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {currentLead.profile_picture_url ? (
                      <img src={currentLead.profile_picture_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl font-semibold text-muted-foreground">
                        {currentLead.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold truncate">{currentLead.name}</h2>
                      <Badge className={`text-xs ${STATUS_COLORS[currentLead.status || "em_aberto"] || "bg-muted"}`}>
                        {STATUS_LABELS[currentLead.status || "em_aberto"] || currentLead.status}
                      </Badge>
                      {currentLead.is_recurring && (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-xs border-primary/30 text-primary gap-1 cursor-help">
                                <RefreshCw className="h-3 w-3" /> Recorrente
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              <p className="text-sm font-medium mb-1">Oportunidades anteriores</p>
                              {previousOpps.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Nenhuma anterior encontrada</p>
                              ) : (
                                <div className="space-y-1">
                                  {previousOpps.map((opp) => (
                                    <div key={opp.id} className="text-xs flex items-center gap-2">
                                      <span>{opp.delivered_at ? format(new Date(opp.delivered_at), "dd/MM/yy") : "—"}</span>
                                      <span className="capitalize">{opp.produto || "—"}</span>
                                      <span className="font-medium">{formatCurrency(opp.valor, opp.moeda)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {currentLead.email && (
                      <p className="text-sm text-muted-foreground truncate">{currentLead.email}</p>
                    )}
                    {currentLead.phone && (
                      <p className="text-sm text-muted-foreground truncate">{currentLead.phone}</p>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 pt-0">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-sm" onClick={() => window.open(`/opportunity/${currentLead.id}`, "_blank")}>
                    <Briefcase className="h-4 w-4 mr-2" /> Ver detalhes completos
                  </Button>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline" size="sm" disabled={reprocessingAI}
                          onClick={async () => {
                            if (!currentLead) return;
                            setReprocessingAI(true);
                            try {
                              const { error: descErr } = await supabase.functions.invoke("generate-lead-description", { body: { leadId: currentLead.id } });
                              if (descErr) console.error("Desc error:", descErr);
                              const { error: diagErr } = await supabase.functions.invoke("diagnose-leads", { body: { leadIds: [currentLead.id] } });
                              if (diagErr) console.error("Diag error:", diagErr);
                              const { data: updated } = await supabase.from("leads").select("*").eq("id", currentLead.id).single();
                              if (updated) setLeads(prev => prev.map(l => l.id === currentLead.id ? { ...l, ...updated } : l));
                              fetchSuggestions(updated || currentLead);
                              toast({ title: "Diagnóstico atualizado 🧠", description: `${currentLead.name} reprocessado com sucesso` });
                            } catch { toast({ title: "Erro ao reprocessar", variant: "destructive" }); }
                            finally { setReprocessingAI(false); }
                          }}
                        >
                          {reprocessingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Reprocessar diagnóstico, probabilidade e descrição</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {(() => {
                  const statusDateMap: Record<string, string | null> = {
                    em_aberto: currentLead.reopened_at || currentLead.created_at,
                    em_negociacao: currentLead.negociacao_at,
                    ganho: currentLead.ganho_at,
                    produzido: currentLead.produzido_at,
                    entregue: currentLead.delivered_at,
                    perdido: currentLead.perdido_at,
                  };
                  const statusEntryDate = statusDateMap[currentLead.status || 'em_aberto'];
                  const daysInStatus = statusEntryDate ? differenceInCalendarDays(new Date(), new Date(statusEntryDate)) : null;
                  const statusLabels: Record<string, string> = { em_aberto: "Aberto", em_negociacao: "Negoc.", ganho: "Ganho", produzido: "Produzido", entregue: "Entregue", perdido: "Perdido" };
                  const totalEmails = (currentLead.email_inbound_count || 0) + (currentLead.email_outbound_count || 0);
                  const totalWhatsapp = (currentLead.whatsapp_inbound_count || 0) + (currentLead.whatsapp_outbound_count || 0);
                  const daysCreated = differenceInCalendarDays(new Date(), new Date(currentLead.created_at));
                  const metrics = [
                    { label: "Valor", value: formatCurrency(currentLead.valor, currentLead.moeda), show: true },
                    { label: "Produto", value: currentLead.produto || "—", show: true, capitalize: true },
                    { label: "Prob.", value: currentLead.ai_close_probability != null ? `${currentLead.ai_close_probability}%` : null, show: currentLead.ai_close_probability != null, color: (currentLead.ai_close_probability || 0) >= 60 ? "text-green-600" : (currentLead.ai_close_probability || 0) >= 40 ? "text-yellow-600" : "text-red-600" },
                    { label: "Pago", value: currentLead.valor_pago ? formatCurrency(currentLead.valor_pago, currentLead.moeda) : null, show: !!currentLead.valor_pago },
                    { label: "Criado", value: `${daysCreated}d`, show: true, tooltip: format(new Date(currentLead.created_at), "dd/MM/yyyy") },
                    { label: statusLabels[currentLead.status || 'em_aberto'] || "Status", value: daysInStatus != null ? `${daysInStatus}d` : "—", show: true },
                    { label: "E-mail", value: totalEmails > 0 ? `${currentLead.email_inbound_count || 0}↓ ${currentLead.email_outbound_count || 0}↑` : null, show: totalEmails > 0 },
                    { label: "WhatsApp", value: totalWhatsapp > 0 ? `${currentLead.whatsapp_inbound_count || 0}↓ ${currentLead.whatsapp_outbound_count || 0}↑` : null, show: totalWhatsapp > 0 },
                  ].filter(m => m.show);
                  const cols = metrics.length >= 4 ? "grid-cols-4" : metrics.length === 3 ? "grid-cols-3" : "grid-cols-2";
                  return (
                    <div className={`grid ${cols} gap-2`}>
                      {metrics.map((m) => {
                        const content = (
                          <div key={m.label} className="bg-muted/50 rounded-lg p-2 text-center">
                            <p className="text-xs text-muted-foreground uppercase">{m.label}</p>
                            <p className={`text-sm font-bold truncate ${m.capitalize ? "capitalize" : ""} ${m.color || ""}`}>{m.value}</p>
                          </div>
                        );
                        if (m.tooltip) {
                          return <Tooltip key={m.label}><TooltipTrigger asChild>{content}</TooltipTrigger><TooltipContent><p>{m.tooltip}</p></TooltipContent></Tooltip>;
                        }
                        return content;
                      })}
                    </div>
                  );
                })()}

                {currentLead.data_proximo_pagamento && (
                  <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
                    new Date(currentLead.data_proximo_pagamento) < new Date() ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-muted-foreground"
                  }`}>
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span className="font-medium whitespace-nowrap">
                      Próx. pagamento: {format(new Date(currentLead.data_proximo_pagamento), "dd/MM/yyyy")}
                      {new Date(currentLead.data_proximo_pagamento) < new Date() && " ⚠️ Atrasado"}
                    </span>
                  </div>
                )}

                {currentLead.ai_diagnosis_reason && currentLead.ai_close_probability != null && (
                  <div className={`rounded-lg p-3 border ${
                    (currentLead.ai_close_probability || 0) >= 60 ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
                    : (currentLead.ai_close_probability || 0) >= 40 ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800"
                    : "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
                  }`}>
                    <p className="text-xs font-medium mb-1 flex items-center gap-1 text-muted-foreground">
                      <TrendingUp className="h-3.5 w-3.5" /> Prob. fechamento: {currentLead.ai_close_probability}%
                    </p>
                    <p className="text-sm leading-relaxed">{currentLead.ai_diagnosis_reason}</p>
                  </div>
                )}

                {currentLead.description && (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-sm leading-relaxed line-clamp-4">{currentLead.description}</p>
                  </div>
                )}

                {currentLead.ai_next_step && (
                  <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
                    <p className="text-xs text-primary font-medium mb-1 flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5" /> Próximo passo IA
                    </p>
                    <p className="text-sm">{currentLead.ai_next_step}</p>
                  </div>
                )}

                {(() => {
                  const rawInbound = currentLead.last_inbound_message || lastMessages.inbound;
                  const inboundAt = currentLead.last_inbound_message_at || lastMessages.inboundAt;
                  const rawOutbound = currentLead.last_outbound_message || lastMessages.outbound;
                  const outboundAt = currentLead.last_outbound_message_at || lastMessages.outboundAt;
                  const inboundMsg = rawInbound ? stripPlainTextQuotes(htmlToPlainText(extractNewEmailContent(rawInbound))) : null;
                  const outboundMsg = rawOutbound ? stripPlainTextQuotes(htmlToPlainText(extractNewEmailContent(rawOutbound))) : null;
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      {inboundMsg && (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="border rounded-lg p-2.5 cursor-help">
                                <p className="text-xs text-muted-foreground">Última recebida</p>
                                <p className="text-sm truncate">{inboundMsg.substring(0, 60)}</p>
                                {inboundAt && <p className="text-[10px] text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(inboundAt), { addSuffix: true, locale: ptBR })}</p>}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-sm max-h-48 overflow-y-auto">
                              <p className="text-sm whitespace-pre-wrap">{inboundMsg.length > 500 ? inboundMsg.substring(0, 500) + '…' : inboundMsg}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {outboundMsg && (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="border rounded-lg p-2.5 cursor-help">
                                <p className="text-xs text-muted-foreground">Última enviada</p>
                                <p className="text-sm truncate">{outboundMsg.substring(0, 60)}</p>
                                {outboundAt && <p className="text-[10px] text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(outboundAt), { addSuffix: true, locale: ptBR })}</p>}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-sm max-h-48 overflow-y-auto">
                              <p className="text-sm whitespace-pre-wrap">{outboundMsg.length > 500 ? outboundMsg.substring(0, 500) + '…' : outboundMsg}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  );
                })()}

                {currentLead.proposal_sent_at && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground truncate">
                    <FileText className="h-4 w-4 shrink-0" />
                    Proposta enviada {formatDistanceToNow(new Date(currentLead.proposal_sent_at), { addSuffix: true, locale: ptBR })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Actions panel */}
          <div className="lg:col-span-2 h-full flex flex-col gap-3">
            <div>
              <h3 className="text-base font-bold mb-2 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> Ações sugeridas
              </h3>
              {loadingActions ? (
                <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
              ) : (
                <div className="space-y-2">
                  {visibleSuggestedActions.map((action, idx) => {
                    const Icon = ACTION_ICONS[action.type] || Sparkles;
                    const isCompleting = completingAction === action.type;
                    return (
                      <button key={`${action.type}-${idx}`} onClick={() => completeAction(action)} disabled={isCompleting} className={`w-full text-left border rounded-lg p-3 transition-all hover:shadow-md active:scale-[0.98] ${PRIORITY_COLORS[action.priority]}`}>
                        <div className="flex items-center gap-3">
                          <div className="shrink-0">{isCompleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{action.label}</p>
                            <p className="text-xs opacity-70 truncate">{action.reasoning}</p>
                          </div>
                          <CheckCircle className="h-4 w-4 shrink-0 opacity-30" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {currentLead?.email && (
              <div>
                <h3 className="text-base font-bold mb-2 flex items-center gap-2"><Play className="h-5 w-5 text-emerald-600" /> Executar ação</h3>
                <Button variant="outline" size="default" className="w-full text-sm border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300" onClick={executeFollowup} disabled={executingFollowup}>
                  {executingFollowup ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2 text-emerald-600" />}
                  {executingFollowup ? "Gerando e enviando..." : "Enviar Follow-up por E-mail"}
                </Button>
              </div>
            )}

            {currentLead && (currentLead.phones?.[0] || currentLead.phone) && (
              <div>
                <h3 className="text-base font-bold mb-2 flex items-center gap-2"><MessageCircle className="h-5 w-5 text-green-600" /> WhatsApp</h3>
                <div className="border border-green-200 rounded-lg p-3 space-y-2 bg-green-50/30">
                  <textarea className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 min-h-[60px] resize-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Digite a mensagem ou clique em Gerar... (⌘+Enter para enviar)" value={whatsappMessage} onChange={(e) => setWhatsappMessage(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && whatsappMessage.trim() && !sendingWhatsapp) { e.preventDefault(); sendWhatsappMessage(); } }} disabled={sendingWhatsapp} />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 text-sm" onClick={generateWhatsappMessage} disabled={generatingWhatsapp || sendingWhatsapp}>
                      {generatingWhatsapp ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />} Gerar
                    </Button>
                    <Button size="sm" className="flex-1 text-sm bg-green-600 hover:bg-green-700 text-white" onClick={sendWhatsappMessage} disabled={!whatsappMessage.trim() || sendingWhatsapp}>
                      {sendingWhatsapp ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />} Enviar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col items-center gap-1">
                <Button variant="outline" size="sm" className={`text-sm w-full ${lastSaraLog ? 'bg-blue-100 border-blue-400 text-blue-800' : 'border-blue-200 hover:bg-blue-50 hover:border-blue-300'}`} onClick={handleSaraClick} disabled={sendingToSara}>
                  {sendingToSara ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Users className="h-4 w-4 mr-1 text-blue-600" />} Sara {lastSaraLog ? '✓' : '(Operações)'}
                </Button>
                {lastSaraLog && <span className="text-[10px] text-blue-600">Enviado {format(new Date(lastSaraLog.sent_at), "dd/MM HH:mm")}</span>}
              </div>
              <div className="flex flex-col items-center gap-1">
                <Button variant="outline" size="sm" className={`text-sm w-full ${lastTiffanyLog ? 'bg-amber-100 border-amber-400 text-amber-800' : 'border-amber-200 hover:bg-amber-50 hover:border-amber-300'}`} onClick={handleTiffanyClick} disabled={exportingToFinanceiro}>
                  {exportingToFinanceiro ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <DollarSign className="h-4 w-4 mr-1 text-amber-600" />} Tiffany {lastTiffanyLog ? '✓' : '(Financeiro)'}
                </Button>
                {lastTiffanyLog && <span className="text-[10px] text-amber-600">Enviado {format(new Date(lastTiffanyLog.sent_at), "dd/MM HH:mm")}</span>}
              </div>
            </div>

            <div className="border rounded-lg p-3 bg-muted/20">
              <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1"><PenLine className="h-4 w-4" /> Nova ação feita</p>
              <div className="flex gap-2">
                <Input placeholder="Descreva..." value={customActionText} onChange={(e) => setCustomActionText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && customActionText.trim()) submitCustomAction(); }} disabled={submittingCustom} className="text-sm h-9" />
                <Button size="sm" onClick={submitCustomAction} disabled={!customActionText.trim() || submittingCustom} className="h-9">
                  {submittingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div>
              <Button variant="ghost" size="sm" className="w-full text-sm h-9" onClick={() => setShowHistory(!showHistory)}>
                <History className="h-4 w-4 mr-1" /> Histórico ({actionHistory.length})
              </Button>
              {showHistory && actionHistory.length > 0 && (
                <div className="space-y-1 mt-2">
                  {actionHistory.slice(0, 3).map((action) => {
                    const Icon = ACTION_ICONS[action.action_type] || Sparkles;
                    return (
                      <div key={action.id} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/30">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate">{action.action_label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={`grid gap-2 mt-auto ${currentLead?.status === "em_aberto" ? "grid-cols-4" : "grid-cols-3"}`}>
              {currentLead?.status === "em_aberto" ? (
                <>
                  <Button size="lg" className="text-base h-16 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold" onClick={() => changeStatus("em_negociacao")} disabled={!!changingStatus}>
                    {changingStatus === "em_negociacao" ? <Loader2 className="h-5 w-5 animate-spin mr-1" /> : <ArrowRight className="h-5 w-5 mr-1" />} Negociação
                  </Button>
                  <Button size="lg" className="text-base h-16 bg-green-600 hover:bg-green-700 text-white font-semibold" onClick={() => changeStatus("ganho")} disabled={!!changingStatus}>
                    {changingStatus === "ganho" ? <Loader2 className="h-5 w-5 animate-spin mr-1" /> : <CheckCircle className="h-5 w-5 mr-1" />} Ganho
                  </Button>
                  <Button size="lg" className="text-base h-16 bg-red-600 hover:bg-red-700 text-white font-semibold" onClick={() => changeStatus("perdido")} disabled={!!changingStatus}>
                    {changingStatus === "perdido" ? <Loader2 className="h-5 w-5 animate-spin mr-1" /> : <XCircle className="h-5 w-5 mr-1" />} Perdido
                  </Button>
                </>
              ) : currentLead?.status === "em_negociacao" ? (
                <>
                  <Button size="lg" className="text-base h-16 bg-green-600 hover:bg-green-700 text-white font-semibold" onClick={() => changeStatus("ganho")} disabled={!!changingStatus}>
                    {changingStatus === "ganho" ? <Loader2 className="h-5 w-5 animate-spin mr-1" /> : <CheckCircle className="h-5 w-5 mr-1" />} Ganho
                  </Button>
                  <Button size="lg" className="text-base h-16 bg-red-600 hover:bg-red-700 text-white font-semibold" onClick={() => changeStatus("perdido")} disabled={!!changingStatus}>
                    {changingStatus === "perdido" ? <Loader2 className="h-5 w-5 animate-spin mr-1" /> : <XCircle className="h-5 w-5 mr-1" />} Perdido
                  </Button>
                </>
              ) : (
                <>
                  {currentLead?.status !== "entregue" && (
                    <Button size="lg" className="text-base h-16 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold" onClick={() => changeStatus("entregue")} disabled={!!changingStatus}>
                      {changingStatus === "entregue" ? <Loader2 className="h-5 w-5 animate-spin mr-1" /> : <PackageCheck className="h-5 w-5 mr-1" />} Entregue
                    </Button>
                  )}
                  {currentLead?.status !== "perdido" && (
                    <Button size="lg" className="text-base h-16 bg-red-600 hover:bg-red-700 text-white font-semibold" onClick={() => changeStatus("perdido")} disabled={!!changingStatus}>
                      {changingStatus === "perdido" ? <Loader2 className="h-5 w-5 animate-spin mr-1" /> : <XCircle className="h-5 w-5 mr-1" />} Perdido
                    </Button>
                  )}
                </>
              )}
              <Button size="lg" className="text-base h-16 bg-amber-500 hover:bg-amber-600 text-white font-semibold" onClick={skipLead} disabled={currentIndex >= leads.length - 1}>
                Pular (P) <ArrowRight className="h-5 w-5 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b bg-card px-3 py-2 lg:px-4 lg:py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 lg:gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 lg:h-9 lg:w-9" onClick={() => navigate("/")}>
            <X className="h-4 w-4 lg:h-5 lg:w-5" />
          </Button>
          <div>
            <h1 className="text-sm lg:text-base font-bold flex items-center gap-1.5">
              <Zap className="h-4 w-4 lg:h-5 lg:w-5 text-primary" /> Worker
            </h1>
            <p className="text-xs text-muted-foreground">
              {doneToday}/{initialTotal} ({initialTotal > 0 ? Math.round((doneToday / initialTotal) * 100) : 0}%) · <span className="text-primary font-medium">{leads.length} restam</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 w-7 p-0 lg:h-8 lg:w-8" onClick={goPrev} disabled={currentIndex === 0}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0 lg:h-8 lg:w-8" onClick={goNext} disabled={currentIndex >= leads.length - 1}>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content: mobile vs desktop */}
      <div className="flex-1 min-h-0 overflow-hidden lg:block hidden">
        {renderDesktopLayout()}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden lg:hidden flex flex-col">
        {renderMobileLayout()}
      </div>

      {/* Detail Sheet (desktop) */}
      <Sheet open={showDetail} onOpenChange={setShowDetail}>
        <SheetContent className="w-full sm:max-w-lg overflow-auto">
          <SheetHeader>
            <SheetTitle className="text-left">{currentLead?.name}</SheetTitle>
          </SheetHeader>
          {loadingDetail ? (
            <div className="space-y-3 mt-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
          ) : detailData && (
            <div className="space-y-4 mt-4">
              {currentLead?.ai_diagnosis && (
                <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
                  <p className="text-xs font-medium text-primary mb-1">Diagnóstico IA</p>
                  <p className="text-sm">{currentLead.ai_diagnosis}</p>
                  {currentLead.ai_diagnosis_reason && <p className="text-xs text-muted-foreground mt-1">{currentLead.ai_diagnosis_reason}</p>}
                </div>
              )}
              {detailData.notes.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">Notas ({detailData.notes.length})</h4>
                  <div className="space-y-2">
                    {detailData.notes.map((note, i) => (
                      <div key={i} className="bg-muted/30 rounded-lg p-2">
                        <p className="text-xs text-muted-foreground">{format(new Date(note.created_at), "dd/MM/yy HH:mm")}</p>
                        <p className="text-sm mt-1">{note.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {detailData.whatsapp.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2"><MessageCircle className="h-3 w-3 inline mr-1" />WhatsApp ({detailData.whatsapp.length})</h4>
                  <div className="space-y-1">
                    {detailData.whatsapp.map((msg, i) => (
                      <div key={i} className={`rounded-lg p-2 text-xs ${msg.direction === 'inbound' ? 'bg-muted/40' : 'bg-primary/5'}`}>
                        <p className="text-muted-foreground text-[10px]">{msg.direction === 'inbound' ? 'Cliente' : 'Miguel'} • {format(new Date(msg.timestamp || msg.created_at), "dd/MM HH:mm")}</p>
                        <p className="mt-0.5">{msg.message?.substring(0, 300) || "(sem texto)"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {detailData.emails.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2"><Mail className="h-3 w-3 inline mr-1" />Emails ({detailData.emails.length})</h4>
                  <div className="space-y-1">
                    {detailData.emails.map((email, i) => (
                      <div key={i} className={`rounded-lg p-2 text-xs ${email.direction === 'inbound' ? 'bg-muted/40' : 'bg-primary/5'}`}>
                        <p className="text-muted-foreground text-[10px]">{email.direction === 'inbound' ? 'Cliente' : 'Miguel'} • {format(new Date(email.timestamp), "dd/MM HH:mm")}</p>
                        {email.subject && <p className="font-medium mt-0.5">{email.subject}</p>}
                        <p className="mt-0.5">{email.message?.substring(0, 300) || "(sem conteúdo)"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {detailData.notes.length === 0 && detailData.whatsapp.length === 0 && detailData.emails.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum histórico encontrado para este lead.</p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      {/* Confirmation dialog for re-sending */}
      <Dialog open={!!confirmResend} onOpenChange={() => setConfirmResend(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enviar novamente?</DialogTitle>
            <DialogDescription>
              Este lead já foi enviado para {confirmResend === 'sara' ? 'Sara (Operações)' : 'Tiffany (Financeiro)'} em{' '}
              {confirmResend === 'sara' && lastSaraLog ? format(new Date(lastSaraLog.sent_at), "dd/MM/yyyy 'às' HH:mm") : ''}
              {confirmResend === 'tiffany' && lastTiffanyLog ? format(new Date(lastTiffanyLog.sent_at), "dd/MM/yyyy 'às' HH:mm") : ''}.
              Tem certeza que deseja enviar novamente?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmResend(null)}>Cancelar</Button>
            <Button onClick={() => {
              const dest = confirmResend;
              setConfirmResend(null);
              if (dest === 'sara') sendToSara();
              else exportToFinanceiro();
            }}>Sim, enviar novamente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkerMode;
