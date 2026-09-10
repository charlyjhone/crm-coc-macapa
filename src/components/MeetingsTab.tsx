import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calendar, ExternalLink, ChevronDown, ChevronRight, Users, FileText, Loader2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface Participant {
  name?: string;
  email?: string;
  is_organizer?: boolean;
}

interface Meeting {
  id: string;
  external_id: string;
  source: string;
  title: string | null;
  meeting_date: string | null;
  participants: Participant[] | null;
  summary: string | null;
  transcript: string | null;
  external_url: string | null;
  created_at: string;
}

interface MeetingsTabProps {
  leadId: string;
}

export default function MeetingsTab({ leadId }: MeetingsTabProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, { summary: boolean; transcript: boolean }>>({});
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .eq("lead_id", leadId)
      .order("meeting_date", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar reuniões", description: error.message, variant: "destructive" });
    } else {
      setMeetings((data as unknown as Meeting[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [leadId]);

  const handleSyncRequest = () => {
    toast({
      title: "Sincronização manual",
      description:
        "Para puxar novas reuniões do Granola, peça no chat do Lovable: 'Sincroniza reuniões do Granola para este lead'. A integração via API direta do Granola não é estável (token expira); a sincronização é feita via MCP no chat.",
    });
  };

  const toggle = (id: string, key: "summary" | "transcript") => {
    setExpanded((prev) => ({
      ...prev,
      [id]: { ...prev[id], [key]: !prev[id]?.[key] },
    }));
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {meetings.length === 0
            ? "Nenhuma reunião associada ainda."
            : `${meetings.length} reuni${meetings.length === 1 ? "ão" : "ões"} do Granola`}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleSyncRequest} disabled={syncing}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5 mr-1.5" />}
            Sincronizar Granola
          </Button>
        </div>
      </div>

      {meetings.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Reuniões do Granola serão associadas automaticamente quando o email do participante coincidir com este lead.
        </div>
      )}

      {meetings.map((m) => {
        const exp = expanded[m.id] ?? { summary: true, transcript: false };
        const date = m.meeting_date ? new Date(m.meeting_date) : null;
        return (
          <div key={m.id} className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm leading-tight">{m.title || "Reunião sem título"}</h3>
                {date && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(date, "dd 'de' MMM yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="secondary" className="text-[10px]">{m.source}</Badge>
                {m.external_url && (
                  <Button asChild variant="ghost" size="sm" className="h-7 px-2">
                    <a href={m.external_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                )}
              </div>
            </div>

            {m.participants && m.participants.length > 0 && (
              <div className="flex items-start gap-2 text-xs">
                <Users className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex flex-wrap gap-1">
                  {m.participants.map((p, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] font-normal">
                      {p.name || p.email}
                      {p.is_organizer && " (organizador)"}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {m.summary && (
              <Collapsible open={exp.summary} onOpenChange={() => toggle(m.id, "summary")}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-1.5 text-xs font-medium hover:text-primary">
                    {exp.summary ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Sumário
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="text-sm whitespace-pre-wrap text-foreground/90 bg-muted/40 rounded p-3">{m.summary}</div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {m.transcript && (
              <Collapsible open={exp.transcript} onOpenChange={() => toggle(m.id, "transcript")}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-1.5 text-xs font-medium hover:text-primary">
                    {exp.transcript ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <FileText className="h-3 w-3" />
                    Transcrição completa ({m.transcript.length.toLocaleString("pt-BR")} caracteres)
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="text-xs whitespace-pre-wrap text-foreground/80 bg-muted/40 rounded p-3 max-h-96 overflow-y-auto">
                    {m.transcript}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        );
      })}
    </div>
  );
}
