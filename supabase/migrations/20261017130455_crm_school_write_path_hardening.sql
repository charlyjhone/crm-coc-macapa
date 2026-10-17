-- Route school CRM mutations through validated RPCs / trusted Edge Functions.
-- This prevents direct browser writes from bypassing funnel, visit, and message-history invariants.

create or replace function public.refresh_related_enrollment_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_opportunity_id uuid;
begin
  if tg_op = 'DELETE' then
    v_opportunity_id := old.opportunity_id;
  else
    v_opportunity_id := new.opportunity_id;
  end if;

  -- Deleting an opportunity cascades to its visits. At that point the parent
  -- opportunity may already be gone; do not try to recalculate a deleted row.
  if v_opportunity_id is not null
     and exists (
       select 1
       from public.enrollment_opportunities
       where id = v_opportunity_id
     ) then
    perform public.recompute_enrollment_score(v_opportunity_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

-- Trigger functions are invoked by PostgreSQL, not by the client API.
revoke execute on function public.refresh_related_enrollment_score()
  from public, anon, authenticated;

-- The school UI reads these tables but performs mutations through SECURITY
-- DEFINER RPCs (manual family registration, funnel progression, visit workflow,
-- and task workflow) or trusted service-role Edge Functions.
-- Keep SELECT for authenticated CRM staff; remove browser write privileges.
drop policy if exists crm_v2_insert on public.guardians;
drop policy if exists crm_v2_update on public.guardians;
drop policy if exists crm_v2_delete on public.guardians;

drop policy if exists crm_v2_insert on public.students;
drop policy if exists crm_v2_update on public.students;
drop policy if exists crm_v2_delete on public.students;

drop policy if exists crm_v2_insert on public.student_guardians;
drop policy if exists crm_v2_update on public.student_guardians;
drop policy if exists crm_v2_delete on public.student_guardians;

drop policy if exists crm_v2_insert on public.enrollment_opportunities;
drop policy if exists crm_v2_update on public.enrollment_opportunities;
drop policy if exists crm_v2_delete on public.enrollment_opportunities;

drop policy if exists crm_v2_insert on public.school_visits;
drop policy if exists crm_v2_update on public.school_visits;
drop policy if exists crm_v2_delete on public.school_visits;

drop policy if exists crm_v2_insert on public.enrollment_tasks;
drop policy if exists crm_v2_update on public.enrollment_tasks;
drop policy if exists crm_v2_delete on public.enrollment_tasks;

drop policy if exists "Activity INSERT" on public.activity_log;
drop policy if exists "Activity DELETE admin" on public.activity_log;

drop policy if exists "WA INSERT autenticado" on public.whatsapp_messages;
drop policy if exists "WA UPDATE autenticados" on public.whatsapp_messages;
drop policy if exists "WA DELETE admin" on public.whatsapp_messages;

drop policy if exists "Email INSERT autenticado" on public.email_messages;
drop policy if exists "Email UPDATE autenticados" on public.email_messages;
drop policy if exists "Email DELETE admin" on public.email_messages;

drop policy if exists "Attach INSERT" on public.email_attachments;
drop policy if exists "Attach UPDATE" on public.email_attachments;
drop policy if exists "Attach DELETE admin" on public.email_attachments;

drop policy if exists "Delivery INSERT" on public.delivery_logs;

revoke all privileges on table
  public.guardians,
  public.students,
  public.student_guardians,
  public.enrollment_opportunities,
  public.school_visits,
  public.enrollment_tasks,
  public.activity_log,
  public.whatsapp_messages,
  public.email_messages,
  public.email_attachments,
  public.delivery_logs
from public, anon, authenticated;

grant select on table
  public.guardians,
  public.students,
  public.student_guardians,
  public.enrollment_opportunities,
  public.school_visits,
  public.enrollment_tasks,
  public.activity_log,
  public.whatsapp_messages,
  public.email_messages,
  public.email_attachments,
  public.delivery_logs
to authenticated;