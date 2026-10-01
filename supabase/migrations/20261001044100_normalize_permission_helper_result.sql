-- Return false, not NULL, when a JWT has no role claim in a test context.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (_user_id = (SELECT auth.uid()) OR coalesce((SELECT auth.role()), '') = 'service_role')
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
$function$;

CREATE OR REPLACE FUNCTION public.user_can_access_produto(_user_id uuid, _produto text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
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
$function$;
