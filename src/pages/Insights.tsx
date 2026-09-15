import { useEffect, useState, useMemo, type SyntheticEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, TrendingUp, DollarSign } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import { startOfMonth, subMonths, format, isWithinInterval, endOfMonth, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import DailyDashboard from "@/components/insights/DailyDashboard";

interface Lead {
  id: string;
  name: string;
  status: string | null;
  produto: string | null;
  matriculado_at: string | null;
  delivered_at: string | null;
  resolvido_at: string | null;
  created_at: string;
  valor: number | null;
  moeda: string | null;
}

interface DailyLead {
  id: string;
  name: string;
  status: string | null;
  created_at: string;
  negociacao_at: string | null;
  matriculado_at: string | null;
  nao_convertido_at: string | null;
  delivered_at: string | null;
  resolvido_at: string | null;
  valor: number | null;
  valor_pago: number | null;
  moeda: string | null;
  ai_close_probability: number | null;
  ai_next_step: string | null;
  ai_diagnosis: string | null;
  ai_diagnosis_reason: string | null;
}

interface LeadInfo {
  id: string;
  name: string;
  valor: number | null;
  moeda: string | null;
  valorUSD: number;
}

interface MonthlyData {
  month: string;
  monthLabel: string;
  consultoria: number;
  publicidade: number;
  palestra: number;
  mentoria: number;
  treinamento: number;
  outros: number;
  leads: Record<string, LeadInfo[]>;
}

interface MonthlyRevenueData {
  month: string;
  monthLabel: string;
  consultoria: number;
  publicidade: number;
  palestra: number;
  mentoria: number;
  treinamento: number;
  outros: number;
  leads: Record<string, LeadInfo[]>;
}

const BRL_TO_USD_RATE = 0.18;

const PRODUCT_COLORS: Record<string, string> = {
  consultoria: "hsl(221, 83%, 53%)",
  publicidade: "hsl(142, 76%, 36%)",
  palestra: "hsl(262, 83%, 58%)",
  mentoria: "hsl(25, 95%, 53%)",
  treinamento: "hsl(0, 84%, 60%)",
  outros: "hsl(215, 16%, 47%)",
};

const PRODUCT_LABELS: Record<string, string> = {
  consultoria: "Consultoria",
  publicidade: "Publicidade",
  palestra: "Palestra",
  mentoria: "Mentoria",
  treinamento: "Treinamento",
  documentario: "Documentário",
  outros: "Outros",
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const convertToUSD = (valor: number | null, moeda: string | null): number => {
  if (!valor) return 0;
  if (moeda === 'BRL') {
    return valor * BRL_TO_USD_RATE;
  }
  return valor;
};

export default function Insights() {
  const { user, loading: authLoading } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [openLeads, setOpenLeads] = useState<Lead[]>([]);
  const [allLeadsForDaily, setAllLeadsForDaily] = useState<DailyLead[]>([]);
  const [yesterdayMessages, setYesterdayMessages] = useState<{
    emailInbound: number; emailOutbound: number; whatsappInbound: number; whatsappOutbound: number;
    topEmailInbound: { id: string; name: string; count: number }[];
    topEmailOutbound: { id: string; name: string; count: number }[];
    topWhatsappInbound: { id: string; name: string; count: number }[];
    topWhatsappOutbound: { id: string; name: string; count: number }[];
  }>({ emailInbound: 0, emailOutbound: 0, whatsappInbound: 0, whatsappOutbound: 0, topEmailInbound: [], topEmailOutbound: [], topWhatsappInbound: [], topWhatsappOutbound: [] });
  const [todayMessages, setTodayMessages] = useState<{
    emailInbound: number; emailOutbound: number; whatsappInbound: number; whatsappOutbound: number;
    topEmailInbound: { id: string; name: string; count: number }[];
    topEmailOutbound: { id: string; name: string; count: number }[];
    topWhatsappInbound: { id: string; name: string; count: number }[];
    topWhatsappOutbound: { id: string; name: string; count: number }[];
  }>({ emailInbound: 0, emailOutbound: 0, whatsappInbound: 0, whatsappOutbound: 0, topEmailInbound: [], topEmailOutbound: [], topWhatsappInbound: [], topWhatsappOutbound: [] });
  const [loading, setLoading] = useState(true);
  const [monthsToShow] = useState(12);
  const [activeProducts, setActiveProducts] = useState<Set<string>>(
    new Set(['consultoria', 'publicidade', 'palestra', 'mentoria', 'treinamento', 'documentario', 'outros'])
  );

  const toggleProduct = (product: string) => {
    setActiveProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(product)) {
        newSet.delete(product);
      } else {
        newSet.add(product);
      }
      return newSet;
    });
  };

  const filteredProductKeys = useMemo(() => {
    return ['consultoria', 'publicidade', 'palestra', 'mentoria', 'treinamento', 'documentario', 'outros'].filter(
      key => activeProducts.has(key)
    );
  }, [activeProducts]);

  useEffect(() => {
    if (user) {
      fetchLeads(leads.length === 0);
    }
  }, [user]);

  // Refetch data when page becomes visible again (e.g. switching tabs/windows)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        fetchLeads(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  const fetchLeads = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const [closedRes, openRes, allRes] = await Promise.all([
        supabase
          .from('leads')
          .select('id, name, status, produto, matriculado_at, delivered_at, resolvido_at, created_at, valor, moeda, archived, unclassified')
          .in('status', ['matriculado', 'resolvido', 'em_atendimento'])
          .or('archived.is.null,archived.eq.false')
          .or('unclassified.is.null,unclassified.eq.false'),
        supabase
          .from('leads')
          .select('id, name, status, produto, matriculado_at, delivered_at, resolvido_at, created_at, valor, moeda, archived, unclassified')
          .in('status', ['novo', 'em_negociacao'])
          .or('archived.is.null,archived.eq.false')
          .or('unclassified.is.null,unclassified.eq.false'),
        supabase
          .from('leads')
          .select('id, name, status, created_at, negociacao_at, matriculado_at, nao_convertido_at, delivered_at, resolvido_at, valor, valor_pago, moeda, ai_close_probability, ai_next_step, ai_diagnosis, ai_diagnosis_reason, archived, unclassified')
          .or('archived.is.null,archived.eq.false')
          .or('unclassified.is.null,unclassified.eq.false'),
      ]);

      if (closedRes.error) throw closedRes.error;
      if (openRes.error) throw openRes.error;
      if (allRes.error) throw allRes.error;
      setLeads(closedRes.data || []);
      setOpenLeads(openRes.data || []);
      setAllLeadsForDaily(allRes.data || []);

      // Fetch yesterday's message counts — only from active leads
      const now = new Date();
      const yStart = startOfDay(subDays(now, 1)).toISOString();
      const yEnd = endOfDay(subDays(now, 1)).toISOString();

      const activeStatuses = ['novo', 'em_negociacao', 'matriculado', 'em_atendimento'];
      const activeLeadIds = (allRes.data || [])
        .filter(l => l.status && activeStatuses.includes(l.status) && !l.archived && !l.unclassified)
        .map(l => l.id);

      let emailInbound = 0, emailOutbound = 0, whatsappInbound = 0, whatsappOutbound = 0;
      let topEmailInbound: { id: string; name: string; count: number }[] = [];
      let topEmailOutbound: { id: string; name: string; count: number }[] = [];
      let topWhatsappInbound: { id: string; name: string; count: number }[] = [];
      let topWhatsappOutbound: { id: string; name: string; count: number }[] = [];

      // Build lead name map
      const leadNameMap: Record<string, string> = {};
      (allRes.data || []).forEach(l => { leadNameMap[l.id] = l.name; });

      const buildTop5 = (msgs: { direction: string; lead_id: string | null }[], dir: string) => {
        const counts: Record<string, number> = {};
        msgs.filter(m => m.direction === dir && m.lead_id).forEach(m => {
          counts[m.lead_id!] = (counts[m.lead_id!] || 0) + 1;
        });
        return Object.entries(counts)
          .map(([id, count]) => ({ id, name: leadNameMap[id] || id, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
      };

      if (activeLeadIds.length > 0) {
        const [emailRes, whatsappRes] = await Promise.all([
          supabase.from('email_messages').select('direction, lead_id')
            .gte('timestamp', yStart).lte('timestamp', yEnd)
            .in('lead_id', activeLeadIds),
          supabase.from('whatsapp_messages').select('direction, lead_id, message')
            .gte('timestamp', yStart).lte('timestamp', yEnd)
            .in('lead_id', activeLeadIds),
        ]);

        const emails = emailRes.data || [];
        // Filter out empty WhatsApp messages (CHAT_LABEL_ASSOCIATION junk)
        const whatsapps = (whatsappRes.data || []).filter(w => w.message && w.message.trim() !== '');
        emailInbound = emails.filter(e => e.direction === 'inbound').length;
        emailOutbound = emails.filter(e => e.direction === 'outbound').length;
        whatsappInbound = whatsapps.filter(w => w.direction === 'inbound').length;
        whatsappOutbound = whatsapps.filter(w => w.direction === 'outbound').length;


        topEmailInbound = buildTop5(emails, 'inbound');
        topEmailOutbound = buildTop5(emails, 'outbound');
        topWhatsappInbound = buildTop5(whatsapps, 'inbound');
        topWhatsappOutbound = buildTop5(whatsapps, 'outbound');
      }

      setYesterdayMessages({
        emailInbound, emailOutbound, whatsappInbound, whatsappOutbound,
        topEmailInbound, topEmailOutbound, topWhatsappInbound, topWhatsappOutbound,
      });

      // Fetch today's message counts
      const tStart = startOfDay(now).toISOString();
      const tEnd = endOfDay(now).toISOString();

      let tEmailIn = 0, tEmailOut = 0, tWhatsIn = 0, tWhatsOut = 0;
      let tTopEmailIn: { id: string; name: string; count: number }[] = [];
      let tTopEmailOut: { id: string; name: string; count: number }[] = [];
      let tTopWhatsIn: { id: string; name: string; count: number }[] = [];
      let tTopWhatsOut: { id: string; name: string; count: number }[] = [];

      if (activeLeadIds.length > 0) {
        const [tEmailRes, tWhatsRes] = await Promise.all([
          supabase.from('email_messages').select('direction, lead_id')
            .gte('timestamp', tStart).lte('timestamp', tEnd)
            .in('lead_id', activeLeadIds),
          supabase.from('whatsapp_messages').select('direction, lead_id, message')
            .gte('timestamp', tStart).lte('timestamp', tEnd)
            .in('lead_id', activeLeadIds),
        ]);

        const tEmails = tEmailRes.data || [];
        // Filter out empty WhatsApp messages (CHAT_LABEL_ASSOCIATION junk)
        const tWhatsapps = (tWhatsRes.data || []).filter(w => w.message && w.message.trim() !== '');
        tEmailIn = tEmails.filter(e => e.direction === 'inbound').length;
        tEmailOut = tEmails.filter(e => e.direction === 'outbound').length;
        tWhatsIn = tWhatsapps.filter(w => w.direction === 'inbound').length;
        tWhatsOut = tWhatsapps.filter(w => w.direction === 'outbound').length;

        tTopEmailIn = buildTop5(tEmails, 'inbound');
        tTopEmailOut = buildTop5(tEmails, 'outbound');
        tTopWhatsIn = buildTop5(tWhatsapps, 'inbound');
        tTopWhatsOut = buildTop5(tWhatsapps, 'outbound');
      }

      setTodayMessages({
        emailInbound: tEmailIn, emailOutbound: tEmailOut, whatsappInbound: tWhatsIn, whatsappOutbound: tWhatsOut,
        topEmailInbound: tTopEmailIn, topEmailOutbound: tTopEmailOut, topWhatsappInbound: tTopWhatsIn, topWhatsappOutbound: tTopWhatsOut,
      });
    } catch (error) {
      console.error('Erro ao buscar leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMonthIntervals = useMemo(() => {
    const intervals: { start: Date; end: Date; label: string; key: string }[] = [];
    const now = new Date();
    
    for (let i = 0; i < monthsToShow; i++) {
      const monthStart = startOfMonth(subMonths(now, i));
      const monthEnd = endOfMonth(subMonths(now, i));
      const label = format(monthStart, "MMM/yy", { locale: ptBR });
      const key = format(monthStart, "yyyy-MM");
      
      intervals.unshift({ start: monthStart, end: monthEnd, label, key });
    }
    
    return intervals;
  }, [monthsToShow]);

  const processCountData = (leads: Lead[], dateField: 'matriculado_at' | 'delivered_at' | 'resolvido_at' | 'created_at', fallbackField: 'created_at' | null = null): MonthlyData[] => {
    return getMonthIntervals.map(interval => {
      const monthData: MonthlyData = {
        month: interval.key,
        monthLabel: interval.label,
        consultoria: 0,
        publicidade: 0,
        palestra: 0,
        mentoria: 0,
        treinamento: 0,
        outros: 0,
        leads: {
          consultoria: [],
          publicidade: [],
          palestra: [],
          mentoria: [],
          treinamento: [],
          outros: [],
        },
      };

      leads.forEach(lead => {
        // Use the primary date field, or fallback to the secondary field
        const dateStr = lead[dateField] || (fallbackField ? lead[fallbackField] : null);
        if (!dateStr) return;

        const date = new Date(dateStr);
        if (isWithinInterval(date, { start: interval.start, end: interval.end })) {
          const produto = lead.produto?.toLowerCase() || 'outros';
          const leadInfo: LeadInfo = {
            id: lead.id,
            name: lead.name,
            valor: lead.valor,
            moeda: lead.moeda,
            valorUSD: convertToUSD(lead.valor, lead.moeda),
          };
          
          if (produto in monthData.leads) {
            (monthData as any)[produto]++;
            monthData.leads[produto].push(leadInfo);
          } else {
            monthData.outros++;
            monthData.leads.outros.push(leadInfo);
          }
        }
      });

      return monthData;
    });
  };

  const processRevenueData = (leads: Lead[], dateField: 'matriculado_at' | 'delivered_at' | 'resolvido_at' | 'created_at', fallbackField: 'created_at' | null = null): MonthlyRevenueData[] => {
    return getMonthIntervals.map(interval => {
      const monthData: MonthlyRevenueData = {
        month: interval.key,
        monthLabel: interval.label,
        consultoria: 0,
        publicidade: 0,
        palestra: 0,
        mentoria: 0,
        treinamento: 0,
        outros: 0,
        leads: {
          consultoria: [],
          publicidade: [],
          palestra: [],
          mentoria: [],
          treinamento: [],
          outros: [],
        },
      };

      leads.forEach(lead => {
        // Use the primary date field, or fallback to the secondary field
        const dateStr = lead[dateField] || (fallbackField ? lead[fallbackField] : null);
        if (!dateStr) return;

        const date = new Date(dateStr);
        if (isWithinInterval(date, { start: interval.start, end: interval.end })) {
          const valorUSD = convertToUSD(lead.valor, lead.moeda);
          const produto = lead.produto?.toLowerCase() || 'outros';
          const leadInfo: LeadInfo = {
            id: lead.id,
            name: lead.name,
            valor: lead.valor,
            moeda: lead.moeda,
            valorUSD,
          };
          
          if (produto in monthData.leads) {
            (monthData as any)[produto] += valorUSD;
            monthData.leads[produto].push(leadInfo);
          } else {
            monthData.outros += valorUSD;
            monthData.leads.outros.push(leadInfo);
          }
        }
      });

      return monthData;
    });
  };

  // Count data - filter by date field not null, not by status
  const wonCountData = useMemo(() => {
    const wonLeads = leads.filter(l => l.matriculado_at !== null);
    return processCountData(wonLeads, 'matriculado_at', null);
  }, [leads, getMonthIntervals]);

  const producedCountData = useMemo(() => {
    const producedLeads = leads.filter(l => l.resolvido_at !== null);
    return processCountData(producedLeads, 'resolvido_at', null);
  }, [leads, getMonthIntervals]);

  const deliveredCountData = useMemo(() => {
    const deliveredLeads = leads.filter(l => l.delivered_at !== null);
    return processCountData(deliveredLeads, 'delivered_at', null);
  }, [leads, getMonthIntervals]);

  // Revenue data - filter by date field not null, not by status
  const wonRevenueData = useMemo(() => {
    const wonLeads = leads.filter(l => l.matriculado_at !== null);
    return processRevenueData(wonLeads, 'matriculado_at', null);
  }, [leads, getMonthIntervals]);

  const producedRevenueData = useMemo(() => {
    const producedLeads = leads.filter(l => l.resolvido_at !== null);
    return processRevenueData(producedLeads, 'resolvido_at', null);
  }, [leads, getMonthIntervals]);

  const deliveredRevenueData = useMemo(() => {
    const deliveredLeads = leads.filter(l => l.delivered_at !== null);
    return processRevenueData(deliveredLeads, 'delivered_at', null);
  }, [leads, getMonthIntervals]);

  const numericProductKeys = ['consultoria', 'publicidade', 'palestra', 'mentoria', 'treinamento', 'documentario', 'outros'];

  // Calculate totals for counts
  const wonCountTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    numericProductKeys.forEach(key => {
      totals[key] = wonCountData.reduce((sum, month) => sum + ((month as any)[key] || 0), 0);
    });
    return totals;
  }, [wonCountData]);

  const producedCountTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    numericProductKeys.forEach(key => {
      totals[key] = producedCountData.reduce((sum, month) => sum + ((month as any)[key] || 0), 0);
    });
    return totals;
  }, [producedCountData]);

  const deliveredCountTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    numericProductKeys.forEach(key => {
      totals[key] = deliveredCountData.reduce((sum, month) => sum + ((month as any)[key] || 0), 0);
    });
    return totals;
  }, [deliveredCountData]);

  // Calculate totals for revenue
  const wonRevenueTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    numericProductKeys.forEach(key => {
      totals[key] = wonRevenueData.reduce((sum, month) => sum + ((month as any)[key] || 0), 0);
    });
    return totals;
  }, [wonRevenueData]);

  const producedRevenueTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    numericProductKeys.forEach(key => {
      totals[key] = producedRevenueData.reduce((sum, month) => sum + ((month as any)[key] || 0), 0);
    });
    return totals;
  }, [producedRevenueData]);

  const deliveredRevenueTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    numericProductKeys.forEach(key => {
      totals[key] = deliveredRevenueData.reduce((sum, month) => sum + ((month as any)[key] || 0), 0);
    });
    return totals;
  }, [deliveredRevenueData]);

  // Open leads data - by created_at
  const openCountData = useMemo(() => {
    return processCountData(openLeads, 'created_at', null);
  }, [openLeads, getMonthIntervals]);

  const openRevenueData = useMemo(() => {
    return processRevenueData(openLeads, 'created_at', null);
  }, [openLeads, getMonthIntervals]);

  const openCountTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    numericProductKeys.forEach(key => {
      totals[key] = openCountData.reduce((sum, month) => sum + ((month as any)[key] || 0), 0);
    });
    return totals;
  }, [openCountData]);

  const openRevenueTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    numericProductKeys.forEach(key => {
      totals[key] = openRevenueData.reduce((sum, month) => sum + ((month as any)[key] || 0), 0);
    });
    return totals;
  }, [openRevenueData]);

  const totalWonCount = numericProductKeys.reduce((sum, key) => sum + (wonCountTotals[key] || 0), 0);
  const totalProducedCount = numericProductKeys.reduce((sum, key) => sum + (producedCountTotals[key] || 0), 0);
  const totalDeliveredCount = numericProductKeys.reduce((sum, key) => sum + (deliveredCountTotals[key] || 0), 0);
  const totalOpenCount = numericProductKeys.reduce((sum, key) => sum + (openCountTotals[key] || 0), 0);
  const totalWonRevenue = numericProductKeys.reduce((sum, key) => sum + (wonRevenueTotals[key] || 0), 0);
  const totalProducedRevenue = numericProductKeys.reduce((sum, key) => sum + (producedRevenueTotals[key] || 0), 0);
  const totalDeliveredRevenue = numericProductKeys.reduce((sum, key) => sum + (deliveredRevenueTotals[key] || 0), 0);
  const totalOpenRevenue = numericProductKeys.reduce((sum, key) => sum + (openRevenueTotals[key] || 0), 0);

  if (authLoading || (loading && leads.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const openOpportunity = (leadId: string) => {
    window.open(`/opportunity/${leadId}`, '_blank');
  };

  const stopTooltipEvent = (e: SyntheticEvent) => {
    e.stopPropagation();
  };

  const CustomCountTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, entry: any) => sum + entry.value, 0);
      const monthData = payload[0]?.payload;
      
      return (
        <div 
          className="bg-background border rounded-lg shadow-lg p-3 max-w-xs max-h-80 overflow-y-auto"
          onMouseEnter={stopTooltipEvent}
          onMouseMove={stopTooltipEvent}
          onMouseMoveCapture={stopTooltipEvent}
          onPointerMove={stopTooltipEvent}
          onPointerMoveCapture={stopTooltipEvent}
          onMouseDownCapture={stopTooltipEvent}
          onClickCapture={stopTooltipEvent}
        >
          <p className="font-semibold mb-2">{label}</p>
          {payload
            .filter((entry: any) => entry.value > 0)
            .map((entry: any) => {
              const leadsForProduct = monthData?.leads?.[entry.dataKey] || [];
              return (
                <div key={entry.dataKey} className="mb-2">
                  <p style={{ color: entry.color }} className="text-sm font-medium">
                    {PRODUCT_LABELS[entry.dataKey]}: {entry.value}
                  </p>
                  <div className="ml-2 mt-1 space-y-0.5">
                    {leadsForProduct.map((lead: LeadInfo) => (
                      <a
                        key={lead.id}
                        href={`/opportunity/${lead.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="block text-xs text-muted-foreground hover:text-primary hover:underline cursor-pointer w-full text-left truncate"
                      >
                        • {lead.name}
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          <p className="font-semibold mt-2 pt-2 border-t">Total: {total}</p>
        </div>
      );
    }
    return null;
  };

  const CustomRevenueTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, entry: any) => sum + entry.value, 0);
      const monthData = payload[0]?.payload;
      
      return (
        <div 
          className="bg-background border rounded-lg shadow-lg p-3 max-w-sm max-h-80 overflow-y-auto"
          onMouseEnter={stopTooltipEvent}
          onMouseMove={stopTooltipEvent}
          onMouseMoveCapture={stopTooltipEvent}
          onPointerMove={stopTooltipEvent}
          onPointerMoveCapture={stopTooltipEvent}
          onMouseDownCapture={stopTooltipEvent}
          onClickCapture={stopTooltipEvent}
        >
          <p className="font-semibold mb-2">{label}</p>
          {payload
            .filter((entry: any) => entry.value > 0)
            .map((entry: any) => {
              const leadsForProduct = monthData?.leads?.[entry.dataKey] || [];
              return (
                <div key={entry.dataKey} className="mb-2">
                  <p style={{ color: entry.color }} className="text-sm font-medium">
                    {PRODUCT_LABELS[entry.dataKey]}: {formatCurrency(entry.value)}
                  </p>
                  <div className="ml-2 mt-1 space-y-0.5">
                    {leadsForProduct.map((lead: LeadInfo) => (
                      <a
                        key={lead.id}
                        href={`/opportunity/${lead.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="block text-xs text-muted-foreground hover:text-primary hover:underline cursor-pointer w-full text-left truncate"
                      >
                        • {lead.name} — {formatCurrency(lead.valorUSD)}
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          <p className="font-semibold mt-2 pt-2 border-t">Total: {formatCurrency(total)}</p>
        </div>
      );
    }
    return null;
  };

  const productKeys = ['consultoria', 'publicidade', 'palestra', 'mentoria', 'treinamento', 'documentario', 'outros'];

  const ProductFilters = () => (
    <Card className="mb-6">
      <CardContent className="py-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground mr-2">Filtrar por tipo:</span>
          {productKeys.map(key => (
            <button
              key={key}
              onClick={() => toggleProduct(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                activeProducts.has(key)
                  ? 'ring-2 ring-offset-2 ring-offset-background'
                  : 'opacity-40 hover:opacity-60'
              }`}
              style={{
                backgroundColor: activeProducts.has(key) ? PRODUCT_COLORS[key] : 'transparent',
                color: activeProducts.has(key) ? 'white' : PRODUCT_COLORS[key],
                borderColor: PRODUCT_COLORS[key],
                // @ts-ignore
                '--tw-ring-color': PRODUCT_COLORS[key],
              } as React.CSSProperties}
            >
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: activeProducts.has(key) ? 'white' : PRODUCT_COLORS[key] }}
              />
              {PRODUCT_LABELS[key]}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link to="/opportunities">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl md:text-4xl font-bold">Insights</h1>
              <p className="text-muted-foreground">Últimos {monthsToShow} meses</p>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Em Aberto</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalOpenCount}</div>
              <p className="text-xs text-muted-foreground">{formatCurrency(totalOpenRevenue)} pipeline</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ganhos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalWonCount}</div>
              <p className="text-xs text-muted-foreground">{formatCurrency(totalWonRevenue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Produzidos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalProducedCount}</div>
              <p className="text-xs text-muted-foreground">{formatCurrency(totalProducedRevenue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Entregues</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalDeliveredCount}</div>
              <p className="text-xs text-muted-foreground">{formatCurrency(totalDeliveredRevenue)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Product Filters */}
        <ProductFilters />

        {/* Tabs for Charts */}
        <Tabs defaultValue="hoje" className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="hoje">Hoje</TabsTrigger>
            <TabsTrigger value="abertos">Em Aberto</TabsTrigger>
            <TabsTrigger value="ganhos">Ganhos</TabsTrigger>
            <TabsTrigger value="produzidos">Produzidos</TabsTrigger>
            <TabsTrigger value="entregues">Entregues</TabsTrigger>
          </TabsList>

          {/* Tab: Hoje - Daily Dashboard */}
          <TabsContent value="hoje">
            <DailyDashboard allLeads={allLeadsForDaily} yesterdayMessages={yesterdayMessages} todayMessages={todayMessages} />
          </TabsContent>

          {/* Tab: Em Aberto */}
          <TabsContent value="abertos" className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-lg">Novos Leads em Aberto por Mês</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={openCountData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <Tooltip content={<CustomCountTooltip />} wrapperStyle={{ pointerEvents: 'auto' }} />
                      {filteredProductKeys.map(key => (
                        <Bar key={key} dataKey={key} stackId="a" fill={PRODUCT_COLORS[key]} name={PRODUCT_LABELS[key]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Por produto:</p>
                  <div className="flex flex-wrap gap-3">
                    {productKeys.map(key => (
                      openCountTotals[key] > 0 && (
                        <div key={key} className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PRODUCT_COLORS[key] }} />
                          <span className="text-xs">
                            {PRODUCT_LABELS[key]}: <span className="font-semibold">{openCountTotals[key]}</span>
                          </span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  <span className="text-lg">Pipeline em Aberto por Mês (USD)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={openRevenueData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                      <Tooltip content={<CustomRevenueTooltip />} wrapperStyle={{ pointerEvents: 'auto' }} />
                      {filteredProductKeys.map(key => (
                        <Bar key={key} dataKey={key} stackId="a" fill={PRODUCT_COLORS[key]} name={PRODUCT_LABELS[key]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Por produto:</p>
                  <div className="flex flex-wrap gap-3">
                    {productKeys.map(key => (
                      openRevenueTotals[key] > 0 && (
                        <div key={key} className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PRODUCT_COLORS[key] }} />
                          <span className="text-xs">
                            {PRODUCT_LABELS[key]}: <span className="font-semibold">{formatCurrency(openRevenueTotals[key])}</span>
                          </span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Ganhos */}
          <TabsContent value="ganhos" className="space-y-8">
            {/* Won Count Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-lg">Negócios Ganhos por Mês</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={wonCountData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="monthLabel" 
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        allowDecimals={false}
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                      />
                      <Tooltip 
                        content={<CustomCountTooltip />} 
                        wrapperStyle={{ pointerEvents: 'auto' }}
                      />
                      {filteredProductKeys.map(key => (
                        <Bar 
                          key={key}
                          dataKey={key} 
                          stackId="a" 
                          fill={PRODUCT_COLORS[key]}
                          name={PRODUCT_LABELS[key]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Por produto:</p>
                  <div className="flex flex-wrap gap-3">
                    {productKeys.map(key => (
                      wonCountTotals[key] > 0 && (
                        <div key={key} className="flex items-center gap-1">
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: PRODUCT_COLORS[key] }}
                          />
                          <span className="text-xs">
                            {PRODUCT_LABELS[key]}: <span className="font-semibold">{wonCountTotals[key]}</span>
                          </span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Won Revenue Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  <span className="text-lg">Faturamento Ganho por Mês (USD)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={wonRevenueData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="monthLabel" 
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        content={<CustomRevenueTooltip />} 
                        wrapperStyle={{ pointerEvents: 'auto' }}
                      />
                      {filteredProductKeys.map(key => (
                        <Bar 
                          key={key}
                          dataKey={key} 
                          stackId="a" 
                          fill={PRODUCT_COLORS[key]}
                          name={PRODUCT_LABELS[key]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Por produto:</p>
                  <div className="flex flex-wrap gap-3">
                    {productKeys.map(key => (
                      wonRevenueTotals[key] > 0 && (
                        <div key={key} className="flex items-center gap-1">
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: PRODUCT_COLORS[key] }}
                          />
                          <span className="text-xs">
                            {PRODUCT_LABELS[key]}: <span className="font-semibold">{formatCurrency(wonRevenueTotals[key])}</span>
                          </span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Produzidos */}
          <TabsContent value="produzidos" className="space-y-8">
            {/* Produced Count Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-lg">Negócios Produzidos por Mês</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={producedCountData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="monthLabel" 
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        allowDecimals={false}
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                      />
                      <Tooltip 
                        content={<CustomCountTooltip />} 
                        wrapperStyle={{ pointerEvents: 'auto' }}
                      />
                      {filteredProductKeys.map(key => (
                        <Bar 
                          key={key}
                          dataKey={key} 
                          stackId="a" 
                          fill={PRODUCT_COLORS[key]}
                          name={PRODUCT_LABELS[key]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Por produto:</p>
                  <div className="flex flex-wrap gap-3">
                    {productKeys.map(key => (
                      producedCountTotals[key] > 0 && (
                        <div key={key} className="flex items-center gap-1">
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: PRODUCT_COLORS[key] }}
                          />
                          <span className="text-xs">
                            {PRODUCT_LABELS[key]}: <span className="font-semibold">{producedCountTotals[key]}</span>
                          </span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Produced Revenue Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  <span className="text-lg">Faturamento Produzido por Mês (USD)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={producedRevenueData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="monthLabel" 
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        content={<CustomRevenueTooltip />} 
                        wrapperStyle={{ pointerEvents: 'auto' }}
                      />
                      {filteredProductKeys.map(key => (
                        <Bar 
                          key={key}
                          dataKey={key} 
                          stackId="a" 
                          fill={PRODUCT_COLORS[key]}
                          name={PRODUCT_LABELS[key]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Por produto:</p>
                  <div className="flex flex-wrap gap-3">
                    {productKeys.map(key => (
                      producedRevenueTotals[key] > 0 && (
                        <div key={key} className="flex items-center gap-1">
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: PRODUCT_COLORS[key] }}
                          />
                          <span className="text-xs">
                            {PRODUCT_LABELS[key]}: <span className="font-semibold">{formatCurrency(producedRevenueTotals[key])}</span>
                          </span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Entregues */}
          <TabsContent value="entregues" className="space-y-8">
            {/* Delivered Count Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-lg">Negócios Entregues por Mês</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deliveredCountData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="monthLabel" 
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        allowDecimals={false}
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                      />
                      <Tooltip 
                        content={<CustomCountTooltip />} 
                        wrapperStyle={{ pointerEvents: 'auto' }}
                      />
                      {filteredProductKeys.map(key => (
                        <Bar 
                          key={key}
                          dataKey={key} 
                          stackId="a" 
                          fill={PRODUCT_COLORS[key]}
                          name={PRODUCT_LABELS[key]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Por produto:</p>
                  <div className="flex flex-wrap gap-3">
                    {productKeys.map(key => (
                      deliveredCountTotals[key] > 0 && (
                        <div key={key} className="flex items-center gap-1">
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: PRODUCT_COLORS[key] }}
                          />
                          <span className="text-xs">
                            {PRODUCT_LABELS[key]}: <span className="font-semibold">{deliveredCountTotals[key]}</span>
                          </span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Delivered Revenue Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  <span className="text-lg">Faturamento Entregue por Mês (USD)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deliveredRevenueData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="monthLabel" 
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        content={<CustomRevenueTooltip />} 
                        wrapperStyle={{ pointerEvents: 'auto' }}
                      />
                      {filteredProductKeys.map(key => (
                        <Bar 
                          key={key}
                          dataKey={key} 
                          stackId="a" 
                          fill={PRODUCT_COLORS[key]}
                          name={PRODUCT_LABELS[key]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Por produto:</p>
                  <div className="flex flex-wrap gap-3">
                    {productKeys.map(key => (
                      deliveredRevenueTotals[key] > 0 && (
                        <div key={key} className="flex items-center gap-1">
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: PRODUCT_COLORS[key] }}
                          />
                          <span className="text-xs">
                            {PRODUCT_LABELS[key]}: <span className="font-semibold">{formatCurrency(deliveredRevenueTotals[key])}</span>
                          </span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
