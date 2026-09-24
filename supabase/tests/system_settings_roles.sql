-- Teste transacional em homologação/produção: exige um admin e um user existentes.
-- Usa chave técnica temporária e ROLLBACK. Não altera configurações escolares.
begin;
do $test$
declare admin_id uuid; user_id uuid; affected integer;
begin
 select r.user_id into strict admin_id from public.user_roles r where role='admin' limit 1;
 select r.user_id into strict user_id from public.user_roles r where role='user' limit 1;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 set local role authenticated;
 insert into public.system_settings(key,value) values ('__rls_test_20260924__','admin_insert');
 update public.system_settings set value='admin_update' where key='__rls_test_20260924__';
 get diagnostics affected = row_count;
 if affected<>1 then raise exception 'Admin update failed'; end if;
 reset role;
 perform set_config('request.jwt.claim.sub',user_id::text,true);
 set local role authenticated;
 begin
  insert into public.system_settings(key,value) values ('__rls_test_user_20260924__','denied');
  raise exception 'User insert was allowed';
 exception when insufficient_privilege then null;
 end;
 update public.system_settings set value='forbidden' where key='__rls_test_20260924__';
 get diagnostics affected = row_count;
 if affected<>0 then raise exception 'User update was allowed'; end if;
 begin
  insert into public.system_settings(key,value) values ('__rls_test_20260924__','forbidden') on conflict(key) do update set value=excluded.value;
  raise exception 'User upsert was allowed';
 exception when insufficient_privilege then null;
 end;
 reset role;
end $test$;
select 'PASS: admin insert/update; user insert/update/upsert denied; all changes rolled back' as result;
rollback;

