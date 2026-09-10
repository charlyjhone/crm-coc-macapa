import { useState, useEffect, useCallback } from 'react';

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
  status?: 'em_aberto' | 'em_negociacao' | 'ganho' | 'perdido' | 'entregue' | 'produzido' | null;
  suggested_followup?: string | null;
  valor_manually_edited?: boolean | null;
  is_recurring?: boolean | null;
  delivered_at?: string | null;
  profile_picture_url?: string | null;
  valor_pago?: number | null;
  data_proximo_pagamento?: string | null;
  // Cached last messages (from DB columns)
  last_inbound_message_text?: string | null;
  last_inbound_message_at?: string | null;
  last_outbound_message_text?: string | null;
  last_outbound_message_at?: string | null;
}

// Simplified cache - only stores basic lead data (no message content to avoid quota issues)
interface SimpleCacheData {
  leads: Pick<Lead, 'id' | 'name' | 'email' | 'emails' | 'phone' | 'phones' | 'description' | 'valor' | 'moeda' | 'produto' | 'status' | 'is_recurring' | 'delivered_at' | 'created_at' | 'updated_at' | 'profile_picture_url' | 'valor_pago' | 'data_proximo_pagamento'>[];
  timestamp: number;
}

const CACHE_KEY = 'opportunities_leads_simple';
const CACHE_EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 hours

export function useLeadsCache() {
  const [cachedLeads, setCachedLeads] = useState<Lead[] | null>(null);
  const [cacheLoaded, setCacheLoaded] = useState(false);

  // Load cache on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data: SimpleCacheData = JSON.parse(cached);
        if (Date.now() - data.timestamp < CACHE_EXPIRY_MS) {
          console.log('[Cache] Carregando do cache local:', data.leads.length, 'leads');
          // Cast to Lead[] - missing fields will be filled by progressive loading
          setCachedLeads(data.leads as Lead[]);
        } else {
          console.log('[Cache] Cache expirado, removendo');
          localStorage.removeItem(CACHE_KEY);
        }
      }
    } catch (e) {
      console.error('[Cache] Erro ao carregar cache:', e);
      localStorage.removeItem(CACHE_KEY);
    }
    setCacheLoaded(true);
  }, []);

  // Save only essential lead data (no message content)
  const saveCache = useCallback((leads: Lead[]) => {
    try {
      const simplifiedLeads = leads.map(l => ({
        id: l.id,
        name: l.name,
        email: l.email,
        emails: l.emails,
        phone: l.phone,
        phones: l.phones,
        description: l.description,
        valor: l.valor,
        moeda: l.moeda,
        produto: l.produto,
        status: l.status,
        is_recurring: l.is_recurring,
        delivered_at: l.delivered_at,
        created_at: l.created_at,
        updated_at: l.updated_at,
        profile_picture_url: l.profile_picture_url,
        valor_pago: l.valor_pago,
      }));
      
      const data: SimpleCacheData = {
        leads: simplifiedLeads,
        timestamp: Date.now()
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      console.log('[Cache] Cache salvo:', leads.length, 'leads');
    } catch (e) {
      console.error('[Cache] Erro ao salvar cache:', e);
      // Clear cache if quota exceeded
      localStorage.removeItem(CACHE_KEY);
    }
  }, []);

  // Update single lead in cache
  const updateLeadInCache = useCallback((leadId: string, updates: Partial<Lead>) => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data: SimpleCacheData = JSON.parse(cached);
        data.leads = data.leads.map(l => l.id === leadId ? { ...l, ...updates } : l);
        data.timestamp = Date.now();
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      }
    } catch (e) {
      console.error('[Cache] Erro ao atualizar lead no cache:', e);
    }
  }, []);

  // Remove lead from cache
  const removeLeadFromCache = useCallback((leadId: string) => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data: SimpleCacheData = JSON.parse(cached);
        data.leads = data.leads.filter(l => l.id !== leadId);
        data.timestamp = Date.now();
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      }
    } catch (e) {
      console.error('[Cache] Erro ao remover lead do cache:', e);
    }
  }, []);

  // Add new lead to cache
  const addLeadToCache = useCallback((lead: Lead) => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data: SimpleCacheData = JSON.parse(cached);
        data.leads = [lead as any, ...data.leads.filter(l => l.id !== lead.id)];
        data.timestamp = Date.now();
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      }
    } catch (e) {
      console.error('[Cache] Erro ao adicionar lead ao cache:', e);
    }
  }, []);

  return {
    cachedLeads,
    cacheLoaded,
    saveCache,
    updateLeadInCache,
    removeLeadFromCache,
    addLeadToCache
  };
}
