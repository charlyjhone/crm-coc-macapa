-- Lembretes da secretaria por família (ex.: "enviar valores em 1º de novembro").
-- A tela Hoje mostra os lembretes do dia e os atrasados; a secretaria marca como feito.

create table if not exists public.lead_reminders (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  remind_on date not null,
  kind text not null default 'outro'
    check (kind in ('enviar_valores', 'enviar_documento', 'falar_matricula', 'retornar_contato', 'outro')),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid
);

create index if not exists lead_reminders_pending_idx
  on public.lead_reminders (remind_on)
  where done_at is null;
create index if not exists lead_reminders_lead_idx on public.lead_reminders (lead_id);

alter table public.lead_reminders enable row level security;

revoke all on table public.lead_reminders from public, anon;
grant select, insert, delete on table public.lead_reminders to authenticated;
grant update (remind_on, kind, note, done_at, done_by) on table public.lead_reminders to authenticated;

-- Equipe da escola (admin ou usuário) vê e gerencia todos os lembretes.
drop policy if exists "Lembretes: equipe lê" on public.lead_reminders;
create policy "Lembretes: equipe lê" on public.lead_reminders
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'user'::public.app_role));

drop policy if exists "Lembretes: equipe cria" on public.lead_reminders;
create policy "Lembretes: equipe cria" on public.lead_reminders
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'user'::public.app_role));

drop policy if exists "Lembretes: equipe atualiza" on public.lead_reminders;
create policy "Lembretes: equipe atualiza" on public.lead_reminders
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'user'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'user'::public.app_role));

drop policy if exists "Lembretes: equipe apaga" on public.lead_reminders;
create policy "Lembretes: equipe apaga" on public.lead_reminders
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'user'::public.app_role));
