-- O gatilho de pontuação também é executado pelos cadastros internos da Ana.
-- Preserva a guarda admin/Secretaria e permite apenas o JWT interno service_role.
-- A função já era SECURITY DEFINER; assinatura, privilégios e cálculo são preservados.
CREATE OR REPLACE FUNCTION public.recompute_enrollment_score(p_opportunity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_opportunity public.enrollment_opportunities%rowtype;
  v_guardian public.guardians%rowtype;
  v_score integer;
  v_confidence integer := 20;
  v_explanation text;
  v_available_seats integer;
  v_has_capacity boolean := false;
  v_visit_status text;
  v_has_objections boolean := false;
  v_overdue_tasks integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' and (
    auth.uid() is null or not (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'user'::public.app_role)
    )
  ) then raise exception 'Usuário não autenticado'; end if;

  select * into v_opportunity
  from public.enrollment_opportunities
  where id = p_opportunity_id;

  if not found then raise exception 'Oportunidade não encontrada'; end if;

  if v_opportunity.stage = 'matriculado' then
    v_score := 100;
    v_confidence := 100;
    v_explanation := 'Matrícula concluída.';
  elsif v_opportunity.stage = 'perdido' then
    v_score := 0;
    v_confidence := 100;
    v_explanation := 'Oportunidade encerrada como perdida.';
  else
    v_score := case v_opportunity.stage
      when 'novo_interessado' then 15
      when 'tentativa_contato' then 18
      when 'contato_realizado' then 30
      when 'qualificado' then 50
      when 'visita_agendada' then 62
      when 'visita_realizada' then 72
      when 'condicoes_apresentadas' then 80
      when 'documentacao_pendente' then 88
      when 'matricula_em_conclusao' then 95
      when 'nutricao' then 25
      else 10
    end;
    v_explanation := 'Etapa atual: ' || replace(v_opportunity.stage, '_', ' ') || '.';

    if v_opportunity.primary_guardian_id is not null then
      select * into v_guardian from public.guardians where id = v_opportunity.primary_guardian_id;
      if nullif(trim(v_guardian.phone), '') is not null then
        v_score := v_score + 3;
        v_confidence := v_confidence + 15;
        v_explanation := v_explanation || ' WhatsApp informado.';
      end if;
      if nullif(trim(v_guardian.email), '') is not null then
        v_score := v_score + 2;
        v_confidence := v_confidence + 10;
        v_explanation := v_explanation || ' E-mail informado.';
      end if;
    end if;

    select status, nullif(trim(objections), '') is not null
      into v_visit_status, v_has_objections
    from public.school_visits
    where opportunity_id = p_opportunity_id
    order by scheduled_at desc
    limit 1;

    if v_visit_status is not null then
      v_confidence := v_confidence + 20;
      if v_visit_status = 'realizada' then
        v_score := v_score + 8;
        v_explanation := v_explanation || ' Visita realizada.';
      elsif v_visit_status = 'confirmada' then
        v_score := v_score + 5;
        v_explanation := v_explanation || ' Visita confirmada.';
      elsif v_visit_status = 'faltou' then
        v_score := v_score - 12;
        v_explanation := v_explanation || ' Família não compareceu à última visita.';
      elsif v_visit_status = 'cancelada' then
        v_score := v_score - 8;
        v_explanation := v_explanation || ' Última visita cancelada.';
      end if;
      if v_has_objections then
        v_score := v_score - 3;
        v_explanation := v_explanation || ' Existem objeções registradas.';
      end if;
    end if;

    select count(*) into v_overdue_tasks
    from public.enrollment_tasks
    where opportunity_id = p_opportunity_id
      and status in ('pendente','em_andamento')
      and due_at < now();

    if v_overdue_tasks > 0 then
      v_score := v_score - least(15, 5 + v_overdue_tasks * 3);
      v_explanation := v_explanation || ' Há ' || v_overdue_tasks || ' tarefa(s) atrasada(s).';
    elsif nullif(trim(v_opportunity.next_action), '') is not null then
      v_confidence := v_confidence + 15;
      v_explanation := v_explanation || ' Próxima ação definida.';
    else
      v_score := v_score - 7;
      v_explanation := v_explanation || ' Próxima ação não definida.';
    end if;

    if v_opportunity.next_action_at is not null and v_opportunity.next_action_at < now() then
      v_score := v_score - 5;
      v_explanation := v_explanation || ' Próxima ação vencida.';
    end if;

    if v_opportunity.status_updated_at < now() - interval '14 days' then
      v_score := v_score - 10;
      v_explanation := v_explanation || ' Sem avanço há mais de 14 dias.';
    elsif v_opportunity.status_updated_at < now() - interval '7 days' then
      v_score := v_score - 5;
      v_explanation := v_explanation || ' Sem avanço há mais de 7 dias.';
    end if;

    select true, total_seats - reserved_seats - enrolled_seats
      into v_has_capacity, v_available_seats
    from public.school_capacity
    where unit_id is not distinct from v_opportunity.unit_id
      and academic_year = v_opportunity.academic_year
      and grade = v_opportunity.desired_grade
      and shift is not distinct from v_opportunity.desired_shift
    limit 1;

    if v_has_capacity then
      v_confidence := v_confidence + 15;
      if v_available_seats <= 0 then
        v_score := v_score - 20;
        v_explanation := v_explanation || ' Sem vaga disponível na turma desejada.';
      elsif v_available_seats <= 2 then
        v_score := v_score - 3;
        v_explanation := v_explanation || ' Últimas vagas na turma.';
      else
        v_score := v_score + 3;
        v_explanation := v_explanation || ' Há vaga disponível.';
      end if;
    end if;

    if nullif(trim(v_opportunity.source_channel), '') is not null then
      v_confidence := v_confidence + 10;
    end if;

    v_score := greatest(1, least(99, v_score));
    v_confidence := greatest(20, least(100, v_confidence));
  end if;

  update public.enrollment_opportunities
  set probability_score = v_score,
      data_confidence = v_confidence,
      score_explanation = v_explanation
  where id = p_opportunity_id;

  return jsonb_build_object(
    'opportunity_id', p_opportunity_id,
    'probability_score', v_score,
    'data_confidence', v_confidence,
    'explanation', v_explanation
  );
end;
$function$;


-- A Ana registra somente um pedido de visita confirmado pela família.
-- A secretaria confere disponibilidade e marca "confirmada" na agenda.
create or replace function public.register_ana_school_visit(
  p_lead_id uuid,
  p_opportunity_id uuid,
  p_scheduled_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stage text;
  v_visit_id uuid;
begin
  if p_scheduled_at is null or not isfinite(p_scheduled_at) or p_scheduled_at < now() + interval '1 hour' then
    raise exception 'Data e horário da visita inválidos';
  end if;

  -- Impede que mensagens repetidas criem duas visitas ou avancem duas vezes no funil.
  perform 1 from public.leads where id = p_lead_id for update;
  if not found then raise exception 'Contato não encontrado'; end if;

  select stage into v_stage from public.enrollment_opportunities
  where id = p_opportunity_id and legacy_lead_id = p_lead_id for update;
  if not found or v_stage in ('matriculado', 'perdido') then
    raise exception 'Oportunidade ativa do contato não encontrada';
  end if;

  select id into v_visit_id from public.school_visits
  where opportunity_id = p_opportunity_id
    and status in ('agendada', 'confirmada', 'reagendada')
  order by created_at desc limit 1;
  if v_visit_id is not null then
    if exists (select 1 from public.school_visits
      where id = v_visit_id and scheduled_at = p_scheduled_at) then
      return v_visit_id;
    end if;
    raise exception 'Já existe visita ativa para este aluno; secretaria deve revisar ou reagendar';
  end if;

  insert into public.school_visits(opportunity_id, scheduled_at, follow_up_notes)
  values (p_opportunity_id, p_scheduled_at,
    'Solicitada pela família à atendente virtual; secretaria deve confirmar disponibilidade.')
  returning id into v_visit_id;

  update public.enrollment_opportunities set
    stage = 'visita_agendada', probability_score = greatest(probability_score, 65),
    next_action = 'Secretaria: confirmar disponibilidade da visita',
    next_action_at = now(), status_updated_at = now(), updated_at = now()
  where id = p_opportunity_id;

  insert into public.enrollment_stage_history(
    opportunity_id, previous_stage, new_stage, next_action, next_action_at, changed_by
  ) values (
    p_opportunity_id, v_stage, 'visita_agendada',
    'Secretaria: confirmar disponibilidade da visita', now(), null
  );
  return v_visit_id;
end;
$$;

revoke all on function public.register_ana_school_visit(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.register_ana_school_visit(uuid,uuid,timestamptz) to service_role;
