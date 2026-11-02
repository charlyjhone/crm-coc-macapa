-- Marca a origem do LEAD (não só da oportunidade) quando ele veio de anúncio Click-to-WhatsApp.
-- Nunca sobrescreve uma origem já preenchida. Falhas nunca bloqueiam a mensagem nem a Ana.
-- Backup feito antes em schema backup_20261102 (leads, enrollment_opportunities, lead_ad_referrals, function_defs, triggers).

create or replace function public.apply_ad_referral_to_lead(p_phone_digits text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ref public.lead_ad_referrals%rowtype;
  v_count integer := 0;
begin
  select * into v_ref from public.lead_ad_referrals where phone_digits = p_phone_digits;
  if not found or v_ref.source_app not in ('instagram', 'facebook') then return 0; end if;
  update public.leads l
     set origem = 'anuncio_' || v_ref.source_app
   where public.ad_phone_digits(l.phone) = p_phone_digits
     and coalesce(l.origem, '') = '';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.apply_ad_referral_to_lead(text) from public, anon, authenticated;

create or replace function public.capture_whatsapp_ad_referral()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ad jsonb := new.raw_data -> 'externalAdReply';
  v_phone text := public.ad_phone_digits(new.phone);
  v_app text;
begin
  if new.direction <> 'inbound' or v_ad is null or jsonb_typeof(v_ad) <> 'object'
     or coalesce(v_ad ->> 'sourceType', '') <> 'ad' or v_phone is null then
    return new;
  end if;
  v_app := case lower(coalesce(v_ad ->> 'sourceApp', '')) when 'instagram' then 'instagram' when 'facebook' then 'facebook' else 'outro' end;
  insert into public.lead_ad_referrals(phone_digits, source_app, ad_id, ad_headline, ad_body, first_message, ctwa_clid, first_at)
  values (v_phone, v_app, v_ad ->> 'sourceId', public.ad_headline(v_ad ->> 'body'), left(v_ad ->> 'body', 1000),
          left(new.message, 300), v_ad ->> 'ctwaClid', coalesce(new.timestamp, new.created_at, now()))
  on conflict (phone_digits) do nothing;
  perform public.apply_ad_referral_to_opportunities(v_phone);
  perform public.apply_ad_referral_to_lead(v_phone);
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.set_lead_ad_origin()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_app text;
begin
  if coalesce(new.origem, '') <> '' then return new; end if;
  select r.source_app into v_app from public.lead_ad_referrals r
   where r.phone_digits = public.ad_phone_digits(new.phone);
  if v_app in ('instagram', 'facebook') then
    new.origem := 'anuncio_' || v_app;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_set_lead_ad_origin on public.leads;
create trigger trg_set_lead_ad_origin
  before insert on public.leads
  for each row execute function public.set_lead_ad_origin();

update public.leads l
   set origem = 'anuncio_' || r.source_app
  from public.lead_ad_referrals r
 where r.phone_digits = public.ad_phone_digits(l.phone)
   and r.source_app in ('instagram', 'facebook')
   and coalesce(l.origem, '') = '';
