-- Cadastro idempotente de interesse escolar confirmado na conversa da Ana.
-- A função só pode ser chamada pelo service_role da Edge Function.
create or replace function public.register_ana_enrollment(
  p_lead_id uuid,
  p_guardian_name text,
  p_student_name text,
  p_academic_year integer,
  p_desired_grade text,
  p_desired_shift text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_guardian_id uuid;
  v_student_id uuid;
  v_opportunity_id uuid;
  v_created boolean := false;
begin
  if nullif(btrim(p_guardian_name), '') is null or
     nullif(btrim(p_student_name), '') is null or
     nullif(btrim(p_desired_grade), '') is null or
     p_academic_year not between 2026 and 2100 or
     length(btrim(p_guardian_name)) > 160 or
     length(btrim(p_student_name)) > 160 or
     length(btrim(p_desired_grade)) > 80 then
    raise exception 'Dados insuficientes para cadastro';
  end if;

  -- Serializa chamadas repetidas para o mesmo contato (inclusive retry do webhook).
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found or nullif(regexp_replace(coalesce(v_lead.phone, ''), '\D', '', 'g'), '') is null then
    raise exception 'Contato com telefone não encontrado';
  end if;

  select id into v_guardian_id from public.guardians
  where legacy_lead_id = p_lead_id
  order by created_at limit 1;
  if v_guardian_id is null then
    select id into v_guardian_id from public.guardians
    where regexp_replace(coalesce(phone, ''), '\D', '', 'g') =
          regexp_replace(v_lead.phone, '\D', '', 'g')
    limit 1;
  end if;

  if v_guardian_id is null then
    insert into public.guardians(full_name, phone, email, legacy_lead_id)
    values (btrim(p_guardian_name), v_lead.phone, v_lead.email, p_lead_id)
    returning id into v_guardian_id;
  elsif exists (
    select 1 from public.guardians where id = v_guardian_id
      and lower(btrim(full_name)) <> lower(btrim(p_guardian_name))
  ) then
    raise exception 'Responsável já cadastrado com outro nome; revisão pela secretaria necessária';
  else
    update public.guardians set legacy_lead_id = coalesce(legacy_lead_id, p_lead_id)
    where id = v_guardian_id;
  end if;

  select s.id into v_student_id
  from public.students s join public.student_guardians sg on sg.student_id = s.id
  where sg.guardian_id = v_guardian_id
    and lower(btrim(s.full_name)) = lower(btrim(p_student_name))
  order by s.created_at limit 1;
  if v_student_id is null then
    insert into public.students(full_name) values (btrim(p_student_name))
    returning id into v_student_id;
    insert into public.student_guardians(student_id, guardian_id, relationship, is_primary)
    values (v_student_id, v_guardian_id, 'responsável', true);
  end if;

  select id into v_opportunity_id from public.enrollment_opportunities
  where student_id = v_student_id and academic_year = p_academic_year
    and lower(btrim(desired_grade)) = lower(btrim(p_desired_grade))
    and coalesce(desired_shift, '') = coalesce(nullif(btrim(p_desired_shift), ''), '')
  order by created_at limit 1;
  if v_opportunity_id is null then
    insert into public.enrollment_opportunities(
      student_id, primary_guardian_id, legacy_lead_id, academic_year,
      desired_grade, desired_shift, source_channel, next_action, next_action_at
    ) values (
      v_student_id, v_guardian_id, p_lead_id, p_academic_year,
      btrim(p_desired_grade), nullif(btrim(p_desired_shift), ''),
      'ana_whatsapp', 'Secretaria: confirmar interesse e próximos passos', now()
    ) returning id into v_opportunity_id;
    v_created := true;
  end if;

  return jsonb_build_object('guardian_id', v_guardian_id,
    'student_id', v_student_id, 'opportunity_id', v_opportunity_id,
    'created', v_created);
end;
$$;

revoke all on function public.register_ana_enrollment(uuid,text,text,integer,text,text) from public, anon, authenticated;
grant execute on function public.register_ana_enrollment(uuid,text,text,integer,text,text) to service_role;
