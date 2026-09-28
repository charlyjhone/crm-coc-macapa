-- Pré-voo somente leitura da trilha de auditoria.
-- Execute depois de aplicar a migration 20260928191018_add_profile_audit_logs.sql.

do $$
declare
  v_missing_tables text[];
  v_missing_triggers text[];
begin
  if to_regclass('public.audit_logs') is null then
    raise exception 'Tabela public.audit_logs ausente';
  end if;

  if to_regprocedure('audit_private.capture_audit_log()') is null then
    raise exception 'Função interna de auditoria ausente';
  end if;

  if has_schema_privilege('authenticated', 'audit_private', 'USAGE')
     or has_function_privilege('authenticated', 'audit_private.capture_audit_log()', 'EXECUTE') then
    raise exception 'A função de captura não deve ser acessível como RPC';
  end if;

  if not exists (
    select 1 from pg_class
    where oid = 'public.audit_logs'::regclass
      and relrowsecurity
  ) then
    raise exception 'RLS não está habilitada em public.audit_logs';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and policyname = 'Administrators read audit logs'
      and cmd = 'SELECT'
      and roles @> array['authenticated']::name[]
  ) then
    raise exception 'Política de leitura administrativa ausente';
  end if;

  if has_table_privilege('authenticated', 'public.audit_logs', 'INSERT')
     or has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.audit_logs', 'DELETE') then
    raise exception 'Usuários autenticados não devem alterar a própria trilha';
  end if;

  if has_table_privilege('anon', 'public.audit_logs', 'SELECT') then
    raise exception 'A trilha não deve ser lida por usuários anônimos';
  end if;

  if not has_table_privilege('service_role', 'public.audit_logs', 'INSERT')
     or not has_table_privilege('service_role', 'public.audit_logs', 'UPDATE') then
    raise exception 'A Edge Function precisa gravar eventos de gerenciamento de contas';
  end if;

  select array_agg(c.relname order by c.relname)
    into v_missing_triggers
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and c.relname not in ('audit_logs', 'user_presence')
    and not exists (
      select 1
      from pg_trigger t
      where t.tgrelid = c.oid
        and t.tgname = 'capture_audit_log'
        and not t.tgisinternal
        and t.tgenabled = 'O'
    );

  if v_missing_triggers is not null then
    raise exception 'Gatilho de auditoria ausente em: %', array_to_string(v_missing_triggers, ', ');
  end if;

  if exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.user_presence'::regclass
      and t.tgname = 'capture_audit_log'
      and not t.tgisinternal
  ) then
    raise exception 'user_presence não deve gerar auditoria a cada ping de navegação';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.activity_log'::regclass
      and t.tgname = 'capture_audit_log'
      and not t.tgisinternal
      and (t.tgtype & 4) = 0
      and (t.tgtype & 16) <> 0
      and (t.tgtype & 8) <> 0
  ) then
    raise exception 'activity_log deve auditar edições e exclusões, mas não cada nova atividade';
  end if;
end;
$$;

select
  count(*) as eventos_auditados,
  count(*) filter (where operation = 'INSERT') as criacoes,
  count(*) filter (where operation = 'UPDATE') as alteracoes,
  count(*) filter (where operation = 'DELETE') as exclusoes,
  count(*) filter (where outcome <> 'success') as operacoes_incompletas
from public.audit_logs;
