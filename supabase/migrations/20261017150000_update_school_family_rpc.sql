-- Permite editar responsaveis e alunos pela tela Famílias e alunos,
-- mantendo as gravacoes nas RPCs validadas e a trilha de auditoria existente.

create or replace function public.update_school_family(
  p_guardian_id uuid,
  p_full_name text,
  p_preferred_name text default null,
  p_email text default null,
  p_phone text default null,
  p_whatsapp_opt_in boolean default false,
  p_notes text default null,
  p_students jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guardian public.guardians%rowtype;
  v_item jsonb;
  v_student_id uuid;
  v_expected_students integer;
  v_received_students integer;
  v_updated_students integer := 0;
  v_phone_digits text;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then
    raise exception 'Usuário não autorizado para editar famílias';
  end if;

  if nullif(trim(p_full_name), '') is null then
    raise exception 'O nome completo do responsável é obrigatório';
  end if;

  if p_students is null or jsonb_typeof(p_students) <> 'array' then
    raise exception 'A lista de alunos enviada é inválida';
  end if;

  select * into v_guardian
  from public.guardians
  where id = p_guardian_id
  for update;

  if not found then
    raise exception 'Família não encontrada';
  end if;

  select count(*) into v_expected_students
  from public.student_guardians
  where guardian_id = p_guardian_id;

  v_received_students := jsonb_array_length(p_students);

  if v_received_students <> v_expected_students then
    raise exception 'A lista de alunos foi alterada. Atualize a tela e tente novamente';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_students) as entries(item)
    where nullif(item->>'id', '') is null
       or nullif(trim(coalesce(item->>'full_name', '')), '') is null
  ) then
    raise exception 'O nome de cada aluno é obrigatório';
  end if;

  if (
    select count(distinct item->>'id')
    from jsonb_array_elements(p_students) as entries(item)
  ) <> v_received_students then
    raise exception 'A lista contém alunos duplicados';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_students) as entries(item)
    where not exists (
      select 1
      from public.student_guardians sg
      where sg.guardian_id = p_guardian_id
        and sg.student_id = (item->>'id')::uuid
    )
  ) then
    raise exception 'Um ou mais alunos não pertencem a esta família';
  end if;

  v_phone_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

  if v_phone_digits <> '' and exists (
    select 1
    from public.guardians g
    where g.id <> p_guardian_id
      and regexp_replace(coalesce(g.phone, ''), '[^0-9]', '', 'g') = v_phone_digits
  ) then
    raise exception 'Este telefone já está cadastrado em outra família';
  end if;

  update public.guardians
  set full_name = trim(p_full_name),
      preferred_name = nullif(trim(coalesce(p_preferred_name, '')), ''),
      email = nullif(lower(trim(coalesce(p_email, ''))), ''),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      whatsapp_opt_in = coalesce(p_whatsapp_opt_in, false),
      consent_recorded_at = case
        when coalesce(p_whatsapp_opt_in, false) then
          case when v_guardian.whatsapp_opt_in
            then v_guardian.consent_recorded_at
            else now()
          end
        else null
      end,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      updated_at = now()
  where id = p_guardian_id;

  for v_item in select value from jsonb_array_elements(p_students)
  loop
    v_student_id := (v_item->>'id')::uuid;

    update public.students
    set full_name = trim(v_item->>'full_name'),
        preferred_name = nullif(trim(coalesce(v_item->>'preferred_name', '')), ''),
        birth_date = nullif(trim(coalesce(v_item->>'birth_date', '')), '')::date,
        current_school = nullif(trim(coalesce(v_item->>'current_school', '')), ''),
        notes = nullif(trim(coalesce(v_item->>'notes', '')), ''),
        updated_at = now()
    where id = v_student_id;

    v_updated_students := v_updated_students + 1;
  end loop;

  return jsonb_build_object(
    'guardian_id', p_guardian_id,
    'students_updated', v_updated_students
  );
end;
$$;

revoke all on function public.update_school_family(uuid,text,text,text,text,boolean,text,jsonb) from public, anon;
grant execute on function public.update_school_family(uuid,text,text,text,text,boolean,text,jsonb) to authenticated;
