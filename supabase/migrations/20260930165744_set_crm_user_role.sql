-- Troca de perfil atômica, disponível apenas para a função administrativa.
-- O frontend só precisa ler seu papel; toda alteração passa pela função auditada.
drop policy if exists "Admins manage roles" on public.user_roles;
revoke insert, update, delete on public.user_roles from authenticated;

create or replace function public.set_crm_user_role(
  p_user_id uuid,
  p_role public.app_role,
  p_actor_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_role not in ('admin'::public.app_role, 'user'::public.app_role) then
    raise exception 'Perfil inválido';
  end if;
  if p_actor_id = p_user_id then
    raise exception 'Altere seu próprio perfil por outro administrador';
  end if;
  perform pg_advisory_xact_lock(hashtext('crm_user_role_admin_guard'));
  if p_role = 'user'::public.app_role and
     exists (select 1 from public.user_roles where user_id = p_user_id and role = 'admin') and
     (select count(distinct user_id) from public.user_roles where role = 'admin') <= 1 then
    raise exception 'Não é possível remover o último administrador';
  end if;
  delete from public.user_roles where user_id = p_user_id and role <> p_role;
  insert into public.user_roles(user_id, role) values (p_user_id, p_role)
  on conflict (user_id, role) do nothing;
end;
$$;

revoke all on function public.set_crm_user_role(uuid,public.app_role,uuid) from public, anon, authenticated;
grant execute on function public.set_crm_user_role(uuid,public.app_role,uuid) to service_role;
