import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

/**
 * Fetches a custom prompt from the database if one exists.
 * Falls back to the provided default prompt if no custom version is saved.
 * 
 * @param templateId - The prompt template ID (e.g., "1", "2", etc.)
 * @param defaultPrompt - The hardcoded default prompt to fall back to
 * @param variables - Key-value pairs for variable substitution (e.g., { leadName: "John" })
 * @returns The final prompt with variables substituted
 */
export async function getPrompt(
  templateId: string,
  defaultPrompt: string,
  variables: Record<string, string> = {}
): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from("prompt_templates")
      .select("custom_prompt")
      .eq("id", templateId)
      .maybeSingle();

    if (error) {
      console.error(`Error fetching prompt template ${templateId}:`, error);
    }

    let prompt = data?.custom_prompt || defaultPrompt;

    // Substitute variables: replace {varName} with actual values
    for (const [key, value] of Object.entries(variables)) {
      // Replace both {key} and {key} patterns (with spaces around)
      const regex = new RegExp(`\\{${escapeRegex(key)}\\}`, "g");
      prompt = prompt.replace(regex, value);
    }

    return prompt;
  } catch (err) {
    console.error(`Failed to fetch custom prompt for template ${templateId}, using default:`, err);
    // Fall back to default with variable substitution
    let prompt = defaultPrompt;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{${escapeRegex(key)}\\}`, "g");
      prompt = prompt.replace(regex, value);
    }
    return prompt;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
