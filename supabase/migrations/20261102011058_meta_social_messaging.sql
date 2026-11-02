-- Instagram Direct e Facebook Messenger no CRM (API oficial da Meta).
-- As mensagens chegam pela Edge Function meta-webhook e saem pela send-meta-message,
-- ambas com service_role. A equipe (admin/Secretaria) só lê.

create table if not exists public.lead_social_identities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel text not null check (channel in ('instagram', 'facebook')),
  social_user_id text not null,          -- IGSID (Instagram) ou PSID (Messenger)
  username text,
  display_name text,
  profile_pic text,
  last_inbound_at timestamptz,           -- base da janela de 24 h da Meta
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, social_user_id)
);
create index if not exists lead_social_identities_lead_idx on public.lead_social_identities(lead_id);

create table if not exists public.social_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('instagram', 'facebook')),
  external_id text,                      -- mid da Meta (evita duplicar em reenvios do webhook)
  lead_id uuid references public.leads(id) on delete set null,
  social_user_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message text,
  attachments jsonb not null default '[]'::jsonb,
  raw_data jsonb,
  sent_by uuid references auth.users(id) on delete set null,
  operator_name text,
  message_tag text,                      -- HUMAN_AGENT quando enviada fora das 24 h
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (channel, external_id)
);
create index if not exists social_messages_lead_idx on public.social_messages(lead_id, sent_at desc);
create index if not exists social_messages_user_idx on public.social_messages(channel, social_user_id, sent_at desc);

alter table public.lead_social_identities enable row level security;
alter table public.social_messages enable row level security;

revoke all on table public.lead_social_identities from anon, authenticated;
revoke all on table public.social_messages from anon, authenticated;
grant select on table public.lead_social_identities to authenticated;
grant select on table public.social_messages to authenticated;

drop policy if exists "Identidades sociais: equipe lê" on public.lead_social_identities;
create policy "Identidades sociais: equipe lê" on public.lead_social_identities
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'user'::public.app_role));

drop policy if exists "Mensagens sociais: equipe lê" on public.social_messages;
create policy "Mensagens sociais: equipe lê" on public.social_messages
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'user'::public.app_role));
