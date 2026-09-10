import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAtendimentos, useUpdateTriage, horasEsperando, type Atendimento, type TriageStatus } from "@/hooks/useAtendimentos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { GraduationCap, Loader2, Mail, MessageCircle, Clock, CheckCircle2 } from "lucide-react";

const STATUS_LABEL: Record<TriageStatus, string> = {
  novo: "Novo",
  respondido_agente: "Respondido pelo agente",
  aguardando_secretaria: "Aguardando secretaria",
  resolvido: "Resolvido",
};

const ASSUNTO_LABEL: Record<string, string> = {
  matricula: "Matrícula",
  curriculo: "Currículo",
  horario: "Horário",
  localizacao: "Localização",
  outros: "Outros assuntos",
};

type Tab = "aguardando_secretaria" | "matricula" | "respondido_agente" | "resolvido" | "todos";

const TABS: { key: Tab; label: string }[] = [
  { key: "aguardando_secretaria", label: "Aguardando secretaria" },
  { key: "matricula", label: "Matrículas" },
  { key: "respondido_agente", label: "Respondidos pelo agente" },
  { key: "resolvido", label: "Resolvidos" },
  { key: "todos", label: "Todos" },
];

function tempo(a: Atendimento) {
  const h = horasEsperando(a);
  if (h === null) return null;
  if (h < 1) return "há poucos minutos";
  if (h < 24) return `há ${Math.floor(h)}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function Row({ a }: { a: Atendimento }) {
  const update = useUpdateTriage();
  const espera = tempo(a);
  const atrasado = (horasEsperando(a) ?? 0) >= 24 && a.triage_status === "aguardando_secretaria";

  return (
    <div className="flex items-start gap-3 border-b px-4 py-3 hover:bg-muted/40">
      <div className="mt-1">
        {a.phone ? <MessageCircle className="h-4 w-4 text-muted-foreground" /> : <Mail className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/opportunity/${a.id}`} className="font-medium hover:underline">
            {a.name}
          </Link>
          {a.assunto && <Badge variant="secondary">{ASSUNTO_LABEL[a.assunto] || a.assunto}</Badge>}
          <Badge variant={a.triage_status === "aguardando_secretaria" ? "destructive" : "outline"}>
            {STATUS_LABEL[a.triage_status] || a.triage_status}
          </Badge>
          {a.interesse && a.interesse !== "indefinido" && (
            <Badge variant="outline">Interesse {a.interesse}</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
          {a.triage_summary || a.last_inbound_message || "Sem mensagem registrada"}
        </p>
        {a.handoff_reason && a.triage_status === "aguardando_secretaria" && (
          <p className="mt-1 text-xs text-destructive">Motivo do repasse: {a.handoff_reason}</p>
        )}
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          {espera && (
            <span className={`flex items-center gap-1 ${atrasado ? "text-destructive font-medium" : ""}`}>
              <Clock className="h-3 w-3" /> Esperando {espera}
            </span>
          )}
          {!espera && a.agent_replied_at && <span>Agente já respondeu</span>}
          {a.phone && <span>{a.phone}</span>}
          {a.email && <span className="truncate">{a.email}</span>}
        </div>
      </div>
      {a.triage_status !== "resolvido" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => update.mutate({ id: a.id, status: "resolvido" })}
          disabled={update.isPending}
        >
          <CheckCircle2 className="h-4 w-4 mr-1" /> Concluir
        </Button>
      )}
    </div>
  );
}

export default function Atendimentos() {
  const { data, isLoading, isError } = useAtendimentos();
  const [tab, setTab] = useState<Tab>("aguardando_secretaria");

  const counts = useMemo(() => {
    const d = data || [];
    return {
      aguardando_secretaria: d.filter((a) => a.triage_status === "aguardando_secretaria").length,
      matricula: d.filter((a) => a.assunto === "matricula").length,
      respondido_agente: d.filter((a) => a.triage_status === "respondido_agente").length,
      resolvido: d.filter((a) => a.triage_status === "resolvido").length,
      todos: d.length,
    } as Record<Tab, number>;
  }, [data]);

  const list = useMemo(() => {
    const d = data || [];
    if (tab === "todos") return d;
    if (tab === "matricula") return d.filter((a) => a.assunto === "matricula");
    return d.filter((a) => a.triage_status === tab);
  }, [data, tab]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <SidebarTrigger />
        <GraduationCap className="h-4 w-4 text-primary" />
        <h1 className="font-semibold">Atendimentos da escola</h1>
        <span className="text-sm text-muted-foreground">({counts.todos})</span>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
        {TABS.map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? "default" : "outline"} onClick={() => setTab(t.key)}>
            {t.label} ({counts[t.key] || 0})
          </Button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center p-12 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
          </div>
        )}
        {isError && <div className="p-12 text-center text-destructive">Erro ao carregar atendimentos.</div>}
        {!isLoading && !isError && list.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">Nenhum atendimento nesta lista.</div>
        )}
        {list.map((a) => (
          <Row key={a.id} a={a} />
        ))}
      </div>
    </div>
  );
}
