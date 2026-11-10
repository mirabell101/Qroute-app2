import { createClient } from "@supabase/supabase-js";

import { assertPublicSupabaseKey } from "./supabaseConfig";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = assertPublicSupabaseKey(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

if (!supabaseUrl) {
  throw new Error("Supabase environment variables are missing.");
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
