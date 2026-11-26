import { supabase } from "@/lib/supabase";

// Uploads remain private until the backend publishes an approved image.
const PRIVATE_BUCKET = "map-images";
const PUBLIC_BUCKET = "map-images-public";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type SubmittableKind = "terminal" | "stop";
type ModerationStatus = "pending" | "approved" | "rejected";

export interface PointImage {
  id: number;
  url: string;
  caption: string | null;
  // Public retrieval only returns images that have passed moderation.
  // These fields are retained for compatibility with existing consumers.
  is_approved: boolean;
  moderation_status: ModerationStatus;
}

interface PublicImageRow {
  id: number;
  terminal_id: number | null;
  stop_id: number | null;
  public_storage_path: string | null;
  caption: string | null;
}

/**
 * Runtime signature for the public RPC.
 *
 * The database function may not yet exist in an older generated Supabase
 * Database type. Keeping this narrow cast local avoids weakening the types
 * of the rest of the Supabase client.
 */
interface PublicImageRpcClient {
  rpc(
    functionName: "get_public_map_point_images",
    args: {
      p_terminal_ids: number[];
      p_stop_ids: number[];
    },
  ): PromiseLike<{
    data: PublicImageRow[] | null;
    error: { message: string } | null;
  }>;
}

function normalizeIds(ids: number[]): number[] {
  return [...new Set(
    ids.filter((id) => Number.isSafeInteger(id) && id > 0),
  )];
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

/**
 * Loads every currently public photograph for the supplied map points.
 *
 * This deliberately uses the anonymous-safe database RPC and the public
 * Storage bucket. It does not query map_images directly, inspect private
 * storage paths, or require the visitor to be signed in.
 *
 * Result keys use "terminal-<id>" / "stop-<id>" and each key contains a
 * gallery array, ordered by the database function's created_at / id order.
 */
export async function getPointImages(
  terminalIds: number[],
  stopIds: number[],
): Promise<Record<string, PointImage[]>> {
  const normalizedTerminalIds = normalizeIds(terminalIds);
  const normalizedStopIds = normalizeIds(stopIds);

  if (
    normalizedTerminalIds.length === 0 &&
    normalizedStopIds.length === 0
  ) {
    return {};
  }

  const publicImageClient = supabase as unknown as PublicImageRpcClient;
  const { data, error } = await publicImageClient.rpc(
    "get_public_map_point_images",
    {
      p_terminal_ids: normalizedTerminalIds,
      p_stop_ids: normalizedStopIds,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  const result: Record<string, PointImage[]> = {};

  for (const row of data ?? []) {
    const imageId = Number(row.id);
    const terminalId = row.terminal_id === null
      ? null
      : Number(row.terminal_id);
    const stopId = row.stop_id === null
      ? null
      : Number(row.stop_id);
    const publicPath = row.public_storage_path;

    // The RPC already enforces these constraints. Validate its payload before
    // constructing a URL or assigning the image to a map location as well.
    if (
      !Number.isSafeInteger(imageId) ||
      imageId < 1 ||
      !publicPath ||
      (terminalId === null) === (stopId === null)
    ) {
      continue;
    }

    const key = terminalId !== null
      ? `terminal-${terminalId}`
      : `stop-${stopId}`;

    const { data: publicUrlData } = supabase.storage
      .from(PUBLIC_BUCKET)
      .getPublicUrl(publicPath);

    const url = publicUrlData.publicUrl;
    if (!url) continue;

    const image: PointImage = {
      id: imageId,
      url,
      caption: row.caption,
      is_approved: true,
      moderation_status: "approved",
    };

    (result[key] ??= []).push(image);
  }

  return result;
}

// Upload a photo for an existing terminal/stop. Returns an error message, or null on success.
export async function attachMapImage(
  kind: SubmittableKind,
  pointId: number,
  file: File,
  caption: string | null = null,
): Promise<string | null> {
  const problem = validateImage(file);
  if (problem) return problem;

  if (!Number.isSafeInteger(pointId) || pointId < 1) {
    return "A valid location is required.";
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return "Please sign in to upload a photo.";

  const extension =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";

  // Folder name must equal the user's id (enforced by the private Storage policy).
  const path = `${auth.user.id}/${kind}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(PRIVATE_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) return uploadError.message;

  const { error: insertError } = await supabase.from("map_images").insert({
    terminal_id: kind === "terminal" ? pointId : null,
    stop_id: kind === "stop" ? pointId : null,
    storage_path: path,
    caption,
  });

  if (insertError) {
    // Clean up the orphaned private object if its metadata row was not created.
    await supabase.storage.from(PRIVATE_BUCKET).remove([path]);
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
  file: File | null,
): Promise<SubmitPointResult> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Please sign in to submit a location.");
  }

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

  if (result.error) {
    throw new Error(result.error.message);
  }

  const id = result.data.id;

  if (!file) {
    return { id, imageError: null };
  }

  const imageError = await attachMapImage(
    kind,
    id,
    file,
    input.caption ?? null,
  );

  return { id, imageError };
}
