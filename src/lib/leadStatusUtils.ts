export type LeadStatus = 'novo' | 'em_atendimento' | 'em_negociacao' | 'matriculado' | 'nao_convertido' | 'resolvido';

export function buildStatusUpdateData(
  newStatus: LeadStatus,
  currentLead: { 
    negociacao_at?: string | null;
    status?: string | null;
  }
): Record<string, any> {
  const updateData: Record<string, any> = { status: newStatus };
  const now = new Date().toISOString();

  // Detectar reabertura: lead estava não convertido e está voltando a um estado ativo.
  if (newStatus !== 'nao_convertido' && currentLead.status === 'nao_convertido') {
    updateData.reopened_at = now;
  }

  // Apenas SETAR timestamps - NUNCA limpar

  // em_negociacao: só seta se ainda não tem (primeira vez que entrou em negociação)
  if (newStatus === 'em_negociacao' && !currentLead.negociacao_at) {
    updateData.negociacao_at = now;
  }

  // Para os outros status: SEMPRE seta quando entra
  if (newStatus === 'matriculado') {
    updateData.matriculado_at = now;
  }

  if (newStatus === 'nao_convertido') {
    updateData.nao_convertido_at = now;
  }

  if (newStatus === 'resolvido') {
    updateData.resolvido_at = now;
  }

  // Não limpa NADA - apenas retorna os campos a setar
  return updateData;
}
