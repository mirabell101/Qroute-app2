import { createClient } from "@supabase/supabase-js";
import { shouldPersistSupabaseSession } from "./passwordRecovery";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Supabase environment variables are missing.");
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      persistSession:
        typeof window === "undefined"
          ? true
          : shouldPersistSupabaseSession(window.location.pathname),
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
