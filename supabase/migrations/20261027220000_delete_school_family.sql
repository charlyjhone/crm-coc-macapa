-- Exclusão de família pela tela Famílias (só administradores).
-- Uma família é o mesmo grupo do cartão: responsáveis e alunos ligados entre si.
-- Apaga responsáveis, alunos, vínculos, interesses de matrícula e, em cascata,
-- visitas, tarefas e histórico de etapas. Conversas de WhatsApp e contatos
-- (leads) são mantidos; o vínculo com a família deixa de existir.
-- Cada exclusão fica registrada em audit_logs pelos gatilhos já existentes.
create or replace function public.delete_school_family(p_guardian_ids uuid[], p_student_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_guardians uuid[] := array(select distinct x from unnest(coalesce(p_guardian_ids, '{}'::uuid[])) as x where x is not null);
  v_students uuid[] := array(select distinct x from unnest(coalesce(p_student_ids, '{}'::uuid[])) as x where x is not null);
  v_opportunities integer := 0;
  v_visits integer := 0;
  v_students_deleted integer := 0;
  v_guardians_deleted integer := 0;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Somente administradores podem excluir famílias';
  end if;

  if cardinality(v_guardians) = 0 and cardinality(v_students) = 0 then
    raise exception 'Nenhuma família informada';
  end if;

  -- Serializa com outras alterações da mesma família.
  perform 1 from public.guardians where id = any(v_guardians) for update;
  perform 1 from public.students where id = any(v_students) for update;

  if (select count(*) from public.guardians where id = any(v_guardians)) <> cardinality(v_guardians)
     or (select count(*) from public.students where id = any(v_students)) <> cardinality(v_students) then
    raise exception 'Família não encontrada; atualize a página e tente de novo';
  end if;

  -- A família precisa estar fechada: nenhum aluno dela ligado a responsável de fora,
  -- nem responsável dela ligado a aluno de fora. Evita apagar parte de outra família.
  if exists (
    select 1 from public.student_guardians sg
    where (sg.student_id = any(v_students)) <> (sg.guardian_id = any(v_guardians))
  ) then
    raise exception 'A família mudou desde que a tela foi aberta; atualize a página e tente de novo';
  end if;

  select count(*) into v_visits
  from public.school_visits v
  join public.enrollment_opportunities o on o.id = v.opportunity_id
  where o.student_id = any(v_students);

  delete from public.enrollment_opportunities where student_id = any(v_students);
  get diagnostics v_opportunities = row_count;

  delete from public.students where id = any(v_students);
  get diagnostics v_students_deleted = row_count;

  delete from public.guardians where id = any(v_guardians);
  get diagnostics v_guardians_deleted = row_count;

  return jsonb_build_object(
    'guardians', v_guardians_deleted,
    'students', v_students_deleted,
    'opportunities', v_opportunities,
    'visits', v_visits
  );
end;
$$;

revoke all on function public.delete_school_family(uuid[], uuid[]) from public, anon;
grant execute on function public.delete_school_family(uuid[], uuid[]) to authenticated;
