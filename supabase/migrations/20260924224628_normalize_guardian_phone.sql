-- Não altera dados; corrige a expressão do índice e da procura por responsável.
drop index if exists public.guardians_phone_unique;
create unique index guardians_phone_unique on public.guardians (regexp_replace(phone,'[^0-9]','','g')) where phone is not null and regexp_replace(phone,'[^0-9]','','g')<>'';

create or replace function public.create_school_enrollment(
  p_guardian_name text,
  p_guardian_phone text,
  p_guardian_email text,
  p_student_name text,
  p_academic_year integer,
  p_desired_grade text,
  p_desired_shift text default null,
  p_whatsapp_opt_in boolean default false,
  p_source_channel text default 'cadastro_manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guardian_id uuid;
  v_student_id uuid;
  v_opportunity_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;
  if nullif(trim(p_guardian_name), '') is null
     or nullif(trim(p_student_name), '') is null
     or nullif(trim(p_desired_grade), '') is null then
    raise exception 'Responsável, aluno e série são obrigatórios';
  end if;
  if p_academic_year not between 2020 and 2100 then
    raise exception 'Ano letivo inválido';
  end if;

  -- Serializa cadastros simultâneos do mesmo telefone dentro da transação.
  if nullif(regexp_replace(coalesce(p_guardian_phone,''),'[^0-9]','','g'),'') is not null then
    perform pg_advisory_xact_lock(hashtextextended(regexp_replace(p_guardian_phone,'[^0-9]','','g'),0));
  end if;

  select id into v_guardian_id
  from public.guardians
  where p_guardian_phone is not null
    and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') =
        regexp_replace(p_guardian_phone, '[^0-9]', '', 'g')
    and regexp_replace(p_guardian_phone, '[^0-9]', '', 'g') <> ''
  limit 1;

  if v_guardian_id is null then
    insert into public.guardians(
      full_name, phone, email, whatsapp_opt_in, consent_recorded_at, created_by
    ) values (
      trim(p_guardian_name), nullif(trim(p_guardian_phone), ''),
      nullif(lower(trim(p_guardian_email)), ''), p_whatsapp_opt_in,
      case when p_whatsapp_opt_in then now() else null end, auth.uid()
    ) returning id into v_guardian_id;
  end if;

  insert into public.students(full_name, created_by)
  values (trim(p_student_name), auth.uid())
  returning id into v_student_id;

  insert into public.student_guardians(
    student_id, guardian_id, relationship, is_primary, is_financially_responsible
  ) values (
    v_student_id, v_guardian_id, 'responsável', true, true
  );

  insert into public.enrollment_opportunities(
    student_id, primary_guardian_id, academic_year, desired_grade,
    desired_shift, source_channel, next_action, next_action_at,
    created_by, assigned_to
  ) values (
    v_student_id, v_guardian_id, p_academic_year, trim(p_desired_grade),
    nullif(trim(p_desired_shift), ''), p_source_channel,
    'Realizar primeiro contato', now(), auth.uid(), auth.uid()
  ) returning id into v_opportunity_id;

  return jsonb_build_object(
    'guardian_id', v_guardian_id,
    'student_id', v_student_id,
    'opportunity_id', v_opportunity_id
  );
end;
$$;

revoke all on function public.create_school_enrollment(text,text,text,text,integer,text,text,boolean,text) from public;
grant execute on function public.create_school_enrollment(text,text,text,text,integer,text,text,boolean,text) to authenticated;

