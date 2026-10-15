alter table public.leads
  add column if not exists attention_level text,
  add column if not exists attention_reason text;

alter table public.leads
  add constraint leads_attention_level_check
  check (attention_level is null or attention_level in ('urgente', 'atencao', 'normal', 'externo'));

comment on column public.leads.attention_level is 'Classificação do teor da última mensagem recebida, gerada pela triagem da Ana.';
comment on column public.leads.attention_reason is 'Motivo breve da classificação para revisão da equipe.';
