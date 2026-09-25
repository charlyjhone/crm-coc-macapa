-- Funções de trigger não devem ser endpoints RPC públicos.
-- A revogação não impede a execução automática pelos próprios triggers.

do $$
declare f record;
begin
  for f in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype = 'trigger'::regtype
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated',
      f.nspname, f.proname, f.args
    );
  end loop;
end $$;

-- Nenhuma função privilegiada é herdada por PUBLIC ou acessível a anônimos.
-- Usuários autenticados recebem explicitamente apenas as RPCs escolares e de
-- autorização usadas pelo frontend; utilitários internos ficam no service_role.
do $$
declare f record;
begin
  for f in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
  loop
    execute format('revoke all on function %I.%I(%s) from public, anon, authenticated', f.nspname, f.proname, f.args);
    execute format('grant execute on function %I.%I(%s) to service_role', f.nspname, f.proname, f.args);
    if f.proname in (
      'complete_enrollment_task', 'create_enrollment_task', 'create_school_enrollment',
      'schedule_school_visit', 'update_enrollment_progress', 'update_school_visit_status',
      'has_role', 'is_admin', 'user_can_access_lead', 'user_can_access_produto',
      'recompute_all_enrollment_scores', 'recompute_enrollment_score'
    ) then
      execute format('grant execute on function %I.%I(%s) to authenticated', f.nspname, f.proname, f.args);
    end if;
  end loop;
end $$;
