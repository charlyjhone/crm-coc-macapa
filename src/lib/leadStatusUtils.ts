export type LeadStatus = 'em_aberto' | 'em_negociacao' | 'ganho' | 'perdido' | 'produzido' | 'entregue';

export function buildStatusUpdateData(
  newStatus: LeadStatus,
  currentLead: { 
    negociacao_at?: string | null;
    status?: string | null;
  }
): Record<string, any> {
  const updateData: Record<string, any> = { status: newStatus };
  const now = new Date().toISOString();

  // Detectar reabertura: lead estava perdido e está voltando para em_aberto
  if (newStatus === 'em_aberto' && currentLead.status === 'perdido') {
    updateData.reopened_at = now;
  }

  // Apenas SETAR timestamps - NUNCA limpar
  
  // em_negociacao: só seta se ainda não tem (primeira vez que entrou em negociação)
  if (newStatus === 'em_negociacao' && !currentLead.negociacao_at) {
    updateData.negociacao_at = now;
  }
  
  // Para os outros status: SEMPRE seta quando entra
  if (newStatus === 'ganho') {
    updateData.ganho_at = now;
  }
  
  if (newStatus === 'perdido') {
    updateData.perdido_at = now;
  }
  
  if (newStatus === 'produzido') {
    updateData.produzido_at = now;
  }
  
  if (newStatus === 'entregue') {
    updateData.delivered_at = now;
  }

  // Não limpa NADA - apenas retorna os campos a setar
  return updateData;
}
