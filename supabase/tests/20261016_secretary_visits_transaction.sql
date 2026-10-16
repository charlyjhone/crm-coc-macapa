-- Dados sintéticos e usuário existente de secretaria/admin, sem mensagens externas.
-- A identidade é usada apenas nesta transação SQL; não gera sessão nem credenciais.
begin;
do $test$
declare
  v_actor uuid;
  v_lead uuid;
  v_registration jsonb;
  v_opp uuid;
  v_visit uuid;
  v_other_visit uuid;
  v_scheduled timestamptz := date_trunc('day',now()) + interval '7 days 18 hours';
  v_completed timestamptz;
  v_next_at timestamptz;
  v_count integer;
  v_denied boolean;
begin
  select user_id into v_actor from public.user_roles where role in ('user','admin') order by role desc limit 1;
  if v_actor is null then raise exception 'Teste precisa de papel de secretaria/admin existente'; end if;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into public.leads(name,phone,source,status,triage_status)
    values('Teste transacional secretaria','0000000000002','whatsapp','novo','novo') returning id into v_lead;
  v_registration := public.register_ana_enrollment(v_lead,'Responsável Sintético Secretaria','Aluno Sintético Secretaria',2027,'5º ano',null);
  v_opp := (v_registration->>'opportunity_id')::uuid;

  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_actor)::text,true);
  execute 'set local role authenticated';
  v_visit := public.schedule_school_visit(v_opp,v_scheduled,'Responsável e aluno','Nota original');
  if public.schedule_school_visit(v_opp,v_scheduled)<>v_visit then raise exception 'Agendamento duplicado'; end if;
  select count(*) into v_count from public.school_visits where opportunity_id=v_opp;
  if v_count<>1 then raise exception 'Mais de uma visita'; end if;
  v_denied:=false;
  begin perform public.schedule_school_visit(v_opp,v_scheduled+interval '1 day'); exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Segundo horário ativo aceito'; end if;
  v_denied:=false;
  begin perform public.schedule_school_visit(v_opp,now()-interval '1 hour'); exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Data passada aceita'; end if;
  v_denied:=false;
  begin perform public.schedule_school_visit(v_opp,'infinity'::timestamptz); exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Data infinita aceita'; end if;

  perform public.update_school_visit_status(v_visit,'confirmada','Gostou da escola','Dúvida de transporte',null);
  if not exists(select 1 from public.school_visits where id=v_visit and follow_up_notes='Nota original') then raise exception 'Confirmação apagou nota'; end if;
  if not exists(select 1 from public.enrollment_opportunities where id=v_opp and next_action='Realizar visita escolar' and next_action_at=v_scheduled) then raise exception 'Confirmação não atualizou próxima ação'; end if;
  v_denied:=false;
  begin perform public.update_school_visit_status(v_visit,'reagendada'); exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Reagendamento sem nova data aceito'; end if;
  v_denied:=false;
  begin perform public.reschedule_school_visit(v_visit,v_scheduled); exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Mesmo horário aceito como reagendamento'; end if;
  v_denied:=false;
  begin perform public.reschedule_school_visit(v_visit,now()-interval '1 hour'); exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Reagendamento passado aceito'; end if;
  perform public.reschedule_school_visit(v_visit,v_scheduled+interval '1 day','Combinado novo horário');
  perform public.reschedule_school_visit(v_visit,v_scheduled+interval '1 day');
  if not exists(select 1 from public.school_visits where id=v_visit and scheduled_at=v_scheduled+interval '1 day'
    and status='reagendada' and family_impression='Gostou da escola' and follow_up_notes='Combinado novo horário') then raise exception 'Reagendamento não preservou dados'; end if;

  perform public.update_school_visit_status(v_visit,'realizada');
  select completed_at into v_completed from public.school_visits where id=v_visit;
  select next_action_at into v_next_at from public.enrollment_opportunities where id=v_opp;
  perform public.update_school_visit_status(v_visit,'realizada',null,'',null);
  if not exists(select 1 from public.school_visits where id=v_visit and completed_at=v_completed and objections is null
    and family_impression='Gostou da escola' and follow_up_notes='Combinado novo horário') then raise exception 'Edição de notas alterou resultado anterior'; end if;
  if not exists(select 1 from public.enrollment_opportunities where id=v_opp and stage='visita_realizada' and next_action_at=v_next_at) then raise exception 'Edição mudou prazo'; end if;
  select count(*) into v_count from public.enrollment_stage_history where opportunity_id=v_opp and new_stage='visita_realizada';
  if v_count<>1 then raise exception 'Histórico realizado duplicado'; end if;
  v_denied:=false;
  begin perform public.reschedule_school_visit(v_visit,v_scheduled+interval '2 days'); exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Visita realizada foi reaberta'; end if;

  update public.enrollment_opportunities set stage='documentacao_pendente' where id=v_opp;
  v_other_visit:=public.schedule_school_visit(v_opp,v_scheduled+interval '2 days');
  perform public.update_school_visit_status(v_other_visit,'realizada');
  if not exists(select 1 from public.enrollment_opportunities where id=v_opp and stage='documentacao_pendente') then raise exception 'Visita regrediu etapa avançada'; end if;
  update public.enrollment_opportunities set stage='matriculado',enrolled_at=now() where id=v_opp;
  v_denied:=false;
  begin perform public.schedule_school_visit(v_opp,v_scheduled+interval '3 days'); exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Oportunidade matriculada reaberta'; end if;

  if has_function_privilege('anon','public.reschedule_school_visit(uuid,timestamptz,text)','EXECUTE') then raise exception 'Reagendamento exposto ao público'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',gen_random_uuid())::text,true);
  v_denied:=false;
  begin perform public.reschedule_school_visit(v_visit,v_scheduled+interval '3 days'); exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Identidade sem perfil conseguiu reagendar'; end if;
  if exists(select 1 from public.school_visits where id=v_visit) then raise exception 'Identidade sem perfil leu visitas'; end if;
end;
$test$;
select 'PASS: agendar, repetir, confirmar, preservar/editar notas, reagendar, realizar, histórico, datas, etapas e permissões' as result;
rollback;
