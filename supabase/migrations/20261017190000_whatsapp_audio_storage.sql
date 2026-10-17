insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('whatsapp-audio', 'whatsapp-audio', false, 10485760,
  array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-m4a','audio/aac'])
on conflict (id) do update
set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "whatsapp_audio_select_school_users" on storage.objects;
create policy "whatsapp_audio_select_school_users" on storage.objects for select to authenticated
using (bucket_id = 'whatsapp-audio' and exists (
  select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin', 'user')
));

drop policy if exists "whatsapp_audio_insert_school_users" on storage.objects;
create policy "whatsapp_audio_insert_school_users" on storage.objects for insert to authenticated
with check (bucket_id = 'whatsapp-audio' and (storage.foldername(name))[1] = auth.uid()::text and exists (
  select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin', 'user')
));

drop policy if exists "whatsapp_audio_delete_school_users" on storage.objects;
create policy "whatsapp_audio_delete_school_users" on storage.objects for delete to authenticated
using (bucket_id = 'whatsapp-audio' and (storage.foldername(name))[1] = auth.uid()::text and exists (
  select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin', 'user')
));
