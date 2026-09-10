import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { migrateLeadChildren } from "@/lib/mergeLeadChildren";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Calendar, MessageSquare, ChevronRight, ArrowLeft, Edit2, Save, X, Phone, Archive, CheckSquare, Sparkles, Plus, ArrowUpDown, Clock, CalendarDays, MessageCircle, Mic, Send, ChevronDown, CheckCircle, XCircle, StickyNote, RefreshCw, FileText, Share2, Layers, TrendingUp, Copy, MoreHorizontal, Zap, Paperclip } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import DOMPurify from "dompurify";
import { LeadCard } from "@/components/LeadCard";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatEmailHtml, htmlToPlainText, plainTextToHtml } from "@/lib/emailUtils";
import { useDebounce } from "@/hooks/use-debounce";
import { useLeadsCache } from "@/hooks/use-leads-cache";
import { buildStatusUpdateData, LeadStatus } from "@/lib/leadStatusUtils";
import { computeLeadPriority } from "@/lib/leadPriority";
import { EmailThreadList } from "@/components/EmailThreadList";
import {
  getPhoneVariants as sharedGetPhoneVariants,
  getLeadPhoneVariants as sharedGetLeadPhoneVariants,
  whatsappMessageMatchesPhone as sharedWhatsappMessageMatchesPhone,
  whatsappMessageMatchesLead as sharedWhatsappMessageMatchesLead,
} from "@/lib/whatsappPhone";

interface Lead {
  id: string;
  name: string;
  email: string;
  emails?: string[];
  phone?: string | null;
  phones?: string[];
  message: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
  archived?: boolean;
  unclassified?: boolean;
  email_count?: number;
  email_inbound_count?: number;
  email_outbound_count?: number;
  whatsapp_inbound_count?: number;
  whatsapp_outbound_count?: number;
  last_interaction?: string;
  last_inbound_message?: string;
  last_interaction_direction?: 'inbound' | 'outbound';
  description?: string | null;
  description_updated_at?: string | null;
  valor?: number | null;
  moeda?: 'BRL' | 'USD' | 'EUR' | null;
  produto?: 'palestra' | 'consultoria' | 'mentoria' | 'treinamento' | 'publicidade' | 'documentario' | null;
  publicidade_subtipo?: string | null;
  publicidade_quantidade?: number | null;
  status?: 'em_aberto' | 'em_negociacao' | 'ganho' | 'perdido' | 'entregue' | 'produzido' | null;
  suggested_followup?: string | null;
  valor_manually_edited?: boolean | null;
  is_recurring?: boolean | null;
  delivered_at?: string | null;
  profile_picture_url?: string | null;
  valor_pago?: number | null;
  data_proximo_pagamento?: string | null;
  proposal_url?: string | null;
  proposal_sent_at?: string | null;
  proposal_view_count?: number | null;
  proposal_last_viewed_at?: string | null;
  reopened_at?: string | null;
  // Campos de diagnóstico IA
  ai_diagnosis?: string | null;
  ai_close_probability?: number | null;
  ai_next_step?: string | null;
  ai_diagnosis_reason?: string | null;
  ai_diagnosis_updated_at?: string | null;
  // Timestamps de status
  ganho_at?: string | null;
  perdido_at?: string | null;
  produzido_at?: string | null;
  negociacao_at?: string | null;
  // Cached last messages (from DB columns)
  last_inbound_message_text?: string | null;
  last_inbound_message_at?: string | null;
  last_outbound_message_text?: string | null;
  last_outbound_message_at?: string | null;
  // Scheduled follow-up
  scheduled_followup_status?: string | null;
  language?: string | null;
}

interface EmailMessage {
  id: string;
  lead_id?: string;
  subject?: string;
  message: string | null;
  html_body?: string;
  direction: 'inbound' | 'outbound';
  timestamp: string;
  created_at: string;
  raw_data?: any;
}

interface EmailAttachment {
  id: string;
  email_message_id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  created_at: string;
}

interface WhatsAppMessage {
  id: string;
  lead_id?: string;
  phone: string;
  message: string | null;
  direction: 'inbound' | 'outbound';
  timestamp: string | null;
  created_at: string;
  is_audio?: boolean;
}

interface LeadNote {
  id: string;
  lead_id: string;
  note: string;
  created_at: string;
  updated_at: string;
}

interface LeadGroup {
  email: string;
  count: number;
  lastReceived: string;
  leadId: string;
}

// Types for lead card message data
interface LeadMessageData {
  lastInboundMessage: { message: string; date: string; type: 'email' | 'whatsapp' } | null;
  lastOutboundMessage: { message: string; date: string; type: 'email' | 'whatsapp' } | null;
  pendingResponse: boolean;
  previousOpportunities: Array<{id: string, delivered_at: string, valor: number | null, moeda: string, produto: string | null}>;
}

function getLastBusinessDayOfMonth(): string {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dayOfWeek = lastDay.getDay();
  if (dayOfWeek === 6) lastDay.setDate(lastDay.getDate() - 1); // sábado → sexta
  if (dayOfWeek === 0) lastDay.setDate(lastDay.getDate() - 2); // domingo → sexta
  return lastDay.toISOString().split('T')[0];
}

const Opportunities = () => {
  
  const navigateToWorker = useNavigate();
  const viewMode = 'opportunities'; // Fixo para esta página
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Initialize filters from URL params
  const getInitialStatusFilter = (): 'all' | 'em_aberto' | 'em_negociacao' | 'ganho' | 'ganho_produzido' | 'produzido' | 'perdido' | 'entregue' => {
    const param = searchParams.get('status');
    if (param && ['all', 'em_aberto', 'em_negociacao', 'ganho', 'ganho_produzido', 'produzido', 'perdido', 'entregue'].includes(param)) {
      return param as 'all' | 'em_aberto' | 'em_negociacao' | 'ganho' | 'ganho_produzido' | 'produzido' | 'perdido' | 'entregue';
    }
    return 'em_aberto';
  };

  const getInitialProdutoFilter = (): 'all' | 'publicidade' | 'palestra' | 'consultoria' | 'palestra_consultoria' | 'documentario' => {
    const param = searchParams.get('produto');
    if (param && ['all', 'publicidade', 'palestra', 'consultoria', 'palestra_consultoria', 'documentario'].includes(param)) {
      return param as 'all' | 'publicidade' | 'palestra' | 'consultoria' | 'palestra_consultoria' | 'documentario';
    }
    return 'all';
  };

  const getInitialSortType = (): 'priority' | 'recent-message' | 'recent-inbound' | 'newest' | 'oldest' | 'no-response' | 'probability' => {
    const param = searchParams.get('sort');
    if (param && ['priority', 'recent-message', 'recent-inbound', 'newest', 'oldest', 'no-response', 'probability'].includes(param)) {
      return param as 'priority' | 'recent-message' | 'recent-inbound' | 'newest' | 'oldest' | 'no-response' | 'probability';
    }
    return 'priority';
  };
  
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasFetched, setHasFetched] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  
  // Data for LeadCard message display
  const [leadMessageData, setLeadMessageData] = useState<Record<string, LeadMessageData>>({});
  const [deliveryLogsMap, setDeliveryLogsMap] = useState<Record<string, Array<{ destination: string; sent_at: string }>>>({});
  
  const [editingLead, setEditingLead] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editEmails, setEditEmails] = useState<string[]>([]);
  const [editPhones, setEditPhones] = useState<string[]>([]);
  const [editPhone, setEditPhone] = useState('');
  const [whatsappMessages, setWhatsappMessages] = useState<WhatsAppMessage[]>([]);
  const [emailMessages, setEmailMessages] = useState<EmailMessage[]>([]);
  const [emailAttachments, setEmailAttachments] = useState<EmailAttachment[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState<string | null>(null);
  const [diagnosingLeadId, setDiagnosingLeadId] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importText, setImportText] = useState('');
  const [extractedData, setExtractedData] = useState<any>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractingImage, setExtractingImage] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editedData, setEditedData] = useState<any>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [extractingFile, setExtractingFile] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [showWhatsAppImportDialog, setShowWhatsAppImportDialog] = useState(false);
  const [whatsappImportText, setWhatsappImportText] = useState('');
  const [importingWhatsApp, setImportingWhatsApp] = useState(false);
  const [showDeleteWhatsAppDialog, setShowDeleteWhatsAppDialog] = useState(false);
  const [deletingWhatsApp, setDeletingWhatsApp] = useState(false);
  const [showSendWhatsAppDialog, setShowSendWhatsAppDialog] = useState(false);
  const [whatsappContext, setWhatsappContext] = useState('');
  const [generatedWhatsAppMessage, setGeneratedWhatsAppMessage] = useState('');
  const [generatingWhatsApp, setGeneratingWhatsApp] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [editingProduto, setEditingProduto] = useState(false);
  const [editingValor, setEditingValor] = useState(false);
  const [editingValorPago, setEditingValorPago] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [tempProduto, setTempProduto] = useState<string>('');
  const [tempValor, setTempValor] = useState<string>('');
  const [tempValorPago, setTempValorPago] = useState<string>('');
  const [tempMoeda, setTempMoeda] = useState<'BRL' | 'USD' | 'EUR'>('BRL');
  const [tempStatus, setTempStatus] = useState<string>('');
  const [sortType, setSortType] = useState<'priority' | 'recent-message' | 'recent-inbound' | 'newest' | 'oldest' | 'no-response' | 'probability'>(getInitialSortType);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState<'all' | 'em_aberto' | 'em_negociacao' | 'ganho' | 'ganho_produzido' | 'produzido' | 'perdido' | 'entregue'>(getInitialStatusFilter);
  const [followupVencidoFilter, setFollowupVencidoFilter] = useState(searchParams.get('followup_vencido') === 'true');
  const [pendingResponseFilter, setPendingResponseFilter] = useState(searchParams.get('pending') === 'true');
  const [probFilter, setProbFilter] = useState<0 | 50 | 60 | 80>(() => {
    const p = parseInt(searchParams.get('prob') || '0');
    return ([50, 60, 80].includes(p) ? p : 0) as 0 | 50 | 60 | 80;
  });
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'p1' | 'p1p2'>(() => {
    const param = searchParams.get('prioridade');
    return (param === 'p1' || param === 'p1p2') ? param : 'all';
  });
  const [produtoFilter, setProdutoFilter] = useState<'all' | 'publicidade' | 'palestra' | 'consultoria' | 'palestra_consultoria' | 'documentario'>(getInitialProdutoFilter);
  const [publicidadeSubtipoFilter, setPublicidadeSubtipoFilter] = useState<'all' | 'longo' | 'curto' | 'insercao' | 'longo_curto' | 'linkedin' | 'newsletter'>(() => {
    const param = searchParams.get('pub_subtipo');
    return (param && ['longo', 'curto', 'insercao', 'longo_curto', 'linkedin', 'newsletter'].includes(param)) ? param as any : 'all';
  });
  const [moedaFilter, setMoedaFilter] = useState<'all' | 'BRL' | 'USD' | 'EUR'>(() => {
    const param = searchParams.get('moeda');
    return (param && ['BRL', 'USD', 'EUR'].includes(param)) ? param as 'BRL' | 'USD' | 'EUR' : 'all';
  });
  const [editableFollowup, setEditableFollowup] = useState<string>('');
  const [directMessage, setDirectMessage] = useState<string>('');
  const [sendingDirectMessage, setSendingDirectMessage] = useState(false);
  const directMessageInputRef = useRef<HTMLInputElement>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [showTotalizer, setShowTotalizer] = useState(true);
  const [previousOpportunities, setPreviousOpportunities] = useState<Array<{id: string, delivered_at: string, valor: number | null, moeda: string, produto: string | null}>>([]);
  const [activeTab, setActiveTab] = useState<'email' | 'whatsapp'>('email');
  const [activePhoneTab, setActivePhoneTab] = useState<string | null>(null);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingBulkEmails, setSendingBulkEmails] = useState(false);
  const [leadNotes, setLeadNotes] = useState<LeadNote[]>([]);
  const [showAddNoteDialog, setShowAddNoteDialog] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [showProposalEmailDialog, setShowProposalEmailDialog] = useState(false);
  const [proposalEmailSubject, setProposalEmailSubject] = useState('');
  const [proposalEmailBody, setProposalEmailBody] = useState('');
  const [generatingProposalEmail, setGeneratingProposalEmail] = useState(false);
  const [sendingProposalEmail, setSendingProposalEmail] = useState(false);
  const [showNewOpportunityDialog, setShowNewOpportunityDialog] = useState(false);
  const [pendingDeliveredLeadId, setPendingDeliveredLeadId] = useState<string | null>(null);
  const [creatingNewOpportunity, setCreatingNewOpportunity] = useState(false);
  const [isRunningAutoFollowups, setIsRunningAutoFollowups] = useState(false);
  const [autoFollowupProgress, setAutoFollowupProgress] = useState<{
    total: number;
    current: number;
    currentLead: string;
    sent: number;
    skipped: number;
    errors: number;
    done: boolean;
    results: Array<{ lead: string; status: string; reason?: string }>;
  } | null>(null);
  

  // Debug log para verificar mudanças no estado
  useEffect(() => {
    console.log('showAddNoteDialog mudou para:', showAddNoteDialog);
  }, [showAddNoteDialog]);
  const { toast } = useToast();
  
  // Cache hook
  const { 
    cachedLeads, 
    cacheLoaded, 
    saveCache, 
    updateLeadInCache, 
    removeLeadFromCache,
    addLeadToCache 
  } = useLeadsCache();

  // Initialize from cache
  useEffect(() => {
    if (cacheLoaded && cachedLeads && cachedLeads.length > 0 && allLeads.length === 0) {
      console.log('[Opportunities] Inicializando do cache:', cachedLeads.length, 'leads');
      setAllLeads(cachedLeads);
      setLoading(false);
    }
  }, [cacheLoaded, cachedLeads]);

  // Sync filters with URL
  useEffect(() => {
    const params = new URLSearchParams();
    
    // Only add non-default values to URL
    if (statusFilter !== 'em_aberto') {
      params.set('status', statusFilter);
    }
    if (produtoFilter !== 'all') {
      params.set('produto', produtoFilter);
    }
    if (produtoFilter === 'publicidade' && publicidadeSubtipoFilter !== 'all') {
      params.set('pub_subtipo', publicidadeSubtipoFilter);
    }
    if (sortType !== 'priority') {
      params.set('sort', sortType);
    }
    if (pendingResponseFilter) {
      params.set('pending', 'true');
    }
    if (probFilter > 0) {
      params.set('prob', String(probFilter));
    }
    if (priorityFilter !== 'all') {
      params.set('prioridade', priorityFilter);
    }
    if (debouncedSearchQuery) {
      params.set('q', debouncedSearchQuery);
    }
    if (moedaFilter !== 'all') {
      params.set('moeda', moedaFilter);
    }
    
    // Update URL without causing navigation
    const newSearch = params.toString();
    const currentSearch = searchParams.toString();
    if (newSearch !== currentSearch) {
      setSearchParams(params, { replace: true });
    }
  }, [statusFilter, produtoFilter, publicidadeSubtipoFilter, sortType, pendingResponseFilter, probFilter, priorityFilter, debouncedSearchQuery, moedaFilter, setSearchParams]);

  const scrollWhatsappToBottom = () => {
    try {
      // Preferir o painel ativo dos Tabs
      const activePanel = document.querySelector('[role="tabpanel"][data-state="active"] [data-whatsapp-scroll]') as HTMLElement | null
        || document.querySelector('[data-whatsapp-scroll]') as HTMLElement | null;
      const viewport = activePanel?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    } catch (e) {
      console.error('scrollWhatsappToBottom error:', e);
    }
  };

  // Normalização de telefones para agrupamento: remove não dígitos e ignora prefixo 55
  const normalizePhoneNumber = (p: string) => {
    const digits = (p || '').toString().replace(/\D/g, '');
    return digits.startsWith('55') ? digits.slice(2) : digits;
  };

  const uniqueNormalizedPhones = (phones?: string[]) => {
    if (!phones) return [] as string[];
    const set = new Set(phones.map(normalizePhoneNumber));
    return Array.from(set);
  };

  const getPhoneVariants = sharedGetPhoneVariants;

  const getLeadPhoneVariants = (lead?: Lead | null) =>
    new Set(sharedGetLeadPhoneVariants(lead || undefined));

  const whatsappMessageMatchesPhone = sharedWhatsappMessageMatchesPhone;

  const whatsappMessageMatchesLead = sharedWhatsappMessageMatchesLead;


  // Prioridade calculada por lead (lead scoring determinístico)
  const leadPriorities = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeLeadPriority>>();
    for (const lead of allLeads) {
      map.set(lead.id, computeLeadPriority(lead));
    }
    return map;
  }, [allLeads]);

  // Sort function moved here so it's available for useMemo
  const sortLeadGroups = (groups: LeadGroup[]) => {
    const sorted = [...groups];

    switch (sortType) {
      case 'priority': {
        return sorted.sort((a, b) => {
          const pA = leadPriorities.get(a.leadId);
          const pB = leadPriorities.get(b.leadId);
          const sA = pA?.score ?? -1;
          const sB = pB?.score ?? -1;
          if (sB !== sA) return sB - sA;
          // Empate: quem tem mensagem mais recente primeiro
          const leadA = allLeads.find(l => l.id === a.leadId);
          const leadB = allLeads.find(l => l.id === b.leadId);
          const tA = leadA?.last_interaction ? Date.parse(leadA.last_interaction) : 0;
          const tB = leadB?.last_interaction ? Date.parse(leadB.last_interaction) : 0;
          return tB - tA;
        });
      }

      case 'recent-message': {
        const toTime = (d?: string | null) => {
          const t = d ? Date.parse(d) : NaN;
          return Number.isNaN(t) ? -Infinity : t;
        };
        const lastMsgTime = (lead: any) => {
          return Math.max(
            toTime(lead?.last_inbound_message_at) ,
            toTime(lead?.last_outbound_message_at),
            toTime(lead?.last_inbound_message),
            toTime(lead?.last_interaction),
          );
        };

        return sorted.sort((a, b) => {
          const leadA = allLeads.find(l => l.id === a.leadId)!;
          const leadB = allLeads.find(l => l.id === b.leadId)!;
          return lastMsgTime(leadB) - lastMsgTime(leadA);
        });
      }
      
      case 'recent-inbound': {
        const toTime = (d?: string) => {
          const t = d ? Date.parse(d) : NaN;
          return Number.isNaN(t) ? -Infinity : t;
        };

        const withInbound = sorted.filter((g) => {
          const lead = allLeads.find(l => l.id === g.leadId);
          return !!lead?.last_inbound_message;
        });
        const withoutInbound = sorted.filter((g) => {
          const lead = allLeads.find(l => l.id === g.leadId);
          return !lead?.last_inbound_message;
        });

        withInbound.sort((a, b) => {
          const leadA = allLeads.find(l => l.id === a.leadId)!;
          const leadB = allLeads.find(l => l.id === b.leadId)!;
          const tA = toTime(leadA.last_inbound_message as string);
          const tB = toTime(leadB.last_inbound_message as string);
          if (tB !== tA) return tB - tA;
          const iA = toTime(leadA.last_interaction || leadA.updated_at);
          const iB = toTime(leadB.last_interaction || leadB.updated_at);
          return iB - iA;
        });

        withoutInbound.sort((a, b) => {
          const leadA = allLeads.find(l => l.id === a.leadId)!;
          const leadB = allLeads.find(l => l.id === b.leadId)!;
          const uA = toTime(leadA.updated_at);
          const uB = toTime(leadB.updated_at);
          return uB - uA;
        });

        return [...withInbound, ...withoutInbound];
      }
      
      case 'newest': {
        return sorted.sort((a, b) => {
          const leadA = allLeads.find(l => l.id === a.leadId);
          const leadB = allLeads.find(l => l.id === b.leadId);
          const dateA = leadA?.created_at ? new Date(leadA.created_at).getTime() : 0;
          const dateB = leadB?.created_at ? new Date(leadB.created_at).getTime() : 0;
          return dateB - dateA;
        });
      }
      
      case 'oldest': {
        return sorted.sort((a, b) => {
          const leadA = allLeads.find(l => l.id === a.leadId);
          const leadB = allLeads.find(l => l.id === b.leadId);
          const dateA = leadA?.created_at ? new Date(leadA.created_at).getTime() : 0;
          const dateB = leadB?.created_at ? new Date(leadB.created_at).getTime() : 0;
          return dateA - dateB;
        });
      }
      
      case 'no-response': {
        return sorted.sort((a, b) => {
          const leadA = allLeads.find(l => l.id === a.leadId);
          const leadB = allLeads.find(l => l.id === b.leadId);
          const dateA = leadA?.last_interaction ? new Date(leadA.last_interaction).getTime() : 0;
          const dateB = leadB?.last_interaction ? new Date(leadB.last_interaction).getTime() : 0;
          return dateA - dateB;
        });
      }
      
      case 'probability': {
        return sorted.sort((a, b) => {
          const leadA = allLeads.find(l => l.id === a.leadId);
          const leadB = allLeads.find(l => l.id === b.leadId);
          const probA = leadA?.ai_close_probability ?? -1;
          const probB = leadB?.ai_close_probability ?? -1;
          return probB - probA;
        });
      }
      
      default:
        return sorted;
    }
  };


  useEffect(() => {
    fetchLeads();
    fetchTotalCount();

    // Realtime: novos leads
    const leadsChannel = supabase
      .channel('leads-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'leads'
        },
        (payload) => {
          console.log('Novo lead recebido:', payload);
          const newLead = payload.new as Lead;
          setAllLeads((current) => [newLead, ...current]);
          addLeadToCache(newLead);
          fetchTotalCount();
          toast({
            title: 'Novo Email!',
            description: `Email de ${newLead.email} recebido`,
          });
        }
      )
      .subscribe();

    // Realtime: novas mensagens inbound (WhatsApp e Email)
    const messagesChannel = supabase
      .channel('messages-inbound')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' },
        (payload: any) => {
          if (payload?.new?.direction === 'inbound') {
            console.log('WhatsApp inbound recebido:', payload);
            const newMsg = payload.new;
            const leadId = newMsg.lead_id;
            if (leadId) {
              const now = newMsg.timestamp || newMsg.created_at || new Date().toISOString();
              const messageText = newMsg.message || '';
              // Atualizar lead diretamente no estado - incluindo campos de cache
              setAllLeads(leads => leads.map(l => 
                l.id === leadId ? { 
                  ...l, 
                  last_interaction: now,
                  last_inbound_message: now,
                  whatsapp_inbound_count: (l.whatsapp_inbound_count || 0) + 1,
                  // Update cached message columns
                  last_inbound_message_text: messageText,
                  last_inbound_message_at: now
                } : l
              ));
              // Atualizar cache
              updateLeadInCache(leadId, { 
                last_interaction: now, 
                last_inbound_message: now,
                last_inbound_message_text: messageText,
                last_inbound_message_at: now
              });
              // Atualizar leadMessageData
              setLeadMessageData(prev => ({
                ...prev,
                [leadId]: {
                  ...prev[leadId],
                  lastInboundMessage: {
                    message: messageText,
                    date: now,
                    type: 'whatsapp'
                  },
                  pendingResponse: true
                }
              }));
              toast({
                title: 'Nova mensagem WhatsApp!',
                description: `Mensagem recebida`,
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'email_messages' },
        (payload: any) => {
          if (payload?.new?.direction === 'inbound') {
            console.log('Email inbound recebido:', payload);
            const newMsg = payload.new;
            const leadId = newMsg.lead_id;
            if (leadId) {
              const now = newMsg.timestamp || new Date().toISOString();
              const messageText = newMsg.message || newMsg.html_body || '';
              // Atualizar lead diretamente no estado - incluindo campos de cache
              setAllLeads(leads => leads.map(l => 
                l.id === leadId ? { 
                  ...l, 
                  last_interaction: now,
                  last_inbound_message: now,
                  email_inbound_count: (l.email_inbound_count || 0) + 1,
                  // Update cached message columns
                  last_inbound_message_text: messageText,
                  last_inbound_message_at: now
                } : l
              ));
              // Atualizar cache
              updateLeadInCache(leadId, { 
                last_interaction: now, 
                last_inbound_message: now,
                last_inbound_message_text: messageText,
                last_inbound_message_at: now
              });
              // Atualizar leadMessageData
              setLeadMessageData(prev => ({
                ...prev,
                [leadId]: {
                  ...prev[leadId],
                  lastInboundMessage: {
                    message: messageText,
                    date: now,
                    type: 'email'
                  },
                  pendingResponse: true
                }
              }));
              toast({
                title: 'Novo email recebido!',
                description: `Email de ${newMsg.subject || 'sem assunto'}`,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [toast, viewMode, addLeadToCache, updateLeadInCache]);

  // Progressive rendering: show limited items, load more on scroll
  const INITIAL_VISIBLE = 20;
  const VISIBLE_INCREMENT = 20;
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  // Reset visible count when filters/search change
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [statusFilter, produtoFilter, publicidadeSubtipoFilter, sortType, debouncedSearchQuery, pendingResponseFilter, moedaFilter]);

  // Reset subtipo filter when leaving publicidade
  useEffect(() => {
    if (produtoFilter !== 'publicidade') {
      setPublicidadeSubtipoFilter('all');
    }
  }, [produtoFilter]);

  // Reset moeda filter and followup filter when status tab changes
  useEffect(() => {
    setMoedaFilter('all');
    setFollowupVencidoFilter(false);
  }, [statusFilter]);

  // Use useMemo for filtering instead of useEffect to avoid extra re-renders
  const leadGroups = useMemo(() => {
    const ignoredDomains = ['inventosdigitais.com.br', 'cloudmailin.net'];
    const isIgnored = (email: string) => email && ignoredDomains.some(d => email.toLowerCase().endsWith(`@${d}`));

    // Filtrar leads ignorados e criar grupos individuais
    let filteredLeads = allLeads.filter(lead => !isIgnored(lead.email));
    
    // Aplicar filtro de produto
    if (produtoFilter === 'publicidade') {
      filteredLeads = filteredLeads.filter(lead => lead.produto === 'publicidade');
      if (publicidadeSubtipoFilter !== 'all') {
        filteredLeads = filteredLeads.filter(lead => lead.publicidade_subtipo === publicidadeSubtipoFilter);
      }
    } else if (produtoFilter === 'palestra') {
      filteredLeads = filteredLeads.filter(lead => lead.produto === 'palestra');
    } else if (produtoFilter === 'consultoria') {
      filteredLeads = filteredLeads.filter(lead => lead.produto === 'consultoria');
    } else if (produtoFilter === 'palestra_consultoria') {
      filteredLeads = filteredLeads.filter(lead => 
        lead.produto === 'palestra' || lead.produto === 'consultoria'
      );
    } else if (produtoFilter === 'documentario') {
      filteredLeads = filteredLeads.filter(lead => lead.produto === 'documentario');
    }
    
    // Aplicar filtro de status sempre (mesmo com pesquisa)
    if (statusFilter === 'em_aberto') {
      filteredLeads = filteredLeads.filter(lead => 
        lead.status === 'em_aberto' || lead.status === null
      );
    } else if (statusFilter === 'ganho_produzido') {
      filteredLeads = filteredLeads.filter(lead => lead.status === 'ganho' || lead.status === 'produzido');
    } else if (statusFilter === 'ganho') {
      filteredLeads = filteredLeads.filter(lead => lead.status === 'ganho');
    } else if (statusFilter !== 'all') {
      filteredLeads = filteredLeads.filter(lead => lead.status === statusFilter);
    }
    
    // Aplicar filtro de follow-ups vencidos (só faz sentido em "em_aberto")
    if (followupVencidoFilter) {
      filteredLeads = filteredLeads.filter(lead => 
        lead.produto === 'publicidade' && 
        lead.scheduled_followup_status === 'completed'
      );
    }
    
    // Aplicar filtro de pendente de resposta
    if (pendingResponseFilter) {
      filteredLeads = filteredLeads.filter(lead => {
        const tInbound = lead.last_inbound_message ? Date.parse(lead.last_inbound_message as string) : NaN;
        const tInteraction = lead.last_interaction ? Date.parse(lead.last_interaction as string) : NaN;
        if (Number.isNaN(tInbound)) return false;
        if (Number.isNaN(tInteraction)) return true;
        return tInbound >= tInteraction;
      });
    }
    
    // Aplicar filtro de probabilidade mínima
    if (probFilter > 0) {
      filteredLeads = filteredLeads.filter(lead => (lead.ai_close_probability ?? 0) >= probFilter);
    }

    // Aplicar filtro de prioridade (lead scoring)
    if (priorityFilter !== 'all') {
      filteredLeads = filteredLeads.filter(lead => {
        const p = leadPriorities.get(lead.id);
        if (!p) return false;
        return priorityFilter === 'p1' ? p.tier === 1 : p.tier <= 2;
      });
    }
    
    // Aplicar filtro de moeda
    if (moedaFilter !== 'all') {
      filteredLeads = filteredLeads.filter(lead => {
        const leadMoeda = lead.moeda || 'BRL';
        return leadMoeda === moedaFilter;
      });
    }
    
    // Aplicar filtro de pesquisa usando debouncedSearchQuery
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      filteredLeads = filteredLeads.filter(lead => 
        lead.name?.toLowerCase().includes(query) ||
        lead.email?.toLowerCase().includes(query) ||
        lead.emails?.some(e => e.toLowerCase().includes(query)) ||
        lead.phone?.toLowerCase().includes(query) ||
        lead.phones?.some(p => p.toLowerCase().includes(query))
      );
    }
    
    // Para manter compatibilidade com a interface, criar um grupo por lead
    let groupsArray = filteredLeads.map(lead => ({
      email: lead.email || '',
      count: 1,
      lastReceived: lead.updated_at || lead.created_at,
      leadId: lead.id
    }));

    // Aplicar ordenação baseada no sortType
    groupsArray = sortLeadGroups(groupsArray);
    
    return groupsArray;
  }, [allLeads, sortType, debouncedSearchQuery, statusFilter, pendingResponseFilter, followupVencidoFilter, produtoFilter, publicidadeSubtipoFilter, probFilter, priorityFilter, leadPriorities, moedaFilter]);

  // Compute filtered count from memory instead of DB query
  const filteredCount = leadGroups.length;

  // Totalizador de valor em aberto (considera filtros ativos)
  const emAbertoTotal = useMemo(() => {
    const emAbertoLeads = allLeads.filter(lead => {
      const ignoredDomains = ['inventosdigitais.com.br', 'cloudmailin.net'];
      const isIgnored = (email: string) => email && ignoredDomains.some(d => email.toLowerCase().endsWith(`@${d}`));
      if (isIgnored(lead.email)) return false;
      if (lead.status !== 'em_aberto' && lead.status !== null) return false;
      if (lead.archived || lead.unclassified) return false;
      if (produtoFilter === 'publicidade' && lead.produto !== 'publicidade') return false;
      if (produtoFilter === 'palestra' && lead.produto !== 'palestra') return false;
      if (produtoFilter === 'consultoria' && lead.produto !== 'consultoria') return false;
      if (produtoFilter === 'palestra_consultoria' && lead.produto !== 'palestra' && lead.produto !== 'consultoria') return false;
      if (produtoFilter === 'documentario' && lead.produto !== 'documentario') return false;
      if (probFilter > 0 && (lead.ai_close_probability ?? 0) < probFilter) return false;
      return true;
    });
    const brl = emAbertoLeads.filter(l => !l.moeda || l.moeda === 'BRL').reduce((s, l) => s + (l.valor || 0), 0);
    const usd = emAbertoLeads.filter(l => l.moeda === 'USD').reduce((s, l) => s + (l.valor || 0), 0);
    const eur = emAbertoLeads.filter(l => l.moeda === 'EUR').reduce((s, l) => s + (l.valor || 0), 0);
    return { brl, usd, eur, count: emAbertoLeads.length };
  }, [allLeads, produtoFilter, probFilter]);

  // Totalizador de valor em negociação (considera filtros ativos, incluindo +80%)
  const negociacaoTotal = useMemo(() => {
    const negociacaoLeads = allLeads.filter(lead => {
      const ignoredDomains = ['inventosdigitais.com.br', 'cloudmailin.net'];
      const isIgnored = (email: string) => email && ignoredDomains.some(d => email.toLowerCase().endsWith(`@${d}`));
      if (isIgnored(lead.email)) return false;
      if (lead.status !== 'em_negociacao') return false;
      if (produtoFilter === 'publicidade' && lead.produto !== 'publicidade') return false;
      if (produtoFilter === 'palestra' && lead.produto !== 'palestra') return false;
      if (produtoFilter === 'consultoria' && lead.produto !== 'consultoria') return false;
      if (produtoFilter === 'palestra_consultoria' && lead.produto !== 'palestra' && lead.produto !== 'consultoria') return false;
      if (produtoFilter === 'documentario' && lead.produto !== 'documentario') return false;
      if (probFilter > 0 && (lead.ai_close_probability ?? 0) < probFilter) return false;
      return true;
    });
    const brl = negociacaoLeads.filter(l => !l.moeda || l.moeda === 'BRL').reduce((s, l) => s + (l.valor || 0), 0);
    const usd = negociacaoLeads.filter(l => l.moeda === 'USD').reduce((s, l) => s + (l.valor || 0), 0);
    const eur = negociacaoLeads.filter(l => l.moeda === 'EUR').reduce((s, l) => s + (l.valor || 0), 0);
    return { brl, usd, eur, count: negociacaoLeads.length };
  }, [allLeads, produtoFilter, probFilter]);

  // Visible lead groups (progressive rendering)
  const visibleLeadGroups = useMemo(() => {
    return leadGroups.slice(0, visibleCount);
  }, [leadGroups, visibleCount]);

  const hasMoreLeads = visibleCount < leadGroups.length;

  // Buscar mensagens WhatsApp e Email quando um lead é selecionado
  useEffect(() => {
    if (selectedLeadId) {
      const lead = allLeads.find(l => l.id === selectedLeadId);
      
      if (lead) {
        // Buscar mensagens de email
        fetchEmailMessages(lead.id);
        
        // Buscar mensagens WhatsApp pelo lead_id e por variações do telefone do cliente
        fetchWhatsAppMessages([lead.id], [lead.phone, ...(lead.phones || [])].filter(Boolean) as string[]);
        
        // Buscar notas do lead
        fetchLeadNotes(lead.id);
        
        // Inicializar o campo editável com a sugestão atual
        setEditableFollowup(lead.suggested_followup || '');
      }
    }
  }, [selectedLeadId, allLeads]);

  // Scroll para o topo quando uma oportunidade é selecionada
  useEffect(() => {
    if (selectedLeadId) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [selectedLeadId]);

  // Scroll automático para o final das mensagens do WhatsApp quando lista muda ou ao abrir a aba
  useEffect(() => {
    if (activeTab === 'whatsapp') {
      setTimeout(scrollWhatsappToBottom, 100);
    }
  }, [whatsappMessages, activeTab]);

  const fetchEmailMessages = async (leadId: string) => {
    try {
      const { data, error } = await supabase
        .from('email_messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('timestamp', { ascending: false });
      
      if (error) throw error;
      setEmailMessages((data || []).map(m => ({
        ...m,
        direction: m.direction as 'inbound' | 'outbound'
      })));

      // Fetch attachments for this lead
      const { data: attachmentsData, error: attachmentsError } = await supabase
        .from('email_attachments')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true });
      
      if (attachmentsError) {
        console.error('Error fetching attachments:', attachmentsError);
      } else {
        setEmailAttachments(attachmentsData || []);
      }
    } catch (error) {
      console.error('Erro ao buscar mensagens de email:', error);
    }
  };

  const fetchWhatsAppMessagesByPhones = async (phones: string[]) => {
    try {
      const phoneVariants = Array.from(new Set(phones.flatMap(getPhoneVariants)));
      if (phoneVariants.length === 0) {
        setWhatsappMessages([]);
        return;
      }

      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .in('phone', phoneVariants)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setWhatsappMessages((data || []).map(m => ({
        ...m,
        direction: m.direction as 'inbound' | 'outbound'
      })).sort((a, b) => new Date(b.timestamp || b.created_at).getTime() - new Date(a.timestamp || a.created_at).getTime()));
    } catch (error) {
      console.error('Erro ao buscar mensagens WhatsApp:', error);
    }
  };

  const fetchLeadNotes = async (leadId: string) => {
    try {
      const { data, error } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setLeadNotes(data || []);
    } catch (error) {
      console.error('Erro ao buscar notas:', error);
    }
  };

  const addLeadNote = async () => {
    if (!selectedLeadId || !newNoteText.trim()) {
      toast({
        title: 'Erro',
        description: 'Digite uma nota antes de salvar',
        variant: 'destructive',
      });
      return;
    }

    try {
      setAddingNote(true);
      
      const { data, error } = await supabase
        .from('lead_notes')
        .insert({
          lead_id: selectedLeadId,
          note: newNoteText.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      setLeadNotes([data, ...leadNotes]);
      setNewNoteText('');
      setShowAddNoteDialog(false);
      
      toast({
        title: 'Nota adicionada',
        description: 'A nota foi salva com sucesso',
      });
    } catch (error: any) {
      console.error('Erro ao adicionar nota:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao adicionar nota',
        variant: 'destructive',
      });
    } finally {
      setAddingNote(false);
    }
  };

  const fetchTotalCount = async () => {
    try {
      let query = supabase.from('leads').select('id', { count: 'exact', head: true });
      query = query.eq('archived', false).eq('unclassified', false);
      
      const { count, error } = await query;
      if (error) throw error;
      
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Erro ao buscar contagem total:', error);
    }
  };

  const fetchLeads = async () => {
    try {
      setLoading(true);

      let query = supabase.from('leads').select('*');
      
      // Filtrar baseado no modo de visualização - fixo como opportunities
      query = query.eq('archived', false).eq('unclassified', false);
      
      const { data, error } = await query
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const leads = data || [];

      if (leads.length === 0) {
        setAllLeads([]);
        setLoading(false);
        setHasFetched(true);
        return;
      }

      // Fetch scheduled followups for all leads
      const leadIds = leads.map(l => l.id);
      const { data: followups } = await supabase
        .from('scheduled_followups')
        .select('lead_id, next_run_at, status, attempt_number')
        .in('lead_id', leadIds);

      const followupMap = new Map<string, { next_run_at: string; status: string; attempt_number: number }>();
      followups?.forEach(f => followupMap.set(f.lead_id, f));

      // Map leads with all cached data from DB columns - no additional queries needed!
      const mappedLeads: Lead[] = leads.map(lead => {
        // Calculate last_interaction from cached timestamps
        const inboundAt = lead.last_inbound_message_at ? new Date(lead.last_inbound_message_at).getTime() : 0;
        const outboundAt = lead.last_outbound_message_at ? new Date(lead.last_outbound_message_at).getTime() : 0;
        const mostRecentTime = Math.max(inboundAt, outboundAt);
        const lastInteraction = mostRecentTime > 0 ? new Date(mostRecentTime).toISOString() : lead.updated_at;
        const lastInteractionDirection = inboundAt >= outboundAt && inboundAt > 0 ? 'inbound' : outboundAt > 0 ? 'outbound' : undefined;

        const followup = followupMap.get(lead.id);

        return {
          ...lead,
          produto: lead.produto as 'palestra' | 'consultoria' | 'mentoria' | 'treinamento' | 'publicidade' | 'documentario' | null,
          moeda: lead.moeda as 'BRL' | 'USD' | 'EUR' | null,
          status: lead.status as 'em_negociacao' | 'ganho' | 'perdido' | 'entregue' | null,
          // Use cached counts from DB
          email_count: (lead.email_inbound_count || 0) + (lead.email_outbound_count || 0),
          email_inbound_count: lead.email_inbound_count || 0,
          email_outbound_count: lead.email_outbound_count || 0,
          whatsapp_inbound_count: lead.whatsapp_inbound_count || 0,
          whatsapp_outbound_count: lead.whatsapp_outbound_count || 0,
          // Use cached message columns
          last_inbound_message_text: lead.last_inbound_message,
          last_inbound_message_at: lead.last_inbound_message_at,
          last_outbound_message_text: lead.last_outbound_message,
          last_outbound_message_at: lead.last_outbound_message_at,
          // Calculated interaction timestamps
          last_interaction: lastInteraction,
          last_inbound_message: lead.last_inbound_message_at,
          last_interaction_direction: lastInteractionDirection,
          // Scheduled follow-up data
          scheduled_followup_at: followup?.next_run_at || null,
          scheduled_followup_status: followup?.status || null,
          scheduled_followup_attempt: followup?.attempt_number || null,
        };
      });
      
      setAllLeads(mappedLeads);
      setLoading(false);
      setHasFetched(true);
      
      // Save basic lead data to cache
      saveCache(mappedLeads);

      // Load message data for LeadCard display (only for previousOpportunities now)
      await fetchLeadMessageData(mappedLeads);

      // Fetch delivery logs for all leads
      fetchDeliveryLogs();
    } catch (error) {
      console.error('Erro ao buscar leads:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os leads.",
        variant: "destructive",
      });
      setLoading(false);
      setHasFetched(true);
    }
  };

  // Fetch all delivery logs in bulk
  const fetchDeliveryLogs = async () => {
    try {
      const { data } = await supabase
        .from('delivery_logs')
        .select('lead_id, destination, sent_at, url')
        .order('sent_at', { ascending: false });
      
      if (data) {
        const map: Record<string, Array<{ destination: string; sent_at: string; url?: string | null }>> = {};
        for (const log of data as any) {
          if (!map[log.lead_id]) map[log.lead_id] = [];
          map[log.lead_id].push({ destination: log.destination, sent_at: log.sent_at, url: log.url });
        }
        setDeliveryLogsMap(map);
      }
    } catch (e) {
      console.error('Erro ao buscar delivery logs:', e);
    }
  };

  const handleSendToSara = async (leadId: string) => {
    const lead = allLeads.find(l => l.id === leadId);
    if (!lead) return;

    toast({ title: "Enviando para Sara 📋", description: `Criando entrega para ${lead.name}...` });

    try {
      const { data, error } = await supabase.functions.invoke('create-delivery', {
        body: { leadId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao criar entrega');

      // Só registra após sucesso real
      await supabase.from("delivery_logs").insert({ lead_id: leadId, destination: 'sara', url: data?.url || null } as any);
      setDeliveryLogsMap(prev => ({
        ...prev,
        [leadId]: [{ destination: 'sara', sent_at: new Date().toISOString(), url: data?.url || null }, ...(prev[leadId] || [])]
      }));
      toast({ title: '✅ Entrega criada', description: `${lead.name} enviado para Sara com sucesso.` });
    } catch (error: any) {
      console.error('Erro ao enviar para Sara:', error);
      toast({ title: '❌ Erro ao criar entrega', description: error?.message || 'Falha ao enviar para Sara.', variant: 'destructive' });
    }
  };


  const handleSendToTiffany = async (leadId: string) => {
    const lead = allLeads.find(l => l.id === leadId);
    if (!lead) return;

    try {
      toast({ title: "Exportando para Tiffany 💰", description: `Enviando ${lead.name}...` });
      
      const context = `Lead: ${lead.name}
Emails: ${lead.emails?.filter(e => !e.endsWith('@whatsapp.temp')).join(', ') || 'N/A'}
Telefones: ${lead.phones?.join(', ') || 'N/A'}
Produto: ${lead.produto || 'Não definido'}
Moeda: ${lead.moeda || 'BRL'}
Valor: ${lead.valor || 'N/A'}
Valor pago: ${lead.valor_pago || 0}
Status: ${lead.status}
Descrição: ${lead.description || 'N/A'}
delivery_date: ${lead.delivered_at || 'N/A'}
expected_payment_date: ${lead.data_proximo_pagamento || 'N/A'}`;

      const { data, error } = await supabase.functions.invoke('generate-lead-export', {
        body: { context, leadName: lead.name, lead }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao exportar');

      await supabase.from("delivery_logs").insert({ lead_id: leadId, destination: 'tiffany', url: data?.url || null } as any);
      setDeliveryLogsMap(prev => ({
        ...prev,
        [leadId]: [{ destination: 'tiffany', sent_at: new Date().toISOString(), url: data?.url || null }, ...(prev[leadId] || [])]
      }));
      toast({ title: 'Exportado ✅', description: 'Cliente enviado para Tiffany com sucesso.' });
    } catch (error: any) {
      console.error('Erro ao exportar:', error);
      toast({
        title: 'Erro ao exportar',
        description: error?.message || 'Não foi possível exportar.',
        variant: 'destructive',
      });
    }
  };

  // Build message data for LeadCard display - NOW USES CACHED DATA from leads table
  const buildLeadMessageData = useCallback((leads: Lead[], deliveredLeads: any[]) => {
    const messageData: Record<string, LeadMessageData> = {};
    
    for (const lead of leads) {
      // Use cached data from leads table columns
      const lastInboundMessage: LeadMessageData['lastInboundMessage'] = 
        lead.last_inbound_message_text && lead.last_inbound_message_at
          ? {
              message: lead.last_inbound_message_text,
              date: lead.last_inbound_message_at,
              type: 'whatsapp' // Default, will be refined if needed
            }
          : null;
      
      const lastOutboundMessage: LeadMessageData['lastOutboundMessage'] = 
        lead.last_outbound_message_text && lead.last_outbound_message_at
          ? {
              message: lead.last_outbound_message_text,
              date: lead.last_outbound_message_at,
              type: 'whatsapp' // Default, will be refined if needed
            }
          : null;
      
      const lastInboundTime = lead.last_inbound_message_at ? new Date(lead.last_inbound_message_at).getTime() : 0;
      const lastOutboundTime = lead.last_outbound_message_at ? new Date(lead.last_outbound_message_at).getTime() : 0;
      const pendingResponse = lastInboundTime > 0 && lastInboundTime > lastOutboundTime;
      
      let previousOpportunities: LeadMessageData['previousOpportunities'] = [];
      if (lead.is_recurring && deliveredLeads.length > 0) {
        const leadEmailsLower = (lead.emails || [lead.email]).map(e => e?.toLowerCase()).filter(Boolean);
        const leadPhones = lead.phones || (lead.phone ? [lead.phone] : []);
        const normalizedPhones = leadPhones.map(p => p?.replace(/\D/g, ''));
        
        previousOpportunities = deliveredLeads
          .filter(dl => {
            if (dl.id === lead.id) return false;
            const dlEmailsLower = (dl.emails || [dl.email]).map(e => e?.toLowerCase()).filter(Boolean);
            const dlPhones = dl.phones || [];
            const dlNormalizedPhones = dlPhones.map(p => p?.replace(/\D/g, ''));
            
            const emailMatch = leadEmailsLower.some(le => dlEmailsLower.includes(le));
            const phoneMatch = normalizedPhones.some(lp => dlNormalizedPhones.some(dp => dp?.includes(lp) || lp?.includes(dp)));
            
            return emailMatch || phoneMatch;
          })
          .map(dl => ({
            id: dl.id,
            delivered_at: dl.delivered_at || '',
            valor: dl.valor,
            moeda: dl.moeda || 'BRL',
            produto: dl.produto
          }));
      }
      
      messageData[lead.id] = {
        lastInboundMessage,
        lastOutboundMessage,
        pendingResponse,
        previousOpportunities
      };
    }
    
    return messageData;
  }, []);

  // Fetch message data for LeadCard display - NOW USES CACHED DATA
  const fetchLeadMessageData = async (leads: Lead[]) => {
    if (leads.length === 0) return;
    
    try {
      // Fetch delivered leads for recurring client previous opportunities (only query needed now)
      const deliveredLeadsResult = await supabase
        .from('leads')
        .select('id, name, email, emails, phones, delivered_at, valor, moeda, produto')
        .eq('status', 'entregue');
      
      const deliveredLeads = deliveredLeadsResult.data || [];
      
      // Build message data from cached lead columns - no more batch queries!
      const messageData = buildLeadMessageData(leads, deliveredLeads);
      setLeadMessageData(messageData);
      
      // Save basic lead data to cache (without message content)
      saveCache(leads);
    } catch (error) {
      console.error('Error fetching lead message data:', error);
    }
  };


  const getLeadsByEmail = (email: string) => {
    return allLeads.filter(lead => lead.email === email);
  };

  const fetchWhatsAppMessages = async (_leadIds: string[], phones: string[] = []) => {
    try {
      const phoneVariants = Array.from(new Set(phones.flatMap(getPhoneVariants)));
      if (phoneVariants.length === 0) return;

      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .in('phone', phoneVariants)
        .order('created_at', { ascending: false });
      if (error) throw error;

      setWhatsappMessages((data || []).map(m => ({
        ...m,
        direction: m.direction as 'inbound' | 'outbound'
      })).sort((a, b) => new Date(b.timestamp || b.created_at).getTime() - new Date(a.timestamp || a.created_at).getTime()));
    } catch (error) {
      console.error('Erro ao buscar mensagens WhatsApp:', error);
    }
  };

  const toggleLeadSelection = useCallback((leadId: string) => {
    setSelectedLeads(prev => {
      const newSet = new Set(prev);
      if (newSet.has(leadId)) {
        newSet.delete(leadId);
      } else {
        newSet.add(leadId);
      }
      return newSet;
    });
  }, []);

  const mergeLeads = async () => {
    if (selectedLeads.size < 2) {
      toast({
        title: 'Selecione pelo menos 2 leads',
        description: 'Você precisa selecionar 2 ou mais leads para mesclar.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setMerging(true);
      
      const leadsToMerge = allLeads.filter(l => selectedLeads.has(l.id));
      
      const allEmails = new Set<string>();
      const allPhones = new Set<string>();
      const realNames: string[] = [];
      let allMessages: string[] = [];
      
      // Verificar se algum lead está como "ganho"
      const wonLead = leadsToMerge.find(l => l.status === 'ganho');
      
      leadsToMerge.forEach(lead => {
        // Funções auxiliares de normalização
        const normEmail = (e?: string) => (e || '').trim().toLowerCase();
        const normPhone = (p?: string) => {
          const digits = (p || '').toString().replace(/\D/g, '');
          const local = digits.startsWith('55') ? digits.slice(2) : digits;
          return local ? `55${local}` : '';
        };

        // Coletar emails (removendo temporários e normalizando)
        if (lead.emails && lead.emails.length > 0) {
          lead.emails.forEach(e => {
            const v = normEmail(e);
            if (v) allEmails.add(v);
          });
        }
        if (lead.email) {
          const v = normEmail(lead.email);
          if (v) allEmails.add(v);
        }
        
        // Coletar telefones normalizados
        if (lead.phones && lead.phones.length > 0) {
          lead.phones.forEach(p => {
            const v = normPhone(p);
            if (v) allPhones.add(v);
          });
        }
        if (lead.phone) {
          const v = normPhone(lead.phone);
          if (v) allPhones.add(v);
        }
        
        // Coletar nomes reais (não números de telefone)
        if (lead.name && !/^\+?\d+$/.test(lead.name)) {
          realNames.push(lead.name);
        }
        
        if (lead.message) allMessages.push(lead.message);
      });
      
      // Concatenar nomes reais ou usar o primeiro disponível
      const mergedName = realNames.length > 0 
        ? realNames.join(' + ') 
        : leadsToMerge[0].name;
      
      const primaryLead = leadsToMerge[0];
      const emailsArray = Array.from(allEmails);
      const phonesArray = Array.from(allPhones);
      
      // Preparar dados para atualização
      const updateData: any = {
        name: mergedName,
        emails: emailsArray,
        phones: phonesArray,
        email: emailsArray.length > 0 ? emailsArray[0] : (primaryLead.email || ''),
        phone: phonesArray[0] || null,
        message: allMessages.join('\n\n---\n\n'),
        archived: false,
        unclassified: false
      };
      
      // Se algum lead está como "ganho", manter status e informações do lead ganho
      if (wonLead) {
        updateData.status = 'ganho';
        updateData.valor = wonLead.valor;
        updateData.moeda = wonLead.moeda;
        updateData.produto = wonLead.produto;
        updateData.description = wonLead.description;
      }
      
      const { error: updateError } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', primaryLead.id);
        
      if (updateError) throw updateError;
      
      const otherLeadIds = leadsToMerge.slice(1).map(l => l.id);
      
      // Migra TODOS os registros filhos (mensagens, notas, atividades, reuniões,
      // follow-ups, ações de worker, entregas e anexos) ANTES de deletar.
      await migrateLeadChildren(primaryLead.id, otherLeadIds, phonesArray);

      if (otherLeadIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('leads')
          .delete()
          .in('id', otherLeadIds);

        if (deleteError) {
          console.error('Erro ao deletar leads mesclados:', deleteError);
          throw deleteError;
        }
      }
      
      toast({
        title: 'Leads mesclados',
        description: `${leadsToMerge.length} leads foram mesclados com sucesso.`,
      });
      
      setSelectedLeads(new Set());
      await fetchLeads();
      
    } catch (error: any) {
      console.error('Erro ao mesclar leads:', error);
      toast({
        title: 'Erro ao mesclar',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setMerging(false);
    }
  };


  const handleArchiveSelected = async () => {
    try {
      const leadsToArchive = Array.from(selectedLeads);
      
      const { error } = await supabase
        .from("leads")
        .update({ archived: true })
        .in("id", leadsToArchive);

      if (error) throw error;

      toast({
        title: "Leads arquivados",
        description: `${leadsToArchive.length} lead(s) foram arquivados com sucesso.`,
      });

      setSelectedLeads(new Set());
      await fetchLeads();
    } catch (error) {
      console.error("Error archiving leads:", error);
      toast({
        title: "Erro",
        description: "Não foi possível arquivar os leads selecionados.",
        variant: "destructive",
      });
    }
  };

  const handleUnarchiveSelected = async () => {
    try {
      const leadsToUnarchive = Array.from(selectedLeads);
      
      const { error } = await supabase
        .from("leads")
        .update({ archived: false })
        .in("id", leadsToUnarchive);

      if (error) throw error;

      toast({
        title: "Leads desarquivados",
        description: `${leadsToUnarchive.length} lead(s) foram desarquivados com sucesso.`,
      });

      setSelectedLeads(new Set());
      await fetchLeads();
    } catch (error) {
      console.error("Error unarchiving leads:", error);
      toast({
        title: "Erro",
        description: "Não foi possível desarquivar os leads selecionados.",
        variant: "destructive",
      });
    }
  };

  const handleArchiveLead = useCallback(async (leadId: string) => {
    // Update otimista - remove da lista imediatamente
    const previousLeads = allLeads;
    setAllLeads(leads => leads.filter(l => l.id !== leadId));
    removeLeadFromCache(leadId);
    setSelectedLeadId(null);

    toast({
      title: "Lead arquivado",
      description: "O lead foi arquivado com sucesso.",
    });

    try {
      const { error } = await supabase
        .from("leads")
        .update({ archived: true })
        .eq("id", leadId);

      if (error) throw error;
    } catch (error) {
      // Reverter em caso de erro
      setAllLeads(previousLeads);
      console.error("Error archiving lead:", error);
      toast({
        title: "Erro",
        description: "Não foi possível arquivar o lead.",
        variant: "destructive",
      });
    }
  }, [allLeads, toast, removeLeadFromCache]);

  const handleSelectAll = () => {
    if (leadGroups.length === selectedLeads.size) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leadGroups.map(g => g.leadId)));
    }
  };

  const startEdit = (lead: Lead) => {
    setEditingLead(lead.id);
    setEditName(lead.name);
    setEditEmail(lead.email?.endsWith('@whatsapp.temp') ? '' : (lead.email || ''));
    setEditEmails(lead.emails?.filter(e => !e.endsWith('@whatsapp.temp')) || []);
    setEditPhones(lead.phones || (lead.phone ? [lead.phone] : []));
    setEditPhone(lead.phone || '');
  };

  const cancelEdit = () => {
    setEditingLead(null);
    setEditName('');
    setEditEmail('');
    setEditEmails([]);
    setEditPhones([]);
    setEditPhone('');
  };

  const removeEmail = (index: number) => {
    setEditEmails(prev => prev.filter((_, i) => i !== index));
  };

  const addEmail = () => {
    const newEmail = prompt('Digite o novo e-mail:');
    if (newEmail && newEmail.trim()) {
      setEditEmails(prev => [...prev, newEmail.trim()]);
    }
  };

  const removePhone = (index: number) => {
    setEditPhones(prev => prev.filter((_, i) => i !== index));
  };

  const addPhone = () => {
    const newPhone = prompt('Digite o novo telefone:');
    if (newPhone && newPhone.trim()) {
      setEditPhones(prev => [...prev, newPhone.trim()]);
    }
  };

  const saveEdit = async (leadId: string) => {
    try {
      const updateData: any = {
        name: editName,
        emails: editEmails.length > 0 ? editEmails : [],
        email: editEmails.length > 0 ? editEmails[0] : '',
        phones: editPhones,
        phone: editPhones[0] || null,
      };

      const { error } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', leadId);

      if (error) throw error;

      setAllLeads(prev => prev.map(l => 
        l.id === leadId ? { ...l, ...updateData } : l
      ));
      
      toast({
        title: 'Lead atualizado',
        description: 'Informações salvas com sucesso.',
      });
      
      cancelEdit();
    } catch (error: any) {
      console.error('Erro ao atualizar lead:', error);
      toast({
        title: 'Erro ao atualizar',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeAgo = (date: string) => {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 60) {
      return diffMinutes === 1 ? 'há 1 minuto' : `há ${diffMinutes} minutos`;
    } else if (diffHours < 24) {
      return diffHours === 1 ? 'há 1 hora' : `há ${diffHours} horas`;
    } else {
      return diffDays === 1 ? 'há 1 dia' : `há ${diffDays} dias`;
    }
  };

  const isOlderThanWeek = (date: string) => {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays > 7;
  };

  const generateDescription = async (leadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      setGeneratingDescription(leadId);
      
      const { data, error } = await supabase.functions.invoke('generate-lead-description', {
        body: { leadId }
      });

      if (error) throw error;

      toast({
        title: 'Descrição gerada',
        description: 'A descrição do lead foi gerada com sucesso.',
      });

      // Atualizar lead localmente
      setAllLeads(prev => prev.map(l => 
        l.id === leadId ? { 
          ...l, 
          description: data.description,
          valor: l.valor_manually_edited ? l.valor : data.valor,
          moeda: l.valor_manually_edited ? (l.moeda ?? null) : ((data.moeda as 'BRL' | 'USD' | 'EUR') ?? l.moeda ?? null),
          produto: data.produto ?? l.produto,
          publicidade_subtipo: data.publicidade_subtipo ?? l.publicidade_subtipo,
          publicidade_quantidade: data.publicidade_quantidade ?? l.publicidade_quantidade,
          suggested_followup: data.suggested_followup,
          description_updated_at: new Date().toISOString()
        } : l
      ));
      
      // Atualizar o campo editável de follow-up
      if (data.suggested_followup) {
        setEditableFollowup(data.suggested_followup);
      }
    } catch (error: any) {
      console.error('Erro ao gerar descrição:', error);
      toast({
        title: 'Erro ao gerar descrição',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setGeneratingDescription(null);
    }
  };

  const handleDiagnoseSingleLead = async (leadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      setDiagnosingLeadId(leadId);
      toast({
        title: 'Analisando lead...',
        description: 'Gerando descrição e diagnóstico completo com IA',
      });
      
      // Step 1: Generate description first
      try {
        await supabase.functions.invoke('generate-lead-description', {
          body: { leadId }
        });
      } catch (descError) {
        console.error('Erro ao gerar descrição (continuando com diagnóstico):', descError);
      }

      // Step 2: Run diagnosis
      const { data, error } = await supabase.functions.invoke('diagnose-leads', {
        body: { leadId }
      });
      
      if (error) throw error;
      
      const result = data?.results?.[0];
      if (result?.success) {
        toast({
          title: 'Diagnóstico concluído!',
          description: `Probabilidade de fechamento: ${result.probability}%`,
        });
        
        // Atualizar lead localmente com os novos dados
        const { data: updatedLead } = await supabase
          .from('leads')
          .select('*')
          .eq('id', leadId)
          .single();
        
        if (updatedLead) {
          setAllLeads(prev => prev.map(l => 
            l.id === leadId ? {
              ...l,
              ai_diagnosis: updatedLead.ai_diagnosis,
              ai_close_probability: updatedLead.ai_close_probability,
              ai_next_step: updatedLead.ai_next_step,
              ai_diagnosis_reason: updatedLead.ai_diagnosis_reason,
              ai_diagnosis_updated_at: updatedLead.ai_diagnosis_updated_at,
              description: updatedLead.description || l.description,
              suggested_followup: updatedLead.suggested_followup || l.suggested_followup,
              produto: (updatedLead.produto || l.produto) as Lead['produto'],
              publicidade_subtipo: updatedLead.publicidade_subtipo || l.publicidade_subtipo,
              publicidade_quantidade: updatedLead.publicidade_quantidade ?? l.publicidade_quantidade,
              valor: updatedLead.valor ?? l.valor,
              moeda: (updatedLead.moeda || l.moeda) as Lead['moeda'],
              description_updated_at: updatedLead.description_updated_at || l.description_updated_at,
            } : l
          ));
        }
      } else {
        throw new Error(result?.error || 'Erro ao processar diagnóstico');
      }
    } catch (error: any) {
      console.error('Erro no diagnóstico:', error);
      toast({
        title: 'Erro no diagnóstico',
        description: error.message || 'Erro ao executar diagnóstico IA',
        variant: 'destructive',
      });
    } finally {
      setDiagnosingLeadId(null);
    }
  };
  const generateMultipleDescriptions = async () => {
    const leadsToUpdate = Array.from(selectedLeads);
    let successCount = 0;
    let errorCount = 0;

    toast({
      title: 'Atualizando descrições',
      description: `Processando ${leadsToUpdate.length} lead(s)...`,
    });

    for (const leadId of leadsToUpdate) {
      try {
        setGeneratingDescription(leadId);
        
        const { data, error } = await supabase.functions.invoke('generate-lead-description', {
          body: { leadId }
        });

        if (error) throw error;

        // Atualizar lead localmente
        setAllLeads(prev => prev.map(l => 
          l.id === leadId ? { 
            ...l, 
            description: data.description,
            valor: l.valor_manually_edited ? l.valor : data.valor,
            moeda: l.valor_manually_edited ? (l.moeda ?? null) : ((data.moeda as 'BRL' | 'USD' | 'EUR') ?? l.moeda ?? null),
            produto: data.produto as 'palestra' | 'consultoria' | 'mentoria' | 'treinamento' | 'publicidade' | 'documentario' | null,
            description_updated_at: new Date().toISOString()
          } : l
        ));

        successCount++;
      } catch (error: any) {
        console.error('Erro ao gerar descrição:', error);
        errorCount++;
      }
    }

    setGeneratingDescription(null);

    toast({
      title: 'Atualização concluída',
      description: `${successCount} descrição(ões) gerada(s) com sucesso${errorCount > 0 ? `, ${errorCount} erro(s)` : ''}.`,
      variant: errorCount > 0 ? 'destructive' : 'default',
    });
  };

  const handleImagePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        try {
          setExtractingImage(true);
          
          // Convert to base64
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
          });
          reader.readAsDataURL(file);
          const imageBase64 = await base64Promise;

          toast({
            title: 'Processando imagem',
            description: 'Extraindo texto da imagem...',
          });

          const { data, error } = await supabase.functions.invoke('extract-image-text', {
            body: { imageBase64 }
          });

          if (error) throw error;

          if (data?.text) {
            setImportText(data.text);
            toast({
              title: 'Texto extraído',
              description: 'O texto foi extraído da imagem. Você pode editar antes de processar.',
            });
          } else {
            toast({
              title: 'Nenhum texto encontrado',
              description: 'Não foi possível extrair texto da imagem.',
              variant: 'destructive',
            });
          }
        } catch (error: any) {
          console.error('Erro ao extrair texto da imagem:', error);
          toast({
            title: 'Erro ao processar imagem',
            description: error.message || 'Tente novamente.',
            variant: 'destructive',
          });
        } finally {
          setExtractingImage(false);
        }
        return;
      }
    }
  };

  const handleImportFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so re-selecting same file works
    if (importFileInputRef.current) importFileInputRef.current.value = '';

    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    const isText = file.type.startsWith('text/') || file.type === 'application/json' || file.type === 'application/xml';

    if (!isPdf && !isImage && !isText) {
      toast({
        title: 'Tipo de arquivo não suportado',
        description: 'Envie um PDF, imagem ou arquivo de texto.',
        variant: 'destructive',
      });
      return;
    }

    setImportFile(file);

    try {
      setExtractingFile(true);
      let extracted = '';

      if (isText) {
        extracted = await file.text();
      } else {
        // PDF or image: send to AI extractor
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const dataUrl = await base64Promise;

        toast({
          title: isPdf ? 'Processando PDF' : 'Processando imagem',
          description: 'Extraindo texto com IA...',
        });

        const { data, error } = await supabase.functions.invoke('extract-image-text', {
          body: { fileBase64: dataUrl, mimeType: file.type }
        });
        if (error) throw error;
        extracted = data?.text || '';
      }

      if (!extracted.trim()) {
        toast({
          title: 'Nenhum texto encontrado',
          description: 'Não foi possível extrair texto do arquivo.',
          variant: 'destructive',
        });
        return;
      }

      // Append to importText (preserve any text already pasted)
      setImportText((prev) => {
        const header = `[Arquivo: ${file.name}]\n`;
        return prev.trim() ? `${prev.trim()}\n\n${header}${extracted}` : `${header}${extracted}`;
      });

      toast({
        title: 'Arquivo processado',
        description: `${extracted.length} caracteres extraídos. Clique em Processar para extrair os campos.`,
      });
    } catch (err: any) {
      console.error('Erro ao processar arquivo:', err);
      toast({
        title: 'Erro ao processar arquivo',
        description: err.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setExtractingFile(false);
    }
  };

  const handleExtractInfo = async () => {
    if (!importText.trim()) {
      toast({
        title: 'Erro',
        description: 'Por favor, cole um texto para importar.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setExtracting(true);
      
      const { data, error } = await supabase.functions.invoke('extract-lead-info', {
        body: { text: importText }
      });

      if (error) throw error;

      // Buscar possível cliente recorrente por nome similar
      let enriched = { ...data };
      const extractedName = (data?.name || '').trim();
      if (extractedName && extractedName.length >= 3) {
        // Pegar primeira palavra significativa do nome (ex: "LinkedIn", "Acme")
        const firstToken = extractedName
          .split(/[\s\-,–—|]+/)
          .find((t: string) => t.length >= 3 && !/^(empresa|cliente|ltda|inc|sa|s\.a\.|llc|gmbh)$/i.test(t)) || extractedName;
        
        const { data: similar } = await supabase
          .from('leads')
          .select('id, name, email, emails, phone, phones, status, created_at')
          .ilike('name', `%${firstToken}%`)
          .order('created_at', { ascending: false })
          .limit(5);

        if (similar && similar.length > 0) {
          // Pegar o mais recente como referência
          const ref = similar[0];
          // Auto-popular emails se vazios
          if ((!enriched.emails || enriched.emails.length === 0)) {
            const refEmails = (ref.emails && ref.emails.length > 0) ? ref.emails : (ref.email ? [ref.email] : []);
            if (refEmails.length > 0) enriched.emails = refEmails;
          }
          // Auto-popular telefones se vazios
          if ((!enriched.phones || enriched.phones.length === 0)) {
            const refPhones = (ref.phones && ref.phones.length > 0) ? ref.phones : (ref.phone ? [ref.phone] : []);
            if (refPhones.length > 0) enriched.phones = refPhones;
          }
          // Sugerir recorrência
          enriched.is_recurring = true;
          enriched.recurring_from_name = ref.name;
          enriched.recurring_from_id = ref.id;
          enriched.recurring_matches = similar.map((s: any) => ({ id: s.id, name: s.name }));
        }
      }

      setExtractedData(enriched);
      setEditedData(enriched);
    } catch (error: any) {
      console.error('Erro ao extrair informações:', error);
      toast({
        title: 'Erro ao processar texto',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setExtracting(false);
    }
  };

  const handleImportLead = async () => {
    if (!editedData) return;

    try {
      setImporting(true);

      // Determinar email principal (pode ser vazio se não houver)
      const primaryEmail = editedData.emails && editedData.emails.length > 0 
        ? editedData.emails[0] 
        : '';

      // Criar o lead com dados editados
      const { data: newLead, error } = await supabase
        .from('leads')
        .insert({
          name: editedData.name || 'Lead Importado',
          email: primaryEmail,
          emails: editedData.emails || [],
          phone: editedData.phones && editedData.phones.length > 0 ? editedData.phones[0] : null,
          phones: editedData.phones || [],
          description: editedData.description,
          valor: editedData.valor,
          moeda: editedData.moeda || (editedData.valor != null ? 'BRL' : null),
          produto: editedData.produto,
          origem: editedData.origem || null,
          is_recurring: editedData.is_recurring || false,
          description_updated_at: new Date().toISOString(),
          source: 'manual_import'
        })
        .select()
        .single();

      if (error) throw error;

      // Salvar o texto bruto da importação como nota
      if (newLead && importText.trim()) {
        await supabase
          .from('lead_notes')
          .insert({
            lead_id: newLead.id,
            note: `[Texto de Importação]\n\n${importText.trim()}`
          });
      }

      // Anexar arquivo (se houver) — fire and forget para não bloquear UX
      if (newLead && importFile) {
        const fd = new FormData();
        fd.append('file', importFile);
        fd.append('leadId', newLead.id);
        supabase.functions.invoke('process-lead-attachment', { body: fd }).catch((err) => {
          console.error('Erro ao anexar arquivo ao lead:', err);
        });
      }

      toast({
        title: 'Lead importado',
        description: importFile
          ? 'Lead criado. O arquivo está sendo anexado em segundo plano.'
          : 'O lead foi criado com sucesso.',
      });

      // Resetar estados e fechar dialog
      setShowImportDialog(false);
      setImportText('');
      setExtractedData(null);
      setEditedData(null);
      setImportFile(null);
      
      // Recarregar leads
      await fetchLeads();
    } catch (error: any) {
      console.error('Erro ao importar lead:', error);
      toast({
        title: 'Erro ao importar',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const importWhatsAppMessages = async () => {
    if (!whatsappImportText.trim() || !selectedLeadId) {
      toast({
        title: 'Erro',
        description: 'Cole as mensagens do WhatsApp para importar',
        variant: 'destructive',
      });
      return;
    }

    setImportingWhatsApp(true);
    try {
      const lead = allLeads.find(l => l.id === selectedLeadId);
      if (!lead) {
        throw new Error('Lead não encontrado');
      }

      const firstLead = lead;
      const phone = firstLead.phones?.[0] || firstLead.phone;
      
      if (!phone) {
        throw new Error('Lead não possui número de telefone');
      }

      console.log('Iniciando importação de mensagens...');
      
      const { data, error } = await supabase.functions.invoke('import-whatsapp-messages', {
        body: {
          text: whatsappImportText,
          leadId: firstLead.id,
          phone: phone
        }
      });

      console.log('Resposta da função:', { data, error });

      if (error) {
        console.error('Erro retornado:', error);
        throw error;
      }

      toast({
        title: 'Importação iniciada!',
        description: 'As mensagens estão sendo processadas em segundo plano. Elas aparecerão em alguns segundos.',
      });

      setShowWhatsAppImportDialog(false);
      setWhatsappImportText('');

      // Aguardar 3 segundos e recarregar mensagens
      setTimeout(async () => {
        console.log('Recarregando mensagens...');
        fetchWhatsAppMessages([firstLead.id], [phone, ...(firstLead.phones || [])].filter(Boolean) as string[]);
      }, 3000);
    } catch (error: any) {
      console.error('Erro ao importar mensagens:', error);
      toast({
        title: 'Erro ao importar',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setImportingWhatsApp(false);
    }
  };

  const deleteAllWhatsAppMessages = async () => {
    if (!selectedLeadId) return;

    setDeletingWhatsApp(true);
    try {
      const lead = allLeads.find(l => l.id === selectedLeadId);
      if (!lead) {
        throw new Error('Lead não encontrado');
      }

      const firstLead = lead;

      const { error } = await supabase
        .from('whatsapp_messages')
        .delete()
        .eq('lead_id', firstLead.id);

      if (error) throw error;

      toast({
        title: 'Mensagens apagadas',
        description: 'Todas as mensagens do WhatsApp foram apagadas com sucesso.',
      });

      setShowDeleteWhatsAppDialog(false);
      setWhatsappMessages([]);
    } catch (error: any) {
      console.error('Erro ao apagar mensagens:', error);
      toast({
        title: 'Erro ao apagar',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setDeletingWhatsApp(false);
    }
  };

  const handleGenerateWhatsAppMessage = async () => {
    if (!whatsappContext.trim()) {
      toast({
        title: 'Erro',
        description: 'Por favor, descreva o contexto da mensagem.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedLeadId) return;

    const lead = allLeads.find(l => l.id === selectedLeadId);
    if (!lead) {
      toast({
        title: 'Erro',
        description: 'Lead não encontrado.',
        variant: 'destructive',
      });
      return;
    }
    const firstLead = lead;

    setGeneratingWhatsApp(true);
    try {
      console.log('Gerando mensagem WhatsApp para lead:', firstLead.id);
      const { data, error } = await supabase.functions.invoke('generate-whatsapp-message', {
        body: { leadId: firstLead.id, context: whatsappContext }
      });

      if (error) {
        console.error('Erro da edge function:', error);
        throw error;
      }

      console.log('Mensagem gerada:', data);
      setGeneratedWhatsAppMessage(data.message);
      toast({
        title: 'Mensagem gerada',
        description: 'A mensagem foi gerada com sucesso.',
      });
    } catch (error: any) {
      console.error('Erro ao gerar mensagem:', error);
      toast({
        title: 'Erro ao gerar mensagem',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setGeneratingWhatsApp(false);
    }
  };

  const handleSendWhatsAppMessage = async () => {
    if (!generatedWhatsAppMessage.trim()) {
      toast({
        title: 'Erro',
        description: 'A mensagem não pode estar vazia.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedLeadId) return;

    const lead = allLeads.find(l => l.id === selectedLeadId);
    if (!lead) return;
    const firstLead = lead;

    if (!firstLead.phones || firstLead.phones.length === 0) {
      toast({
        title: 'Erro',
        description: 'Este lead não possui número de telefone cadastrado.',
        variant: 'destructive',
      });
      return;
    }

    setSendingWhatsApp(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-message', {
        body: {
          phone: firstLead.phones[0],
          message: generatedWhatsAppMessage,
          leadId: firstLead.id
        }
      });

      if (error) {
        console.error('Erro da edge function:', error, data);
        throw new Error((data as any)?.error || (data as any)?.message || error.message);
      }

      toast({
        title: 'Mensagem enviada',
        description: 'A mensagem foi enviada com sucesso pelo WhatsApp.',
      });

      // Fechar diálogo e resetar estados
      setShowSendWhatsAppDialog(false);
      setWhatsappContext('');
      setGeneratedWhatsAppMessage('');

      // Recarregar mensagens WhatsApp
      if (firstLead.phones && firstLead.phones.length > 0) {
        fetchWhatsAppMessagesByPhones(firstLead.phones);
      }
    } catch (error: any) {
      console.error('Erro ao enviar mensagem:', error);
      toast({
        title: 'Erro ao enviar',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const handleSendDirectMessage = async (phone?: string) => {
    if (!selectedLeadId || !directMessage.trim()) return;

    const lead = allLeads.find(l => l.id === selectedLeadId);
    if (!lead) return;
    const firstLead = lead;

    if (!firstLead.phones || firstLead.phones.length === 0) {
      toast({
        title: 'Erro',
        description: 'Este lead não possui número de telefone cadastrado.',
        variant: 'destructive',
      });
      return;
    }

    // Se recebeu um número normalizado, encontrar o número original correspondente
    let targetPhone = firstLead.phones[0];
    if (phone) {
      // Procurar o número original que corresponde ao normalizado
      const matchingPhone = firstLead.phones.find(p => normalizePhoneNumber(p) === phone);
      targetPhone = matchingPhone || phone;
    }

    setSendingDirectMessage(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-message', {
        body: {
          phone: targetPhone,
          message: directMessage,
          leadId: firstLead.id
        }
      });

      if (error) {
        console.error('Erro da edge function:', error, data);
        throw new Error((data as any)?.error || (data as any)?.message || error.message);
      }

      // Não mostrar toast - mensagem enviada silenciosamente
      
      // Limpar campo de mensagem
      setDirectMessage('');

      // Recarregar mensagens WhatsApp por lead_id e variações do telefone
      fetchWhatsAppMessages([firstLead.id], [firstLead.phone, ...(firstLead.phones || [])].filter(Boolean) as string[]);
      setTimeout(scrollWhatsappToBottom, 150);
      
      // Focar no campo de mensagem após enviar
      setTimeout(() => directMessageInputRef.current?.focus(), 200);
    } catch (error: any) {
      console.error('Erro ao enviar mensagem:', error);
      toast({
        title: 'Erro ao enviar',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSendingDirectMessage(false);
    }
  };

  const handleGenerateEmail = async () => {
    if (!selectedLeadId) return;
    
    const lead = allLeads.find(l => l.id === selectedLeadId);
    if (!lead || emailMessages.length === 0) {
      toast({
        title: 'Erro',
        description: 'Não há histórico de emails para gerar uma resposta.',
        variant: 'destructive',
      });
      return;
    }

    setGeneratingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-email-reply', {
        body: {
          emails: emailMessages,
          leadName: lead.name,
          leadDescription: lead.description,
          leadLanguage: lead.language
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      setEmailSubject(data.subject);
      setEmailBody(htmlToPlainText(data.body));
      setShowEmailComposer(true);

      toast({
        title: 'Email gerado',
        description: 'Revise e edite o email antes de enviar.',
      });
    } catch (error: any) {
      console.error('Erro ao gerar email:', error);
      toast({
        title: 'Erro ao gerar email',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setGeneratingEmail(false);
    }
  };

  const handleSendEmail = async () => {
    if (!selectedLeadId || !emailSubject.trim() || !emailBody.trim()) {
      toast({
        title: 'Erro',
        description: 'Preencha o assunto e o corpo do email.',
        variant: 'destructive',
      });
      return;
    }

    const lead = allLeads.find(l => l.id === selectedLeadId);
    if (!lead || (!lead.email && (!lead.emails || lead.emails.length === 0))) {
      toast({
        title: 'Erro',
        description: 'Este lead não possui email cadastrado.',
        variant: 'destructive',
      });
      return;
    }

    const rawAddresses = (lead.emails && lead.emails.length > 0 ? lead.emails : [lead.email]) as (string | null | undefined)[];
    const emailAddresses = Array.from(new Set(
      (rawAddresses || [])
        .filter((e): e is string => !!e)
        .map((e) => e.trim())
        .filter((e) => e.includes('@'))
    ));

    if (emailAddresses.length === 0) {
      toast({
        title: 'Erro',
        description: 'Nenhum e-mail válido encontrado para este lead.',
        variant: 'destructive',
      });
      return;
    }

    setSendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          leadId: lead.id,
          to: emailAddresses.join(','),
          subject: emailSubject,
          body: plainTextToHtml(emailBody)
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      toast({
        title: 'Email enviado',
        description: 'O email foi enviado com sucesso.',
      });

      // Limpar formulário e fechar
      setEmailSubject('');
      setEmailBody('');
      setShowEmailComposer(false);

      // Recarregar emails
      await fetchEmailMessages(lead.id);
    } catch (error: any) {
      console.error('Erro ao enviar email:', error);
      toast({
        title: 'Erro ao enviar email',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleBulkSendFollowupEmails = async () => {
    const leadsToEmail = Array.from(selectedLeads)
      .map(id => allLeads.find(l => l.id === id))
      .filter((lead): lead is Lead => lead !== undefined && (!!lead.email || (lead.emails && lead.emails.length > 0)));

    if (leadsToEmail.length === 0) {
      toast({
        title: 'Erro',
        description: 'Nenhum lead selecionado possui e-mail cadastrado.',
        variant: 'destructive',
      });
      return;
    }

    setSendingBulkEmails(true);
    let successCount = 0;
    let errorCount = 0;

    toast({
      title: 'Enviando e-mails',
      description: `Processando ${leadsToEmail.length} lead(s)...`,
    });

    for (const lead of leadsToEmail) {
      try {
        // Buscar histórico de emails do lead
        const { data: leadEmails } = await supabase
          .from('email_messages')
          .select('*')
          .eq('lead_id', lead.id)
          .order('timestamp', { ascending: false });

        if (!leadEmails || leadEmails.length === 0) {
          console.log(`Lead ${lead.id} não possui histórico de emails`);
          errorCount++;
          continue;
        }

        // Gerar o e-mail de follow-up
        const { data: generatedData, error: generateError } = await supabase.functions.invoke('generate-email-reply', {
          body: {
            emails: leadEmails,
            leadName: lead.name,
            leadDescription: lead.description,
          leadLanguage: lead.language
          }
        });

        if (generateError || !generatedData) {
          console.error(`Erro ao gerar email para ${lead.id}:`, generateError);
          errorCount++;
          continue;
        }

        // Enviar o e-mail para todos os endereços do lead
        const rawAddresses = (lead.emails && lead.emails.length > 0 ? lead.emails : [lead.email]) as (string | null | undefined)[];
        const emailAddresses = Array.from(new Set(
          (rawAddresses || [])
            .filter((e): e is string => !!e)
            .map((e) => e.trim())
            .filter((e) => e.includes('@'))
        ));

        if (emailAddresses.length === 0) {
          console.warn(`Lead ${lead.id} sem emails válidos para envio.`);
          errorCount++;
          continue;
        }

        const { error: sendError } = await supabase.functions.invoke('send-email', {
          body: {
            leadId: lead.id,
            to: emailAddresses.join(','),
            subject: generatedData.subject,
            body: generatedData.body
          }
        });

        if (sendError) {
          console.error(`Erro ao enviar email para ${lead.id}:`, sendError);
          errorCount++;
          continue;
        }

        successCount++;
      } catch (error: any) {
        console.error(`Erro ao processar lead ${lead.id}:`, error);
        errorCount++;
      }
    }

    setSendingBulkEmails(false);
    setSelectedLeads(new Set()); // Limpar seleção

    toast({
      title: 'Envio concluído',
      description: `${successCount} e-mail(s) enviado(s) com sucesso${errorCount > 0 ? `, ${errorCount} erro(s)` : ''}.`,
      variant: errorCount > 0 ? 'destructive' : 'default',
    });
  };

  const handleMarkAsWon = async () => {
    if (selectedLeads.size === 0) return;

    try {
      const selectedLeadArray = Array.from(selectedLeads);
      
      const { error } = await supabase
        .from('leads')
        .update({ status: 'ganho' })
        .in('id', selectedLeadArray);

      if (error) throw error;

      setAllLeads(prev => prev.map(l => 
        selectedLeadArray.includes(l.id) ? { ...l, status: 'ganho' } : l
      ));

      toast({
        title: 'Status atualizado',
        description: `${selectedLeads.size} lead(s) marcado(s) como Ganho`,
      });

      setSelectedLeads(new Set());
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleMarkAsLost = async () => {
    if (selectedLeads.size === 0) return;

    try {
      const selectedLeadArray = Array.from(selectedLeads);
      
      const { error } = await supabase
        .from('leads')
        .update({ status: 'perdido' })
        .in('id', selectedLeadArray);

      if (error) throw error;

      setAllLeads(prev => prev.map(l => 
        selectedLeadArray.includes(l.id) ? { ...l, status: 'perdido' } : l
      ));

      toast({
        title: 'Status atualizado',
        description: `${selectedLeads.size} lead(s) marcado(s) como Perdido`,
      });

      setSelectedLeads(new Set());
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleSaveProduto = async () => {
    if (!selectedLeadId) return;
    
    const lead = allLeads.find(l => l.id === selectedLeadId);
    if (!lead) return;

    const produtoValue = tempProduto || null;
    const previousValue = lead.produto;

    // Update otimista - atualiza UI imediatamente
    setAllLeads(leads => leads.map(l => 
      l.id === selectedLeadId ? { ...l, produto: produtoValue as any } : l
    ));
    updateLeadInCache(selectedLeadId, { produto: produtoValue as any });
    setEditingProduto(false);

    toast({
      title: 'Produto atualizado',
      description: 'O tipo de produto foi atualizado com sucesso.',
    });

    try {
      const { error } = await supabase
        .from('leads')
        .update({ produto: produtoValue })
        .eq('id', lead.id);

      if (error) throw error;
    } catch (error: any) {
      // Reverter em caso de erro
      setAllLeads(leads => leads.map(l => 
        l.id === selectedLeadId ? { ...l, produto: previousValue } : l
      ));
      updateLeadInCache(selectedLeadId, { produto: previousValue });
      
      console.error('Erro ao atualizar produto:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o produto.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveValor = async () => {
    if (!selectedLeadId) return;
    
    const lead = allLeads.find(l => l.id === selectedLeadId);
    if (!lead) return;

    const valorNumber = tempValor ? parseFloat(tempValor.replace(/[^\d,]/g, '').replace(',', '.')) : null;
    const previousValor = lead.valor;
    const previousMoeda = lead.moeda;
    const previousManualEdit = lead.valor_manually_edited;

    // Update otimista - atualiza UI imediatamente
    setAllLeads(leads => leads.map(l => 
      l.id === selectedLeadId ? { 
        ...l, 
        valor: valorNumber, 
        moeda: tempMoeda,
        valor_manually_edited: true 
      } : l
    ));
    updateLeadInCache(selectedLeadId, { valor: valorNumber, moeda: tempMoeda, valor_manually_edited: true });
    setEditingValor(false);

    toast({
      title: 'Valor atualizado',
      description: 'O valor da oportunidade foi atualizado com sucesso.',
    });

    try {
      const { error } = await supabase
        .from('leads')
        .update({ 
          valor: valorNumber,
          moeda: tempMoeda,
          valor_manually_edited: true 
        })
        .eq('id', lead.id);

      if (error) throw error;
    } catch (error: any) {
      // Reverter em caso de erro
      setAllLeads(leads => leads.map(l => 
        l.id === selectedLeadId ? { 
          ...l, 
          valor: previousValor,
          moeda: previousMoeda,
          valor_manually_edited: previousManualEdit
        } : l
      ));
      updateLeadInCache(selectedLeadId, { valor: previousValor, moeda: previousMoeda, valor_manually_edited: previousManualEdit });
      
      console.error('Erro ao atualizar valor:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o valor.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveValorPago = async () => {
    if (!selectedLeadId) return;
    
    const lead = allLeads.find(l => l.id === selectedLeadId);
    if (!lead) return;

    const valorPagoNumber = tempValorPago ? parseFloat(tempValorPago.replace(/[^\d,]/g, '').replace(',', '.')) : 0;
    const previousValorPago = lead.valor_pago;

    // Update otimista - atualiza UI imediatamente
    setAllLeads(leads => leads.map(l => 
      l.id === selectedLeadId ? { ...l, valor_pago: valorPagoNumber } : l
    ));
    updateLeadInCache(selectedLeadId, { valor_pago: valorPagoNumber });
    setEditingValorPago(false);

    toast({
      title: 'Valor pago atualizado',
      description: 'O valor pago foi atualizado com sucesso.',
    });

    try {
      const { error } = await supabase
        .from('leads')
        .update({ valor_pago: valorPagoNumber })
        .eq('id', lead.id);

      if (error) throw error;
    } catch (error: any) {
      // Reverter em caso de erro
      setAllLeads(leads => leads.map(l => 
        l.id === selectedLeadId ? { ...l, valor_pago: previousValorPago } : l
      ));
      updateLeadInCache(selectedLeadId, { valor_pago: previousValorPago });
      
      console.error('Erro ao atualizar valor pago:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o valor pago.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveStatus = async () => {
    if (!selectedLeadId) return;
    
    const lead = allLeads.find(l => l.id === selectedLeadId);
    if (!lead) return;

    try {
      const statusValue = tempStatus || null;
      const { error } = await supabase
        .from('leads')
        .update({ status: statusValue as 'em_negociacao' | 'ganho' | 'perdido' | 'entregue' | null })
        .eq('id', lead.id);

      if (error) throw error;

      toast({
        title: 'Status atualizado',
        description: 'O status do lead foi atualizado com sucesso.',
      });

      setEditingStatus(false);
      await fetchLeads();
    } catch (error: any) {
      console.error('Erro ao atualizar status:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o status.',
        variant: 'destructive',
      });
    }
  };


  // Função para extrair TODOS os emails de uma mensagem
  const extractAllEmails = (msg: EmailMessage): { from: string[], to: string[] } => {
    if (!msg.raw_data) {
      return { from: [], to: [] };
    }
    
    const rawData = msg.raw_data;

    const normalize = (val: any): string[] => {
      if (!val) return [];
      const items = Array.isArray(val) ? val : [val];
      const out: string[] = [];
      for (const item of items) {
        const str = typeof item === 'string' ? item : JSON.stringify(item);
        const matches = str.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
        for (const m of matches) {
          const email = m.toLowerCase();
          if (!out.includes(email)) out.push(email);
        }
      }
      return out;
    };
    
    console.log('Raw data completo:', rawData);
    const fromSources = [
      rawData.headers?.From,
      rawData.headers?.from,
      rawData['headers[From]'],
      rawData['headers[from]'],
      rawData.from,
      rawData.envelope?.from,
      rawData['envelope[from]'],
    ];

    const toSources = [
      rawData.headers?.To,
      rawData.headers?.to,
      rawData['headers[To]'],
      rawData['headers[to]'],
      rawData.to,
      rawData.envelope?.to,
      rawData['envelope[to]'],
      rawData.envelope?.recipients,
      rawData.headers?.['Delivered-To'],
      rawData.headers?.['delivered-to'],
      rawData.headers?.['X-Original-To'],
      rawData.headers?.['x-original-to'],
      rawData.headers?.['Original-Recipient'],
      rawData.headers?.['original-recipient'],
      rawData.headers?.['Envelope-To'],
      rawData.headers?.['envelope-to'],
      rawData.cc,
      rawData.headers?.Cc,
      rawData.headers?.cc,
    ];

    const from = Array.from(new Set(fromSources.flatMap(normalize)));
    const to = Array.from(new Set(toSources.flatMap(normalize))).filter(
      email => !email.includes('cloudmailin.net')
    );
    
    console.log('Emails extraídos - From:', from, 'To:', to);
    return { from, to };
  };

  // Função para pegar o email do lead que está na mensagem (destinatário)
  const getLeadEmailFromMessage = (msg: EmailMessage, leadEmails: string[]): string | null => {
    const { to } = extractAllEmails(msg);
    
    console.log('Lead emails disponíveis:', leadEmails);
    console.log('Destinatários na mensagem:', to);
    
    const ignoredDomains = ['inventosdigitais.com.br', 'cloudmailin.net'];
    const isIgnored = (email: string) => ignoredDomains.some(d => email.toLowerCase().endsWith(`@${d}`));
    
    // Procurar nos destinatários (TO) qual é o email do lead
    for (const email of to) {
      if (!isIgnored(email)) {
        const matchingEmail = leadEmails.find(le => le.toLowerCase() === email.toLowerCase());
        console.log('Comparando', email, 'com lead emails, match:', matchingEmail);
        if (matchingEmail) {
          return matchingEmail;
        }
      }
    }
    
    console.log('Nenhum match encontrado');
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8 overflow-x-hidden">
        <div className="max-w-6xl mx-auto overflow-x-hidden">
          <h1 className="text-2xl md:text-4xl font-bold mb-8">Carregando leads...</h1>
        </div>
      </div>
    );
  }

  // Se um lead foi selecionado, mostrar detalhes
  if (selectedLeadId) {
    const lead = allLeads.find(l => l.id === selectedLeadId);
    const firstLead = lead;
    
    return (
      <div className="min-h-screen bg-background p-4 md:p-8 overflow-x-hidden">
        <div className="max-w-6xl mx-auto overflow-x-hidden">
          
          <div className="mb-8">
            {editingLead === firstLead?.id ? (
              <Card className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Nome</label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Nome do lead"
                    />
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">E-mails</label>
                      <Button 
                        onClick={addEmail} 
                        size="sm" 
                        variant="outline"
                        type="button"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {editEmails.map((email, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={email}
                            onChange={(e) => {
                              const newEmails = [...editEmails];
                              newEmails[index] = e.target.value;
                              setEditEmails(newEmails);
                            }}
                            placeholder="email@exemplo.com"
                          />
                          <Button
                            onClick={() => removeEmail(index)}
                            size="sm"
                            variant="destructive"
                            type="button"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {editEmails.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Nenhum e-mail cadastrado
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">Telefones</label>
                      <Button 
                        onClick={addPhone} 
                        size="sm" 
                        variant="outline"
                        type="button"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {editPhones.map((phone, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={phone}
                            onChange={(e) => {
                              const newPhones = [...editPhones];
                              newPhones[index] = e.target.value;
                              setEditPhones(newPhones);
                            }}
                            placeholder="5511999999999"
                          />
                          <Button
                            onClick={() => removePhone(index)}
                            size="sm"
                            variant="destructive"
                            type="button"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {editPhones.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Nenhum telefone cadastrado
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button onClick={() => saveEdit(firstLead.id)} size="sm">
                      <Save className="h-4 w-4 mr-2" />
                      Salvar
                    </Button>
                    <Button onClick={cancelEdit} variant="outline" size="sm">
                      <X className="h-4 w-4 mr-2" />
                      Cancelar
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <>
                {/* Header Compacto com Atividade */}
                <Card className="mb-4">
                  <CardContent className="p-4">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      {/* Informações de contato */}
                      <div className="flex-shrink-0">
                        <div className="flex items-center gap-3 mb-3">
                          <Mail className="w-6 h-6 text-muted-foreground" />
                          <h1 className="text-xl md:text-2xl font-bold break-words">{firstLead?.name || 'Lead sem nome'}</h1>
                        </div>
                        
                        <div className="flex flex-col md:flex-row md:gap-8 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Emails:</span>
                            {firstLead?.emails && firstLead.emails.length > 0 ? (
                              firstLead.emails.map((email, i) => (
                                <div key={i} className="text-foreground break-all">{email}</div>
                              ))
                            ) : (
                              <div className="text-foreground break-all">{firstLead?.email || 'Não informado'}</div>
                            )}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Telefones:</span>
                            {firstLead?.phones && firstLead.phones.length > 0 ? (
                              firstLead.phones.map((phone, i) => (
                                <div key={i} className="text-foreground">{phone}</div>
                              ))
                            ) : (
                              <div className="text-foreground">Não informado</div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Atividade */}
                      <div className="flex-1 lg:max-w-xs border-l-0 lg:border-l lg:pl-4">
                        <h3 className="text-sm font-semibold text-foreground mb-2">Atividade</h3>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <MessageCircle className="h-4 w-4 text-green-600" />
                              <span className="text-sm">WhatsApp</span>
                            </div>
                            <div className="flex gap-3 text-xs">
                              <span className="text-muted-foreground">Enviadas: <span className="font-semibold text-foreground">{firstLead?.whatsapp_outbound_count || 0}</span></span>
                              <span className="text-muted-foreground">Recebidas: <span className="font-semibold text-foreground">{firstLead?.whatsapp_inbound_count || 0}</span></span>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-blue-600" />
                              <span className="text-sm">Email</span>
                            </div>
                            <div className="flex gap-3 text-xs">
                              <span className="text-muted-foreground">Enviados: <span className="font-semibold text-foreground">{firstLead?.email_outbound_count || 0}</span></span>
                              <span className="text-muted-foreground">Recebidos: <span className="font-semibold text-foreground">{firstLead?.email_inbound_count || 0}</span></span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 text-xs pt-1 border-t">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-muted-foreground">Última interação:</span>
                            {firstLead?.last_interaction ? (
                              <>
                                <span className="font-medium">
                                  há {formatDistanceToNow(new Date(firstLead.last_interaction), { 
                                    addSuffix: false, 
                                    locale: ptBR 
                                  })}
                                </span>
                                {firstLead.last_interaction_direction && (
                                  <Badge 
                                    variant={firstLead.last_interaction_direction === 'inbound' ? 'default' : 'secondary'}
                                    className="text-xs h-5"
                                  >
                                    {firstLead.last_interaction_direction === 'inbound' ? 'Cliente' : 'Você'}
                                  </Badge>
                                )}
                              </>
                            ) : (
                              <span className="font-medium">Sem interações</span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Botões de ação compactos */}
                      <div className="flex gap-2 flex-wrap lg:flex-col lg:items-end">
                        <div className="flex gap-2">
                          <Button onClick={() => startEdit(firstLead)} variant="ghost" size="sm" className="p-2">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            onClick={(e) => generateDescription(firstLead.id, e)} 
                            variant="ghost" 
                            size="sm"
                            className="p-2"
                            disabled={generatingDescription === firstLead.id}
                          >
                            <Sparkles className="h-4 w-4" />
                          </Button>
                          <Button 
                            onClick={() => handleArchiveLead(firstLead.id)} 
                            variant="ghost" 
                            size="sm"
                            className="p-2"
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => setShowAddNoteDialog(true)} 
                            size="sm"
                            className="bg-gray-900 text-white hover:bg-gray-800 px-3 py-2"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Nota
                          </Button>
                          <Button 
                            size="sm"
                            variant="outline"
                            className="px-3 py-2"
                            onClick={() => window.open(`/opportunity/${firstLead.id}`, '_blank')}
                          >
                            <Share2 className="h-4 w-4 mr-2" />
                            Compartilhar
                          </Button>
                          {firstLead?.produto === 'palestra' && (
                            <Button 
                              size="sm"
                              variant="outline"
                              className="px-3 py-2"
                              onClick={() => window.open(`/proposal?leadId=${firstLead.id}`, '_blank')}
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              Proposta
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Descrição - Largura total */}
                {firstLead?.description && (
                  <Card className="mb-4">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-foreground">Descrição</h3>
                        <Button 
                          onClick={(e) => generateDescription(firstLead.id, e)} 
                          variant="ghost" 
                          size="sm"
                          className="p-1"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed italic">{firstLead.description}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Oportunidades Entregues Anteriores */}
                {firstLead?.is_recurring && previousOpportunities.length > 0 && (
                  <Card className="mb-4">
                    <CardContent className="p-4 bg-blue-50 dark:bg-blue-950/20">
                      <div className="flex items-center gap-2 mb-3">
                        <RefreshCw className="h-5 w-5 text-blue-600" />
                        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                          Oportunidades Entregues Anteriores
                        </p>
                      </div>
                      <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {previousOpportunities.map((opp) => (
                          <div key={opp.id} className="p-3 bg-white dark:bg-gray-800 rounded border border-blue-100 dark:border-blue-900">
                            {opp.delivered_at && (
                              <div className="text-xs text-muted-foreground mb-1">
                                Entregue em: {formatDate(opp.delivered_at)}
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <div>
                                {opp.valor !== null && opp.valor !== undefined && (
                                  <div className="font-semibold text-sm">
                                    {new Intl.NumberFormat('pt-BR', { 
                                      style: 'currency', 
                                      currency: opp.moeda || 'BRL' 
                                    }).format(opp.valor)}
                                  </div>
                                )}
                                {opp.produto && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Produto: {opp.produto === 'palestra' ? 'Palestra' :
                                            opp.produto === 'consultoria' ? 'Consultoria' :
                                            opp.produto === 'mentoria' ? 'Mentoria' :
                                            opp.produto === 'treinamento' ? 'Treinamento' :
                                            opp.produto === 'publicidade' ? 'Publicidade' :
                                            opp.produto === 'documentario' ? 'Documentário' : opp.produto}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Card de Status, Produto e Proposta - 100% width */}
                <Card className="mb-4">
                  <CardContent className="p-4">
                    <div className="flex flex-col lg:flex-row gap-4">
                      {/* Status */}
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground block mb-2">Status</label>
                        <div className="flex flex-col md:flex-row gap-2">
                              <select
                                value={firstLead?.status || ''}
                                onChange={async (e) => {
                                  try {
                                    const newStatus = e.target.value || null;
                                    const updateData: any = { status: newStatus };
                                    
                                    // Salvar datas conforme o status
                                    if (newStatus === 'ganho') {
                                      updateData.ganho_at = new Date().toISOString();
                                      updateData.perdido_at = null;
                                    } else if (newStatus === 'perdido') {
                                      updateData.perdido_at = new Date().toISOString();
                                      updateData.ganho_at = null;
                                    } else if (newStatus === 'entregue') {
                                      updateData.delivered_at = new Date().toISOString();
                                    } else if (newStatus === 'em_negociacao') {
                                      updateData.ganho_at = null;
                                      updateData.perdido_at = null;
                                    }
                                    
                                    const { error } = await supabase
                                      .from('leads')
                                      .update(updateData)
                                      .eq('id', firstLead!.id);

                                    if (error) throw error;

                                    setAllLeads(prev => prev.map(l => 
                                      l.id === firstLead!.id ? { ...l, ...updateData } : l
                                    ));

                                    toast({
                                      title: 'Status atualizado',
                                      description: 'O status foi atualizado com sucesso.',
                                    });
                                  } catch (error) {
                                    console.error('Erro ao atualizar status:', error);
                                    toast({
                                      title: 'Erro',
                                      description: 'Não foi possível atualizar o status.',
                                      variant: 'destructive',
                                    });
                                  }
                                }}
                                className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              >
                                <option value="">Selecione...</option>
                                <option value="em_aberto">Em Aberto</option>
                                <option value="em_negociacao">Em Negociação</option>
                                <option value="ganho">Ganho</option>
                                <option value="perdido">Perdido</option>
                                <option value="entregue">Entregue</option>
                              </select>
                              
                              {firstLead?.status !== 'ganho' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    try {
                                      const updateData = { 
                                        status: 'ganho' as const, 
                                        ganho_at: new Date().toISOString(),
                                        perdido_at: null 
                                      };
                                      const { error } = await supabase
                                        .from('leads')
                                        .update(updateData)
                                        .eq('id', firstLead!.id);

                                      if (error) throw error;

                                      setAllLeads(prev => prev.map(l => 
                                        l.id === firstLead!.id ? { ...l, ...updateData } : l
                                      ));

                                      toast({
                                        title: 'Status atualizado',
                                        description: 'Lead marcado como Ganho',
                                      });
                                    } catch (error) {
                                      console.error('Erro ao atualizar status:', error);
                                      toast({
                                        title: 'Erro',
                                        description: 'Não foi possível atualizar o status.',
                                        variant: 'destructive',
                                      });
                                    }
                                  }}
                                  className="bg-green-50 text-green-700 hover:bg-green-100 px-4 py-2 h-10 font-semibold text-sm whitespace-nowrap"
                                  title="Marcar como Ganho"
                                >
                                  <CheckCircle className="h-4 w-4 mr-1.5" />
                                  GANHO
                                </Button>
                              )}
                              
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  try {
                                    const updateData = { 
                                      status: 'perdido' as const, 
                                      perdido_at: new Date().toISOString(),
                                      ganho_at: null 
                                    };
                                    const { error } = await supabase
                                      .from('leads')
                                      .update(updateData)
                                      .eq('id', firstLead!.id);

                                    if (error) throw error;

                                    setAllLeads(prev => prev.map(l => 
                                      l.id === firstLead!.id ? { ...l, ...updateData } : l
                                    ));

                                    toast({
                                      title: 'Status atualizado',
                                      description: 'Lead marcado como Perdido',
                                    });
                                  } catch (error) {
                                    console.error('Erro ao atualizar status:', error);
                                    toast({
                                      title: 'Erro',
                                      description: 'Não foi possível atualizar o status.',
                                      variant: 'destructive',
                                    });
                                  }
                                }}
                                className="bg-red-50 text-red-700 hover:bg-red-100 px-4 py-2 h-10 font-semibold text-sm whitespace-nowrap"
                                title="Marcar como Perdido"
                              >
                                <XCircle className="h-4 w-4 mr-1.5" />
                                PERDIDO
                              </Button>
                        </div>
                      </div>
                      
                      {/* Produto */}
                      <div className="w-full lg:w-40">
                        <label className="text-xs text-muted-foreground block mb-2">Produto</label>
                        <select
                          value={firstLead?.produto || ''}
                          onChange={async (e) => {
                            try {
                              const produtoValue = e.target.value || null;
                              
                              const { error } = await supabase
                                .from('leads')
                                .update({ produto: produtoValue })
                                .eq('id', firstLead!.id);

                              if (error) throw error;

                              setAllLeads(prev => prev.map(l => 
                                l.id === firstLead!.id ? { ...l, produto: produtoValue as any } : l
                              ));

                              toast({
                                title: 'Produto atualizado',
                                description: 'O produto foi atualizado com sucesso.',
                              });
                            } catch (error) {
                              console.error('Erro ao atualizar produto:', error);
                              toast({
                                title: 'Erro',
                                description: 'Não foi possível atualizar o produto.',
                                variant: 'destructive',
                              });
                            }
                          }}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
                        >
                          <option value="">Não definido</option>
                          <option value="palestra">Palestra</option>
                          <option value="consultoria">Consultoria</option>
                          <option value="mentoria">Mentoria</option>
                          <option value="treinamento">Treinamento</option>
                          <option value="publicidade">Publicidade</option>
                            <option value="documentario">Documentário</option>
                        </select>
                      </div>
                      
                      {/* Valor */}
                      <div className="w-full lg:w-48">
                        <label className="text-xs text-muted-foreground block mb-2">Valor</label>
                        {editingValor ? (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                value={tempValor}
                                onChange={(e) => setTempValor(e.target.value)}
                                placeholder="0.00"
                                className="flex-1 h-9"
                              />
                              <select
                                value={tempMoeda}
                                onChange={(e) => setTempMoeda(e.target.value as 'BRL' | 'USD' | 'EUR')}
                                className="w-20 flex h-9 rounded-md border border-input bg-background px-2 py-1 text-sm"
                              >
                                <option value="BRL">BRL</option>
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                              </select>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" className="h-7" onClick={handleSaveValor}>
                                <Save className="h-3 w-3 mr-1" />
                                Salvar
                              </Button>
                              <Button size="sm" variant="outline" className="h-7" onClick={() => setEditingValor(false)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 h-9">
                            {firstLead?.valor !== null && firstLead?.valor !== undefined ? (
                              <span className="text-sm font-semibold">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: firstLead?.moeda || 'BRL' }).format(firstLead.valor)}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">Indefinido</span>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="p-1 h-7"
                              onClick={() => {
                                setTempValor(firstLead?.valor ? firstLead.valor.toString() : '');
                                setTempMoeda(firstLead?.moeda || 'BRL');
                                setEditingValor(true);
                              }}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Proposta info - apenas para palestra com proposta */}
                      {firstLead?.produto === 'palestra' && firstLead.proposal_url && (
                        <div className="w-full lg:w-auto lg:border-l lg:pl-4">
                          <label className="text-xs text-muted-foreground block mb-2">Proposta</label>
                          <div className="flex items-center gap-3 text-xs flex-wrap">
                            <span>Visualizações: <span className="font-semibold text-primary">{firstLead.proposal_view_count || 0}</span></span>
                            {firstLead.proposal_last_viewed_at && (
                              <span className="text-muted-foreground">
                                Última: {formatDistanceToNow(new Date(firstLead.proposal_last_viewed_at), { addSuffix: true, locale: ptBR })}
                              </span>
                            )}
                            {firstLead.proposal_sent_at && (
                              <span className="text-muted-foreground">
                                Enviada: {formatDistanceToNow(new Date(firstLead.proposal_sent_at), { addSuffix: true, locale: ptBR })}
                              </span>
                            )}
                            <a
                              href={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/view-proposal?id=${firstLead.id}`}
                              className="text-primary hover:underline font-medium"
                            >
                              Abrir
                            </a>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Valor Pago - apenas para status ganho */}
                    {firstLead?.status === 'ganho' && firstLead?.valor && (
                      <div className="mt-4 pt-3 border-t">
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Valor total:</span>
                            <span className="text-sm font-semibold">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: firstLead.moeda || 'BRL' }).format(firstLead.valor)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Já pago:</span>
                            {editingValorPago ? (
                              <div className="flex gap-2 items-center">
                                <Input
                                  type="number"
                                  value={tempValorPago}
                                  onChange={(e) => setTempValorPago(e.target.value)}
                                  placeholder="0.00"
                                  className="w-24 h-7"
                                />
                                <Button size="sm" className="h-7" onClick={handleSaveValorPago}>
                                  <Save className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-7" onClick={() => setEditingValorPago(false)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <span className="text-sm font-semibold text-green-600">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: firstLead.moeda || 'BRL' }).format(firstLead.valor_pago || 0)}
                                </span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="p-1 h-6"
                                  onClick={() => {
                                    setTempValorPago(firstLead?.valor_pago ? firstLead.valor_pago.toString() : '0');
                                    setEditingValorPago(true);
                                  }}
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                          {(firstLead.valor - (firstLead.valor_pago || 0)) > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">A receber:</span>
                              <span className="text-sm font-bold text-orange-600">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: firstLead.moeda || 'BRL' }).format(firstLead.valor - (firstLead.valor_pago || 0))}
                              </span>
                            </div>
                          )}
                          {(firstLead.valor_pago || 0) >= firstLead.valor && (
                            <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                              ✓ Pago integralmente
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Seção de Notas */}
          {leadNotes.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <StickyNote className="h-5 w-5" />
                  Notas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {leadNotes.map((note) => (
                  <div key={note.id} className="p-3 bg-muted rounded-lg">
                    <p className="text-sm whitespace-pre-wrap">{note.note}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDate(note.created_at)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as 'email' | 'whatsapp'); setTimeout(scrollWhatsappToBottom, 50); }} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email ({emailMessages.length})
              </TabsTrigger>
              <TabsTrigger value="whatsapp" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                WhatsApp ({whatsappMessages.filter(m => whatsappMessageMatchesLead(m, firstLead)).length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-4 mt-4">
              <div className="flex justify-end gap-2 mb-4">
                <Button 
                  onClick={handleGenerateEmail} 
                  variant="default" 
                  size="sm"
                  disabled={generatingEmail}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {generatingEmail ? 'Gerando...' : 'Gerar Email'}
                </Button>
              </div>

              {showEmailComposer && (
                <Card className="mb-4">
                  <CardHeader>
                    <CardTitle className="text-lg">Compor Email</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Assunto</label>
                      <Input
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        placeholder="Assunto do email"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Mensagem</label>
                      <Textarea
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        placeholder="Corpo do email"
                        className="min-h-[200px]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        onClick={handleSendEmail}
                        disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim()}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        {sendingEmail ? 'Enviando...' : 'Enviar Email'}
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => {
                          setShowEmailComposer(false);
                          setEmailSubject('');
                          setEmailBody('');
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {emailMessages.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center py-8">
                      <Mail className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">Nenhuma mensagem de email</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <EmailThreadList
                  messages={emailMessages as any}
                  renderExtras={(msg) => {
                    const msgAttachments = emailAttachments.filter(a => a.email_message_id === msg.id);
                    if (msgAttachments.length === 0) return null;
                    return (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Anexos:</p>
                        <div className="flex flex-wrap gap-2">
                          {msgAttachments.map((attachment) => (
                            <Button
                              key={attachment.id}
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={async () => {
                                try {
                                  const { data, error } = await supabase.storage
                                    .from('email-attachments')
                                    .createSignedUrl(attachment.storage_path, 3600);
                                  if (error) throw error;
                                  if (data?.signedUrl) {
                                    window.open(data.signedUrl, '_blank');
                                  }
                                } catch (error) {
                                  console.error('Error downloading attachment:', error);
                                  toast({
                                    title: "Erro",
                                    description: "Erro ao baixar anexo",
                                    variant: "destructive"
                                  });
                                }
                              }}
                            >
                              <Mail className="h-3 w-3 mr-1" />
                              {attachment.filename}
                              {attachment.size_bytes && (
                                <span className="ml-1 text-muted-foreground">
                                  ({(attachment.size_bytes / 1024).toFixed(1)}KB)
                                </span>
                              )}
                            </Button>
                          ))}
                        </div>
                      </div>
                    );
                  }}
                />
              )}
            </TabsContent>

            <TabsContent value="whatsapp" className="mt-4">
              <div className="flex flex-col sm:flex-row sm:justify-end gap-2 mb-4">
                <Button 
                  onClick={() => setShowSendWhatsAppDialog(true)} 
                  variant="default" 
                  size="sm"
                  className="w-full sm:w-auto"
                  disabled={!firstLead?.phones || firstLead.phones.length === 0}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Enviar mensagem
                </Button>
                <Button 
                  onClick={() => setShowWhatsAppImportDialog(true)} 
                  variant="outline" 
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Importar mensagens
                </Button>
              </div>
              {firstLead?.phones && uniqueNormalizedPhones(firstLead.phones).length > 1 ? (
                <Tabs value={activePhoneTab ?? uniqueNormalizedPhones(firstLead.phones)[0]} onValueChange={(v) => { setActivePhoneTab(v); setTimeout(scrollWhatsappToBottom, 50); }} className="w-full">
                  <TabsList className="w-full">
                    {uniqueNormalizedPhones(firstLead.phones).map((norm) => (
                      <TabsTrigger key={norm} value={norm} className="flex-1">
                        <Phone className="h-3 w-3 mr-1" />
                        {norm.slice(-4)} ({whatsappMessages.filter(m => whatsappMessageMatchesPhone(m, norm)).length})
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  
                  {uniqueNormalizedPhones(firstLead.phones).map((norm) => (
                    <TabsContent key={norm} value={norm} className="mt-4">
                      <ScrollArea className="h-[500px] pr-4" data-whatsapp-scroll>
                        <div className="space-y-2">
                          {whatsappMessages.filter(m => whatsappMessageMatchesPhone(m, norm)).length === 0 ? (
                            <Card>
                              <CardContent className="pt-6">
                                <div className="text-center py-8">
                                  <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                                  <p className="text-muted-foreground">Nenhuma mensagem neste número</p>
                                </div>
                              </CardContent>
                            </Card>
                          ) : (
                            whatsappMessages
                              .filter(m => whatsappMessageMatchesPhone(m, norm))
                              .sort((a, b) => new Date(a.timestamp || a.created_at).getTime() - new Date(b.timestamp || b.created_at).getTime())
                              .map((msg) => (
                                <div 
                                  key={msg.id} 
                                  className={`flex mb-2 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                                >
                                  <div className={`max-w-[85%] md:max-w-[70%] ${msg.direction === 'outbound' ? 'ml-auto' : 'mr-auto'}`}>
                                    <div
                                      className={`rounded-lg px-3 py-2 shadow-sm ${
                                        msg.direction === 'outbound'
                                          ? 'bg-[#25D366] text-white rounded-br-none'
                                          : 'bg-muted rounded-bl-none'
                                      }`}
                                    >
                                      {msg.is_audio && (
                                        <div className={`flex items-center gap-1 mb-1 text-xs ${msg.direction === 'outbound' ? 'text-white/90' : 'text-muted-foreground'}`}>
                                          <Mic className="h-3 w-3" />
                                          <span>Áudio transcrito</span>
                                        </div>
                                      )}
                                      <p className="text-sm whitespace-pre-wrap break-words overflow-wrap-anywhere">
                                        {msg.message}
                                      </p>
                                      <div className={`flex items-center gap-1 mt-1 text-[10px] ${msg.direction === 'outbound' ? 'text-white/70' : 'text-muted-foreground'}`}>
                                        <span>{new Date(msg.timestamp || msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </ScrollArea>
                      
                      {/* Campo de envio de mensagem */}
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex gap-2">
                          <Input
                            ref={directMessageInputRef}
                            placeholder="Digite uma mensagem..."
                            value={directMessage}
                            onChange={(e) => setDirectMessage(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendDirectMessage(norm);
                              }
                            }}
                            disabled={sendingDirectMessage}
                            className="flex-1"
                          />
                          <Button
                            size="icon"
                            onClick={() => handleSendDirectMessage(norm)}
                            disabled={!directMessage.trim() || sendingDirectMessage}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                <div>
                  <ScrollArea className="h-[500px] pr-4" data-whatsapp-scroll>
                    <div className="space-y-2">
                      {whatsappMessages.filter(m => whatsappMessageMatchesLead(m, firstLead)).length === 0 ? (
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-center py-8">
                              <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                              <p className="text-muted-foreground">Nenhuma mensagem de WhatsApp</p>
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        whatsappMessages
                          .filter(m => whatsappMessageMatchesLead(m, firstLead))
                          .sort((a, b) => new Date(a.timestamp || a.created_at).getTime() - new Date(b.timestamp || b.created_at).getTime())
                          .map((msg) => (
                            <div 
                              key={msg.id} 
                              className={`flex mb-2 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                            >
                              <div className={`max-w-[85%] md:max-w-[70%] ${msg.direction === 'outbound' ? 'ml-auto' : 'mr-auto'}`}>
                                <div
                                  className={`rounded-lg px-3 py-2 shadow-sm ${
                                    msg.direction === 'outbound'
                                      ? 'bg-[#25D366] text-white rounded-br-none'
                                      : 'bg-muted rounded-bl-none'
                                  }`}
                                >
                                  {msg.is_audio && (
                                    <div className={`flex items-center gap-1 mb-1 text-xs ${msg.direction === 'outbound' ? 'text-white/90' : 'text-muted-foreground'}`}>
                                      <Mic className="h-3 w-3" />
                                      <span>Áudio transcrito</span>
                                    </div>
                                  )}
                                  <p className="text-sm whitespace-pre-wrap break-words overflow-wrap-anywhere">
                                    {msg.message}
                                  </p>
                                  <div className={`flex items-center gap-1 mt-1 text-[10px] ${msg.direction === 'outbound' ? 'text-white/70' : 'text-muted-foreground'}`}>
                                    <span>{new Date(msg.timestamp || msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </ScrollArea>
                  
                  {/* Campo de envio de mensagem */}
                  {firstLead?.phones && firstLead.phones.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex gap-2">
                        <Input
                          ref={directMessageInputRef}
                          placeholder="Digite uma mensagem..."
                          value={directMessage}
                          onChange={(e) => setDirectMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendDirectMessage();
                            }
                          }}
                          disabled={sendingDirectMessage}
                          className="flex-1"
                        />
                        <Button
                          size="icon"
                          onClick={() => handleSendDirectMessage()}
                          disabled={!directMessage.trim() || sendingDirectMessage}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Dialog de Importação WhatsApp */}
        <Dialog open={showWhatsAppImportDialog} onOpenChange={setShowWhatsAppImportDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Importar Mensagens do WhatsApp</DialogTitle>
              <DialogDescription>
                Cole a conversa do WhatsApp copiada e a IA irá estruturar as mensagens automaticamente, identificando quais são recebidas (do lead) e enviadas (suas respostas).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Textarea
                  placeholder="Cole aqui a conversa do WhatsApp..."
                  value={whatsappImportText}
                  onChange={(e) => setWhatsappImportText(e.target.value)}
                  className="min-h-[300px] font-mono text-sm"
                />
              </div>
              
              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>Dica:</strong> No WhatsApp, toque e segure uma mensagem, selecione "Mais", marque todas as mensagens da conversa e toque em "Encaminhar" → "Copiar".</p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowWhatsAppImportDialog(false);
                  setWhatsappImportText('');
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={importWhatsAppMessages}
                disabled={importingWhatsApp || !whatsappImportText.trim()}
              >
                {importingWhatsApp ? 'Importando...' : 'Importar Mensagens'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* AlertDialog de Confirmação para Zerar Mensagens */}
        <AlertDialog open={showDeleteWhatsAppDialog} onOpenChange={setShowDeleteWhatsAppDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Zerar Mensagens do WhatsApp</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja apagar todas as mensagens do WhatsApp deste lead? Esta operação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDeleteWhatsAppDialog(false)}
                disabled={deletingWhatsApp}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={deleteAllWhatsAppMessages}
                disabled={deletingWhatsApp}
              >
                {deletingWhatsApp ? 'Apagando...' : 'Sim, apagar tudo'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog de Envio de Mensagem WhatsApp */}
        <Dialog open={showSendWhatsAppDialog} onOpenChange={setShowSendWhatsAppDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Enviar Mensagem de WhatsApp</DialogTitle>
              <DialogDescription>
                Descreva o contexto da mensagem e a IA irá gerar uma mensagem personalizada com base no histórico do lead.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Contexto da mensagem</label>
                <Textarea
                  placeholder="Ex: Fazer follow-up da proposta enviada por email, perguntar sobre disponibilidade para reunião, etc."
                  value={whatsappContext}
                  onChange={(e) => setWhatsappContext(e.target.value)}
                  className="min-h-[100px]"
                  disabled={generatingWhatsApp}
                />
              </div>

              {!generatedWhatsAppMessage ? (
                <Button
                  onClick={handleGenerateWhatsAppMessage}
                  disabled={generatingWhatsApp || !whatsappContext.trim()}
                  className="w-full"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {generatingWhatsApp ? 'Gerando mensagem...' : 'Gerar Mensagem'}
                </Button>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Mensagem gerada (editável)</label>
                    <Textarea
                      value={generatedWhatsAppMessage}
                      onChange={(e) => setGeneratedWhatsAppMessage(e.target.value)}
                      className="min-h-[150px]"
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setGeneratedWhatsAppMessage('');
                        setWhatsappContext('');
                      }}
                      className="flex-1"
                    >
                      Gerar Nova Mensagem
                    </Button>
                    <Button
                      onClick={handleSendWhatsAppMessage}
                      disabled={sendingWhatsApp}
                      className="flex-1"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      {sendingWhatsApp ? 'Enviando...' : 'Enviar'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowSendWhatsAppDialog(false);
                  setWhatsappContext('');
                  setGeneratedWhatsAppMessage('');
                }}
              >
                Cancelar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Lista principal de emails
  return (
    <div className="min-h-screen bg-background p-4 md:p-8 overflow-x-hidden">
      <div className="max-w-6xl mx-auto overflow-x-hidden">
        <div className="mb-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-xl font-bold whitespace-nowrap">Oportunidades</h1>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {(loading || !hasFetched) && allLeads.length === 0 
                    ? 'Carregando...' 
                    : `${filteredCount}`
                  }
                </span>
              </div>
              <div className="flex gap-1 flex-wrap">
              {leadGroups.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleSelectAll}
                >
                  <CheckSquare className="h-3 w-3 mr-1" />
                  {selectedLeads.size === leadGroups.length ? "Desmarcar" : "Selecionar"}
                </Button>
              )}
              <Button 
                onClick={() => setShowImportDialog(true)} 
                variant="secondary"
                size="sm"
                className="h-7 px-2 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Importar
              </Button>
            </div>
          </div>
          </div>
          
          {/* Campo de Pesquisa + Filtro de Probabilidade */}
          <div className="mb-4 max-w-4xl mx-auto">
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="Pesquisar por nome ou email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              {([50, 60, 80] as const).map((pct) => (
                <Button
                  key={pct}
                  variant={probFilter === pct ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 px-2.5 text-xs whitespace-nowrap flex-shrink-0"
                  onClick={() => setProbFilter(prev => prev === pct ? 0 : pct)}
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  +{pct}%
                </Button>
              ))}
              <Button
                variant={priorityFilter === 'p1' ? 'default' : 'outline'}
                size="sm"
                className="h-9 px-2.5 text-xs whitespace-nowrap flex-shrink-0"
                title="Somente prioridade máxima (P1)"
                onClick={() => setPriorityFilter(prev => prev === 'p1' ? 'all' : 'p1')}
              >
                <Zap className="h-3 w-3 mr-1" />
                Mais prioritárias
              </Button>
              <Button
                variant={priorityFilter === 'p1p2' ? 'default' : 'outline'}
                size="sm"
                className="h-9 px-2.5 text-xs whitespace-nowrap flex-shrink-0"
                title="Prioridade alta e média (P1 + P2)"
                onClick={() => setPriorityFilter(prev => prev === 'p1p2' ? 'all' : 'p1p2')}
              >
                <Zap className="h-3 w-3 mr-1" />
                Prioritárias
              </Button>
            </div>
          </div>

          {/* Filtros Rápidos e Ordenação */}
          {(
            <div className="mb-4 max-w-4xl mx-auto">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Filtros Rápidos */}
                <div className="flex-1">
                  <h3 className="text-sm font-semibold mb-2">Filtros Rápidos</h3>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant={statusFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setStatusFilter('all')}
                    >
                      Todos
                    </Button>
                    <Button
                      variant={statusFilter === 'em_aberto' ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setStatusFilter('em_aberto')}
                    >
                      Aberto
                    </Button>
                    <Button
                      variant={statusFilter === 'em_negociacao' ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setStatusFilter('em_negociacao')}
                    >
                      Negociação
                    </Button>
                    <Button
                      variant={statusFilter === 'ganho_produzido' ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setStatusFilter('ganho_produzido')}
                    >
                      Ganho/Produzidos
                    </Button>
                    {(statusFilter === 'em_aberto') && (
                      <Button
                        variant={followupVencidoFilter ? 'default' : 'outline'}
                        size="sm"
                        className={`h-7 px-2 text-xs ${followupVencidoFilter ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' : 'border-destructive/50 text-destructive hover:bg-destructive/10'}`}
                        onClick={() => setFollowupVencidoFilter(!followupVencidoFilter)}
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Follow-ups Vencidos
                      </Button>
                    )}
                  </div>
                </div>

                {/* Ordenação */}
                <div className="flex-1">
                  <h3 className="text-sm font-semibold mb-2">Ordenar</h3>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant={sortType === 'priority' ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSortType('priority')}
                    >
                      <Zap className="h-3 w-3 mr-1" />
                      Prioridade
                    </Button>
                    <Button
                      variant={sortType === 'recent-message' ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSortType('recent-message')}
                    >
                      <MessageCircle className="h-3 w-3 mr-1" />
                      Recente
                    </Button>
                    <Button
                      variant={sortType === 'newest' ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSortType('newest')}
                    >
                      <CalendarDays className="h-3 w-3 mr-1" />
                      Novos
                    </Button>
                    <Button
                      variant={sortType === 'no-response' ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSortType('no-response')}
                    >
                      <Clock className="h-3 w-3 mr-1" />
                      Sem Resposta
                    </Button>
                    <Button
                      variant={sortType === 'probability' ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSortType('probability')}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      Chance
                    </Button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Mais Opções */}
          {(
            <Collapsible className="mb-4 max-w-4xl mx-auto">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-2 hover:bg-accent">
                  <h3 className="text-sm font-semibold">Mais Opções</h3>
                  <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground mb-2">Por Status</p>
                  <div className="flex md:flex-row flex-col gap-2 w-full">
                    <Button
                      variant={statusFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStatusFilter('all')}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      Todos
                    </Button>
                    <Button
                      variant={statusFilter === 'ganho' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStatusFilter('ganho')}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      Ganho
                    </Button>
                    <Button
                      variant={statusFilter === 'produzido' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStatusFilter('produzido')}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      Produzido
                    </Button>
                    <Button
                      variant={statusFilter === 'entregue' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStatusFilter('entregue')}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      Entregue
                    </Button>
                    <Button
                      variant={statusFilter === 'perdido' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStatusFilter('perdido')}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      Perdido
                    </Button>
                  </div>
                </div>
                
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground mb-2">Por Produto</p>
                  <div className="flex md:flex-row flex-col gap-2 w-full">
                    <Button
                      variant={produtoFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setProdutoFilter('all')}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      Todos
                    </Button>
                    <Button
                      variant={produtoFilter === 'palestra_consultoria' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setProdutoFilter('palestra_consultoria')}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      Palestras e Consultoria
                    </Button>
                    <Button
                      variant={produtoFilter === 'palestra' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setProdutoFilter('palestra')}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      Palestras
                    </Button>
                    <Button
                      variant={produtoFilter === 'consultoria' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setProdutoFilter('consultoria')}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      Consultoria
                    </Button>
                    <Button
                      variant={produtoFilter === 'publicidade' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setProdutoFilter('publicidade')}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      Publicidade
                    </Button>
                    <Button
                      variant={produtoFilter === 'documentario' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setProdutoFilter('documentario')}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      Documentário
                    </Button>
                  </div>
                  {/* Sub-filtro de subtipo de publicidade */}
                  {produtoFilter === 'publicidade' && (
                    <div className="flex md:flex-row flex-col gap-2 w-full mt-2 ml-0 md:ml-4">
                      <Button
                        variant={publicidadeSubtipoFilter === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPublicidadeSubtipoFilter('all')}
                        className="md:flex-none w-full md:w-auto justify-start text-xs"
                      >
                        Todos
                      </Button>
                      <Button
                        variant={publicidadeSubtipoFilter === 'longo' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPublicidadeSubtipoFilter('longo')}
                        className="md:flex-none w-full md:w-auto justify-start text-xs"
                      >
                        Longo
                      </Button>
                      <Button
                        variant={publicidadeSubtipoFilter === 'curto' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPublicidadeSubtipoFilter('curto')}
                        className="md:flex-none w-full md:w-auto justify-start text-xs"
                      >
                        Curto
                      </Button>
                      <Button
                        variant={publicidadeSubtipoFilter === 'insercao' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPublicidadeSubtipoFilter('insercao')}
                        className="md:flex-none w-full md:w-auto justify-start text-xs"
                      >
                        Inserção
                      </Button>
                      <Button
                        variant={publicidadeSubtipoFilter === 'longo_curto' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPublicidadeSubtipoFilter('longo_curto')}
                        className="md:flex-none w-full md:w-auto justify-start text-xs"
                      >
                        Longo+Curto
                      </Button>
                      <Button
                        variant={publicidadeSubtipoFilter === 'linkedin' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPublicidadeSubtipoFilter('linkedin')}
                        className="md:flex-none w-full md:w-auto justify-start text-xs"
                      >
                        LinkedIn
                      </Button>
                      <Button
                        variant={publicidadeSubtipoFilter === 'newsletter' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPublicidadeSubtipoFilter('newsletter')}
                        className="md:flex-none w-full md:w-auto justify-start text-xs"
                      >
                        Newsletter
                      </Button>
                    </div>
                  )}
                </div>
                
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground mb-2">Outros Filtros</p>
                  <div className="flex md:flex-row flex-col gap-2 w-full">
                    <Button
                      variant={pendingResponseFilter ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPendingResponseFilter(!pendingResponseFilter)}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Pendente de Resposta
                      {pendingResponseFilter && <X className="h-3 w-3 ml-1" />}
                    </Button>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-2">Ações</p>
                  <div className="flex md:flex-row flex-col gap-2 w-full">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const filteredLeads = leadGroups.map(group => allLeads.find(l => l.id === group.leadId)).filter(Boolean);
                        const statusMap: Record<string, string> = {
                          em_aberto: 'Em Aberto',
                          em_negociacao: 'Negociação',
                          ganho: 'Ganho',
                          perdido: 'Perdido',
                          entregue: 'Entregue',
                          produzido: 'Produzido',
                        };
                        const leadsText = filteredLeads.map((lead, index) => {
                          const parts = [`${index + 1}. ${lead?.name}`];
                          if (lead?.description) parts.push(lead.description);
                          const produto = lead?.produto;
                          if (produto) {
                            let produtoLabel = produto.charAt(0).toUpperCase() + produto.slice(1);
                            if (produto === 'publicidade' && lead?.publicidade_subtipo) {
                              produtoLabel += ` (${lead.publicidade_subtipo}${lead.publicidade_quantidade ? ` x${lead.publicidade_quantidade}` : ''})`;
                            }
                            parts.push(`Produto: ${produtoLabel}`);
                          }
                          if (lead?.status) {
                            parts.push(`Status: ${statusMap[lead.status] || lead.status}`);
                          }
                          return parts.join('\n');
                        }).join('\n\n');
                        
                        navigator.clipboard.writeText(leadsText).then(() => {
                          toast({
                            title: "Copiado!",
                            description: `${filteredLeads.length} leads copiados para a área de transferência.`,
                          });
                        }).catch(() => {
                          toast({
                            title: "Erro",
                            description: "Não foi possível copiar para a área de transferência.",
                            variant: "destructive",
                          });
                        });
                      }}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar Leads
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={generatingEmail || sendingEmail}
                      onClick={async () => {
                        const filteredLeads = leadGroups.map(group => allLeads.find(l => l.id === group.leadId)).filter(Boolean);
                        
                        if (filteredLeads.length === 0) {
                          toast({
                            title: "Nenhum lead",
                            description: "Não há leads para enviar e-mail de follow up.",
                            variant: "destructive",
                          });
                          return;
                        }

                        // Filtrar leads que têm email
                        const leadsWithEmail = filteredLeads.filter(lead => 
                          lead?.email || (lead?.emails && lead.emails.length > 0)
                        );

                        if (leadsWithEmail.length === 0) {
                          toast({
                            title: "Sem e-mails",
                            description: "Nenhum lead possui e-mail cadastrado.",
                            variant: "destructive",
                          });
                          return;
                        }

                        toast({
                          title: "Iniciando envio",
                          description: `Gerando e enviando e-mails para ${leadsWithEmail.length} leads...`,
                        });

                        let successCount = 0;
                        let errorCount = 0;

                        for (const lead of leadsWithEmail) {
                          if (!lead) continue;

                          try {
                            // Buscar mensagens de email do lead
                            const { data: emailMsgs } = await supabase
                              .from('email_messages')
                              .select('*')
                              .eq('lead_id', lead.id)
                              .order('timestamp', { ascending: false });

                            if (!emailMsgs || emailMsgs.length === 0) {
                              console.log(`Lead ${lead.name}: sem histórico de emails, pulando...`);
                              continue;
                            }

                            // Gerar email de follow up
                            const { data: emailData, error: genError } = await supabase.functions.invoke('generate-email-reply', {
                              body: {
                                emails: emailMsgs,
                                leadName: lead.name,
                                leadDescription: lead.description,
          leadLanguage: lead.language
                              }
                            });

                            if (genError || !emailData) {
                              console.error(`Erro ao gerar email para ${lead.name}:`, genError);
                              errorCount++;
                              continue;
                            }

                            // Preparar destinatários
                            const rawAddresses = (lead.emails && lead.emails.length > 0 ? lead.emails : [lead.email]) as (string | null | undefined)[];
                            const emailAddresses = Array.from(new Set(
                              (rawAddresses || [])
                                .filter((e): e is string => !!e)
                                .map((e) => e.trim())
                                .filter((e) => e.includes('@'))
                            ));

                            if (emailAddresses.length === 0) {
                              console.log(`Lead ${lead.name}: sem emails válidos`);
                              continue;
                            }

                            // Enviar email
                            const { error: sendError } = await supabase.functions.invoke('send-email', {
                              body: {
                                leadId: lead.id,
                                to: emailAddresses.join(','),
                                subject: emailData.subject,
                                body: emailData.body
                              }
                            });

                            if (sendError) {
                              console.error(`Erro ao enviar email para ${lead.name}:`, sendError);
                              errorCount++;
                            } else {
                              console.log(`✅ Email enviado para ${lead.name}`);
                              successCount++;
                            }
                          } catch (err) {
                            console.error(`Erro ao processar lead ${lead.name}:`, err);
                            errorCount++;
                          }
                        }

                        toast({
                          title: "Concluído",
                          description: `${successCount} emails enviados com sucesso${errorCount > 0 ? `, ${errorCount} erros` : ''}.`,
                          variant: successCount > 0 ? "default" : "destructive",
                        });
                      }}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Disparar E-mail de Follow Up
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isRunningAutoFollowups}
                      onClick={async () => {
                        setIsRunningAutoFollowups(true);
                        setAutoFollowupProgress({ total: 0, current: 0, currentLead: 'Iniciando...', sent: 0, skipped: 0, errors: 0, done: false, results: [] });
                        try {
                          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                          const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
                          const session = (await supabase.auth.getSession()).data.session;
                          // Roda o motor novo respeitando a cadência (só envia o que está vencido)
                          const response = await fetch(`${supabaseUrl}/functions/v1/followup-engine`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${session?.access_token || supabaseKey}`,
                              'apikey': supabaseKey,
                            },
                            body: JSON.stringify({}),
                          });

                          if (!response.ok) throw new Error(`HTTP ${response.status}`);

                          const data = await response.json();
                          const results = (data.results || []).map((r: any) => ({
                            lead: r.lead || r.lead_id || '?',
                            status: r.status,
                            reason: r.reason || r.error,
                          }));
                          setAutoFollowupProgress({
                            total: data.processed || results.length,
                            current: data.processed || results.length,
                            currentLead: '',
                            sent: data.sent || 0,
                            skipped: data.skipped || 0,
                            errors: data.errors || 0,
                            done: true,
                            results,
                          });
                          if (data.message === 'outside_send_window') {
                            toast({
                              title: 'Fora da janela de envio',
                              description: 'Follow-ups são enviados em dias úteis das 8h às 18h (BR). A fila foi verificada e higienizada.',
                            });
                          } else if (data.message === 'weekend_skip') {
                            toast({
                              title: 'Fim de semana',
                              description: 'Follow-ups são enviados apenas em dias úteis.',
                            });
                          }
                        } catch (err: any) {
                          toast({
                            title: "Erro ao disparar follow-ups",
                            description: err.message || "Erro desconhecido",
                            variant: "destructive",
                          });
                          setAutoFollowupProgress(null);
                        } finally {
                          setIsRunningAutoFollowups(false);
                        }
                      }}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${isRunningAutoFollowups ? 'animate-spin' : ''}`} />
                      {isRunningAutoFollowups ? 'Disparando...' : 'Disparar Follow-ups Automáticos'}
                    </Button>
                    <Link to="/configuracoes">
                      <Button
                        variant="outline"
                        size="sm"
                        className="md:flex-none w-full md:w-auto justify-start"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Config
                      </Button>
                    </Link>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Box de Valores em Aberto */}
          {statusFilter === 'em_aberto' && (() => {
            const hasAnyValue = emAbertoTotal.brl > 0 || emAbertoTotal.usd > 0 || emAbertoTotal.eur > 0;
            if (!hasAnyValue) return null;
            const BRL_TO_EUR = 0.18;
            const USD_TO_EUR = 0.92;
            const brlInEUR = emAbertoTotal.brl * BRL_TO_EUR;
            const usdInEUR = emAbertoTotal.usd * USD_TO_EUR;
            const eurDirect = emAbertoTotal.eur;
            const totalEUR = eurDirect + brlInEUR + usdInEUR;
            const pctBRL = totalEUR > 0 ? Math.round((brlInEUR / totalEUR) * 100) : 0;
            const pctUSD = totalEUR > 0 ? Math.round((usdInEUR / totalEUR) * 100) : 0;
            const pctEUR = totalEUR > 0 ? Math.round((eurDirect / totalEUR) * 100) : 0;
            return (
              <div className="mb-4 max-w-4xl mx-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-2 text-xs text-muted-foreground"
                  onClick={() => setShowTotalizer(!showTotalizer)}
                >
                  {showTotalizer ? 'Ocultar totalizador' : 'Mostrar totalizador'}
                  <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${showTotalizer ? 'rotate-180' : ''}`} />
                </Button>
                {showTotalizer && (
                  <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-3">
                    <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                      Em Aberto — {emAbertoTotal.count} {emAbertoTotal.count === 1 ? 'lead' : 'leads'}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {emAbertoTotal.brl > 0 && (
                        <div 
                          className={`p-3 bg-background rounded-md cursor-pointer transition-all ${moedaFilter === 'BRL' ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-blue-500/50'}`}
                          onClick={() => setMoedaFilter(moedaFilter === 'BRL' ? 'all' : 'BRL')}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-muted-foreground">Total em Reais</p>
                            <span className="text-xs font-semibold text-blue-600/70 dark:text-blue-400/70">{pctBRL}% do total</span>
                          </div>
                          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(emAbertoTotal.brl)}
                          </p>
                          <div className="mt-2 h-1.5 bg-blue-500/10 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${pctBRL}%` }} />
                          </div>
                        </div>
                      )}
                      {emAbertoTotal.usd > 0 && (
                        <div 
                          className={`p-3 bg-background rounded-md cursor-pointer transition-all ${moedaFilter === 'USD' ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-blue-500/50'}`}
                          onClick={() => setMoedaFilter(moedaFilter === 'USD' ? 'all' : 'USD')}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-muted-foreground">Total em Dólares</p>
                            <span className="text-xs font-semibold text-blue-600/70 dark:text-blue-400/70">{pctUSD}% do total</span>
                          </div>
                          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(emAbertoTotal.usd)}
                          </p>
                          <div className="mt-2 h-1.5 bg-blue-500/10 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${pctUSD}%` }} />
                          </div>
                        </div>
                      )}
                      {emAbertoTotal.eur > 0 && (
                        <div 
                          className={`p-3 bg-background rounded-md cursor-pointer transition-all ${moedaFilter === 'EUR' ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-blue-500/50'}`}
                          onClick={() => setMoedaFilter(moedaFilter === 'EUR' ? 'all' : 'EUR')}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-muted-foreground">Total em Euros</p>
                            <span className="text-xs font-semibold text-blue-600/70 dark:text-blue-400/70">{pctEUR}% do total</span>
                          </div>
                          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                            {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(emAbertoTotal.eur)}
                          </p>
                          <div className="mt-2 h-1.5 bg-blue-500/10 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${pctEUR}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="pt-3 border-t border-blue-500/20">
                      <div className="p-3 bg-blue-500/20 rounded-md">
                        <p className="text-xs text-blue-600/80 dark:text-blue-400/80 mb-1">Total Geral (em Euros)</p>
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalEUR)}
                        </p>
                        <p className="text-xs text-blue-600/60 dark:text-blue-400/60 mt-1">
                          Taxa: 1 EUR = 5,55 BRL{emAbertoTotal.usd > 0 ? ' | 1 USD = 0,92 EUR' : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Box de Valores em Negociação */}
          {statusFilter === 'em_negociacao' && (() => {
            const hasAnyValue = negociacaoTotal.brl > 0 || negociacaoTotal.usd > 0 || negociacaoTotal.eur > 0;
            const BRL_TO_EUR = 0.18;
            const USD_TO_EUR = 0.92;
            const brlInEUR = negociacaoTotal.brl * BRL_TO_EUR;
            const usdInEUR = negociacaoTotal.usd * USD_TO_EUR;
            const eurDirect = negociacaoTotal.eur;
            const totalEUR = eurDirect + brlInEUR + usdInEUR;
            const pctBRL = totalEUR > 0 ? Math.round((brlInEUR / totalEUR) * 100) : 0;
            const pctUSD = totalEUR > 0 ? Math.round((usdInEUR / totalEUR) * 100) : 0;
            const pctEUR = totalEUR > 0 ? Math.round((eurDirect / totalEUR) * 100) : 0;
            return hasAnyValue ? (
              <div className="mb-4 max-w-4xl mx-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-2 text-xs text-muted-foreground"
                  onClick={() => setShowTotalizer(!showTotalizer)}
                >
                  {showTotalizer ? 'Ocultar totalizador' : 'Mostrar totalizador'}
                  <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${showTotalizer ? 'rotate-180' : ''}`} />
                </Button>
                {showTotalizer && (
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg space-y-3">
                  <p className="text-sm font-medium text-primary">
                    Em Negociação — {negociacaoTotal.count} {negociacaoTotal.count === 1 ? 'lead' : 'leads'}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {negociacaoTotal.brl > 0 && (
                      <div 
                        className={`p-3 bg-background rounded-md cursor-pointer transition-all ${moedaFilter === 'BRL' ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-primary/50'}`}
                        onClick={() => setMoedaFilter(moedaFilter === 'BRL' ? 'all' : 'BRL')}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-muted-foreground">Total em Reais</p>
                          <span className="text-xs font-semibold text-primary/70">{pctBRL}% do total</span>
                        </div>
                        <p className="text-lg font-bold text-primary">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(negociacaoTotal.brl)}
                        </p>
                        <div className="mt-2 h-1.5 bg-primary/10 rounded-full overflow-hidden">
                          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pctBRL}%` }} />
                        </div>
                      </div>
                    )}
                    {negociacaoTotal.usd > 0 && (
                      <div 
                        className={`p-3 bg-background rounded-md cursor-pointer transition-all ${moedaFilter === 'USD' ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-primary/50'}`}
                        onClick={() => setMoedaFilter(moedaFilter === 'USD' ? 'all' : 'USD')}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-muted-foreground">Total em Dólares</p>
                          <span className="text-xs font-semibold text-primary/70">{pctUSD}% do total</span>
                        </div>
                        <p className="text-lg font-bold text-primary">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(negociacaoTotal.usd)}
                        </p>
                        <div className="mt-2 h-1.5 bg-primary/10 rounded-full overflow-hidden">
                          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pctUSD}%` }} />
                        </div>
                      </div>
                    )}
                    {negociacaoTotal.eur > 0 && (
                      <div 
                        className={`p-3 bg-background rounded-md cursor-pointer transition-all ${moedaFilter === 'EUR' ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-primary/50'}`}
                        onClick={() => setMoedaFilter(moedaFilter === 'EUR' ? 'all' : 'EUR')}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-muted-foreground">Total em Euros</p>
                          <span className="text-xs font-semibold text-primary/70">{pctEUR}% do total</span>
                        </div>
                        <p className="text-lg font-bold text-primary">
                          {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(negociacaoTotal.eur)}
                        </p>
                        <div className="mt-2 h-1.5 bg-primary/10 rounded-full overflow-hidden">
                          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pctEUR}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="pt-3 border-t border-primary/20">
                    <div className="p-3 bg-primary/20 rounded-md">
                      <p className="text-xs text-primary/80 mb-1">Total Geral (em Euros)</p>
                      <p className="text-2xl font-bold text-primary">
                        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalEUR)}
                      </p>
                      <p className="text-xs text-primary/60 mt-1">
                        Taxa: 1 EUR = 5,55 BRL{negociacaoTotal.usd > 0 ? ' | 1 USD = 0,92 EUR' : ''}
                      </p>
                    </div>
                  </div>
                </div>
                )}
              </div>
            ) : null;
          })()}

          {/* Box de Valores a Receber */}
          {(statusFilter === 'ganho' || statusFilter === 'ganho_produzido') && (() => {
            
            
            const totals = leadGroups.reduce((acc, group) => {
              const lead = allLeads.find(l => l.id === group.leadId);
              const valorTotal = lead?.valor || 0;
              const valorPago = lead?.valor_pago || 0;
              const valorRestante = Math.max(0, valorTotal - valorPago);
              const moeda = lead?.moeda || 'BRL';
              
              if (moeda === 'BRL') {
                acc.brl += valorRestante;
              } else if (moeda === 'USD') {
                acc.usd += valorRestante;
              } else if (moeda === 'EUR') {
                acc.eur += valorRestante;
              }
              
              return acc;
            }, { brl: 0, usd: 0, eur: 0 });
            
            const BRL_TO_EUR = 0.18;
            const USD_TO_EUR = 0.92;
            const brlInEUR = totals.brl * BRL_TO_EUR;
            const usdInEUR = totals.usd * USD_TO_EUR;
            const eurDirect = totals.eur;
            const totalEUR = eurDirect + brlInEUR + usdInEUR;
            const pctBRL = totalEUR > 0 ? Math.round((brlInEUR / totalEUR) * 100) : 0;
            const pctUSD = totalEUR > 0 ? Math.round((usdInEUR / totalEUR) * 100) : 0;
            const pctEUR = totalEUR > 0 ? Math.round((eurDirect / totalEUR) * 100) : 0;

            const hasAnyValue = totals.brl > 0 || totals.usd > 0 || totals.eur > 0;
            
            return hasAnyValue ? (
              <div className="mb-4 max-w-4xl mx-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-2 text-xs text-muted-foreground"
                  onClick={() => setShowTotalizer(!showTotalizer)}
                >
                  {showTotalizer ? 'Ocultar totalizador' : 'Mostrar totalizador'}
                  <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${showTotalizer ? 'rotate-180' : ''}`} />
                </Button>
                {showTotalizer && (
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg space-y-3">
                  <p className="text-sm font-medium text-primary mb-2">
                    Valores a Receber
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {totals.brl > 0 && (
                      <div 
                        className={`p-3 bg-background rounded-md cursor-pointer transition-all ${moedaFilter === 'BRL' ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-primary/50'}`}
                        onClick={() => setMoedaFilter(moedaFilter === 'BRL' ? 'all' : 'BRL')}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-muted-foreground">Total em Reais</p>
                          <span className="text-xs font-semibold text-primary/70">{pctBRL}% do total</span>
                        </div>
                        <p className="text-lg font-bold text-primary">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.brl)}
                        </p>
                        <div className="mt-2 h-1.5 bg-primary/10 rounded-full overflow-hidden">
                          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pctBRL}%` }} />
                        </div>
                      </div>
                    )}
                    
                    {totals.usd > 0 && (
                      <div 
                        className={`p-3 bg-background rounded-md cursor-pointer transition-all ${moedaFilter === 'USD' ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-primary/50'}`}
                        onClick={() => setMoedaFilter(moedaFilter === 'USD' ? 'all' : 'USD')}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-muted-foreground">Total em Dólares</p>
                          <span className="text-xs font-semibold text-primary/70">{pctUSD}% do total</span>
                        </div>
                        <p className="text-lg font-bold text-primary">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totals.usd)}
                        </p>
                        <div className="mt-2 h-1.5 bg-primary/10 rounded-full overflow-hidden">
                          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pctUSD}%` }} />
                        </div>
                      </div>
                    )}
                    
                    {totals.eur > 0 && (
                      <div 
                        className={`p-3 bg-background rounded-md cursor-pointer transition-all ${moedaFilter === 'EUR' ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-primary/50'}`}
                        onClick={() => setMoedaFilter(moedaFilter === 'EUR' ? 'all' : 'EUR')}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-muted-foreground">Total em Euros</p>
                          <span className="text-xs font-semibold text-primary/70">{pctEUR}% do total</span>
                        </div>
                        <p className="text-lg font-bold text-primary">
                          {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totals.eur)}
                        </p>
                        <div className="mt-2 h-1.5 bg-primary/10 rounded-full overflow-hidden">
                          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pctEUR}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="pt-3 border-t border-primary/20">
                    <div className="p-3 bg-primary/20 rounded-md">
                      <p className="text-xs text-primary/80 mb-1">Total Geral (em Euros)</p>
                      <p className="text-2xl font-bold text-primary">
                        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalEUR)}
                      </p>
                      <p className="text-xs text-primary/60 mt-1">
                        Taxa: 1 EUR = 5,55 BRL{totals.usd > 0 ? ' | 1 USD = 0,92 EUR' : ''}
                      </p>
                    </div>
                  </div>
                </div>
                )}
              </div>
            ) : null;
          })()}

          {/* Box de Valores - Entregues */}
          {statusFilter === 'entregue' && (() => {
            // Taxa de câmbio BRL para USD (atualizar manualmente conforme necessário)
            const BRL_TO_USD = 0.20; // 1 BRL = 0.20 USD (aproximadamente 1 USD = 5 BRL)
            
            const totals = leadGroups.reduce((acc, group) => {
              const lead = allLeads.find(l => l.id === group.leadId);
              const valorTotal = lead?.valor || 0;
              const moeda = lead?.moeda || 'BRL';
              
              if (moeda === 'BRL') {
                acc.brl += valorTotal;
              } else if (moeda === 'USD') {
                acc.usd += valorTotal;
              } else if (moeda === 'EUR') {
                acc.eur += valorTotal;
              }
              
              return acc;
            }, { brl: 0, usd: 0, eur: 0 });
            
            // Converter EUR para USD (aproximadamente 1 EUR = 1.10 USD)
            const EUR_TO_USD = 1.10;
            const totalUSD = totals.usd + (totals.brl * BRL_TO_USD) + (totals.eur * EUR_TO_USD);
            
            const hasAnyValue = totals.brl > 0 || totals.usd > 0 || totals.eur > 0;
            
            return hasAnyValue ? (
              <div className="mb-4 max-w-4xl mx-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-2 text-xs text-muted-foreground"
                  onClick={() => setShowTotalizer(!showTotalizer)}
                >
                  {showTotalizer ? 'Ocultar totalizador' : 'Mostrar totalizador'}
                  <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${showTotalizer ? 'rotate-180' : ''}`} />
                </Button>
                {showTotalizer && (
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg space-y-3">
                  <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                    Valores Entregues
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {totals.brl > 0 && (
                      <div 
                        className={`p-3 bg-background rounded-md cursor-pointer transition-all ${moedaFilter === 'BRL' ? 'ring-2 ring-green-500' : 'hover:ring-1 hover:ring-green-500/50'}`}
                        onClick={() => setMoedaFilter(moedaFilter === 'BRL' ? 'all' : 'BRL')}
                      >
                        <p className="text-xs text-muted-foreground mb-1">Total em Reais</p>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.brl)}
                        </p>
                      </div>
                    )}
                    
                    {totals.usd > 0 && (
                      <div 
                        className={`p-3 bg-background rounded-md cursor-pointer transition-all ${moedaFilter === 'USD' ? 'ring-2 ring-green-500' : 'hover:ring-1 hover:ring-green-500/50'}`}
                        onClick={() => setMoedaFilter(moedaFilter === 'USD' ? 'all' : 'USD')}
                      >
                        <p className="text-xs text-muted-foreground mb-1">Total em Dólares</p>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totals.usd)}
                        </p>
                      </div>
                    )}
                    
                    {totals.eur > 0 && (
                      <div 
                        className={`p-3 bg-background rounded-md cursor-pointer transition-all ${moedaFilter === 'EUR' ? 'ring-2 ring-green-500' : 'hover:ring-1 hover:ring-green-500/50'}`}
                        onClick={() => setMoedaFilter(moedaFilter === 'EUR' ? 'all' : 'EUR')}
                      >
                        <p className="text-xs text-muted-foreground mb-1">Total em Euros</p>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">
                          {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totals.eur)}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="pt-3 border-t border-green-500/20">
                    <div className="p-3 bg-green-500/20 rounded-md">
                      <p className="text-xs text-green-600/80 dark:text-green-400/80 mb-1">Total Geral (em Dólares)</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD'
                        }).format(totalUSD)}
                      </p>
                      <p className="text-xs text-green-600/60 dark:text-green-400/60 mt-1">
                        Taxa: 1 USD = 5 BRL{totals.eur > 0 ? ' | 1 EUR = 1.10 USD' : ''}
                      </p>
                    </div>
                  </div>
                </div>
                )}
              </div>
            ) : null;
          })()}

        </div>

        {(loading || !hasFetched) && allLeads.length === 0 ? (
          <div className="max-w-4xl mx-auto grid gap-3 px-2 sm:px-0">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : leadGroups.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <Mail className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhum lead ainda</h3>
                <p className="text-muted-foreground mb-4">
                  Configure os webhooks para começar a receber leads.
                </p>
                <div className="space-y-4 mt-4">
                  <div className="p-4 bg-muted rounded-lg text-left">
                    <p className="text-sm font-medium mb-2">Z-API Webhook (WhatsApp):</p>
                    <code className="text-xs bg-background px-2 py-1 rounded block break-all">
                      https://tisdewbfpkrrtacppdwt.supabase.co/functions/v1/zapi-webhook
                    </code>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="max-w-4xl mx-auto grid gap-3 px-2 sm:px-0">
            {visibleLeadGroups.map((group) => {
              const lead = allLeads.find(l => l.id === group.leadId);
              if (!lead) return null;
              
              const isSelected = selectedLeads.has(group.leadId);
              const isOld = lead.last_interaction ? isOlderThanWeek(lead.last_interaction) : false;
              
              const messageData = leadMessageData[group.leadId];
              
              return (
                <div key={group.leadId} className="mb-4 min-w-0">
                  <LeadCard
                    lead={lead}
                    isSelected={isSelected}
                    isOld={isOld}
                    generatingDescription={generatingDescription === group.leadId}
                    diagnosingLead={diagnosingLeadId === group.leadId}
                    onSelect={(e) => {
                      e.stopPropagation();
                      toggleLeadSelection(group.leadId);
                    }}
                    onGenerateDescription={(e) => {
                      e.stopPropagation();
                      generateDescription(group.leadId, e);
                    }}
                    onDiagnoseLead={(e) => handleDiagnoseSingleLead(group.leadId, e)}
                    onCardClick={() => {
                      // Salvar a posição do scroll antes de navegar para os detalhes
                      setScrollPosition(window.scrollY);
                      setSelectedLeadId(group.leadId);
                    }}
                    formatDate={formatDate}
                    getTimeAgo={getTimeAgo}
                    onArchive={async (leadId) => {
                      await handleArchiveLead(leadId);
                    }}
                    lastInboundMessage={messageData?.lastInboundMessage}
                    lastOutboundMessage={messageData?.lastOutboundMessage}
                    pendingResponse={messageData?.pendingResponse}
                    previousOpportunities={messageData?.previousOpportunities}
                    deliveryLogs={deliveryLogsMap[group.leadId] || []}
                    onSendToSara={handleSendToSara}
                    onSendToTiffany={handleSendToTiffany}
                    onMessageSent={(leadId, message) => {
                      const now = new Date().toISOString();
                      setLeadMessageData(prev => ({
                        ...prev,
                        [leadId]: {
                          ...prev[leadId],
                          lastOutboundMessage: { message, date: now, type: 'whatsapp' },
                          pendingResponse: false
                        }
                      }));
                      setAllLeads(leads => leads.map(l => 
                        l.id === leadId ? { 
                          ...l, 
                          last_interaction: now,
                          last_outbound_message_text: message,
                          last_outbound_message_at: now
                        } : l
                      ));
                      updateLeadInCache(leadId, { 
                        last_interaction: now,
                        last_outbound_message_text: message,
                        last_outbound_message_at: now
                      });
                    }}
                    onStatusChange={async (leadId, status) => {
                      const lead = allLeads.find(l => l.id === leadId);
                      if (!lead) return;

                      // Guardar estado anterior para rollback
                      const previousStatus = lead.status;
                      const previousData = { 
                        status: lead.status,
                        ganho_at: lead.ganho_at,
                        perdido_at: lead.perdido_at,
                        produzido_at: lead.produzido_at,
                        delivered_at: lead.delivered_at,
                        negociacao_at: lead.negociacao_at,
                        reopened_at: lead.reopened_at
                      };

                      // Usar função centralizada - só seta timestamps, nunca limpa
                      const updateData = buildStatusUpdateData(status as LeadStatus, lead);

                      const statusLabel =
                        status === 'em_aberto'
                          ? 'em aberto'
                          : status === 'ganho'
                            ? 'ganho'
                            : status === 'perdido'
                              ? 'perdido'
                              : status === 'entregue'
                                ? 'entregue'
                                : 'em negociação';

                      // Update otimista - remove da lista imediatamente
                      setAllLeads(leads => leads.map(l => 
                        l.id === leadId ? { ...l, ...updateData } : l
                      ));
                      updateLeadInCache(leadId, updateData);

                      toast({
                        title: 'Status atualizado',
                        description: `Lead marcado como ${statusLabel}.`,
                      });

                      try {
                        const { error } = await supabase
                          .from('leads')
                          .update(updateData)
                          .eq('id', leadId);

                        if (error) throw error;

                        // Se marcou como entregue e é cliente recorrente, oferecer nova oportunidade
                        if (status === 'entregue' && lead.is_recurring) {
                          setPendingDeliveredLeadId(leadId);
                          setShowNewOpportunityDialog(true);
                        }
                      } catch (error: any) {
                        // Reverter em caso de erro
                        setAllLeads(leads => leads.map(l => 
                          l.id === leadId ? { ...l, ...previousData } : l
                        ));
                        updateLeadInCache(leadId, previousData);
                        
                        console.error('Erro ao atualizar status:', error);
                        toast({
                          title: 'Erro',
                          description: 'Não foi possível atualizar o status.',
                          variant: 'destructive',
                        });
                      }
                    }}
                  />
                </div>
              );
            })}
            {hasMoreLeads && (
              <div className="flex justify-center py-4">
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount(prev => prev + VISIBLE_INCREMENT)}
                  className="w-full max-w-xs"
                >
                  Carregar mais ({leadGroups.length - visibleCount} restantes)
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      
      {selectedLeads.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 md:bottom-8 md:right-8 md:left-auto z-50">
          <div className="bg-background border rounded-lg shadow-lg p-3 md:p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedLeads.size} lead(s) selecionado(s)
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedLeads(new Set())}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 md:flex md:flex-row gap-2 w-full md:w-auto">
              <Button
                size="sm"
                variant="default"
                onClick={handleMarkAsWon}
                className="flex-1 md:flex-none md:w-auto justify-center md:justify-start bg-green-600 hover:bg-green-700 text-xs md:text-sm px-2 md:px-3"
              >
                <CheckCircle className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Ganho</span>
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleMarkAsLost}
                className="flex-1 md:flex-none md:w-auto justify-center md:justify-start text-xs md:text-sm px-2 md:px-3"
              >
                <XCircle className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Perdido</span>
              </Button>
              {false && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={async () => {
                    if (selectedLeads.size === 0) {
                      toast({
                        title: 'Nenhum lead selecionado',
                        description: 'Selecione pelo menos um lead para classificar',
                        variant: 'destructive',
                      });
                      return;
                    }

                    try {
                      const { error } = await supabase
                        .from('leads')
                        .update({ unclassified: false })
                        .in('id', Array.from(selectedLeads));

                      if (error) throw error;

                      toast({
                        title: 'Leads classificados!',
                        description: `${selectedLeads.size} lead(s) movido(s) para Oportunidades`,
                      });

                      setSelectedLeads(new Set());
                      await fetchLeads();
                    } catch (error) {
                      console.error('Erro ao classificar leads:', error);
                      toast({
                        title: 'Erro ao classificar',
                        description: 'Não foi possível classificar os leads',
                        variant: 'destructive',
                      });
                    }
                  }}
                  className="w-full md:w-auto justify-start"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Classificar como Oportunidade
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleArchiveSelected}
                className="flex-1 md:flex-none md:w-auto justify-center md:justify-start text-xs md:text-sm px-2 md:px-3"
              >
                <Archive className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Arquivar</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={generateMultipleDescriptions}
                disabled={generatingDescription !== null}
                className="flex-1 md:flex-none md:w-auto justify-center md:justify-start text-xs md:text-sm px-2 md:px-3"
              >
                <Sparkles className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Descrições</span>
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={handleBulkSendFollowupEmails}
                disabled={sendingBulkEmails}
                className="flex-1 md:flex-none md:w-auto justify-center md:justify-start text-xs md:text-sm px-2 md:px-3"
              >
                <Send className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">{sendingBulkEmails ? 'Enviando...' : 'E-mail'}</span>
              </Button>
              <Button
                size="sm"
                onClick={mergeLeads}
                disabled={merging || selectedLeads.size < 2}
                className="flex-1 md:flex-none md:w-auto justify-center md:justify-start text-xs md:text-sm px-2 md:px-3"
              >
                <Layers className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">{merging ? 'Mesclando...' : 'Mesclar'}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog de Importação */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar Lead</DialogTitle>
            <DialogDescription>
              Cole o texto ou uma imagem com as informações do lead e a IA extrairá automaticamente os dados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Textarea
                placeholder="Cole aqui o texto ou uma imagem com informações do lead (nome, email, telefone, etc.)"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                onPaste={handleImagePaste}
                className="min-h-[200px]"
                disabled={extracting || extractingImage || extractingFile || !!extractedData}
              />
              {(extractingImage || extractingFile) && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-md">
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <span className="text-sm text-muted-foreground">
                      {extractingFile ? 'Extraindo texto do arquivo...' : 'Extraindo texto da imagem...'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Anexar arquivo (PDF, imagem, texto) */}
            {!extractedData && (
              <div className="flex items-center gap-2">
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept="application/pdf,image/*,text/*,application/json,application/xml"
                  className="hidden"
                  onChange={handleImportFileSelect}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => importFileInputRef.current?.click()}
                  disabled={extracting || extractingImage || extractingFile}
                >
                  <Paperclip className="h-4 w-4 mr-2" />
                  Anexar arquivo (PDF, imagem)
                </Button>
                {importFile && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span className="truncate max-w-[240px]">{importFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setImportFile(null)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remover arquivo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {extractedData && (
              <div className="p-4 border rounded-lg space-y-3 bg-muted/50">
                <h4 className="font-semibold">Dados Extraídos (Editáveis):</h4>
                
                <div>
                  <label className="text-sm font-medium">Nome:</label>
                  <Input
                    value={editedData?.name || ''}
                    onChange={(e) => setEditedData({ ...editedData, name: e.target.value })}
                    placeholder="Nome do lead"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Emails (separados por vírgula):</label>
                  <Input
                    value={editedData?.emails?.join(', ') || ''}
                    onChange={(e) => setEditedData({ 
                      ...editedData, 
                      emails: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) 
                    })}
                    placeholder="email1@example.com, email2@example.com"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Telefones (separados por vírgula):</label>
                  <Input
                    value={editedData?.phones?.join(', ') || ''}
                    onChange={(e) => setEditedData({ 
                      ...editedData, 
                      phones: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) 
                    })}
                    placeholder="+55 11 99999-9999, +55 11 88888-8888"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Descrição:</label>
                  <Textarea
                    value={editedData?.description || ''}
                    onChange={(e) => setEditedData({ ...editedData, description: e.target.value })}
                    placeholder="Descrição do lead"
                    className="mt-1"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium">Valor:</label>
                    <Input
                      type="number"
                      value={editedData?.valor || ''}
                      onChange={(e) => setEditedData({ ...editedData, valor: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="0.00"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Moeda:</label>
                    <select
                      value={editedData?.moeda || 'BRL'}
                      onChange={(e) => setEditedData({ ...editedData, moeda: e.target.value })}
                      className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="BRL">R$ (BRL)</option>
                      <option value="USD">US$ (USD)</option>
                      <option value="EUR">€ (EUR)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Produto:</label>
                    <select
                      value={editedData?.produto || ''}
                      onChange={(e) => setEditedData({ ...editedData, produto: e.target.value || null })}
                      className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="">Não definido</option>
                      <option value="palestra">Palestra</option>
                      <option value="consultoria">Consultoria</option>
                      <option value="mentoria">Mentoria</option>
                      <option value="treinamento">Treinamento</option>
                      <option value="publicidade">Publicidade</option>
                            <option value="documentario">Documentário</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Origem:</label>
                  <select
                    value={editedData?.origem || ''}
                    onChange={(e) => setEditedData({ ...editedData, origem: e.target.value || null })}
                    className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">Não definido</option>
                    <option value="instagram">Instagram</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="email">E-mail</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="indicacao">Indicação</option>
                    <option value="site">Site</option>
                    <option value="evento">Evento</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="is_recurring"
                    checked={editedData?.is_recurring || false}
                    onCheckedChange={(checked) => setEditedData({ ...editedData, is_recurring: checked === true })}
                  />
                  <label htmlFor="is_recurring" className="text-sm font-medium cursor-pointer">
                    Cliente Recorrente
                    {editedData?.recurring_from_name && (
                      <span className="ml-1 text-muted-foreground font-normal">
                        (já existia: {editedData.recurring_from_name})
                      </span>
                    )}
                  </label>
                </div>

                {editedData?.recurring_from_name && (
                  <div className="text-xs text-muted-foreground bg-blue-500/10 border border-blue-500/30 rounded p-2">
                    💡 Encontramos {editedData.recurring_matches?.length || 1} lead(s) anterior(es) com nome similar. E-mail e telefone foram pré-preenchidos a partir de <strong>{editedData.recurring_from_name}</strong>.
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            {!extractedData ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowImportDialog(false);
                    setImportText('');
                    setImportFile(null);
                  }}
                  className="w-full sm:w-auto"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleExtractInfo}
                  disabled={extracting || extractingImage || extractingFile || !importText.trim()}
                  className="w-full sm:w-auto"
                >
                  {extracting ? 'Processando...' : 'Processar'}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setExtractedData(null);
                    setEditedData(null);
                  }}
                  className="w-full sm:w-auto"
                >
                  Voltar
                </Button>
                <Button
                  onClick={handleImportLead}
                  disabled={importing}
                  className="w-full sm:w-auto"
                >
                  {importing ? 'Importando...' : 'Aprovar e Importar'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Adicionar Nota */}
      <Dialog open={showAddNoteDialog} onOpenChange={setShowAddNoteDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Adicionar Nota</DialogTitle>
            <DialogDescription>
              Adicione informações adicionais sobre esta oportunidade.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Textarea
              placeholder="Digite sua nota aqui..."
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              className="min-h-[150px]"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddNoteDialog(false);
                setNewNoteText('');
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={addLeadNote}
              disabled={addingNote || !newNoteText.trim()}
            >
              {addingNote ? 'Salvando...' : 'Salvar Nota'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Email da Proposta */}
      <Dialog open={showProposalEmailDialog} onOpenChange={setShowProposalEmailDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email da Proposta</DialogTitle>
            <DialogDescription>
              Revise e edite o email antes de enviar para {allLeads.find(l => l.id === selectedLeadId)?.emails?.join(', ') || allLeads.find(l => l.id === selectedLeadId)?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Assunto</label>
              <Input
                value={proposalEmailSubject}
                onChange={(e) => setProposalEmailSubject(e.target.value)}
                placeholder="Assunto do email"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Mensagem</label>
              <Textarea
                value={proposalEmailBody}
                onChange={(e) => setProposalEmailBody(e.target.value)}
                placeholder="Corpo do email"
                className="min-h-[300px] font-mono text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowProposalEmailDialog(false);
                setProposalEmailSubject('');
                setProposalEmailBody('');
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                const lead = allLeads.find(l => l.id === selectedLeadId);
                if (!lead) return;

                setSendingProposalEmail(true);
                try {
                  const emails = lead.emails && lead.emails.length > 0 ? lead.emails : (lead.email ? [lead.email] : []);
                  
                  if (emails.length === 0) {
                    toast({
                      title: 'Erro',
                      description: 'Nenhum email encontrado para este lead.',
                      variant: 'destructive',
                    });
                    return;
                  }

                  // Converter texto para HTML
                  const htmlBody = proposalEmailBody.replace(/\n/g, '<br>');

                  const { error } = await supabase.functions.invoke('send-email', {
                    body: {
                      leadId: lead.id,
                      to: emails.join(','),
                      subject: proposalEmailSubject,
                      body: htmlBody
                    }
                  });

                  if (error) throw error;

                  toast({
                    title: 'Email enviado!',
                    description: `Email enviado para ${emails.join(', ')}`,
                  });

                  setShowProposalEmailDialog(false);
                  setProposalEmailSubject('');
                  setProposalEmailBody('');
                } catch (error) {
                  console.error('Erro ao enviar email:', error);
                  toast({
                    title: 'Erro',
                    description: 'Não foi possível enviar o email.',
                    variant: 'destructive',
                  });
                } finally {
                  setSendingProposalEmail(false);
                }
              }}
              disabled={sendingProposalEmail || !proposalEmailSubject.trim() || !proposalEmailBody.trim()}
            >
              <Send className="h-4 w-4 mr-2" />
              {sendingProposalEmail ? 'Enviando...' : 'Enviar Email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Dialog: Nova Oportunidade para Cliente Recorrente */}
      <Dialog open={showNewOpportunityDialog} onOpenChange={(open) => {
        setShowNewOpportunityDialog(open);
        if (!open) setPendingDeliveredLeadId(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar nova oportunidade?</DialogTitle>
            <DialogDescription>
              Este cliente é recorrente. Deseja criar uma nova oportunidade com os mesmos dados, já marcada como Ganho?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowNewOpportunityDialog(false);
              setPendingDeliveredLeadId(null);
            }}>
              Não, obrigado
            </Button>
            <Button
              onClick={async () => {
                if (!pendingDeliveredLeadId) return;
                setCreatingNewOpportunity(true);
                try {
                  const sourceLead = allLeads.find(l => l.id === pendingDeliveredLeadId);
                  if (!sourceLead) return;

                  const lastBusinessDay = getLastBusinessDayOfMonth();
                  const now = new Date().toISOString();
                  const sourceEmails = Array.from(new Set([
                    ...(sourceLead.emails || []),
                    sourceLead.email,
                  ].map(email => (email || '').trim()).filter(Boolean)));

                  const newLead = {
                    name: sourceLead.name,
                    email: sourceEmails[0] || sourceLead.email,
                    emails: sourceEmails,
                    phone: sourceLead.phone,
                    phones: sourceLead.phones || [],
                    produto: sourceLead.produto,
                    valor: sourceLead.valor,
                    moeda: (sourceLead.moeda || 'BRL') as 'BRL' | 'USD' | 'EUR',
                    is_recurring: true,
                    status: 'ganho' as const,
                    ganho_at: now,
                    data_proximo_pagamento: lastBusinessDay,
                    source: sourceLead.source,
                    description: sourceLead.description,
                  };

                  const { data: inserted, error } = await supabase
                    .from('leads')
                    .insert(newLead)
                    .select()
                    .single();

                  if (error) throw error;

                  if (inserted) {
                    const newLeadFull: Lead = {
                      ...inserted,
                      email: inserted.email || '',
                      message: inserted.message || null,
                      moeda: inserted.moeda as 'BRL' | 'USD' | 'EUR' | null,
                      produto: inserted.produto as Lead['produto'],
                      status: inserted.status as Lead['status'],
                    };
                    setAllLeads(prev => [newLeadFull, ...prev]);
                    addLeadToCache(newLeadFull);
                  }


                  toast({
                    title: 'Nova oportunidade criada!',
                    description: `Uma nova oportunidade foi criada para ${sourceLead.name} com status Ganho.`,
                  });
                  setShowNewOpportunityDialog(false);
                  setPendingDeliveredLeadId(null);
                } catch (error: any) {
                  console.error('Erro ao criar nova oportunidade:', error);
                  toast({
                    title: 'Erro',
                    description: 'Não foi possível criar a nova oportunidade.',
                    variant: 'destructive',
                  });
                } finally {
                  setCreatingNewOpportunity(false);
                }
              }}
              disabled={creatingNewOpportunity}
            >
              {creatingNewOpportunity ? 'Criando...' : 'Sim, criar nova oportunidade'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Progresso Follow-ups Automáticos */}
      <Dialog open={autoFollowupProgress !== null} onOpenChange={(open) => {
        if (!open && autoFollowupProgress?.done) {
          setAutoFollowupProgress(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 ${!autoFollowupProgress?.done ? 'animate-spin' : ''}`} />
              Follow-ups Automáticos
            </DialogTitle>
            <DialogDescription>
              {autoFollowupProgress?.done 
                ? autoFollowupProgress.total === 0
                  ? 'Nenhum lead elegível encontrado.'
                  : `Processamento concluído! ${autoFollowupProgress.sent} enviado(s), ${autoFollowupProgress.skipped} pulado(s).`
                : `Processando ${autoFollowupProgress?.current || 0} de ${autoFollowupProgress?.total || '...'} leads...`
              }
            </DialogDescription>
          </DialogHeader>
          
          {autoFollowupProgress && (
            <div className="space-y-4">
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{autoFollowupProgress.current} / {autoFollowupProgress.total}</span>
                  <span>{autoFollowupProgress.total > 0 ? Math.round((autoFollowupProgress.current / autoFollowupProgress.total) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                  <div 
                    className="bg-primary h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${autoFollowupProgress.total > 0 ? (autoFollowupProgress.current / autoFollowupProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Current lead being processed */}
              {!autoFollowupProgress.done && autoFollowupProgress.currentLead && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
                  <span className="truncate">{autoFollowupProgress.currentLead}</span>
                </div>
              )}

              {/* Counters */}
              <div className="flex gap-3 text-xs">
                <Badge variant="default" className="bg-primary">✉️ Enviados: {autoFollowupProgress.sent}</Badge>
                <Badge variant="secondary">⏭️ Pulados: {autoFollowupProgress.skipped}</Badge>
                {autoFollowupProgress.errors > 0 && (
                  <Badge variant="destructive">❌ Erros: {autoFollowupProgress.errors}</Badge>
                )}
              </div>

              {/* Recent results log */}
              {autoFollowupProgress.results.length > 0 && (
                <ScrollArea className="h-32 rounded-md border p-2">
                  <div className="space-y-1">
                    {autoFollowupProgress.results.slice(-15).reverse().map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span>{r.status === 'sent' ? '✅' : r.status === 'error' ? '❌' : '⏭️'}</span>
                        <span className="truncate font-medium">{r.lead}</span>
                        {r.reason && <span className="text-muted-foreground truncate">({r.reason})</span>}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {autoFollowupProgress.done && (
                <DialogFooter>
                  <Button onClick={() => setAutoFollowupProgress(null)} size="sm">
                    Fechar
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* FAB - Worker Mode */}
      <button
        onClick={() => navigateToWorker('/worker')}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
        title="Modo Worker"
      >
        <Zap className="h-6 w-6" />
      </button>

    </div>
  );
};

export default Opportunities;
