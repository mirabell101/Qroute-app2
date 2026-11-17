import { supabase } from "@/lib/supabase";

const ADMIN_PHOTO_PATH = /\/api\/admin\/posts\/[^/]+\/photos\/\d+(?:[?#]|$)/;

export function isAdminCommunityPhotoUrl(url: string): boolean {
  return ADMIN_PHOTO_PATH.test(url);
}

export async function loadAdminCommunityPhoto(url: string): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);

  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Please sign in to continue.");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Unable to load the photo.");

  return URL.createObjectURL(await response.blob());
}

export function releaseAdminCommunityPhoto(url: string): void {
  URL.revokeObjectURL(url);
}
