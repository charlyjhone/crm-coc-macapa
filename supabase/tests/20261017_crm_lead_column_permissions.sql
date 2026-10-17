-- Run in the COC database. All changes are rolled back at the end.
begin;
do $test$
declare
  v_actor uuid;
  v_lead uuid;
begin
  select user_id into v_actor
  from public.user_roles
  where role::text in ('admin', 'user')
  limit 1;
  if v_actor is null then
    raise exception 'Não existe usuário do CRM para testar as permissões';
  end if;

  if has_table_privilege('authenticated', 'public.leads', 'INSERT')
     or has_table_privilege('authenticated', 'public.leads', 'UPDATE')
     or has_table_privilege('authenticated', 'public.leads', 'DELETE') then
    raise exception 'Leads ainda permite escrita ampla no nível da tabela';
  end if;
  if not has_column_privilege('authenticated', 'public.leads', 'status', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.leads', 'triage_status', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.leads', 'resolved_at', 'UPDATE')
     or has_column_privilege('authenticated', 'public.leads', 'phone', 'UPDATE')
     or has_column_privilege('authenticated', 'public.leads', 'name', 'UPDATE') then
    raise exception 'Privilégios por coluna incorretos';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('role','authenticated','sub',v_actor)::text, true);
  execute 'set local role authenticated';

  select id into v_lead
  from public.leads
  where status::text not in ('resolvido', 'matriculado')
    and triage_status <> 'resolvido'
  limit 1;
  if v_lead is null then
    raise exception 'Não existe lead elegível para teste transacional';
  end if;

  update public.leads set status = 'em_atendimento' where id = v_lead;
  update public.leads set triage_status = 'em_atendimento' where id = v_lead;

  begin
    update public.leads set status = 'resolvido' where id = v_lead;
    raise exception 'A transição direta para resolvido deveria ter sido bloqueada';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.leads set triage_status = 'resolvido' where id = v_lead;
    raise exception 'A transição direta de triagem para resolvido deveria ter sido bloqueada';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.leads set status = 'matriculado' where id = v_lead;
    raise exception 'A transição direta para matriculado deveria ter sido bloqueada';
  exception when insufficient_privilege then
    null;
  end;
end;
$test$;
rollback;