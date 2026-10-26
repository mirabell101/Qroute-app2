
import { supabase } from "@/lib/supabase";

export interface Terminal {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
}

export async function getTerminals(): Promise<Terminal[]> {
  const { data, error } = await supabase
    .from("terminals")
    .select("id, name, latitude, longitude, is_active")
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
