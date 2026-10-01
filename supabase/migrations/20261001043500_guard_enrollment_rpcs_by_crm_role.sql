-- These SECURITY DEFINER RPCs bypass table RLS. A login alone did not imply
-- membership in the school CRM, so require an explicit CRM role on entry.
DO $migration$
DECLARE
  function_name text;
  definition text;
  original_guard constant text := 'if auth.uid() is null then';
  guarded_entry constant text := $$if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then$$;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'complete_enrollment_task',
    'create_enrollment_task',
    'create_school_enrollment',
    'recompute_all_enrollment_scores',
    'recompute_enrollment_score',
    'schedule_school_visit',
    'update_enrollment_progress',
    'update_school_visit_status'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO STRICT definition
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = function_name;

    IF position(original_guard IN definition) = 0 THEN
      RAISE EXCEPTION 'Expected login guard missing in %', function_name;
    END IF;
    EXECUTE replace(definition, original_guard, guarded_entry);
  END LOOP;
END;
$migration$;
