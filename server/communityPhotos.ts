import type { Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";

export const communityPhotoBucket = "community-post-photos";

// Object names are generated as <owner id>/<file name>. Restricting the
// shape here prevents a crafted path from reaching an unrelated object.
const photoPathPattern =
  /^[A-Za-z0-9_-]{1,100}\/[A-Za-z0-9_-]{1,200}\.(?:jpg|jpeg|png|webp)$/i;

export function parsePhotoIndex(value: string): number | null {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const index = Number(value);
  return Number.isSafeInteger(index) ? index : null;
}

export function resolvePhotoPath(
  photoPaths: unknown,
  index: number,
): string | null {
  if (!Array.isArray(photoPaths)) return null;
  const path = photoPaths[index];
  if (typeof path !== "string" || !photoPathPattern.test(path)) return null;
  return path;
}

// The bucket is private, so image bytes are always downloaded on the server
// after the caller's access has been checked. No object URL or credential is
// returned to the browser.
export async function downloadCommunityPhoto(
  client: SupabaseClient,
  photoPath: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  const { data, error } = await client.storage
    .from(communityPhotoBucket)
    .download(photoPath);

  if (error) throw error;
  if (!data) throw new Error("Photo download returned no data.");

  return {
    bytes: Buffer.from(await data.arrayBuffer()),
    contentType: data.type || "application/octet-stream",
  };
}

export function sendCommunityPhoto(
  res: Response,
  bytes: Buffer,
  contentType: string,
): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", contentType);
  res.send(bytes);
}
