-- Arquivos enviados pela secretaria pelo CRM (PDF, imagem, Word, Excel).
-- Bucket privado; cada atendente só grava e apaga na própria pasta ({user_id}/{lead_id}/...).
-- Não guarda arquivos recebidos das famílias.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('whatsapp-sent-files', 'whatsapp-sent-files', false, 26214400, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict (id) do nothing;

drop policy if exists whatsapp_sent_files_select_school_users on storage.objects;
create policy whatsapp_sent_files_select_school_users on storage.objects
  for select to authenticated
  using (bucket_id = 'whatsapp-sent-files' and exists (
    select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = any (array['admin'::app_role, 'user'::app_role])));

drop policy if exists whatsapp_sent_files_insert_own_folder on storage.objects;
create policy whatsapp_sent_files_insert_own_folder on storage.objects
  for insert to authenticated
  with check (bucket_id = 'whatsapp-sent-files' and (storage.foldername(name))[1] = auth.uid()::text and exists (
    select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = any (array['admin'::app_role, 'user'::app_role])));

drop policy if exists whatsapp_sent_files_delete_own_folder on storage.objects;
create policy whatsapp_sent_files_delete_own_folder on storage.objects
  for delete to authenticated
  using (bucket_id = 'whatsapp-sent-files' and (storage.foldername(name))[1] = auth.uid()::text and exists (
    select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = any (array['admin'::app_role, 'user'::app_role])));

-- Atendentes (não só admin) podem abrir o folder digital no histórico da conversa.
drop policy if exists "School users read school folder" on storage.objects;
create policy "School users read school folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'school-materials' and name = 'folder-digital.pdf' and exists (
    select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = any (array['admin'::app_role, 'user'::app_role])));
