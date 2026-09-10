import { supabase } from "@/integrations/supabase/client";

/**
 * Reatribui todos os registros filhos (mensagens, notas, atividades, reuniões,
 * follow-ups, ações de worker, entregas, anexos) dos leads de origem para o
 * lead primário ANTES de deletar os leads de origem.
 *
 * Deve ser chamado em qualquer fluxo de merge para garantir histórico completo.
 */
export async function migrateLeadChildren(
  primaryLeadId: string,
  otherLeadIds: string[],
  phonesArray: string[] = []
): Promise<void> {
  if (otherLeadIds.length === 0 && phonesArray.length === 0) return;

  // Tabelas com coluna lead_id que devem ser reatribuídas
  const tables = [
    "whatsapp_messages",
    "email_messages",
    "lead_notes",
    "activity_log",
    "meetings",
    "worker_actions",
    "delivery_logs",
    "email_attachments",
  ] as const;

  if (otherLeadIds.length > 0) {
    for (const table of tables) {
      const { error } = await supabase
        .from(table as any)
        .update({ lead_id: primaryLeadId } as any)
        .in("lead_id", otherLeadIds);
      if (error) {
        console.error(`Erro ao migrar ${table}:`, error);
        throw new Error(`Erro ao migrar ${table}: ${error.message}`);
      }
    }

    // scheduled_followups tem UNIQUE(lead_id) — não dá pra reatribuir direto.
    // Estratégia: se o primário já tem row, apagar as dos secundários.
    // Se o primário NÃO tem row, mover UMA das secundárias (a mais recente) e apagar o resto.
    const { data: primaryFu } = await supabase
      .from("scheduled_followups")
      .select("id")
      .eq("lead_id", primaryLeadId)
      .maybeSingle();

    if (primaryFu) {
      const { error: delErr } = await supabase
        .from("scheduled_followups")
        .delete()
        .in("lead_id", otherLeadIds);
      if (delErr) throw new Error(`Erro ao limpar follow-ups: ${delErr.message}`);
    } else {
      const { data: others } = await supabase
        .from("scheduled_followups")
        .select("id, next_run_at")
        .in("lead_id", otherLeadIds)
        .order("next_run_at", { ascending: false });
      if (others && others.length > 0) {
        const keepId = others[0].id;
        const dropIds = others.slice(1).map(o => o.id);
        if (dropIds.length > 0) {
          await supabase.from("scheduled_followups").delete().in("id", dropIds);
        }
        const { error: mvErr } = await supabase
          .from("scheduled_followups")
          .update({ lead_id: primaryLeadId })
          .eq("id", keepId);
        if (mvErr) throw new Error(`Erro ao mover follow-up: ${mvErr.message}`);
      }
    }
  }

  // Cobre WhatsApp antigos sem lead_id mas com telefone conhecido
  if (phonesArray.length > 0) {
    const { error } = await supabase
      .from("whatsapp_messages")
      .update({ lead_id: primaryLeadId })
      .in("phone", phonesArray);
    if (error) {
      console.error("Erro ao migrar WhatsApp por telefone:", error);
      throw new Error("Erro ao migrar mensagens de WhatsApp por telefone");
    }
  }
}
