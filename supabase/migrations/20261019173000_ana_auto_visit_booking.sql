-- Agendamento automático da atendente: consulta slots livres e reserva atomicamente.
-- Horário escolar: America/Belem (Macapá, UTC-3), seg-sex, 08:00–18:00.
-- Cada visita ocupa 30 minutos; antecedência mínima de 60 minutos.

create index if not exists school_visits_active_schedule_idx
  on public.school_visits (scheduled_at)
  where status in ('agendada', 'confirmada', 'reagendada');

create or replace function public.get_ana_available_visit_slots(p_date date)
returns table(slot_at timestamptz, slot_time text)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if p_date is null or extract(isodow from p_date) not between 1 and 5 then
    return;
  end if;

  return query
  with candidates as (
    select ((p_date::timestamp + make_interval(hours => h.hour, mins => m.minute))
      at time zone 'America/Belem') as candidate_at
    from generate_series(8, 17) as h(hour)
    cross join (values (0), (30)) as m(minute)
  )
  select c.candidate_at,
         to_char(c.candidate_at at time zone 'America/Belem', 'HH24:MI')
  from candidates c
  where c.candidate_at >= now() + interval '60 minutes'
    and not exists (
      select 1
      from public.school_visits v
      where v.status in ('agendada', 'confirmada', 'reagendada')
        and v.scheduled_at < c.candidate_at + interval '30 minutes'
        and v.scheduled_at + interval '30 minutes' > c.candidate_at
    )
  order by c.candidate_at;
end;
$function$;

revoke all on function public.get_ana_available_visit_slots(date) from public, anon, authenticated;
grant execute on function public.get_ana_available_visit_slots(date) to service_role;

create or replace function public.register_ana_school_visit(
  p_lead_id uuid,
  p_opportunity_id uuid,
  p_scheduled_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_stage text;
  v_visit_id uuid;
  v_local timestamp without time zone;
begin
  if p_scheduled_at is null or not isfinite(p_scheduled_at) then
    raise exception 'Data e horário da visita inválidos';
  end if;

  v_local := p_scheduled_at at time zone 'America/Belem';
  if p_scheduled_at < now() + interval '60 minutes'
     or extract(isodow from v_local) not between 1 and 5
     or extract(hour from v_local) < 8
     or extract(hour from v_local) >= 18
     or extract(minute from v_local) not in (0, 30)
     or extract(second from v_local) <> 0 then
    raise exception 'Horário inválido: escolha um slot livre de 30 minutos, seg-sex, 08h-18h, com antecedência mínima de 60 minutos';
  end if;

  -- Serializa todas as reservas para que duas famílias não ocupem o mesmo slot.
  perform pg_advisory_xact_lock(781334218);

  perform 1 from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Contato não encontrado';
  end if;

  select stage into v_stage
  from public.enrollment_opportunities
  where id = p_opportunity_id and legacy_lead_id = p_lead_id
  for update;

  if not found or v_stage in ('matriculado', 'perdido') then
    raise exception 'Oportunidade ativa do contato não encontrada';
  end if;

  select id into v_visit_id
  from public.school_visits
  where opportunity_id = p_opportunity_id
    and status in ('agendada', 'confirmada', 'reagendada')
  order by created_at desc
  limit 1;

  if v_visit_id is not null then
    if exists (
      select 1 from public.school_visits
      where id = v_visit_id and scheduled_at = p_scheduled_at
    ) then
      return v_visit_id;
    end if;
    raise exception 'Já existe visita ativa para este aluno; cancele ou reagende a visita existente';
  end if;

  if exists (
    select 1
    from public.school_visits v
    where v.status in ('agendada', 'confirmada', 'reagendada')
      and v.scheduled_at < p_scheduled_at + interval '30 minutes'
      and v.scheduled_at + interval '30 minutes' > p_scheduled_at
  ) then
    raise exception 'Horário indisponível; consulte novamente os horários livres';
  end if;

  insert into public.school_visits(opportunity_id, scheduled_at, follow_up_notes)
  values (
    p_opportunity_id,
    p_scheduled_at,
    'Agendada automaticamente pela atendente virtual após consulta e reserva de horário disponível.'
  )
  returning id into v_visit_id;

  update public.enrollment_opportunities
  set stage = 'visita_agendada',
      probability_score = greatest(probability_score, 65),
      next_action = 'Realizar visita agendada',
      next_action_at = p_scheduled_at,
      status_updated_at = now(),
      updated_at = now()
  where id = p_opportunity_id;

  insert into public.enrollment_stage_history(
    opportunity_id, previous_stage, new_stage, next_action, next_action_at, changed_by
  ) values (
    p_opportunity_id, v_stage, 'visita_agendada',
    'Realizar visita agendada', p_scheduled_at, null
  );

  return v_visit_id;
end;
$function$;

revoke all on function public.register_ana_school_visit(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.register_ana_school_visit(uuid, uuid, timestamptz) to service_role;
