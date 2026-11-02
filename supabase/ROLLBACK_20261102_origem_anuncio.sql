-- Desfaz a migration 20261102183000_origem_anuncio_no_lead usando o backup_20261102.
begin;
drop trigger if exists trg_set_lead_ad_origin on public.leads;
drop function if exists public.set_lead_ad_origin();
drop function if exists public.apply_ad_referral_to_lead(text);
-- Restaura a função de captura original
do $$ declare d text; begin
  select definition into d from backup_20261102.function_defs where proname = 'capture_whatsapp_ad_referral';
  execute d;
end $$;
-- Restaura a origem dos leads como estava antes
update public.leads l set origem = b.origem from backup_20261102.leads b where b.id = l.id and l.origem is distinct from b.origem;
commit;
