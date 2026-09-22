-- Ana v41: normaliza celulares brasileiros antigos, identifica mensagens da Ana
-- e elimina contradições de encaminhamento entre Secretaria e Financeiro.

update public.whatsapp_messages
set phone = '55' || substr(regexp_replace(phone,'\\D','','g'),3,2) || '9' || substr(regexp_replace(phone,'\\D','','g'),5)
where regexp_replace(coalesce(phone,''),'\\D','','g') ~ '^55[0-9]{2}[6-9][0-9]{7}$';

update public.leads
set phone = '55' || substr(regexp_replace(phone,'\\D','','g'),3,2) || '9' || substr(regexp_replace(phone,'\\D','','g'),5)
where regexp_replace(coalesce(phone,''),'\\D','','g') ~ '^55[0-9]{2}[6-9][0-9]{7}$';

update public.leads l
set phones = (
  select coalesce(array_agg(distinct case
    when regexp_replace(p,'\\D','','g') ~ '^55[0-9]{2}[6-9][0-9]{7}$'
      then '55' || substr(regexp_replace(p,'\\D','','g'),3,2) || '9' || substr(regexp_replace(p,'\\D','','g'),5)
    when regexp_replace(p,'\\D','','g') ~ '^[0-9]{2}[6-9][0-9]{7}$'
      then '55' || substr(regexp_replace(p,'\\D','','g'),1,2) || '9' || substr(regexp_replace(p,'\\D','','g'),3)
    else p end), '{}'::text[])
  from unnest(coalesce(l.phones,'{}'::text[])) p
)
where exists (
  select 1 from unnest(coalesce(l.phones,'{}'::text[])) p
  where regexp_replace(p,'\\D','','g') ~ '^(55)?[0-9]{2}[6-9][0-9]{7}$'
);

update public.leads l
set whatsapp_phone_lid_map = (
  select coalesce(jsonb_object_agg(case
    when regexp_replace(k,'\\D','','g') ~ '^55[0-9]{2}[6-9][0-9]{7}$'
      then '55' || substr(regexp_replace(k,'\\D','','g'),3,2) || '9' || substr(regexp_replace(k,'\\D','','g'),5)
    when regexp_replace(k,'\\D','','g') ~ '^[0-9]{2}[6-9][0-9]{7}$'
      then '55' || substr(regexp_replace(k,'\\D','','g'),1,2) || '9' || substr(regexp_replace(k,'\\D','','g'),3)
    else k end, v), '{}'::jsonb)
  from jsonb_each_text(coalesce(l.whatsapp_phone_lid_map,'{}'::jsonb)) e(k,v)
)
where coalesce(l.whatsapp_phone_lid_map,'{}'::jsonb) <> '{}'::jsonb;

update public.whatsapp_messages
set raw_data = coalesce(raw_data,'{}'::jsonb) ||
  '{"sender_type":"ana","source":"school-triage"}'::jsonb
where direction='outbound'
  and message like '*[Atendente Ana]*%'
  and coalesce(raw_data->>'sender_type','') <> 'ana';

update public.system_settings
set value = replace(replace(replace(value,
  'Sobre outras possibilidades, o financeiro poderá te orientar pelo WhatsApp (96) 98148-5979.',
  'Para novas matrículas, a secretaria confirmará outras possibilidades por aqui. Para alunos já matriculados, o Financeiro poderá orientar pelo WhatsApp (96) 98148-5979.'),
  'A combinação dos descontos precisa ser confirmada com o financeiro. Você pode falar com a equipe pelo WhatsApp (96) 98148-5979 para verificar como se aplica à sua família.',
  'A combinação dos descontos para uma nova matrícula precisa ser confirmada pela secretaria. Por favor, aguarde o atendimento da equipe por aqui.'),
  'Combinação e condições adicionais dos descontos: confirmar com o financeiro.',
  'Combinação e condições adicionais dos descontos: Secretaria para interessados e novas matrículas; Financeiro somente para alunos já matriculados.'),
  updated_at = now()
where key='escola_info';
