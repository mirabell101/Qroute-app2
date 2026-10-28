import { supabase } from "@/lib/supabase";

const BUCKET = "map-images";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type SubmittableKind = "terminal" | "stop";
type ModerationStatus = "pending" | "approved" | "rejected";

export interface PointImage {
  id: number;
  url: string;
  caption: string | null;
  is_approved: boolean;
  moderation_status: ModerationStatus;
}

interface ImageRow {
  id: number;
  terminal_id: number | null;
  stop_id: number | null;
  storage_path: string;
  caption: string | null;
  is_approved: boolean;
  moderation_status: ModerationStatus;
  created_at: string;
}

export function validateImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Please choose a JPG, PNG, or WebP image.";
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return "The image must be 5 MB or smaller.";
  }

  return null;
}

// Best image per terminal/stop, keyed "terminal-<id>" / "stop-<id>".
// Approved images win; otherwise the newest (the submitter's own pending one).
export async function getPointImages(
  terminalIds: number[],
  stopIds: number[]
): Promise<Record<string, PointImage>> {
  const filters: string[] = [];

  if (terminalIds.length > 0) {
    filters.push(`terminal_id.in.(${terminalIds.join(",")})`);
  }

  if (stopIds.length > 0) {
    filters.push(`stop_id.in.(${stopIds.join(",")})`);
  }

  if (filters.length === 0) return {};

  const { data, error } = await supabase
    .from("map_images")
    .select(
      "id, terminal_id, stop_id, storage_path, caption, is_approved, moderation_status, created_at"
    )
    .eq("is_deleted", false)
    .or(filters.join(","))
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const best = new Map<string, ImageRow>();

  for (const row of (data ?? []) as ImageRow[]) {
    const key =
      row.terminal_id !== null
        ? `terminal-${row.terminal_id}`
        : `stop-${row.stop_id}`;

    const current = best.get(key);

    if (!current || (row.is_approved && !current.is_approved)) {
      best.set(key, row);
    }
  }

  const entries = [...best.entries()];
  if (entries.length === 0) return {};

  // The bucket is private, so photos are shown through short-lived signed URLs.
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      entries.map(([, row]) => row.storage_path),
      3600
    );

  if (signError) throw new Error(signError.message);

  const urlByPath = new Map<string, string>();
  signed?.forEach((item) => {
    if (item.path && item.signedUrl) {
      urlByPath.set(item.path, item.signedUrl);
    }
  });

  const result: Record<string, PointImage> = {};

  for (const [key, row] of entries) {
    const url = urlByPath.get(row.storage_path);

    if (url) {
      result[key] = {
        id: row.id,
        url,
        caption: row.caption,
        is_approved: row.is_approved,
        moderation_status: row.moderation_status,
      };
    }
  }

  return result;
}

// Upload a photo for an existing terminal/stop. Returns an error message, or null on success.
export async function attachMapImage(
  kind: SubmittableKind,
  pointId: number,
  file: File,
  caption: string | null = null
): Promise<string | null> {
  const problem = validateImage(file);
  if (problem) return problem;

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return "Please sign in to upload a photo.";

  const extension =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";

  // Folder name must equal the user's id (enforced by storage policy).
  const path = `${auth.user.id}/${kind}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) return uploadError.message;

  const { error: insertError } = await supabase.from("map_images").insert({
    terminal_id: kind === "terminal" ? pointId : null,
    stop_id: kind === "stop" ? pointId : null,
    storage_path: path,
    caption,
  });

  if (insertError) {
    // Clean up the orphaned file (allowed while no approved row uses it).
    await supabase.storage.from(BUCKET).remove([path]);
    return insertError.message;
  }

  return null;
}

export interface SubmitPointInput {
  name: string;
  latitude: number;
  longitude: number;
  description?: string;
  stopType?: "road_stop" | "train_station"; // stops only
  caption?: string;
}

export interface SubmitPointResult {
  id: number;
  imageError: string | null;
}

// Submit a new terminal/stop with its coordinates and an optional photo.
// It is saved as pending and stays hidden from others until an admin approves it.
export async function submitMapPoint(
  kind: SubmittableKind,
  input: SubmitPointInput,
  file: File | null
): Promise<SubmitPointResult> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Please sign in to submit a location.");

  if (file) {
    const problem = validateImage(file);
    if (problem) throw new Error(problem);
  }

  const result =
    kind === "terminal"
      ? await supabase
          .from("terminals")
          .insert({
            name: input.name,
            latitude: input.latitude,
            longitude: input.longitude,
          })
          .select("id")
          .single()
      : await supabase
          .from("stops")
          .insert({
            name: input.name,
            latitude: input.latitude,
            longitude: input.longitude,
            description: input.description ?? null,
            stop_type: input.stopType ?? "road_stop",
          })
          .select("id")
          .single();

  if (result.error) throw new Error(result.error.message);

  const id = result.data.id;

  if (!file) return { id, imageError: null };

  const imageError = await attachMapImage(
    kind,
    id,
    file,
    input.caption ?? null
  );

  return { id, imageError };
}