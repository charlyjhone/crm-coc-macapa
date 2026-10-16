-- Remove SOMENTE a família fictícia criada pela homologação visual de 16/10/2026.
-- Nenhum telefone ou e-mail foi associado; nenhum WhatsApp foi enviado.
-- Executar como administrador no projeto CRM COC (fenqnbzdjnyvgrmjczoi).
-- Histórico de auditoria é preservado. Reexecutar após limpeza não altera dados.
begin;
do $cleanup$
begin
  if not exists(select 1 from public.guardians where id='73fd616f-a16a-40b5-9f8d-9d2893ec94bc')
    and not exists(select 1 from public.students where id='cfdd233e-5d38-481d-ad48-dd5e604a1e81') then
    return;
  end if;
  if not exists(select 1 from public.guardians
    where id='73fd616f-a16a-40b5-9f8d-9d2893ec94bc'
      and full_name='TESTE TEMPORARIO CRM 1610 Responsavel'
      and phone is null and email is null and whatsapp_opt_in=false)
    or not exists(select 1 from public.students
      where id='cfdd233e-5d38-481d-ad48-dd5e604a1e81'
        and full_name='TESTE TEMPORARIO CRM 1610 Aluno') then
    raise exception 'Os registros não correspondem ao teste desta sessão';
  end if;
  delete from public.enrollment_opportunities
    where id='14b2f27a-9273-4de5-8b23-10cda25f65b6'
      and student_id='cfdd233e-5d38-481d-ad48-dd5e604a1e81'
      and primary_guardian_id='73fd616f-a16a-40b5-9f8d-9d2893ec94bc';
  -- Visita e histórico de etapas são removidos pelo FK ON DELETE CASCADE.
  delete from public.student_guardians
    where student_id='cfdd233e-5d38-481d-ad48-dd5e604a1e81'
      and guardian_id='73fd616f-a16a-40b5-9f8d-9d2893ec94bc';
  delete from public.students where id='cfdd233e-5d38-481d-ad48-dd5e604a1e81'
    and full_name='TESTE TEMPORARIO CRM 1610 Aluno';
  delete from public.guardians where id='73fd616f-a16a-40b5-9f8d-9d2893ec94bc'
    and full_name='TESTE TEMPORARIO CRM 1610 Responsavel';
end;
$cleanup$;
commit;
select jsonb_build_object(
  'guardians',(select count(*) from public.guardians where id='73fd616f-a16a-40b5-9f8d-9d2893ec94bc'),
  'students',(select count(*) from public.students where id='cfdd233e-5d38-481d-ad48-dd5e604a1e81'),
  'opportunities',(select count(*) from public.enrollment_opportunities where id='14b2f27a-9273-4de5-8b23-10cda25f65b6'),
  'visits',(select count(*) from public.school_visits where id='115ae04b-c23c-4280-b784-89681c4a2422')
) as synthetic_records_remaining;
