-- Protects the database-triggered school triage call with a secret stored in Supabase Vault.
-- Before enabling the trigger in production, create the secret once:
-- select vault.create_secret('<strong-random-value>', 'internal_function_secret');

CREATE OR REPLACE FUNCTION public.trigger_school_triage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  v_url text := 'https://swtujagetprnlmfvlega.supabase.co/functions/v1/school-triage';
  v_internal_secret text;
  v_body jsonb;
BEGIN
  IF NEW.direction <> 'inbound' THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret
    INTO v_internal_secret
    FROM vault.decrypted_secrets
   WHERE name = 'internal_function_secret'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_internal_secret IS NULL OR length(v_internal_secret) < 32 THEN
    RAISE WARNING 'trigger_school_triage skipped: internal_function_secret is missing or too short';
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'whatsapp_messages' THEN
    v_body := jsonb_build_object(
      'channel', 'whatsapp',
      'message_id', NEW.id,
      'phone', NEW.phone,
      'text', NEW.message
    );
  ELSE
    v_body := jsonb_build_object(
      'channel', 'email',
      'message_id', NEW.id,
      'lead_id', NEW.lead_id,
      'text', COALESCE(NEW.message, NEW.subject)
    );
  END IF;

  PERFORM extensions.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_internal_secret
    ),
    body := v_body
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_school_triage failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trigger_school_triage() FROM anon, authenticated, PUBLIC;
