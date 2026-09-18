-- Pré-voo do CRM escolar.
-- Execute no SQL Editor após aplicar a migração de homologação.
-- Somente leitura: nenhuma informação é criada, alterada ou removida.

do $$
declare
  v_missing text[];
begin
  select array_agg(required_name)
  into v_missing
  from (
    values
      ('public.school_units'),
      ('public.guardians'),
      ('public.students'),
      ('public.student_guardians'),
      ('public.enrollment_opportunities'),
      ('public.school_capacity'),
      ('public.school_visits'),
      ('public.enrollment_tasks'),
      ('public.enrollment_stage_history')
  ) required(required_name)
  where to_regclass(required_name) is null;

  if v_missing is not null then
    raise exception 'Tabelas ausentes: %', array_to_string(v_missing, ', ');
  end if;
end;
$$;

do $$
declare
  v_missing text[];
begin
  select array_agg(required_signature)
  into v_missing
  from (
    values
      ('public.create_school_enrollment(text,text,text,text,integer,text,text,boolean,text)'),
      ('public.update_enrollment_progress(uuid,text,text,timestamp with time zone,text)'),
      ('public.schedule_school_visit(uuid,timestamp with time zone,text,text)'),
      ('public.update_school_visit_status(uuid,text,text,text,text)'),
      ('public.create_enrollment_task(uuid,text,timestamp with time zone,text)'),
      ('public.complete_enrollment_task(uuid,text,timestamp with time zone,text)'),
      ('public.recompute_enrollment_score(uuid)'),
      ('public.recompute_all_enrollment_scores()')
  ) required(required_signature)
  where to_regprocedure(required_signature) is null;

  if v_missing is not null then
    raise exception 'Funções ausentes: %', array_to_string(v_missing, ', ');
  end if;
end;
$$;

do $$
declare
  v_missing text[];
begin
  select array_agg(required_trigger)
  into v_missing
  from (
    values
      ('refresh_score_after_visit'),
      ('refresh_score_after_task'),
      ('refresh_score_after_opportunity_change')
  ) required(required_trigger)
  where not exists (
    select 1
    from pg_trigger
    where tgname = required_trigger
      and not tgisinternal
  );

  if v_missing is not null then
    raise exception 'Gatilhos ausentes: %', array_to_string(v_missing, ', ');
  end if;
end;
$$;

do $$
declare
  v_without_rls text[];
begin
  select array_agg(c.relname)
  into v_without_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'school_units','guardians','students','student_guardians',
      'enrollment_opportunities','school_capacity','school_visits',
      'enrollment_tasks','enrollment_stage_history'
    )
    and not c.relrowsecurity;

  if v_without_rls is not null then
    raise exception 'RLS desabilitada em: %', array_to_string(v_without_rls, ', ');
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from public.enrollment_opportunities
    where probability_score not between 0 and 100
       or data_confidence not between 0 and 100
  ) then
    raise exception 'Há oportunidades com pontuação ou confiança inválida';
  end if;

  if exists (
    select 1 from public.school_capacity
    where reserved_seats + enrolled_seats > total_seats
  ) then
    raise exception 'Há turmas com ocupação acima da capacidade';
  end if;

  if exists (
    select 1
    from public.enrollment_opportunities o
    left join public.students s on s.id = o.student_id
    where s.id is null
  ) then
    raise exception 'Há oportunidade sem aluno relacionado';
  end if;
end;
$$;

select
  (select count(*) from public.guardians) as responsaveis,
  (select count(*) from public.students) as alunos,
  (select count(*) from public.enrollment_opportunities) as oportunidades,
  (select count(*) from public.school_visits) as visitas,
  (select count(*) from public.enrollment_tasks where status in ('pendente','em_andamento')) as tarefas_pendentes,
  (select count(*) from public.enrollment_opportunities where stage = 'matriculado') as matriculas,
  (select count(*) from public.enrollment_opportunities where probability_score >= 80 and stage not in ('matriculado','perdido')) as alta_possibilidade;
