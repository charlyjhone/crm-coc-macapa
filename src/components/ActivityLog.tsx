import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity, Mail, MessageSquare, FileText, Paperclip, Calendar,
  CheckCircle2, AlertCircle, DollarSign, Send, Wrench, Sparkles, RefreshCw
} from "lucide-react";

interface ActivityLogProps {
  leadId: string;
}

interface ActivityRow {
  id: string;
  activity_type: string;
  description: string;
  source: string;
  actor: string | null;
  metadata: any;
  created_at: string;
}

const ICONS: Record<string, any> = {
  status_change: RefreshCw,
  lead_created: Sparkles,
  lead_field_updated: Wrench,
  email_sent: Send,
  email_received: Mail,
  whatsapp_sent: Send,
  whatsapp_received: MessageSquare,
  meeting_added: Calendar,
  note_added: FileText,
  note_updated: FileText,
  note_deleted: FileText,
  attachment_added: Paperclip,
  worker_action: CheckCircle2,
  proposal_sent: Send,
  followup_sent: Send,
  diagnosis_created: Sparkles,
  payment_recorded: DollarSign,
  delivery_sent: Send,
};

const ACTOR_LABELS: Record<string, string> = {
  miguel: "Miguel",
  susan: "Susan (IA)",
  cliente: "Cliente",
  manus: "Manus (MCP)",
  system: "Sistema",
  tiffany: "Tiffany",
  sara: "Sara",
};

const SOURCE_LABELS: Record<string, string> = {
  frontend: "App",
  frontend_worker: "Worker",
  mcp: "MCP",
  webhook: "Webhook",
  trigger: "Auto",
  automation: "Automação",
};

function formatSource(source: string): string {
  if (source.startsWith("edge_function:")) return "Edge: " + source.split(":")[1];
  if (source.startsWith("webhook:")) return "Webhook: " + source.split(":")[1];
  if (source.startsWith("automation:")) return "Auto: " + source.split(":")[1];
  return SOURCE_LABELS[source] || source;
}

export function ActivityLog({ leadId }: ActivityLogProps) {
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("activity_log" as any)
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!cancelled) {
        if (!error && data) setItems(data as unknown as ActivityRow[]);
        setLoading(false);
      }
    }
    load();
    // realtime: novas atividades aparecem ao vivo
    const channel = supabase
      .channel(`activity_log_${leadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log", filter: `lead_id=eq.${leadId}` },
        (payload) => setItems((prev) => [payload.new as ActivityRow, ...prev])
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [leadId]);

  const visible = showAll ? items : items.slice(0, 15);

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center justify-between w-full text-left"
        >
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Log de Atividade
            {items.length > 0 && (
              <span className="text-xs text-muted-foreground font-normal">({items.length})</span>
            )}
          </h3>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expanded && (
          <div className="mt-3">
            {loading && <p className="text-xs text-muted-foreground">Carregando…</p>}

            {!loading && items.length === 0 && (
              <p className="text-xs text-muted-foreground">Sem atividades registradas ainda.</p>
            )}

            {!loading && items.length > 0 && (
              <div className="space-y-2">
                {visible.map((it) => {
                  const Icon = ICONS[it.activity_type] || AlertCircle;
                  const actorLabel = it.actor ? (ACTOR_LABELS[it.actor] || it.actor) : null;
                  return (
                    <div
                      key={it.id}
                      className="flex items-start gap-3 py-2 border-b border-border/40 last:border-0"
                    >
                      <div className="mt-0.5 text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground leading-snug break-words">
                          {it.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(it.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </span>
                          {actorLabel && (
                            <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
                              {actorLabel}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
                            {formatSource(it.source)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {items.length > 15 && (
                  <button
                    onClick={() => setShowAll((s) => !s)}
                    className="text-xs text-primary hover:underline mt-2"
                  >
                    {showAll ? "Mostrar menos" : `Mostrar mais ${items.length - 15} atividades`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
