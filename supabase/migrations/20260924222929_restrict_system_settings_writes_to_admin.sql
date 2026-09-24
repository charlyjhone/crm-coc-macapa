-- Criada pelo CLI; versão alinhada ao registro aplicado pelo conector.
alter table public.system_settings enable row level security;
drop policy if exists "Authenticated users can update settings" on public.system_settings;
drop policy if exists "Authenticated users can upsert settings" on public.system_settings;
create policy "Admins can insert settings" on public.system_settings
for insert to authenticated with check (public.is_admin((select auth.uid())));
create policy "Admins can update settings" on public.system_settings
for update to authenticated using (public.is_admin((select auth.uid())))
with check (public.is_admin((select auth.uid())));

