import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSchoolIdentity() {
  const { data } = useQuery({
    queryKey: ["school-identity"],
    queryFn: async () => {
      const { data, error } = await supabase.from("system_settings")
        .select("key, value")
        .in("key", ["escola_nome", "escola_agente_nome"]);
      if (error) throw error;
      return Object.fromEntries((data || []).map(({ key, value }) => [key, value]));
    },
    staleTime: 30_000,
  });
  return {
    schoolName: data?.escola_nome || "Escola",
    agentName: data?.escola_agente_nome || "Ana",
  };
}
