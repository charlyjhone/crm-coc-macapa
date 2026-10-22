import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useUserRole() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [products, setProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const userId = user?.id ?? null;

  useEffect(() => {
    let active = true;
    if (!userId) {
      setIsAdmin(false);
      setProducts([]);
      setLoading(false);
      return;
    }
    // Depende só do id: reconfirmar a sessão ao voltar à aba não recarrega a tela.
    setLoading(true);
    (async () => {
      const [{ data: roles }, { data: prods }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("user_product_access").select("produto").eq("user_id", userId),
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
  }, [userId]);

  return { isAdmin: !!isAdmin, products, loading };
}
