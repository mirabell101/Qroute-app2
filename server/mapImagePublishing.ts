import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const PRIVATE_BUCKET = "map-images";
const PUBLIC_BUCKET = "map-images-public";
const PUBLIC_PATH_ROOT = "published";

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

interface MapImageCandidate {
  id: number;
  storage_path: string;
}

interface RpcError {
  message: string;
  code?: string;
}

interface PublishRpcResult {
  data: unknown;
  error: RpcError | null;
}

export interface MapImagePublicationFailure {
  imageId: number | null;
  message: string;
}

export interface MapImagePublicationResult {
  attempted: number;
  published: number;
  alreadyPublished: number;
  failed: number;
  failures: MapImagePublicationFailure[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function isCandidate(value: unknown): value is MapImageCandidate {
  return (
    isRecord(value) &&
    isPositiveSafeInteger(value.id) &&
    typeof value.storage_path === "string" &&
    value.storage_path.length > 0 &&
    value.storage_path.length <= 512
  );
}

function getSafeExtension(storagePath: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(storagePath);
  const extension = match?.[1]?.toLowerCase();

  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("The source photograph has an unsupported file extension.");
  }

  return extension;
}

function getPublicPath(
  imageId: number,
  sourcePath: string,
  extension: string,
): string {
  // Derive an opaque but deterministic filename from the private source path.
  // This permits safe retries without exposing sequential, guessable paths.
  const opaqueName = createHash("sha256")
    .update(sourcePath)
    .digest("hex");

  return `${PUBLIC_PATH_ROOT}/${imageId}/${opaqueName}.${extension}`;
}

function getFailureMessage(error: unknown): string {
  if (
    isRecord(error) &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "The photograph could not be published.";
}

/**
 * The database remains authoritative for approval and parent eligibility.
 * This query only collects already-approved, active moderation rows whose
 * public path has not yet been assigned. The publish RPC rechecks everything
 * under a row lock immediately before setting public_storage_path.
 */
async function getApprovedUnpublishedCandidates(
  adminClient: SupabaseClient,
  scope:
    | { kind: "image"; imageId: number }
    | { kind: "location"; entityType: "stop" | "terminal"; entityId: number }
    | { kind: "proposal"; proposalId: number },
): Promise<MapImageCandidate[]> {
  let query = adminClient
    .from("map_images")
    .select("id, storage_path")
    .eq("is_approved", true)
    .eq("moderation_status", "approved")
    .eq("is_banned", false)
    .eq("is_deleted", false)
    .is("public_storage_path", null);

  if (scope.kind === "image") {
    query = query.eq("id", scope.imageId);
  } else if (scope.kind === "proposal") {
    query = query.eq("route_change_proposal_id", scope.proposalId);
  } else if (scope.entityType === "stop") {
    query = query.eq("stop_id", scope.entityId).is("route_change_proposal_id", null);
  } else {
    query = query.eq("terminal_id", scope.entityId).is("route_change_proposal_id", null);
  }

  const { data, error } = await query.order("id", { ascending: true });

  if (error) throw error;

  if (!Array.isArray(data) || !data.every(isCandidate)) {
    throw new Error("The approved map-image query returned invalid data.");
  }

  return data;
}

/**
 * A deterministic path makes publication idempotent. If a previous request
 * copied the object but failed before the database finalization RPC, a retry
 * detects and reuses that same object.
 */
async function ensurePublicCopy(
  adminClient: SupabaseClient,
  sourcePath: string,
  publicPath: string,
): Promise<void> {
  const folder = publicPath.slice(0, publicPath.lastIndexOf("/"));
  const filename = publicPath.slice(publicPath.lastIndexOf("/") + 1);

  const { error: copyError } = await adminClient.storage
    .from(PRIVATE_BUCKET)
    .copy(sourcePath, publicPath, {
      destinationBucket: PUBLIC_BUCKET,
    });

  if (!copyError) return;

  // A duplicate destination is expected during a retry or concurrent
  // publication. Confirm the exact object exists before reusing it.
  const { data: files, error: listError } = await adminClient.storage
    .from(PUBLIC_BUCKET)
    .list(folder, {
      limit: 100,
      search: filename,
    });

  if (
    !listError &&
    Array.isArray(files) &&
    files.some((file) => file.name === filename)
  ) {
    return;
  }

  throw copyError;
}

const callPublishMapImage = (
  adminClient: SupabaseClient,
  imageId: number,
  publicPath: string,
): Promise<PublishRpcResult> => {
  const rpc = adminClient.rpc.bind(adminClient) as unknown as (
    functionName: "publish_map_image",
    args: {
      p_image_id: number;
      p_public_storage_path: string;
    },
  ) => Promise<PublishRpcResult>;

  return rpc("publish_map_image", {
    p_image_id: imageId,
    p_public_storage_path: publicPath,
  });
};

async function publishOne(
  adminClient: SupabaseClient,
  image: MapImageCandidate,
): Promise<{ alreadyPublished: boolean }> {
  // Paths are read from the private database row, never supplied by a caller.
  if (
    image.storage_path.startsWith("/") ||
    image.storage_path.includes("..") ||
    image.storage_path.includes("\\")
  ) {
    throw new Error("The private source path is invalid.");
  }

  const extension = getSafeExtension(image.storage_path);
  const publicPath = getPublicPath(
    image.id,
    image.storage_path,
    extension,
  );
  let publicCopyMayExist = false;

  try {
    await ensurePublicCopy(
      adminClient,
      image.storage_path,
      publicPath,
    );
    publicCopyMayExist = true;

    const { data, error } = await callPublishMapImage(
      adminClient,
      image.id,
      publicPath,
    );

    if (error) throw error;

    if (!isRecord(data) || data.published !== true) {
      throw new Error("The database did not confirm map-image publication.");
    }

    return {
      alreadyPublished: data.already_published === true,
    };
  } catch (error: unknown) {
    // A public object without a matching database publication path is an
    // orphan. Remove it so a failed eligibility check cannot leave a public
    // object behind. Cleanup failure is logged without hiding the root error.
    if (publicCopyMayExist) {
      const { error: removeError } = await adminClient.storage
        .from(PUBLIC_BUCKET)
        .remove([publicPath]);

      if (removeError) {
        console.error(
          "[mapImagePublishing] Failed to remove an unpublished public copy:",
          image.id,
          removeError,
        );
      }
    }

    throw error;
  }
}

async function publishApprovedCandidates(
  adminClient: SupabaseClient,
  scope:
    | { kind: "image"; imageId: number }
    | { kind: "location"; entityType: "stop" | "terminal"; entityId: number }
    | { kind: "proposal"; proposalId: number },
): Promise<MapImagePublicationResult> {
  const result: MapImagePublicationResult = {
    attempted: 0,
    published: 0,
    alreadyPublished: 0,
    failed: 0,
    failures: [],
  };

  let candidates: MapImageCandidate[];

  try {
    candidates = await getApprovedUnpublishedCandidates(adminClient, scope);
  } catch (error: unknown) {
    const imageId = scope.kind === "image" ? scope.imageId : null;
    result.failed = 1;
    result.failures.push({
      imageId,
      message: getFailureMessage(error),
    });

    console.error(
      "[mapImagePublishing] Unable to load approved unpublished photographs:",
      error,
    );

    return result;
  }

  for (const image of candidates) {
    result.attempted += 1;

    try {
      const publication = await publishOne(adminClient, image);

      if (publication.alreadyPublished) {
        result.alreadyPublished += 1;
      } else {
        result.published += 1;
      }
    } catch (error: unknown) {
      result.failed += 1;
      result.failures.push({
        imageId: image.id,
        message: getFailureMessage(error),
      });

      console.error(
        "[mapImagePublishing] Photograph publication failed:",
        image.id,
        error,
      );
    }
  }

  return result;
}

/** Publish one image only after the authenticated moderation RPC approves it. */
export function publishApprovedMapImageById(
  adminClient: SupabaseClient,
  imageId: number,
): Promise<MapImagePublicationResult> {
  if (!isPositiveSafeInteger(imageId)) {
    return Promise.resolve({
      attempted: 0,
      published: 0,
      alreadyPublished: 0,
      failed: 1,
      failures: [{ imageId: null, message: "A valid map-image ID is required." }],
    });
  }

  return publishApprovedCandidates(adminClient, {
    kind: "image",
    imageId,
  });
}

/** Publish approved photographs attached directly or through a proposal to a location. */
export function publishApprovedMapImagesForLocation(
  adminClient: SupabaseClient,
  entityType: "stop" | "terminal",
  entityId: number,
): Promise<MapImagePublicationResult> {
  if (
    (entityType !== "stop" && entityType !== "terminal") ||
    !isPositiveSafeInteger(entityId)
  ) {
    return Promise.resolve({
      attempted: 0,
      published: 0,
      alreadyPublished: 0,
      failed: 1,
      failures: [{ imageId: null, message: "A valid map location is required." }],
    });
  }

  return publishApprovedCandidates(adminClient, {
    kind: "location",
    entityType,
    entityId,
  });
}

/** Publish all approved proposal photographs, preserving their existing point/order associations. */
export function publishApprovedMapImagesForProposal(
  adminClient: SupabaseClient,
  proposalId: number,
): Promise<MapImagePublicationResult> {
  if (!isPositiveSafeInteger(proposalId)) {
    return Promise.resolve({
      attempted: 0,
      published: 0,
      alreadyPublished: 0,
      failed: 1,
      failures: [{ imageId: null, message: "A valid route proposal is required." }],
    });
  }

  return publishApprovedCandidates(adminClient, {
    kind: "proposal",
    proposalId,
  });
}
