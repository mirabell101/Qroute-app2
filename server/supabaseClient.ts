
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function getSupabaseUrlSafe(): string | null {
  if (!supabaseUrl) {
    return null;
  }

  return supabaseUrl;
}

export function getSupabaseClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY"
    );
  }

  return createClient(supabaseUrl, supabasePublishableKey);
}
