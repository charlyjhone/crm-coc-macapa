ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assunto text,
  ADD COLUMN IF NOT EXISTS triage_status text NOT NULL DEFAULT 'novo',
  ADD COLUMN IF NOT EXISTS interesse text,
  ADD COLUMN IF NOT EXISTS triage_summary text,
  ADD COLUMN IF NOT EXISTS agent_replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS handoff_at timestamptz,
  ADD COLUMN IF NOT EXISTS handoff_reason text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_triage_status ON public.leads (triage_status);
CREATE INDEX IF NOT EXISTS idx_leads_assunto ON public.leads (assunto);

CREATE OR REPLACE FUNCTION public.trigger_school_triage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url text := 'https://swtujagetprnlmfvlega.supabase.co/functions/v1/school-triage';
  v_key text := 'sb_publishable_BIeWOjdYHvvHpFrcVG6NJQ_WhXioSJV';
  v_body jsonb;
BEGIN
  IF NEW.direction <> 'inbound' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'whatsapp_messages' THEN
    v_body := jsonb_build_object('channel', 'whatsapp', 'message_id', NEW.id, 'phone', NEW.phone, 'text', NEW.message);
  ELSE
    v_body := jsonb_build_object('channel', 'email', 'message_id', NEW.id, 'lead_id', NEW.lead_id, 'text', COALESCE(NEW.message, NEW.subject));
  END IF;

  PERFORM extensions.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := v_body
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_school_triage failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_school_triage_whatsapp ON public.whatsapp_messages;
CREATE TRIGGER trg_school_triage_whatsapp
AFTER INSERT ON public.whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION public.trigger_school_triage();

DROP TRIGGER IF EXISTS trg_school_triage_email ON public.email_messages;
CREATE TRIGGER trg_school_triage_email
AFTER INSERT ON public.email_messages
FOR EACH ROW EXECUTE FUNCTION public.trigger_school_triage();