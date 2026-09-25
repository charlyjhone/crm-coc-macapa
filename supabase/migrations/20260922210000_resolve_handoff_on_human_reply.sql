-- Ao responder pelo WhatsApp da escola, o funcionário assume a conversa:
-- remove o contato da fila de espera e cancela o lembrete automático da Ana.

create or replace function public.resolve_handoff_on_human_whatsapp_reply()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
begin
  if new.direction <> 'outbound' then
    return new;
  end if;

  if coalesce(new.raw_data->>'sender_type', '') = 'ana'
     or coalesce(new.raw_data->>'source', '') = 'school-triage'
     or coalesce(new.message, '') like '*[Atendente Ana]*%' then
    return new;
  end if;

  update public.leads
  set triage_status = 'resolvido',
      resolved_at = coalesce(new.created_at, now()),
      handoff_at = null,
      handoff_reason = null
  where id in (select public.resolve_lead_ids_by_phone(new.phone))
    and triage_status = 'aguardando_secretaria';

  update public.ana_followups
  set status = 'cancelled',
      cancel_reason = 'human_replied',
      processed_at = coalesce(processed_at, now())
  where phone = new.phone
    and status in ('pending', 'processing');

  return new;
end;
$function$;

revoke execute on function public.resolve_handoff_on_human_whatsapp_reply()
from public, anon, authenticated;

drop trigger if exists trg_resolve_handoff_on_human_whatsapp_reply
on public.whatsapp_messages;

create trigger trg_resolve_handoff_on_human_whatsapp_reply
after insert on public.whatsapp_messages
for each row
execute function public.resolve_handoff_on_human_whatsapp_reply();
