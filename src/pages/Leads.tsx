import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { migrateLeadChildren } from "@/lib/mergeLeadChildren";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Calendar, MessageSquare, ChevronRight, ArrowLeft, Edit2, Save, X, Phone, Archive, CheckSquare, Sparkles, Plus, ArrowUpDown, Clock, CalendarDays, MessageCircle, Mic, Send, ChevronDown, CheckCircle, XCircle, StickyNote, Brain } from "lucide-react";
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
import { formatEmailHtml, htmlToPlainText, plainTextToHtml } from "@/lib/emailUtils";

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
  description?: string | null;
  description_updated_at?: string | null;
  valor?: number | null;
  moeda?: 'BRL' | 'USD' | 'EUR' | null;
  produto?: 'palestra' | 'consultoria' | 'mentoria' | 'treinamento' | 'publicidade' | 'documentario' | null;
  status?: 'em_aberto' | 'em_negociacao' | 'ganho' | 'perdido' | 'entregue' | 'produzido' | null;
  suggested_followup?: string | null;
  valor_manually_edited?: boolean | null;
  publicidade_subtipo?: string | null;
  publicidade_quantidade?: number | null;
  // Campos de diagnóstico IA
  ai_diagnosis?: string | null;
  ai_close_probability?: number | null;
  ai_next_step?: string | null;
  ai_diagnosis_reason?: string | null;
  ai_diagnosis_updated_at?: string | null;
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

const Leads = () => {
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [leadGroups, setLeadGroups] = useState<LeadGroup[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
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
  const [viewMode, setViewMode] = useState<'opportunities' | 'unclassified' | 'archived'>('opportunities');
  const [generatingDescription, setGeneratingDescription] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importText, setImportText] = useState('');
  const [extractedData, setExtractedData] = useState<any>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractingImage, setExtractingImage] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editedData, setEditedData] = useState<any>(null);
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
  const [editingStatus, setEditingStatus] = useState(false);
  const [tempProduto, setTempProduto] = useState<string>('');
  const [tempValor, setTempValor] = useState<string>('');
  const [tempMoeda, setTempMoeda] = useState<'BRL' | 'USD' | 'EUR'>('BRL');
  const [tempStatus, setTempStatus] = useState<string>('');
  const [sortType, setSortType] = useState<'recent-message' | 'recent-inbound' | 'newest' | 'oldest' | 'no-response' | 'probability'>('recent-inbound');
  const [diagnosingLeads, setDiagnosingLeads] = useState(false);
  const [diagnosingLeadId, setDiagnosingLeadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'em_aberto' | 'em_negociacao' | 'ganho' | 'perdido' | 'entregue'>('em_aberto');
  const [pendingResponseFilter, setPendingResponseFilter] = useState(false);
  const [produtoFilter, setProdutoFilter] = useState<'all' | 'publicidade' | 'palestra' | 'consultoria' | 'palestra_consultoria' | 'documentario'>('all');
  const [editableFollowup, setEditableFollowup] = useState<string>('');
  const [directMessage, setDirectMessage] = useState<string>('');
  const [sendingDirectMessage, setSendingDirectMessage] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
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

  // Debug log para verificar mudanças no estado
  useEffect(() => {
    console.log('showAddNoteDialog mudou para:', showAddNoteDialog);
  }, [showAddNoteDialog]);
  const { toast } = useToast();

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

  useEffect(() => {
    fetchLeads();

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
            // Recarregar leads para recalcular last_inbound_message e reordenar
            fetchLeads();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'email_messages' },
        (payload: any) => {
          if (payload?.new?.direction === 'inbound') {
            console.log('Email inbound recebido:', payload);
            fetchLeads();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [toast, viewMode]);

  useEffect(() => {
    // Não agrupar mais por email - mostrar leads individuais
    const ignoredDomains = ['inventosdigitais.com.br', 'cloudmailin.net'];
    const isIgnored = (email: string) => email && ignoredDomains.some(d => email.toLowerCase().endsWith(`@${d}`));

    // Filtrar leads ignorados e criar grupos individuais
    let filteredLeads = allLeads.filter(lead => !isIgnored(lead.email));
    
    // Aplicar filtro de produto
    if (produtoFilter === 'publicidade') {
      filteredLeads = filteredLeads.filter(lead => lead.produto === 'publicidade');
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
    
    // Quando há pesquisa ativa, ignoramos filtros de status/pendente para
    // permitir encontrar qualquer lead (ex.: já entregue) pelo nome/email/telefone/descrição.
    const hasSearch = searchQuery.trim().length > 0;

    // Aplicar filtro de status (apenas quando não há pesquisa)
    if (!hasSearch) {
      if (statusFilter === 'em_aberto') {
        // Em Aberto: mostra apenas em_negociacao, exclui ganho, perdido e entregue
        filteredLeads = filteredLeads.filter(lead =>
          lead.status === 'em_negociacao'
        );
      } else if (statusFilter !== 'all') {
        filteredLeads = filteredLeads.filter(lead => lead.status === statusFilter);
      }
    }

    // Aplicar filtro de pendente de resposta (apenas quando não há pesquisa)
    if (!hasSearch && pendingResponseFilter) {
      filteredLeads = filteredLeads.filter(lead => {
        const tInbound = lead.last_inbound_message ? Date.parse(lead.last_inbound_message as string) : NaN;
        const tInteraction = lead.last_interaction ? Date.parse(lead.last_interaction as string) : NaN;
        if (Number.isNaN(tInbound)) return false;
        if (Number.isNaN(tInteraction)) return true;
        return tInbound >= tInteraction;
      });
    }

    // Aplicar filtro de pesquisa (nome, email, emails[], telefone, phones[], descrição)
    if (hasSearch) {
      const query = searchQuery.toLowerCase();
      const digits = query.replace(/\D/g, '');
      filteredLeads = filteredLeads.filter(lead => {
        if (lead.name?.toLowerCase().includes(query)) return true;
        if (lead.email?.toLowerCase().includes(query)) return true;
        if ((lead as any).emails?.some((e: string) => e?.toLowerCase().includes(query))) return true;
        if (lead.description?.toLowerCase().includes(query)) return true;
        if (digits.length >= 3) {
          if (lead.phone && String(lead.phone).replace(/\D/g, '').includes(digits)) return true;
          if ((lead as any).phones?.some((p: string) => p && String(p).replace(/\D/g, '').includes(digits))) return true;
        }
        return false;
      });
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
    
    setLeadGroups(groupsArray);
  }, [allLeads, sortType, searchQuery, statusFilter, pendingResponseFilter, produtoFilter]);

  // Buscar mensagens WhatsApp e Email quando um lead é selecionado
  useEffect(() => {
    if (selectedLeadId) {
      const lead = allLeads.find(l => l.id === selectedLeadId);
      
      if (lead) {
        // Buscar mensagens de email
        fetchEmailMessages(lead.id);
        
        // Buscar mensagens WhatsApp pelo lead_id (independente do formato do telefone)
        fetchWhatsAppMessages([lead.id]);
        
        // Buscar notas do lead
        fetchLeadNotes(lead.id);
        
        // Inicializar o campo editável com a sugestão atual
        setEditableFollowup(lead.suggested_followup || '');
      }
    }
  }, [selectedLeadId, allLeads]);

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
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .in('phone', phones)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setWhatsappMessages((data || []).map(m => ({
        ...m,
        direction: m.direction as 'inbound' | 'outbound'
      })));
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

  const handleRunDiagnosis = async () => {
    try {
      setDiagnosingLeads(true);
      toast({
        title: 'Iniciando diagnóstico',
        description: 'Analisando todos os leads em aberto e em negociação...',
      });
      
      const { data, error } = await supabase.functions.invoke('diagnose-leads');
      
      if (error) throw error;
      
      toast({
        title: 'Diagnóstico concluído!',
        description: `${data?.totalProcessed || 0} leads analisados. Ordenando por probabilidade...`,
      });
      
      // Recarregar leads para pegar os diagnósticos
      await fetchLeads();
      
      // Mudar ordenação para probabilidade
      setSortType('probability');
    } catch (error: any) {
      console.error('Erro no diagnóstico:', error);
      toast({
        title: 'Erro no diagnóstico',
        description: error.message || 'Erro ao executar diagnóstico IA',
        variant: 'destructive',
      });
    } finally {
      setDiagnosingLeads(false);
    }
  };

  const handleDiagnoseSingleLead = async (leadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      setDiagnosingLeadId(leadId);
      toast({
        title: 'Analisando lead...',
        description: 'Gerando diagnóstico completo com IA',
      });
      
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

  const sortLeadGroups = (groups: LeadGroup[]) => {
    const sorted = [...groups];
    
    switch (sortType) {
      case 'recent-message': {
        // Ordenar por última interação (qualquer mensagem - inbound ou outbound)
        const toTime = (d?: string) => {
          const t = d ? Date.parse(d) : NaN;
          return Number.isNaN(t) ? -Infinity : t;
        };

        return sorted.sort((a, b) => {
          const leadA = allLeads.find(l => l.id === a.leadId)!;
          const leadB = allLeads.find(l => l.id === b.leadId)!;
          const tA = toTime(leadA.last_interaction || leadA.updated_at);
          const tB = toTime(leadB.last_interaction || leadB.updated_at);
          return tB - tA; // Mais recente primeiro
        });
      }
      
      case 'recent-inbound': {
        // Ordenar por mensagem inbound mais recente (WhatsApp ou Email)
        // Leads SEM mensagens inbound sempre ficam no final
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
          if (tB !== tA) return tB - tA; // Mais recente primeiro
          // Desempate: última interação / updated_at
          const iA = toTime(leadA.last_interaction || leadA.updated_at);
          const iB = toTime(leadB.last_interaction || leadB.updated_at);
          return iB - iA;
        });

        // Para os sem inbound, manter updated_at desc
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
        // Ordenar pelos mais novos (created_at)
        return sorted.sort((a, b) => {
          const leadA = allLeads.find(l => l.id === a.leadId);
          const leadB = allLeads.find(l => l.id === b.leadId);
          const dateA = leadA?.created_at ? new Date(leadA.created_at).getTime() : 0;
          const dateB = leadB?.created_at ? new Date(leadB.created_at).getTime() : 0;
          return dateB - dateA;
        });
      }
      
      case 'oldest': {
        // Ordenar pelos mais antigos (created_at)
        return sorted.sort((a, b) => {
          const leadA = allLeads.find(l => l.id === a.leadId);
          const leadB = allLeads.find(l => l.id === b.leadId);
          const dateA = leadA?.created_at ? new Date(leadA.created_at).getTime() : 0;
          const dateB = leadB?.created_at ? new Date(leadB.created_at).getTime() : 0;
          return dateA - dateB;
        });
      }
      
      case 'no-response': {
        // Faz tempo sem responder - última interação mais antiga
        return sorted.sort((a, b) => {
          const leadA = allLeads.find(l => l.id === a.leadId);
          const leadB = allLeads.find(l => l.id === b.leadId);
          const dateA = leadA?.last_interaction ? new Date(leadA.last_interaction).getTime() : 0;
          const dateB = leadB?.last_interaction ? new Date(leadB.last_interaction).getTime() : 0;
          return dateA - dateB; // Mais antigo primeiro
        });
      }
      
      case 'probability': {
        // Ordenar por probabilidade de fechamento (maior primeiro)
        return sorted.sort((a, b) => {
          const leadA = allLeads.find(l => l.id === a.leadId);
          const leadB = allLeads.find(l => l.id === b.leadId);
          const probA = leadA?.ai_close_probability ?? -1;
          const probB = leadB?.ai_close_probability ?? -1;
          return probB - probA; // Maior probabilidade primeiro
        });
      }
      
      default:
        return sorted;
    }
  };

  const fetchLeads = async () => {
    try {
      let query = supabase.from('leads').select('*');
      
      // Filtrar baseado no modo de visualização
      if (viewMode === 'archived') {
        query = query.eq('archived', true);
      } else if (viewMode === 'unclassified') {
        query = query.eq('archived', false).eq('unclassified', true);
      } else {
        // opportunities
        query = query.eq('archived', false).eq('unclassified', false);
      }
      
      const { data, error } = await query.order('updated_at', { ascending: false });

      if (error) throw error;

      // Buscar contagens e última interação para cada lead
      const leadsWithCounts = await Promise.all((data || []).map(async (lead) => {
        // Contar e-mails total
        const { count: emailCount } = await supabase
          .from('email_messages')
          .select('id', { count: 'exact' })
          .eq('lead_id', lead.id)
          .limit(0);

        // Contar e-mails inbound
        const { count: emailInbound, error: emailInboundError } = await supabase
          .from('email_messages')
          .select('*', { count: 'exact', head: true })
          .eq('lead_id', lead.id)
          .eq('direction', 'inbound');
        
        if (emailInboundError) console.error('Error counting email inbound:', emailInboundError);

        // Contar e-mails outbound
        const { count: emailOutbound, error: emailOutboundError } = await supabase
          .from('email_messages')
          .select('*', { count: 'exact', head: true })
          .eq('lead_id', lead.id)
          .eq('direction', 'outbound');
        
        if (emailOutboundError) console.error('Error counting email outbound:', emailOutboundError);

        // Contar mensagens WhatsApp inbound
        const { count: whatsappInbound, error: whatsappInboundError } = await supabase
          .from('whatsapp_messages')
          .select('*', { count: 'exact', head: true })
          .eq('lead_id', lead.id)
          .eq('direction', 'inbound');
        
        if (whatsappInboundError) console.error('Error counting whatsapp inbound:', whatsappInboundError);

        // Contar mensagens WhatsApp outbound
        const { count: whatsappOutbound, error: whatsappOutboundError } = await supabase
          .from('whatsapp_messages')
          .select('*', { count: 'exact', head: true })
          .eq('lead_id', lead.id)
          .eq('direction', 'outbound');
        
        if (whatsappOutboundError) console.error('Error counting whatsapp outbound:', whatsappOutboundError);

        // Buscar última mensagem de email
        const { data: lastEmail } = await supabase
          .from('email_messages')
          .select('timestamp')
          .eq('lead_id', lead.id)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Buscar última mensagem WhatsApp
        const { data: lastWhatsapp } = await supabase
          .from('whatsapp_messages')
          .select('timestamp, created_at')
          .eq('lead_id', lead.id)
          .order('timestamp', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Buscar última mensagem INBOUND (email)
        const { data: lastInboundEmail } = await supabase
          .from('email_messages')
          .select('timestamp')
          .eq('lead_id', lead.id)
          .eq('direction', 'inbound')
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Buscar última mensagem INBOUND (whatsapp) - APENAS WHATSAPP para ordenação
        const { data: lastInboundWhatsapp } = await supabase
          .from('whatsapp_messages')
          .select('timestamp, created_at')
          .eq('lead_id', lead.id)
          .eq('direction', 'inbound')
          .order('timestamp', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Determinar última mensagem inbound (EMAIL OU WHATSAPP - o que for mais recente)
        let lastInbound = null;
        const inboundTimes = [];
        
        if (lastInboundEmail?.timestamp) {
          inboundTimes.push(new Date(lastInboundEmail.timestamp).getTime());
        }
        
        if (lastInboundWhatsapp?.timestamp || lastInboundWhatsapp?.created_at) {
          const whatsappTime = lastInboundWhatsapp.timestamp || lastInboundWhatsapp.created_at;
          inboundTimes.push(new Date(whatsappTime).getTime());
        }
        
        // Pegar o mais recente entre email e whatsapp inbound
        if (inboundTimes.length > 0) {
          const mostRecent = Math.max(...inboundTimes);
          lastInbound = new Date(mostRecent).toISOString();
        }

        // Determinar última interação (considera email e whatsapp)
        let lastInteraction = lead.updated_at;
        
        if (lastEmail?.timestamp) {
          const emailDate = new Date(lastEmail.timestamp);
          if (emailDate > new Date(lastInteraction)) {
            lastInteraction = lastEmail.timestamp;
          }
        }
        
        if (lastWhatsapp) {
          const whatsappDate = new Date(lastWhatsapp.timestamp || lastWhatsapp.created_at);
          if (whatsappDate > new Date(lastInteraction)) {
            lastInteraction = lastWhatsapp.timestamp || lastWhatsapp.created_at;
          }
        }

        return {
          ...lead,
          email_count: emailCount || 0,
          email_inbound_count: emailInbound || 0,
          email_outbound_count: emailOutbound || 0,
          whatsapp_inbound_count: whatsappInbound || 0,
          whatsapp_outbound_count: whatsappOutbound || 0,
          last_interaction: lastInteraction,
          last_inbound_message: lastInbound || undefined,
          produto: lead.produto as 'palestra' | 'consultoria' | 'mentoria' | 'treinamento' | 'publicidade' | 'documentario' | null,
          moeda: lead.moeda as 'BRL' | 'USD' | 'EUR' | null,
          status: lead.status as 'em_negociacao' | 'ganho' | 'perdido' | 'entregue' | null,
        };
      }));

      setAllLeads(leadsWithCounts);
    } catch (error) {
      console.error('Erro ao buscar leads:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os leads.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  const getLeadsByEmail = (email: string) => {
    return allLeads.filter(lead => lead.email === email);
  };

  const fetchWhatsAppMessages = async (leadIds: string[], phone?: string) => {
    try {
      let query = supabase.from('whatsapp_messages').select('*');
      if (phone) {
        query = query.eq('phone', phone);
      } else if (leadIds.length > 0) {
        query = query.in('lead_id', leadIds);
      } else {
        return;
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      setWhatsappMessages((data || []).map(m => ({
        ...m,
        direction: m.direction as 'inbound' | 'outbound'
      })));
    } catch (error) {
      console.error('Erro ao buscar mensagens WhatsApp:', error);
    }
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeads(prev => {
      const newSet = new Set(prev);
      if (newSet.has(leadId)) {
        newSet.delete(leadId);
      } else {
        newSet.add(leadId);
      }
      return newSet;
    });
  };

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
      
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          name: mergedName,
          emails: emailsArray,
          phones: phonesArray,
          email: emailsArray.length > 0 ? emailsArray[0] : (primaryLead.email || ''),
          phone: phonesArray[0] || null,
          message: allMessages.join('\n\n---\n\n'),
          archived: false,
          unclassified: false
        })
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

  const handleArchiveLead = async (leadId: string) => {
    try {
      const { error } = await supabase
        .from("leads")
        .update({ archived: true })
        .eq("id", leadId);

      if (error) throw error;

      toast({
        title: "Lead arquivado",
        description: "O lead foi arquivado com sucesso.",
      });

      setSelectedLeadId(null);
      await fetchLeads();
    } catch (error) {
      console.error("Error archiving lead:", error);
      toast({
        title: "Erro",
        description: "Não foi possível arquivar o lead.",
        variant: "destructive",
      });
    }
  };

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

      setExtractedData(data);
      setEditedData(data); // Inicializar dados editáveis
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

      toast({
        title: 'Lead importado',
        description: 'O lead foi criado com sucesso.',
      });

      // Resetar estados e fechar dialog
      setShowImportDialog(false);
      setImportText('');
      setExtractedData(null);
      setEditedData(null);
      
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
        const { data: messages, error: fetchError } = await supabase
          .from('whatsapp_messages')
          .select('*')
          .eq('lead_id', firstLead.id)
          .order('created_at', { ascending: true });

        if (fetchError) {
          console.error('Erro ao recarregar mensagens:', fetchError);
        } else {
          console.log(`${messages?.length || 0} mensagens carregadas`);
          setWhatsappMessages((messages || []) as WhatsAppMessage[]);
        }
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

    // Usar o telefone fornecido ou o primeiro da lista
    const targetPhone = phone || firstLead.phones[0];

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

      // Recarregar mensagens WhatsApp e rolar para o final
      if (firstLead.phones && firstLead.phones.length > 0) {
        fetchWhatsAppMessagesByPhones(firstLead.phones);
      }
      setTimeout(scrollWhatsappToBottom, 150);
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
      
      console.error('Erro ao atualizar valor:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o valor.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveStatus = async () => {
    if (!selectedLeadId) return;
    
    const lead = allLeads.find(l => l.id === selectedLeadId);
    if (!lead) return;

    const statusValue = tempStatus || null;
    const previousStatus = lead.status;

    // Update otimista - atualiza UI imediatamente
    setAllLeads(leads => leads.map(l => 
      l.id === selectedLeadId ? { ...l, status: statusValue as any } : l
    ));
    setEditingStatus(false);

    toast({
      title: 'Status atualizado',
      description: 'O status do lead foi atualizado com sucesso.',
    });

    try {
      const { error } = await supabase
        .from('leads')
        .update({ status: statusValue as 'em_negociacao' | 'ganho' | 'perdido' | 'entregue' | null })
        .eq('id', lead.id);

      if (error) throw error;
    } catch (error: any) {
      // Reverter em caso de erro
      setAllLeads(leads => leads.map(l => 
        l.id === selectedLeadId ? { ...l, status: previousStatus } : l
      ));
      
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
      <div className="min-h-screen bg-background p-8 overflow-x-hidden">
        <div className="max-w-6xl mx-auto overflow-x-hidden">
          <h1 className="text-4xl font-bold mb-8">Carregando leads...</h1>
        </div>
      </div>
    );
  }

  // Se um lead foi selecionado, mostrar detalhes
  if (selectedLeadId) {
    const lead = allLeads.find(l => l.id === selectedLeadId);
    const firstLead = lead;
    
    return (
      <div className="min-h-screen bg-background p-8 overflow-x-hidden">
        <div className="max-w-6xl mx-auto overflow-x-hidden">
          <Button 
            variant="ghost" 
            className="mb-6"
            onClick={() => {
              setSelectedLeadId(null);
              setWhatsappMessages([]);
              setEmailMessages([]);
              // Restaurar posição do scroll após um pequeno delay para garantir que o DOM foi renderizado
              setTimeout(() => {
                window.scrollTo({ top: scrollPosition, behavior: 'instant' });
              }, 0);
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para lista
          </Button>
          
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
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
                    <Mail className="h-10 w-10" />
                    {firstLead?.name || firstLead?.email || 'Lead sem email'}
                  </h1>
                  <div className="space-y-1">
                    {firstLead?.emails && firstLead.emails.length > 0 ? (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Emails:</p>
                        {firstLead.emails.map((email, idx) => (
                          <p key={idx} className="text-muted-foreground">{email}</p>
                        ))}
                      </div>
                    ) : null}
                    {firstLead?.phones && firstLead.phones.length > 0 && (
                      <div className={firstLead?.emails && firstLead.emails.length > 0 ? 'mt-2' : ''}>
                        <p className="text-sm font-medium text-muted-foreground">Telefones:</p>
                        {uniqueNormalizedPhones(firstLead.phones).map((norm, idx) => (
                          <p key={idx} className="text-sm text-muted-foreground flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            {`+55 ${norm}`}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  {firstLead?.description && (
                    <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/10">
                      <p className="text-sm font-semibold text-foreground mb-1">Descrição:</p>
                      <p className="text-sm italic text-muted-foreground">{firstLead.description}</p>
                      {firstLead.description_updated_at && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Atualizada: {formatDate(firstLead.description_updated_at)}
                        </p>
                      )}
                    </div>
                  )}
                  
                  {/* Status, Produto e Valor - EDITÁVEIS */}
                  <div className="mt-4 space-y-3">
                    {/* Status */}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Status</label>
                      {editingStatus ? (
                        <div className="flex gap-2 mt-1">
                          <select
                            value={tempStatus}
                            onChange={(e) => setTempStatus(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <option value="">Selecione...</option>
                            <option value="em_aberto">Em Aberto</option>
                            <option value="em_negociacao">Em Negociação</option>
                            <option value="ganho">Ganho</option>
                            <option value="perdido">Perdido</option>
                            <option value="entregue">Entregue</option>
                          </select>
                          <Button size="sm" onClick={handleSaveStatus}>
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingStatus(false)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {firstLead?.status ? (
                            <Badge 
                              variant={
                                firstLead.status === 'ganho' ? 'default' : 
                                firstLead.status === 'entregue' ? 'default' : 
                                firstLead.status === 'perdido' ? 'destructive' : 
                                'secondary'
                              } 
                              className="text-sm"
                            >
                              {firstLead.status === 'em_aberto' ? 'Em Aberto' :
                               firstLead.status === 'em_negociacao' ? 'Em Negociação' : 
                               firstLead.status === 'ganho' ? 'Ganho' :
                               firstLead.status === 'entregue' ? 'Entregue' :
                               firstLead.status === 'perdido' ? 'Perdido' : 'Em Aberto'}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">Não definido</span>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setTempStatus(firstLead?.status || '');
                              setEditingStatus(true);
                            }}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={async () => {
                              try {
                                const { error } = await supabase
                                  .from('leads')
                                  .update({ status: 'ganho' })
                                  .eq('id', firstLead!.id);

                                if (error) throw error;

                                setAllLeads(prev => prev.map(l => 
                                  l.id === firstLead!.id ? { ...l, status: 'ganho' } : l
                                ));

                                toast({
                                  title: 'Status atualizado',
                                  description: 'Lead marcado como Ganho',
                                });
                              } catch (error: any) {
                                toast({
                                  title: 'Erro',
                                  description: error.message,
                                  variant: 'destructive',
                                });
                              }
                            }}
                          >
                            Ganho
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={async () => {
                              try {
                                const { error } = await supabase
                                  .from('leads')
                                  .update({ status: 'perdido' })
                                  .eq('id', firstLead!.id);

                                if (error) throw error;

                                setAllLeads(prev => prev.map(l => 
                                  l.id === firstLead!.id ? { ...l, status: 'perdido' } : l
                                ));

                                toast({
                                  title: 'Status atualizado',
                                  description: 'Lead marcado como Perdido',
                                });
                              } catch (error: any) {
                                toast({
                                  title: 'Erro',
                                  description: error.message,
                                  variant: 'destructive',
                                });
                              }
                            }}
                          >
                            Perdido
                          </Button>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Produto</label>
                      {editingProduto ? (
                        <div className="flex gap-2 mt-1">
                          <select
                            value={tempProduto}
                            onChange={(e) => setTempProduto(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <option value="">Selecione...</option>
                            <option value="palestra">Palestra</option>
                            <option value="consultoria">Consultoria</option>
                            <option value="mentoria">Mentoria</option>
                            <option value="treinamento">Treinamento</option>
                            <option value="publicidade">Publicidade</option>
                            <option value="documentario">Documentário</option>
                          </select>
                          <Button size="sm" onClick={handleSaveProduto}>
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingProduto(false)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-1">
                          {firstLead?.produto ? (
                            <Badge variant="secondary" className="text-sm capitalize">{firstLead.produto}</Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">Não definido</span>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setTempProduto(firstLead?.produto || '');
                              setEditingProduto(true);
                            }}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Valor da Oportunidade</label>
                      {editingValor ? (
                        <div className="flex gap-2 mt-1">
                          <select
                            value={tempMoeda}
                            onChange={(e) => setTempMoeda(e.target.value as 'BRL' | 'USD' | 'EUR')}
                            className="flex h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <option value="BRL">R$</option>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                          </select>
                          <Input
                            value={tempValor}
                            onChange={(e) => setTempValor(e.target.value)}
                            placeholder="0.00"
                            className="h-9 flex-1"
                          />
                          <Button size="sm" onClick={handleSaveValor}>
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingValor(false)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-1">
                          {firstLead?.valor ? (
                            <Badge variant="outline" className="text-sm">
                              💰 {firstLead.moeda === 'USD' ? 'USD' : firstLead.moeda === 'EUR' ? 'EUR' : 'R$'} {firstLead.valor.toLocaleString(firstLead.moeda === 'USD' ? 'en-US' : firstLead.moeda === 'EUR' ? 'de-DE' : 'pt-BR')}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">Não definido</span>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
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
                  </div>
                  
                  <p className="text-sm text-muted-foreground mt-2">
                    {emailMessages.length + whatsappMessages.filter(m => ((firstLead?.phones || []).map(normalizePhoneNumber)).includes(normalizePhoneNumber(m.phone)) || m.lead_id === firstLead?.id).length} mensagem
                    {(emailMessages.length + whatsappMessages.filter(m => ((firstLead?.phones || []).map(normalizePhoneNumber)).includes(normalizePhoneNumber(m.phone)) || m.lead_id === firstLead?.id).length) !== 1 ? 's' : ''} • 
                    {' '}{emailMessages.length} email{emailMessages.length !== 1 ? 's' : ''} • 
                    {' '}{whatsappMessages.filter(m => ((firstLead?.phones || []).map(normalizePhoneNumber)).includes(normalizePhoneNumber(m.phone)) || m.lead_id === firstLead?.id).length} WhatsApp
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => startEdit(firstLead)} variant="outline" size="sm">
                    <Edit2 className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  <Button 
                    onClick={(e) => generateDescription(firstLead.id, e)} 
                    variant="outline" 
                    size="sm"
                    disabled={generatingDescription === firstLead.id}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {generatingDescription === firstLead.id ? 'Atualizando...' : 'Atualizar Descrição'}
                  </Button>
                  <Button 
                    onClick={() => handleArchiveLead(firstLead.id)} 
                    variant="outline" 
                    size="sm"
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    Arquivar
                  </Button>
                  <Button 
                    onClick={() => setShowAddNoteDialog(true)} 
                    variant="default" 
                    size="sm"
                  >
                    <StickyNote className="h-4 w-4 mr-2" />
                    Adicionar Nota
                  </Button>
                </div>
              </div>
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
                WhatsApp ({whatsappMessages.filter(m => {
                  const set = new Set((firstLead?.phones || []).map(normalizePhoneNumber));
                  return set.has(normalizePhoneNumber(m.phone)) || m.lead_id === firstLead?.id;
                }).length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-4 mt-4">
              <div className="flex justify-end gap-2 mb-4">
                <Button 
                  onClick={handleGenerateEmail} 
                  variant="default" 
                  size="sm"
                  disabled={generatingEmail || emailMessages.length === 0}
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
                emailMessages.map((msg) => {
                  const leadEmail = firstLead?.emails ? getLeadEmailFromMessage(msg, firstLead.emails) : null;
                  const { from, to } = extractAllEmails(msg);
                  
                  return (
                    <Collapsible key={msg.id} defaultOpen={false}>
                      <Card>
                        <CardHeader>
                          <CollapsibleTrigger className="w-full">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 data-[state=open]:rotate-180" />
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">
                                  {formatDate(msg.timestamp)}
                                </span>
                              </div>
                              <Badge variant={msg.direction === 'inbound' ? 'secondary' : 'outline'}>
                                <Mail className="h-3 w-3 mr-1" />
                                {msg.direction === 'inbound' ? 'Recebido' : 'Enviado'}
                              </Badge>
                            </div>
                            
                            <div className="space-y-2 text-left">
                              {leadEmail && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-muted-foreground">Para:</span>
                                  <Badge variant="default" className="text-xs">
                                    {leadEmail}
                                  </Badge>
                                </div>
                              )}
                              {from.length > 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-muted-foreground">Remetente:</span>
                                  <span className="text-xs">{from[0]}</span>
                                </div>
                              )}
                              {(() => {
                                const allRecipients = [...to];
                                if (leadEmail && !allRecipients.some(e => e.toLowerCase() === leadEmail.toLowerCase())) {
                                  allRecipients.push(leadEmail);
                                }
                                return allRecipients.length > 0 && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-muted-foreground">Destinatário:</span>
                                    <span className="text-xs">{allRecipients.join(', ')}</span>
                                  </div>
                                );
                              })()}
                            </div>
                            
                            {msg.subject && (
                              <CardTitle className="text-lg mt-3 text-left">{msg.subject}</CardTitle>
                            )}
                          </CollapsibleTrigger>
                        </CardHeader>
                        
                        <CollapsibleContent>
                          {msg.message && (
                            <CardContent>
                              <div className="flex gap-2">
                                <MessageSquare className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                                <div className="flex-1">
                                  {msg.html_body || msg.message ? (
                                    <div
                                      className="text-sm break-words prose prose-sm max-w-none [&>p]:mb-2 [&>br]:my-1"
                                      dangerouslySetInnerHTML={{ 
                                        __html: DOMPurify.sanitize(
                                          formatEmailHtml(msg.html_body || msg.message, msg.direction === 'inbound'),
                                          {
                                            ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'span', 'div'],
                                            ALLOWED_ATTR: ['href', 'target', 'rel', 'class']
                                          }
                                        ) 
                                      }}
                                    />
                                  ) : (
                                    <p className="text-sm text-muted-foreground italic">
                                      Sem conteúdo
                                    </p>
                                  )}
                                </div>
                              </div>
                              {(() => {
                                const msgAttachments = emailAttachments.filter(a => a.email_message_id === msg.id);
                                return msgAttachments.length > 0 && (
                                  <div className="mt-4 pt-4 border-t">
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
                              })()}
                            </CardContent>
                          )}
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  );
                })
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
                        {norm.slice(-4)} ({whatsappMessages.filter(m => normalizePhoneNumber(m.phone) === norm).length})
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  
                  {uniqueNormalizedPhones(firstLead.phones).map((norm) => (
                    <TabsContent key={norm} value={norm} className="mt-4">
                      <ScrollArea className="h-[500px] pr-4" data-whatsapp-scroll>
                        <div className="space-y-2">
                          {whatsappMessages.filter(m => normalizePhoneNumber(m.phone) === norm).length === 0 ? (
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
                              .filter(m => normalizePhoneNumber(m.phone) === norm)
                              .sort((a, b) => new Date(a.timestamp || a.created_at).getTime() - new Date(b.timestamp || b.created_at).getTime())
                              .map((msg) => (
                                <div 
                                  key={msg.id} 
                                  className={`flex mb-2 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                                >
                                  <div className={`max-w-[70%] ${msg.direction === 'outbound' ? 'ml-auto' : 'mr-auto'}`}>
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
                                      <p className="text-sm whitespace-pre-wrap break-words">
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
                      {whatsappMessages.filter(m => ((firstLead?.phones || []).map(normalizePhoneNumber)).includes(normalizePhoneNumber(m.phone)) || m.lead_id === firstLead?.id).length === 0 ? (
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
                          .filter(m => ((firstLead?.phones || []).map(normalizePhoneNumber)).includes(normalizePhoneNumber(m.phone)) || m.lead_id === firstLead?.id)
                          .sort((a, b) => new Date(a.timestamp || a.created_at).getTime() - new Date(b.timestamp || b.created_at).getTime())
                          .map((msg) => (
                            <div 
                              key={msg.id} 
                              className={`flex mb-2 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                            >
                              <div className={`max-w-[70%] ${msg.direction === 'outbound' ? 'ml-auto' : 'mr-auto'}`}>
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
                                  <p className="text-sm whitespace-pre-wrap break-words">
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
    <div className="min-h-screen bg-background p-8 overflow-x-hidden">
      <div className="max-w-6xl mx-auto overflow-x-hidden">
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">Oportunidades</h1>
              <p className="text-muted-foreground">
                {leadGroups.length} oportunidade{leadGroups.length !== 1 ? 's' : ''}
              </p>
              {statusFilter === 'ganho' && (() => {
                const totalValor = leadGroups.reduce((sum, group) => {
                  const lead = allLeads.find(l => l.id === group.leadId);
                  return sum + (lead?.valor || 0);
                }, 0);
                
                return totalValor > 0 ? (
                  <div className="mt-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                    <p className="text-sm font-medium text-primary">
                      Valor Total a Receber
                    </p>
                    <p className="text-2xl font-bold text-primary">
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                      }).format(totalValor)}
                    </p>
                  </div>
                ) : null;
              })()}
            </div>
            <div className="flex gap-2 flex-wrap mb-4">
              <Button
                variant={viewMode === 'opportunities' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setViewMode('opportunities');
                  setSelectedLeads(new Set());
                }}
              >
                Oportunidades
              </Button>
              <Button
                variant={viewMode === 'unclassified' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setViewMode('unclassified');
                  setSelectedLeads(new Set());
                }}
              >
                Não Classificados
              </Button>
              <Button
                variant={viewMode === 'archived' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setViewMode('archived');
                  setSelectedLeads(new Set());
                }}
              >
                <Archive className="h-4 w-4 mr-2" />
                Arquivados
              </Button>
              {leadGroups.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                >
                  <CheckSquare className="h-4 w-4 mr-2" />
                  {selectedLeads.size === leadGroups.length ? "Desmarcar Todos" : "Selecionar Todos"}
                </Button>
              )}
              <Button 
                onClick={() => setShowImportDialog(true)} 
                variant="secondary"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Importar
              </Button>
            </div>
          </div>
          
          {/* Campo de Pesquisa */}
          <div className="mb-4 max-w-4xl mx-auto">
            <Input
              type="text"
              placeholder="Pesquisar por nome ou email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md"
            />
          </div>

          {/* Filtros */}
          {leadGroups.length > 0 && (
            <Collapsible className="mb-4 max-w-4xl mx-auto">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-2 hover:bg-accent">
                  <h3 className="text-sm font-semibold">Filtros</h3>
                  <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground mb-2">Por Status</p>
                  <div className="flex md:flex-row flex-col gap-2 w-full">
                    <Button
                      variant={statusFilter === 'em_aberto' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStatusFilter('em_aberto')}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      Em Aberto
                    </Button>
                    <Button
                      variant={statusFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStatusFilter('all')}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      Todos
                    </Button>
                    <Button
                      variant={statusFilter === 'em_negociacao' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStatusFilter('em_negociacao')}
                      className="md:flex-none w-full md:w-auto justify-start"
                    >
                      Em Negociação
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
                </div>
                
                <div className="mt-3">
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
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Botões de Ordenação */}
          {leadGroups.length > 0 && (
            <div className="mb-4 max-w-4xl mx-auto">
              <h3 className="text-sm font-semibold mb-2">Ordenar</h3>
              <div className="flex md:flex-row flex-col gap-2 w-full">
                <Button
                  variant={sortType === 'recent-inbound' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSortType('recent-inbound')}
                  className="md:flex-none w-full md:w-auto justify-start"
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Mensagem Recente
                </Button>
                <Button
                  variant={sortType === 'newest' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSortType('newest')}
                  className="md:flex-none w-full md:w-auto justify-start"
                >
                  <CalendarDays className="h-4 w-4 mr-2" />
                  Mais Novos
                </Button>
                <Button
                  variant={sortType === 'oldest' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSortType('oldest')}
                  className="md:flex-none w-full md:w-auto justify-start"
                >
                  <CalendarDays className="h-4 w-4 mr-2" />
                  Mais Antigos
                </Button>
                <Button
                  variant={sortType === 'no-response' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSortType('no-response')}
                  className="md:flex-none w-full md:w-auto justify-start"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Sem Resposta
                </Button>
                <Button
                  variant={sortType === 'probability' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSortType('probability')}
                  className="md:flex-none w-full md:w-auto justify-start"
                >
                  <Brain className="h-4 w-4 mr-2" />
                  Probabilidade
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRunDiagnosis}
                  disabled={diagnosingLeads}
                  className="md:flex-none w-full md:w-auto justify-start"
                >
                  <Brain className={`h-4 w-4 mr-2 ${diagnosingLeads ? 'animate-spin' : ''}`} />
                  {diagnosingLeads ? 'Diagnosticando...' : 'Rodar Diagnóstico IA'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {leadGroups.length === 0 ? (
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
          <div className="max-w-4xl mx-auto grid gap-3">
            {leadGroups.map((group) => {
              const lead = allLeads.find(l => l.id === group.leadId);
              if (!lead) return null;
              
              const isSelected = selectedLeads.has(group.leadId);
              const isOld = lead.last_interaction ? isOlderThanWeek(lead.last_interaction) : false;
              
              return (
                <div key={group.leadId} className="mb-4">
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
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {selectedLeads.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 md:bottom-8 md:right-8 md:left-auto z-50 flex flex-col gap-2">
          <div className="bg-background border rounded-lg shadow-lg p-4 flex flex-col md:flex-row md:items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {selectedLeads.size} lead(s) selecionado(s)
            </span>
            <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
              <Button
                size="sm"
                variant="default"
                onClick={handleMarkAsWon}
                className="w-full md:w-auto justify-start bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Ganho
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleMarkAsLost}
                className="w-full md:w-auto justify-start"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Perdido
              </Button>
              {viewMode === 'unclassified' && (
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
              {viewMode !== 'archived' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleArchiveSelected}
                  className="w-full md:w-auto justify-start"
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Arquivar
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleUnarchiveSelected}
                  className="w-full md:w-auto justify-start"
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Desarquivar
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={generateMultipleDescriptions}
                disabled={generatingDescription !== null}
                className="w-full md:w-auto justify-start"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Atualizar Descrições
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={handleBulkSendFollowupEmails}
                disabled={sendingBulkEmails}
                className="w-full md:w-auto justify-start"
              >
                <Send className="h-4 w-4 mr-2" />
                {sendingBulkEmails ? 'Enviando...' : 'Enviar E-mail de Follow-up'}
              </Button>
              <Button
                size="sm"
                onClick={mergeLeads}
                disabled={merging || selectedLeads.size < 2}
                className="w-full md:w-auto justify-start"
              >
                {merging ? 'Mesclando...' : 'Mesclar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog de Importação */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl">
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
                disabled={extracting || extractingImage || !!extractedData}
              />
              {extractingImage && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-md">
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <span className="text-sm text-muted-foreground">Extraindo texto da imagem...</span>
                  </div>
                </div>
              )}
            </div>

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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Valor (R$):</label>
                    <Input
                      type="number"
                      value={editedData?.valor || ''}
                      onChange={(e) => setEditedData({ ...editedData, valor: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="0.00"
                      className="mt-1"
                    />
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
                </div>
                
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="is_recurring"
                    checked={editedData?.is_recurring || false}
                    onCheckedChange={(checked) => setEditedData({ ...editedData, is_recurring: checked === true })}
                  />
                  <label htmlFor="is_recurring" className="text-sm font-medium cursor-pointer">
                    Cliente Recorrente
                  </label>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {!extractedData ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowImportDialog(false);
                    setImportText('');
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleExtractInfo}
                  disabled={extracting || extractingImage || !importText.trim()}
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
                >
                  Voltar
                </Button>
                <Button
                  onClick={handleImportLead}
                  disabled={importing}
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

    </div>
  );
};

export default Leads;
