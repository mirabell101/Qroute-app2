
import { supabase } from "@/lib/supabase";
import { getPublicMapData, hasMapAuthSession } from "./publicMap";

export interface Terminal {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
}

export async function getTerminals(): Promise<Terminal[]> {
  if (!(await hasMapAuthSession())) {
    return (await getPublicMapData()).terminals;
  }

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
