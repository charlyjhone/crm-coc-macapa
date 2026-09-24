import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

export interface SystemSettings {
  susan_name: string;
  susan_email: string;
  company_name: string;
  company_email: string;
  [key: string]: string;
}

const DEFAULTS: SystemSettings = {
  susan_name: 'Ana',
  susan_email: '',
  company_name: '',
  company_email: '',
};

/**
 * Fetches system settings from the database.
 * Returns defaults for any missing keys.
 */
export async function getSettings(keys?: string[]): Promise<SystemSettings> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const keysToFetch = keys || Object.keys(DEFAULTS);

    const { data, error } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", keysToFetch);

    if (error) {
      console.error("Error fetching system settings:", error);
      return { ...DEFAULTS };
    }

    const settings: SystemSettings = { ...DEFAULTS };
    data?.forEach((row: any) => {
      if (row.value) settings[row.key] = row.value;
    });

    return settings;
  } catch (err) {
    console.error("Failed to fetch system settings, using defaults:", err);
    return { ...DEFAULTS };
  }
}
