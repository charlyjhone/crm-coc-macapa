-- School-specific CRM fields. Additive migration: existing lead data is preserved.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS responsavel_nome text,
  ADD COLUMN IF NOT EXISTS aluno_nome text,
  ADD COLUMN IF NOT EXISTS serie_interesse text,
  ADD COLUMN IF NOT EXISTS turno_interesse text,
  ADD COLUMN IF NOT EXISTS unidade_interesse text,
  ADD COLUMN IF NOT EXISTS etapa_funil text NOT NULL DEFAULT 'novo_contato',
  ADD COLUMN IF NOT EXISTS proxima_acao_at timestamptz,
  ADD COLUMN IF NOT EXISTS origem_campanha text,
  ADD COLUMN IF NOT EXISTS consentimento_contato_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_etapa_funil
  ON public.leads (etapa_funil)
  WHERE archived = false;

CREATE INDEX IF NOT EXISTS idx_leads_proxima_acao
  ON public.leads (proxima_acao_at)
  WHERE archived = false AND proxima_acao_at IS NOT NULL;

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_etapa_funil_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_etapa_funil_check
  CHECK (etapa_funil IN (
    'novo_contato',
    'qualificacao',
    'visita_agendada',
    'proposta_enviada',
    'aguardando_responsavel',
    'matricula_em_andamento',
    'matriculado',
    'perdido'
  ));
