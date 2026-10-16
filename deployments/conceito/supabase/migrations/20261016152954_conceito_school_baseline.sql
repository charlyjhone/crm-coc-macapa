-- Colégio Conceito: schema-only baseline, reviewed from the active school CRM.
-- Target ONLY xkcxvbagzxwwauofvlin. No COC rows, users, secrets, jobs or external integrations.
SET check_function_bodies = off;
SET search_path = public, extensions;
CREATE SCHEMA IF NOT EXISTS audit_private;
REVOKE ALL ON SCHEMA audit_private FROM PUBLIC, anon, authenticated;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE TYPE public."app_role" AS ENUM ('admin', 'user');
CREATE TYPE public."lead_status" AS ENUM ('novo', 'em_atendimento', 'em_negociacao', 'matriculado', 'nao_convertido', 'resolvido');
CREATE TABLE public."delivery_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL,
  "destination" text NOT NULL,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "url" text,
  "response" jsonb
);
ALTER TABLE public."delivery_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."delivery_logs" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."delivery_logs" TO service_role;
CREATE TABLE public."email_attachments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid,
  "email_message_id" uuid,
  "filename" text NOT NULL,
  "content_type" text,
  "size_bytes" integer,
  "storage_path" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "content_hash" text,
  "deleted_at" timestamp with time zone,
  "whatsapp_message_id" uuid,
  "legal_analysis" jsonb,
  "legal_analysis_at" timestamp with time zone
);
ALTER TABLE public."email_attachments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."email_attachments" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."email_attachments" TO service_role;
CREATE TABLE public."email_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid,
  "subject" text,
  "message" text,
  "html_body" text,
  "direction" text DEFAULT 'inbound'::text NOT NULL,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
  "raw_data" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resend_message_id" text,
  "followup_intent" text,
  "followup_intent_reason" text,
  "followup_intent_at" timestamp with time zone,
  "internet_message_id" text,
  "outlook_message_id" text,
  "also_received_by" text[] DEFAULT '{}'::text[] NOT NULL,
  "recipients_to" text[] DEFAULT '{}'::text[] NOT NULL,
  "recipients_cc" text[] DEFAULT '{}'::text[] NOT NULL,
  "recipients_bcc" text[] DEFAULT '{}'::text[] NOT NULL
);
ALTER TABLE public."email_messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."email_messages" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."email_messages" TO service_role;
CREATE TABLE public."lead_notes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL,
  "note" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."lead_notes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."lead_notes" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."lead_notes" TO service_role;
CREATE TABLE public."scheduled_followups" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL,
  "next_run_at" timestamp with time zone NOT NULL,
  "attempt_number" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."scheduled_followups" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."scheduled_followups" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."scheduled_followups" TO service_role;
CREATE TABLE public."user_presence" (
  "user_id" uuid NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_path" text
);
ALTER TABLE public."user_presence" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."user_presence" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."user_presence" TO service_role;
CREATE TABLE public."user_product_access" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "produto" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."user_product_access" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."user_product_access" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."user_product_access" TO service_role;
CREATE TABLE public."whatsapp_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid,
  "phone" text NOT NULL,
  "message" text,
  "direction" text NOT NULL,
  "timestamp" timestamp with time zone,
  "raw_data" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "is_audio" boolean DEFAULT false
);
ALTER TABLE public."whatsapp_messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."whatsapp_messages" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."whatsapp_messages" TO service_role;
CREATE TABLE public."user_roles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "role" app_role NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."user_roles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."user_roles" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."user_roles" TO service_role;
CREATE TABLE public."activity_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL,
  "activity_type" text NOT NULL,
  "description" text NOT NULL,
  "source" text DEFAULT 'system'::text NOT NULL,
  "actor" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "related_entity_type" text,
  "related_entity_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid DEFAULT auth.uid()
);
ALTER TABLE public."activity_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."activity_log" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."activity_log" TO service_role;
CREATE TABLE public."system_settings" (
  "key" text NOT NULL,
  "value" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."system_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."system_settings" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."system_settings" TO service_role;
CREATE TABLE public."leads" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "email" text,
  "message" text,
  "source" text DEFAULT 'cloudmailin'::text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "phone" text,
  "emails" text[] DEFAULT '{}'::text[],
  "phones" text[] DEFAULT '{}'::text[],
  "updated_at" timestamp with time zone DEFAULT now(),
  "archived" boolean DEFAULT false,
  "description" text,
  "description_updated_at" timestamp with time zone,
  "valor" numeric,
  "produto" text,
  "moeda" text DEFAULT 'BRL'::text,
  "status" lead_status DEFAULT 'novo'::lead_status,
  "suggested_followup" text,
  "valor_manually_edited" boolean DEFAULT false,
  "client_interaction_count" integer DEFAULT 0,
  "unclassified" boolean DEFAULT false,
  "is_recurring" boolean DEFAULT false,
  "delivered_at" timestamp with time zone,
  "profile_picture_url" text,
  "valor_pago" numeric DEFAULT 0,
  "matriculado_at" timestamp with time zone,
  "nao_convertido_at" timestamp with time zone,
  "proposal_url" text,
  "proposal_sent_at" timestamp with time zone,
  "proposal_view_count" integer DEFAULT 0,
  "proposal_last_viewed_at" timestamp with time zone,
  "data_proximo_pagamento" date,
  "whatsapp_chat_lids" text[] DEFAULT '{}'::text[],
  "ai_diagnosis" text,
  "ai_close_probability" integer,
  "ai_next_step" text,
  "ai_diagnosis_reason" text,
  "ai_diagnosis_updated_at" timestamp with time zone,
  "resolvido_at" timestamp with time zone,
  "origem" text,
  "negociacao_at" timestamp with time zone,
  "last_inbound_message" text,
  "last_inbound_message_at" timestamp with time zone,
  "last_outbound_message" text,
  "last_outbound_message_at" timestamp with time zone,
  "email_inbound_count" integer DEFAULT 0,
  "email_outbound_count" integer DEFAULT 0,
  "whatsapp_inbound_count" integer DEFAULT 0,
  "whatsapp_outbound_count" integer DEFAULT 0,
  "reopened_at" timestamp with time zone,
  "publicidade_subtipo" text,
  "publicidade_quantidade" integer,
  "language" text,
  "whatsapp_phone_lid_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "assunto" text,
  "triage_status" text DEFAULT 'novo'::text NOT NULL,
  "interesse" text,
  "triage_summary" text,
  "agent_replied_at" timestamp with time zone,
  "handoff_at" timestamp with time zone,
  "handoff_reason" text,
  "resolved_at" timestamp with time zone,
  "whatsapp_phone_name_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "attention_level" text,
  "attention_reason" text
);
ALTER TABLE public."leads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."leads" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."leads" TO service_role;
CREATE TABLE public."school_units" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "code" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."school_units" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."school_units" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."school_units" TO service_role;
CREATE TABLE public."guardians" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "full_name" text NOT NULL,
  "preferred_name" text,
  "email" text,
  "phone" text,
  "whatsapp_opt_in" boolean DEFAULT false NOT NULL,
  "marketing_opt_in" boolean DEFAULT false NOT NULL,
  "consent_recorded_at" timestamp with time zone,
  "notes" text,
  "legacy_lead_id" uuid,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."guardians" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."guardians" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."guardians" TO service_role;
CREATE TABLE public."students" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "full_name" text NOT NULL,
  "preferred_name" text,
  "birth_date" date,
  "current_school" text,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."students" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."students" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."students" TO service_role;
CREATE TABLE public."student_guardians" (
  "student_id" uuid NOT NULL,
  "guardian_id" uuid NOT NULL,
  "relationship" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "is_financially_responsible" boolean DEFAULT false NOT NULL,
  "authorized_pickup" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."student_guardians" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."student_guardians" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."student_guardians" TO service_role;
CREATE TABLE public."enrollment_opportunities" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "student_id" uuid NOT NULL,
  "primary_guardian_id" uuid,
  "legacy_lead_id" uuid,
  "unit_id" uuid,
  "academic_year" integer NOT NULL,
  "desired_grade" text NOT NULL,
  "desired_shift" text,
  "desired_start_date" date,
  "source_channel" text,
  "source_campaign" text,
  "stage" text DEFAULT 'novo_interessado'::text NOT NULL,
  "probability_score" smallint DEFAULT 10 NOT NULL,
  "score_explanation" text,
  "data_confidence" smallint DEFAULT 0 NOT NULL,
  "expected_monthly_revenue" numeric(12,2),
  "next_action" text,
  "next_action_at" timestamp with time zone,
  "assigned_to" uuid,
  "loss_reason" text,
  "loss_notes" text,
  "lost_at" timestamp with time zone,
  "enrolled_at" timestamp with time zone,
  "status_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."enrollment_opportunities" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."enrollment_opportunities" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."enrollment_opportunities" TO service_role;
CREATE TABLE public."enrollment_stage_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "opportunity_id" uuid NOT NULL,
  "previous_stage" text,
  "new_stage" text NOT NULL,
  "next_action" text,
  "next_action_at" timestamp with time zone,
  "changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."enrollment_stage_history" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."enrollment_stage_history" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."enrollment_stage_history" TO service_role;
CREATE TABLE public."school_capacity" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "unit_id" uuid NOT NULL,
  "academic_year" integer NOT NULL,
  "grade" text NOT NULL,
  "shift" text NOT NULL,
  "total_seats" integer NOT NULL,
  "reserved_seats" integer DEFAULT 0 NOT NULL,
  "enrolled_seats" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."school_capacity" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."school_capacity" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."school_capacity" TO service_role;
CREATE TABLE public."school_visits" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "opportunity_id" uuid NOT NULL,
  "scheduled_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'agendada'::text NOT NULL,
  "assigned_to" uuid,
  "participants" text,
  "family_impression" text,
  "objections" text,
  "follow_up_notes" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."school_visits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."school_visits" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."school_visits" TO service_role;
CREATE TABLE public."enrollment_tasks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "opportunity_id" uuid NOT NULL,
  "title" text NOT NULL,
  "due_at" timestamp with time zone,
  "priority" text DEFAULT 'normal'::text NOT NULL,
  "status" text DEFAULT 'pendente'::text NOT NULL,
  "assigned_to" uuid,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."enrollment_tasks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."enrollment_tasks" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."enrollment_tasks" TO service_role;
CREATE TABLE public."ana_followups" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL,
  "phone" text NOT NULL,
  "handoff_at" timestamp with time zone NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "cancel_reason" text,
  "error_message" text,
  "processed_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."ana_followups" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ana_followups" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."ana_followups" TO service_role;
CREATE TABLE public."crm_survey_claims" (
  "lead_id" uuid NOT NULL,
  "cycle_at" timestamp with time zone NOT NULL,
  "state" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."crm_survey_claims" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."crm_survey_claims" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."crm_survey_claims" TO service_role;
CREATE TABLE public."audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" uuid,
  "actor_email" text,
  "operation" text NOT NULL,
  "schema_name" text NOT NULL,
  "table_name" text NOT NULL,
  "record_id" text,
  "entity_label" text,
  "changed_fields" text[] DEFAULT '{}'::text[] NOT NULL,
  "outcome" text DEFAULT 'success'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."audit_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."audit_logs" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."audit_logs" TO service_role;
CREATE OR REPLACE FUNCTION public.refresh_related_enrollment_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_opportunity_id uuid;
begin
  v_opportunity_id := coalesce(new.opportunity_id, old.opportunity_id);
  perform public.recompute_enrollment_score(v_opportunity_id);
  return coalesce(new, old);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.normalize_message_id(p_id text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_id IS NULL OR btrim(p_id) = '' THEN NULL
    ELSE lower(btrim(regexp_replace(p_id, '[<>]', '', 'g')))
  END
$function$
;
CREATE OR REPLACE FUNCTION public.update_lead_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.leads
  SET updated_at = now()
  WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata, related_entity_type, related_entity_id)
  VALUES (NEW.lead_id, 'delivery_sent',
    'Lead enviado para ' || NEW.destination,
    get_activity_source(), get_activity_actor(),
    jsonb_build_object('destination', NEW.destination),
    'delivery_logs', NEW.id);
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_email_attachment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata, related_entity_type, related_entity_id)
  VALUES (NEW.lead_id, 'attachment_added',
    'Anexo adicionado: ' || NEW.filename,
    get_activity_source(), get_activity_actor(),
    jsonb_build_object('filename', NEW.filename, 'content_type', NEW.content_type, 'size_bytes', NEW.size_bytes),
    'email_attachments', NEW.id);
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.extract_internet_message_id(p_raw jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id text;
BEGIN
  IF p_raw IS NULL THEN RETURN NULL; END IF;

  v_id := COALESCE(
    p_raw->'headers'->>'Message-ID',
    p_raw->'headers'->>'Message-Id',
    p_raw->'headers'->>'message-id',
    p_raw->>'internetMessageId',
    p_raw->>'internet_message_id',
    p_raw->>'messageId',
    p_raw->>'message_id',
    p_raw->>'headers[Message-ID]',
    p_raw->>'headers[Message-Id]',
    p_raw->>'headers[message-id]',
    p_raw->'graph'->>'internetMessageId'
  );

  RETURN public.normalize_message_id(v_id);
END;
$function$
;
CREATE VIEW public.enrollment_forecast WITH (security_invoker = true) AS  SELECT unit_id,
    academic_year,
    desired_grade,
    desired_shift,
    count(*) FILTER (WHERE stage = 'matriculado'::text) AS confirmed_enrollments,
    count(*) FILTER (WHERE stage <> ALL (ARRAY['matriculado'::text, 'perdido'::text])) AS open_opportunities,
    round(sum(
        CASE
            WHEN stage = 'matriculado'::text THEN 1::numeric
            WHEN stage = 'perdido'::text THEN 0::numeric
            ELSE probability_score::numeric / 100::numeric
        END), 2) AS forecast_enrollments,
    round(sum(
        CASE
            WHEN stage = 'perdido'::text THEN 0::numeric
            ELSE COALESCE(expected_monthly_revenue, 0::numeric) *
            CASE
                WHEN stage = 'matriculado'::text THEN 1::numeric
                ELSE probability_score::numeric / 100::numeric
            END
        END), 2) AS forecast_monthly_revenue
   FROM enrollment_opportunities
  GROUP BY unit_id, academic_year, desired_grade, desired_shift;
REVOKE ALL ON public.enrollment_forecast FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.enrollment_forecast TO service_role;
CREATE OR REPLACE FUNCTION public.get_activity_actor()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(NULLIF(current_setting('app.activity_actor', true), ''), 'system');
$function$
;
CREATE OR REPLACE FUNCTION public.get_activity_source()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(NULLIF(current_setting('app.activity_source', true), ''), 'frontend');
$function$
;
CREATE OR REPLACE FUNCTION public.infer_email_source(p_row email_messages)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_row.outlook_message_id IS NOT NULL THEN RETURN 'outlook'; END IF;
  IF p_row.raw_data IS NOT NULL THEN
    IF (p_row.raw_data ? 'envelope[from]') OR (p_row.raw_data ? 'cloudmailin') THEN
      RETURN 'cloudmailin';
    END IF;
    IF (p_row.raw_data->>'imported')::boolean IS TRUE THEN
      RETURN 'imported';
    END IF;
  END IF;
  IF p_row.resend_message_id IS NOT NULL AND p_row.direction = 'inbound' THEN
    RETURN 'resend';
  END IF;
  IF p_row.direction = 'outbound' THEN RETURN 'sent'; END IF;
  RETURN 'unknown';
END;
$function$
;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (_user_id = (SELECT auth.uid()) OR coalesce((SELECT auth.role()), '') = 'service_role')
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
$function$
;
CREATE OR REPLACE FUNCTION public.email_messages_recompute_cache()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.lead_id IS NOT NULL THEN PERFORM public.recompute_lead_message_cache(OLD.lead_id); END IF;
    RETURN OLD;
  END IF;
  IF NEW.lead_id IS NOT NULL THEN PERFORM public.recompute_lead_message_cache(NEW.lead_id); END IF;
  IF TG_OP = 'UPDATE' AND OLD.lead_id IS NOT NULL AND OLD.lead_id IS DISTINCT FROM NEW.lead_id THEN
    PERFORM public.recompute_lead_message_cache(OLD.lead_id);
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_lead_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata)
  VALUES (NEW.id, 'lead_created',
    'Lead criado via ' || COALESCE(NEW.source, 'desconhecido'),
    get_activity_source(), get_activity_actor(),
    jsonb_build_object('source_channel', NEW.source, 'origem', NEW.origem));
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.user_can_access_produto(_user_id uuid, _produto text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (_user_id = (SELECT auth.uid()) OR coalesce((SELECT auth.role()), '') = 'service_role')
    AND (
      public.is_admin(_user_id)
      OR (_produto IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.user_product_access
        WHERE user_id = _user_id AND produto = _produto
      ))
    )
$function$
;
CREATE OR REPLACE FUNCTION public.whatsapp_phone_variants(p_phone text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_raw text;
  v_digits text;
  v_local text;
  v_variants text[] := '{}';
  v_without9 text;
  v_with9 text;
BEGIN
  v_raw := btrim(COALESCE(p_phone, ''));
  v_digits := regexp_replace(v_raw, '\D', '', 'g');

  -- Identificadores @lid não são telefones, mas funcionam como chave de conversa.
  -- Mantemos tanto o valor completo quanto os dígitos para casar callbacks Z-API.
  IF v_raw ILIKE '%@lid%' THEN
    RETURN ARRAY(
      SELECT DISTINCT x
      FROM unnest(ARRAY[v_raw, replace(v_raw, '@lid', ''), v_digits]) AS x
      WHERE x IS NOT NULL AND x <> ''
    );
  END IF;

  IF v_digits = '' THEN RETURN '{}'; END IF;

  v_local := CASE WHEN left(v_digits, 2) = '55' THEN substring(v_digits from 3) ELSE v_digits END;
  v_variants := array[v_digits, v_local, '55' || v_local];

  IF length(v_local) = 11 AND substring(v_local from 3 for 1) = '9' THEN
    v_without9 := substring(v_local from 1 for 2) || substring(v_local from 4);
    v_variants := v_variants || v_without9 || ('55' || v_without9);
  END IF;

  IF length(v_local) = 10 AND substring(v_local from 3 for 1) <> '9' THEN
    v_with9 := substring(v_local from 1 for 2) || '9' || substring(v_local from 3);
    v_variants := v_variants || v_with9 || ('55' || v_with9);
  END IF;

  RETURN ARRAY(SELECT DISTINCT x FROM unnest(v_variants) AS x WHERE x IS NOT NULL AND x <> '');
END;
$function$
;
CREATE OR REPLACE FUNCTION public.recompute_lead_whatsapp_cache(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.recompute_lead_message_cache(p_lead_id);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.recompute_enrollment_score(p_opportunity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_opportunity public.enrollment_opportunities%rowtype;
  v_guardian public.guardians%rowtype;
  v_score integer;
  v_confidence integer := 20;
  v_explanation text;
  v_available_seats integer;
  v_has_capacity boolean := false;
  v_visit_status text;
  v_has_objections boolean := false;
  v_overdue_tasks integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' and (
    auth.uid() is null or not (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'user'::public.app_role)
    )
  ) then raise exception 'Usuário não autenticado'; end if;

  select * into v_opportunity
  from public.enrollment_opportunities
  where id = p_opportunity_id;

  if not found then raise exception 'Oportunidade não encontrada'; end if;

  if v_opportunity.stage = 'matriculado' then
    v_score := 100;
    v_confidence := 100;
    v_explanation := 'Matrícula concluída.';
  elsif v_opportunity.stage = 'perdido' then
    v_score := 0;
    v_confidence := 100;
    v_explanation := 'Oportunidade encerrada como perdida.';
  else
    v_score := case v_opportunity.stage
      when 'novo_interessado' then 15
      when 'tentativa_contato' then 18
      when 'contato_realizado' then 30
      when 'qualificado' then 50
      when 'visita_agendada' then 62
      when 'visita_realizada' then 72
      when 'condicoes_apresentadas' then 80
      when 'documentacao_pendente' then 88
      when 'matricula_em_conclusao' then 95
      when 'nutricao' then 25
      else 10
    end;
    v_explanation := 'Etapa atual: ' || replace(v_opportunity.stage, '_', ' ') || '.';

    if v_opportunity.primary_guardian_id is not null then
      select * into v_guardian from public.guardians where id = v_opportunity.primary_guardian_id;
      if nullif(trim(v_guardian.phone), '') is not null then
        v_score := v_score + 3;
        v_confidence := v_confidence + 15;
        v_explanation := v_explanation || ' WhatsApp informado.';
      end if;
      if nullif(trim(v_guardian.email), '') is not null then
        v_score := v_score + 2;
        v_confidence := v_confidence + 10;
        v_explanation := v_explanation || ' E-mail informado.';
      end if;
    end if;

    select status, nullif(trim(objections), '') is not null
      into v_visit_status, v_has_objections
    from public.school_visits
    where opportunity_id = p_opportunity_id
    order by scheduled_at desc
    limit 1;

    if v_visit_status is not null then
      v_confidence := v_confidence + 20;
      if v_visit_status = 'realizada' then
        v_score := v_score + 8;
        v_explanation := v_explanation || ' Visita realizada.';
      elsif v_visit_status = 'confirmada' then
        v_score := v_score + 5;
        v_explanation := v_explanation || ' Visita confirmada.';
      elsif v_visit_status = 'faltou' then
        v_score := v_score - 12;
        v_explanation := v_explanation || ' Família não compareceu à última visita.';
      elsif v_visit_status = 'cancelada' then
        v_score := v_score - 8;
        v_explanation := v_explanation || ' Última visita cancelada.';
      end if;
      if v_has_objections then
        v_score := v_score - 3;
        v_explanation := v_explanation || ' Existem objeções registradas.';
      end if;
    end if;

    select count(*) into v_overdue_tasks
    from public.enrollment_tasks
    where opportunity_id = p_opportunity_id
      and status in ('pendente','em_andamento')
      and due_at < now();

    if v_overdue_tasks > 0 then
      v_score := v_score - least(15, 5 + v_overdue_tasks * 3);
      v_explanation := v_explanation || ' Há ' || v_overdue_tasks || ' tarefa(s) atrasada(s).';
    elsif nullif(trim(v_opportunity.next_action), '') is not null then
      v_confidence := v_confidence + 15;
      v_explanation := v_explanation || ' Próxima ação definida.';
    else
      v_score := v_score - 7;
      v_explanation := v_explanation || ' Próxima ação não definida.';
    end if;

    if v_opportunity.next_action_at is not null and v_opportunity.next_action_at < now() then
      v_score := v_score - 5;
      v_explanation := v_explanation || ' Próxima ação vencida.';
    end if;

    if v_opportunity.status_updated_at < now() - interval '14 days' then
      v_score := v_score - 10;
      v_explanation := v_explanation || ' Sem avanço há mais de 14 dias.';
    elsif v_opportunity.status_updated_at < now() - interval '7 days' then
      v_score := v_score - 5;
      v_explanation := v_explanation || ' Sem avanço há mais de 7 dias.';
    end if;

    select true, total_seats - reserved_seats - enrolled_seats
      into v_has_capacity, v_available_seats
    from public.school_capacity
    where unit_id is not distinct from v_opportunity.unit_id
      and academic_year = v_opportunity.academic_year
      and grade = v_opportunity.desired_grade
      and shift is not distinct from v_opportunity.desired_shift
    limit 1;

    if v_has_capacity then
      v_confidence := v_confidence + 15;
      if v_available_seats <= 0 then
        v_score := v_score - 20;
        v_explanation := v_explanation || ' Sem vaga disponível na turma desejada.';
      elsif v_available_seats <= 2 then
        v_score := v_score - 3;
        v_explanation := v_explanation || ' Últimas vagas na turma.';
      else
        v_score := v_score + 3;
        v_explanation := v_explanation || ' Há vaga disponível.';
      end if;
    end if;

    if nullif(trim(v_opportunity.source_channel), '') is not null then
      v_confidence := v_confidence + 10;
    end if;

    v_score := greatest(1, least(99, v_score));
    v_confidence := greatest(20, least(100, v_confidence));
  end if;

  update public.enrollment_opportunities
  set probability_score = v_score,
      data_confidence = v_confidence,
      score_explanation = v_explanation
  where id = p_opportunity_id;

  return jsonb_build_object(
    'opportunity_id', p_opportunity_id,
    'probability_score', v_score,
    'data_confidence', v_confidence,
    'explanation', v_explanation
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.recompute_all_enrollment_scores()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then raise exception 'Usuário não autenticado'; end if;
  for v_id in
    select id from public.enrollment_opportunities
    where stage not in ('matriculado','perdido')
  loop
    perform public.recompute_enrollment_score(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.resolve_lead_ids_by_phone(p_phone text)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_variants text[];
BEGIN
  v_variants := public.whatsapp_phone_variants(p_phone);
  IF array_length(v_variants, 1) IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT DISTINCT l.id
    FROM public.leads l
    WHERE l.phone = ANY(v_variants)
       OR COALESCE(l.phones, '{}'::text[]) && v_variants
       OR COALESCE(l.whatsapp_chat_lids, '{}'::text[]) && v_variants
       OR EXISTS (
          SELECT 1
          FROM jsonb_each_text(COALESCE(l.whatsapp_phone_lid_map, '{}'::jsonb)) AS m(key, value)
          WHERE m.key = ANY(v_variants) OR m.value = ANY(v_variants)
       );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_activity_context(p_source text, p_actor text DEFAULT 'system'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.activity_source', COALESCE(p_source, 'frontend'), false);
  PERFORM set_config('app.activity_actor', COALESCE(p_actor, 'system'), false);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_email_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source text := get_activity_source();
  v_actor text := get_activity_actor();
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata, related_entity_type, related_entity_id)
  VALUES (
    NEW.lead_id,
    CASE WHEN NEW.direction = 'inbound' THEN 'email_received' ELSE 'email_sent' END,
    CASE WHEN NEW.direction = 'inbound'
      THEN 'E-mail recebido' || COALESCE(' — "' || NEW.subject || '"', '')
      ELSE 'E-mail enviado' || COALESCE(' — "' || NEW.subject || '"', '') END,
    v_source,
    CASE WHEN NEW.direction = 'inbound' THEN 'cliente' ELSE v_actor END,
    jsonb_build_object('subject', NEW.subject, 'direction', NEW.direction, 'resend_message_id', NEW.resend_message_id),
    'email_messages', NEW.id
  );
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT public.has_role(_user_id, 'admin'::public.app_role) $function$
;
CREATE OR REPLACE FUNCTION public.update_lead_email_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.lead_id IS NOT NULL THEN
      IF NEW.direction = 'inbound' THEN
        UPDATE public.leads SET email_inbound_count = COALESCE(email_inbound_count, 0) + 1 WHERE id = NEW.lead_id;
      ELSIF NEW.direction = 'outbound' THEN
        UPDATE public.leads SET email_outbound_count = COALESCE(email_outbound_count, 0) + 1 WHERE id = NEW.lead_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.lead_id IS NOT NULL THEN
      IF OLD.direction = 'inbound' THEN
        UPDATE public.leads SET email_inbound_count = GREATEST(COALESCE(email_inbound_count, 0) - 1, 0) WHERE id = OLD.lead_id;
      ELSIF OLD.direction = 'outbound' THEN
        UPDATE public.leads SET email_outbound_count = GREATEST(COALESCE(email_outbound_count, 0) - 1, 0) WHERE id = OLD.lead_id;
      END IF;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Se mudou de lead, atualizar contagens de ambos
    IF OLD.lead_id IS DISTINCT FROM NEW.lead_id THEN
      IF OLD.lead_id IS NOT NULL THEN
        IF OLD.direction = 'inbound' THEN
          UPDATE public.leads SET email_inbound_count = GREATEST(COALESCE(email_inbound_count, 0) - 1, 0) WHERE id = OLD.lead_id;
        ELSIF OLD.direction = 'outbound' THEN
          UPDATE public.leads SET email_outbound_count = GREATEST(COALESCE(email_outbound_count, 0) - 1, 0) WHERE id = OLD.lead_id;
        END IF;
      END IF;
      IF NEW.lead_id IS NOT NULL THEN
        IF NEW.direction = 'inbound' THEN
          UPDATE public.leads SET email_inbound_count = COALESCE(email_inbound_count, 0) + 1 WHERE id = NEW.lead_id;
        ELSIF NEW.direction = 'outbound' THEN
          UPDATE public.leads SET email_outbound_count = COALESCE(email_outbound_count, 0) + 1 WHERE id = NEW.lead_id;
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_lead_last_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE public.leads
    SET 
      last_inbound_message = NEW.message,
      last_inbound_message_at = COALESCE(NEW.timestamp, NEW.created_at)
    WHERE id = NEW.lead_id
    AND (last_inbound_message_at IS NULL OR last_inbound_message_at < COALESCE(NEW.timestamp, NEW.created_at));
  ELSIF NEW.direction = 'outbound' THEN
    UPDATE public.leads
    SET 
      last_outbound_message = NEW.message,
      last_outbound_message_at = COALESCE(NEW.timestamp, NEW.created_at)
    WHERE id = NEW.lead_id
    AND (last_outbound_message_at IS NULL OR last_outbound_message_at < COALESCE(NEW.timestamp, NEW.created_at));
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.user_can_access_lead(_user_id uuid, _lead_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select _user_id is not null
    and _user_id = (select auth.uid())
    and (
      public.has_role(_user_id, 'admin'::public.app_role)
      or public.has_role(_user_id, 'user'::public.app_role)
    )
    and exists (select 1 from public.leads where id = _lead_id)
$function$
;
CREATE OR REPLACE FUNCTION public.create_enrollment_task(p_opportunity_id uuid, p_title text, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_priority text DEFAULT 'normal'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_task_id uuid;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then raise exception 'Usuário não autenticado'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Informe a tarefa'; end if;
  if p_priority not in ('baixa','normal','alta','urgente') then raise exception 'Prioridade inválida'; end if;
  if not exists (select 1 from public.enrollment_opportunities where id = p_opportunity_id) then
    raise exception 'Oportunidade não encontrada';
  end if;

  insert into public.enrollment_tasks(
    opportunity_id, title, due_at, priority, assigned_to
  ) values (
    p_opportunity_id, trim(p_title), p_due_at, p_priority, auth.uid()
  ) returning id into v_task_id;

  update public.enrollment_opportunities
  set next_action = trim(p_title),
      next_action_at = p_due_at,
      updated_at = now()
  where id = p_opportunity_id;

  return v_task_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.complete_enrollment_task(p_task_id uuid, p_next_action text DEFAULT NULL::text, p_next_action_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_priority text DEFAULT 'normal'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_opportunity_id uuid;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then raise exception 'Usuário não autenticado'; end if;
  if p_next_priority not in ('baixa','normal','alta','urgente') then raise exception 'Prioridade inválida'; end if;

  select opportunity_id into v_opportunity_id
  from public.enrollment_tasks
  where id = p_task_id and status <> 'concluida'
  for update;

  if v_opportunity_id is null then raise exception 'Tarefa não encontrada ou já concluída'; end if;

  update public.enrollment_tasks
  set status = 'concluida', completed_at = now(), updated_at = now()
  where id = p_task_id;

  if nullif(trim(p_next_action), '') is not null then
    insert into public.enrollment_tasks(
      opportunity_id, title, due_at, priority, assigned_to
    ) values (
      v_opportunity_id, trim(p_next_action), p_next_action_at, p_next_priority, auth.uid()
    );
  end if;

  update public.enrollment_opportunities
  set next_action = nullif(trim(p_next_action), ''),
      next_action_at = case when nullif(trim(p_next_action), '') is null then null else p_next_action_at end,
      updated_at = now()
  where id = v_opportunity_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.update_school_visit_status(p_visit_id uuid, p_status text, p_family_impression text DEFAULT NULL::text, p_objections text DEFAULT NULL::text, p_follow_up_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_opportunity_id uuid;
  v_visit public.school_visits%rowtype;
  v_previous_stage text;
  v_new_stage text;
  v_action text;
  v_next_at timestamptz;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then raise exception 'Usuário não autenticado'; end if;
  if p_status is null or p_status not in ('agendada','confirmada','realizada','faltou','cancelada','reagendada') then
    raise exception 'Status de visita inválido';
  end if;

  select opportunity_id into v_opportunity_id from public.school_visits where id=p_visit_id;
  if not found then raise exception 'Visita não encontrada'; end if;
  -- Mesma ordem das RPCs de agendamento: oportunidade, depois visita.
  select stage into v_previous_stage from public.enrollment_opportunities where id=v_opportunity_id for update;
  select * into v_visit from public.school_visits where id=p_visit_id and opportunity_id=v_opportunity_id for update;
  if not found then raise exception 'Visita não encontrada'; end if;
  if p_status<>v_visit.status and v_previous_stage in ('matriculado','perdido','nutricao') then
    raise exception 'Reative a oportunidade antes de alterar o status da visita';
  end if;
  if v_visit.status='realizada' and p_status<>'realizada' then
    raise exception 'Visita já realizada. Agende uma nova visita se necessário';
  end if;
  if p_status='reagendada' and v_visit.status<>'reagendada' then
    raise exception 'Informe a nova data usando o reagendamento';
  end if;
  if p_status<>v_visit.status and p_status in ('agendada','confirmada','reagendada') then
    if v_visit.scheduled_at <= now() then raise exception 'A data passou. Reagende a visita para um horário futuro'; end if;
    if exists(select 1 from public.school_visits where opportunity_id=v_opportunity_id and id<>p_visit_id
      and status in ('agendada','confirmada','reagendada')) then
      raise exception 'Já existe outra visita ativa para este aluno';
    end if;
  end if;

  update public.school_visits set status=p_status,
    family_impression=case when p_family_impression is null then family_impression else nullif(trim(p_family_impression),'') end,
    objections=case when p_objections is null then objections else nullif(trim(p_objections),'') end,
    follow_up_notes=case when p_follow_up_notes is null then follow_up_notes else nullif(trim(p_follow_up_notes),'') end,
    completed_at=case when p_status='realizada' then coalesce(completed_at,now()) else null end,
    updated_at=now() where id=p_visit_id;
  -- Editar anotações ou repetir a requisição não muda prazos nem duplica histórico.
  if p_status=v_visit.status then return; end if;

  v_new_stage := v_previous_stage;
  if p_status='realizada' then
    if v_previous_stage in ('novo_interessado','tentativa_contato','contato_realizado','qualificado','visita_agendada') then
      v_new_stage := 'visita_realizada';
    end if;
    v_action := 'Realizar retorno após a visita';
    v_next_at := now() + interval '1 day';
  elsif p_status in ('faltou','cancelada') then
    v_action := case when p_status='faltou' then 'Reagendar visita' else 'Retomar contato com a família' end;
    v_next_at := now() + interval '1 day';
  else
    v_action := case when p_status='confirmada' then 'Realizar visita escolar' else 'Confirmar visita com a família' end;
    v_next_at := case when p_status='confirmada' then v_visit.scheduled_at else greatest(now(),v_visit.scheduled_at-interval '1 day') end;
  end if;
  update public.enrollment_opportunities set stage=v_new_stage,
    next_action=v_action,next_action_at=v_next_at,
    status_updated_at=case when stage<>v_new_stage then now() else status_updated_at end,
    updated_at=now() where id=v_opportunity_id;
  if v_new_stage<>v_previous_stage then
    insert into public.enrollment_stage_history(opportunity_id,previous_stage,new_stage,next_action,next_action_at,changed_by)
    values(v_opportunity_id,v_previous_stage,v_new_stage,v_action,v_next_at,auth.uid());
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.recompute_lead_message_cache(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead RECORD;
  v_variants text[] := '{}';
  v_lids text[] := '{}';
  v_phone text;
  v_lid text;
  v_map RECORD;
  v_in_count int := 0;
  v_out_count int := 0;
  v_last_in_msg text; v_last_in_at timestamptz;
  v_last_out_msg text; v_last_out_at timestamptz;
  v_e_in_msg text; v_e_in_at timestamptz;
  v_e_out_msg text; v_e_out_at timestamptz;
BEGIN
  SELECT id, phone, phones, whatsapp_chat_lids, whatsapp_phone_lid_map
    INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF v_lead.id IS NULL THEN RETURN; END IF;

  IF v_lead.phone IS NOT NULL THEN
    v_variants := v_variants || public.whatsapp_phone_variants(v_lead.phone);
  END IF;
  IF v_lead.phones IS NOT NULL THEN
    FOREACH v_phone IN ARRAY v_lead.phones LOOP
      v_variants := v_variants || public.whatsapp_phone_variants(v_phone);
    END LOOP;
  END IF;
  IF v_lead.whatsapp_chat_lids IS NOT NULL THEN
    FOREACH v_lid IN ARRAY v_lead.whatsapp_chat_lids LOOP
      IF v_lid IS NOT NULL AND length(v_lid) > 0 THEN
        v_lids := v_lids || ARRAY[v_lid, replace(v_lid, '@lid', '')];
        v_variants := v_variants || ARRAY[v_lid, replace(v_lid, '@lid', '')];
      END IF;
    END LOOP;
  END IF;
  FOR v_map IN SELECT key, value FROM jsonb_each_text(COALESCE(v_lead.whatsapp_phone_lid_map, '{}'::jsonb)) LOOP
    IF v_map.key IS NOT NULL AND v_map.key <> '' THEN
      v_variants := v_variants || public.whatsapp_phone_variants(v_map.key);
    END IF;
    IF v_map.value IS NOT NULL AND v_map.value <> '' THEN
      v_lids := v_lids || ARRAY[v_map.value, replace(v_map.value, '@lid', '')];
      v_variants := v_variants || ARRAY[v_map.value, replace(v_map.value, '@lid', '')];
    END IF;
  END LOOP;

  v_variants := ARRAY(SELECT DISTINCT v FROM unnest(v_variants) AS v WHERE v IS NOT NULL AND v <> '');
  v_lids := ARRAY(SELECT DISTINCT v FROM unnest(v_lids) AS v WHERE v IS NOT NULL AND v <> '');

  IF array_length(v_variants, 1) IS NOT NULL OR array_length(v_lids, 1) IS NOT NULL THEN
    SELECT COUNT(*) FILTER (WHERE direction = 'inbound'),
           COUNT(*) FILTER (WHERE direction = 'outbound')
      INTO v_in_count, v_out_count
    FROM public.whatsapp_messages
    WHERE phone = ANY(v_variants)
       OR raw_data->>'chatLid' = ANY(v_lids)
       OR raw_data->>'resolvedChatLid' = ANY(v_lids);

    SELECT message, COALESCE(timestamp, created_at) INTO v_last_in_msg, v_last_in_at
    FROM public.whatsapp_messages
    WHERE direction = 'inbound'
      AND (phone = ANY(v_variants) OR raw_data->>'chatLid' = ANY(v_lids) OR raw_data->>'resolvedChatLid' = ANY(v_lids))
    ORDER BY COALESCE(timestamp, created_at) DESC LIMIT 1;

    SELECT message, COALESCE(timestamp, created_at) INTO v_last_out_msg, v_last_out_at
    FROM public.whatsapp_messages
    WHERE direction = 'outbound'
      AND (phone = ANY(v_variants) OR raw_data->>'chatLid' = ANY(v_lids) OR raw_data->>'resolvedChatLid' = ANY(v_lids))
    ORDER BY COALESCE(timestamp, created_at) DESC LIMIT 1;
  END IF;

  SELECT NULLIF(TRIM(COALESCE(NULLIF(TRIM(COALESCE(message, '')), ''), subject, '')), ''), COALESCE(timestamp, created_at)
    INTO v_e_in_msg, v_e_in_at
  FROM public.email_messages
  WHERE lead_id = p_lead_id AND direction = 'inbound'
  ORDER BY COALESCE(timestamp, created_at) DESC LIMIT 1;

  SELECT NULLIF(TRIM(COALESCE(NULLIF(TRIM(COALESCE(message, '')), ''), subject, '')), ''), COALESCE(timestamp, created_at)
    INTO v_e_out_msg, v_e_out_at
  FROM public.email_messages
  WHERE lead_id = p_lead_id AND direction = 'outbound'
  ORDER BY COALESCE(timestamp, created_at) DESC LIMIT 1;

  IF v_e_in_at IS NOT NULL AND (v_last_in_at IS NULL OR v_e_in_at > v_last_in_at) THEN
    v_last_in_msg := v_e_in_msg; v_last_in_at := v_e_in_at;
  END IF;
  IF v_e_out_at IS NOT NULL AND (v_last_out_at IS NULL OR v_e_out_at > v_last_out_at) THEN
    v_last_out_msg := v_e_out_msg; v_last_out_at := v_e_out_at;
  END IF;

  UPDATE public.leads
     SET whatsapp_inbound_count = v_in_count,
         whatsapp_outbound_count = v_out_count,
         last_inbound_message = v_last_in_msg,
         last_inbound_message_at = v_last_in_at,
         last_outbound_message = v_last_out_msg,
         last_outbound_message_at = v_last_out_at
   WHERE id = p_lead_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.email_messages_dedupe_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing public.email_messages;
  v_new_source text;
  v_new_msgid text;
  v_merged_to text[];
  v_merged_cc text[];
  v_merged_bcc text[];
  v_merged_also text[];
  v_new_primary_to text;
  v_new_subject_norm text;
  v_new_from text;
  v_target_msgid text;
BEGIN
  v_new_msgid := COALESCE(
    public.normalize_message_id(NEW.internet_message_id),
    public.extract_internet_message_id(NEW.raw_data),
    CASE WHEN NEW.resend_message_id LIKE '%@%' THEN public.normalize_message_id(NEW.resend_message_id) END
  );
  NEW.internet_message_id := v_new_msgid;

  v_new_source := public.infer_email_source(NEW);
  IF NOT (v_new_source = ANY(COALESCE(NEW.also_received_by, '{}'::text[]))) THEN
    NEW.also_received_by := array_append(COALESCE(NEW.also_received_by, '{}'::text[]), v_new_source);
  END IF;

  IF v_new_msgid IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.email_messages
    WHERE COALESCE(
        public.normalize_message_id(internet_message_id),
        public.extract_internet_message_id(raw_data),
        CASE WHEN resend_message_id LIKE '%@%' THEN public.normalize_message_id(resend_message_id) END
      ) = v_new_msgid
      AND ((lead_id IS NULL AND NEW.lead_id IS NULL) OR lead_id = NEW.lead_id)
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_existing.id IS NULL AND NEW.lead_id IS NOT NULL THEN
      SELECT * INTO v_existing
      FROM public.email_messages
      WHERE COALESCE(
          public.normalize_message_id(internet_message_id),
          public.extract_internet_message_id(raw_data),
          CASE WHEN resend_message_id LIKE '%@%' THEN public.normalize_message_id(resend_message_id) END
        ) = v_new_msgid
        AND lead_id IS NULL
      ORDER BY created_at ASC
      LIMIT 1;

      IF v_existing.id IS NOT NULL THEN
        UPDATE public.email_messages
           SET lead_id = NEW.lead_id,
               internet_message_id = v_new_msgid
         WHERE id = v_existing.id;
        v_existing.lead_id := NEW.lead_id;
        v_existing.internet_message_id := v_new_msgid;
      END IF;
    END IF;
  END IF;

  IF v_existing.id IS NULL
     AND NEW.direction = 'outbound'
     AND NEW.lead_id IS NOT NULL
     AND NEW."timestamp" IS NOT NULL
  THEN
    v_new_primary_to := lower(trim(COALESCE(NEW.recipients_to[1], '')));
    v_new_subject_norm := lower(trim(regexp_replace(COALESCE(NEW.subject, ''), '^(re:\s*|fwd?:\s*)+', '', 'i')));
    v_new_from := lower(trim(COALESCE(
      NEW.raw_data->>'from',
      NEW.raw_data->'headers'->>'From',
      ''
    )));

    IF v_new_primary_to <> '' AND v_new_subject_norm <> '' THEN
      SELECT * INTO v_existing
      FROM public.email_messages
      WHERE lead_id = NEW.lead_id
        AND direction = 'outbound'
        AND "timestamp" BETWEEN NEW."timestamp" - INTERVAL '5 minutes' AND NEW."timestamp" + INTERVAL '5 minutes'
        AND lower(trim(regexp_replace(COALESCE(subject, ''), '^(re:\s*|fwd?:\s*)+', '', 'i'))) = v_new_subject_norm
        AND (
          lower(trim(COALESCE(recipients_to[1], ''))) = v_new_primary_to
          OR v_new_primary_to = ANY(ARRAY(SELECT lower(trim(x)) FROM unnest(COALESCE(recipients_to, '{}'::text[])) x))
        )
        AND (
          v_new_from = ''
          OR lower(trim(COALESCE(raw_data->>'from', raw_data->'headers'->>'From', ''))) = v_new_from
          OR lower(trim(COALESCE(raw_data->>'from', raw_data->'headers'->>'From', ''))) = ''
        )
      ORDER BY ABS(EXTRACT(EPOCH FROM ("timestamp" - NEW."timestamp"))) ASC
      LIMIT 1;
    END IF;
  END IF;

  IF v_existing.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_merged_to := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(v_existing.recipients_to,'{}'::text[]) || COALESCE(NEW.recipients_to,'{}'::text[])) AS x WHERE x IS NOT NULL AND x <> '');
  v_merged_cc := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(v_existing.recipients_cc,'{}'::text[]) || COALESCE(NEW.recipients_cc,'{}'::text[])) AS x WHERE x IS NOT NULL AND x <> '');
  v_merged_bcc := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(v_existing.recipients_bcc,'{}'::text[]) || COALESCE(NEW.recipients_bcc,'{}'::text[])) AS x WHERE x IS NOT NULL AND x <> '');
  v_merged_also := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(v_existing.also_received_by,'{}'::text[]) || COALESCE(NEW.also_received_by,'{}'::text[])) AS x WHERE x IS NOT NULL AND x <> '');

  v_target_msgid := COALESCE(v_new_msgid, v_existing.internet_message_id);
  IF v_target_msgid IS NOT NULL
     AND v_target_msgid <> COALESCE(v_existing.internet_message_id, '')
     AND EXISTS (
       SELECT 1 FROM public.email_messages
       WHERE lead_id = v_existing.lead_id
         AND id <> v_existing.id
         AND lower(internet_message_id) = lower(v_target_msgid)
     )
  THEN
    v_target_msgid := v_existing.internet_message_id;
  END IF;

  UPDATE public.email_messages SET
    recipients_to = v_merged_to,
    recipients_cc = v_merged_cc,
    recipients_bcc = v_merged_bcc,
    also_received_by = v_merged_also,
    message = CASE
      WHEN NEW.message IS NOT NULL AND length(coalesce(NEW.message,'')) > length(coalesce(v_existing.message,''))
        THEN NEW.message ELSE v_existing.message END,
    html_body = CASE
      WHEN NEW.html_body IS NOT NULL AND length(coalesce(NEW.html_body,'')) > length(coalesce(v_existing.html_body,''))
        THEN NEW.html_body ELSE v_existing.html_body END,
    subject = COALESCE(v_existing.subject, NEW.subject),
    outlook_message_id = COALESCE(v_existing.outlook_message_id, NEW.outlook_message_id),
    resend_message_id = COALESCE(v_existing.resend_message_id, NEW.resend_message_id),
    internet_message_id = v_target_msgid,
    "timestamp" = LEAST(COALESCE(v_existing."timestamp", NEW."timestamp"), COALESCE(NEW."timestamp", v_existing."timestamp")),
    raw_data = COALESCE(v_existing.raw_data, '{}'::jsonb) || COALESCE(NEW.raw_data, '{}'::jsonb)
  WHERE id = v_existing.id;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_messages_dedupe_before_insert failed: %', SQLERRM;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_lead_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source text := get_activity_source();
  v_actor text := get_activity_actor();
  status_label_map jsonb := '{"em_aberto":"Em Aberto","em_negociacao":"Negociação","ganho":"Ganho","perdido":"Perdido","produzido":"Produzido","entregue":"Entregue"}'::jsonb;
BEGIN
  -- Mudança de status
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata)
    VALUES (
      NEW.id,
      'status_change',
      'Status alterado de "' || COALESCE(status_label_map->>OLD.status::text, OLD.status::text, 'sem status') || '" para "' || COALESCE(status_label_map->>NEW.status::text, NEW.status::text) || '"',
      v_source, v_actor,
      jsonb_build_object('from', OLD.status, 'to', NEW.status)
    );
  END IF;

  -- Mudança de valor
  IF NEW.valor IS DISTINCT FROM OLD.valor THEN
    INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata)
    VALUES (
      NEW.id, 'lead_field_updated',
      'Valor alterado de ' || COALESCE(OLD.valor::text, 'sem valor') || ' para ' || COALESCE(NEW.valor::text, 'sem valor') || ' ' || COALESCE(NEW.moeda, 'BRL'),
      v_source, v_actor,
      jsonb_build_object('field', 'valor', 'from', OLD.valor, 'to', NEW.valor, 'moeda', NEW.moeda)
    );
  END IF;

  -- Mudança de produto
  IF NEW.produto IS DISTINCT FROM OLD.produto THEN
    INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata)
    VALUES (
      NEW.id, 'lead_field_updated',
      'Produto alterado de "' || COALESCE(OLD.produto, 'sem produto') || '" para "' || COALESCE(NEW.produto, 'sem produto') || '"',
      v_source, v_actor,
      jsonb_build_object('field', 'produto', 'from', OLD.produto, 'to', NEW.produto)
    );
  END IF;

  -- Mudança de valor pago
  IF NEW.valor_pago IS DISTINCT FROM OLD.valor_pago THEN
    INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata)
    VALUES (
      NEW.id, 'payment_recorded',
      'Valor pago atualizado de ' || COALESCE(OLD.valor_pago::text, '0') || ' para ' || COALESCE(NEW.valor_pago::text, '0') || ' ' || COALESCE(NEW.moeda, 'BRL'),
      v_source, v_actor,
      jsonb_build_object('field', 'valor_pago', 'from', OLD.valor_pago, 'to', NEW.valor_pago)
    );
  END IF;

  -- Data de entrega
  IF NEW.delivered_at IS DISTINCT FROM OLD.delivered_at AND NEW.delivered_at IS NOT NULL THEN
    INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata)
    VALUES (NEW.id, 'lead_field_updated', 'Data de entrega registrada', v_source, v_actor,
      jsonb_build_object('field', 'delivered_at', 'value', NEW.delivered_at));
  END IF;

  -- Próximo pagamento
  IF NEW.data_proximo_pagamento IS DISTINCT FROM OLD.data_proximo_pagamento THEN
    INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata)
    VALUES (NEW.id, 'lead_field_updated',
      'Data do próximo pagamento alterada para ' || COALESCE(NEW.data_proximo_pagamento::text, 'sem data'),
      v_source, v_actor,
      jsonb_build_object('field', 'data_proximo_pagamento', 'from', OLD.data_proximo_pagamento, 'to', NEW.data_proximo_pagamento));
  END IF;

  -- Subtipo publicidade
  IF NEW.publicidade_subtipo IS DISTINCT FROM OLD.publicidade_subtipo THEN
    INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata)
    VALUES (NEW.id, 'lead_field_updated',
      'Subtipo de publicidade alterado para "' || COALESCE(NEW.publicidade_subtipo, 'sem subtipo') || '"',
      v_source, v_actor,
      jsonb_build_object('field', 'publicidade_subtipo', 'from', OLD.publicidade_subtipo, 'to', NEW.publicidade_subtipo));
  END IF;

  -- Diagnóstico criado/atualizado
  IF NEW.ai_diagnosis IS DISTINCT FROM OLD.ai_diagnosis AND NEW.ai_diagnosis IS NOT NULL THEN
    INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata)
    VALUES (NEW.id, 'diagnosis_created',
      CASE WHEN OLD.ai_diagnosis IS NULL THEN 'Diagnóstico de IA criado' ELSE 'Diagnóstico de IA atualizado' END,
      v_source, COALESCE(NULLIF(v_actor,'system'),'system'),
      jsonb_build_object('diagnosis', NEW.ai_diagnosis, 'probability', NEW.ai_close_probability));
  END IF;

  -- Descrição criada/atualizada
  IF NEW.description IS DISTINCT FROM OLD.description AND NEW.description IS NOT NULL THEN
    INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata)
    VALUES (NEW.id, 'lead_field_updated',
      CASE WHEN OLD.description IS NULL THEN 'Descrição criada' ELSE 'Descrição atualizada' END,
      v_source, v_actor, jsonb_build_object('field', 'description'));
  END IF;

  -- Proposta enviada
  IF NEW.proposal_sent_at IS DISTINCT FROM OLD.proposal_sent_at AND NEW.proposal_sent_at IS NOT NULL THEN
    INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata)
    VALUES (NEW.id, 'proposal_sent', 'Proposta enviada', v_source, v_actor,
      jsonb_build_object('proposal_url', NEW.proposal_url));
  END IF;

  -- Cliente recorrente toggle
  IF NEW.is_recurring IS DISTINCT FROM OLD.is_recurring THEN
    INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata)
    VALUES (NEW.id, 'lead_field_updated',
      CASE WHEN NEW.is_recurring THEN 'Marcado como cliente recorrente' ELSE 'Removida marcação de cliente recorrente' END,
      v_source, v_actor, jsonb_build_object('field', 'is_recurring', 'value', NEW.is_recurring));
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_lead_note()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata, related_entity_type, related_entity_id)
    VALUES (NEW.lead_id, 'note_added', 'Nota adicionada', get_activity_source(), get_activity_actor(),
      jsonb_build_object('preview', LEFT(NEW.note, 120)), 'lead_notes', NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.note IS DISTINCT FROM OLD.note THEN
    INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata, related_entity_type, related_entity_id)
    VALUES (NEW.lead_id, 'note_updated', 'Nota editada', get_activity_source(), get_activity_actor(),
      jsonb_build_object('preview', LEFT(NEW.note, 120)), 'lead_notes', NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata)
    VALUES (OLD.lead_id, 'note_deleted', 'Nota removida', get_activity_source(), get_activity_actor(), '{}'::jsonb);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_lead_unclassified_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source text := get_activity_source();
  v_actor text := get_activity_actor();
BEGIN
  IF COALESCE(NEW.unclassified, false) IS DISTINCT FROM COALESCE(OLD.unclassified, false) THEN
    IF COALESCE(OLD.unclassified, false) = true AND COALESCE(NEW.unclassified, false) = false THEN
      INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata)
      VALUES (
        NEW.id, 'lead_field_updated',
        'Lead classificado: saiu de "Não Classificado" para oportunidade' ||
          CASE WHEN NEW.produto IS NOT NULL THEN ' (' || NEW.produto || ')' ELSE '' END,
        v_source, v_actor,
        jsonb_build_object('field', 'unclassified', 'from', true, 'to', false, 'produto', NEW.produto)
      );
    ELSE
      INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata)
      VALUES (
        NEW.id, 'lead_field_updated',
        'Lead movido para "Não Classificado"',
        v_source, v_actor,
        jsonb_build_object('field', 'unclassified', 'from', false, 'to', true)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_whatsapp_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source text := get_activity_source();
  v_actor text := get_activity_actor();
  v_preview text;
  v_lead_id uuid;
BEGIN
  v_preview := CASE WHEN NEW.is_audio THEN '[áudio]' ELSE LEFT(COALESCE(NEW.message,''), 80) END;

  FOR v_lead_id IN SELECT public.resolve_lead_ids_by_phone(NEW.phone) LOOP
    INSERT INTO public.activity_log(lead_id, activity_type, description, source, actor, metadata, related_entity_type, related_entity_id)
    VALUES (
      v_lead_id,
      CASE WHEN NEW.direction = 'inbound' THEN 'whatsapp_received' ELSE 'whatsapp_sent' END,
      CASE WHEN NEW.direction = 'inbound'
        THEN 'WhatsApp recebido' || CASE WHEN v_preview <> '' THEN ' — "' || v_preview || '"' ELSE '' END
        ELSE 'WhatsApp enviado' || CASE WHEN v_preview <> '' THEN ' — "' || v_preview || '"' ELSE '' END END,
      v_source,
      CASE WHEN NEW.direction = 'inbound' THEN 'cliente' ELSE v_actor END,
      jsonb_build_object('direction', NEW.direction, 'is_audio', NEW.is_audio, 'phone', NEW.phone),
      'whatsapp_messages', NEW.id
    );
  END LOOP;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_lead_whatsapp_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.lead_id IS NOT NULL THEN
      IF NEW.direction = 'inbound' THEN
        UPDATE public.leads SET whatsapp_inbound_count = COALESCE(whatsapp_inbound_count, 0) + 1 WHERE id = NEW.lead_id;
      ELSIF NEW.direction = 'outbound' THEN
        UPDATE public.leads SET whatsapp_outbound_count = COALESCE(whatsapp_outbound_count, 0) + 1 WHERE id = NEW.lead_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.lead_id IS NOT NULL THEN
      IF OLD.direction = 'inbound' THEN
        UPDATE public.leads SET whatsapp_inbound_count = GREATEST(COALESCE(whatsapp_inbound_count, 0) - 1, 0) WHERE id = OLD.lead_id;
      ELSIF OLD.direction = 'outbound' THEN
        UPDATE public.leads SET whatsapp_outbound_count = GREATEST(COALESCE(whatsapp_outbound_count, 0) - 1, 0) WHERE id = OLD.lead_id;
      END IF;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Se mudou de lead, atualizar contagens de ambos
    IF OLD.lead_id IS DISTINCT FROM NEW.lead_id THEN
      IF OLD.lead_id IS NOT NULL THEN
        IF OLD.direction = 'inbound' THEN
          UPDATE public.leads SET whatsapp_inbound_count = GREATEST(COALESCE(whatsapp_inbound_count, 0) - 1, 0) WHERE id = OLD.lead_id;
        ELSIF OLD.direction = 'outbound' THEN
          UPDATE public.leads SET whatsapp_outbound_count = GREATEST(COALESCE(whatsapp_outbound_count, 0) - 1, 0) WHERE id = OLD.lead_id;
        END IF;
      END IF;
      IF NEW.lead_id IS NOT NULL THEN
        IF NEW.direction = 'inbound' THEN
          UPDATE public.leads SET whatsapp_inbound_count = COALESCE(whatsapp_inbound_count, 0) + 1 WHERE id = NEW.lead_id;
        ELSIF NEW.direction = 'outbound' THEN
          UPDATE public.leads SET whatsapp_outbound_count = COALESCE(whatsapp_outbound_count, 0) + 1 WHERE id = NEW.lead_id;
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.whatsapp_message_recompute_caches()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead_id uuid;
BEGIN
  IF NEW.phone IS NULL THEN RETURN NEW; END IF;
  FOR v_lead_id IN SELECT public.resolve_lead_ids_by_phone(NEW.phone) LOOP
    PERFORM public.recompute_lead_whatsapp_cache(v_lead_id);
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'whatsapp_message_recompute_caches failed: %', SQLERRM;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.auto_fill_status_timestamps()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'nao_convertido' AND NEW.status IN ('novo', 'em_atendimento', 'em_negociacao', 'matriculado', 'resolvido') THEN
    NEW.reopened_at := COALESCE(NEW.reopened_at, now());
  END IF;

  IF NEW.status = 'em_negociacao' AND NEW.negociacao_at IS NULL THEN
    NEW.negociacao_at := now();
  END IF;

  IF NEW.status = 'matriculado' AND NEW.matriculado_at IS NULL THEN
    NEW.matriculado_at := now();
  END IF;

  IF NEW.status = 'nao_convertido' AND NEW.nao_convertido_at IS NULL THEN
    NEW.nao_convertido_at := now();
  END IF;

  IF NEW.status = 'resolvido' AND NEW.resolvido_at IS NULL THEN
    NEW.resolvido_at := now();
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_opportunity_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.recompute_enrollment_score(new.id);
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.verify_school_triage_secret(p_secret text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce(
    nullif(p_secret, '') is not null
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'school_triage_webhook_secret'
        and decrypted_secret = p_secret
    ),
    false
  );
$function$
;
CREATE OR REPLACE FUNCTION public.trigger_school_triage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net'
AS $function$
declare
  v_url text := 'https://xkcxvbagzxwwauofvlin.supabase.co/functions/v1/school-triage';
  v_body jsonb;
  v_secret text;
begin
  if not exists (select 1 from public.system_settings where key = 'escola_agente_ativo' and value = 'true') then
    return new;
  end if;
  if new.direction <> 'inbound' then
    return new;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'school_triage_webhook_secret';

  if v_secret is null then
    raise warning 'trigger_school_triage: internal secret is unavailable';
    return new;
  end if;

  if tg_table_name = 'whatsapp_messages' then
    v_body := jsonb_build_object(
      'channel', 'whatsapp',
      'message_id', new.id,
      'phone', new.phone,
      'text', new.message
    );
  else
    v_body := jsonb_build_object(
      'channel', 'email',
      'message_id', new.id,
      'lead_id', new.lead_id,
      'text', coalesce(new.message, new.subject)
    );
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-school-triage-secret', v_secret
    ),
    body := v_body,
    timeout_milliseconds := 20000
  );

  return new;
exception when others then
  raise warning 'trigger_school_triage failed: %', sqlerrm;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.resolve_handoff_on_human_whatsapp_reply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if new.direction <> 'outbound' then
    return new;
  end if;

  if coalesce(new.raw_data->>'sender_type', '') = 'ana'
     or coalesce(new.raw_data->>'source', '') = 'school-triage'
     or coalesce(new.message, '') like '*[Atendente Ana]*%' then
    return new;
  end if;

  update public.leads
  set triage_status = 'resolvido',
      resolved_at = coalesce(new.created_at, now()),
      handoff_at = null,
      handoff_reason = null
  where id in (select public.resolve_lead_ids_by_phone(new.phone))
    and triage_status = 'aguardando_secretaria';

  update public.ana_followups
  set status = 'cancelled',
      cancel_reason = 'human_replied',
      processed_at = coalesce(processed_at, now())
  where phone = new.phone
    and status in ('pending', 'processing');

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.close_resolved_triage_followups()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if new.triage_status = 'resolvido' and old.triage_status is distinct from 'resolvido' then
    new.resolved_at := coalesce(new.resolved_at, now());
    new.handoff_at := null;
    new.handoff_reason := null;
    update public.ana_followups set status='cancelled', cancel_reason='resolved', processed_at=now()
    where lead_id=new.id and status in ('pending','processing');
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_crm_user_role(p_user_id uuid, p_role app_role, p_actor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if p_role not in ('admin'::public.app_role, 'user'::public.app_role) then
    raise exception 'Perfil inválido';
  end if;
  if p_actor_id = p_user_id then
    raise exception 'Altere seu próprio perfil por outro administrador';
  end if;
  perform pg_advisory_xact_lock(hashtext('crm_user_role_admin_guard'));
  if p_role = 'user'::public.app_role and
     exists (select 1 from public.user_roles where user_id = p_user_id and role = 'admin') and
     (select count(distinct user_id) from public.user_roles where role = 'admin') <= 1 then
    raise exception 'Não é possível remover o último administrador';
  end if;
  delete from public.user_roles where user_id = p_user_id and role <> p_role;
  insert into public.user_roles(user_id, role) values (p_user_id, p_role)
  on conflict (user_id, role) do nothing;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.verify_zapi_webhook_secret(p_secret text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce(nullif(p_secret, '') is not null and exists (
    select 1 from vault.decrypted_secrets
    where name = 'zapi_webhook_secret' and decrypted_secret = p_secret
  ), false)
$function$
;
CREATE OR REPLACE FUNCTION public.get_zapi_webhook_secret()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'zapi_webhook_secret' limit 1
$function$
;
CREATE OR REPLACE FUNCTION public.create_school_enrollment(p_guardian_name text, p_guardian_phone text, p_guardian_email text, p_student_name text, p_academic_year integer, p_desired_grade text, p_desired_shift text DEFAULT NULL::text, p_whatsapp_opt_in boolean DEFAULT false, p_source_channel text DEFAULT 'cadastro_manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_guardian_id uuid;
  v_student_id uuid;
  v_opportunity_id uuid;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then
    raise exception 'Usuário não autenticado';
  end if;
  if nullif(trim(p_guardian_name), '') is null
     or nullif(trim(p_student_name), '') is null
     or nullif(trim(p_desired_grade), '') is null then
    raise exception 'Responsável, aluno e série são obrigatórios';
  end if;
  if p_academic_year not between 2020 and 2100 then
    raise exception 'Ano letivo inválido';
  end if;

  -- Serializa cadastros simultâneos do mesmo telefone dentro da transação.
  if nullif(regexp_replace(coalesce(p_guardian_phone,''),'[^0-9]','','g'),'') is not null then
    perform pg_advisory_xact_lock(hashtextextended(regexp_replace(p_guardian_phone,'[^0-9]','','g'),0));
  end if;

  select id into v_guardian_id
  from public.guardians
  where p_guardian_phone is not null
    and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') =
        regexp_replace(p_guardian_phone, '[^0-9]', '', 'g')
    and regexp_replace(p_guardian_phone, '[^0-9]', '', 'g') <> ''
  limit 1;

  if v_guardian_id is null then
    insert into public.guardians(
      full_name, phone, email, whatsapp_opt_in, consent_recorded_at, created_by
    ) values (
      trim(p_guardian_name), nullif(trim(p_guardian_phone), ''),
      nullif(lower(trim(p_guardian_email)), ''), p_whatsapp_opt_in,
      case when p_whatsapp_opt_in then now() else null end, auth.uid()
    ) returning id into v_guardian_id;
  end if;

  insert into public.students(full_name, created_by)
  values (trim(p_student_name), auth.uid())
  returning id into v_student_id;

  insert into public.student_guardians(
    student_id, guardian_id, relationship, is_primary, is_financially_responsible
  ) values (
    v_student_id, v_guardian_id, 'responsável', true, true
  );

  insert into public.enrollment_opportunities(
    student_id, primary_guardian_id, academic_year, desired_grade,
    desired_shift, source_channel, next_action, next_action_at,
    created_by, assigned_to
  ) values (
    v_student_id, v_guardian_id, p_academic_year, trim(p_desired_grade),
    nullif(trim(p_desired_shift), ''), p_source_channel,
    'Realizar primeiro contato', now(), auth.uid(), auth.uid()
  ) returning id into v_opportunity_id;

  return jsonb_build_object(
    'guardian_id', v_guardian_id,
    'student_id', v_student_id,
    'opportunity_id', v_opportunity_id
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.update_enrollment_progress(p_opportunity_id uuid, p_stage text, p_next_action text DEFAULT NULL::text, p_next_action_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_loss_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_previous_stage text;
  v_score smallint;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then
    raise exception 'Usuário não autenticado';
  end if;
  if p_stage not in (
    'novo_interessado','tentativa_contato','contato_realizado','qualificado',
    'visita_agendada','visita_realizada','condicoes_apresentadas',
    'documentacao_pendente','matricula_em_conclusao','matriculado',
    'nutricao','perdido'
  ) then
    raise exception 'Etapa inválida';
  end if;
  if p_stage = 'perdido' and nullif(trim(p_loss_reason), '') is null then
    raise exception 'Informe o motivo da perda';
  end if;

  select stage into v_previous_stage
  from public.enrollment_opportunities
  where id = p_opportunity_id
  for update;

  if v_previous_stage is null then
    raise exception 'Oportunidade não encontrada';
  end if;

  v_score := case p_stage
    when 'novo_interessado' then 10
    when 'tentativa_contato' then 15
    when 'contato_realizado' then 30
    when 'qualificado' then 50
    when 'visita_agendada' then 65
    when 'visita_realizada' then 75
    when 'condicoes_apresentadas' then 80
    when 'documentacao_pendente' then 88
    when 'matricula_em_conclusao' then 95
    when 'matriculado' then 100
    when 'nutricao' then 25
    when 'perdido' then 0
  end;

  update public.enrollment_opportunities
  set stage = p_stage,
      probability_score = v_score,
      next_action = nullif(trim(p_next_action), ''),
      next_action_at = p_next_action_at,
      loss_reason = case when p_stage = 'perdido' then trim(p_loss_reason) else null end,
      loss_notes = case when p_stage = 'perdido' then loss_notes else null end,
      lost_at = case when p_stage = 'perdido' then now() else null end,
      enrolled_at = case when p_stage = 'matriculado' then coalesce(enrolled_at, now()) else null end,
      status_updated_at = now(),
      updated_at = now()
  where id = p_opportunity_id;

  insert into public.enrollment_stage_history(
    opportunity_id, previous_stage, new_stage, next_action, next_action_at, changed_by
  ) values (
    p_opportunity_id, v_previous_stage, p_stage,
    nullif(trim(p_next_action), ''), p_next_action_at, auth.uid()
  );

  return jsonb_build_object(
    'opportunity_id', p_opportunity_id,
    'previous_stage', v_previous_stage,
    'new_stage', p_stage,
    'probability_score', v_score
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.claim_crm_survey(p_lead_id uuid, p_cycle_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare claimed boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  insert into public.crm_survey_claims (lead_id, cycle_at, state)
  values (p_lead_id, p_cycle_at, 'processing')
  on conflict (lead_id, cycle_at) do update
    set state = 'processing', updated_at = now()
    where crm_survey_claims.state = 'failed'
  returning true into claimed;
  return coalesce(claimed, false);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.register_ana_enrollment(p_lead_id uuid, p_guardian_name text, p_student_name text, p_academic_year integer, p_desired_grade text, p_desired_shift text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_lead public.leads%rowtype;
  v_guardian_id uuid;
  v_student_id uuid;
  v_opportunity_id uuid;
  v_created boolean := false;
begin
  if nullif(btrim(p_guardian_name), '') is null or
     nullif(btrim(p_student_name), '') is null or
     nullif(btrim(p_desired_grade), '') is null or
     p_academic_year not between 2026 and 2100 or
     length(btrim(p_guardian_name)) > 160 or
     length(btrim(p_student_name)) > 160 or
     length(btrim(p_desired_grade)) > 80 then
    raise exception 'Dados insuficientes para cadastro';
  end if;

  -- Serializa chamadas repetidas para o mesmo contato (inclusive retry do webhook).
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found or nullif(regexp_replace(coalesce(v_lead.phone, ''), '\D', '', 'g'), '') is null then
    raise exception 'Contato com telefone não encontrado';
  end if;

  select id into v_guardian_id from public.guardians
  where legacy_lead_id = p_lead_id
  order by created_at limit 1;
  if v_guardian_id is null then
    select id into v_guardian_id from public.guardians
    where regexp_replace(coalesce(phone, ''), '\D', '', 'g') =
          regexp_replace(v_lead.phone, '\D', '', 'g')
    limit 1;
  end if;

  if v_guardian_id is null then
    insert into public.guardians(full_name, phone, email, legacy_lead_id)
    values (btrim(p_guardian_name), v_lead.phone, v_lead.email, p_lead_id)
    returning id into v_guardian_id;
  elsif exists (
    select 1 from public.guardians where id = v_guardian_id
      and lower(btrim(full_name)) <> lower(btrim(p_guardian_name))
  ) then
    raise exception 'Responsável já cadastrado com outro nome; revisão pela secretaria necessária';
  else
    update public.guardians set legacy_lead_id = coalesce(legacy_lead_id, p_lead_id)
    where id = v_guardian_id;
  end if;

  select s.id into v_student_id
  from public.students s join public.student_guardians sg on sg.student_id = s.id
  where sg.guardian_id = v_guardian_id
    and lower(btrim(s.full_name)) = lower(btrim(p_student_name))
  order by s.created_at limit 1;
  if v_student_id is null then
    insert into public.students(full_name) values (btrim(p_student_name))
    returning id into v_student_id;
    insert into public.student_guardians(student_id, guardian_id, relationship, is_primary)
    values (v_student_id, v_guardian_id, 'responsável', true);
  end if;

  select id into v_opportunity_id from public.enrollment_opportunities
  where student_id = v_student_id and academic_year = p_academic_year
    and lower(btrim(desired_grade)) = lower(btrim(p_desired_grade))
  order by created_at limit 1;
  if v_opportunity_id is null then
    insert into public.enrollment_opportunities(
      student_id, primary_guardian_id, legacy_lead_id, academic_year,
      desired_grade, desired_shift, source_channel, next_action, next_action_at
    ) values (
      v_student_id, v_guardian_id, p_lead_id, p_academic_year,
      btrim(p_desired_grade), nullif(btrim(p_desired_shift), ''),
      'ana_whatsapp', 'Secretaria: confirmar interesse e próximos passos', now()
    ) returning id into v_opportunity_id;
    v_created := true;
  elsif nullif(btrim(p_desired_shift), '') is not null then
    -- Um turno informado mais tarde completa o mesmo interesse; não gera outro aluno no funil.
    update public.enrollment_opportunities
      set desired_shift = nullif(btrim(p_desired_shift), '')
    where id = v_opportunity_id and desired_shift is null;
  end if;

  return jsonb_build_object('guardian_id', v_guardian_id,
    'student_id', v_student_id, 'opportunity_id', v_opportunity_id,
    'created', v_created);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.register_ana_school_visit(p_lead_id uuid, p_opportunity_id uuid, p_scheduled_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_stage text;
  v_visit_id uuid;
begin
  if p_scheduled_at is null or not isfinite(p_scheduled_at) or p_scheduled_at < now() + interval '1 hour' then
    raise exception 'Data e horário da visita inválidos';
  end if;

  -- Impede que mensagens repetidas criem duas visitas ou avancem duas vezes no funil.
  perform 1 from public.leads where id = p_lead_id for update;
  if not found then raise exception 'Contato não encontrado'; end if;

  select stage into v_stage from public.enrollment_opportunities
  where id = p_opportunity_id and legacy_lead_id = p_lead_id for update;
  if not found or v_stage in ('matriculado', 'perdido') then
    raise exception 'Oportunidade ativa do contato não encontrada';
  end if;

  select id into v_visit_id from public.school_visits
  where opportunity_id = p_opportunity_id
    and status in ('agendada', 'confirmada', 'reagendada')
  order by created_at desc limit 1;
  if v_visit_id is not null then
    if exists (select 1 from public.school_visits
      where id = v_visit_id and scheduled_at = p_scheduled_at) then
      return v_visit_id;
    end if;
    raise exception 'Já existe visita ativa para este aluno; secretaria deve revisar ou reagendar';
  end if;

  insert into public.school_visits(opportunity_id, scheduled_at, follow_up_notes)
  values (p_opportunity_id, p_scheduled_at,
    'Solicitada pela família à atendente virtual; secretaria deve confirmar disponibilidade.')
  returning id into v_visit_id;

  update public.enrollment_opportunities set
    stage = 'visita_agendada', probability_score = greatest(probability_score, 65),
    next_action = 'Secretaria: confirmar disponibilidade da visita',
    next_action_at = now(), status_updated_at = now(), updated_at = now()
  where id = p_opportunity_id;

  insert into public.enrollment_stage_history(
    opportunity_id, previous_stage, new_stage, next_action, next_action_at, changed_by
  ) values (
    p_opportunity_id, v_stage, 'visita_agendada',
    'Secretaria: confirmar disponibilidade da visita', now(), null
  );
  return v_visit_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.schedule_school_visit(p_opportunity_id uuid, p_scheduled_at timestamp with time zone, p_participants text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_visit public.school_visits%rowtype;
  v_visit_id uuid;
  v_previous_stage text;
  v_new_stage text;
  v_next_at timestamptz;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then raise exception 'Usuário não autenticado'; end if;
  if p_scheduled_at is null or not isfinite(p_scheduled_at) or p_scheduled_at <= now() then
    raise exception 'Informe uma data e horário futuros para a visita';
  end if;

  select stage into v_previous_stage from public.enrollment_opportunities
  where id = p_opportunity_id for update;
  if not found then raise exception 'Oportunidade não encontrada'; end if;
  if v_previous_stage in ('matriculado','perdido','nutricao') then
    raise exception 'A oportunidade precisa estar ativa para agendar uma visita';
  end if;
  select * into v_visit from public.school_visits
  where opportunity_id = p_opportunity_id and status in ('agendada','confirmada','reagendada')
  order by created_at desc limit 1 for update;
  if found then
    if v_visit.scheduled_at = p_scheduled_at then return v_visit.id; end if;
    raise exception 'Já existe visita ativa para este aluno. Use Registrar para reagendá-la';
  end if;

  insert into public.school_visits(opportunity_id,scheduled_at,participants,follow_up_notes,assigned_to)
  values (p_opportunity_id,p_scheduled_at,nullif(trim(p_participants),''),nullif(trim(p_notes),''),auth.uid())
  returning id into v_visit_id;
  v_new_stage := case when v_previous_stage in ('novo_interessado','tentativa_contato','contato_realizado','qualificado')
    then 'visita_agendada' else v_previous_stage end;
  v_next_at := greatest(now(), p_scheduled_at - interval '1 day');
  update public.enrollment_opportunities set stage=v_new_stage,
    next_action='Confirmar visita com a família', next_action_at=v_next_at,
    status_updated_at=case when stage<>v_new_stage then now() else status_updated_at end,
    updated_at=now() where id=p_opportunity_id;
  if v_new_stage <> v_previous_stage then
    insert into public.enrollment_stage_history(opportunity_id,previous_stage,new_stage,next_action,next_action_at,changed_by)
    values(p_opportunity_id,v_previous_stage,v_new_stage,'Confirmar visita com a família',v_next_at,auth.uid());
  end if;
  return v_visit_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.reschedule_school_visit(p_visit_id uuid, p_scheduled_at timestamp with time zone, p_follow_up_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_opportunity_id uuid;
  v_visit public.school_visits%rowtype;
  v_stage text;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'user'::public.app_role)
  ) then raise exception 'Usuário não autenticado'; end if;
  if p_scheduled_at is null or not isfinite(p_scheduled_at) or p_scheduled_at<=now() then
    raise exception 'Informe uma data e horário futuros para a visita';
  end if;
  select opportunity_id into v_opportunity_id from public.school_visits where id=p_visit_id;
  if not found then raise exception 'Visita não encontrada'; end if;
  select stage into v_stage from public.enrollment_opportunities where id=v_opportunity_id for update;
  select * into v_visit from public.school_visits where id=p_visit_id and opportunity_id=v_opportunity_id for update;
  if not found then raise exception 'Visita não encontrada'; end if;
  if v_stage in ('matriculado','perdido','nutricao') then raise exception 'A oportunidade precisa estar ativa para reagendar'; end if;
  if v_visit.status='realizada' then raise exception 'Visita já realizada. Agende uma nova visita se necessário'; end if;
  if exists(select 1 from public.school_visits where opportunity_id=v_opportunity_id and id<>p_visit_id
    and status in ('agendada','confirmada','reagendada')) then raise exception 'Já existe outra visita ativa para este aluno'; end if;
  if p_scheduled_at=v_visit.scheduled_at and v_visit.status<>'reagendada' then
    raise exception 'Escolha um novo horário para reagendar';
  end if;

  update public.school_visits set status='reagendada',scheduled_at=p_scheduled_at,completed_at=null,
    follow_up_notes=case when p_follow_up_notes is null then follow_up_notes else nullif(trim(p_follow_up_notes),'') end,
    updated_at=now() where id=p_visit_id;
  if v_visit.status='reagendada' and v_visit.scheduled_at=p_scheduled_at then return; end if;
  update public.enrollment_opportunities set
    next_action='Confirmar novo horário da visita com a família',
    next_action_at=greatest(now(),p_scheduled_at-interval '1 day'),updated_at=now()
  where id=v_opportunity_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION audit_private.capture_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_old jsonb;
  v_new jsonb;
  v_actor_id uuid;
  v_actor_email text;
  v_record_id text;
  v_changed_fields text[];
begin
  v_actor_id := auth.uid();

  -- Integrações e rotinas de serviço não têm usuário humano no JWT. As ações
  -- administrativas de Auth são registradas explicitamente pela Edge Function.
  if v_actor_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;

  select case
      when count(*) = 1 and max(a.attname) = 'id'
        then max(coalesce(v_new ->> a.attname, v_old ->> a.attname))
      else jsonb_object_agg(a.attname, coalesce(v_new -> a.attname, v_old -> a.attname) order by k.ordinality)::text
    end
    into v_record_id
  from pg_index i
  cross join lateral unnest(i.indkey) with ordinality as k(attnum, ordinality)
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = tg_relid
    and i.indisprimary;

  if tg_op = 'INSERT' then
    select coalesce(array_agg(field_name order by field_name), '{}'::text[])
      into v_changed_fields
    from jsonb_object_keys(v_new) as fields(field_name);
  elsif tg_op = 'DELETE' then
    select coalesce(array_agg(field_name order by field_name), '{}'::text[])
      into v_changed_fields
    from jsonb_object_keys(v_old) as fields(field_name);
  else
    select coalesce(array_agg(field_name order by field_name), '{}'::text[])
      into v_changed_fields
    from (
      select jsonb_object_keys(v_old) as field_name
      union
      select jsonb_object_keys(v_new) as field_name
    ) as fields
    where v_old -> field_name is distinct from v_new -> field_name;
  end if;

  v_actor_email := auth.jwt() ->> 'email';

  insert into public.audit_logs (
    actor_id, actor_email, operation, schema_name, table_name, record_id,
    changed_fields, outcome
  ) values (
    v_actor_id, v_actor_email, tg_op, tg_table_schema, tg_table_name,
    v_record_id, v_changed_fields, 'success'
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$
;
REVOKE ALL ON FUNCTION audit_private.capture_audit_log() FROM PUBLIC, anon, authenticated;
ALTER TABLE public."delivery_logs" ADD CONSTRAINT "delivery_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."email_attachments" ADD CONSTRAINT "email_attachments_pkey" PRIMARY KEY (id);
ALTER TABLE public."email_messages" ADD CONSTRAINT "email_messages_pkey" PRIMARY KEY (id);
ALTER TABLE public."lead_notes" ADD CONSTRAINT "lead_notes_pkey" PRIMARY KEY (id);
ALTER TABLE public."scheduled_followups" ADD CONSTRAINT "scheduled_followups_lead_id_key" UNIQUE (lead_id);
ALTER TABLE public."scheduled_followups" ADD CONSTRAINT "scheduled_followups_pkey" PRIMARY KEY (id);
ALTER TABLE public."user_presence" ADD CONSTRAINT "user_presence_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."user_product_access" ADD CONSTRAINT "user_product_access_pkey" PRIMARY KEY (id);
ALTER TABLE public."user_product_access" ADD CONSTRAINT "user_product_access_user_id_produto_key" UNIQUE (user_id, produto);
ALTER TABLE public."whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_direction_check" CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])));
ALTER TABLE public."whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY (id);
ALTER TABLE public."user_roles" ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY (id);
ALTER TABLE public."user_roles" ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE (user_id, role);
ALTER TABLE public."activity_log" ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY (id);
ALTER TABLE public."system_settings" ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY (key);
ALTER TABLE public."leads" ADD CONSTRAINT "leads_ai_close_probability_check" CHECK (((ai_close_probability >= 0) AND (ai_close_probability <= 100)));
ALTER TABLE public."leads" ADD CONSTRAINT "leads_attention_level_check" CHECK (((attention_level IS NULL) OR (attention_level = ANY (ARRAY['urgente'::text, 'atencao'::text, 'normal'::text, 'externo'::text]))));
ALTER TABLE public."leads" ADD CONSTRAINT "leads_email_valid" CHECK (((email IS NULL) OR (email = ''::text) OR (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text)));
ALTER TABLE public."leads" ADD CONSTRAINT "leads_moeda_check" CHECK ((moeda = ANY (ARRAY['BRL'::text, 'USD'::text, 'EUR'::text])));
ALTER TABLE public."leads" ADD CONSTRAINT "leads_pkey" PRIMARY KEY (id);
ALTER TABLE public."school_units" ADD CONSTRAINT "school_units_code_key" UNIQUE (code);
ALTER TABLE public."school_units" ADD CONSTRAINT "school_units_pkey" PRIMARY KEY (id);
ALTER TABLE public."guardians" ADD CONSTRAINT "guardians_pkey" PRIMARY KEY (id);
ALTER TABLE public."students" ADD CONSTRAINT "students_pkey" PRIMARY KEY (id);
ALTER TABLE public."student_guardians" ADD CONSTRAINT "student_guardians_pkey" PRIMARY KEY (student_id, guardian_id);
ALTER TABLE public."enrollment_opportunities" ADD CONSTRAINT "enrollment_opportunities_academic_year_check" CHECK (((academic_year >= 2020) AND (academic_year <= 2100)));
ALTER TABLE public."enrollment_opportunities" ADD CONSTRAINT "enrollment_opportunities_check" CHECK (((stage <> 'perdido'::text) OR (loss_reason IS NOT NULL)));
ALTER TABLE public."enrollment_opportunities" ADD CONSTRAINT "enrollment_opportunities_check1" CHECK (((stage <> 'matriculado'::text) OR (enrolled_at IS NOT NULL)));
ALTER TABLE public."enrollment_opportunities" ADD CONSTRAINT "enrollment_opportunities_data_confidence_check" CHECK (((data_confidence >= 0) AND (data_confidence <= 100)));
ALTER TABLE public."enrollment_opportunities" ADD CONSTRAINT "enrollment_opportunities_pkey" PRIMARY KEY (id);
ALTER TABLE public."enrollment_opportunities" ADD CONSTRAINT "enrollment_opportunities_probability_score_check" CHECK (((probability_score >= 0) AND (probability_score <= 100)));
ALTER TABLE public."enrollment_opportunities" ADD CONSTRAINT "enrollment_opportunities_stage_check" CHECK ((stage = ANY (ARRAY['novo_interessado'::text, 'tentativa_contato'::text, 'contato_realizado'::text, 'qualificado'::text, 'visita_agendada'::text, 'visita_realizada'::text, 'condicoes_apresentadas'::text, 'documentacao_pendente'::text, 'matricula_em_conclusao'::text, 'matriculado'::text, 'nutricao'::text, 'perdido'::text])));
ALTER TABLE public."enrollment_stage_history" ADD CONSTRAINT "enrollment_stage_history_pkey" PRIMARY KEY (id);
ALTER TABLE public."school_capacity" ADD CONSTRAINT "school_capacity_academic_year_check" CHECK (((academic_year >= 2020) AND (academic_year <= 2100)));
ALTER TABLE public."school_capacity" ADD CONSTRAINT "school_capacity_check" CHECK (((reserved_seats + enrolled_seats) <= total_seats));
ALTER TABLE public."school_capacity" ADD CONSTRAINT "school_capacity_enrolled_seats_check" CHECK ((enrolled_seats >= 0));
ALTER TABLE public."school_capacity" ADD CONSTRAINT "school_capacity_pkey" PRIMARY KEY (id);
ALTER TABLE public."school_capacity" ADD CONSTRAINT "school_capacity_reserved_seats_check" CHECK ((reserved_seats >= 0));
ALTER TABLE public."school_capacity" ADD CONSTRAINT "school_capacity_total_seats_check" CHECK ((total_seats >= 0));
ALTER TABLE public."school_capacity" ADD CONSTRAINT "school_capacity_unit_id_academic_year_grade_shift_key" UNIQUE (unit_id, academic_year, grade, shift);
ALTER TABLE public."school_visits" ADD CONSTRAINT "school_visits_pkey" PRIMARY KEY (id);
ALTER TABLE public."school_visits" ADD CONSTRAINT "school_visits_status_check" CHECK ((status = ANY (ARRAY['agendada'::text, 'confirmada'::text, 'realizada'::text, 'faltou'::text, 'cancelada'::text, 'reagendada'::text])));
ALTER TABLE public."enrollment_tasks" ADD CONSTRAINT "enrollment_tasks_pkey" PRIMARY KEY (id);
ALTER TABLE public."enrollment_tasks" ADD CONSTRAINT "enrollment_tasks_priority_check" CHECK ((priority = ANY (ARRAY['baixa'::text, 'normal'::text, 'alta'::text, 'urgente'::text])));
ALTER TABLE public."enrollment_tasks" ADD CONSTRAINT "enrollment_tasks_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'em_andamento'::text, 'concluida'::text, 'cancelada'::text])));
ALTER TABLE public."ana_followups" ADD CONSTRAINT "ana_followups_lead_id_handoff_at_key" UNIQUE (lead_id, handoff_at);
ALTER TABLE public."ana_followups" ADD CONSTRAINT "ana_followups_pkey" PRIMARY KEY (id);
ALTER TABLE public."ana_followups" ADD CONSTRAINT "ana_followups_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'cancelled'::text, 'failed'::text])));
ALTER TABLE public."crm_survey_claims" ADD CONSTRAINT "crm_survey_claims_pkey" PRIMARY KEY (lead_id, cycle_at);
ALTER TABLE public."crm_survey_claims" ADD CONSTRAINT "crm_survey_claims_state_check" CHECK ((state = ANY (ARRAY['processing'::text, 'sent'::text, 'failed'::text])));
ALTER TABLE public."audit_logs" ADD CONSTRAINT "audit_logs_operation_check" CHECK ((operation = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])));
ALTER TABLE public."audit_logs" ADD CONSTRAINT "audit_logs_outcome_check" CHECK ((outcome = ANY (ARRAY['started'::text, 'success'::text, 'failed'::text])));
ALTER TABLE public."audit_logs" ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."delivery_logs" ADD CONSTRAINT "delivery_logs_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public."email_attachments" ADD CONSTRAINT "email_attachments_email_message_id_fkey" FOREIGN KEY (email_message_id) REFERENCES email_messages(id) ON DELETE CASCADE;
ALTER TABLE public."email_attachments" ADD CONSTRAINT "email_attachments_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public."email_attachments" ADD CONSTRAINT "email_attachments_whatsapp_message_id_fkey" FOREIGN KEY (whatsapp_message_id) REFERENCES whatsapp_messages(id) ON DELETE SET NULL;
ALTER TABLE public."email_messages" ADD CONSTRAINT "email_messages_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public."scheduled_followups" ADD CONSTRAINT "scheduled_followups_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public."user_presence" ADD CONSTRAINT "user_presence_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."user_product_access" ADD CONSTRAINT "user_product_access_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."guardians" ADD CONSTRAINT "guardians_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."guardians" ADD CONSTRAINT "guardians_legacy_lead_id_fkey" FOREIGN KEY (legacy_lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public."students" ADD CONSTRAINT "students_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_fkey" FOREIGN KEY (guardian_id) REFERENCES guardians(id) ON DELETE CASCADE;
ALTER TABLE public."student_guardians" ADD CONSTRAINT "student_guardians_student_id_fkey" FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
ALTER TABLE public."enrollment_opportunities" ADD CONSTRAINT "enrollment_opportunities_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."enrollment_opportunities" ADD CONSTRAINT "enrollment_opportunities_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."enrollment_opportunities" ADD CONSTRAINT "enrollment_opportunities_legacy_lead_id_fkey" FOREIGN KEY (legacy_lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public."enrollment_opportunities" ADD CONSTRAINT "enrollment_opportunities_primary_guardian_id_fkey" FOREIGN KEY (primary_guardian_id) REFERENCES guardians(id) ON DELETE SET NULL;
ALTER TABLE public."enrollment_opportunities" ADD CONSTRAINT "enrollment_opportunities_student_id_fkey" FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
ALTER TABLE public."enrollment_opportunities" ADD CONSTRAINT "enrollment_opportunities_unit_id_fkey" FOREIGN KEY (unit_id) REFERENCES school_units(id) ON DELETE SET NULL;
ALTER TABLE public."enrollment_stage_history" ADD CONSTRAINT "enrollment_stage_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."enrollment_stage_history" ADD CONSTRAINT "enrollment_stage_history_opportunity_id_fkey" FOREIGN KEY (opportunity_id) REFERENCES enrollment_opportunities(id) ON DELETE CASCADE;
ALTER TABLE public."school_capacity" ADD CONSTRAINT "school_capacity_unit_id_fkey" FOREIGN KEY (unit_id) REFERENCES school_units(id) ON DELETE CASCADE;
ALTER TABLE public."school_visits" ADD CONSTRAINT "school_visits_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."school_visits" ADD CONSTRAINT "school_visits_opportunity_id_fkey" FOREIGN KEY (opportunity_id) REFERENCES enrollment_opportunities(id) ON DELETE CASCADE;
ALTER TABLE public."enrollment_tasks" ADD CONSTRAINT "enrollment_tasks_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."enrollment_tasks" ADD CONSTRAINT "enrollment_tasks_opportunity_id_fkey" FOREIGN KEY (opportunity_id) REFERENCES enrollment_opportunities(id) ON DELETE CASCADE;
ALTER TABLE public."ana_followups" ADD CONSTRAINT "ana_followups_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public."crm_survey_claims" ADD CONSTRAINT "crm_survey_claims_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public."audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX idx_email_attachments_lead_hash ON public.email_attachments USING btree (lead_id, content_hash) WHERE (content_hash IS NOT NULL);
CREATE INDEX idx_email_attachments_whatsapp_message_id ON public.email_attachments USING btree (whatsapp_message_id);
CREATE INDEX email_messages_internet_msgid_idx ON public.email_messages USING btree (lower(internet_message_id)) WHERE (internet_message_id IS NOT NULL);
CREATE UNIQUE INDEX email_messages_lead_msgid_uidx ON public.email_messages USING btree (lead_id, lower(internet_message_id)) WHERE ((internet_message_id IS NOT NULL) AND (lead_id IS NOT NULL));
CREATE UNIQUE INDEX email_messages_orphan_msgid_uidx ON public.email_messages USING btree (lower(internet_message_id)) WHERE ((internet_message_id IS NOT NULL) AND (lead_id IS NULL));
CREATE UNIQUE INDEX email_messages_outlook_msgid_uidx ON public.email_messages USING btree (outlook_message_id) WHERE (outlook_message_id IS NOT NULL);
CREATE INDEX idx_email_messages_followup_intent ON public.email_messages USING btree (lead_id, direction, "timestamp" DESC) WHERE (direction = 'inbound'::text);
CREATE INDEX idx_email_messages_lead_id ON public.email_messages USING btree (lead_id);
CREATE INDEX idx_email_messages_timestamp ON public.email_messages USING btree ("timestamp" DESC);
CREATE INDEX idx_scheduled_followups_pending ON public.scheduled_followups USING btree (next_run_at) WHERE (status = 'pending'::text);
CREATE INDEX idx_whatsapp_messages_created_at ON public.whatsapp_messages USING btree (created_at DESC);
CREATE INDEX idx_whatsapp_messages_lead_id ON public.whatsapp_messages USING btree (lead_id);
CREATE INDEX idx_whatsapp_messages_phone ON public.whatsapp_messages USING btree (phone);
CREATE INDEX whatsapp_messages_phone_idx ON public.whatsapp_messages USING btree (phone);
CREATE INDEX idx_activity_log_activity_type ON public.activity_log USING btree (activity_type);
CREATE INDEX idx_activity_log_lead_id_created_at ON public.activity_log USING btree (lead_id, created_at DESC);
CREATE INDEX idx_activity_log_user_id ON public.activity_log USING btree (user_id, created_at DESC);
CREATE INDEX idx_leads_assunto ON public.leads USING btree (assunto);
CREATE INDEX idx_leads_delivered_at ON public.leads USING btree (delivered_at) WHERE (delivered_at IS NOT NULL);
CREATE INDEX idx_leads_email_delivered ON public.leads USING btree (email) WHERE (delivered_at IS NOT NULL);
CREATE INDEX idx_leads_emails_gin ON public.leads USING gin (emails);
CREATE INDEX idx_leads_language ON public.leads USING btree (language) WHERE (language IS NOT NULL);
CREATE INDEX idx_leads_phone ON public.leads USING btree (phone);
CREATE INDEX idx_leads_phone_delivered ON public.leads USING btree (phone) WHERE (delivered_at IS NOT NULL);
CREATE INDEX idx_leads_phones_gin ON public.leads USING gin (phones);
CREATE INDEX idx_leads_triage_status ON public.leads USING btree (triage_status);
CREATE INDEX idx_leads_unclassified ON public.leads USING btree (unclassified) WHERE (unclassified = true);
CREATE INDEX idx_leads_updated_at ON public.leads USING btree (updated_at DESC);
CREATE INDEX idx_leads_whatsapp_chat_lids ON public.leads USING gin (whatsapp_chat_lids);
CREATE INDEX idx_leads_language_null_active ON public.leads USING btree (status) WHERE (language IS NULL);
CREATE INDEX idx_leads_status ON public.leads USING btree (status);
CREATE INDEX guardians_legacy_lead_idx ON public.guardians USING btree (legacy_lead_id);
CREATE UNIQUE INDEX guardians_phone_unique ON public.guardians USING btree (regexp_replace(phone, '[^0-9]'::text, ''::text, 'g'::text)) WHERE ((phone IS NOT NULL) AND (regexp_replace(phone, '[^0-9]'::text, ''::text, 'g'::text) <> ''::text));
CREATE UNIQUE INDEX enrollment_opportunity_cycle_unique ON public.enrollment_opportunities USING btree (student_id, academic_year, desired_grade, COALESCE(desired_shift, ''::text), COALESCE((unit_id)::text, ''::text));
CREATE INDEX enrollment_opportunities_stage_idx ON public.enrollment_opportunities USING btree (stage);
CREATE INDEX enrollment_opportunities_next_action_idx ON public.enrollment_opportunities USING btree (next_action_at) WHERE (stage <> ALL (ARRAY['matriculado'::text, 'perdido'::text]));
CREATE INDEX enrollment_opportunities_assigned_idx ON public.enrollment_opportunities USING btree (assigned_to);
CREATE INDEX enrollment_opportunities_legacy_lead_idx ON public.enrollment_opportunities USING btree (legacy_lead_id);
CREATE INDEX enrollment_stage_history_opportunity_idx ON public.enrollment_stage_history USING btree (opportunity_id, created_at DESC);
CREATE INDEX school_visits_schedule_idx ON public.school_visits USING btree (scheduled_at, status);
CREATE INDEX school_visits_opportunity_active_idx ON public.school_visits USING btree (opportunity_id) WHERE (status = ANY (ARRAY['agendada'::text, 'confirmada'::text, 'reagendada'::text]));
CREATE INDEX enrollment_tasks_due_idx ON public.enrollment_tasks USING btree (due_at, status);
CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at DESC);
CREATE INDEX audit_logs_actor_created_at_idx ON public.audit_logs USING btree (actor_id, created_at DESC);
CREATE POLICY "Activity DELETE admin" ON "public"."activity_log" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_admin(auth.uid()));
CREATE POLICY "Leads UPDATE autenticados" ON "public"."leads" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role))) WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "Admins manage product access" ON "public"."user_product_access" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Attach DELETE admin" ON "public"."email_attachments" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_admin(auth.uid()));
CREATE POLICY "Attach SELECT" ON "public"."email_attachments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((auth.uid() IS NOT NULL) AND (is_admin(auth.uid()) OR ((lead_id IS NOT NULL) AND user_can_access_lead(auth.uid(), lead_id)))));
CREATE POLICY "Attach UPDATE" ON "public"."email_attachments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((auth.uid() IS NOT NULL) AND (is_admin(auth.uid()) OR ((lead_id IS NOT NULL) AND user_can_access_lead(auth.uid(), lead_id)))));
CREATE POLICY "WA SELECT autenticados" ON "public"."whatsapp_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "WA UPDATE autenticados" ON "public"."whatsapp_messages" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role))) WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "Delivery SELECT" ON "public"."delivery_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((auth.uid() IS NOT NULL) AND (is_admin(auth.uid()) OR ((lead_id IS NOT NULL) AND user_can_access_lead(auth.uid(), lead_id)))));
CREATE POLICY "Email DELETE admin" ON "public"."email_messages" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_admin(auth.uid()));
CREATE POLICY "Followup DELETE" ON "public"."scheduled_followups" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_admin(auth.uid()));
CREATE POLICY "Followup SELECT" ON "public"."scheduled_followups" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((auth.uid() IS NOT NULL) AND (is_admin(auth.uid()) OR ((lead_id IS NOT NULL) AND user_can_access_lead(auth.uid(), lead_id)))));
CREATE POLICY "Followup UPDATE" ON "public"."scheduled_followups" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((auth.uid() IS NOT NULL) AND (is_admin(auth.uid()) OR ((lead_id IS NOT NULL) AND user_can_access_lead(auth.uid(), lead_id)))));
CREATE POLICY "Leads DELETE por produto" ON "public"."leads" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((auth.uid() IS NOT NULL) AND is_admin(auth.uid())));
CREATE POLICY "Email SELECT autenticados" ON "public"."email_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "Email INSERT autenticado" ON "public"."email_messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "Notes DELETE" ON "public"."lead_notes" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((auth.uid() IS NOT NULL) AND (is_admin(auth.uid()) OR user_can_access_lead(auth.uid(), lead_id))));
CREATE POLICY "Notes INSERT" ON "public"."lead_notes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((auth.uid() IS NOT NULL) AND (is_admin(auth.uid()) OR user_can_access_lead(auth.uid(), lead_id))));
CREATE POLICY "Notes SELECT" ON "public"."lead_notes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((auth.uid() IS NOT NULL) AND (is_admin(auth.uid()) OR user_can_access_lead(auth.uid(), lead_id))));
CREATE POLICY "Notes UPDATE" ON "public"."lead_notes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((auth.uid() IS NOT NULL) AND (is_admin(auth.uid()) OR user_can_access_lead(auth.uid(), lead_id))));
CREATE POLICY "Users can view their own roles" ON "public"."user_roles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id = auth.uid()) OR is_admin(auth.uid())));
CREATE POLICY "Users view their product access" ON "public"."user_product_access" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id = auth.uid()) OR is_admin(auth.uid())));
CREATE POLICY "WA DELETE admin" ON "public"."whatsapp_messages" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_admin(auth.uid()));
CREATE POLICY "Leads INSERT autenticados" ON "public"."leads" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "WA INSERT autenticado" ON "public"."whatsapp_messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "admins read all presence" ON "public"."user_presence" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_admin(auth.uid()));
CREATE POLICY "users manage own presence" ON "public"."user_presence" AS PERMISSIVE FOR ALL TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Leads SELECT autenticados" ON "public"."leads" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "Admins can insert settings" ON "public"."system_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_admin(( SELECT auth.uid() AS uid)));
CREATE POLICY "Admins can update settings" ON "public"."system_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_admin(( SELECT auth.uid() AS uid))) WITH CHECK (is_admin(( SELECT auth.uid() AS uid)));
CREATE POLICY "crm_v2_select" ON "public"."guardians" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_insert" ON "public"."guardians" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_update" ON "public"."guardians" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_delete" ON "public"."guardians" AS PERMISSIVE FOR DELETE TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "crm_v2_select" ON "public"."students" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_insert" ON "public"."students" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_update" ON "public"."students" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_delete" ON "public"."students" AS PERMISSIVE FOR DELETE TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "crm_v2_select" ON "public"."student_guardians" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_insert" ON "public"."student_guardians" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_select" ON "public"."school_visits" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_update" ON "public"."student_guardians" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_delete" ON "public"."student_guardians" AS PERMISSIVE FOR DELETE TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "crm_v2_select" ON "public"."enrollment_opportunities" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_insert" ON "public"."enrollment_opportunities" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_update" ON "public"."enrollment_opportunities" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_delete" ON "public"."enrollment_opportunities" AS PERMISSIVE FOR DELETE TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "crm_v2_delete" ON "public"."enrollment_tasks" AS PERMISSIVE FOR DELETE TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "crm_v2_insert" ON "public"."school_visits" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_update" ON "public"."school_visits" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_delete" ON "public"."school_visits" AS PERMISSIVE FOR DELETE TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "crm_v2_select" ON "public"."enrollment_tasks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_insert" ON "public"."enrollment_tasks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "crm_v2_update" ON "public"."enrollment_tasks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role)));
CREATE POLICY "Administrators read audit logs" ON "public"."audit_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_admin(( SELECT auth.uid() AS uid)));
CREATE POLICY "Email UPDATE autenticados" ON "public"."email_messages" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role))) WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "Activity SELECT autenticados" ON "public"."activity_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "Activity INSERT" ON "public"."activity_log" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "Delivery INSERT" ON "public"."delivery_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "Attach INSERT" ON "public"."email_attachments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "Followup INSERT" ON "public"."scheduled_followups" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "Authenticated users can read settings" ON "public"."system_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "school_capacity_read" ON "public"."school_capacity" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "school_capacity_write" ON "public"."school_capacity" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin(( SELECT auth.uid() AS uid))) WITH CHECK (is_admin(( SELECT auth.uid() AS uid)));
CREATE POLICY "school_units_read" ON "public"."school_units" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "school_units_write" ON "public"."school_units" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin(( SELECT auth.uid() AS uid))) WITH CHECK (is_admin(( SELECT auth.uid() AS uid)));
CREATE POLICY "enrollment_stage_history_read" ON "public"."enrollment_stage_history" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'user'::app_role)));
CREATE POLICY "Admin reads school folder" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'school-materials'::text) AND (name = 'folder-digital.pdf'::text) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admin uploads school folder" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'school-materials'::text) AND (name = 'folder-digital.pdf'::text) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admin replaces school folder" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'school-materials'::text) AND (name = 'folder-digital.pdf'::text) AND has_role(auth.uid(), 'admin'::app_role))) WITH CHECK (((bucket_id = 'school-materials'::text) AND (name = 'folder-digital.pdf'::text) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE TRIGGER trg_email_messages_dedupe BEFORE INSERT ON public.email_messages FOR EACH ROW EXECUTE FUNCTION email_messages_dedupe_before_insert();
CREATE TRIGGER trg_email_messages_recompute_cache AFTER INSERT OR DELETE OR UPDATE ON public.email_messages FOR EACH ROW EXECUTE FUNCTION email_messages_recompute_cache();
CREATE TRIGGER trg_log_delivery AFTER INSERT ON public.delivery_logs FOR EACH ROW EXECUTE FUNCTION log_delivery();
CREATE TRIGGER trg_log_email_attachment AFTER INSERT ON public.email_attachments FOR EACH ROW EXECUTE FUNCTION log_email_attachment();
CREATE TRIGGER trg_log_email_message AFTER INSERT ON public.email_messages FOR EACH ROW EXECUTE FUNCTION log_email_message();
CREATE TRIGGER trg_log_lead_changes AFTER UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION log_lead_changes();
CREATE TRIGGER trg_log_lead_created AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION log_lead_created();
CREATE TRIGGER trg_log_lead_note AFTER INSERT OR DELETE OR UPDATE ON public.lead_notes FOR EACH ROW EXECUTE FUNCTION log_lead_note();
CREATE TRIGGER trg_log_lead_unclassified_change AFTER UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION log_lead_unclassified_change();
CREATE TRIGGER trg_log_whatsapp_message AFTER INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION log_whatsapp_message();
CREATE TRIGGER trg_school_triage_email AFTER INSERT ON public.email_messages FOR EACH ROW EXECUTE FUNCTION trigger_school_triage();
CREATE TRIGGER trg_school_triage_whatsapp AFTER INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION trigger_school_triage();
CREATE TRIGGER update_lead_email_count_trigger AFTER INSERT OR DELETE OR UPDATE ON public.email_messages FOR EACH ROW EXECUTE FUNCTION update_lead_email_count();
CREATE TRIGGER update_lead_last_email_message AFTER INSERT OR UPDATE ON public.email_messages FOR EACH ROW WHEN ((new.lead_id IS NOT NULL)) EXECUTE FUNCTION update_lead_last_message();
CREATE TRIGGER update_lead_on_email AFTER INSERT ON public.email_messages FOR EACH ROW EXECUTE FUNCTION update_lead_timestamp();
CREATE TRIGGER whatsapp_message_recompute_caches_trigger AFTER INSERT OR DELETE OR UPDATE ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION whatsapp_message_recompute_caches();
CREATE TRIGGER trg_auto_fill_status_timestamps BEFORE UPDATE OF status ON public.leads FOR EACH ROW EXECUTE FUNCTION auto_fill_status_timestamps();
CREATE TRIGGER refresh_score_after_visit AFTER INSERT OR DELETE OR UPDATE ON public.school_visits FOR EACH ROW EXECUTE FUNCTION refresh_related_enrollment_score();
CREATE TRIGGER refresh_score_after_task AFTER INSERT OR DELETE OR UPDATE ON public.enrollment_tasks FOR EACH ROW EXECUTE FUNCTION refresh_related_enrollment_score();
CREATE TRIGGER refresh_score_after_opportunity_change AFTER INSERT OR UPDATE OF stage, next_action, next_action_at, primary_guardian_id, desired_grade, desired_shift, unit_id, source_channel, status_updated_at ON public.enrollment_opportunities FOR EACH ROW EXECUTE FUNCTION refresh_opportunity_score();
CREATE TRIGGER trg_resolve_handoff_on_human_whatsapp_reply AFTER INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION resolve_handoff_on_human_whatsapp_reply();
CREATE TRIGGER trg_close_resolved_triage_followups BEFORE UPDATE OF triage_status ON public.leads FOR EACH ROW EXECUTE FUNCTION close_resolved_triage_followups();
CREATE TRIGGER capture_audit_log AFTER DELETE OR UPDATE ON public.activity_log FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.delivery_logs FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.email_attachments FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.email_messages FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.lead_notes FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.scheduled_followups FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.user_product_access FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.school_units FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.guardians FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.student_guardians FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.enrollment_opportunities FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.school_capacity FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.school_visits FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.enrollment_tasks FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.enrollment_stage_history FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
CREATE TRIGGER capture_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.ana_followups FOR EACH ROW EXECUTE FUNCTION audit_private.capture_audit_log();
GRANT INSERT ON public."delivery_logs" TO authenticated;
GRANT SELECT ON public."delivery_logs" TO authenticated;
GRANT UPDATE ON public."delivery_logs" TO authenticated;
GRANT DELETE ON public."delivery_logs" TO authenticated;
GRANT INSERT ON public."email_attachments" TO authenticated;
GRANT SELECT ON public."email_attachments" TO authenticated;
GRANT UPDATE ON public."email_attachments" TO authenticated;
GRANT DELETE ON public."email_attachments" TO authenticated;
GRANT INSERT ON public."email_messages" TO authenticated;
GRANT SELECT ON public."email_messages" TO authenticated;
GRANT UPDATE ON public."email_messages" TO authenticated;
GRANT DELETE ON public."email_messages" TO authenticated;
GRANT INSERT ON public."lead_notes" TO authenticated;
GRANT SELECT ON public."lead_notes" TO authenticated;
GRANT UPDATE ON public."lead_notes" TO authenticated;
GRANT DELETE ON public."lead_notes" TO authenticated;
GRANT INSERT ON public."scheduled_followups" TO authenticated;
GRANT SELECT ON public."scheduled_followups" TO authenticated;
GRANT UPDATE ON public."scheduled_followups" TO authenticated;
GRANT DELETE ON public."scheduled_followups" TO authenticated;
GRANT INSERT ON public."user_presence" TO authenticated;
GRANT SELECT ON public."user_presence" TO authenticated;
GRANT UPDATE ON public."user_presence" TO authenticated;
GRANT DELETE ON public."user_presence" TO authenticated;
GRANT INSERT ON public."user_product_access" TO authenticated;
GRANT SELECT ON public."user_product_access" TO authenticated;
GRANT UPDATE ON public."user_product_access" TO authenticated;
GRANT DELETE ON public."user_product_access" TO authenticated;
GRANT INSERT ON public."whatsapp_messages" TO authenticated;
GRANT SELECT ON public."whatsapp_messages" TO authenticated;
GRANT UPDATE ON public."whatsapp_messages" TO authenticated;
GRANT DELETE ON public."whatsapp_messages" TO authenticated;
GRANT SELECT ON public."user_roles" TO authenticated;
GRANT INSERT ON public."activity_log" TO authenticated;
GRANT SELECT ON public."activity_log" TO authenticated;
GRANT UPDATE ON public."activity_log" TO authenticated;
GRANT DELETE ON public."activity_log" TO authenticated;
GRANT INSERT ON public."system_settings" TO authenticated;
GRANT SELECT ON public."system_settings" TO authenticated;
GRANT UPDATE ON public."system_settings" TO authenticated;
GRANT DELETE ON public."system_settings" TO authenticated;
GRANT INSERT ON public."leads" TO authenticated;
GRANT SELECT ON public."leads" TO authenticated;
GRANT UPDATE ON public."leads" TO authenticated;
GRANT DELETE ON public."leads" TO authenticated;
GRANT INSERT ON public."enrollment_forecast" TO authenticated;
GRANT SELECT ON public."enrollment_forecast" TO authenticated;
GRANT UPDATE ON public."enrollment_forecast" TO authenticated;
GRANT DELETE ON public."enrollment_forecast" TO authenticated;
GRANT INSERT ON public."school_units" TO authenticated;
GRANT SELECT ON public."school_units" TO authenticated;
GRANT UPDATE ON public."school_units" TO authenticated;
GRANT DELETE ON public."school_units" TO authenticated;
GRANT INSERT ON public."guardians" TO authenticated;
GRANT SELECT ON public."guardians" TO authenticated;
GRANT UPDATE ON public."guardians" TO authenticated;
GRANT DELETE ON public."guardians" TO authenticated;
GRANT INSERT ON public."students" TO authenticated;
GRANT SELECT ON public."students" TO authenticated;
GRANT UPDATE ON public."students" TO authenticated;
GRANT DELETE ON public."students" TO authenticated;
GRANT INSERT ON public."student_guardians" TO authenticated;
GRANT SELECT ON public."student_guardians" TO authenticated;
GRANT UPDATE ON public."student_guardians" TO authenticated;
GRANT DELETE ON public."student_guardians" TO authenticated;
GRANT INSERT ON public."enrollment_opportunities" TO authenticated;
GRANT SELECT ON public."enrollment_opportunities" TO authenticated;
GRANT UPDATE ON public."enrollment_opportunities" TO authenticated;
GRANT DELETE ON public."enrollment_opportunities" TO authenticated;
GRANT SELECT ON public."enrollment_stage_history" TO authenticated;
GRANT INSERT ON public."school_capacity" TO authenticated;
GRANT SELECT ON public."school_capacity" TO authenticated;
GRANT UPDATE ON public."school_capacity" TO authenticated;
GRANT DELETE ON public."school_capacity" TO authenticated;
GRANT INSERT ON public."school_visits" TO authenticated;
GRANT SELECT ON public."school_visits" TO authenticated;
GRANT UPDATE ON public."school_visits" TO authenticated;
GRANT DELETE ON public."school_visits" TO authenticated;
GRANT INSERT ON public."enrollment_tasks" TO authenticated;
GRANT SELECT ON public."enrollment_tasks" TO authenticated;
GRANT UPDATE ON public."enrollment_tasks" TO authenticated;
GRANT DELETE ON public."enrollment_tasks" TO authenticated;
GRANT SELECT ON public."audit_logs" TO authenticated;
REVOKE ALL ON FUNCTION public."refresh_related_enrollment_score"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."refresh_related_enrollment_score"() TO service_role;
REVOKE ALL ON FUNCTION public."normalize_message_id"(p_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."normalize_message_id"(p_id text) TO service_role;
REVOKE ALL ON FUNCTION public."update_lead_timestamp"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."update_lead_timestamp"() TO service_role;
REVOKE ALL ON FUNCTION public."log_delivery"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."log_delivery"() TO service_role;
REVOKE ALL ON FUNCTION public."log_email_attachment"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."log_email_attachment"() TO service_role;
REVOKE ALL ON FUNCTION public."extract_internet_message_id"(p_raw jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."extract_internet_message_id"(p_raw jsonb) TO service_role;
REVOKE ALL ON FUNCTION public."get_activity_actor"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."get_activity_actor"() TO service_role;
REVOKE ALL ON FUNCTION public."get_activity_source"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."get_activity_source"() TO service_role;
REVOKE ALL ON FUNCTION public."infer_email_source"(p_row email_messages) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."infer_email_source"(p_row email_messages) TO service_role;
REVOKE ALL ON FUNCTION public."has_role"(_user_id uuid, _role app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."has_role"(_user_id uuid, _role app_role) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public."email_messages_recompute_cache"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."email_messages_recompute_cache"() TO service_role;
REVOKE ALL ON FUNCTION public."log_lead_created"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."log_lead_created"() TO service_role;
REVOKE ALL ON FUNCTION public."user_can_access_produto"(_user_id uuid, _produto text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."user_can_access_produto"(_user_id uuid, _produto text) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public."whatsapp_phone_variants"(p_phone text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."whatsapp_phone_variants"(p_phone text) TO service_role;
REVOKE ALL ON FUNCTION public."recompute_lead_whatsapp_cache"(p_lead_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."recompute_lead_whatsapp_cache"(p_lead_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public."recompute_enrollment_score"(p_opportunity_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."recompute_enrollment_score"(p_opportunity_id uuid) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public."recompute_all_enrollment_scores"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."recompute_all_enrollment_scores"() TO service_role, authenticated;
REVOKE ALL ON FUNCTION public."resolve_lead_ids_by_phone"(p_phone text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."resolve_lead_ids_by_phone"(p_phone text) TO service_role;
REVOKE ALL ON FUNCTION public."set_activity_context"(p_source text, p_actor text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."set_activity_context"(p_source text, p_actor text) TO service_role;
REVOKE ALL ON FUNCTION public."log_email_message"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."log_email_message"() TO service_role;
REVOKE ALL ON FUNCTION public."is_admin"(_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."is_admin"(_user_id uuid) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public."update_lead_email_count"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."update_lead_email_count"() TO service_role;
REVOKE ALL ON FUNCTION public."update_lead_last_message"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."update_lead_last_message"() TO service_role;
REVOKE ALL ON FUNCTION public."user_can_access_lead"(_user_id uuid, _lead_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."user_can_access_lead"(_user_id uuid, _lead_id uuid) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public."create_enrollment_task"(p_opportunity_id uuid, p_title text, p_due_at timestamp with time zone, p_priority text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."create_enrollment_task"(p_opportunity_id uuid, p_title text, p_due_at timestamp with time zone, p_priority text) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public."complete_enrollment_task"(p_task_id uuid, p_next_action text, p_next_action_at timestamp with time zone, p_next_priority text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."complete_enrollment_task"(p_task_id uuid, p_next_action text, p_next_action_at timestamp with time zone, p_next_priority text) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public."update_school_visit_status"(p_visit_id uuid, p_status text, p_family_impression text, p_objections text, p_follow_up_notes text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."update_school_visit_status"(p_visit_id uuid, p_status text, p_family_impression text, p_objections text, p_follow_up_notes text) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public."recompute_lead_message_cache"(p_lead_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."recompute_lead_message_cache"(p_lead_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public."email_messages_dedupe_before_insert"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."email_messages_dedupe_before_insert"() TO service_role;
REVOKE ALL ON FUNCTION public."log_lead_changes"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."log_lead_changes"() TO service_role;
REVOKE ALL ON FUNCTION public."log_lead_note"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."log_lead_note"() TO service_role;
REVOKE ALL ON FUNCTION public."log_lead_unclassified_change"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."log_lead_unclassified_change"() TO service_role;
REVOKE ALL ON FUNCTION public."log_whatsapp_message"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."log_whatsapp_message"() TO service_role;
REVOKE ALL ON FUNCTION public."update_lead_whatsapp_count"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."update_lead_whatsapp_count"() TO service_role;
REVOKE ALL ON FUNCTION public."whatsapp_message_recompute_caches"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."whatsapp_message_recompute_caches"() TO service_role;
REVOKE ALL ON FUNCTION public."auto_fill_status_timestamps"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."auto_fill_status_timestamps"() TO service_role;
REVOKE ALL ON FUNCTION public."refresh_opportunity_score"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."refresh_opportunity_score"() TO service_role;
REVOKE ALL ON FUNCTION public."verify_school_triage_secret"(p_secret text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."verify_school_triage_secret"(p_secret text) TO service_role;
REVOKE ALL ON FUNCTION public."trigger_school_triage"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."trigger_school_triage"() TO service_role;
REVOKE ALL ON FUNCTION public."resolve_handoff_on_human_whatsapp_reply"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."resolve_handoff_on_human_whatsapp_reply"() TO service_role;
REVOKE ALL ON FUNCTION public."close_resolved_triage_followups"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."close_resolved_triage_followups"() TO service_role;
REVOKE ALL ON FUNCTION public."set_crm_user_role"(p_user_id uuid, p_role app_role, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."set_crm_user_role"(p_user_id uuid, p_role app_role, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public."verify_zapi_webhook_secret"(p_secret text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."verify_zapi_webhook_secret"(p_secret text) TO service_role;
REVOKE ALL ON FUNCTION public."get_zapi_webhook_secret"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."get_zapi_webhook_secret"() TO service_role;
REVOKE ALL ON FUNCTION public."create_school_enrollment"(p_guardian_name text, p_guardian_phone text, p_guardian_email text, p_student_name text, p_academic_year integer, p_desired_grade text, p_desired_shift text, p_whatsapp_opt_in boolean, p_source_channel text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."create_school_enrollment"(p_guardian_name text, p_guardian_phone text, p_guardian_email text, p_student_name text, p_academic_year integer, p_desired_grade text, p_desired_shift text, p_whatsapp_opt_in boolean, p_source_channel text) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public."update_enrollment_progress"(p_opportunity_id uuid, p_stage text, p_next_action text, p_next_action_at timestamp with time zone, p_loss_reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."update_enrollment_progress"(p_opportunity_id uuid, p_stage text, p_next_action text, p_next_action_at timestamp with time zone, p_loss_reason text) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public."claim_crm_survey"(p_lead_id uuid, p_cycle_at timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."claim_crm_survey"(p_lead_id uuid, p_cycle_at timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION public."register_ana_enrollment"(p_lead_id uuid, p_guardian_name text, p_student_name text, p_academic_year integer, p_desired_grade text, p_desired_shift text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."register_ana_enrollment"(p_lead_id uuid, p_guardian_name text, p_student_name text, p_academic_year integer, p_desired_grade text, p_desired_shift text) TO service_role;
REVOKE ALL ON FUNCTION public."register_ana_school_visit"(p_lead_id uuid, p_opportunity_id uuid, p_scheduled_at timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."register_ana_school_visit"(p_lead_id uuid, p_opportunity_id uuid, p_scheduled_at timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION public."schedule_school_visit"(p_opportunity_id uuid, p_scheduled_at timestamp with time zone, p_participants text, p_notes text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."schedule_school_visit"(p_opportunity_id uuid, p_scheduled_at timestamp with time zone, p_participants text, p_notes text) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public."reschedule_school_visit"(p_visit_id uuid, p_scheduled_at timestamp with time zone, p_follow_up_notes text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."reschedule_school_visit"(p_visit_id uuid, p_scheduled_at timestamp with time zone, p_follow_up_notes text) TO service_role, authenticated;
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) VALUES ('school-materials','school-materials',false,15728640,ARRAY['application/pdf']) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.system_settings (key,value) VALUES
('escola_nome','Colégio Conceito'),('escola_agente_nome','Assistente'),
('escola_agente_ativo','false'),('escola_folder_ativo','false'),('escola_info',''),('escola_valores','');
RESET check_function_bodies;
