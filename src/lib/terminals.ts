import { supabase } from "@/lib/supabase";
import { getPublicMapData, hasMapAuthSession } from "./publicMap";

const terminalMapCacheLifetime = 60_000;

let cachedTerminals: {
  value: Terminal[];
  expiresAt: number;
} | null = null;

let terminalsRequest: Promise<Terminal[]> | null = null;
let terminalsRequestGeneration = 0;

/** Force the next map refresh to fetch current terminal visibility/status values. */
export function invalidateTerminalsCache(): void {
  terminalsRequestGeneration += 1;
  cachedTerminals = null;
  terminalsRequest = null;
}

export interface Terminal {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
  is_deleted: boolean;
}

async function fetchAuthenticatedTerminals(): Promise<Terminal[]> {
  const { data, error } = await supabase
    .from("terminals")
    .select("id, name, latitude, longitude, is_active, is_deleted")
    .eq("is_approved", true)
    .eq("moderation_status", "approved")
    .eq("is_active", true)
    .eq("is_deleted", false)
    .is("deleted_at", null)
    .eq("is_banned", false)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const records = (data ?? []) as Terminal[];
  return records.filter(
    (terminal: Terminal) =>
      terminal.is_active === true && terminal.is_deleted === false,
  );
}

export async function getTerminals(
  currentUserId: string | null | undefined = undefined,
): Promise<Terminal[]> {
  if (!(await hasMapAuthSession(currentUserId))) {
    const { terminals } = await getPublicMapData();
    return terminals.filter(
      (terminal) =>
        terminal.is_active === true && terminal.is_deleted === false,
    );
  }

  if (cachedTerminals && cachedTerminals.expiresAt > Date.now()) {
    return cachedTerminals.value;
  }

  if (!terminalsRequest) {
    const requestGeneration = terminalsRequestGeneration;
    const request = fetchAuthenticatedTerminals().then((terminals) => {
      if (requestGeneration === terminalsRequestGeneration) {
        cachedTerminals = {
          value: terminals,
          expiresAt: Date.now() + terminalMapCacheLifetime,
        };
      }
      return terminals;
    });
    terminalsRequest = request;
  }

  const request = terminalsRequest;
  try {
    return await request;
  } finally {
    if (terminalsRequest === request) {
      terminalsRequest = null;
    }
  }
}
