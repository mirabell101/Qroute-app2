import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "map-images";
const SIGNED_URL_LIFETIME = 10 * 60;

export type AdminMapImageStatus =
  | "pending"
  | "approved"
  | "rejected";

export type AdminMapImageLocationType =
  | "terminal"
  | "stop";

export interface AdminMapImage {
  id: number;

  terminalId: number | null;
  stopId: number | null;

  caption: string | null;

  createdBy: string | null;
  createdAt: string;

  isApproved: boolean;
  moderationStatus: AdminMapImageStatus;
  moderationNote: string | null;

  moderatedBy: string | null;
  moderatedAt: string | null;

  isBanned: boolean;
  isDeleted: boolean;

  proposalId: number | null;
  proposalStopOrder: number | null;

  /**
   * Short-lived signed URL from the private map-images bucket.
   *
   * Null means the corresponding Storage object could not
   * be signed or could not be found.
   */
  imageUrl: string | null;
}

interface AdminMapImageDbRow {
  id: number;

  terminal_id: number | null;
  stop_id: number | null;

  storage_path: string;
  caption: string | null;

  created_by: string | null;
  created_at: string;

  is_approved: boolean;
  moderation_status: AdminMapImageStatus;
  moderation_note: string | null;

  moderated_by: string | null;
  moderated_at: string | null;

  is_banned: boolean;
  is_deleted: boolean;

  route_change_proposal_id: number | null;
  route_change_proposal_stop_order: number | null;
}

const IMAGE_SELECT = [
  "id",
  "terminal_id",
  "stop_id",
  "storage_path",
  "caption",
  "created_by",
  "created_at",
  "is_approved",
  "moderation_status",
  "moderation_note",
  "moderated_by",
  "moderated_at",
  "is_banned",
  "is_deleted",
  "route_change_proposal_id",
  "route_change_proposal_stop_order",
].join(",");

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Generates signed preview URLs for private image objects.
 *
 * The caller must provide an authenticated administrator's
 * Supabase client. Storage RLS remains active.
 */
async function attachSignedUrls(
  client: SupabaseClient,
  rows: AdminMapImageDbRow[],
): Promise<AdminMapImage[]> {
  if (rows.length === 0) {
    return [];
  }

  const paths = rows.map((row) => row.storage_path);

  const { data: signedData, error: signedError } =
    await client.storage
      .from(BUCKET)
      .createSignedUrls(
        paths,
        SIGNED_URL_LIFETIME,
      );

  if (signedError) {
    throw new Error(
      `Unable to retrieve map image previews: ${signedError.message}`,
    );
  }

  const signedUrlByPath = new Map<string, string>();

  for (const item of signedData ?? []) {
    if (
      typeof item.path === "string" &&
      typeof item.signedUrl === "string"
    ) {
      signedUrlByPath.set(
        item.path,
        item.signedUrl,
      );
    }
  }

  return rows.map((row) => ({
    id: row.id,

    terminalId: row.terminal_id,
    stopId: row.stop_id,

    caption: row.caption,

    createdBy: row.created_by,
    createdAt: row.created_at,

    isApproved: row.is_approved,
    moderationStatus: row.moderation_status,
    moderationNote: row.moderation_note,

    moderatedBy: row.moderated_by,
    moderatedAt: row.moderated_at,

    isBanned: row.is_banned,
    isDeleted: row.is_deleted,

    proposalId: row.route_change_proposal_id,
    proposalStopOrder:
      row.route_change_proposal_stop_order,

    imageUrl:
      signedUrlByPath.get(row.storage_path) ?? null,
  }));
}

/**
 * Retrieves photographs directly attached to an existing
 * terminal or stop.
 *
 * Proposal-associated photographs are deliberately excluded.
 *
 * This allows standalone location reviews to remain independent
 * from route-change proposal reviews.
 */
export async function getAdminMapImagesForLocation(
  client: SupabaseClient,
  locationType: AdminMapImageLocationType,
  locationId: number,
): Promise<AdminMapImage[]> {
  if (!isPositiveInteger(locationId)) {
    throw new Error("A valid location ID is required.");
  }

  if (
    locationType !== "terminal" &&
    locationType !== "stop"
  ) {
    throw new Error("A valid location type is required.");
  }

  const column =
    locationType === "terminal"
      ? "terminal_id"
      : "stop_id";

  const { data, error } = await client
    .from("map_images")
    .select(IMAGE_SELECT)
    .eq(column, locationId)
    .is("route_change_proposal_id", null)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows =
    (data ?? []) as unknown as AdminMapImageDbRow[];

  return attachSignedUrls(client, rows);
}

/**
 * Retrieves every non-deleted photograph belonging to
 * a particular route-change proposal.
 *
 * Images remain grouped by proposalStopOrder in the response
 * so the frontend can display them underneath their proposed
 * route locations.
 */
export async function getAdminMapImagesForProposal(
  client: SupabaseClient,
  proposalId: number,
): Promise<AdminMapImage[]> {
  if (!isPositiveInteger(proposalId)) {
    throw new Error(
      "A valid route-change proposal ID is required.",
    );
  }

  const { data, error } = await client
    .from("map_images")
    .select(IMAGE_SELECT)
    .eq("route_change_proposal_id", proposalId)
    .eq("is_deleted", false)
    .order(
      "route_change_proposal_stop_order",
      { ascending: true },
    )
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows =
    (data ?? []) as unknown as AdminMapImageDbRow[];

  return attachSignedUrls(client, rows);
}