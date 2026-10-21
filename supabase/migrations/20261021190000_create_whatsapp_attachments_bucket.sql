-- Private storage for WhatsApp attachments reviewed by the school secretary.
-- Family images/documents must not be sent to AI providers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('whatsapp-attachments', 'whatsapp-attachments', false, 18874368, null)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
