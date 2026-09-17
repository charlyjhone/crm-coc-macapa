-- Fundação do CRM de Captação e Matrículas Escolares
-- Migração aditiva: preserva leads, mensagens e histórico existentes.

create extension if not exists pgcrypto;

create table if not exists public.school_units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  preferred_name text,
  email text,
  phone text,
  whatsapp_opt_in boolean not null default false,
  marketing_opt_in boolean not null default false,
  consent_recorded_at timestamptz,
  notes text,
  legacy_lead_id uuid references public.leads(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists guardians_phone_unique
  on public.guardians (regexp_replace(phone, '\\D', '', 'g'))
  where phone is not null and regexp_replace(phone, '\\D', '', 'g') <> '';
create index if not exists guardians_legacy_lead_idx on public.guardians(legacy_lead_id);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  preferred_name text,
  birth_date date,
  current_school text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_guardians (
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  relationship text,
  is_primary boolean not null default false,
  is_financially_responsible boolean not null default false,
  authorized_pickup boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (student_id, guardian_id)
);

create table if not exists public.enrollment_opportunities (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  primary_guardian_id uuid references public.guardians(id) on delete set null,
  legacy_lead_id uuid references public.leads(id) on delete set null,
  unit_id uuid references public.school_units(id) on delete set null,
  academic_year integer not null check (academic_year between 2020 and 2100),
  desired_grade text not null,
  desired_shift text,
  desired_start_date date,
  source_channel text,
  source_campaign text,
  stage text not null default 'novo_interessado' check (stage in (
    'novo_interessado','tentativa_contato','contato_realizado','qualificado',
    'visita_agendada','visita_realizada','condicoes_apresentadas',
    'documentacao_pendente','matricula_em_conclusao','matriculado',
    'nutricao','perdido'
  )),
  probability_score smallint not null default 10 check (probability_score between 0 and 100),
  score_explanation text,
  data_confidence smallint not null default 0 check (data_confidence between 0 and 100),
  expected_monthly_revenue numeric(12,2),
  next_action text,
  next_action_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  loss_reason text,
  loss_notes text,
  lost_at timestamptz,
  enrolled_at timestamptz,
  status_updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((stage <> 'perdido') or loss_reason is not null),
  check ((stage <> 'matriculado') or enrolled_at is not null)
);

create unique index if not exists enrollment_opportunity_cycle_unique
  on public.enrollment_opportunities(student_id, academic_year, desired_grade, coalesce(desired_shift, ''), coalesce(unit_id::text, ''));
create index if not exists enrollment_opportunities_stage_idx on public.enrollment_opportunities(stage);
create index if not exists enrollment_opportunities_next_action_idx on public.enrollment_opportunities(next_action_at)
  where stage not in ('matriculado','perdido');
create index if not exists enrollment_opportunities_assigned_idx on public.enrollment_opportunities(assigned_to);
create index if not exists enrollment_opportunities_legacy_lead_idx on public.enrollment_opportunities(legacy_lead_id);

create table if not exists public.school_capacity (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.school_units(id) on delete cascade,
  academic_year integer not null check (academic_year between 2020 and 2100),
  grade text not null,
  shift text not null,
  total_seats integer not null check (total_seats >= 0),
  reserved_seats integer not null default 0 check (reserved_seats >= 0),
  enrolled_seats integer not null default 0 check (enrolled_seats >= 0),
  updated_at timestamptz not null default now(),
  unique(unit_id, academic_year, grade, shift),
  check (reserved_seats + enrolled_seats <= total_seats)
);

create table if not exists public.school_visits (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.enrollment_opportunities(id) on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'agendada' check (status in ('agendada','confirmada','realizada','faltou','cancelada','reagendada')),
  assigned_to uuid references auth.users(id) on delete set null,
  participants text,
  family_impression text,
  objections text,
  follow_up_notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists school_visits_schedule_idx on public.school_visits(scheduled_at, status);

create table if not exists public.enrollment_tasks (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.enrollment_opportunities(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  priority text not null default 'normal' check (priority in ('baixa','normal','alta','urgente')),
  status text not null default 'pendente' check (status in ('pendente','em_andamento','concluida','cancelada')),
  assigned_to uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists enrollment_tasks_due_idx on public.enrollment_tasks(due_at, status);

create or replace view public.enrollment_forecast
with (security_invoker = true) as
select
  unit_id,
  academic_year,
  desired_grade,
  desired_shift,
  count(*) filter (where stage = 'matriculado') as confirmed_enrollments,
  count(*) filter (where stage not in ('matriculado','perdido')) as open_opportunities,
  round(sum(
    case when stage = 'matriculado' then 1
         when stage = 'perdido' then 0
         else probability_score::numeric / 100 end
  ), 2) as forecast_enrollments,
  round(sum(
    case when stage = 'perdido' then 0
         else coalesce(expected_monthly_revenue, 0) *
              (case when stage = 'matriculado' then 1 else probability_score::numeric / 100 end)
    end
  ), 2) as forecast_monthly_revenue
from public.enrollment_opportunities
group by unit_id, academic_year, desired_grade, desired_shift;

alter table public.school_units enable row level security;
alter table public.guardians enable row level security;
alter table public.students enable row level security;
alter table public.student_guardians enable row level security;
alter table public.enrollment_opportunities enable row level security;
alter table public.school_capacity enable row level security;
alter table public.school_visits enable row level security;
alter table public.enrollment_tasks enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'school_units','guardians','students','student_guardians',
    'enrollment_opportunities','school_capacity','school_visits','enrollment_tasks'
  ]
  loop
    execute format('drop policy if exists "authenticated_access" on public.%I', t);
    execute format(
      'create policy "authenticated_access" on public.%I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

insert into public.school_units(name, code)
values ('COC Macapá Norte', 'COC-MCP-NORTE')
on conflict (code) do update set name = excluded.name, active = true, updated_at = now();

comment on table public.guardians is 'Responsáveis e contatos adultos da família.';
comment on table public.students is 'Alunos ou candidatos, separados dos responsáveis.';
comment on table public.enrollment_opportunities is 'Uma intenção de matrícula por aluno, ciclo, série, turno e unidade.';
comment on view public.enrollment_forecast is 'Matrículas confirmadas, oportunidades abertas e previsão ponderada.';
