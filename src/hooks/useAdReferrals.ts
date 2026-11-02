/* eslint-disable @typescript-eslint/no-explicit-any -- tabela nova fora dos tipos gerados do Supabase. */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_MODE } from "@/lib/demo";

/** Conversa de WhatsApp que começou por um anúncio "Clique para conversar" (Instagram/Facebook). */
export type AdReferral = {
  phone_digits: string;
  source_app: "instagram" | "facebook" | "outro";
  ad_id: string | null;
  ad_headline: string | null;
  first_message: string | null;
  first_at: string;
};

export const phoneDigits = (phone: string | null | undefined) => {
  const d = (phone || "").replace(/\D/g, "");
  if (!d) return "";
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
};

/** Nome curto da campanha: corta na última palavra inteira. */
export function campaignLabel(text: string | null | undefined) {
  const t = (text || "").trim();
  if (!t) return "Anúncio sem texto";
  if (t.length < 70) return t;
  return `${t.slice(0, t.lastIndexOf(" ") > 40 ? t.lastIndexOf(" ") : 70).trim()}…`;
}

export function useAdReferrals() {
  return useQuery<Map<string, AdReferral>>({
    queryKey: ["anuncios-whatsapp"],
    refetchInterval: 120_000,
    staleTime: 60_000,
    queryFn: async () => {
      if (DEMO_MODE) return new Map();
      const { data, error } = await (supabase as any).from("lead_ad_referrals")
        .select("phone_digits,source_app,ad_id,ad_headline,first_message,first_at").limit(5000);
      if (error) return new Map(); // tabela ainda não existe nesta escola
      return new Map((data || []).map((r: AdReferral) => [r.phone_digits, r]));
    },
  });
}

export const adReferralOf = (map: Map<string, AdReferral> | undefined, phone: string | null | undefined) =>
  (map && phone ? map.get(phoneDigits(phone)) : undefined) || null;

export const adLabel = (ref: AdReferral) => `Anúncio · ${ref.source_app === "facebook" ? "Facebook" : "Instagram"}`;
