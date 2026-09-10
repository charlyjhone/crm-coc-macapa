// Lista de e-mails agrupada por THREAD (conversa), compartilhada entre
// Opportunities e OpportunityDetail.
//
// - Agrupa por assunto normalizado (remove Re:/Fw:/Fwd:/Res:/Enc:/RES: etc.)
// - Threads ordenadas da mais recente para a mais antiga; mensagens dentro da
//   thread em ordem cronológica
// - Cada mensagem mostra SÓ o conteúdo novo (citações removidas por
//   formatEmailHtml); um botão "Ver histórico citado" mostra o e-mail cru
// - Mensagens antigas da thread ficam colapsadas numa linha; a última vem aberta

import { useMemo, useState, type ReactNode } from "react";
import DOMPurify from "dompurify";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Mail, Quote } from "lucide-react";
import { formatEmailHtml, plainTextToHtml } from "@/lib/emailUtils";

export interface ThreadEmailMessage {
  id: string;
  subject?: string | null;
  message: string | null;
  html_body?: string | null;
  direction: "inbound" | "outbound";
  timestamp: string;
  also_received_by?: string[] | null;
  recipients_to?: string[] | null;
  recipients_cc?: string[] | null;
  raw_data?: any;
}

interface EmailThreadListProps {
  messages: ThreadEmailMessage[];
  /** Conteúdo extra por mensagem (ex.: anexos). */
  renderExtras?: (msg: ThreadEmailMessage) => ReactNode;
  className?: string;
}

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ["p", "br", "b", "i", "em", "strong", "a", "ul", "ol", "li", "span", "div", "blockquote", "hr", "table", "tr", "td", "th", "tbody", "thead", "img"],
  ALLOWED_ATTR: ["href", "target", "rel", "class", "src", "alt", "width", "height"],
};

/** Remove prefixos de resposta/encaminhamento repetidos e normaliza. */
export function normalizeSubject(subject?: string | null): string {
  let s = (subject || "").trim();
  const prefix = /^(re|fw|fwd|res|enc|rv|aw|sv|antw|tr)\s*(\[\d+\])?\s*:\s*/i;
  while (prefix.test(s)) s = s.replace(prefix, "").trim();
  return s.toLowerCase();
}

const SOURCE_LABELS: Record<string, string> = {
  miguel_outlook: "Enviado pelo Miguel",
  susan_resend: "Enviado automaticamente pela Susan",
  sent: "Enviado pelo app",
  imported: "Importado",
};


function fromAddress(msg: ThreadEmailMessage): string | null {
  const f = msg.raw_data?.from;
  if (typeof f === "string" && f) return f;
  return null;
}

function bodyHtml(msg: ThreadEmailMessage, showQuoted: boolean): string {
  const raw = msg.html_body || (msg.message ? plainTextToHtml(msg.message) : "");
  if (!raw) return "";
  return DOMPurify.sanitize(formatEmailHtml(raw, !showQuoted), SANITIZE_CONFIG);
}

/** A mensagem tem histórico citado que foi removido? */
function hasQuotedHistory(msg: ThreadEmailMessage): boolean {
  const raw = msg.html_body || "";
  if (!raw) return false;
  const stripped = formatEmailHtml(raw, true);
  const full = formatEmailHtml(raw, false);
  return full.length > stripped.length + 80;
}

interface Thread {
  key: string;
  subject: string;
  messages: ThreadEmailMessage[]; // cronológico asc
  lastTs: number;
}

export function EmailThreadList({ messages, renderExtras, className }: EmailThreadListProps) {
  const threads = useMemo<Thread[]>(() => {
    const map = new Map<string, Thread>();
    for (const msg of messages) {
      const norm = normalizeSubject(msg.subject);
      // Sem assunto: agrupa tudo numa thread "(sem assunto)" por lead
      const key = norm || "(sem assunto)";
      let t = map.get(key);
      if (!t) {
        t = { key, subject: msg.subject?.trim() || "(sem assunto)", messages: [], lastTs: 0 };
        map.set(key, t);
      }
      t.messages.push(msg);
    }
    for (const t of map.values()) {
      t.messages.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
      t.lastTs = Date.parse(t.messages[t.messages.length - 1].timestamp) || 0;
      // Usa o assunto da PRIMEIRA mensagem (sem Re:) como título, se existir
      const first = t.messages.find((m) => m.subject && !/^re\s*:/i.test(m.subject.trim()));
      if (first?.subject) t.subject = first.subject.trim();
    }
    return [...map.values()].sort((a, b) => b.lastTs - a.lastTs);
  }, [messages]);

  // Thread mais recente aberta por padrão; escolhas do usuário têm precedência
  const [threadChoice, setThreadChoice] = useState<Record<string, boolean>>({});
  const [openMessages, setOpenMessages] = useState<Set<string>>(new Set());
  const [quotedShown, setQuotedShown] = useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  if (threads.length === 0) return null;

  return (
    <div className={`space-y-3 ${className || ""}`}>
      {threads.map((thread, ti) => {
        const isOpen = threadChoice[thread.key] ?? ti === 0;
        const last = thread.messages[thread.messages.length - 1];
        const inboundCount = thread.messages.filter((m) => m.direction === "inbound").length;
        return (
          <div key={thread.key} className="border rounded-lg overflow-hidden bg-card">
            {/* Cabeçalho da thread */}
            <button
              type="button"
              className="w-full flex items-center gap-2 p-3 text-left hover:bg-accent/50 transition-colors"
              onClick={() => setThreadChoice((prev) => ({ ...prev, [thread.key]: !isOpen }))}
            >
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm truncate flex-1 min-w-0">{thread.subject}</span>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {thread.messages.length} {thread.messages.length === 1 ? "mensagem" : "mensagens"}
                {inboundCount > 0 && ` · ${inboundCount} do cliente`}
              </Badge>
              <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                {formatDistanceToNow(new Date(last.timestamp), { addSuffix: true, locale: ptBR })}
              </span>
            </button>

            {/* Mensagens da thread */}
            {isOpen && (
              <div className="border-t divide-y">
                {thread.messages.map((msg, mi) => {
                  const isLast = mi === thread.messages.length - 1;
                  const expanded = isLast || openMessages.has(msg.id);
                  const showQuoted = quotedShown.has(msg.id);
                  const from = fromAddress(msg);
                  const to = (msg.recipients_to || []).join(", ");
                  return (
                    <div
                      key={msg.id}
                      className={`${msg.direction === "inbound" ? "bg-muted/60" : "bg-primary/5"}`}
                    >
                      {/* Linha-resumo (sempre visível; clique expande/colapsa) */}
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 text-left"
                        onClick={() => !isLast && toggle(openMessages, msg.id, setOpenMessages)}
                      >
                        <Badge
                          variant={msg.direction === "inbound" ? "default" : "secondary"}
                          className="shrink-0 text-[10px]"
                        >
                          {msg.direction === "inbound" ? "Recebido" : "Enviado"}
                        </Badge>
                        {msg.direction === "outbound" &&
                          Array.from(
                            new Set(
                              (msg.also_received_by || [])
                                .map((src) => SOURCE_LABELS[src])
                                .filter(Boolean)
                            )
                          ).map((label) => (
                            <Badge key={label} variant="outline" className="shrink-0 text-[10px] hidden sm:inline-flex">
                              {label}
                            </Badge>
                          ))}

                        {!expanded && (
                          <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                            {(msg.message || "").slice(0, 120) || "(sem prévia)"}
                          </span>
                        )}
                        {expanded && (from || to) && (
                          <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                            {from ? `de ${from}` : ""}{from && to ? " · " : ""}{to ? `para ${to}` : ""}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                          {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true, locale: ptBR })}
                        </span>
                      </button>

                      {/* Corpo */}
                      {expanded && (
                        <div className="px-3 pb-3">
                          {msg.html_body || msg.message ? (
                            <div
                              className="text-sm break-words prose prose-sm max-w-none [&>p]:mb-2 [&>br]:my-1"
                              dangerouslySetInnerHTML={{ __html: bodyHtml(msg, showQuoted) }}
                            />
                          ) : (
                            <p className="text-sm text-muted-foreground italic">Sem conteúdo</p>
                          )}
                          {hasQuotedHistory(msg) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 mt-1 text-xs text-muted-foreground"
                              onClick={() => toggle(quotedShown, msg.id, setQuotedShown)}
                            >
                              <Quote className="h-3 w-3 mr-1" />
                              {showQuoted ? "Ocultar histórico citado" : "Ver histórico citado"}
                            </Button>
                          )}
                          {renderExtras?.(msg)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
