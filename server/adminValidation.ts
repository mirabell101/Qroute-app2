export type AdminRoutePointKind = "terminal" | "stop";

export interface AdminRouteStopInput {
  kind: AdminRoutePointKind;
  id: number;
}

export interface AdminRouteCreateInput {
  name: string;
  transportTypeId: number;
  variantId: number;
  stops: AdminRouteStopInput[];
}

export interface AdminRouteUpdateInput {
  name?: string;
  transportTypeId?: number;
  variantId?: number;
  moderationStatus?: "pending" | "approved" | "rejected";
  moderationNote?: string | null;
  isActive?: boolean;
  stops?: AdminRouteStopInput[];
}

type ParseResult<T> = { data: T; error: null } | { data: null; error: string };

const routeNameMaxLength = 180;
const moderationNoteMaxLength = 500;
const routeStopsMinimum = 2;
const routeStopsMaximum = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePositiveInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1
    ? value
    : null;
}

function parseRouteName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= routeNameMaxLength ? name : null;
}

function parseRouteStops(value: unknown): AdminRouteStopInput[] | null {
  if (
    !Array.isArray(value) ||
    value.length < routeStopsMinimum ||
    value.length > routeStopsMaximum
  ) {
    return null;
  }

  const stops: AdminRouteStopInput[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const kind = entry.kind;
    const id = parsePositiveInteger(entry.id);
    if ((kind !== "terminal" && kind !== "stop") || id === null) {
      return null;
    }
    stops.push({ kind, id });
  }
  return stops;
}

export function parseAdminRouteCreateInput(
  value: unknown,
): ParseResult<AdminRouteCreateInput> {
  if (!isRecord(value)) {
    return { data: null, error: "Route details are required." };
  }

  const name = parseRouteName(value.name);
  const transportTypeId = parsePositiveInteger(value.transportTypeId);
  const variantId = parsePositiveInteger(value.variantId);
  const stops = parseRouteStops(value.stops);

  if (!name) {
    return {
      data: null,
      error: `Route name must be between 1 and ${routeNameMaxLength} characters.`,
    };
  }
  if (transportTypeId === null) {
    return { data: null, error: "Choose a valid transport type." };
  }
  if (variantId === null) {
    return { data: null, error: "Choose a valid transport variant." };
  }
  if (!stops) {
    return {
      data: null,
      error: `A route needs between ${routeStopsMinimum} and ${routeStopsMaximum} ordered stops.`,
    };
  }

  return {
    data: { name, transportTypeId, variantId, stops },
    error: null,
  };
}

export function parseAdminRouteUpdateInput(
  value: unknown,
): ParseResult<AdminRouteUpdateInput> {
  if (!isRecord(value)) {
    return { data: null, error: "Route changes are required." };
  }

  const input: AdminRouteUpdateInput = {};
  let hasChange = false;

  if (value.name !== undefined) {
    const name = parseRouteName(value.name);
    if (!name) {
      return {
        data: null,
        error: `Route name must be between 1 and ${routeNameMaxLength} characters.`,
      };
    }
    input.name = name;
    hasChange = true;
  }

  if (value.transportTypeId !== undefined) {
    const transportTypeId = parsePositiveInteger(value.transportTypeId);
    if (transportTypeId === null) {
      return { data: null, error: "Choose a valid transport type." };
    }
    input.transportTypeId = transportTypeId;
    hasChange = true;
  }

  if (value.variantId !== undefined) {
    const variantId = parsePositiveInteger(value.variantId);
    if (variantId === null) {
      return { data: null, error: "Choose a valid transport variant." };
    }
    input.variantId = variantId;
    hasChange = true;
  }

  if (value.moderationStatus !== undefined) {
    if (
      value.moderationStatus !== "pending" &&
      value.moderationStatus !== "approved" &&
      value.moderationStatus !== "rejected"
    ) {
      return { data: null, error: "Choose a valid moderation status." };
    }
    input.moderationStatus = value.moderationStatus;
    hasChange = true;
  }

  if (value.moderationNote !== undefined) {
    if (value.moderationNote === null) {
      input.moderationNote = null;
    } else {
      if (typeof value.moderationNote !== "string") {
        return { data: null, error: "Moderation note must be text." };
      }
      const note = value.moderationNote.trim();
      if (note.length > moderationNoteMaxLength) {
        return {
          data: null,
          error: `Moderation note must be ${moderationNoteMaxLength} characters or fewer.`,
        };
      }
      input.moderationNote = note || null;
    }
    hasChange = true;
  }

  if (value.isActive !== undefined) {
    if (typeof value.isActive !== "boolean") {
      return { data: null, error: "Active status must be a boolean." };
    }
    input.isActive = value.isActive;
    hasChange = true;
  }

  if (value.stops !== undefined) {
    const stops = parseRouteStops(value.stops);
    if (!stops) {
      return {
        data: null,
        error: `A route needs between ${routeStopsMinimum} and ${routeStopsMaximum} ordered stops.`,
      };
    }
    input.stops = stops;
    hasChange = true;
  }

  if (!hasChange) {
    return { data: null, error: "Provide at least one route change." };
  }

  return { data: input, error: null };
}
