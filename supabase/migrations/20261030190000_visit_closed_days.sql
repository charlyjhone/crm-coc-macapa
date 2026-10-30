-- Dias sem expediente (feriados, recesso) também ficam fora da agenda de visitas.
-- Lidos de system_settings.escola_dias_sem_visita (DD/MM/AAAA ou AAAA-MM-DD,
-- separados por vírgula, ponto e vírgula ou quebra de linha).
create or replace function public.is_school_closed_for_visit(p_date date)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select extract(isodow from p_date) not between 1 and 5
    or exists (
      select 1
      from public.system_settings s,
           lateral regexp_split_to_table(coalesce(s.value, ''), '[,;\n]+') as part(raw)
      where s.key = 'escola_dias_sem_visita'
        and (
          (btrim(part.raw) ~ '^\d{4}-\d{2}-\d{2}$' and btrim(part.raw)::date = p_date)
          or (btrim(part.raw) ~ '^\d{1,2}/\d{1,2}/\d{4}$' and to_date(btrim(part.raw), 'DD/MM/YYYY') = p_date)
        )
    );
$$;

create or replace function public.get_ana_available_visit_slots(p_date date)
 returns table(slot_at timestamp with time zone, slot_time text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if p_date is null or public.is_school_closed_for_visit(p_date) then
    return;
  end if;

  return query
  with candidates as (
    select ((p_date::timestamp + make_interval(hours => h.hour, mins => m.minute))
      at time zone 'America/Belem') as candidate_at
    from generate_series(8, 17) as h(hour)
    cross join (values (0), (30)) as m(minute)
  )
  select c.candidate_at,
         to_char(c.candidate_at at time zone 'America/Belem', 'HH24:MI')
  from candidates c
  where c.candidate_at >= now() + interval '60 minutes'
    and not exists (
      select 1
      from public.school_visits v
      where v.status in ('agendada', 'confirmada', 'reagendada')
        and v.scheduled_at < c.candidate_at + interval '30 minutes'
        and v.scheduled_at + interval '30 minutes' > c.candidate_at
    )
  order by c.candidate_at;
end;
$function$;

revoke all on function public.is_school_closed_for_visit(date) from public, anon;
grant execute on function public.is_school_closed_for_visit(date) to authenticated, service_role;
