import { useState, useMemo } from "react";
import { usePendingLeads, type PendingChannel } from "@/hooks/usePendingLeads";
import { PendingLeadRow } from "@/components/pendentes/PendingLeadRow";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BellDot, Loader2 } from "lucide-react";

type Filter = "all" | PendingChannel;

export default function Pendentes() {
  const { data, isLoading, isError } = usePendingLeads();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data;
    return data.filter((l) => l.pending_channels.includes(filter));
  }, [data, filter]);

  const counts = useMemo(() => {
    const all = data?.length || 0;
    const email = data?.filter((l) => l.pending_channels.includes("email")).length || 0;
    const whatsapp = data?.filter((l) => l.pending_channels.includes("whatsapp")).length || 0;
    return { all, email, whatsapp };
  }, [data]);

  return (
    <div className="flex flex-col h-screen">
      <header className="h-12 flex items-center gap-2 border-b px-3 shrink-0">
        <SidebarTrigger />
        <BellDot className="h-4 w-4 text-primary" />
        <h1 className="font-semibold">Pendentes de resposta</h1>
        <span className="text-sm text-muted-foreground">({counts.all})</span>
      </header>

      <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
        >
          Todos ({counts.all})
        </Button>
        <Button
          size="sm"
          variant={filter === "email" ? "default" : "outline"}
          onClick={() => setFilter("email")}
        >
          E-mail ({counts.email})
        </Button>
        <Button
          size="sm"
          variant={filter === "whatsapp" ? "default" : "outline"}
          onClick={() => setFilter("whatsapp")}
        >
          WhatsApp ({counts.whatsapp})
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center p-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        )}
        {isError && (
          <div className="p-12 text-center text-destructive">
            Erro ao carregar pendentes.
          </div>
        )}
        {!isLoading && !isError && filtered.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            🎉 Nenhuma mensagem aguardando resposta.
          </div>
        )}
        {filtered.map((lead) => (
          <PendingLeadRow key={lead.id} lead={lead} />
        ))}
      </div>
    </div>
  );
}
