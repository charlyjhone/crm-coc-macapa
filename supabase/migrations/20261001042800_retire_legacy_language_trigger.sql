-- The obsolete Lovable language detector is being retired. It is invoked from
-- these triggers through pg_net on every inbound message without authentication.
DROP TRIGGER IF EXISTS trg_detect_language_email ON public.email_messages;
DROP TRIGGER IF EXISTS trg_detect_language_whatsapp ON public.whatsapp_messages;
DROP FUNCTION IF EXISTS public.trigger_detect_lead_language();
