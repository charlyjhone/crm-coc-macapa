-- Origem por anúncio "Clique para conversar no WhatsApp" (Meta).
-- A Z-API grava em whatsapp_messages.raw_data.externalAdReply os dados do anúncio
-- (sourceType = 'ad', sourceApp = instagram|facebook, sourceId = id do anúncio, body = texto do anúncio).
-- Esta migration:
--  1. guarda o primeiro anúncio de cada telefone em lead_ad_referrals;
--  2. marca a família no funil como anuncio_instagram/anuncio_facebook (+ campanha = 1ª frase do anúncio)
--     quando a origem ainda é genérica (ana_whatsapp, whatsapp, cadastro_manual ou vazia);
--  3. preenche o histórico desde o início dos anúncios.
-- Não altera leads, mensagens nem a Ana.

create table if not exists public.lead_ad_referrals (
  phone_digits text primary key,
  source_app text not null check (source_app in ('instagram', 'facebook', 'outro')),
  ad_id text,
  ad_headline text,
  ad_body text,
  first_message text,
  ctwa_clid text,
  first_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists lead_ad_referrals_ad_idx on public.lead_ad_referrals(ad_id);

alter table public.lead_ad_referrals enable row level security;
revoke all on table public.lead_ad_referrals from anon, authenticated;
grant select on table public.lead_ad_referrals to authenticated;
drop policy if exists "Anúncios: equipe lê" on public.lead_ad_referrals;
create policy "Anúncios: equipe lê" on public.lead_ad_referrals
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'user'::public.app_role));

-- Só dígitos, com DDI 55 quando vier sem.
create or replace function public.ad_phone_digits(p text)
returns text language sql immutable as $$
  select case
    when d = '' then null
    when length(d) in (10, 11) then '55' || d
    else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') d) x
$$;

-- Primeira frase do anúncio (até 70 caracteres) como nome da campanha.
create or replace function public.ad_headline(p_body text)
returns text language sql immutable as $$
  select nullif(left(trim(split_part(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'), '.', 1)), 70), '')
$$;

create or replace function public.apply_ad_referral_to_opportunities(p_phone_digits text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_ref public.lead_ad_referrals%rowtype;
  v_count integer := 0;
begin
  select * into v_ref from public.lead_ad_referrals where phone_digits = p_phone_digits;
  if not found or v_ref.source_app not in ('instagram', 'facebook') then return 0; end if;
  update public.enrollment_opportunities o
     set source_channel = 'anuncio_' || v_ref.source_app,
         source_campaign = coalesce(o.source_campaign, v_ref.ad_headline),
         updated_at = now()
    from public.leads l
   where o.legacy_lead_id = l.id
     and public.ad_phone_digits(l.phone) = p_phone_digits
     and coalesce(o.source_channel, '') in ('', 'ana_whatsapp', 'whatsapp', 'cadastro_manual');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.apply_ad_referral_to_opportunities(text) from public, anon, authenticated;

-- Ao chegar mensagem de anúncio: registra o anúncio (o primeiro vale) e corrige a origem no funil.
create or replace function public.capture_whatsapp_ad_referral()
returns trigger language plpgsql security definer set search_path = public as $$
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
  return new;
exception when others then
  -- Nunca bloquear o recebimento da mensagem por causa da origem.
  return new;
end;
$$;
revoke all on function public.capture_whatsapp_ad_referral() from public, anon, authenticated;

drop trigger if exists trg_capture_whatsapp_ad_referral on public.whatsapp_messages;
create trigger trg_capture_whatsapp_ad_referral
after insert on public.whatsapp_messages
for each row execute function public.capture_whatsapp_ad_referral();

-- Família cadastrada depois da mensagem (pela Ana ou pela secretaria): já nasce com a origem do anúncio.
create or replace function public.set_opportunity_ad_source()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ref public.lead_ad_referrals%rowtype;
begin
  if new.legacy_lead_id is null or coalesce(new.source_channel, '') not in ('', 'ana_whatsapp', 'whatsapp', 'cadastro_manual') then
    return new;
  end if;
  select r.* into v_ref
    from public.leads l join public.lead_ad_referrals r on r.phone_digits = public.ad_phone_digits(l.phone)
   where l.id = new.legacy_lead_id;
  if found and v_ref.source_app in ('instagram', 'facebook') then
    new.source_channel := 'anuncio_' || v_ref.source_app;
    new.source_campaign := coalesce(new.source_campaign, v_ref.ad_headline);
  end if;
  return new;
exception when others then
  return new;
end;
$$;
revoke all on function public.set_opportunity_ad_source() from public, anon, authenticated;

drop trigger if exists trg_set_opportunity_ad_source on public.enrollment_opportunities;
create trigger trg_set_opportunity_ad_source
before insert on public.enrollment_opportunities
for each row execute function public.set_opportunity_ad_source();

-- Histórico: primeiro anúncio de cada telefone.
insert into public.lead_ad_referrals(phone_digits, source_app, ad_id, ad_headline, ad_body, first_message, ctwa_clid, first_at)
select distinct on (public.ad_phone_digits(w.phone))
  public.ad_phone_digits(w.phone),
  case lower(coalesce(w.raw_data -> 'externalAdReply' ->> 'sourceApp', '')) when 'instagram' then 'instagram' when 'facebook' then 'facebook' else 'outro' end,
  w.raw_data -> 'externalAdReply' ->> 'sourceId',
  public.ad_headline(w.raw_data -> 'externalAdReply' ->> 'body'),
  left(w.raw_data -> 'externalAdReply' ->> 'body', 1000),
  left(w.message, 300),
  w.raw_data -> 'externalAdReply' ->> 'ctwaClid',
  coalesce(w.timestamp, w.created_at)
from public.whatsapp_messages w
where w.direction = 'inbound'
  and w.raw_data -> 'externalAdReply' ->> 'sourceType' = 'ad'
  and public.ad_phone_digits(w.phone) is not null
order by public.ad_phone_digits(w.phone), coalesce(w.timestamp, w.created_at)
on conflict (phone_digits) do nothing;

-- O recálculo da pontuação só aceita usuário da equipe ou o papel interno: o histórico roda como papel interno.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.apply_ad_referral_to_opportunities(phone_digits) from public.lead_ad_referrals;
