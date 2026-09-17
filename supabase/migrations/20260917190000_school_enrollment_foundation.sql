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

create table if not exists public.enrollment_stage_history (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.enrollment_opportunities(id) on delete cascade,
  previous_stage text,
  new_stage text not null,
  next_action text,
  next_action_at timestamptz,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists enrollment_stage_history_opportunity_idx
  on public.enrollment_stage_history(opportunity_id, created_at desc);

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
alter table public.enrollment_stage_history enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'school_units','guardians','students','student_guardians',
    'enrollment_opportunities','school_capacity','school_visits','enrollment_tasks',
    'enrollment_stage_history'
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

create or replace function public.create_school_enrollment(
  p_guardian_name text,
  p_guardian_phone text,
  p_guardian_email text,
  p_student_name text,
  p_academic_year integer,
  p_desired_grade text,
  p_desired_shift text default null,
  p_whatsapp_opt_in boolean default false,
  p_source_channel text default 'cadastro_manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $
declare
  v_guardian_id uuid;
  v_student_id uuid;
  v_opportunity_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;
  if nullif(trim(p_guardian_name), '') is null
     or nullif(trim(p_student_name), '') is null
     or nullif(trim(p_desired_grade), '') is null then
    raise exception 'Responsável, aluno e série são obrigatórios';
  end if;
  if p_academic_year not between 2020 and 2100 then
    raise exception 'Ano letivo inválido';
  end if;

  select id into v_guardian_id
  from public.guardians
  where p_guardian_phone is not null
    and regexp_replace(coalesce(phone, ''), '\\D', '', 'g') =
        regexp_replace(p_guardian_phone, '\\D', '', 'g')
    and regexp_replace(p_guardian_phone, '\\D', '', 'g') <> ''
  limit 1;

  if v_guardian_id is null then
    insert into public.guardians(
      full_name, phone, email, whatsapp_opt_in, consent_recorded_at, created_by
    ) values (
      trim(p_guardian_name), nullif(trim(p_guardian_phone), ''),
      nullif(lower(trim(p_guardian_email)), ''), p_whatsapp_opt_in,
      case when p_whatsapp_opt_in then now() else null end, auth.uid()
    ) returning id into v_guardian_id;
  end if;

  insert into public.students(full_name, created_by)
  values (trim(p_student_name), auth.uid())
  returning id into v_student_id;

  insert into public.student_guardians(
    student_id, guardian_id, relationship, is_primary, is_financially_responsible
  ) values (
    v_student_id, v_guardian_id, 'responsável', true, true
  );

  insert into public.enrollment_opportunities(
    student_id, primary_guardian_id, academic_year, desired_grade,
    desired_shift, source_channel, next_action, next_action_at,
    created_by, assigned_to
  ) values (
    v_student_id, v_guardian_id, p_academic_year, trim(p_desired_grade),
    nullif(trim(p_desired_shift), ''), p_source_channel,
    'Realizar primeiro contato', now(), auth.uid(), auth.uid()
  ) returning id into v_opportunity_id;

  return jsonb_build_object(
    'guardian_id', v_guardian_id,
    'student_id', v_student_id,
    'opportunity_id', v_opportunity_id
  );
end;
$;

revoke all on function public.create_school_enrollment(text,text,text,text,integer,text,text,boolean,text) from public;
grant execute on function public.create_school_enrollment(text,text,text,text,integer,text,text,boolean,text) to authenticated;

create or replace function public.update_enrollment_progress(
  p_opportunity_id uuid,
  p_stage text,
  p_next_action text default null,
  p_next_action_at timestamptz default null,
  p_loss_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $
declare
  v_previous_stage text;
  v_score smallint;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;
  if p_stage not in (
    'novo_interessado','tentativa_contato','contato_realizado','qualificado',
    'visita_agendada','visita_realizada','condicoes_apresentadas',
    'documentacao_pendente','matricula_em_conclusao','matriculado',
    'nutricao','perdido'
  ) then
    raise exception 'Etapa inválida';
  end if;
  if p_stage = 'perdido' and nullif(trim(p_loss_reason), '') is null then
    raise exception 'Informe o motivo da perda';
  end if;

  select stage into v_previous_stage
  from public.enrollment_opportunities
  where id = p_opportunity_id
  for update;

  if v_previous_stage is null then
    raise exception 'Oportunidade não encontrada';
  end if;

  v_score := case p_stage
    when 'novo_interessado' then 10
    when 'tentativa_contato' then 15
    when 'contato_realizado' then 30
    when 'qualificado' then 50
    when 'visita_agendada' then 65
    when 'visita_realizada' then 75
    when 'condicoes_apresentadas' then 80
    when 'documentacao_pendente' then 88
    when 'matricula_em_conclusao' then 95
    when 'matriculado' then 100
    when 'nutricao' then 25
    when 'perdido' then 0
  end;

  update public.enrollment_opportunities
  set stage = p_stage,
      probability_score = v_score,
      next_action = nullif(trim(p_next_action), ''),
      next_action_at = p_next_action_at,
      loss_reason = case when p_stage = 'perdido' then trim(p_loss_reason) else null end,
      loss_notes = case when p_stage = 'perdido' then loss_notes else null end,
      lost_at = case when p_stage = 'perdido' then now() else null end,
      enrolled_at = case when p_stage = 'matriculado' then coalesce(enrolled_at, now()) else null end,
      status_updated_at = now(),
      updated_at = now()
  where id = p_opportunity_id;

  insert into public.enrollment_stage_history(
    opportunity_id, previous_stage, new_stage, next_action, next_action_at, changed_by
  ) values (
    p_opportunity_id, v_previous_stage, p_stage,
    nullif(trim(p_next_action), ''), p_next_action_at, auth.uid()
  );

  return jsonb_build_object(
    'opportunity_id', p_opportunity_id,
    'previous_stage', v_previous_stage,
    'new_stage', p_stage,
    'probability_score', v_score
  );
end;
$;

revoke all on function public.update_enrollment_progress(uuid,text,text,timestamptz,text) from public;
grant execute on function public.update_enrollment_progress(uuid,text,text,timestamptz,text) to authenticated;

create or replace function public.schedule_school_visit(
  p_opportunity_id uuid,
  p_scheduled_at timestamptz,
  p_participants text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $
declare
  v_visit_id uuid;
  v_previous_stage text;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  if p_scheduled_at is null then raise exception 'Informe a data da visita'; end if;

  select stage into v_previous_stage
  from public.enrollment_opportunities
  where id = p_opportunity_id
  for update;
  if v_previous_stage is null then raise exception 'Oportunidade não encontrada'; end if;

  insert into public.school_visits(
    opportunity_id, scheduled_at, participants, follow_up_notes, assigned_to
  ) values (
    p_opportunity_id, p_scheduled_at, nullif(trim(p_participants), ''),
    nullif(trim(p_notes), ''), auth.uid()
  ) returning id into v_visit_id;

  update public.enrollment_opportunities
  set stage = 'visita_agendada',
      probability_score = greatest(probability_score, 65),
      next_action = 'Confirmar visita com a família',
      next_action_at = p_scheduled_at - interval '1 day',
      status_updated_at = now(),
      updated_at = now()
  where id = p_opportunity_id;

  insert into public.enrollment_stage_history(
    opportunity_id, previous_stage, new_stage, next_action, next_action_at, changed_by
  ) values (
    p_opportunity_id, v_previous_stage, 'visita_agendada',
    'Confirmar visita com a família', p_scheduled_at - interval '1 day', auth.uid()
  );

  return v_visit_id;
end;
$;

revoke all on function public.schedule_school_visit(uuid,timestamptz,text,text) from public;
grant execute on function public.schedule_school_visit(uuid,timestamptz,text,text) to authenticated;

create or replace function public.update_school_visit_status(
  p_visit_id uuid,
  p_status text,
  p_family_impression text default null,
  p_objections text default null,
  p_follow_up_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $
declare
  v_opportunity_id uuid;
  v_previous_stage text;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  if p_status not in ('agendada','confirmada','realizada','faltou','cancelada','reagendada') then
    raise exception 'Status de visita inválido';
  end if;

  select opportunity_id into v_opportunity_id
  from public.school_visits where id = p_visit_id for update;
  if v_opportunity_id is null then raise exception 'Visita não encontrada'; end if;

  update public.school_visits
  set status = p_status,
      family_impression = nullif(trim(p_family_impression), ''),
      objections = nullif(trim(p_objections), ''),
      follow_up_notes = nullif(trim(p_follow_up_notes), ''),
      completed_at = case when p_status = 'realizada' then now() else completed_at end,
      updated_at = now()
  where id = p_visit_id;

  if p_status = 'realizada' then
    select stage into v_previous_stage from public.enrollment_opportunities
    where id = v_opportunity_id for update;

    update public.enrollment_opportunities
    set stage = 'visita_realizada',
        probability_score = greatest(probability_score, 75),
        next_action = 'Realizar retorno após a visita',
        next_action_at = now() + interval '1 day',
        status_updated_at = now(),
        updated_at = now()
    where id = v_opportunity_id;

    insert into public.enrollment_stage_history(
      opportunity_id, previous_stage, new_stage, next_action, next_action_at, changed_by
    ) values (
      v_opportunity_id, v_previous_stage, 'visita_realizada',
      'Realizar retorno após a visita', now() + interval '1 day', auth.uid()
    );
  elsif p_status in ('faltou','cancelada') then
    update public.enrollment_opportunities
    set next_action = case when p_status = 'faltou' then 'Reagendar visita' else 'Retomar contato com a família' end,
        next_action_at = now() + interval '1 day',
        updated_at = now()
    where id = v_opportunity_id;
  end if;
end;
$;

revoke all on function public.update_school_visit_status(uuid,text,text,text,text) from public;
grant execute on function public.update_school_visit_status(uuid,text,text,text,text) to authenticated;

comment on table public.guardians is 'Responsáveis e contatos adultos da família.';
comment on table public.students is 'Alunos ou candidatos, separados dos responsáveis.';
comment on table public.enrollment_opportunities is 'Uma intenção de matrícula por aluno, ciclo, série, turno e unidade.';
comment on view public.enrollment_forecast is 'Matrículas confirmadas, oportunidades abertas e previsão ponderada.';
