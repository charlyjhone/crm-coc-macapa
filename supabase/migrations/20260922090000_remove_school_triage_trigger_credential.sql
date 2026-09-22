-- The school-triage Edge Function intentionally accepts calls from the
-- database trigger without JWT verification. Do not embed Supabase keys here.
CREATE OR REPLACE FUNCTION public.trigger_school_triage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net'
AS $function$
DECLARE
  v_url text := 'https://fenqnbzdjnyvgrmjczoi.supabase.co/functions/v1/school-triage';
  v_body jsonb;
BEGIN
  IF NEW.direction <> 'inbound' THEN
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

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := v_body,
    timeout_milliseconds := 20000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_school_triage failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trigger_school_triage() FROM anon, authenticated, PUBLIC;
