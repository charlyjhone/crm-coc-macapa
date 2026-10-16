-- Execute as database administrator. All synthetic rows are rolled back.
-- No WhatsApp message is inserted and no external API is called.
begin;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $test$
declare
  v_lead uuid;
  v_other_lead uuid;
  v_registration jsonb;
  v_repeat jsonb;
  v_opportunity uuid;
  v_visit uuid;
  v_repeat_visit uuid;
  v_scheduled timestamptz := date_trunc('day', now()) + interval '7 days 18 hours';
  v_count integer;
  v_denied boolean;
begin
  insert into public.leads(name, phone, source, status, triage_status)
    values ('Teste transacional de visitas', '0000000000000', 'whatsapp', 'novo', 'novo') returning id into v_lead;
  insert into public.leads(name, phone, source, status, triage_status)
    values ('Outro teste transacional', '0000000000001', 'whatsapp', 'novo', 'novo') returning id into v_other_lead;

  v_registration := public.register_ana_enrollment(v_lead, 'Responsável Sintético', 'Aluno Sintético', 2027, '5º ano', null);
  v_opportunity := (v_registration->>'opportunity_id')::uuid;
  if v_opportunity is null or not (v_registration->>'created')::boolean then raise exception 'Cadastro inicial falhou'; end if;
  v_repeat := public.register_ana_enrollment(v_lead, 'Responsável Sintético', 'Aluno Sintético', 2027, '5º ano', 'manhã');
  if v_repeat->>'opportunity_id' <> v_registration->>'opportunity_id' or (v_repeat->>'created')::boolean then raise exception 'Cadastro repetido criou outra oportunidade'; end if;

  v_visit := public.register_ana_school_visit(v_lead, v_opportunity, v_scheduled);
  v_repeat_visit := public.register_ana_school_visit(v_lead, v_opportunity, v_scheduled);
  if v_visit is null or v_visit <> v_repeat_visit then raise exception 'Visita repetida não foi reaproveitada'; end if;
  select count(*) into v_count from public.school_visits where opportunity_id=v_opportunity;
  if v_count <> 1 then raise exception 'Visita duplicada'; end if;
  if not exists (select 1 from public.school_visits where id=v_visit and status='agendada') then raise exception 'Visita confirmada sem secretaria'; end if;
  if not exists (select 1 from public.enrollment_opportunities where id=v_opportunity and stage='visita_agendada' and next_action='Secretaria: confirmar disponibilidade da visita') then raise exception 'Funil não avançou'; end if;
  select count(*) into v_count from public.enrollment_stage_history where opportunity_id=v_opportunity and new_stage='visita_agendada';
  if v_count <> 1 then raise exception 'Histórico de visita duplicado'; end if;

  v_denied := false;
  begin perform public.register_ana_school_visit(v_lead,v_opportunity,v_scheduled+interval '1 day'); exception when others then v_denied := true; end;
  if not v_denied then raise exception 'Reagendamento automático indevido'; end if;
  v_denied := false;
  begin perform public.register_ana_school_visit(v_other_lead,v_opportunity,v_scheduled); exception when others then v_denied := true; end;
  if not v_denied then raise exception 'Contato diferente aceito'; end if;
  v_denied := false;
  begin perform public.register_ana_school_visit(v_lead,v_opportunity,now()-interval '1 day'); exception when others then v_denied := true; end;
  if not v_denied then raise exception 'Data passada aceita'; end if;
  v_denied := false;
  begin perform public.register_ana_school_visit(v_lead,v_opportunity,'infinity'::timestamptz); exception when others then v_denied := true; end;
  if not v_denied then raise exception 'Data infinita aceita'; end if;
  update public.enrollment_opportunities set stage='perdido', loss_reason='Teste transacional' where id=v_opportunity;
  v_denied := false;
  begin perform public.register_ana_school_visit(v_lead,v_opportunity,v_scheduled); exception when others then v_denied := true; end;
  if not v_denied then raise exception 'Oportunidade encerrada aceita'; end if;

  if has_function_privilege('anon','public.register_ana_school_visit(uuid,uuid,timestamptz)','EXECUTE') or
     has_function_privilege('authenticated','public.register_ana_school_visit(uuid,uuid,timestamptz)','EXECUTE') then
    raise exception 'RPC de visita exposta ao cliente';
  end if;
  if not has_function_privilege('service_role','public.register_ana_school_visit(uuid,uuid,timestamptz)','EXECUTE') then raise exception 'Serviço sem permissão'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',gen_random_uuid())::text,true);
  v_denied := false;
  begin perform public.recompute_enrollment_score(v_opportunity); exception when others then v_denied := true; end;
  if not v_denied then raise exception 'Usuário sem perfil autorizado na pontuação'; end if;
end;
$test$;

select 'PASS: cadastro, turno posterior, visita, repetição, funil, histórico, datas, vínculo, oportunidade encerrada e permissões' as result;
rollback;
