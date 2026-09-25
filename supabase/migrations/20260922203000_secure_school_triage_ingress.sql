-- Restringe school-triage às chamadas internas do banco sem gravar segredos
-- no repositório. O valor é criado aleatoriamente e permanece criptografado
-- no Supabase Vault.

do $do$
begin
  if not exists (
    select 1 from vault.secrets where name = 'school_triage_webhook_secret'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'school_triage_webhook_secret',
      'Autenticação interna do trigger e cron da Ana'
    );
  end if;
end
$do$;

create or replace function public.verify_school_triage_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    nullif(p_secret, '') is not null
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'school_triage_webhook_secret'
        and decrypted_secret = p_secret
    ),
    false
  );
$function$;

revoke all on function public.verify_school_triage_secret(text) from public, anon, authenticated;
grant execute on function public.verify_school_triage_secret(text) to service_role;

create or replace function public.trigger_school_triage()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'net'
as $function$
declare
  v_url text := 'https://fenqnbzdjnyvgrmjczoi.supabase.co/functions/v1/school-triage';
  v_body jsonb;
  v_secret text;
begin
  if new.direction <> 'inbound' then
    return new;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'school_triage_webhook_secret';

  if v_secret is null then
    raise warning 'trigger_school_triage: internal secret is unavailable';
    return new;
  end if;

  if tg_table_name = 'whatsapp_messages' then
    v_body := jsonb_build_object(
      'channel', 'whatsapp',
      'message_id', new.id,
      'phone', new.phone,
      'text', new.message
    );
  else
    v_body := jsonb_build_object(
      'channel', 'email',
      'message_id', new.id,
      'lead_id', new.lead_id,
      'text', coalesce(new.message, new.subject)
    );
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-school-triage-secret', v_secret
    ),
    body := v_body,
    timeout_milliseconds := 20000
  );

  return new;
exception when others then
  raise warning 'trigger_school_triage failed: %', sqlerrm;
  return new;
end;
$function$;

revoke execute on function public.trigger_school_triage() from anon, authenticated, public;

do $do$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'ana-process-followups'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$do$;

select cron.schedule(
  'ana-process-followups',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://fenqnbzdjnyvgrmjczoi.supabase.co/functions/v1/school-triage',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-school-triage-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'school_triage_webhook_secret'
        )
      ),
      body := '{"action":"process_followups"}'::jsonb
    );
  $cron$
);
