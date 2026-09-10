import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ChevronDown, Users, FileText, ExternalLink } from "lucide-react";
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

interface MeetingsSectionProps {
  leadId: string;
}

export default function MeetingsSection({ leadId }: MeetingsSectionProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTranscriptId, setOpenTranscriptId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .eq("lead_id", leadId)
        .order("meeting_date", { ascending: false });
      if (!active) return;
      if (error) {
        toast({ title: "Erro ao carregar reuniões", description: error.message, variant: "destructive" });
      } else {
        setMeetings((data as unknown as Meeting[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [leadId, toast]);

  if (loading) {
    return (
      <Card className="mb-4">
        <CardContent className="p-4">
          <Skeleton className="h-6 w-32 mb-3" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (meetings.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4" />
          Reuniões ({meetings.length})
        </h3>
        <div className="space-y-2">
          {meetings.map((m) => {
            const date = m.meeting_date ? new Date(m.meeting_date) : null;
            const transcriptOpen = openTranscriptId === m.id;
            const participants = (m.participants ?? []).filter((p) => p.email || p.name);

            return (
              <details
                key={m.id}
                className="group bg-muted/50 hover:bg-muted/70 transition-colors rounded-md overflow-hidden"
              >
                <summary className="flex items-center gap-3 px-3 py-2 cursor-pointer list-none">
                  <Calendar className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-sm text-foreground truncate flex-1 font-medium">
                    {m.title || "Reunião sem título"}
                  </span>
                  {date && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(date, "dd MMM yyyy", { locale: ptBR })}
                    </span>
                  )}
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 flex-shrink-0" />
                </summary>

                <div className="px-3 pb-3 pt-1 border-t border-border/50 space-y-3">
                  {date && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-2">
                      <Calendar className="h-3 w-3" />
                      {format(date, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                      {m.external_url && (
                        <a
                          href={m.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Granola <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </p>
                  )}

                  {participants.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Users className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex flex-wrap gap-1">
                        {participants.map((p, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] font-normal">
                            {p.name || p.email}
                            {p.is_organizer && " (organizador)"}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {m.summary ? (
                    <div className="text-sm whitespace-pre-wrap text-foreground/90">
                      {m.summary}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Sem resumo disponível.</p>
                  )}

                  {m.transcript && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setOpenTranscriptId(transcriptOpen ? null : m.id)}
                        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                      >
                        <FileText className="h-3 w-3" />
                        {transcriptOpen ? "Ocultar transcrição" : "Ver transcrição completa"}
                        <span className="text-muted-foreground font-normal">
                          ({m.transcript.length.toLocaleString("pt-BR")} caracteres)
                        </span>
                      </button>
                      {transcriptOpen && (
                        <div className="mt-2 text-xs whitespace-pre-wrap text-foreground/80 bg-background/60 rounded p-3 max-h-96 overflow-y-auto border border-border/50">
                          {m.transcript}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
