create table public.crm_survey_claims (
  lead_id uuid not null references public.leads(id) on delete cascade,
  cycle_at timestamptz not null,
  state text not null check (state in ('processing', 'sent', 'failed')),
  updated_at timestamptz not null default now(),
  primary key (lead_id, cycle_at)
);
alter table public.crm_survey_claims enable row level security;
revoke all on public.crm_survey_claims from anon, authenticated;

create function public.claim_crm_survey(p_lead_id uuid, p_cycle_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  insert into public.crm_survey_claims (lead_id, cycle_at, state)
  values (p_lead_id, p_cycle_at, 'processing')
  on conflict (lead_id, cycle_at) do update
    set state = 'processing', updated_at = now()
    where crm_survey_claims.state = 'failed'
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;
revoke all on function public.claim_crm_survey(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_crm_survey(uuid, timestamptz) to service_role;
