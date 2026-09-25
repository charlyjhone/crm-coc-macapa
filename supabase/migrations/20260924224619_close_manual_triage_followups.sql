-- Fechar a fila manualmente também encerra lembretes pendentes.
create or replace function public.close_resolved_triage_followups()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog
as $function$
begin
  if new.triage_status = 'resolvido' and old.triage_status is distinct from 'resolvido' then
    new.resolved_at := coalesce(new.resolved_at, now());
    new.handoff_at := null;
    new.handoff_reason := null;
    update public.ana_followups set status='cancelled', cancel_reason='resolved', processed_at=now()
    where lead_id=new.id and status in ('pending','processing');
  end if;
  return new;
end;
$function$;
revoke all on function public.close_resolved_triage_followups() from public, anon, authenticated;
create trigger trg_close_resolved_triage_followups before update of triage_status on public.leads
for each row execute function public.close_resolved_triage_followups();
