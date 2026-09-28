-- Trilha de auditoria das alterações feitas por usuários autenticados no CRM.
-- O histórico registra quem, quando, tabela, registro e nomes dos campos; não
-- copia valores pessoais de famílias, alunos, mensagens ou configurações.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  schema_name text not null,
  table_name text not null,
  record_id text,
  entity_label text,
  changed_fields text[] not null default '{}'::text[],
  outcome text not null default 'success' check (outcome in ('started', 'success', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);
create index if not exists audit_logs_actor_created_at_idx
  on public.audit_logs (actor_id, created_at desc);

alter table public.audit_logs enable row level security;
revoke all on table public.audit_logs from public, anon, authenticated;
grant select on table public.audit_logs to authenticated;
grant select, insert, update on table public.audit_logs to service_role;

drop policy if exists "Administrators read audit logs" on public.audit_logs;
create policy "Administrators read audit logs"
  on public.audit_logs
  for select
  to authenticated
  using (public.is_admin((select auth.uid())));

create schema if not exists audit_private;
revoke all on schema audit_private from public, anon, authenticated;

create or replace function audit_private.capture_audit_log()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_actor_id uuid;
  v_actor_email text;
  v_record_id text;
  v_changed_fields text[];
begin
  v_actor_id := auth.uid();

  -- Integrações e rotinas de serviço não têm usuário humano no JWT. As ações
  -- administrativas de Auth são registradas explicitamente pela Edge Function.
  if v_actor_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;

  select case
      when count(*) = 1 and max(a.attname) = 'id'
        then max(coalesce(v_new ->> a.attname, v_old ->> a.attname))
      else jsonb_object_agg(a.attname, coalesce(v_new -> a.attname, v_old -> a.attname) order by k.ordinality)::text
    end
    into v_record_id
  from pg_index i
  cross join lateral unnest(i.indkey) with ordinality as k(attnum, ordinality)
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = tg_relid
    and i.indisprimary;

  if tg_op = 'INSERT' then
    select coalesce(array_agg(field_name order by field_name), '{}'::text[])
      into v_changed_fields
    from jsonb_object_keys(v_new) as fields(field_name);
  elsif tg_op = 'DELETE' then
    select coalesce(array_agg(field_name order by field_name), '{}'::text[])
      into v_changed_fields
    from jsonb_object_keys(v_old) as fields(field_name);
  else
    select coalesce(array_agg(field_name order by field_name), '{}'::text[])
      into v_changed_fields
    from (
      select jsonb_object_keys(v_old) as field_name
      union
      select jsonb_object_keys(v_new) as field_name
    ) as fields
    where v_old -> field_name is distinct from v_new -> field_name;
  end if;

  v_actor_email := auth.jwt() ->> 'email';

  insert into public.audit_logs (
    actor_id, actor_email, operation, schema_name, table_name, record_id,
    changed_fields, outcome
  ) values (
    v_actor_id, v_actor_email, tg_op, tg_table_schema, tg_table_name,
    v_record_id, v_changed_fields, 'success'
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

do $$
declare
  v_table record;
  v_events text;
begin
  for v_table in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname not in ('audit_logs', 'user_presence')
  loop
    -- activity_log já é uma linha do tempo de eventos; auditar apenas edição
    -- e remoção evita duplicar cada atividade normal do sistema.
    v_events := case
      when v_table.relname = 'activity_log' then 'UPDATE OR DELETE'
      else 'INSERT OR UPDATE OR DELETE'
    end;

    execute format('drop trigger if exists capture_audit_log on public.%I', v_table.relname);
    execute format(
      'create trigger capture_audit_log after %s on public.%I for each row execute function audit_private.capture_audit_log()',
      v_events,
      v_table.relname
    );
  end loop;
end;
$$;

-- A função só é invocada pelos gatilhos criados acima; não é uma RPC pública.
revoke all on function audit_private.capture_audit_log() from public, anon, authenticated, service_role;
