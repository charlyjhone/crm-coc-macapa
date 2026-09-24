import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import type { Atendimento } from "@/hooks/useAtendimentos";

type Message = { id: string; direction: string; message: string | null; created_at: string };
export function AttendanceConversation({ contact, onClose }: { contact: Atendimento; onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const client = useQueryClient();
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["attendance-conversation", contact.id, contact.phone], refetchInterval: 10000,
    queryFn: async (): Promise<Message[]> => {
      const query = contact.phone
        ? supabase.from("whatsapp_messages").select("id,direction,message,created_at").eq("phone", contact.phone)
        : supabase.from("email_messages").select("id,direction,message,created_at").eq("lead_id", contact.id);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data || []).reverse();
    },
  });
  const send = async () => {
    if (!draft.trim() || sending || !contact.phone) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-message", {
        body: { phone: contact.phone, message: draft.trim(), leadId: contact.id, senderType: "human" },
      });
      if (error || data?.success !== true) throw new Error("send_failed");
      setDraft("");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["attendance-conversation", contact.id] }),
        client.invalidateQueries({ queryKey: ["atendimentos"] }),
      ]);
      toast({ title: "Mensagem enviada pela Secretaria" });
    } catch {
      toast({ title: "Não foi possível confirmar o envio", description: "Verifique o WhatsApp antes de tentar novamente.", variant: "destructive" });
    } finally { setSending(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !sending) onClose(); }}>
    <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
      <DialogHeader><DialogTitle>{contact.name}</DialogTitle><DialogDescription>{contact.phone ? "Histórico do WhatsApp. Ao responder, você assume a conversa e a Ana pausa por quatro horas." : "Histórico de e-mail. Para responder, use a Inbox."}</DialogDescription></DialogHeader>
      <div className="min-h-24 flex-1 space-y-3 overflow-y-auto" aria-live="polite">
        {isLoading && <p>Carregando conversa...</p>}
        {isError && <p role="alert">Não foi possível carregar o histórico.</p>}
        {!isLoading && !isError && !data.length && <p>Nenhuma mensagem registrada.</p>}
        {data.map((m) => <div key={m.id} className={`max-w-[90%] rounded-lg p-3 ${m.direction === "outbound" ? "ml-auto bg-emerald-50" : "bg-muted"}`}>
          <p className="whitespace-pre-wrap break-words text-sm">{m.message || "Mensagem sem texto"}</p>
          <small className="text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR")}</small>
        </div>)}
      </div>
      {contact.phone && <div className="space-y-2 border-t pt-3">
        <Textarea aria-label="Resposta da Secretaria" placeholder="Digite a resposta da Secretaria" value={draft} disabled={sending} onChange={e => setDraft(e.target.value)} />
        <Button onClick={send} disabled={sending || !draft.trim() || isError}>{sending ? "Enviando..." : "Enviar pelo WhatsApp"}</Button>
      </div>}
    </DialogContent>
  </Dialog>;
}
