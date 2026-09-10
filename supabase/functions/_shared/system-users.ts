// Fetches all registered system user emails via admin API (service role required).
// Used to treat system users as "internal" so they're never created as leads
// nor associated as CC contacts to leads.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

let _cache: { ts: number; emails: string[] } | null = null;
const TTL_MS = 60_000;

export async function getSystemUserEmails(): Promise<string[]> {
  if (_cache && Date.now() - _cache.ts < TTL_MS) return _cache.emails;
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key);
    const emails: string[] = [];
    let page = 1;
    // up to 1000 users (5 pages of 200)
    while (page <= 5) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      const list = data?.users || [];
      for (const u of list) {
        if (u.email) emails.push(u.email.toLowerCase());
      }
      if (list.length < 200) break;
      page++;
    }
    _cache = { ts: Date.now(), emails };
    return emails;
  } catch (e) {
    console.error("getSystemUserEmails failed:", e);
    return _cache?.emails || [];
  }
}
