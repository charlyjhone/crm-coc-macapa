-- Allow school PDF folders up to 18 MiB; preserve bucket privacy and MIME restrictions.
UPDATE storage.buckets SET file_size_limit = 18874368 WHERE id = 'school-materials';
