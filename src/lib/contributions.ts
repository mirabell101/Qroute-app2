
import { supabase } from "@/lib/supabase";
import { getPublicMapData } from "@/lib/publicMap";

// ==================================================
// CORE TYPES
// ==================================================

export type ContributionKind = "terminal" | "stop" | "route";
export type PointKind = "terminal" | "stop";

export type ReviewStatus = "pending" | "approved" | "rejected";

export type RouteChangeProposalType =
  | "insert_point"
  | "extend_route";

export type RouteChangeProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "conflicted"
  | "withdrawn";

export type MyContributionKind =
  ContributionKind | "route_change";

export type MyContributionStatus =
  | ReviewStatus
  | RouteChangeProposalStatus;

export type StopKind = "road_stop" | "train_station";

// ==================================================
// TRANSPORT OPTIONS
// ==================================================

export interface TransportTypeOption {
  id: number;
  name: string;
  color: string;
}

export interface TransportVariantOption {
  id: number;
  transport_type_id: number;
  code: string;
  name: string;
  fare_model: "distance" | "matrix";
}

// ==================================================
// NORMAL CONTRIBUTION INPUTS
// ==================================================

export interface PointInput {
  kind: PointKind;
  existingId?: number | null;
  transportTypeId?: number | null;
  name: string;
  description: string;
  stopType: StopKind;
  latitude: number;
  longitude: number;
}

/**
 * Standalone stops are intentionally excluded.
 *
 * Stops remain supported inside route submissions.
 * Historical standalone stop records remain supported
 * through MyContribution and ContributionKind.
 */
export type ContributionInput =
  | ({
      kind: "terminal";
    } & PointInput)
  | {
      kind: "route";
      name: string;
      variantId: number;
      points: PointInput[];
    };

export interface SubmitResult {
  routeId: number | null;
  points: {
    kind: PointKind;
    id: number;
  }[];
  moderationStatus: "pending" | "approved";
}

// ==================================================
// ROUTE-CHANGE PROPOSAL INPUTS
// ==================================================

/**
 * A previously approved location already in the catalog.
 *
 * Existing locations are referenced by their database ID.
 * They are not recreated by the proposal submission.
 */
export interface ExistingRouteChangePointInput {
  kind: PointKind;
  existingId: number;
}

/**
 * A new terminal proposed as part of a route modification.
 */
export interface NewRouteChangeTerminalInput {
  kind: "terminal";
  existingId: null;
  name: string;
  latitude: number;
  longitude: number;
}

/**
 * A new stop proposed as part of a route modification.
 */
export interface NewRouteChangeStopInput {
  kind: "stop";
  existingId: null;
  name: string;
  description?: string;
  stopType: StopKind;
  latitude: number;
  longitude: number;
}

export type RouteChangePointInput =
  | ExistingRouteChangePointInput
  | NewRouteChangeTerminalInput
  | NewRouteChangeStopInput;

export interface RouteChangeProposalInput {
  routeId: number;
  proposalType: RouteChangeProposalType;

  /**
   * Optional proposed replacement name for the existing route.
   *
   * Leave undefined or blank when the route name should remain
   * unchanged.
   */
  proposedName?: string | null;

  /**
   * Complete proposed route sequence, including every original
   * location and any new locations.
   */
  points: RouteChangePointInput[];
}

export interface RouteChangeSubmitPoint {
  kind: PointKind;
  id: number;
  isNewPoint: boolean;
}

export interface RouteChangeProposalSubmitResult {
  proposalId: number;
  routeId: number;
  proposalType: RouteChangeProposalType;
  moderationStatus: "pending";
  pointCount: number;
  createdPointCount: number;
  points: RouteChangeSubmitPoint[];
}

// ==================================================
// USER CONTRIBUTIONS
// ==================================================

export interface MyContribution {
  key: string;
  kind: MyContributionKind;
  id: number;
  name: string;
  status: MyContributionStatus;
  note: string | null;
  createdAt: string;
}

// ==================================================
// EXISTING APPROVED TRANSIT POINTS
// ==================================================

/**
 * An approved, publicly visible terminal or stop that
 * a route can reuse.
 */
export interface ExistingPoint {
  kind: PointKind;
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  stopType: StopKind | "terminal";
  transportTypeId: number | null;
  routeIds: number[];
}

/**
 * An approved route with its ordered points as pointKey strings.
 *
 * The keys preserve the existing route sequence.
 * Route-change proposals use these keys to reconstruct
 * the complete proposed sequence.
 */
export interface ExistingRoute {
  id: number;
  name: string;
  transportTypeId: number;
  variantId: number;
  keys: string[];
}

export interface TransitCatalog {
  points: ExistingPoint[];
  routes: ExistingRoute[];
}

// ==================================================
// GENERAL HELPERS
// ==================================================

export const pointKey = (
  kind: PointKind,
  id: number
) => `${kind}-${id}`;

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isPositiveSafeInteger(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

// ==================================================
// NORMAL CONTRIBUTION RESPONSE VALIDATION
// ==================================================

function isSubmitPoint(
  value: unknown
): value is {
  kind: PointKind;
  id: number;
} {
  return (
    isRecord(value) &&
    (value.kind === "terminal" ||
      value.kind === "stop") &&
    isPositiveSafeInteger(value.id)
  );
}

function isSubmitResult(
  value: unknown
): value is {
  route_id: number | null;
  points: {
    kind: PointKind;
    id: number;
  }[];
  moderation_status: "pending" | "approved";
} {
  return (
    isRecord(value) &&
    (
      value.route_id === null ||
      isPositiveSafeInteger(value.route_id)
    ) &&
    (
      value.moderation_status === "pending" ||
      value.moderation_status === "approved"
    ) &&
    Array.isArray(value.points) &&
    value.points.every(isSubmitPoint)
  );
}

// ==================================================
// ROUTE-CHANGE PROPOSAL RESPONSE VALIDATION
// ==================================================

function isRouteChangeSubmitPoint(
  value: unknown
): value is {
  kind: PointKind;
  id: number;
  is_new_point: boolean;
} {
  return (
    isRecord(value) &&
    (value.kind === "terminal" ||
      value.kind === "stop") &&
    isPositiveSafeInteger(value.id) &&
    typeof value.is_new_point === "boolean"
  );
}

function isRouteChangeProposalSubmitResult(
  value: unknown
): value is {
  proposal_id: number;
  route_id: number;
  proposal_type: RouteChangeProposalType;
  moderation_status: "pending";
  point_count: number;
  created_point_count: number;
  points: {
    kind: PointKind;
    id: number;
    is_new_point: boolean;
  }[];
} {
  return (
    isRecord(value) &&
    isPositiveSafeInteger(value.proposal_id) &&
    isPositiveSafeInteger(value.route_id) &&
    (
      value.proposal_type === "insert_point" ||
      value.proposal_type === "extend_route"
    ) &&
    value.moderation_status === "pending" &&
    typeof value.point_count === "number" &&
    Number.isSafeInteger(value.point_count) &&
    value.point_count >= 2 &&
    typeof value.created_point_count === "number" &&
    Number.isSafeInteger(value.created_point_count) &&
    value.created_point_count >= 1 &&
    Array.isArray(value.points) &&
    value.points.every(isRouteChangeSubmitPoint) &&
    value.points.length === value.point_count
  );
}

// ==================================================
// TRANSPORT OPTIONS
// ==================================================

export async function getTransportOptions(
  currentUserId: string | null | undefined = undefined
): Promise<{
  types: TransportTypeOption[];
  variants: TransportVariantOption[];
}> {
  if (currentUserId === null) {
    const publicData = await getPublicMapData();

    return {
      types: publicData.transportTypes,
      variants: publicData.transportVariants,
    };
  }

  const [types, variants] = await Promise.all([
    supabase
      .from("transport_types")
      .select("id, name, color")
      .order("name"),

    supabase
      .from("transport_variants")
      .select(
        "id, transport_type_id, code, name, fare_model"
      )
      .eq("is_active", true)
      .order("name"),
  ]);

  if (types.error) {
    throw new Error(types.error.message);
  }

  if (variants.error) {
    throw new Error(variants.error.message);
  }

  return {
    types: (types.data ?? []) as TransportTypeOption[],
    variants: (variants.data ?? []) as TransportVariantOption[],
  };
}

// ==================================================
// TRANSIT CATALOG RAW TYPES
// ==================================================

interface RawTerminal {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  transport_type_id: number | null;
}

interface RawStop extends RawTerminal {
  stop_type: StopKind;
}

interface RawRoute {
  id: number;
  name: string;
  transport_type_id: number;
  variant_id: number;
  route_stops: {
    stop_order: number;
    terminal_id: number | null;
    stop_id: number | null;
  }[];
}

// ==================================================
// TRANSIT CATALOG
// ==================================================

/**
 * Loads approved terminals, stops and routes.
 *
 * Optional transportTypeId:
 * - When omitted, loads all eligible transport types.
 * - When supplied, filters authenticated database queries
 *   by transport_type_id before downloading the records.
 *
 * For the Contributions page, use the selected transport type
 * so the browser does not need to load every vehicle's catalog.
 *
 * Pending, rejected, banned and deleted rows are excluded.
 * A route is returned only when every point in its sequence
 * is available.
 */
export async function getTransitCatalog(
  currentUserId: string | null | undefined = undefined,
  transportTypeId?: number
): Promise<TransitCatalog> {
  if (
    transportTypeId !== undefined &&
    !isPositiveSafeInteger(transportTypeId)
  ) {
    throw new Error("Invalid transport type filter.");
  }

  // --------------------------------------------------
  // PUBLIC CATALOG PATH
  // --------------------------------------------------

  if (currentUserId === null) {
    const publicData = await getPublicMapData();

    const points = new Map<string, ExistingPoint>();

    for (const terminal of publicData.terminals) {
      points.set(
        pointKey("terminal", terminal.id),
        {
          kind: "terminal",
          id: terminal.id,
          name: terminal.name,
          latitude: terminal.latitude,
          longitude: terminal.longitude,
          stopType: "terminal",
          transportTypeId: null,
          routeIds: [],
        }
      );
    }

    for (const stop of publicData.stops) {
      points.set(
        pointKey("stop", stop.id),
        {
          kind: "stop",
          id: stop.id,
          name: stop.name,
          latitude: stop.latitude,
          longitude: stop.longitude,
          stopType: stop.stop_type,
          transportTypeId: null,
          routeIds: [],
        }
      );
    }

    const routes: ExistingRoute[] = [];

    for (const route of publicData.routes) {
      if (
        transportTypeId !== undefined &&
        route.transport_type_id !== transportTypeId
      ) {
        continue;
      }

      const keys = route.route_stops.flatMap((row) => {
        if (row.terminals) {
          return [
            pointKey("terminal", row.terminals.id),
          ];
        }

        if (row.stops) {
          return [
            pointKey("stop", row.stops.id),
          ];
        }

        return [];
      });

      if (keys.length < 2) continue;

      routes.push({
        id: route.id,
        name: route.name,
        transportTypeId: route.transport_type_id,
        variantId: route.transport_variants.id,
        keys,
      });

      for (const key of keys) {
        const point = points.get(key);

        if (
          point &&
          !point.routeIds.includes(route.id)
        ) {
          point.routeIds.push(route.id);
        }
      }
    }

    /**
     * The public-map data helper currently supplies a complete
     * public catalog rather than accepting transport filters.
     *
     * When a filter is requested, retain only points belonging
     * to routes of that transport type.
     */
    const publicPoints = [...points.values()];

    return {
      points:
        transportTypeId === undefined
          ? publicPoints
          : publicPoints.filter(
              (point) => point.routeIds.length > 0
            ),
      routes,
    };
  }

  // --------------------------------------------------
  // AUTHENTICATED CATALOG PATH
  // --------------------------------------------------

  let terminalQuery = supabase
    .from("terminals")
    .select(
      "id, name, latitude, longitude, transport_type_id"
    )
    .eq("is_approved", true)
    .eq("moderation_status", "approved")
    .eq("is_active", true)
    .eq("is_deleted", false)
    .eq("is_banned", false);

  let stopQuery = supabase
    .from("stops")
    .select(
      "id, name, stop_type, latitude, longitude, transport_type_id"
    )
    .eq("is_approved", true)
    .eq("moderation_status", "approved")
    .eq("is_active", true)
    .eq("is_deleted", false)
    .eq("is_banned", false);

  let routeQuery = supabase
    .from("routes")
    .select(
      "id, name, transport_type_id, variant_id, route_stops ( stop_order, terminal_id, stop_id )"
    )
    .eq("is_approved", true)
    .eq("moderation_status", "approved")
    .eq("is_active", true)
    .eq("is_deleted", false)
    .eq("is_banned", false);

  // Apply transport filtering directly in the database.
  if (transportTypeId !== undefined) {
    terminalQuery = terminalQuery.eq(
      "transport_type_id",
      transportTypeId
    );

    stopQuery = stopQuery.eq(
      "transport_type_id",
      transportTypeId
    );

    routeQuery = routeQuery.eq(
      "transport_type_id",
      transportTypeId
    );
  }

  const [terminals, stops, routes] = await Promise.all([
    terminalQuery.order("name"),
    stopQuery.order("name"),
    routeQuery.order("name"),
  ]);

  if (terminals.error) {
    throw new Error(terminals.error.message);
  }

  if (stops.error) {
    throw new Error(stops.error.message);
  }

  if (routes.error) {
    throw new Error(routes.error.message);
  }

  // --------------------------------------------------
  // BUILD THE POINT LOOKUP
  // --------------------------------------------------

  const points = new Map<string, ExistingPoint>();

  for (
    const row of (terminals.data ?? []) as RawTerminal[]
  ) {
    points.set(pointKey("terminal", row.id), {
      kind: "terminal",
      id: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      stopType: "terminal",
      transportTypeId: row.transport_type_id,
      routeIds: [],
    });
  }

  for (const row of (stops.data ?? []) as RawStop[]) {
    points.set(pointKey("stop", row.id), {
      kind: "stop",
      id: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      stopType: row.stop_type,
      transportTypeId: row.transport_type_id,
      routeIds: [],
    });
  }

  // --------------------------------------------------
  // BUILD THE ORDERED ROUTE CATALOG
  // --------------------------------------------------

  const catalogRoutes: ExistingRoute[] = [];

  for (
    const route of (routes.data ?? []) as unknown as RawRoute[]
  ) {
    const ordered = [...route.route_stops].sort(
      (a, b) => a.stop_order - b.stop_order
    );

    const keys: string[] = [];
    let complete = ordered.length >= 2;

    for (const row of ordered) {
      const key =
        row.terminal_id !== null
          ? pointKey("terminal", row.terminal_id)
          : row.stop_id !== null
            ? pointKey("stop", row.stop_id)
            : null;

      if (!key || !points.has(key)) {
        complete = false;
        break;
      }

      keys.push(key);
    }

    if (!complete) continue;

    catalogRoutes.push({
      id: route.id,
      name: route.name,
      transportTypeId: route.transport_type_id,
      variantId: route.variant_id,
      keys,
    });

    for (const key of keys) {
      const point = points.get(key);

      if (
        point &&
        !point.routeIds.includes(route.id)
      ) {
        point.routeIds.push(route.id);
      }
    }
  }

  return {
    points: [...points.values()],
    routes: catalogRoutes,
  };
}

// ==================================================
// NORMAL CONTRIBUTION SUBMISSION
// ==================================================

const pointPayload = (point: PointInput) => ({
  kind: point.kind,
  existing_id: point.existingId ?? null,
  transport_type_id: point.transportTypeId ?? null,
  name: point.name.trim(),
  description: point.description.trim(),
  stop_type: point.stopType,
  latitude: point.latitude,
  longitude: point.longitude,
});

/**
 * Normal contribution workflow.
 *
 * Supported submissions:
 * - New standalone terminals.
 * - Completely separate new routes containing terminals/stops.
 *
 * Standalone stops are rejected by the database.
 * Existing-route modifications must use
 * submitRouteChangeProposal().
 *
 * The database RPC remains the authoritative validator.
 */
export async function submitContribution(
  input: ContributionInput
): Promise<SubmitResult> {
  const payload =
    input.kind === "route"
      ? {
          name: input.name.trim(),
          variant_id: input.variantId,
          points: input.points.map(pointPayload),
        }
      : pointPayload(input);

  const { data, error } = await supabase.rpc(
    "submit_contribution",
    {
      p_kind: input.kind,
      p_payload: payload,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!isSubmitResult(data)) {
    throw new Error(
      "Contribution service returned an invalid response."
    );
  }

  return {
    routeId: data.route_id,
    points: data.points,
    moderationStatus: data.moderation_status,
  };
}

// ==================================================
// ROUTE-CHANGE PROPOSAL SUBMISSION
// ==================================================

/**
 * Converts typed route-change points into the exact JSON
 * expected by public.submit_route_change_proposal().
 *
 * Existing point:
 *   { kind, existing_id }
 *
 * New terminal:
 *   { kind, existing_id: null, name, latitude, longitude }
 *
 * New stop:
 *   {
 *     kind,
 *     existing_id: null,
 *     name,
 *     description,
 *     stop_type,
 *     latitude,
 *     longitude
 *   }
 *
 * Do not add transport_type_id or unrelated fields.
 * The SQL function deliberately rejects unsupported keys.
 */
function routeChangePointPayload(
  point: RouteChangePointInput
): Record<string, unknown> {
  if (point.existingId !== null) {
    return {
      kind: point.kind,
      existing_id: point.existingId,
    };
  }

  if (point.kind === "terminal") {
    return {
      kind: "terminal",
      existing_id: null,
      name: point.name.trim(),
      latitude: point.latitude,
      longitude: point.longitude,
    };
  }

  return {
    kind: "stop",
    existing_id: null,
    name: point.name.trim(),
    description: (point.description ?? "").trim(),
    stop_type: point.stopType,
    latitude: point.latitude,
    longitude: point.longitude,
  };
}

/**
 * Submits a proposal to insert locations into or extend
 * an existing approved route.
 *
 * The authenticated Supabase client supplies the caller's JWT.
 * The database RPC uses auth.uid() to identify the contributor.
 *
 * This method does not directly update routes or route_stops.
 * The approved route remains unchanged until moderation approves
 * the proposal.
 */
export async function submitRouteChangeProposal(
  input: RouteChangeProposalInput
): Promise<RouteChangeProposalSubmitResult> {
  if (!isPositiveSafeInteger(input.routeId)) {
    throw new Error("Invalid target route.");
  }

  if (
    input.proposalType !== "insert_point" &&
    input.proposalType !== "extend_route"
  ) {
    throw new Error("Invalid route-change proposal type.");
  }

  if (
    !Array.isArray(input.points) ||
    input.points.length < 2 ||
    input.points.length > 100
  ) {
    throw new Error(
      "A proposed route must contain between 2 and 100 locations."
    );
  }

  const payload: Record<string, unknown> = {
    points: input.points.map(routeChangePointPayload),
  };

  const proposedName = input.proposedName?.trim();

  if (proposedName) {
    if (proposedName.length > 180) {
      throw new Error(
        "The proposed route name cannot exceed 180 characters."
      );
    }

    payload.proposed_name = proposedName;
  }

  const { data, error } = await supabase.rpc(
    "submit_route_change_proposal",
    {
      p_route_id: input.routeId,
      p_proposal_type: input.proposalType,
      p_payload: payload,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!isRouteChangeProposalSubmitResult(data)) {
    throw new Error(
      "Route-change proposal service returned an invalid response."
    );
  }

  // Ensure the RPC response corresponds to the submitted request.
  if (
    data.route_id !== input.routeId ||
    data.proposal_type !== input.proposalType
  ) {
    throw new Error(
      "Route-change proposal service returned an unexpected result."
    );
  }

  return {
    proposalId: data.proposal_id,
    routeId: data.route_id,
    proposalType: data.proposal_type,
    moderationStatus: data.moderation_status,
    pointCount: data.point_count,
    createdPointCount: data.created_point_count,
    points: data.points.map((point) => ({
      kind: point.kind,
      id: point.id,
      isNewPoint: point.is_new_point,
    })),
  };
}

// ==================================================
// USER CONTRIBUTION HISTORY
// ==================================================

interface OwnRow {
  id: number;
  name: string;
  moderation_status: ReviewStatus;
  moderation_note: string | null;
  created_at: string;
}

interface OwnRouteChangeProposalRow {
  id: number;
  route_id: number;
  proposal_type: RouteChangeProposalType;
  proposed_name: string | null;
  status: RouteChangeProposalStatus;
  moderation_note: string | null;
  created_at: string;
}

interface OwnRouteChangeProposalPointRow {
  terminal_id: number | null;
  stop_id: number | null;
}

/**
 * Loads the current user's:
 * - Terminal submissions.
 * - Historical standalone Stop submissions.
 * - Completely new route submissions.
 * - Existing-route modification proposals.
 *
 * New locations created by a route-change proposal are excluded
 * from standalone terminal/stop history. They appear under
 * their parent proposal instead.
 *
 * Existing locations referenced by proposals are not excluded.
 */
export async function getMyContributions(
  userId: string
): Promise<MyContribution[]> {
  // --------------------------------------------------
  // 1. LOAD ORDINARY CONTRIBUTIONS AND OWN PROPOSALS
  // --------------------------------------------------

  const load = async (
    table: "terminals" | "stops" | "routes"
  ) => {
    const { data, error } = await supabase
      .from(table)
      .select(
        "id, name, moderation_status, moderation_note, created_at"
      )
      .eq("created_by", userId)
      .eq("is_deleted", false);

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as OwnRow[];
  };

  const [
    terminals,
    stops,
    routes,
    routeChangeProposalsResult,
  ] = await Promise.all([
    load("terminals"),
    load("stops"),
    load("routes"),

    supabase
      .from("route_change_proposals")
      .select(
        "id, route_id, proposal_type, proposed_name, status, moderation_note, created_at"
      )
      .eq("contributor_id", userId),
  ]);

  if (routeChangeProposalsResult.error) {
    throw new Error(
      routeChangeProposalsResult.error.message
    );
  }

  const routeChangeProposals = (
    routeChangeProposalsResult.data ?? []
  ) as OwnRouteChangeProposalRow[];

  // --------------------------------------------------
  // 2. LOAD NEW POINTS CREATED BY THOSE PROPOSALS
  // --------------------------------------------------

  const proposalIds = routeChangeProposals.map(
    (proposal) => proposal.id
  );

  let proposalCreatedPoints:
    OwnRouteChangeProposalPointRow[] = [];

  if (proposalIds.length > 0) {
    const { data, error } = await supabase
      .from("route_change_proposal_points")
      .select("terminal_id, stop_id")
      .eq("is_new_point", true)
      .in("proposal_id", proposalIds);

    if (error) {
      throw new Error(error.message);
    }

    proposalCreatedPoints = (
      data ?? []
    ) as OwnRouteChangeProposalPointRow[];
  }

  // --------------------------------------------------
  // 3. BUILD SETS OF PROPOSAL-OWNED LOCATION IDS
  // --------------------------------------------------

  const proposalCreatedTerminalIds = new Set<number>();
  const proposalCreatedStopIds = new Set<number>();

  for (const point of proposalCreatedPoints) {
    if (point.terminal_id !== null) {
      proposalCreatedTerminalIds.add(point.terminal_id);
    }

    if (point.stop_id !== null) {
      proposalCreatedStopIds.add(point.stop_id);
    }
  }

  // --------------------------------------------------
  // 4. BUILD NORMAL CONTRIBUTION HISTORY
  // --------------------------------------------------

  const toItem =
    (kind: ContributionKind) =>
    (row: OwnRow): MyContribution => ({
      key: `${kind}-${row.id}`,
      kind,
      id: row.id,
      name: row.name,
      status: row.moderation_status,
      note: row.moderation_note,
      createdAt: row.created_at,
    });

  const normalContributions: MyContribution[] = [
    ...terminals
      .filter(
        (row) =>
          !proposalCreatedTerminalIds.has(row.id)
      )
      .map(toItem("terminal")),

    ...stops
      .filter(
        (row) =>
          !proposalCreatedStopIds.has(row.id)
      )
      .map(toItem("stop")),

    ...routes.map(toItem("route")),
  ];

  // --------------------------------------------------
  // 5. BUILD ROUTE-CHANGE PROPOSAL HISTORY
  // --------------------------------------------------

  const proposalContributions: MyContribution[] =
    routeChangeProposals.map((row) => {
      const proposalLabel =
        row.proposal_type === "insert_point"
          ? "Route insertion proposal"
          : "Route extension proposal";

      return {
        key: `route-change-${row.id}`,
        kind: "route_change",
        id: row.id,
        name:
          row.proposed_name?.trim() ||
          `${proposalLabel} · Route #${row.route_id}`,
        status: row.status,
        note: row.moderation_note,
        createdAt: row.created_at,
      };
    });

  // --------------------------------------------------
  // 6. COMBINE AND SORT
  // --------------------------------------------------

  return [
    ...normalContributions,
    ...proposalContributions,
  ].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}
