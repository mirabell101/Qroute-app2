import type { AdminRouteRecord, AdminRouteStop, AdminTransitPointRecord, AdminTransportTypeRecord } from "../types";
import { isNullableBoolean, isNullableRecord, isNullableString, isPositiveInteger, isRecord } from "./common";

function isRoutePoint(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.id) ||
    typeof value.name !== "string" ||
    typeof value.latitude !== "number" ||
    !Number.isFinite(value.latitude) ||
    typeof value.longitude !== "number" ||
    !Number.isFinite(value.longitude) ||
    !isNullableBoolean(value.is_approved)
  ) {
    return false;
  }

  if (
    value.moderation_status !== undefined &&
    !["pending", "approved", "rejected"].includes(String(value.moderation_status))
  ) {
    return false;
  }

  return true;
}

function isAdminRouteStop(value: unknown): value is AdminRouteStop {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.id) ||
    !isPositiveInteger(value.route_id) ||
    !isPositiveInteger(value.stop_order) ||
    !(value.terminal_id === null || isPositiveInteger(value.terminal_id)) ||
    !(value.stop_id === null || isPositiveInteger(value.stop_id))
  ) {
    return false;
  }

  const hasTerminal = value.terminal_id !== null;
  const hasStop = value.stop_id !== null;
  if (hasTerminal === hasStop) return false;

  const isStopRecord = (record: Record<string, unknown>) =>
    isRoutePoint(record) &&
    isNullableString(record.description) &&
    (record.stop_type === null || record.stop_type === "road_stop" || record.stop_type === "train_station");

  if (!isNullableRecord(value.terminals, isRoutePoint) || !isNullableRecord(value.stops, isStopRecord)) {
    return false;
  }

  if (
    hasTerminal &&
    (!isRecord(value.terminals) || value.terminals.id !== value.terminal_id || value.stops !== null)
  ) {
    return false;
  }

  if (hasStop && (!isRecord(value.stops) || value.stops.id !== value.stop_id || value.terminals !== null)) {
    return false;
  }

  return true;
}

export function isAdminRouteRecord(value: unknown): value is AdminRouteRecord {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.id) ||
    typeof value.name !== "string" ||
    !isPositiveInteger(value.transport_type_id) ||
    typeof value.is_active !== "boolean" ||
    typeof value.is_approved !== "boolean" ||
    typeof value.is_banned !== "boolean" ||
    typeof value.is_deleted !== "boolean" ||
    !["pending", "approved", "rejected"].includes(String(value.moderation_status)) ||
    !(value.moderation_note === undefined || isNullableString(value.moderation_note)) ||
    !Array.isArray(value.route_stops) ||
    !value.route_stops.every(isAdminRouteStop)
  ) {
    return false;
  }

  const isTransportType = (record: Record<string, unknown>) =>
    typeof record.name === "string" && typeof record.color === "string";

  const isTransportVariant = (record: Record<string, unknown>) =>
    isPositiveInteger(record.id) &&
    typeof record.code === "string" &&
    typeof record.name === "string" &&
    (record.fare_model === "distance" || record.fare_model === "matrix");

  return (
    isNullableRecord(value.transport_types, isTransportType) &&
    isNullableRecord(value.transport_variants, isTransportVariant)
  );
}

export function isAdminTransitPointRecord(value: unknown): value is AdminTransitPointRecord {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.id) ||
    typeof value.name !== "string" ||
    !(value.description === undefined || isNullableString(value.description)) ||
    !(
      value.stop_type === undefined ||
      value.stop_type === null ||
      value.stop_type === "road_stop" ||
      value.stop_type === "train_station"
    ) ||
    typeof value.latitude !== "number" ||
    !Number.isFinite(value.latitude) ||
    typeof value.longitude !== "number" ||
    !Number.isFinite(value.longitude) ||
    !(value.transport_type_id === null || isPositiveInteger(value.transport_type_id)) ||
    !isNullableBoolean(value.is_active) ||
    !isNullableBoolean(value.is_approved) ||
    !isNullableBoolean(value.is_banned) ||
    !isNullableBoolean(value.is_deleted) ||
    !["pending", "approved", "rejected"].includes(String(value.moderation_status)) ||
    !isNullableString(value.moderation_note)
  ) {
    return false;
  }

  return isNullableRecord(
    value.transport_types,
    (record) => typeof record.name === "string" && typeof record.color === "string",
  );
}

export function isAdminTransportTypeRecord(value: unknown): value is AdminTransportTypeRecord {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    typeof value.name === "string" &&
    typeof value.color === "string"
  );
}

export function parseAdminRoutes(value: unknown): AdminRouteRecord[] {
  if (!Array.isArray(value) || !value.every(isAdminRouteRecord)) {
    throw new Error("Admin service returned an invalid response.");
  }
  return value as AdminRouteRecord[];
}
