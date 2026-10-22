// Helper para edge functions setarem o contexto de quem está fazendo a ação,
// para que os triggers da activity_log gravem source e actor corretamente.
//
// Uso:
//   await setActivityContext(supabase, { source: 'edge_function:send-email', actor: 'susan' });
//   await supabase.from('leads').update({ ... }).eq('id', leadId);
//
// IMPORTANTE: O Supabase JS reusa a mesma conexão na sessão. set_config com is_local=false
// deixa o setting válido para a sessão inteira (até o próximo reset).
export async function setActivityContext(
  supabase: any,
  ctx: { source: string; actor?: string }
): Promise<void> {
  try {
    // Tentar usar RPC. Como não queremos criar uma função extra, executamos via
    // múltiplos selects de set_config — um para source e outro para actor.
    await supabase.rpc('set_activity_context', {
      p_source: ctx.source,
      p_actor: ctx.actor ?? 'system',
    });
  } catch (err) {
    // Se a RPC não existir ainda, falha silenciosa — triggers usam defaults.
    console.warn('[activity-context] failed to set context:', err);
  }
}
