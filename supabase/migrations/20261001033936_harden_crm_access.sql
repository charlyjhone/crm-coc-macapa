-- Only CRM operators may use the school records. Frontend routes do not grant
-- access to PostgREST; the role check must also live in the database.
create or replace function public.user_can_access_lead(_user_id uuid, _lead_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $function$
  select _user_id is not null
    and _user_id = (select auth.uid())
    and (
      public.has_role(_user_id, 'admin'::public.app_role)
      or public.has_role(_user_id, 'user'::public.app_role)
    )
    and exists (select 1 from public.leads where id = _lead_id)
$function$;

-- Keep the operational staff's current shared school access, while excluding
-- an authenticated account that has not been granted a CRM role.
alter policy "Leads INSERT autenticados" on public.leads
  to authenticated
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));
alter policy "Leads SELECT autenticados" on public.leads
  using (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));
alter policy "Leads UPDATE autenticados" on public.leads
  using (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role))
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));

alter policy "WA SELECT autenticados" on public.whatsapp_messages
  using (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));
alter policy "WA INSERT autenticado" on public.whatsapp_messages
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));
alter policy "WA UPDATE autenticados" on public.whatsapp_messages
  using (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role))
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));

alter policy "Email SELECT autenticados" on public.email_messages
  using (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));
alter policy "Email INSERT autenticado" on public.email_messages
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));
alter policy "Email UPDATE autenticados" on public.email_messages
  using (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role))
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));

alter policy "Activity SELECT autenticados" on public.activity_log
  using (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));
alter policy "Activity INSERT" on public.activity_log
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));

alter policy "Delivery INSERT" on public.delivery_logs
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));
alter policy "Attach INSERT" on public.email_attachments
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));
alter policy "Meet INSERT" on public.meetings
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));
alter policy "Followup INSERT" on public.scheduled_followups
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));
alter policy "Worker INSERT" on public.worker_actions
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));

-- Old commercial prompt templates are not exposed in the school UI.
alter policy "Authenticated users can read prompt templates" on public.prompt_templates
  to authenticated using (public.is_admin((select auth.uid())));
alter policy "Authenticated users can insert prompt templates" on public.prompt_templates
  to authenticated with check (public.is_admin((select auth.uid())));
alter policy "Authenticated users can update prompt templates" on public.prompt_templates
  to authenticated using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));
alter policy "Authenticated users can delete prompt templates" on public.prompt_templates
  to authenticated using (public.is_admin((select auth.uid())));

alter policy "Authenticated users can read settings" on public.system_settings
  to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));

drop policy if exists authenticated_access on public.school_capacity;
create policy school_capacity_read on public.school_capacity for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));
create policy school_capacity_write on public.school_capacity for all to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

drop policy if exists authenticated_access on public.school_units;
create policy school_units_read on public.school_units for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));
create policy school_units_write on public.school_units for all to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

-- Stage history is generated by the CRM's privileged RPCs, not by clients.
drop policy if exists authenticated_access on public.enrollment_stage_history;
create policy enrollment_stage_history_read on public.enrollment_stage_history for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'user'::public.app_role));
revoke insert, update, delete on public.enrollment_stage_history from anon, authenticated;

-- This legacy trigger posts old commercial statuses to a public endpoint.
-- School statuses already do not match its handler; avoid further calls.
drop trigger if exists trg_notify_status_change_email on public.leads;

-- Dedicated, high-entropy callback credential. Never place it in source,
-- frontend settings or documentation. The provider will receive it only in its
-- private callback configuration and the backend will compare it in Vault.
do $migration$
begin
  if not exists (select 1 from vault.secrets where name = 'zapi_webhook_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'zapi_webhook_secret',
      'Z-API callback URL credential for the school CRM'
    );
  end if;
end;
$migration$;

create or replace function public.verify_zapi_webhook_secret(p_secret text)
returns boolean language sql stable security definer set search_path = pg_catalog
as $function$
  select coalesce(nullif(p_secret, '') is not null and exists (
    select 1 from vault.decrypted_secrets
    where name = 'zapi_webhook_secret' and decrypted_secret = p_secret
  ), false)
$function$;

create or replace function public.get_zapi_webhook_secret()
returns text language sql stable security definer set search_path = pg_catalog
as $function$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'zapi_webhook_secret' limit 1
$function$;

revoke all on function public.verify_zapi_webhook_secret(text) from public, anon, authenticated;
revoke all on function public.get_zapi_webhook_secret() from public, anon, authenticated;
grant execute on function public.verify_zapi_webhook_secret(text) to service_role;
grant execute on function public.get_zapi_webhook_secret() to service_role;
