import { useMemo, useState } from "react";
import { useAtendimentos, useEnviarWhatsApp, useMensagensAtendimento, useUpdateTriage, type Atendimento } from "@/hooks/useAtendimentos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";

type Filter = "aguardando_secretaria" | "matricula" | "respondido_agente" | "resolvido" | "todos";
const filters: { key: Filter; label: string }[] = [
  { key: "aguardando_secretaria", label: "Aguardando secretaria" },
  { key: "matricula", label: "Matrículas" },
  { key: "respondido_agente", label: "Respondidos pela Ana" },
  { key: "resolvido", label: "Resolvidos" },
  { key: "todos", label: "Todos" },
];

function Conversation({ lead }: { lead: Atendimento }) {
  const { data: messages, isLoading, isError } = useMensagensAtendimento(lead);
  const send = useEnviarWhatsApp();
  const update = useUpdateTriage();
  const [draft, setDraft] = useState("");

  const sendMessage = async () => {
    const message = draft.trim();
    if (!lead.phone || !message || send.isPending) return;
    try {
      await send.mutateAsync({ lead, message });
      setDraft("");
      toast.success("Mensagem enviada pelo WhatsApp");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao enviar a mensagem.");
    }
  };

  const finish = async () => {
    try {
      await update.mutateAsync({ id: lead.id, status: "resolvido" });
      toast.success("Atendimento concluído");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir o atendimento.");
    }
  };

  return (
    <section className="flex min-h-[500px] min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="font-semibold">{lead.name}</h2>
          <p className="text-xs text-slate-600">{lead.phone || lead.email || "Sem telefone ou e-mail"}</p>
          {lead.handoff_reason && lead.triage_status === "aguardando_secretaria" && (
            <p className="mt-1 text-xs text-red-700">Repasse: {lead.handoff_reason}</p>
          )}
        </div>
        {lead.triage_status !== "resolvido" && (
          <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => void finish()}>
            Concluir atendimento
          </Button>
        )}
      </header>
      <div className="flex max-h-[60vh] min-h-64 flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 p-4">
        {isLoading && <p className="text-sm text-slate-600">Carregando histórico...</p>}
        {isError && <p className="text-sm text-red-700">Não foi possível carregar o histórico.</p>}
        {!isLoading && !isError && !messages?.length && <p className="text-sm text-slate-600">Nenhuma mensagem encontrada.</p>}
        {messages?.map((m) => (
          <div key={`${m.channel}-${m.id}`} className={`max-w-[85%] rounded-xl border px-3 py-2 text-sm ${m.direction === "outbound" ? "self-end bg-emerald-100" : "self-start bg-white"}`}>
            <p className="whitespace-pre-wrap break-words">{m.message || "(mensagem sem texto)"}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              {m.channel === "whatsapp" ? "WhatsApp" : "E-mail"} · {new Date(m.at).toLocaleString("pt-BR")}
            </p>
          </div>
        ))}
      </div>
      <div className="border-t p-4">
        {lead.phone ? (
          <div className="flex gap-2">
            <Input aria-label="Mensagem de WhatsApp" placeholder="Escreva uma resposta para a família" value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void sendMessage(); } }}
              disabled={send.isPending} />
            <Button onClick={() => void sendMessage()} disabled={!draft.trim() || send.isPending}>
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="ml-2">Enviar</span>
            </Button>
          </div>
        ) : <p className="text-sm text-slate-600">Sem WhatsApp cadastrado. O envio por e-mail será integrado depois.</p>}
      </div>
    </section>
  );
}

export default function Atendimentos() {
  const { data, isLoading, isError } = useAtendimentos();
  const [filter, setFilter] = useState<Filter>("aguardando_secretaria");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const leads = data || [];
  const counts = useMemo(() => ({
    aguardando_secretaria: leads.filter((a) => a.triage_status === "aguardando_secretaria").length,
    matricula: leads.filter((a) => a.assunto === "matricula").length,
    respondido_agente: leads.filter((a) => a.triage_status === "respondido_agente").length,
    resolvido: leads.filter((a) => a.triage_status === "resolvido").length,
    todos: leads.length,
  }), [data]);
  const list = leads.filter((lead) => {
    const matchesFilter = filter === "todos" || (filter === "matricula" ? lead.assunto === "matricula" : lead.triage_status === filter);
    const term = search.toLocaleLowerCase("pt-BR");
    return matchesFilter && (!term || [lead.name, lead.phone, lead.email].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)));
  });
  const selected = list.find((lead) => lead.id === selectedId) || null;

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-6 md:px-7">
      <h1 className="text-2xl font-bold">Atendimentos da escola</h1>
      <p className="mt-1 text-sm text-slate-600">Acompanhe os repasses da Ana e responda às famílias pelo WhatsApp.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {filters.map((item) => (
          <Button key={item.key} size="sm" variant={filter === item.key ? "default" : "outline"}
            onClick={() => { setFilter(item.key); setSelectedId(null); }}>
            {item.label} ({counts[item.key]})
          </Button>
        ))}
      </div>
      <div className="mt-4 grid overflow-hidden rounded-xl border bg-white md:grid-cols-[minmax(280px,360px)_1fr]">
        <div className="border-b md:border-b-0 md:border-r">
          <div className="border-b p-3">
            <Input aria-label="Buscar atendimento" placeholder="Buscar nome, telefone ou e-mail"
              value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {isLoading && <p className="p-4 text-sm text-slate-600">Carregando atendimentos...</p>}
            {isError && <p className="p-4 text-sm text-red-700">Erro ao carregar atendimentos.</p>}
            {!isLoading && !isError && !list.length && <p className="p-4 text-sm text-slate-600">Nenhum atendimento nesta lista.</p>}
            {list.map((lead) => (
              <button key={lead.id} type="button" onClick={() => setSelectedId(lead.id)}
                className={`w-full border-b px-4 py-3 text-left hover:bg-emerald-50 ${lead.id === selectedId ? "bg-emerald-50" : ""}`}>
                <span className="block truncate font-medium">{lead.name}</span>
                <span className="block text-xs text-slate-600">{lead.phone || lead.email}</span>
                <span className="mt-1 block line-clamp-2 text-sm text-slate-600">{lead.triage_summary || lead.last_inbound_message || "Sem resumo"}</span>
              </button>
            ))}
          </div>
        </div>
        {selected ? <Conversation key={selected.id} lead={selected} /> : (
          <div className="flex min-h-[400px] items-center justify-center p-8 text-center text-sm text-slate-600">
            Selecione um atendimento para ler o histórico e responder.
          </div>
        )}
      </div>
    </div>
  );
}
