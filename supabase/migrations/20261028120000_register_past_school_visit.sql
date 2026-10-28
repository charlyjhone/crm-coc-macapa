-- Registro de visita que já aconteceu (família veio direto à escola, sem agendar).
-- Grava a visita como "realizada" na data informada (passada), com as anotações,
-- e avança o funil como uma visita concluída: etapa visita_realizada (se estava
-- antes dela) e próxima ação "Realizar retorno após a visita".
create or replace function public.register_past_school_visit(
  p_opportunity_id uuid,
  p_visited_at timestamptz,
  p_participants text default null,
  p_family_impression text default null,
  p_objections text default null,
  p_follow_up_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_previous_stage text;
  v_new_stage text;
  v_visit_id uuid;
  v_next_at timestamptz := now() + interval '1 day';
  v_action text := 'Realizar retorno após a visita';
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then raise exception 'Usuário não autenticado'; end if;

  if p_visited_at is null or not isfinite(p_visited_at) then
    raise exception 'Informe a data e o horário da visita';
  end if;
  if p_visited_at > now() then
    raise exception 'Essa data ainda não chegou. Para visitas futuras, use Agendar visita';
  end if;
  if p_visited_at < now() - interval '1 year' then
    raise exception 'Informe uma visita dos últimos 12 meses';
  end if;

  select stage into v_previous_stage from public.enrollment_opportunities
  where id = p_opportunity_id for update;
  if not found then raise exception 'Oportunidade não encontrada'; end if;
  if v_previous_stage in ('matriculado','perdido') then
    raise exception 'A oportunidade está encerrada. Reative-a antes de registrar a visita';
  end if;

  -- Mesma visita registrada duas vezes (clique duplo ou repetição): devolve a existente.
  select id into v_visit_id from public.school_visits
  where opportunity_id = p_opportunity_id and status = 'realizada' and scheduled_at = p_visited_at
  limit 1;
  if found then return v_visit_id; end if;

  -- Visita futura em aberto: a família adiantou a vinda. Registre nela, sem duplicar.
  if exists (select 1 from public.school_visits where opportunity_id = p_opportunity_id
             and status in ('agendada','confirmada','reagendada') and scheduled_at > now()) then
    raise exception 'Este aluno já tem uma visita agendada. Use Registrar nessa visita e marque como Realizada';
  end if;

  insert into public.school_visits(
    opportunity_id, scheduled_at, status, completed_at, participants,
    family_impression, objections, follow_up_notes, assigned_to
  ) values (
    p_opportunity_id, p_visited_at, 'realizada', p_visited_at, nullif(trim(p_participants),''),
    nullif(trim(p_family_impression),''), nullif(trim(p_objections),''), nullif(trim(p_follow_up_notes),''), auth.uid()
  ) returning id into v_visit_id;

  v_new_stage := case when v_previous_stage in
    ('novo_interessado','tentativa_contato','contato_realizado','qualificado','visita_agendada','nutricao')
    then 'visita_realizada' else v_previous_stage end;

  update public.enrollment_opportunities set stage = v_new_stage,
    next_action = v_action, next_action_at = v_next_at,
    status_updated_at = case when stage <> v_new_stage then now() else status_updated_at end,
    updated_at = now()
  where id = p_opportunity_id;

  if v_new_stage <> v_previous_stage then
    insert into public.enrollment_stage_history(opportunity_id, previous_stage, new_stage, next_action, next_action_at, changed_by)
    values (p_opportunity_id, v_previous_stage, v_new_stage, v_action, v_next_at, auth.uid());
  end if;

  return v_visit_id;
end;
$$;

revoke all on function public.register_past_school_visit(uuid, timestamptz, text, text, text, text) from public, anon;
grant execute on function public.register_past_school_visit(uuid, timestamptz, text, text, text, text) to authenticated;
