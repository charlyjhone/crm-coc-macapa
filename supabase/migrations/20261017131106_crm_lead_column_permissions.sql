-- Limit browser writes to the contact status fields used by the UI.
-- Lead creation and all provider/AI metadata updates are performed server-side.

drop policy if exists "Leads INSERT autenticados" on public.leads;
drop policy if exists "Leads DELETE por produto" on public.leads;

revoke all privileges on table public.leads from public, anon, authenticated;
grant select on table public.leads to authenticated;
grant update (status, triage_status, resolved_at) on table public.leads to authenticated;

create or replace function public.prevent_client_terminal_lead_status()
returns trigger
language plpgsql
security invoker
set search_path = public
as $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated' then
    if new.status is distinct from old.status
       and (
         new.status::text in ('resolvido', 'matriculado')
         or old.status::text = 'matriculado'
       ) then
      raise exception using
        errcode = '42501',
        message = 'Use o fluxo oficial de atendimento ou funil para concluir ou confirmar matrícula';
    end if;

    if new.triage_status is distinct from old.triage_status
       and new.triage_status = 'resolvido' then
      raise exception using
        errcode = '42501',
        message = 'Conclua o atendimento pelo fluxo oficial para registrar a pesquisa de satisfação';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_prevent_client_terminal_lead_status on public.leads;
create trigger trg_prevent_client_terminal_lead_status
before update of status, triage_status on public.leads
for each row execute function public.prevent_client_terminal_lead_status();

-- Trigger functions are invoked by PostgreSQL, not through the client API.
revoke execute on function public.prevent_client_terminal_lead_status()
  from public, anon, authenticated;