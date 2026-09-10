import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useUserRole() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [products, setProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!user) {
      setIsAdmin(false);
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const [{ data: roles }, { data: prods }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("user_product_access").select("produto").eq("user_id", user.id),
      ]);
      if (!active) return;
      const admin = (roles || []).some((r: any) => r.role === "admin");
      setIsAdmin(admin);
      setProducts((prods || []).map((p: any) => p.produto));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  return { isAdmin: !!isAdmin, products, loading };
}
