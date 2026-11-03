
import { supabase } from "@/lib/supabase";
import { getPublicMapData, hasMapAuthSession } from "./publicMap";

const terminalMapCacheLifetime = 60_000;
let cachedTerminals: { value: Terminal[]; expiresAt: number } | null = null;
let terminalsRequest: Promise<Terminal[]> | null = null;

export interface Terminal {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
}

async function fetchAuthenticatedTerminals(): Promise<Terminal[]> {
  const { data, error } = await supabase
    .from("terminals")
    .select("id, name, latitude, longitude, is_active")
    .eq("is_approved", true)
    .eq("moderation_status", "approved")
    .eq("is_active", true)
    .eq("is_deleted", false)
    .eq("is_banned", false);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getTerminals(): Promise<Terminal[]> {
  if (!(await hasMapAuthSession())) {
    return (await getPublicMapData()).terminals;
  }

  if (cachedTerminals && cachedTerminals.expiresAt > Date.now()) {
    return cachedTerminals.value;
  }

  if (!terminalsRequest) {
    terminalsRequest = fetchAuthenticatedTerminals().then((terminals) => {
      cachedTerminals = {
        value: terminals,
        expiresAt: Date.now() + terminalMapCacheLifetime,
      };
      return terminals;
    });
  }

  const request = terminalsRequest;
  try {
    return await request;
  } finally {
    if (terminalsRequest === request) terminalsRequest = null;
  }
}
