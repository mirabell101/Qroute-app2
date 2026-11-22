
import { createClient } from "@supabase/supabase-js";

import { assertPublicSupabaseKey } from "./supabaseConfig";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

const supabasePublishableKey = assertPublicSupabaseKey(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

if (!supabaseUrl) {
  throw new Error(
    "Supabase environment variables are missing.",
  );
}

const isBrowser = typeof window !== "undefined";

/**
 * Primary QRoute authentication client.
 *
 * URL callback processing is explicit:
 * - Google OAuth PKCE codes are exchanged in callback.tsx.
 * - Password recovery URLs are processed by the
 *   dedicated passwordRecoveryClient.ts.
 *
 * The primary client must never consume a recovery callback.
 */
export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      flowType: "pkce",
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      detectSessionInUrl: false,
    },
  },
);
