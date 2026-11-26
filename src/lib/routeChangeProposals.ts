import { supabase } from "@/lib/supabase";
import { validateImage } from "@/lib/mapImages";

const BUCKET = "map-images";

export type RouteChangeProposalType =
  | "insert_point"
  | "extend_route"
  | "combined"
  | "remove_points";
export type RouteChangePointKind = "terminal" | "stop";
export type RouteChangeStopKind = "road_stop" | "train_station";

export type RouteChangeProposalPointInput =
  | {
      kind: "terminal";
      existingId?: number | null;
      name?: string;
      latitude?: number;
      longitude?: number;
    }
  | {
      kind: "stop";
      existingId?: number | null;
      name?: string;
      description?: string;
      stopType?: RouteChangeStopKind;
      latitude?: number;
      longitude?: number;
    };

export interface RouteChangePointEditInput {
  /** One-based index in the canonical sequence sent to the existing proposal RPC. */
  stopOrder: number;
  /** Final one-based position. Removed original points use a temporary positive position. */
  proposedStopOrder: number;
  proposedName?: string;
  /** Coordinates are included only when an existing shared location is moved. */
  latitude?: number;
  longitude?: number;
  /** Marks an original shared point that is replaced by a newly proposed location. */
  removeFromRoute?: boolean;
  /** Canonical stop_order of the original point replaced by this new point. */
  replacesStopOrder?: number;
}

export interface RouteChangeProposalWithEditsInput {
  routeId: number;
  proposalType: RouteChangeProposalType;
  proposedName?: string;
  contributorRemarks?: string;
  points: RouteChangeProposalPointInput[];
  pointEdits: RouteChangePointEditInput[];
}

export interface SubmittedRouteChangePoint {
  kind: RouteChangePointKind;
  id: number;
  isNewPoint: boolean;
}

export interface SubmittedRouteChangeProposal {
  proposalId: number;
  routeId: number;
  proposalType: RouteChangeProposalType;
  moderationStatus: "pending";
  points: SubmittedRouteChangePoint[];
}

interface RpcError {
  message: string;
}

interface RpcResult {
  data: unknown;
  error: RpcError | null;
}

/**
 * New proposal RPCs are added through a migration. Cast only the RPC method
 * signature so this helper remains usable before the generated Supabase
 * Database type file is refreshed with those new function declarations.
 */
const callRpc = supabase.rpc.bind(supabase) as unknown as (
  functionName: string,
  args: Record<string, unknown>
) => Promise<RpcResult>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serializeProposalPoint(point: RouteChangeProposalPointInput) {
  if (point.existingId != null) {
    return {
      kind: point.kind,
      existing_id: point.existingId,
    };
  }

  if (point.kind === "terminal") {
    return {
      kind: "terminal",
      existing_id: null,
      name: point.name?.trim() ?? "",
      latitude: point.latitude,
      longitude: point.longitude,
    };
  }

  return {
    kind: "stop",
    existing_id: null,
    name: point.name?.trim() ?? "",
    description: point.description?.trim() ?? "",
    stop_type: point.stopType ?? "road_stop",
    latitude: point.latitude,
    longitude: point.longitude,
  };
}

function parseProposalResult(value: unknown): SubmittedRouteChangeProposal {
  if (!isRecord(value)) {
    throw new Error("The proposal service returned an invalid response.");
  }

  const proposalId = Number(value.proposal_id);
  const routeId = Number(value.route_id);
  const proposalType = value.proposal_type;

  if (
    !Number.isSafeInteger(proposalId) || proposalId < 1 ||
    !Number.isSafeInteger(routeId) || routeId < 1 ||
    (proposalType !== "insert_point" &&
      proposalType !== "extend_route" &&
      proposalType !== "combined" &&
      proposalType !== "remove_points") ||
    value.moderation_status !== "pending" ||
    !Array.isArray(value.points)
  ) {
    throw new Error("The proposal service returned an incomplete response.");
  }

  const points = value.points.map((rawPoint): SubmittedRouteChangePoint => {
    if (!isRecord(rawPoint)) {
      throw new Error("The proposal service returned an invalid route point.");
    }

    const id = Number(rawPoint.id);
    if (
      (rawPoint.kind !== "terminal" && rawPoint.kind !== "stop") ||
      !Number.isSafeInteger(id) || id < 1 ||
      typeof rawPoint.is_new_point !== "boolean"
    ) {
      throw new Error("The proposal service returned an invalid route point.");
    }

    return {
      kind: rawPoint.kind,
      id,
      isNewPoint: rawPoint.is_new_point,
    };
  });

  return {
    proposalId,
    routeId,
    proposalType,
    moderationStatus: "pending",
    points,
  };
}

/**
 * Submits the complete route sequence plus proposed name changes to original
 * or reused locations. The server stores those edits as pending proposal data.
 */
export async function submitRouteChangeProposalWithEdits(
  input: RouteChangeProposalWithEditsInput
): Promise<SubmittedRouteChangeProposal> {
  if (!Number.isSafeInteger(input.routeId) || input.routeId < 1) {
    throw new Error("Choose a valid approved route.");
  }
  if (!Array.isArray(input.points) || input.points.length < 2 || input.points.length > 100) {
    throw new Error("A proposed route must contain between 2 and 100 locations.");
  }

  if (input.pointEdits.length !== input.points.length) {
    throw new Error("Every proposed route location must have a final sequence position.");
  }

  const pointEdits = input.pointEdits.map((edit) => {
    const isRemoved = edit.removeFromRoute === true;
    if (
      !Number.isSafeInteger(edit.stopOrder) ||
      edit.stopOrder < 1 ||
      edit.stopOrder > input.points.length ||
      !Number.isSafeInteger(edit.proposedStopOrder) ||
      edit.proposedStopOrder < 1 ||
      edit.proposedStopOrder > input.points.length
    ) {
      throw new Error("A proposed location has an invalid sequence position.");
    }

    if (edit.proposedName !== undefined) {
      const proposedName = edit.proposedName.trim();
      if (!proposedName || proposedName.length > 120) {
        throw new Error("Proposed terminal and stop names must contain 1 to 120 characters.");
      }
    }

    if (isRemoved && (edit.proposedName !== undefined || edit.latitude !== undefined || edit.longitude !== undefined)) {
      throw new Error("A replaced original location cannot also receive name or coordinate edits.");
    }

    if (edit.replacesStopOrder !== undefined) {
      if (
        isRemoved ||
        !Number.isSafeInteger(edit.replacesStopOrder) ||
        edit.replacesStopOrder < 1 ||
        edit.replacesStopOrder > input.points.length ||
        edit.replacesStopOrder === edit.stopOrder
      ) {
        throw new Error("A replacement point has an invalid original location reference.");
      }
    }

    const hasLatitude = edit.latitude !== undefined;
    const hasLongitude = edit.longitude !== undefined;
    if (hasLatitude !== hasLongitude) {
      throw new Error("Both latitude and longitude are required for a location move.");
    }
    if (hasLatitude && hasLongitude) {
      if (
        !Number.isFinite(edit.latitude) || edit.latitude! < -90 || edit.latitude! > 90 ||
        !Number.isFinite(edit.longitude) || edit.longitude! < -180 || edit.longitude! > 180
      ) {
        throw new Error("A proposed location has invalid coordinates.");
      }
    }

    return {
      stop_order: edit.stopOrder,
      proposed_stop_order: edit.proposedStopOrder,
      ...(edit.proposedName !== undefined
        ? { proposed_name: edit.proposedName.trim() }
        : {}),
      ...(hasLatitude && hasLongitude
        ? { latitude: edit.latitude, longitude: edit.longitude }
        : {}),
      ...(isRemoved ? { remove_from_route: true } : {}),
      ...(edit.replacesStopOrder !== undefined
        ? { replaces_stop_order: edit.replacesStopOrder }
        : {}),
    };
  });

  const seenOrders = new Set<number>();
  const seenProposedOrders = new Set<number>();
  const removedOrders = new Set<number>();
  const replacementTargets = new Set<number>();
  for (const edit of pointEdits) {
    if (seenOrders.has(edit.stop_order)) {
      throw new Error("A route location can only have one proposal edit.");
    }
    if (seenProposedOrders.has(edit.proposed_stop_order)) {
      throw new Error("Two route locations cannot occupy the same temporary sequence position.");
    }
    if (edit.remove_from_route === true) removedOrders.add(edit.stop_order);
    if (typeof edit.replaces_stop_order === "number") {
      if (replacementTargets.has(edit.replaces_stop_order)) {
        throw new Error("An original location cannot be replaced more than once.");
      }
      replacementTargets.add(edit.replaces_stop_order);
    }
    seenOrders.add(edit.stop_order);
    seenProposedOrders.add(edit.proposed_stop_order);
  }

  // A replacement is always paired with an original route location marked
  // for removal. Unpaired removals are valid: they represent a genuine
  // deletion request rather than a stop/terminal conversion.
  for (const order of replacementTargets) {
    if (!removedOrders.has(order)) {
      throw new Error("A replacement point must refer to an original location marked for removal.");
    }
  }

  if (input.proposalType === "remove_points") {
    if (removedOrders.size === 0 || replacementTargets.size > 0 ||
        input.points.some((point) => point.existingId == null)) {
      throw new Error("A removal-only proposal must remove at least one existing location and cannot add or convert locations.");
    }
  }

  const remarks = input.contributorRemarks?.trim() ?? "";
  if (remarks.length > 1000) {
    throw new Error("Contributor remarks cannot exceed 1,000 characters.");
  }

  const payload: Record<string, unknown> = {
    points: input.points.map(serializeProposalPoint),
    point_edits: pointEdits,
    contributor_remarks: remarks || null,
  };

  if (input.proposedName !== undefined) {
    payload.proposed_name = input.proposedName.trim() || null;
  }

  const { data, error } = await callRpc("submit_route_change_proposal_with_lifecycle_edits", {
    p_route_id: input.routeId,
    p_proposal_type: input.proposalType,
    p_payload: payload,
  });

  if (error) throw new Error(error.message);
  return parseProposalResult(data);
}

/**
 * Uploads a route-change photo into the private map-images bucket and then
 * attaches it to the exact ordered point inside the pending proposal.
 * It does not create a direct map_images attachment outside the proposal.
 */
export async function attachRouteChangeProposalImage(
  proposalId: number,
  stopOrder: number,
  file: File,
  caption: string | null = null
): Promise<string | null> {
  const validationError = validateImage(file);
  if (validationError) return validationError;

  if (
    !Number.isSafeInteger(proposalId) || proposalId < 1 ||
    !Number.isSafeInteger(stopOrder) || stopOrder < 1
  ) {
    return "The route proposal or point sequence is invalid.";
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) return authError.message;
  const user = authData.user;
  if (!user) return "Please sign in to upload a proposal photo.";

  const extension = file.type === "image/png"
    ? "png"
    : file.type === "image/webp"
      ? "webp"
      : "jpg";
  const storagePath = `${user.id}/route-change-proposals/${proposalId}/${stopOrder}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) return uploadError.message;

  const { error: attachError } = await callRpc("submit_route_change_proposal_image", {
    p_proposal_id: proposalId,
    p_stop_order: stopOrder,
    p_storage_path: storagePath,
    p_caption: caption,
  });

  if (attachError) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return attachError.message;
  }

  return null;
}
