-- Layout novo (Proposta 2): classificar um contato do WhatsApp e corrigir a origem
-- de uma oportunidade, sem gravação direta do cliente nas tabelas escolares.
--
-- classify_school_contact: a secretaria informa responsável, aluno, série, turno,
-- origem e campanha; a função cria (ou reaproveita) responsável/aluno/oportunidade
-- vinculados ao contato original (legacy_lead_id). Não confirma matrícula.
-- set_opportunity_source: corrige origem e campanha de uma oportunidade existente.
-- Ambas exigem perfil admin ou Secretaria (user).

create or replace function public.classify_school_contact(
  p_lead_id uuid,
  p_guardian_name text,
  p_student_name text,
  p_academic_year integer,
  p_desired_grade text,
  p_desired_shift text default null,
  p_source_channel text default null,
  p_source_campaign text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_phone_digits text;
  v_guardian_id uuid;
  v_student_id uuid;
  v_opportunity_id uuid;
  v_reused boolean := false;
  v_source text := nullif(left(trim(coalesce(p_source_channel, '')), 60), '');
  v_campaign text := nullif(left(trim(coalesce(p_source_campaign, '')), 120), '');
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then
    raise exception 'Usuário não autorizado para classificar contatos';
  end if;

  if nullif(trim(p_guardian_name), '') is null
     or nullif(trim(p_student_name), '') is null
     or nullif(trim(p_desired_grade), '') is null then
    raise exception 'Responsável, aluno e série são obrigatórios';
  end if;
  if p_academic_year not between 2020 and 2100 then
    raise exception 'Ano letivo inválido';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Contato não encontrado';
  end if;

  v_phone_digits := regexp_replace(coalesce(v_lead.phone, ''), '\D', '', 'g');

  -- Mesmo contato e mesmo aluno: reaproveita a oportunidade ativa.
  select o.id, o.student_id, o.primary_guardian_id
    into v_opportunity_id, v_student_id, v_guardian_id
  from public.enrollment_opportunities o
  join public.students s on s.id = o.student_id
  where o.legacy_lead_id = p_lead_id
    and o.stage not in ('matriculado', 'perdido')
    and lower(trim(s.full_name)) = lower(trim(p_student_name))
  order by o.created_at desc
  limit 1
  for update of o;

  if v_opportunity_id is not null then
    v_reused := true;
    update public.enrollment_opportunities
       set desired_grade = trim(p_desired_grade),
           desired_shift = coalesce(nullif(trim(p_desired_shift), ''), desired_shift),
           academic_year = p_academic_year,
           source_channel = coalesce(v_source, source_channel),
           source_campaign = coalesce(v_campaign, source_campaign),
           updated_at = now()
     where id = v_opportunity_id;
  else
    if v_phone_digits <> '' then
      select id into v_guardian_id
      from public.guardians
      where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_phone_digits
      order by created_at
      limit 1;
    end if;

    if v_guardian_id is null then
      insert into public.guardians(full_name, phone, email, whatsapp_opt_in, created_by)
      values (trim(p_guardian_name), nullif(trim(coalesce(v_lead.phone, '')), ''),
              nullif(lower(trim(coalesce(v_lead.email, ''))), ''), false, auth.uid())
      returning id into v_guardian_id;
    end if;

    insert into public.students(full_name, created_by)
    values (trim(p_student_name), auth.uid())
    returning id into v_student_id;

    insert into public.student_guardians(student_id, guardian_id, relationship, is_primary, is_financially_responsible)
    values (v_student_id, v_guardian_id, 'responsável', true, true)
    on conflict do nothing;

    insert into public.enrollment_opportunities(
      student_id, primary_guardian_id, legacy_lead_id, academic_year, desired_grade,
      desired_shift, source_channel, source_campaign, next_action, next_action_at,
      created_by, assigned_to
    ) values (
      v_student_id, v_guardian_id, p_lead_id, p_academic_year, trim(p_desired_grade),
      nullif(trim(p_desired_shift), ''), coalesce(v_source, 'cadastro_manual'), v_campaign,
      'Agendar visita', now(), auth.uid(), auth.uid()
    ) returning id into v_opportunity_id;
  end if;

  -- O contato sai de "Novo": a secretaria já classificou.
  update public.leads
     set status = 'em_atendimento', updated_at = now()
   where id = p_lead_id and coalesce(status::text, 'novo') = 'novo';

  return jsonb_build_object(
    'guardian_id', v_guardian_id,
    'student_id', v_student_id,
    'opportunity_id', v_opportunity_id,
    'reused', v_reused
  );
end;
$$;

revoke all on function public.classify_school_contact(uuid,text,text,integer,text,text,text,text) from public, anon;
grant execute on function public.classify_school_contact(uuid,text,text,integer,text,text,text,text) to authenticated;

create or replace function public.set_opportunity_source(
  p_opportunity_id uuid,
  p_source_channel text,
  p_source_campaign text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := nullif(left(trim(coalesce(p_source_channel, '')), 60), '');
  v_campaign text := nullif(left(trim(coalesce(p_source_campaign, '')), 120), '');
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then
    raise exception 'Usuário não autorizado para alterar a origem';
  end if;
  if v_source is null then
    raise exception 'Informe a origem';
  end if;

  update public.enrollment_opportunities
     set source_channel = v_source,
         source_campaign = v_campaign,
         updated_at = now()
   where id = p_opportunity_id;
  if not found then
    raise exception 'Oportunidade não encontrada';
  end if;

  return jsonb_build_object('opportunity_id', p_opportunity_id, 'source_channel', v_source, 'source_campaign', v_campaign);
end;
$$;

revoke all on function public.set_opportunity_source(uuid,text,text) from public, anon;
grant execute on function public.set_opportunity_source(uuid,text,text) to authenticated;
