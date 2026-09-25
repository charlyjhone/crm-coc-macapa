import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip as ShadTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  subDays, startOfDay, endOfDay, isWithinInterval, format,
  differenceInCalendarDays, subWeeks, startOfWeek, endOfWeek
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, TrendingDown, Minus, DollarSign, Target, Eye, Info } from "lucide-react";

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

interface TopClient {
  id: string;
  name: string;
  count: number;
}

interface YesterdayMessages {
  emailInbound: number;
  emailOutbound: number;
  whatsappInbound: number;
  whatsappOutbound: number;
  topEmailInbound: TopClient[];
  topEmailOutbound: TopClient[];
  topWhatsappInbound: TopClient[];
  topWhatsappOutbound: TopClient[];
}

interface DailyDashboardProps {
  allLeads: DailyLead[];
  yesterdayMessages: YesterdayMessages;
  todayMessages: YesterdayMessages;
}

const COLORS = {
  novos: "hsl(221, 83%, 53%)",
  negociacoes: "hsl(25, 95%, 53%)",
  ganhos: "hsl(142, 76%, 36%)",
  perdidos: "hsl(0, 84%, 60%)",
  funil: {
    novo: "hsl(221, 83%, 53%)",
    em_atendimento: "hsl(215, 20%, 45%)",
    em_aberto: "hsl(221, 83%, 53%)",
    em_negociacao: "hsl(25, 95%, 53%)",
    matriculado: "hsl(142, 76%, 36%)",
    ganho: "hsl(142, 76%, 36%)",
    resolvido: "hsl(199, 89%, 48%)",
    produzido: "hsl(199, 89%, 48%)",
    entregue: "hsl(262, 83%, 58%)",
    nao_convertido: "hsl(0, 84%, 60%)",
  }
};

const openOpportunity = (leadId: string) => {
  window.open(`/opportunity/${leadId}`, '_blank');
};

export default function DailyDashboard({ allLeads, yesterdayMessages, todayMessages }: DailyDashboardProps) {
  const now = new Date();
  const yesterday = subDays(now, 1);
  const yesterdayStart = startOfDay(yesterday);
  const yesterdayEnd = endOfDay(yesterday);
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  // === Chart toggles ===
  const [activeEvolutionSeries, setActiveEvolutionSeries] = useState<Record<string, boolean>>({
    novos: true, negociacoes: true, ganhos: true, perdidos: true, entregues: true,
  });
  const [activeMovingAvgSeries, setActiveMovingAvgSeries] = useState<Record<string, boolean>>({
    mediaMovelNovos: true, mediaMovelGanhos: true, mediaMovelPerdidos: true, mediaMovelEntregues: true,
  });

  const toEur = (value: number | null, moeda: string | null) => {
    if (!value) return 0;
    if (moeda === 'USD') return value * 0.92;
    if (moeda === 'EUR') return value;
    return value * 0.18;
  };

  const formatEur = (value: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(Math.round(value));
  };

  const formatCurrency = (value: number | null, moeda: string | null = 'BRL') => {
    if (!value) return "R$ 0";
    const currency = moeda === 'USD' ? 'USD' : 'BRL';
    const locale = currency === 'USD' ? 'en-US' : 'pt-BR';
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0 }).format(value);
  };

  const totalEurForLeads = (leads: DailyLead[]) => {
    return leads.reduce((sum, l) => {
      const aReceber = (l.valor ?? 0) - (l.valor_pago ?? 0);
      return sum + toEur(aReceber > 0 ? aReceber : 0, l.moeda);
    }, 0);
  };

  // === Yesterday's metrics ===
  const yesterdayMetrics = useMemo(() => {
    const isYesterday = (dateStr: string | null) => {
      if (!dateStr) return false;
      return isWithinInterval(new Date(dateStr), { start: yesterdayStart, end: yesterdayEnd });
    };

    const novos = allLeads.filter(l => isYesterday(l.created_at));
    const negociacoes = allLeads.filter(l => isYesterday(l.negociacao_at));
    const ganhos = allLeads.filter(l => isYesterday(l.matriculado_at));
    const perdidos = allLeads.filter(l => isYesterday(l.nao_convertido_at));
    const produzidos = allLeads.filter(l => isYesterday(l.resolvido_at));
    const entregues = allLeads.filter(l => isYesterday(l.delivered_at));

    return { novos, negociacoes, ganhos, perdidos, produzidos, entregues };
  }, [allLeads, yesterdayStart, yesterdayEnd]);

  // === Today's metrics ===
  const todayMetrics = useMemo(() => {
    const isToday = (dateStr: string | null) => {
      if (!dateStr) return false;
      return isWithinInterval(new Date(dateStr), { start: todayStart, end: todayEnd });
    };
    return {
      novos: allLeads.filter(l => isToday(l.created_at)),
      negociacoes: allLeads.filter(l => isToday(l.negociacao_at)),
      ganhos: allLeads.filter(l => isToday(l.matriculado_at)),
      perdidos: allLeads.filter(l => isToday(l.nao_convertido_at)),
      produzidos: allLeads.filter(l => isToday(l.resolvido_at)),
      entregues: allLeads.filter(l => isToday(l.delivered_at)),
    };
  }, [allLeads, todayStart, todayEnd]);

  // === 7-day averages (last 14 days average vs last 7 days) ===
  const sevenDayComparison = useMemo(() => {
    const last7Start = startOfDay(subDays(now, 7));
    const last7End = endOfDay(subDays(now, 1));
    const prev7Start = startOfDay(subDays(now, 14));
    const prev7End = endOfDay(subDays(now, 8));

    const inRange = (dateStr: string | null, start: Date, end: Date) => {
      if (!dateStr) return false;
      return isWithinInterval(new Date(dateStr), { start, end });
    };

    const last7 = {
      novos: allLeads.filter(l => inRange(l.created_at, last7Start, last7End)).length,
      negociacoes: allLeads.filter(l => inRange(l.negociacao_at, last7Start, last7End)).length,
      ganhos: allLeads.filter(l => inRange(l.matriculado_at, last7Start, last7End)).length,
      perdidos: allLeads.filter(l => inRange(l.nao_convertido_at, last7Start, last7End)).length,
    };

    const prev7 = {
      novos: allLeads.filter(l => inRange(l.created_at, prev7Start, prev7End)).length,
      negociacoes: allLeads.filter(l => inRange(l.negociacao_at, prev7Start, prev7End)).length,
      ganhos: allLeads.filter(l => inRange(l.matriculado_at, prev7Start, prev7End)).length,
      perdidos: allLeads.filter(l => inRange(l.nao_convertido_at, prev7Start, prev7End)).length,
    };

    return { last7, prev7 };
  }, [allLeads]);

  // === 30-day daily data for charts ===
  const dailyData30 = useMemo(() => {
    const days: { date: string; label: string; novos: number; negociacoes: number; ganhos: number; perdidos: number; entregues: number }[] = [];

    for (let i = 30; i >= 1; i--) {
      const day = subDays(now, i);
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);

      const inDay = (dateStr: string | null) => {
        if (!dateStr) return false;
        return isWithinInterval(new Date(dateStr), { start: dayStart, end: dayEnd });
      };

      days.push({
        date: format(day, "yyyy-MM-dd"),
        label: format(day, "dd/MM", { locale: ptBR }),
        novos: allLeads.filter(l => inDay(l.created_at)).length,
        negociacoes: allLeads.filter(l => inDay(l.negociacao_at)).length,
        ganhos: allLeads.filter(l => inDay(l.matriculado_at)).length,
        perdidos: allLeads.filter(l => inDay(l.nao_convertido_at)).length,
        entregues: allLeads.filter(l => inDay(l.delivered_at)).length,
      });
    }

    return days;
  }, [allLeads]);

  // === Cumulative 30-day data ===
  const cumulativeData30 = useMemo(() => {
    const cumulative = { novos: 0, negociacoes: 0, ganhos: 0, perdidos: 0, entregues: 0 };
    return dailyData30.map(day => {
      cumulative.novos += day.novos;
      cumulative.negociacoes += day.negociacoes;
      cumulative.ganhos += day.ganhos;
      cumulative.perdidos += day.perdidos;
      cumulative.entregues += day.entregues;
      return { label: day.label, novos: cumulative.novos, negociacoes: cumulative.negociacoes, ganhos: cumulative.ganhos, perdidos: cumulative.perdidos, entregues: cumulative.entregues };
    });
  }, [dailyData30]);

  // === Moving average data ===
  const movingAverageData = useMemo(() => {
    return dailyData30.map((day, idx) => {
      const windowStart = Math.max(0, idx - 6);
      const window = dailyData30.slice(windowStart, idx + 1);
      const avgNovos = window.reduce((s, d) => s + d.novos, 0) / window.length;
      const avgGanhos = window.reduce((s, d) => s + d.ganhos, 0) / window.length;
      const avgPerdidos = window.reduce((s, d) => s + d.perdidos, 0) / window.length;
      const avgEntregues = window.reduce((s, d) => s + d.entregues, 0) / window.length;

      return {
        ...day,
        mediaMovelNovos: Math.round(avgNovos * 100) / 100,
        mediaMovelGanhos: Math.round(avgGanhos * 100) / 100,
        mediaMovelPerdidos: Math.round(avgPerdidos * 100) / 100,
        mediaMovelEntregues: Math.round(avgEntregues * 100) / 100,
      };
    });
  }, [dailyData30]);

  // === Funnel data (without perdido) ===
  const funnelData = useMemo(() => {
    const statusCounts: Record<string, { count: number; eurTotal: number }> = {
      em_aberto: { count: 0, eurTotal: 0 },
      em_negociacao: { count: 0, eurTotal: 0 },
      ganho: { count: 0, eurTotal: 0 },
      produzido: { count: 0, eurTotal: 0 },
    };

    allLeads.forEach(l => {
      const funnelStatus =
        l.status === 'novo' || l.status === 'em_atendimento' ? 'em_aberto' :
        l.status === 'em_negociacao' ? 'em_negociacao' :
        l.status === 'matriculado' ? 'ganho' :
        l.status === 'resolvido' ? 'produzido' :
        null;

      if (funnelStatus) {
        statusCounts[funnelStatus].count++;
        const aReceber = (l.valor ?? 0) - (l.valor_pago ?? 0);
        statusCounts[funnelStatus].eurTotal += toEur(aReceber > 0 ? aReceber : 0, l.moeda);
      }
    });

    return [
      { name: "Em Aberto", value: statusCounts.em_aberto.count, eur: statusCounts.em_aberto.eurTotal, fill: COLORS.funil.em_aberto },
      { name: "Negociação", value: statusCounts.em_negociacao.count, eur: statusCounts.em_negociacao.eurTotal, fill: COLORS.funil.em_negociacao },
      { name: "Ganho", value: statusCounts.ganho.count, eur: statusCounts.ganho.eurTotal, fill: COLORS.funil.ganho },
      { name: "Produzido", value: statusCounts.produzido.count, eur: statusCounts.produzido.eurTotal, fill: COLORS.funil.produzido },
    ];
  }, [allLeads]);

  // === Weekly conversion rates (12 weeks) — Aberto → Ganho only ===
  const weeklyConversionData = useMemo(() => {
    const weeks: { label: string; aberto_ganho: number }[] = [];

    for (let i = 11; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(subWeeks(now, i), { weekStartsOn: 1 });

      const inWeek = (dateStr: string | null) => {
        if (!dateStr) return false;
        return isWithinInterval(new Date(dateStr), { start: weekStart, end: weekEnd });
      };

      const novosWeek = allLeads.filter(l => inWeek(l.created_at)).length;
      const ganhosWeek = allLeads.filter(l => inWeek(l.matriculado_at)).length;

      weeks.push({
        label: format(weekStart, "dd/MM", { locale: ptBR }),
        aberto_ganho: novosWeek > 0 ? Math.round((ganhosWeek / novosWeek) * 100) : 0,
      });
    }

    return weeks;
  }, [allLeads]);

  // === Action suggestions ===
  const paymentPending = useMemo(() => {
    return allLeads
      .filter(l => l.status === 'matriculado' && l.valor && (l.valor_pago ?? 0) < l.valor)
      .sort((a, b) => {
        const da = a.resolvido_at ? new Date(a.resolvido_at).getTime() : Infinity;
        const db = b.resolvido_at ? new Date(b.resolvido_at).getTime() : Infinity;
        return da - db;
      });
  }, [allLeads]);

  const topNegociacao = useMemo(() => {
    return allLeads
      .filter(l => l.status === 'em_negociacao' && l.ai_close_probability !== null)
      .sort((a, b) => (b.ai_close_probability ?? 0) - (a.ai_close_probability ?? 0))
      .slice(0, 5);
  }, [allLeads]);

  const topNovo = useMemo(() => {
    return allLeads
      .filter(l => l.status === 'novo' && l.ai_close_probability !== null)
      .sort((a, b) => (b.ai_close_probability ?? 0) - (a.ai_close_probability ?? 0))
      .slice(0, 5);
  }, [allLeads]);

  const TrendBadge = ({ current, previous }: { current: number; previous: number }) => {
    if (previous === 0 && current === 0) return <Badge variant="secondary" className="text-xs"><Minus className="h-3 w-3 mr-1" />Igual</Badge>;
    const diff = current - previous;
    const pct = previous > 0 ? Math.round((diff / previous) * 100) : current > 0 ? 100 : 0;
    
    if (diff > 0) return <Badge className="text-xs bg-emerald-100 text-emerald-800 border-emerald-200"><TrendingUp className="h-3 w-3 mr-1" />+{pct}%</Badge>;
    if (diff < 0) return <Badge className="text-xs bg-red-100 text-red-800 border-red-200"><TrendingDown className="h-3 w-3 mr-1" />{pct}%</Badge>;
    return <Badge variant="secondary" className="text-xs"><Minus className="h-3 w-3 mr-1" />Igual</Badge>;
  };

  const YesterdayCard = ({ title, leads, color, icon }: { title: string; leads: DailyLead[]; color: string; icon: string }) => {
    const eurTotal = totalEurForLeads(leads);
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <span>{icon}</span> {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold" style={{ color }}>{leads.length}</span>
            {eurTotal > 0 && (
              <span className="text-sm font-medium text-muted-foreground">• {formatEur(eurTotal)}</span>
            )}
          </div>
          {leads.length > 0 && (
            <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
              {leads.map(l => (
                <button
                  key={l.id}
                  onClick={() => openOpportunity(l.id)}
                  className="block text-xs text-muted-foreground hover:text-primary hover:underline cursor-pointer w-full text-left truncate"
                >
                  • {l.name}{l.valor ? ` — ${formatCurrency(l.valor, l.moeda)}` : ''}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const MessageCountCards = ({ messages, label }: { messages: YesterdayMessages; label: string }) => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[
        { title: "📧 E-mails Recebidos", count: messages.emailInbound, top: messages.topEmailInbound },
        { title: "📤 E-mails Enviados", count: messages.emailOutbound, top: messages.topEmailOutbound },
        { title: "📱 WhatsApp Recebidos", count: messages.whatsappInbound, top: messages.topWhatsappInbound },
        { title: "💬 WhatsApp Enviados", count: messages.whatsappOutbound, top: messages.topWhatsappOutbound },
      ].map(({ title, count, top }) => (
        <TooltipProvider key={`${label}-${title}`}>
          <ShadTooltip>
            <TooltipTrigger asChild>
              <Card className="cursor-default">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle></CardHeader>
                <CardContent><div className="text-3xl font-bold">{count}</div></CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {top.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold mb-1">Top 5 clientes:</p>
                  {top.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => openOpportunity(c.id)}
                      className="block text-xs hover:text-primary hover:underline cursor-pointer w-full text-left"
                    >
                      {i + 1}. {c.name} — {c.count}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs">Nenhuma mensagem</p>
              )}
            </TooltipContent>
          </ShadTooltip>
        </TooltipProvider>
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Today summary */}
      <div>
        <h2 className="text-lg font-semibold mb-4">📋 Resumo de Hoje — {format(now, "dd 'de' MMMM", { locale: ptBR })}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <YesterdayCard title="Novos Leads" leads={todayMetrics.novos} color={COLORS.novos} icon="🆕" />
          <YesterdayCard title="Para Negociação" leads={todayMetrics.negociacoes} color={COLORS.negociacoes} icon="🤝" />
          <YesterdayCard title="Ganhos" leads={todayMetrics.ganhos} color={COLORS.ganhos} icon="✅" />
          <YesterdayCard title="Produzidos" leads={todayMetrics.produzidos} color={COLORS.funil.produzido} icon="🏭" />
          <YesterdayCard title="Entregues" leads={todayMetrics.entregues} color={COLORS.funil.entregue} icon="📦" />
          <YesterdayCard title="Perdidos" leads={todayMetrics.perdidos} color={COLORS.perdidos} icon="❌" />
        </div>
      </div>
      <MessageCountCards messages={todayMessages} label="hoje" />

      {/* Yesterday summary */}
      <div>
        <h2 className="text-lg font-semibold mb-4">📋 Resumo de Ontem — {format(yesterday, "dd 'de' MMMM", { locale: ptBR })}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <YesterdayCard title="Novos Leads" leads={yesterdayMetrics.novos} color={COLORS.novos} icon="🆕" />
          <YesterdayCard title="Para Negociação" leads={yesterdayMetrics.negociacoes} color={COLORS.negociacoes} icon="🤝" />
          <YesterdayCard title="Ganhos" leads={yesterdayMetrics.ganhos} color={COLORS.ganhos} icon="✅" />
          <YesterdayCard title="Produzidos" leads={yesterdayMetrics.produzidos} color={COLORS.funil.produzido} icon="🏭" />
          <YesterdayCard title="Entregues" leads={yesterdayMetrics.entregues} color={COLORS.funil.entregue} icon="📦" />
          <YesterdayCard title="Perdidos" leads={yesterdayMetrics.perdidos} color={COLORS.perdidos} icon="❌" />
        </div>
      </div>

      <MessageCountCards messages={yesterdayMessages} label="ontem" />

      {/* 7-day moving average */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📊 Média Móvel de 7 Dias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Novos", key: "novos" as const, color: COLORS.novos },
              { label: "Negociações", key: "negociacoes" as const, color: COLORS.negociacoes },
              { label: "Ganhos", key: "ganhos" as const, color: COLORS.ganhos },
              { label: "Perdidos", key: "perdidos" as const, color: COLORS.perdidos },
            ].map(({ label, key, color }) => {
              const avg7 = Math.round((sevenDayComparison.last7[key] / 7) * 10) / 10;
              const avgPrev7 = Math.round((sevenDayComparison.prev7[key] / 7) * 10) / 10;
              return (
                <div key={key} className="text-center p-3 rounded-lg border">
                  <div className="text-2xl font-bold" style={{ color }}>{sevenDayComparison.last7[key]}</div>
                  <div className="text-xs text-muted-foreground mb-1">{label} (últimos 7d)</div>
                  <div className="text-sm text-muted-foreground mb-1">Média: {avg7}/dia</div>
                  <TrendBadge current={sevenDayComparison.last7[key]} previous={sevenDayComparison.prev7[key]} />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Chart 1: 30-day cumulative evolution with toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📈 Evolução Acumulada — Últimos 30 Dias</CardTitle>
          <div className="flex flex-wrap gap-3 mt-2">
            {[
              { key: "novos", label: "Novos", color: COLORS.novos },
              { key: "negociacoes", label: "Negociações", color: COLORS.negociacoes },
              { key: "ganhos", label: "Ganhos", color: COLORS.ganhos },
              { key: "perdidos", label: "Perdidos", color: COLORS.perdidos },
              { key: "entregues", label: "Entregues", color: COLORS.funil.entregue },
            ].map(({ key, label, color }) => (
              <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Checkbox
                  checked={activeEvolutionSeries[key]}
                  onCheckedChange={(checked) => setActiveEvolutionSeries(prev => ({ ...prev, [key]: !!checked }))}
                />
                <span style={{ color }}>{label}</span>
              </label>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulativeData30}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                {activeEvolutionSeries.novos && <Area type="monotone" dataKey="novos" stroke={COLORS.novos} fill={COLORS.novos} fillOpacity={0.3} name="Novos" />}
                {activeEvolutionSeries.negociacoes && <Area type="monotone" dataKey="negociacoes" stroke={COLORS.negociacoes} fill={COLORS.negociacoes} fillOpacity={0.3} name="Negociações" />}
                {activeEvolutionSeries.ganhos && <Area type="monotone" dataKey="ganhos" stroke={COLORS.ganhos} fill={COLORS.ganhos} fillOpacity={0.3} name="Ganhos" />}
                {activeEvolutionSeries.perdidos && <Area type="monotone" dataKey="perdidos" stroke={COLORS.perdidos} fill={COLORS.perdidos} fillOpacity={0.3} name="Perdidos" />}
                {activeEvolutionSeries.entregues && <Area type="monotone" dataKey="entregues" stroke={COLORS.funil.entregue} fill={COLORS.funil.entregue} fillOpacity={0.3} name="Entregues" />}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Chart 2: Moving average with toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📉 Média Móvel de 7 Dias</CardTitle>
          <div className="flex flex-wrap gap-3 mt-2">
            {[
              { key: "mediaMovelNovos", label: "Novos", color: COLORS.novos },
              { key: "mediaMovelGanhos", label: "Ganhos", color: COLORS.ganhos },
              { key: "mediaMovelPerdidos", label: "Perdidos", color: COLORS.perdidos },
              { key: "mediaMovelEntregues", label: "Entregues", color: COLORS.funil.entregue },
            ].map(({ key, label, color }) => (
              <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Checkbox
                  checked={activeMovingAvgSeries[key]}
                  onCheckedChange={(checked) => setActiveMovingAvgSeries(prev => ({ ...prev, [key]: !!checked }))}
                />
                <span style={{ color }}>{label}</span>
              </label>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={movingAverageData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                {activeMovingAvgSeries.mediaMovelNovos && <Line type="monotone" dataKey="mediaMovelNovos" stroke={COLORS.novos} strokeWidth={2} dot={false} name="Média Novos (7d)" />}
                {activeMovingAvgSeries.mediaMovelGanhos && <Line type="monotone" dataKey="mediaMovelGanhos" stroke={COLORS.ganhos} strokeWidth={2} dot={false} name="Média Ganhos (7d)" />}
                {activeMovingAvgSeries.mediaMovelPerdidos && <Line type="monotone" dataKey="mediaMovelPerdidos" stroke={COLORS.perdidos} strokeWidth={2} dot={false} name="Média Perdidos (7d)" />}
                {activeMovingAvgSeries.mediaMovelEntregues && <Line type="monotone" dataKey="mediaMovelEntregues" stroke={COLORS.funil.entregue} strokeWidth={2} dot={false} name="Média Entregues (7d)" />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Chart 3: Funnel with EUR labels */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🔽 Funil de Conversão — Status Atual</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={100} />
                <Tooltip formatter={(value: number, name: string, props: any) => {
                  const entry = props.payload;
                  return [`${value} leads • ${formatEur(entry.eur)}`, name];
                }} />
                <Bar dataKey="value" name="Leads" radius={[0, 4, 4, 0]} label={{
                  position: 'right',
                  fontSize: 11,
                  formatter: (_value: number, _name: string, props: any) => {
                    const entry = funnelData[props?.index];
                    if (!entry) return _value;
                    const k = entry.eur >= 1000 ? `${Math.round(entry.eur / 1000)}k€` : `${Math.round(entry.eur)}€`;
                    return `${_value}  ·  ${k}`;
                  }
                }}>
                  {funnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Chart 4: Weekly conversion rates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🎯 Taxa de Conversão Semanal — 12 Semanas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyConversionData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Line type="monotone" dataKey="aberto_ganho" stroke={COLORS.ganhos} strokeWidth={2} name="Aberto → Ganho" dot={{ r: 3 }} />
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Action suggestions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">💡 Sugestões de Ação para Hoje</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Payment pending */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Cobrar Pagamento ({paymentPending.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {paymentPending.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum pagamento pendente 🎉</p>
              ) : (
                <>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {paymentPending.map(l => (
                      <button
                        key={l.id}
                        onClick={() => openOpportunity(l.id)}
                        className="w-full text-left p-2 rounded border hover:bg-muted/50 transition-colors"
                      >
                        <div className="text-sm font-medium truncate">{l.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Pago: {formatCurrency(l.valor_pago, l.moeda)} / {formatCurrency(l.valor, l.moeda)}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 pt-2 border-t text-xs font-medium text-muted-foreground">
                    Total a receber: {formatEur(paymentPending.reduce((s, l) => s + toEur((l.valor ?? 0) - (l.valor_pago ?? 0), l.moeda), 0))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Top negotiation */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4" /> Top 5 Negociação
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topNegociacao.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum lead em negociação com probabilidade</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {topNegociacao.map(l => (
                      <button
                        key={l.id}
                        onClick={() => openOpportunity(l.id)}
                        className="w-full text-left p-2 rounded border hover:bg-muted/50 transition-colors"
                      >
                        <div className="text-sm font-medium truncate flex items-center gap-1">
                          {l.name}
                           {(l.ai_diagnosis_reason || l.ai_next_step || l.ai_diagnosis) && (
                             <TooltipProvider>
                               <ShadTooltip>
                                 <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                   <Info className="h-3 w-3 text-muted-foreground shrink-0" />
                                 </TooltipTrigger>
                                 <TooltipContent side="top" align="start" className="w-[min(92vw,28rem)] p-3 whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto">
                                   <div className="space-y-2">
                                     <p className="font-semibold text-sm text-foreground">Diagnóstico IA - {l.ai_close_probability ?? 0}% chance</p>
                                     {l.ai_next_step && <div><p className="text-xs font-medium text-primary">📌 Próximo Passo:</p><p className="text-xs text-foreground">{l.ai_next_step}</p></div>}
                                     {l.ai_diagnosis && <div><p className="text-xs font-medium text-muted-foreground">📊 Diagnóstico:</p><p className="text-xs text-foreground">{l.ai_diagnosis}</p></div>}
                                     {l.ai_diagnosis_reason && <div><p className="text-xs font-medium text-muted-foreground">💡 Justificativa:</p><p className="text-xs text-foreground">{l.ai_diagnosis_reason}</p></div>}
                                   </div>
                                 </TooltipContent>
                               </ShadTooltip>
                             </TooltipProvider>
                           )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <TooltipProvider>
                            <ShadTooltip>
                              <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Badge variant="outline" className="text-xs cursor-help">{l.ai_close_probability}%</Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top" align="start" className="w-[min(92vw,28rem)] p-3 whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto">
                                <div className="space-y-2">
                                  <p className="font-semibold text-sm text-foreground">Diagnóstico IA - {l.ai_close_probability ?? 0}% chance</p>
                                  {l.ai_next_step && <div><p className="text-xs font-medium text-primary">📌 Próximo Passo:</p><p className="text-xs text-foreground">{l.ai_next_step}</p></div>}
                                  {l.ai_diagnosis && <div><p className="text-xs font-medium text-muted-foreground">📊 Diagnóstico:</p><p className="text-xs text-foreground">{l.ai_diagnosis}</p></div>}
                                  {l.ai_diagnosis_reason && <div><p className="text-xs font-medium text-muted-foreground">💡 Justificativa:</p><p className="text-xs text-foreground">{l.ai_diagnosis_reason}</p></div>}
                                  {!l.ai_next_step && !l.ai_diagnosis && !l.ai_diagnosis_reason && <p className="text-xs text-muted-foreground">Sem diagnóstico disponível</p>}
                                </div>
                              </TooltipContent>
                            </ShadTooltip>
                          </TooltipProvider>
                          {l.valor && <span>{formatCurrency(l.valor, l.moeda)}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 pt-2 border-t text-xs font-medium text-muted-foreground">
                    Total Top 5: {formatEur(topNegociacao.reduce((s, l) => s + toEur(l.valor, l.moeda), 0))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Top open */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Eye className="h-4 w-4" /> Top 5 Em Aberto
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topNovo.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum lead em aberto com probabilidade</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {topNovo.map(l => (
                      <button
                        key={l.id}
                        onClick={() => openOpportunity(l.id)}
                        className="w-full text-left p-2 rounded border hover:bg-muted/50 transition-colors"
                      >
                        <div className="text-sm font-medium truncate flex items-center gap-1">
                          {l.name}
                           {(l.ai_diagnosis_reason || l.ai_next_step || l.ai_diagnosis) && (
                             <TooltipProvider>
                               <ShadTooltip>
                                 <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                   <Info className="h-3 w-3 text-muted-foreground shrink-0" />
                                 </TooltipTrigger>
                                 <TooltipContent side="top" align="start" className="w-[min(92vw,28rem)] p-3 whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto">
                                   <div className="space-y-2">
                                     <p className="font-semibold text-sm text-foreground">Diagnóstico IA - {l.ai_close_probability ?? 0}% chance</p>
                                     {l.ai_next_step && <div><p className="text-xs font-medium text-primary">📌 Próximo Passo:</p><p className="text-xs text-foreground">{l.ai_next_step}</p></div>}
                                     {l.ai_diagnosis && <div><p className="text-xs font-medium text-muted-foreground">📊 Diagnóstico:</p><p className="text-xs text-foreground">{l.ai_diagnosis}</p></div>}
                                     {l.ai_diagnosis_reason && <div><p className="text-xs font-medium text-muted-foreground">💡 Justificativa:</p><p className="text-xs text-foreground">{l.ai_diagnosis_reason}</p></div>}
                                   </div>
                                 </TooltipContent>
                               </ShadTooltip>
                             </TooltipProvider>
                           )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <TooltipProvider>
                            <ShadTooltip>
                              <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Badge variant="outline" className="text-xs cursor-help">{l.ai_close_probability}%</Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top" align="start" className="w-[min(92vw,28rem)] p-3 whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto">
                                <div className="space-y-2">
                                  <p className="font-semibold text-sm text-foreground">Diagnóstico IA - {l.ai_close_probability ?? 0}% chance</p>
                                  {l.ai_next_step && <div><p className="text-xs font-medium text-primary">📌 Próximo Passo:</p><p className="text-xs text-foreground">{l.ai_next_step}</p></div>}
                                  {l.ai_diagnosis && <div><p className="text-xs font-medium text-muted-foreground">📊 Diagnóstico:</p><p className="text-xs text-foreground">{l.ai_diagnosis}</p></div>}
                                  {l.ai_diagnosis_reason && <div><p className="text-xs font-medium text-muted-foreground">💡 Justificativa:</p><p className="text-xs text-foreground">{l.ai_diagnosis_reason}</p></div>}
                                  {!l.ai_next_step && !l.ai_diagnosis && !l.ai_diagnosis_reason && <p className="text-xs text-muted-foreground">Sem diagnóstico disponível</p>}
                                </div>
                              </TooltipContent>
                            </ShadTooltip>
                          </TooltipProvider>
                          {l.valor && <span>{formatCurrency(l.valor, l.moeda)}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 pt-2 border-t text-xs font-medium text-muted-foreground">
                    Total Top 5: {formatEur(topNovo.reduce((s, l) => s + toEur(l.valor, l.moeda), 0))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
