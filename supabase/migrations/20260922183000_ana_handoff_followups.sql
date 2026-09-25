-- Acompanhamento único da Ana cinco minutos após um handoff ainda sem interação.

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.ana_followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  phone text not null,
  handoff_at timestamptz not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','cancelled','failed')),
  cancel_reason text,
  error_message text,
  processed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lead_id, handoff_at)
);

alter table public.ana_followups enable row level security;
revoke all on public.ana_followups from public, anon, authenticated;
grant all on public.ana_followups to service_role;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'ana-process-followups' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

select cron.schedule(
  'ana-process-followups',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://fenqnbzdjnyvgrmjczoi.supabase.co/functions/v1/school-triage',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"action":"process_followups"}'::jsonb
    );
  $cron$
);
