import { Link } from "react-router-dom";
import { Mail, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { PendingLead } from "@/hooks/usePendingLeads";

const statusLabels: Record<string, string> = {
  em_aberto: "Em Aberto",
  em_negociacao: "Negociação",
  ganho: "Ganho",
  produzido: "Produzido",
  entregue: "Entregue",
  perdido: "Perdido",
};

function formatRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  const mo = Math.floor(d / 30);
  return `há ${mo} mês${mo > 1 ? "es" : ""}`;
}

function formatMoney(valor: number | null, moeda: string | null) {
  if (!valor) return null;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: moeda || "BRL",
      maximumFractionDigits: 0,
    }).format(Number(valor));
  } catch {
    return `${valor} ${moeda || ""}`.trim();
  }
}

export function PendingLeadRow({ lead }: { lead: PendingLead }) {
  const initials = (lead.name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const valor = formatMoney(lead.valor, lead.moeda);
  const isOld = Date.now() - new Date(lead.last_inbound_at).getTime() > 24 * 3600 * 1000;

  return (
    <Link
      to={`/opportunity/${lead.id}`}
      className="block border-b border-border hover:bg-muted/40 transition-colors"
    >
      <div className="flex items-start gap-3 p-4">
        <Avatar className="h-10 w-10 shrink-0">
          {lead.profile_picture_url && (
            <AvatarImage src={lead.profile_picture_url} alt={lead.name} />
          )}
          <AvatarFallback>{initials || "?"}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground truncate">{lead.name}</span>
            {lead.pending_channels.includes("email") && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Mail className="h-3 w-3" /> E-mail
              </Badge>
            )}
            {lead.pending_channels.includes("whatsapp") && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <MessageCircle className="h-3 w-3" /> WhatsApp
              </Badge>
            )}
            <span
              className={`text-xs ${
                isOld ? "text-destructive font-medium" : "text-muted-foreground"
              }`}
            >
              {formatRelative(lead.last_inbound_at)}
            </span>
          </div>
          {lead.last_inbound_preview && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              "{lead.last_inbound_preview}"
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
            {lead.status && (
              <Badge variant="outline" className="text-xs">
                {statusLabels[lead.status] || lead.status}
              </Badge>
            )}
            {lead.produto && <span>· {lead.produto}</span>}
            {valor && <span>· {valor}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
