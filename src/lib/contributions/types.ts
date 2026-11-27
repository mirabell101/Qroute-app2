// ==================================================
// CORE TYPES
// ==================================================
export type ContributionKind = "terminal" | "stop" | "route";
export type PointKind = "terminal" | "stop";
export type ReviewStatus = "pending" | "approved" | "rejected";
export type RouteChangeProposalType =
  | "insert_point"
  | "extend_route"
  | "combined"
  | "remove_points";
export type RouteChangeProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "conflicted"
  | "withdrawn";
export type MyContributionKind = ContributionKind | "route_change";
export type MyContributionStatus = ReviewStatus | RouteChangeProposalStatus;
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

export type ContributionInput =
  | ({ kind: "terminal" } & PointInput)
  | ({ kind: "stop" } & PointInput)
  | {
      kind: "route";
      name: string;
      variantId: number;
      points: PointInput[];
    };

export interface SubmitResult {
  routeId: number | null;
  points: { kind: PointKind; id: number }[];
  moderationStatus: "pending" | "approved";
}

// ==================================================
// ROUTE-CHANGE PROPOSAL INPUTS
// ==================================================
export interface ExistingRouteChangePointInput {
  kind: PointKind;
  existingId: number;
}

export interface NewRouteChangeTerminalInput {
  kind: "terminal";
  existingId: null;
  name: string;
  latitude: number;
  longitude: number;
}

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
  /** Blank or undefined keeps the existing route name. */
  proposedName?: string | null;
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
