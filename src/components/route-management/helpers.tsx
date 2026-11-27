import {
  Bus, TrainFront, CarFront, Route as RouteIcon,
} from "lucide-react";
import type { RouteManagementMapPoint } from "@/components/map/RouteManagementMap";
import type {
  AdminRouteRecord,
  AdminRouteChangeProposalPointRecord,
  AdminRouteChangeProposalRecord,
  AdminTransitPointRecord,
  AdminTransportTypeRecord,
} from "@/lib/adminApi";
import type { ExistingPoint } from "@/lib/contributions";
import type {
  EditorState,
  ManagementRow,
  RecordData,
} from "./types";

// ============================================================
// RECORD HELPERS
// ============================================================

export function isRouteRecord(
  record: RecordData,
): record is AdminRouteRecord {
  return "route_stops" in record;
}

export function isTransportTypeRecord(
  record: RecordData,
): record is AdminTransportTypeRecord {
  return (
    !("route_stops" in record) &&
    !("latitude" in record)
  );
}

export function isTransitPointRecord(
  record: RecordData,
): record is AdminTransitPointRecord {
  return (
    !isRouteRecord(record) &&
    !isTransportTypeRecord(record)
  );
}

export function pointKindLabel(point: ExistingPoint): string {
  if (point.kind === "terminal") {
    return "Terminal";
  }

  return point.stopType === "train_station"
    ? "Train station"
    : "Road stop";
}

export function recordStatus(
  record: AdminRouteRecord | AdminTransitPointRecord,
): string {
  if (record.is_deleted) return "Archived";
  if (record.is_banned) return "Banned";
  if (record.moderation_status === "pending") return "Pending";
  if (record.moderation_status === "rejected") return "Rejected";
  if (!record.is_active) return "Inactive";

  return "Approved";
}

export function statusClass(status: string): string {
  switch (status) {
    case "Approved":
      return "bg-green-100 text-green-700";

    case "Pending":
      return "bg-amber-100 text-amber-700";

    case "Rejected":
      return "bg-red-100 text-red-700";

    case "Banned":
      return "bg-red-100 text-red-800";

    case "Archived":
      return "bg-slate-200 text-slate-500";

    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function transportIcon(type: string) {
  const normalized = type.toLowerCase();

  if (normalized.includes("bus")) {
    return <Bus size={16} />;
  }

  if (normalized.includes("train")) {
    return <TrainFront size={16} />;
  }

  if (normalized.includes("jeep")) {
    return <CarFront size={16} />;
  }

  return <RouteIcon size={16} />;
}

// ============================================================
// ROUTE MAP HELPERS
// ============================================================

export function routeStopsSummary(
  route: AdminRouteRecord,
): string {
  return route.route_stops
    .map(
      (stop) =>
        stop.terminals?.name ??
        stop.stops?.name ??
        "Point unavailable",
    )
    .join(" → ");
}

export function routeMapPoints(
  route: AdminRouteRecord,
): RouteManagementMapPoint[] {
  return route.route_stops.flatMap<RouteManagementMapPoint>((routeStop) => {
    if (routeStop.terminals) {
      return [
        {
          key: `route-${route.id}-terminal-${routeStop.stop_order}`,
          name: routeStop.terminals.name,
          kind: "terminal" as const,
          latitude: routeStop.terminals.latitude,
          longitude: routeStop.terminals.longitude,
        },
      ];
    }

    if (routeStop.stops) {
      return [
        {
          key: `route-${route.id}-stop-${routeStop.stop_order}`,
          name: routeStop.stops.name,
          kind: "stop" as const,
          stopType: routeStop.stops.stop_type,
          latitude: routeStop.stops.latitude,
          longitude: routeStop.stops.longitude,
        },
      ];
    }

    return [];
  });
}

export function recordMapPoints(
  row: ManagementRow,
): RouteManagementMapPoint[] {
  const record = row.record;

  if (isRouteRecord(record)) {
    return routeMapPoints(record);
  }

  if (
    row.entityType === "transport_type" ||
    isTransportTypeRecord(record)
  ) {
    return [];
  }

  return [
    {
      key: `${row.entityType}-${record.id}`,
      name: record.name,
      kind:
        row.entityType === "terminal"
          ? "terminal"
          : "stop",
      stopType: record.stop_type,
      latitude: record.latitude,
      longitude: record.longitude,
    },
  ];
}

export function editorMapPoints(
  editor: EditorState,
  data: AdminRouteManagementData,
  availablePoints: ExistingPoint[],
): RouteManagementMapPoint[] {
  if (editor.entityType === "route") {
    const route =
      editor.id === null
        ? undefined
        : data.routes.find(
            (record) => record.id === editor.id,
          );

    return editor.stops.flatMap<RouteManagementMapPoint>(
      (selectedStop, index) => {
        const catalogPoint = availablePoints.find(
          (point) =>
            point.kind === selectedStop.kind &&
            point.id === selectedStop.id,
        );

        if (catalogPoint) {
          return [
            {
              key: `route-editor-${index}-${selectedStop.kind}-${selectedStop.id}`,
              name: catalogPoint.name,
              kind: catalogPoint.kind,
              stopType:
                catalogPoint.stopType === "train_station"
                  ? ("train_station" as const)
                  : null,
              latitude: catalogPoint.latitude,
              longitude: catalogPoint.longitude,
            },
          ];
        }

        const routeStop = route?.route_stops.find(
          (record) =>
            selectedStop.kind === "terminal"
              ? record.terminals?.id === selectedStop.id
              : record.stops?.id === selectedStop.id,
        );

        if (routeStop?.terminals) {
          return [
            {
              key: `route-editor-${index}-terminal-${routeStop.terminals.id}`,
              name: routeStop.terminals.name,
              kind: "terminal" as const,
              latitude: routeStop.terminals.latitude,
              longitude: routeStop.terminals.longitude,
            },
          ];
        }

        if (routeStop?.stops) {
          return [
            {
              key: `route-editor-${index}-stop-${routeStop.stops.id}`,
              name: routeStop.stops.name,
              kind: "stop" as const,
              stopType: routeStop.stops.stop_type,
              latitude: routeStop.stops.latitude,
              longitude: routeStop.stops.longitude,
            },
          ];
        }

        return [];
      },
    );
  }

  if (
    editor.entityType !== "stop" &&
    editor.entityType !== "terminal"
  ) {
    return [];
  }

  const record =
    editor.entityType === "stop"
      ? data.stops.find(
          (point) => point.id === editor.id,
        )
      : data.terminals.find(
          (point) => point.id === editor.id,
        );

  if (!record) {
    return [];
  }

  return [
    {
      key: `${editor.entityType}-${record.id}`,
      name: record.name,
      kind: editor.entityType,
      stopType: record.stop_type,
      latitude: record.latitude,
      longitude: record.longitude,
    },
  ];
}

// ============================================================
// ROUTE CHANGE PROPOSAL HELPERS
// ============================================================

export function proposalTypeLabel(
  proposal: AdminRouteChangeProposalRecord,
): string {
  switch (proposal.proposal_type) {
    case "insert_point":
      return "Insert points into route";
    case "extend_route":
      return "Extend existing route";
    case "combined":
      return "Combined route changes";
    case "remove_points":
      return "Remove route locations";
    default:
      return "Route modification";
  }
}

export function proposalPointName(
  point: AdminRouteChangeProposalPointRecord,
): string {
  return (
    point.proposed_name?.trim() ||
    point.terminals?.name ||
    point.stops?.name ||
    "Point unavailable"
  );
}

export function proposalPointType(
  point: AdminRouteChangeProposalPointRecord,
): string {
  if (point.terminals) {
    return "Terminal";
  }

  if (point.stops) {
    return point.stops.stop_type === "train_station"
      ? "Train station"
      : "Road stop";
  }

  return point.terminal_id !== null ? "Terminal" : "Stop";
}

export function proposalPointCoordinates(
  latitude: number | null,
  longitude: number | null,
): string | null {
  if (latitude === null || longitude === null) {
    return null;
  }

  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export function formatProposalDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString();
}

export function proposalPoints(
  proposal: AdminRouteChangeProposalRecord,
): AdminRouteChangeProposalPointRecord[] {
  return [...proposal.route_change_proposal_points].sort((left, right) => {
    if (left.is_removed_from_route !== right.is_removed_from_route) {
      return left.is_removed_from_route ? 1 : -1;
    }

    if (left.is_removed_from_route && right.is_removed_from_route) {
      return left.stop_order - right.stop_order;
    }

    return left.proposed_stop_order - right.proposed_stop_order;
  });
}

// ============================================================
// EDITOR HELPERS
// ============================================================

export function createEditorState(
  row: ManagementRow,
): EditorState {
  const base: EditorState = {
    entityType: row.entityType,
    id: row.id,
    name: row.name,
    color: "#123456",
    transportTypeId: null,
    variantId: null,
    isActive: row.isActive,
    latitude: "",
    longitude: "",
    description: "",
    stopType: "road_stop",
    stops: [],
  };

  if (isRouteRecord(row.record)) {
    return {
      ...base,
      transportTypeId:
        row.record.transport_type_id,
      variantId:
        row.record.transport_variants?.id ?? null,
      stops: row.record.route_stops.map((stop) => {
        if (stop.terminals) {
          return {
            kind: "terminal",
            id: stop.terminals.id,
            name: stop.terminals.name,
            kindLabel: "Terminal",
            unresolved: false,
          };
        }

        if (stop.stops) {
          return {
            kind: "stop",
            id: stop.stops.id,
            name: stop.stops.name,
            kindLabel:
              stop.stops.stop_type === "train_station"
                ? "Train station"
                : "Road stop",
            unresolved: false,
          };
        }

        return {
          kind: "terminal",
          id: 0,
          name: "Point unavailable",
          kindLabel: "Point unavailable",
          unresolved: true,
        };
      }),
    };
  }

  if (isTransportTypeRecord(row.record)) {
    return {
      ...base,
      color: row.record.color,
    };
  }

  return {
    ...base,
    transportTypeId:
      row.record.transport_type_id,
    latitude: String(row.record.latitude),
    longitude: String(row.record.longitude),
    description: row.record.description ?? "",
    stopType:
      row.record.stop_type ?? "road_stop",
  };
}

