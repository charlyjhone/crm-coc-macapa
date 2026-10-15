-- A private PDF available to authenticated administrators for replacement.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-materials', 'school-materials', false, 15728640, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 15728640,
  allowed_mime_types = array['application/pdf'];

create policy "Admin reads school folder" on storage.objects for select to authenticated
using (bucket_id = 'school-materials' and name = 'folder-digital.pdf'
  and public.has_role(auth.uid(), 'admin'::public.app_role));
create policy "Admin uploads school folder" on storage.objects for insert to authenticated
with check (bucket_id = 'school-materials' and name = 'folder-digital.pdf'
  and public.has_role(auth.uid(), 'admin'::public.app_role));
create policy "Admin replaces school folder" on storage.objects for update to authenticated
using (bucket_id = 'school-materials' and name = 'folder-digital.pdf'
  and public.has_role(auth.uid(), 'admin'::public.app_role))
with check (bucket_id = 'school-materials' and name = 'folder-digital.pdf'
  and public.has_role(auth.uid(), 'admin'::public.app_role));
