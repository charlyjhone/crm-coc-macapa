-- Secretaria: agendamento idempotente, notas preservadas e reagendamento real.
-- Mantém a assinatura das RPCs existentes para clientes já publicados.
create index if not exists school_visits_opportunity_active_idx
  on public.school_visits(opportunity_id)
  where status in ('agendada','confirmada','reagendada');

create or replace function public.schedule_school_visit(
  p_opportunity_id uuid, p_scheduled_at timestamptz,
  p_participants text default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_visit public.school_visits%rowtype;
  v_visit_id uuid;
  v_previous_stage text;
  v_new_stage text;
  v_next_at timestamptz;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then raise exception 'Usuário não autenticado'; end if;
  if p_scheduled_at is null or not isfinite(p_scheduled_at) or p_scheduled_at <= now() then
    raise exception 'Informe uma data e horário futuros para a visita';
  end if;

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
$$;

create or replace function public.update_school_visit_status(
  p_visit_id uuid, p_status text, p_family_impression text default null,
  p_objections text default null, p_follow_up_notes text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_opportunity_id uuid;
  v_visit public.school_visits%rowtype;
  v_previous_stage text;
  v_new_stage text;
  v_action text;
  v_next_at timestamptz;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then raise exception 'Usuário não autenticado'; end if;
  if p_status is null or p_status not in ('agendada','confirmada','realizada','faltou','cancelada','reagendada') then
    raise exception 'Status de visita inválido';
  end if;

  select opportunity_id into v_opportunity_id from public.school_visits where id=p_visit_id;
  if not found then raise exception 'Visita não encontrada'; end if;
  -- Mesma ordem das RPCs de agendamento: oportunidade, depois visita.
  select stage into v_previous_stage from public.enrollment_opportunities where id=v_opportunity_id for update;
  select * into v_visit from public.school_visits where id=p_visit_id and opportunity_id=v_opportunity_id for update;
  if not found then raise exception 'Visita não encontrada'; end if;
  if p_status<>v_visit.status and v_previous_stage in ('matriculado','perdido','nutricao') then
    raise exception 'Reative a oportunidade antes de alterar o status da visita';
  end if;
  if v_visit.status='realizada' and p_status<>'realizada' then
    raise exception 'Visita já realizada. Agende uma nova visita se necessário';
  end if;
  if p_status='reagendada' and v_visit.status<>'reagendada' then
    raise exception 'Informe a nova data usando o reagendamento';
  end if;
  if p_status<>v_visit.status and p_status in ('agendada','confirmada','reagendada') then
    if v_visit.scheduled_at <= now() then raise exception 'A data passou. Reagende a visita para um horário futuro'; end if;
    if exists(select 1 from public.school_visits where opportunity_id=v_opportunity_id and id<>p_visit_id
      and status in ('agendada','confirmada','reagendada')) then
      raise exception 'Já existe outra visita ativa para este aluno';
    end if;
  end if;

  update public.school_visits set status=p_status,
    family_impression=case when p_family_impression is null then family_impression else nullif(trim(p_family_impression),'') end,
    objections=case when p_objections is null then objections else nullif(trim(p_objections),'') end,
    follow_up_notes=case when p_follow_up_notes is null then follow_up_notes else nullif(trim(p_follow_up_notes),'') end,
    completed_at=case when p_status='realizada' then coalesce(completed_at,now()) else null end,
    updated_at=now() where id=p_visit_id;
  -- Editar anotações ou repetir a requisição não muda prazos nem duplica histórico.
  if p_status=v_visit.status then return; end if;

  v_new_stage := v_previous_stage;
  if p_status='realizada' then
    if v_previous_stage in ('novo_interessado','tentativa_contato','contato_realizado','qualificado','visita_agendada') then
      v_new_stage := 'visita_realizada';
    end if;
    v_action := 'Realizar retorno após a visita';
    v_next_at := now() + interval '1 day';
  elsif p_status in ('faltou','cancelada') then
    v_action := case when p_status='faltou' then 'Reagendar visita' else 'Retomar contato com a família' end;
    v_next_at := now() + interval '1 day';
  else
    v_action := case when p_status='confirmada' then 'Realizar visita escolar' else 'Confirmar visita com a família' end;
    v_next_at := case when p_status='confirmada' then v_visit.scheduled_at else greatest(now(),v_visit.scheduled_at-interval '1 day') end;
  end if;
  update public.enrollment_opportunities set stage=v_new_stage,
    next_action=v_action,next_action_at=v_next_at,
    status_updated_at=case when stage<>v_new_stage then now() else status_updated_at end,
    updated_at=now() where id=v_opportunity_id;
  if v_new_stage<>v_previous_stage then
    insert into public.enrollment_stage_history(opportunity_id,previous_stage,new_stage,next_action,next_action_at,changed_by)
    values(v_opportunity_id,v_previous_stage,v_new_stage,v_action,v_next_at,auth.uid());
  end if;
end;
$$;

create or replace function public.reschedule_school_visit(
  p_visit_id uuid, p_scheduled_at timestamptz, p_follow_up_notes text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_opportunity_id uuid;
  v_visit public.school_visits%rowtype;
  v_stage text;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then raise exception 'Usuário não autenticado'; end if;
  if p_scheduled_at is null or not isfinite(p_scheduled_at) or p_scheduled_at<=now() then
    raise exception 'Informe uma data e horário futuros para a visita';
  end if;
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

  update public.school_visits set status='reagendada',scheduled_at=p_scheduled_at,completed_at=null,
    follow_up_notes=case when p_follow_up_notes is null then follow_up_notes else nullif(trim(p_follow_up_notes),'') end,
    updated_at=now() where id=p_visit_id;
  if v_visit.status='reagendada' and v_visit.scheduled_at=p_scheduled_at then return; end if;
  update public.enrollment_opportunities set
    next_action='Confirmar novo horário da visita com a família',
    next_action_at=greatest(now(),p_scheduled_at-interval '1 day'),updated_at=now()
  where id=v_opportunity_id;
end;
$$;

revoke all on function public.schedule_school_visit(uuid,timestamptz,text,text) from public,anon;
revoke all on function public.update_school_visit_status(uuid,text,text,text,text) from public,anon;
revoke all on function public.reschedule_school_visit(uuid,timestamptz,text) from public,anon;
grant execute on function public.schedule_school_visit(uuid,timestamptz,text,text) to authenticated;
grant execute on function public.update_school_visit_status(uuid,text,text,text,text) to authenticated;
grant execute on function public.reschedule_school_visit(uuid,timestamptz,text) to authenticated;
