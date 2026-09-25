begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='user' limit 1),true);
set local role authenticated;
do $test$
declare a jsonb; b jsonb; oid uuid; vid uuid; tid uuid;
begin
 a:=public.create_school_enrollment('HOMOLOGACAO ROLLBACK','00000000000',null,'ALUNO TESTE',2027,'1º ano','manhã',false,'teste_tecnico');
 b:=public.create_school_enrollment('HOMOLOGACAO ROLLBACK','(00) 00000-0000',null,'SEGUNDO ALUNO TESTE',2027,'2º ano','manhã',false,'teste_tecnico');
 if a->>'guardian_id'<>b->>'guardian_id' then raise exception 'Telefone formatado criou responsável duplicado'; end if;
 oid:=(a->>'opportunity_id')::uuid;
 perform public.update_enrollment_progress(oid,'contato_realizado','Agendar visita',now()+interval '1 day',null);
 vid:=public.schedule_school_visit(oid,now()+interval '2 days','Responsável','Teste revertido');
 perform public.update_school_visit_status(vid,'realizada','positiva',null,'Retornar');
 tid:=public.create_enrollment_task(oid,'Retorno teste',now()+interval '1 day','normal');
 perform public.complete_enrollment_task(tid,'Próxima ação teste',now()+interval '2 days','normal');
 begin
  perform public.update_enrollment_progress(oid,'perdido',null,null,null);
  raise exception 'Perda sem motivo permitida';
 exception when raise_exception then
  if sqlerrm='Perda sem motivo permitida' then raise; end if;
 end;
 perform public.update_enrollment_progress(oid,'matriculado',null,null,null);
 if not exists(select 1 from public.enrollment_opportunities where id=oid and stage='matriculado' and enrolled_at is not null) then raise exception 'Matrícula não concluída'; end if;
end $test$;
reset role;
do $test$
declare lid uuid; fid uuid;
begin
 insert into public.leads(name,phone,status,triage_status,handoff_at) values ('HOMOLOGACAO ROLLBACK','00000000000','novo','aguardando_secretaria',now()) returning id into lid;
 insert into public.ana_followups(lead_id,phone,handoff_at,due_at) values(lid,'00000000000',now(),now()+interval '5 minutes') returning id into fid;
 update public.leads set triage_status='resolvido' where id=lid;
 if not exists(select 1 from public.leads where id=lid and handoff_at is null and resolved_at is not null) then raise exception 'Conclusão manual incompleta'; end if;
 if not exists(select 1 from public.ana_followups where id=fid and status='cancelled') then raise exception 'Followup manual não cancelado'; end if;
 update public.leads set triage_status='aguardando_secretaria',handoff_at=now(),resolved_at=null where id=lid;
 update public.ana_followups set status='pending',cancel_reason=null where id=fid;
 insert into public.whatsapp_messages(phone,message,direction,timestamp,raw_data) values('00000000000','Teste humano revertido','outbound',now(),'{"sender_type":"human","source":"whatsapp-device"}');
 if not exists(select 1 from public.leads where id=lid and triage_status='resolvido' and handoff_at is null) then raise exception 'Resposta humana não resolveu handoff'; end if;
 if not exists(select 1 from public.ana_followups where id=fid and status='cancelled') then raise exception 'Resposta humana não cancelou followup'; end if;
end $test$;
select 'PASS: família, telefone duplicado, funil, visita, tarefa, perda, matrícula, conclusão manual e resposta humana; ROLLBACK' as result;
rollback;
