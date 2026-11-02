-- Agendar ou remarcar visita pelo CRM não pode ocupar um horário que já tem outra
-- família (mesma janela de 30 minutos usada pela Ana). A mensagem diz quem está no
-- horário e quais horários ainda estão livres no dia.
create or replace function public.school_visit_conflict_message(p_scheduled_at timestamptz, p_ignore_visit_id uuid default null)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_aluno text;
  v_quando text;
  v_livres text;
begin
  select coalesce(s.full_name, 'outra família'), to_char(v.scheduled_at at time zone 'America/Belem', 'HH24:MI')
    into v_aluno, v_quando
  from public.school_visits v
  left join public.enrollment_opportunities o on o.id = v.opportunity_id
  left join public.students s on s.id = o.student_id
  where v.status in ('agendada', 'confirmada', 'reagendada')
    and (p_ignore_visit_id is null or v.id <> p_ignore_visit_id)
    and v.scheduled_at < p_scheduled_at + interval '30 minutes'
    and v.scheduled_at + interval '30 minutes' > p_scheduled_at
  order by v.scheduled_at
  limit 1;
  if v_aluno is null then return null; end if;

  select string_agg(slot_time, ', ' order by slot_at) into v_livres
  from (select * from public.get_ana_available_visit_slots((p_scheduled_at at time zone 'America/Belem')::date) limit 8) x;

  return format('Horário ocupado: já existe visita de %s às %s. %s', v_aluno, v_quando,
    case when v_livres is not null then 'Horários livres nesse dia: ' || v_livres || '.' else 'Não há horários livres nesse dia; escolha outra data.' end);
end;
$$;

create or replace function public.schedule_school_visit(p_opportunity_id uuid, p_scheduled_at timestamp with time zone, p_participants text default null::text, p_notes text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_visit public.school_visits%rowtype;
  v_visit_id uuid;
  v_previous_stage text;
  v_new_stage text;
  v_next_at timestamptz;
  v_conflict text;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then raise exception 'Usuário não autenticado'; end if;
  if p_scheduled_at is null or not isfinite(p_scheduled_at) or p_scheduled_at <= now() then
    raise exception 'Informe uma data e horário futuros para a visita';
  end if;

  -- Mesma trava da Ana: duas reservas ao mesmo tempo não pegam o mesmo horário.
  perform pg_advisory_xact_lock(781334218);

  select stage into v_previous_stage from public.enrollment_opportunities
  where id = p_opportunity_id for update;
  if not found then raise exception 'Oportunidade não encontrada'; end if;
  if v_previous_stage in ('matriculado','perdido','nutricao') then
    raise exception 'A oportunidade precisa estar ativa para agendar uma visita';
  end if;
  select * into v_visit from public.school_visits
  where opportunity_id = p_opportunity_id and status in ('agendada','confirmada','reagendada')
  order by created_at desc limit 1 for update;
  if found then
    if v_visit.scheduled_at = p_scheduled_at then return v_visit.id; end if;
    raise exception 'Já existe visita ativa para este aluno. Use Registrar para reagendá-la';
  end if;

  v_conflict := public.school_visit_conflict_message(p_scheduled_at, null);
  if v_conflict is not null then raise exception '%', v_conflict; end if;

  insert into public.school_visits(opportunity_id,scheduled_at,participants,follow_up_notes,assigned_to)
  values (p_opportunity_id,p_scheduled_at,nullif(trim(p_participants),''),nullif(trim(p_notes),''),auth.uid())
  returning id into v_visit_id;
  v_new_stage := case when v_previous_stage in ('novo_interessado','tentativa_contato','contato_realizado','qualificado')
    then 'visita_agendada' else v_previous_stage end;
  v_next_at := greatest(now(), p_scheduled_at - interval '1 day');
  update public.enrollment_opportunities set stage=v_new_stage,
    next_action='Confirmar visita com a família', next_action_at=v_next_at,
    status_updated_at=case when stage<>v_new_stage then now() else status_updated_at end,
    updated_at=now() where id=p_opportunity_id;
  if v_new_stage <> v_previous_stage then
    insert into public.enrollment_stage_history(opportunity_id,previous_stage,new_stage,next_action,next_action_at,changed_by)
    values(p_opportunity_id,v_previous_stage,v_new_stage,'Confirmar visita com a família',v_next_at,auth.uid());
  end if;
  return v_visit_id;
end;
$function$;

create or replace function public.reschedule_school_visit(p_visit_id uuid, p_scheduled_at timestamp with time zone, p_follow_up_notes text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_opportunity_id uuid;
  v_visit public.school_visits%rowtype;
  v_stage text;
  v_conflict text;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then raise exception 'Usuário não autenticado'; end if;
  if p_scheduled_at is null or not isfinite(p_scheduled_at) or p_scheduled_at<=now() then
    raise exception 'Informe uma data e horário futuros para a visita';
  end if;

  perform pg_advisory_xact_lock(781334218);

  select opportunity_id into v_opportunity_id from public.school_visits where id=p_visit_id;
  if not found then raise exception 'Visita não encontrada'; end if;
  select stage into v_stage from public.enrollment_opportunities where id=v_opportunity_id for update;
  select * into v_visit from public.school_visits where id=p_visit_id and opportunity_id=v_opportunity_id for update;
  if not found then raise exception 'Visita não encontrada'; end if;
  if v_stage in ('matriculado','perdido','nutricao') then raise exception 'A oportunidade precisa estar ativa para reagendar'; end if;
  if v_visit.status='realizada' then raise exception 'Visita já realizada. Agende uma nova visita se necessário'; end if;
  if exists(select 1 from public.school_visits where opportunity_id=v_opportunity_id and id<>p_visit_id
    and status in ('agendada','confirmada','reagendada')) then raise exception 'Já existe outra visita ativa para este aluno'; end if;
  if p_scheduled_at=v_visit.scheduled_at and v_visit.status<>'reagendada' then
    raise exception 'Escolha um novo horário para reagendar';
  end if;

  v_conflict := public.school_visit_conflict_message(p_scheduled_at, p_visit_id);
  if v_conflict is not null then raise exception '%', v_conflict; end if;

  update public.school_visits set status='reagendada',scheduled_at=p_scheduled_at,completed_at=null,
    follow_up_notes=case when p_follow_up_notes is null then follow_up_notes else nullif(trim(p_follow_up_notes),'') end,
    updated_at=now() where id=p_visit_id;
  if v_visit.status='reagendada' and v_visit.scheduled_at=p_scheduled_at then return; end if;
  update public.enrollment_opportunities set
    next_action='Confirmar novo horário da visita com a família',
    next_action_at=greatest(now(),p_scheduled_at-interval '1 day'),updated_at=now()
  where id=v_opportunity_id;
end;
$function$;

revoke all on function public.school_visit_conflict_message(timestamptz, uuid) from public, anon;
grant execute on function public.school_visit_conflict_message(timestamptz, uuid) to authenticated, service_role;
