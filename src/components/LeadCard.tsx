import { useEffect, useState, memo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Mail, Phone, MessageCircle, Sparkles, Search, Archive, CheckCircle, XCircle, RefreshCw, Send, Mic, Wand2, Clock, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { computeLeadPriority, priorityTierLabel, isBallInOurCourt } from "@/lib/leadPriority";
import DOMPurify from 'dompurify';

interface Lead {
  id: string;
  name: string;
  email: string;
  emails?: string[];
  phone?: string | null;
  phones?: string[];
  description?: string | null;
  description_updated_at?: string | null;
  valor?: number | null;
  moeda?: 'BRL' | 'USD' | 'EUR' | null;
  produto?: 'palestra' | 'consultoria' | 'mentoria' | 'treinamento' | 'publicidade' | 'documentario' | null;
  publicidade_subtipo?: string | null;
  publicidade_quantidade?: number | null;
  email_count?: number;
  email_inbound_count?: number;
  email_outbound_count?: number;
  whatsapp_inbound_count?: number;
  whatsapp_outbound_count?: number;
  last_interaction?: string;
  suggested_followup?: string | null;
  status?: string | null;
  is_recurring?: boolean | null;
  delivered_at?: string | null;
  profile_picture_url?: string | null;
  valor_pago?: number | null;
  data_proximo_pagamento?: string | null;
  created_at?: string;
  reopened_at?: string | null;
  last_outbound_message_at?: string | null;
  last_inbound_message_at?: string | null;
  ganho_at?: string | null;
  produzido_at?: string | null;
  // Campos de diagnóstico IA
  ai_diagnosis?: string | null;
  ai_close_probability?: number | null;
  ai_next_step?: string | null;
  ai_diagnosis_reason?: string | null;
  ai_diagnosis_updated_at?: string | null;
  // Scheduled follow-up from queue
  scheduled_followup_at?: string | null;
  scheduled_followup_status?: string | null;
  scheduled_followup_attempt?: number | null;
}

interface LastMessage {
  message: string;
  date: string;
  type: 'email' | 'whatsapp';
  status?: 'sending' | 'sent' | 'error';
}

interface PreviousOpportunity {
  id: string;
  delivered_at: string;
  valor: number | null;
  moeda: string;
  produto: string | null;
}

interface LeadCardProps {
  lead: Lead;
  isSelected: boolean;
  isOld: boolean;
  generatingDescription: boolean;
  diagnosingLead?: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onGenerateDescription: (e: React.MouseEvent) => void;
  onDiagnoseLead?: (e: React.MouseEvent) => void;
  onCardClick: () => void;
  formatDate: (date: string) => string;
  getTimeAgo: (date: string) => string;
  onArchive?: (leadId: string) => Promise<void>;
  onStatusChange?: (leadId: string, status: 'em_aberto' | 'em_negociacao' | 'ganho' | 'perdido' | 'entregue' | 'produzido') => Promise<void>;
  // Pre-computed data to avoid DB queries in card
  lastInboundMessage?: LastMessage | null;
  lastOutboundMessage?: LastMessage | null;
  pendingResponse?: boolean;
  previousOpportunities?: PreviousOpportunity[];
  // Callback when message is sent
  onMessageSent?: (leadId: string, message: string) => void;
  // Delivery logs
  deliveryLogs?: Array<{ destination: string; sent_at: string; url?: string | null }>;
  onSendToSara?: (leadId: string) => void;
  onSendToTiffany?: (leadId: string) => void;
}

type StatusType = 'em_aberto' | 'em_negociacao' | 'ganho' | 'perdido' | 'entregue' | 'produzido';

const statusLabels: Record<StatusType, string> = {
  em_aberto: 'Em Aberto',
  em_negociacao: 'Negociação',
  ganho: 'Ganho',
  perdido: 'Perdido',
  produzido: 'Produzido',
  entregue: 'Entregue',
};

const LeadCardComponent = ({
  lead,
  isSelected,
  isOld,
  generatingDescription,
  diagnosingLead = false,
  onSelect,
  onGenerateDescription,
  onDiagnoseLead,
  onCardClick,
  formatDate,
  getTimeAgo,
  onArchive,
  onStatusChange,
  lastInboundMessage: propLastInbound,
  lastOutboundMessage: propLastOutbound,
  pendingResponse: propPendingResponse = false,
  previousOpportunities: propPreviousOpportunities = [],
  onMessageSent,
  deliveryLogs = [],
  onSendToSara,
  onSendToTiffany,
}: LeadCardProps) => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [quickReply, setQuickReply] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<StatusType | null>(null);

  // Prioridade (lead scoring determinístico)
  const leadPriority = computeLeadPriority(lead);

  // Local pending message for optimistic UI
  const [pendingOutbound, setPendingOutbound] = useState<LastMessage | null>(null);
  // Local state to track if we just sent a message (clears pending response)
  const [justSentMessage, setJustSentMessage] = useState(false);

  // Use props for message data - no DB queries in card
  const lastInboundMessage = propLastInbound;
  // Show pending message if exists, otherwise show prop
  const lastOutboundMessage = pendingOutbound || propLastOutbound;
  // If we just sent a message, don't show pending response
  const pendingResponse = justSentMessage ? false : propPendingResponse;
  const previousOpportunities = propPreviousOpportunities;

  const handleStatusChange = (status: StatusType, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMobile) {
      setPendingStatus(status);
      setShowStatusDialog(true);
    } else {
      onStatusChange?.(lead.id, status);
    }
  };

  const confirmStatusChange = () => {
    if (pendingStatus && onStatusChange) {
      onStatusChange(lead.id, pendingStatus);
    }
    setShowStatusDialog(false);
    setPendingStatus(null);
  };

  const handleSendQuickReply = useCallback(async (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation();
    
    if (!quickReply.trim() || !lead.phones?.[0]) {
      toast({
        title: 'Erro',
        description: 'Mensagem vazia ou telefone não disponível',
        variant: 'destructive'
      });
      return;
    }

    const messageSent = quickReply.trim();
    
    // Optimistic update - show message immediately with "sending" status
    const pendingMessage: LastMessage = {
      message: messageSent,
      date: new Date().toISOString(),
      type: 'whatsapp',
      status: 'sending'
    };
    setPendingOutbound(pendingMessage);
    
    // Mark that we just sent a message - this clears the "pending response" alert
    setJustSentMessage(true);
    
    // Clear input immediately to free user
    setQuickReply('');
    
    // Notify parent immediately for UI update
    onMessageSent?.(lead.id, messageSent);
    
    // Send in background - don't block UI
    supabase.functions.invoke('send-whatsapp-message', {
      body: {
        phone: lead.phones[0],
        message: messageSent,
        leadId: lead.id
      }
    }).then(({ error }) => {
      if (error) {
        console.error('Erro ao enviar mensagem:', error);
        // Update to error status
        setPendingOutbound(prev => prev ? { ...prev, status: 'error' } : null);
        toast({
          title: 'Erro ao enviar',
          description: error.message || 'Tente novamente',
          variant: 'destructive'
        });
      } else {
        // Update to sent status
        setPendingOutbound(prev => prev ? { ...prev, status: 'sent' } : null);
        
        // After 3 seconds, clear pending so it uses prop data
        setTimeout(() => {
          setPendingOutbound(null);
        }, 3000);
      }
    });
  }, [quickReply, lead.phones, lead.id, toast, onMessageSent]);

  const startRecording = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);

      toast({
        title: 'Gravando',
        description: 'Clique novamente para parar a gravação'
      });
    } catch (error) {
      console.error('Erro ao iniciar gravação:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível acessar o microfone',
        variant: 'destructive'
      });
    }
  };

  const stopRecording = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      setIsTranscribing(true);
      
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        const { data, error } = await supabase.functions.invoke('transcribe-voice', {
          body: { audio: base64Audio }
        });

        if (error) throw error;

        if (data?.text) {
          setQuickReply(data.text);
          toast({
            title: 'Transcrição concluída',
            description: 'Texto adicionado ao campo de mensagem'
          });
        }
      };
    } catch (error: any) {
      console.error('Erro na transcrição:', error);
      toast({
        title: 'Erro na transcrição',
        description: error.message || 'Tente novamente',
        variant: 'destructive'
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const generateAIReply = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!lead.phones?.[0]) {
      toast({
        title: 'Erro',
        description: 'Telefone não disponível para este lead',
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsGeneratingAI(true);
      
      const { data, error } = await supabase.functions.invoke('generate-whatsapp-message', {
        body: {
          leadId: lead.id,
          context: 'Gerar uma resposta curta e natural de follow-up para continuar a conversa. Seja cordial e objetivo.'
        }
      });

      if (error) throw error;

      if (data?.message) {
        setQuickReply(data.message);
        toast({
          title: 'Resposta gerada',
          description: 'Sugestão de resposta adicionada ao campo'
        });
      }
    } catch (error: any) {
      console.error('Erro ao gerar resposta IA:', error);
      toast({
        title: 'Erro ao gerar resposta',
        description: error.message || 'Tente novamente',
        variant: 'destructive'
      });
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Check if payment is overdue
  const isPaymentOverdue = (lead.status === 'ganho' || lead.status === 'produzido') && 
    lead.data_proximo_pagamento && 
    lead.valor_pago !== null && 
    lead.valor_pago !== undefined && 
    lead.valor !== null && 
    lead.valor !== undefined &&
    lead.valor_pago < lead.valor &&
    new Date(lead.data_proximo_pagamento) < new Date();

  return (
    <Card 
      className={`w-full transition-colors border ${
        isSelected 
          ? 'ring-1 ring-primary border-primary' 
          : isPaymentOverdue
            ? 'bg-warning/5 border-warning/40'
            : isOld 
              ? 'bg-destructive/5 border-destructive/30' 
              : 'border-border hover:border-primary/40'
      }`}
    >
      <CardContent className="py-3 px-3 sm:px-4">
        <div className="flex gap-3">
          {/* Avatar/Foto de perfil */}
          {lead.profile_picture_url ? (
            <div className="shrink-0">
              <img 
                src={lead.profile_picture_url} 
                alt={lead.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-border"
                onError={(e) => {
                  // Hide if image fails to load
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          ) : null}
          
          {/* Conteúdo principal */}
          <div className="flex-1 min-w-0">
            {/* Header com Nome e Valor/Produto */}
            <div className="flex flex-col sm:flex-row items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0 w-full sm:w-auto">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-base break-words">{lead.name || lead.email}</p>

                  {/* Badge de Prioridade (lead scoring) */}
                  {leadPriority && (
                    <div className="relative group">
                      <div
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold cursor-help ${
                          leadPriority.tier === 1
                            ? 'bg-red-100 text-red-700 border border-red-300'
                            : leadPriority.tier === 2
                              ? 'bg-amber-100 text-amber-700 border border-amber-300'
                              : 'bg-slate-100 text-slate-500 border border-slate-300'
                        }`}
                      >
                        {priorityTierLabel(leadPriority.tier)}
                      </div>
                      <div className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-lg p-3 shadow-lg z-50 hidden group-hover:block min-w-[260px] max-w-[380px]">
                        <p className="font-semibold text-sm mb-1 text-foreground">
                          Prioridade {priorityTierLabel(leadPriority.tier)} — score {leadPriority.score}
                        </p>
                        {leadPriority.reasons.length > 0 ? (
                          <ul className="text-xs text-foreground list-disc pl-4 space-y-0.5">
                            {leadPriority.reasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground">Sem sinais fortes — prioridade baixa.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Status Badge */}
                  {lead.status && (
                    <Badge 
                      variant="outline" 
                      className={`text-xs whitespace-nowrap ${
                        lead.status === 'em_aberto' 
                          ? 'bg-slate-100 text-slate-700 border-slate-300' 
                          : lead.status === 'em_negociacao' 
                            ? 'bg-blue-100 text-blue-700 border-blue-300'
                            : lead.status === 'ganho' 
                              ? 'bg-green-100 text-green-700 border-green-300'
                              : lead.status === 'produzido'
                                ? 'bg-purple-100 text-purple-700 border-purple-300'
                                : lead.status === 'entregue'
                                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                  : lead.status === 'perdido'
                                    ? 'bg-red-100 text-red-700 border-red-300'
                                    : 'bg-gray-100 text-gray-700 border-gray-300'
                      }`}
                    >
                      {lead.status === 'em_aberto' && 'Em Aberto'}
                      {lead.status === 'em_negociacao' && 'Negociação'}
                      {lead.status === 'ganho' && 'Ganho'}
                      {lead.status === 'produzido' && 'Produzido'}
                      {lead.status === 'entregue' && 'Entregue'}
                      {lead.status === 'perdido' && 'Perdido'}
                    </Badge>
                  )}

                  {lead.reopened_at && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-300 text-xs whitespace-nowrap">
                      🔄 Reaberto
                    </Badge>
                  )}

                  {lead.is_recurring && (
                    <div className="relative group">
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-300 text-xs whitespace-nowrap">
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Cliente Recorrente
                      </Badge>
                      {previousOpportunities.length > 0 && (
                        <div className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-lg p-3 shadow-lg z-50 hidden group-hover:block min-w-[280px] max-w-[90vw]">
                          <p className="font-semibold text-xs mb-2 text-foreground">Oportunidades Entregues:</p>
                          <div className="space-y-2 max-h-[300px] overflow-y-auto">
                            {previousOpportunities.map((opp) => (
                              <div key={opp.id} className="text-xs border-b border-border/50 pb-2 last:border-0">
                                {opp.delivered_at && (
                                  <p className="text-muted-foreground mb-1">
                                    📅 {new Date(opp.delivered_at).toLocaleDateString('pt-BR', { 
                                      day: '2-digit', 
                                      month: 'short', 
                                      year: 'numeric' 
                                    })}
                                  </p>
                                )}
                                {opp.valor && (
                                  <p className="font-medium text-foreground mb-1">
                                    💰 {new Intl.NumberFormat('pt-BR', {
                                      style: 'currency',
                                      currency: opp.moeda
                                    }).format(opp.valor)}
                                  </p>
                                )}
                                {opp.produto && (
                                  <p className="text-muted-foreground capitalize">
                                    🎯 {opp.produto}
                                  </p>
                                )}
                                {!opp.delivered_at && !opp.valor && !opp.produto && (
                                  <p className="text-muted-foreground italic">Sem detalhes disponíveis</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <a
                    href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(lead.name || lead.email)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                    title="Buscar no Gmail"
                  >
                    <Search className="h-4 w-4" />
                  </a>
                </div>
              </div>
              
              {/* Valor, Próximo Pagamento e Produto lado a lado no topo direito */}
              {(lead.valor || lead.produto || lead.data_proximo_pagamento) && (
                <div className="flex gap-2 items-center flex-wrap w-full sm:w-auto justify-start sm:justify-end">
                  {lead.valor && (
                    <>
                      {/* Show total and remaining amount for won/produzido leads */}
                      {(lead.status === 'ganho' || lead.status === 'produzido') && lead.valor_pago !== null && lead.valor_pago !== undefined && lead.valor_pago > 0 && lead.valor_pago < lead.valor ? (
                        <>
                          <Badge variant="outline" className="text-xs whitespace-nowrap">
                            💰 Total: {lead.moeda === 'USD' ? 'USD' : lead.moeda === 'EUR' ? 'EUR' : 'R$'} {lead.valor.toLocaleString(lead.moeda === 'USD' ? 'en-US' : lead.moeda === 'EUR' ? 'de-DE' : 'pt-BR')}
                          </Badge>
                          <Badge variant="outline" className="text-xs whitespace-nowrap bg-orange-50 text-orange-700 border-orange-300">
                            💰 A receber: {lead.moeda === 'USD' ? 'USD' : lead.moeda === 'EUR' ? 'EUR' : 'R$'} {(lead.valor - lead.valor_pago).toLocaleString(lead.moeda === 'USD' ? 'en-US' : lead.moeda === 'EUR' ? 'de-DE' : 'pt-BR')}
                          </Badge>
                        </>
                      ) : (lead.status === 'ganho' || lead.status === 'produzido') && lead.valor_pago !== null && lead.valor_pago !== undefined && lead.valor_pago >= lead.valor ? (
                        <Badge variant="outline" className="text-xs whitespace-nowrap bg-green-50 text-green-700 border-green-300">
                          ✓ Pago: {lead.moeda === 'USD' ? 'USD' : lead.moeda === 'EUR' ? 'EUR' : 'R$'} {lead.valor.toLocaleString(lead.moeda === 'USD' ? 'en-US' : lead.moeda === 'EUR' ? 'de-DE' : 'pt-BR')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          💰 {lead.moeda === 'USD' ? 'USD' : lead.moeda === 'EUR' ? 'EUR' : 'R$'} {lead.valor.toLocaleString(lead.moeda === 'USD' ? 'en-US' : lead.moeda === 'EUR' ? 'de-DE' : 'pt-BR')}
                        </Badge>
                      )}
                    </>
                  )}
                  {/* Show next payment date for won/produced leads */}
                  {(lead.status === 'ganho' || lead.status === 'produzido') && lead.data_proximo_pagamento && (
                    <Badge 
                      variant="outline" 
                      className={`text-xs whitespace-nowrap ${
                        isPaymentOverdue 
                          ? 'bg-red-100 text-red-700 border-red-400 animate-pulse' 
                          : 'bg-blue-50 text-blue-700 border-blue-300'
                      }`}
                    >
                      📅 {isPaymentOverdue ? '⚠️ ' : ''}Próx. Pgto: {new Date(lead.data_proximo_pagamento).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </Badge>
                  )}
                  {lead.produto && (
                    <Badge variant="secondary" className="text-xs capitalize whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        {lead.produto}
                        {lead.produto === 'publicidade' && lead.publicidade_subtipo && (
                          <span className="text-[10px] opacity-70 lowercase">
                            ({lead.publicidade_subtipo === 'longo' ? 'Longo' : lead.publicidade_subtipo === 'curto' ? 'Curto' : lead.publicidade_subtipo === 'insercao' ? 'Inserção' : lead.publicidade_subtipo === 'longo_curto' ? 'Longo+Curto' : lead.publicidade_subtipo === 'linkedin' ? 'LinkedIn' : lead.publicidade_subtipo === 'newsletter' ? 'Newsletter' : lead.publicidade_subtipo}{lead.publicidade_quantidade ? ` x${lead.publicidade_quantidade}` : ''})
                          </span>
                        )}
                      </span>
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Descrição com hover para mostrar completa */}
            {lead.description && (
              <div className="mb-2 relative group">
                <p className="text-sm italic text-muted-foreground line-clamp-2 break-words">{lead.description}</p>
                <div className="absolute left-0 top-0 bg-popover border border-border rounded-lg p-3 shadow-lg z-50 hidden group-hover:block max-w-[90vw] sm:max-w-[600px]">
                  <p className="text-sm italic text-foreground whitespace-pre-wrap break-words">{lead.description}</p>
                </div>
              </div>
            )}

            {/* Emails e telefones na mesma linha com letra menor */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2 flex-wrap">
              {lead.emails && lead.emails.filter(e => !e.endsWith('@whatsapp.temp')).length > 0 && (
                <div className="relative group">
                  <span className="cursor-help truncate max-w-[200px] inline-block">
                    {lead.emails.filter(e => !e.endsWith('@whatsapp.temp')).length > 1 
                      ? `${lead.emails.filter(e => !e.endsWith('@whatsapp.temp')).length} emails`
                      : lead.emails.filter(e => !e.endsWith('@whatsapp.temp'))[0]
                    }
                  </span>
                  {lead.emails.filter(e => !e.endsWith('@whatsapp.temp')).length > 1 && (
                    <div className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-lg p-3 shadow-lg z-50 hidden group-hover:block min-w-[250px] max-w-[90vw]">
                      <p className="font-semibold text-xs mb-2 text-foreground">Todos os emails:</p>
                      <div className="space-y-1">
                        {lead.emails.filter(e => !e.endsWith('@whatsapp.temp')).map((email, idx) => (
                          <p key={idx} className="text-xs text-foreground break-all">{email}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {lead.emails && lead.emails.filter(e => !e.endsWith('@whatsapp.temp')).length > 0 && lead.phones && lead.phones.length > 0 && (
                <span>•</span>
              )}
              
              {lead.phones && lead.phones.length > 0 && (
                <div className="relative group">
                  <span className="cursor-help">
                    {lead.phones.length > 1 
                      ? `${lead.phones.length} telefones`
                      : lead.phones[0]
                    }
                  </span>
                  {lead.phones.length > 1 && (
                    <div className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-lg p-3 shadow-lg z-50 hidden group-hover:block min-w-[200px] max-w-[90vw]">
                      <p className="font-semibold text-xs mb-2 text-foreground">Todos os telefones:</p>
                      <div className="space-y-1">
                        {lead.phones.map((phone, idx) => (
                          <p key={idx} className="text-xs text-foreground">{phone}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Estatísticas de mensagens - maiores */}
            <div className="flex items-center gap-4 mb-3 flex-wrap">
              {(lead.email_inbound_count !== undefined && lead.email_inbound_count > 0) || 
               (lead.email_outbound_count !== undefined && lead.email_outbound_count > 0) ? (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>
                    {lead.email_inbound_count || 0}↓ / {lead.email_outbound_count || 0}↑
                  </span>
                </div>
              ) : null}
              
              {(lead.whatsapp_inbound_count !== undefined && lead.whatsapp_inbound_count > 0) || 
               (lead.whatsapp_outbound_count !== undefined && lead.whatsapp_outbound_count > 0) ? (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MessageCircle className="h-4 w-4" />
                  <span>
                    {lead.whatsapp_inbound_count || 0}↓ / {lead.whatsapp_outbound_count || 0}↑
                  </span>
                </div>
              ) : null}

              {/* Dias sem resposta do cliente — só quando última msg foi nossa */}
              {(() => {
                const lastIn = lead.last_inbound_message_at ? new Date(lead.last_inbound_message_at).getTime() : 0;
                const lastOut = lead.last_outbound_message_at ? new Date(lead.last_outbound_message_at).getTime() : 0;
                if (!lastOut || lastOut <= lastIn) return null;
                const ref = lastIn || lastOut;
                const days = Math.floor((Date.now() - ref) / 86400000);
                if (days < 1) return null;
                return (
                  <Badge variant="outline" className="text-xs gap-1 border-amber-400 text-amber-700 dark:text-amber-400">
                    <Clock className="h-3 w-3" />
                    {days}d sem resposta
                  </Badge>
                );
              })()}
            </div>

            {/* Última mensagem recebida e enviada lado a lado */}
            <TooltipProvider>
              <div className="grid grid-cols-1 gap-2 mb-3">
                {/* Última mensagem recebida */}
                {lastInboundMessage && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div 
                        className="p-2 rounded-md bg-muted/50 border border-border cursor-pointer hover:bg-muted/80 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (lead.phones?.[0]) {
                            const phone = lead.phones[0].replace(/\D/g, '');
                            window.open(`https://wa.me/${phone}`, '_blank');
                          }
                        }}
                      >
                        <div className="flex items-start gap-2">
                          {lastInboundMessage.type === 'email' ? (
                            <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          ) : (
                            <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground mb-1">Última recebida:</p>
                            <div 
                              className="text-xs text-muted-foreground line-clamp-2 prose prose-sm max-w-none [&>p]:m-0"
                              dangerouslySetInnerHTML={{ 
                                __html: DOMPurify.sanitize(lastInboundMessage.message, {
                                  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
                                  ALLOWED_ATTR: []
                                })
                              }}
                            />
                            <p className="text-xs text-muted-foreground mt-1">{formatDate(lastInboundMessage.date)}</p>
                          </div>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-md max-h-[400px] overflow-y-auto">
                      <div className="space-y-2">
                        <p className="text-xs font-medium">Mensagem completa:</p>
                        <div 
                          className="text-xs prose prose-sm max-w-none [&>p]:m-0"
                          dangerouslySetInnerHTML={{ 
                            __html: DOMPurify.sanitize(lastInboundMessage.message, {
                              ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
                              ALLOWED_ATTR: []
                            })
                          }}
                        />
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Última mensagem enviada */}
                {lastOutboundMessage && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div 
                        className={`p-2 rounded-md cursor-pointer hover:opacity-80 transition-opacity ${
                          lastOutboundMessage.status === 'sending' 
                            ? 'bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-300 dark:border-yellow-800' 
                            : lastOutboundMessage.status === 'error'
                              ? 'bg-red-50 dark:bg-red-950/20 border border-red-300 dark:border-red-800'
                              : 'bg-primary/5 border border-primary/20'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (lead.phones?.[0]) {
                            const phone = lead.phones[0].replace(/\D/g, '');
                            window.open(`https://wa.me/${phone}`, '_blank');
                          }
                        }}
                      >
                        <div className="flex items-start gap-2">
                          {lastOutboundMessage.type === 'email' ? (
                            <Mail className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          ) : (
                            <Phone className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-xs font-medium text-primary">Última enviada:</p>
                              {lastOutboundMessage.status === 'sending' && (
                                <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                                  <Clock className="h-3 w-3 animate-pulse" />
                                  Enviando...
                                </span>
                              )}
                              {lastOutboundMessage.status === 'sent' && (
                                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                  <Check className="h-3 w-3" />
                                  Enviada
                                </span>
                              )}
                              {lastOutboundMessage.status === 'error' && (
                                <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                                  <XCircle className="h-3 w-3" />
                                  Erro
                                </span>
                              )}
                            </div>
                            <div 
                              className="text-xs text-muted-foreground line-clamp-2 prose prose-sm max-w-none [&>p]:m-0"
                              dangerouslySetInnerHTML={{ 
                                __html: DOMPurify.sanitize(lastOutboundMessage.message, {
                                  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
                                  ALLOWED_ATTR: []
                                })
                              }}
                            />
                            <p className="text-xs text-muted-foreground mt-1">{formatDate(lastOutboundMessage.date)}</p>
                          </div>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-md max-h-[400px] overflow-y-auto">
                      <div className="space-y-2">
                        <p className="text-xs font-medium">Mensagem completa:</p>
                        <div 
                          className="text-xs prose prose-sm max-w-none [&>p]:m-0"
                          dangerouslySetInnerHTML={{ 
                            __html: DOMPurify.sanitize(lastOutboundMessage.message, {
                              ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
                              ALLOWED_ATTR: []
                            })
                          }}
                        />
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TooltipProvider>

            {/* Resposta rápida via WhatsApp (sempre visível quando houver WhatsApp) */}
            {lead.phones && lead.phones.length > 0 && (
              <div className={`mb-3 p-2 rounded-md ${pendingResponse ? 'bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900' : 'bg-muted/30 border border-border'}`}>
                <p className={`text-xs font-medium mb-2 ${pendingResponse ? 'text-yellow-800 dark:text-yellow-400' : 'text-foreground'}`}>
                  Resposta Rápida via WhatsApp:{pendingResponse && <span className="ml-2 text-xs font-bold">⚠️ PENDENTE</span>}
                </p>
                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                  <div className="flex-1 relative min-w-0">
                    <Textarea
                      placeholder="Digite, grave ou clique ✨ para IA... (⌘+Enter para enviar)"
                      value={quickReply}
                      onChange={(e) => setQuickReply(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (quickReply.trim() && !isSending && !isTranscribing && !isRecording && !isGeneratingAI) {
                            handleSendQuickReply(e);
                          }
                        }
                      }}
                      className="text-xs min-h-[60px] max-h-[120px] resize-none pr-20 w-full"
                      disabled={isTranscribing || isGeneratingAI}
                    />
                    <div className="absolute right-1 bottom-1 flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={generateAIReply}
                        disabled={isTranscribing || isRecording || isGeneratingAI}
                        className={`h-8 w-8 p-0 ${isGeneratingAI ? 'text-primary animate-pulse' : 'text-muted-foreground hover:text-primary'}`}
                        title="Gerar resposta com IA"
                      >
                        <Wand2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isTranscribing || isGeneratingAI}
                        className={`h-8 w-8 p-0 ${isRecording ? 'text-red-500 animate-pulse' : 'text-muted-foreground hover:text-foreground'}`}
                        title={isRecording ? 'Parar gravação' : 'Gravar áudio'}
                      >
                        <Mic className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSendQuickReply}
                    disabled={isSending || !quickReply.trim() || isTranscribing || isRecording || isGeneratingAI}
                    className="shrink-0 h-10 sm:h-[60px] px-4 w-full sm:w-auto"
                  >
                    <Send className="h-4 w-4 mr-2 sm:mr-0" />
                    <span className="sm:hidden">Enviar</span>
                  </Button>
                </div>
              </div>
            )}

            {(lead.last_interaction || lead.created_at) && (
              <div className={`mb-3 p-2 rounded-md ${pendingResponse ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800' : isOld ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800' : 'bg-muted/30'}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {lead.last_interaction && (
                    <div>
                      <p className={`text-sm font-medium ${pendingResponse ? 'text-red-700 dark:text-red-400' : isOld ? 'text-red-700 dark:text-red-400' : 'text-foreground'}`}>
                        Última interação: {formatDate(lead.last_interaction)}
                        {pendingResponse && <span className="ml-2 text-xs font-bold">⚠️ PENDENTE DE RESPOSTA</span>}
                      </p>
                      <p className={`text-xs ${pendingResponse ? 'text-red-600 dark:text-red-500' : isOld ? 'text-red-600 dark:text-red-500' : 'text-muted-foreground'}`}>
                        {getTimeAgo(lead.last_interaction)}
                      </p>
                    </div>
                  )}
                  {lead.created_at && (
                    <div className="text-right">
                      <p className="text-sm font-medium text-muted-foreground">
                        Criado: {formatDate(lead.created_at)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {getTimeAgo(lead.created_at)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Botões - layout mobile melhorado */}
            <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2 sm:items-center sm:justify-center mt-3">
              {/* Selecionar */}
              <Button
                size="sm"
                variant={isSelected ? "default" : "outline"}
                className="h-7 text-xs w-full sm:w-auto"
                onClick={onSelect}
              >
                <span className="hidden sm:inline">{isSelected ? 'Selecionado' : 'Selecionar'}</span>
                <span className="sm:hidden">{isSelected ? 'Sel.' : 'Sel.'}</span>
              </Button>

              {/* Status buttons - só mostra botões para status diferentes do atual */}
              {onStatusChange && (
                <>
                  {/* Em Aberto - só mostra se NÃO estiver em_aberto e NÃO for ganho/produzido/entregue */}
                  {lead.status !== 'em_aberto' && lead.status !== null && lead.status !== undefined && lead.status !== 'ganho' && lead.status !== 'produzido' && lead.status !== 'entregue' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-300 w-full sm:w-auto"
                      onClick={(e) => handleStatusChange('em_aberto', e)}
                    >
                      <span className="hidden sm:inline">Em Aberto</span>
                      <span className="sm:hidden">Aberto</span>
                    </Button>
                  )}
                  
                  {/* Em Negociação - só mostra se NÃO estiver em_negociacao */}
                  {lead.status !== 'em_negociacao' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300 w-full sm:w-auto"
                      onClick={(e) => handleStatusChange('em_negociacao', e)}
                    >
                      <MessageCircle className="h-3 w-3 mr-1" />
                      <span className="hidden sm:inline">Negociação</span>
                      <span className="sm:hidden">Neg.</span>
                    </Button>
                  )}
                  
                  {/* Ganho - só mostra se NÃO estiver ganho */}
                  {lead.status !== 'ganho' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs bg-green-50 hover:bg-green-100 text-green-700 border-green-300 w-full sm:w-auto"
                      onClick={(e) => handleStatusChange('ganho', e)}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Ganho
                    </Button>
                  )}
                  
                  {/* Perdido - só mostra se NÃO estiver perdido */}
                  {lead.status !== 'perdido' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs bg-red-50 hover:bg-red-100 text-red-700 border-red-300 w-full sm:w-auto"
                      onClick={(e) => handleStatusChange('perdido', e)}
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      <span className="hidden sm:inline">Perdido</span>
                      <span className="sm:hidden">Perd.</span>
                    </Button>
                  )}
                  
                  {/* Produzido - só mostra para leads ganhos */}
                  {lead.status === 'ganho' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-300 w-full sm:w-auto"
                      onClick={(e) => handleStatusChange('produzido', e)}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      <span className="hidden sm:inline">Produzido</span>
                      <span className="sm:hidden">Prod.</span>
                    </Button>
                  )}
                  
                  {/* Entregue - só mostra para leads ganhos ou produzidos */}
                  {(lead.status === 'ganho' || lead.status === 'produzido') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-300 w-full sm:w-auto"
                      onClick={(e) => handleStatusChange('entregue', e)}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      <span className="hidden sm:inline">Entregue</span>
                      <span className="sm:hidden">Ent.</span>
                    </Button>
                  )}
                </>
              )}


              {/* Ver Detalhes */}
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs w-full sm:w-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(`/opportunity/${lead.id}`, '_blank');
                }}
              >
                <span className="hidden sm:inline">Ver Detalhes</span>
                <span className="sm:hidden">Detalhes</span>
              </Button>

              {/* Arquivar - só ícone */}
              {onArchive && (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowArchiveDialog(true);
                          }}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Arquivar</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Arquivar Lead</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja arquivar "{lead.name || lead.email}"? Esta ação pode ser desfeita posteriormente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                          Cancelar
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => {
                            e.stopPropagation();
                            onArchive(lead.id);
                            setShowArchiveDialog(false);
                          }}
                        >
                          Arquivar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}

            </div>

            {/* Dialog de confirmação de mudança de status (mobile) */}
            <AlertDialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Alterar Status</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja alterar o status de "{lead.name || lead.email}" para "{pendingStatus ? statusLabels[pendingStatus] : ''}"?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                    Cancelar
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.stopPropagation();
                      confirmStatusChange();
                    }}
                  >
                    Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Memoize with custom comparison to prevent re-renders when only callbacks change
export const LeadCard = memo(LeadCardComponent, (prevProps, nextProps) => {
  // Compare data props only, skip function comparisons
  return (
    prevProps.lead.id === nextProps.lead.id &&
    prevProps.lead.name === nextProps.lead.name &&
    prevProps.lead.valor === nextProps.lead.valor &&
    prevProps.lead.moeda === nextProps.lead.moeda &&
    prevProps.lead.produto === nextProps.lead.produto &&
    prevProps.lead.description === nextProps.lead.description &&
    prevProps.lead.status === nextProps.lead.status &&
    prevProps.lead.suggested_followup === nextProps.lead.suggested_followup &&
    prevProps.lead.email_inbound_count === nextProps.lead.email_inbound_count &&
    prevProps.lead.email_outbound_count === nextProps.lead.email_outbound_count &&
    prevProps.lead.whatsapp_inbound_count === nextProps.lead.whatsapp_inbound_count &&
    prevProps.lead.whatsapp_outbound_count === nextProps.lead.whatsapp_outbound_count &&
    prevProps.lead.is_recurring === nextProps.lead.is_recurring &&
    prevProps.lead.ai_close_probability === nextProps.lead.ai_close_probability &&
    prevProps.lead.last_inbound_message_at === nextProps.lead.last_inbound_message_at &&
    prevProps.lead.last_outbound_message_at === nextProps.lead.last_outbound_message_at &&
    prevProps.lead.ai_diagnosis === nextProps.lead.ai_diagnosis &&
    prevProps.lead.ai_next_step === nextProps.lead.ai_next_step &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isOld === nextProps.isOld &&
    prevProps.generatingDescription === nextProps.generatingDescription &&
    prevProps.diagnosingLead === nextProps.diagnosingLead &&
    prevProps.pendingResponse === nextProps.pendingResponse &&
    prevProps.lastInboundMessage?.message === nextProps.lastInboundMessage?.message &&
    prevProps.lastInboundMessage?.date === nextProps.lastInboundMessage?.date &&
    prevProps.lastOutboundMessage?.message === nextProps.lastOutboundMessage?.message &&
    prevProps.lastOutboundMessage?.date === nextProps.lastOutboundMessage?.date &&
    prevProps.previousOpportunities?.length === nextProps.previousOpportunities?.length &&
    prevProps.deliveryLogs?.length === nextProps.deliveryLogs?.length
  );
});
