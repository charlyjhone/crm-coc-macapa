-- Run in the COC database. All synthetic data is rolled back at the end.
begin;
do $test$
declare
  v_actor uuid;
  v_registration jsonb;
  v_opportunity uuid;
  v_visit uuid;
begin
  select user_id into v_actor
  from public.user_roles
  where role::text in ('admin', 'user')
  limit 1;
  if v_actor is null then
    raise exception 'Não existe usuário do CRM para testar as RPCs';
  end if;

  if has_table_privilege('authenticated', 'public.guardians', 'INSERT')
     or has_table_privilege('authenticated', 'public.enrollment_opportunities', 'UPDATE')
     or has_table_privilege('authenticated', 'public.school_visits', 'DELETE')
     or has_table_privilege('authenticated', 'public.whatsapp_messages', 'INSERT')
     or has_table_privilege('authenticated', 'public.activity_log', 'INSERT') then
    raise exception 'Ainda existe privilégio de escrita direta que deveria ter sido removido';
  end if;
  if not has_table_privilege('authenticated', 'public.guardians', 'SELECT')
     or not has_table_privilege('authenticated', 'public.school_visits', 'SELECT')
     or not has_table_privilege('authenticated', 'public.whatsapp_messages', 'SELECT') then
    raise exception 'A leitura legítima do CRM foi removida por engano';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('role','authenticated','sub',v_actor)::text, true);
  execute 'set local role authenticated';

  v_registration := public.create_school_enrollment(
    'Responsável Sintético Hardening',
    null,
    null,
    'Aluno Sintético Hardening',
    2027,
    '5º ano',
    'manhã',
    false,
    'cadastro_manual'
  );
  v_opportunity := (v_registration->>'opportunity_id')::uuid;
  if v_opportunity is null then
    raise exception 'RPC de cadastro não criou oportunidade';
  end if;

  v_visit := public.schedule_school_visit(
    v_opportunity,
    now() + interval '3 days',
    'Teste transacional',
    'Teste de exclusão em cascata'
  );
  if v_visit is null then
    raise exception 'RPC de visita não retornou ID';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  delete from public.enrollment_opportunities where id = v_opportunity;

  if exists(select 1 from public.school_visits where id = v_visit)
     or exists(select 1 from public.enrollment_opportunities where id = v_opportunity) then
    raise exception 'A exclusão em cascata não removeu a visita/oportunidade';
  end if;
end;
$test$;
rollback;