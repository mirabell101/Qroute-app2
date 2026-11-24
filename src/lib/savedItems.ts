import { supabase } from "@/lib/supabase";

// ============================================================
// TYPES
// ============================================================

export type SavedKind = "route" | "stop" | "terminal";

export interface SavedBookmarkIds {
  /**
   * Contains whole-route bookmarks only.
   * Journey bookmarks are represented by SavedRouteBookmark.
   */
  routeIds: number[];
  stopIds: number[];
  terminalIds: number[];
}

export interface SavedJourneyEndpoint {
  kind: "stop" | "terminal";
  id: number;
}

export interface SavedWholeRouteBookmark {
  bookmarkType: "whole_route";
  id: number;
  routeId: number;
  origin: null;
  destination: null;
  createdAt: string;
}

export interface SavedJourneyBookmark {
  bookmarkType: "journey";
  id: number;
  routeId: number;
  journeyName: string;
  origin: SavedJourneyEndpoint;
  destination: SavedJourneyEndpoint;
  createdAt: string;
}

export type SavedRouteBookmark =
  | SavedWholeRouteBookmark
  | SavedJourneyBookmark;

export interface SavedBookmarkData {
  bookmarkIds: SavedBookmarkIds;
  routeBookmarks: SavedRouteBookmark[];
}

// ============================================================
// DATABASE ROW TYPES
// ============================================================

interface SavedRouteBookmarkRow {
  id: number;
  route_id: number;

  journey_name: string | null;

  origin_stop_id: number | null;
  origin_terminal_id: number | null;

  destination_stop_id: number | null;
  destination_terminal_id: number | null;

  created_at: string;
}

interface SavedStopBookmarkRow {
  stop_id: number;
}

interface SavedTerminalBookmarkRow {
  terminal_id: number;
}

interface SavedRouteInsert {
  user_id: string;
  route_id: number;

  journey_name: string | null;

  origin_stop_id: number | null;
  origin_terminal_id: number | null;

  destination_stop_id: number | null;
  destination_terminal_id: number | null;
}

// ============================================================
// CONSTANTS
// ============================================================

const BOOKMARK_PAGE_SIZE = 500;

export const SAVED_JOURNEY_NAME_MAX_LENGTH = 80;

// ============================================================
// VALIDATION HELPERS
// ============================================================

function assertPositiveId(
  value: number,
  label: string
): void {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${label} must be a positive integer.`
    );
  }
}

function assertUserId(userId: string): void {
  if (!userId || !userId.trim()) {
    throw new Error(
      "An authenticated user is required."
    );
  }
}

/**
 * Trims and validates a passenger-defined journey name.
 *
 * The maximum length is measured using Unicode code points,
 * matching PostgreSQL's character-count behavior more closely
 * than JavaScript's ordinary string length.
 */
export function normalizeSavedJourneyName(
  value: string
): string {
  if (typeof value !== "string") {
    throw new Error(
      "Journey name must be a valid text value."
    );
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new Error(
      "Please provide a name for this journey."
    );
  }

  const characterCount = Array.from(normalized).length;

  if (
    characterCount >
    SAVED_JOURNEY_NAME_MAX_LENGTH
  ) {
    throw new Error(
      `Journey name cannot exceed ${SAVED_JOURNEY_NAME_MAX_LENGTH} characters.`
    );
  }

  return normalized;
}

function validateEndpoint(
  endpoint: SavedJourneyEndpoint,
  label: string
): void {
  if (
    !endpoint ||
    (
      endpoint.kind !== "stop" &&
      endpoint.kind !== "terminal"
    )
  ) {
    throw new Error(
      `${label} must be a valid stop or terminal.`
    );
  }

  assertPositiveId(
    endpoint.id,
    `${label} ID`
  );
}

function endpointsAreEqual(
  first: SavedJourneyEndpoint,
  second: SavedJourneyEndpoint
): boolean {
  return (
    first.kind === second.kind &&
    first.id === second.id
  );
}

// ============================================================
// BOOKMARK ID HELPERS
// ============================================================

function getBookmarkIdsKey(
  kind: SavedKind
): keyof SavedBookmarkIds {
  if (kind === "route") {
    return "routeIds";
  }

  if (kind === "stop") {
    return "stopIds";
  }

  return "terminalIds";
}

export function hasSavedBookmark(
  bookmarkIds: SavedBookmarkIds,
  kind: SavedKind,
  targetId: number
): boolean {
  return bookmarkIds[
    getBookmarkIdsKey(kind)
  ].includes(targetId);
}

export function updateSavedBookmarkIds(
  bookmarkIds: SavedBookmarkIds,
  kind: SavedKind,
  targetId: number,
  isSaved: boolean
): SavedBookmarkIds {
  const key = getBookmarkIdsKey(kind);
  const currentIds = bookmarkIds[key];

  return {
    ...bookmarkIds,

    [key]: isSaved
      ? currentIds.includes(targetId)
        ? currentIds
        : [...currentIds, targetId]
      : currentIds.filter(
          (id) => id !== targetId
        ),
  };
}

function emptyBookmarkIds(): SavedBookmarkIds {
  return {
    routeIds: [],
    stopIds: [],
    terminalIds: [],
  };
}

// ============================================================
// PAGINATED DATABASE LOADING
// ============================================================

async function loadRows<T>(
  fetchPage: (
    start: number,
    end: number
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>
): Promise<T[]> {
  const rows: T[] = [];

  for (
    let start = 0;
    ;
    start += BOOKMARK_PAGE_SIZE
  ) {
    const { data, error } = await fetchPage(
      start,
      start + BOOKMARK_PAGE_SIZE - 1
    );

    if (error) {
      throw new Error(error.message);
    }

    const page = data ?? [];

    rows.push(...page);

    if (page.length < BOOKMARK_PAGE_SIZE) {
      return rows;
    }
  }
}

// ============================================================
// DATABASE ROW MAPPING
// ============================================================

function mapSavedRouteBookmark(
  row: SavedRouteBookmarkRow
): SavedRouteBookmark {
  assertPositiveId(
    row.id,
    "Bookmark ID"
  );

  assertPositiveId(
    row.route_id,
    "Route ID"
  );

  const originStopExists =
    row.origin_stop_id !== null;

  const originTerminalExists =
    row.origin_terminal_id !== null;

  const destinationStopExists =
    row.destination_stop_id !== null;

  const destinationTerminalExists =
    row.destination_terminal_id !== null;

  // ----------------------------------------------------------
  // WHOLE-ROUTE BOOKMARK
  //
  // All four journey endpoint columns must be NULL.
  // Its journey_name must also be NULL.
  // ----------------------------------------------------------

  const hasAnyEndpoint =
    originStopExists ||
    originTerminalExists ||
    destinationStopExists ||
    destinationTerminalExists;

  if (!hasAnyEndpoint) {
    if (row.journey_name !== null) {
      throw new Error(
        `Whole-route bookmark ${row.id} unexpectedly contains a journey name.`
      );
    }

    return {
      bookmarkType: "whole_route",
      id: row.id,
      routeId: row.route_id,
      origin: null,
      destination: null,
      createdAt: row.created_at,
    };
  }

  // ----------------------------------------------------------
  // JOURNEY BOOKMARK
  //
  // Exactly one origin, one destination, and one valid name.
  // ----------------------------------------------------------

  const originCount =
    Number(originStopExists) +
    Number(originTerminalExists);

  const destinationCount =
    Number(destinationStopExists) +
    Number(destinationTerminalExists);

  if (
    originCount !== 1 ||
    destinationCount !== 1
  ) {
    throw new Error(
      `Saved route bookmark ${row.id} has an invalid endpoint configuration.`
    );
  }

  if (row.journey_name === null) {
    throw new Error(
      `Journey bookmark ${row.id} is missing its journey name.`
    );
  }

  const journeyName =
    normalizeSavedJourneyName(row.journey_name);

  const origin: SavedJourneyEndpoint =
    originStopExists
      ? {
          kind: "stop",
          id: row.origin_stop_id!,
        }
      : {
          kind: "terminal",
          id: row.origin_terminal_id!,
        };

  const destination: SavedJourneyEndpoint =
    destinationStopExists
      ? {
          kind: "stop",
          id: row.destination_stop_id!,
        }
      : {
          kind: "terminal",
          id: row.destination_terminal_id!,
        };

  validateEndpoint(
    origin,
    "Origin"
  );

  validateEndpoint(
    destination,
    "Destination"
  );

  if (endpointsAreEqual(origin, destination)) {
    throw new Error(
      `Journey bookmark ${row.id} has identical origin and destination endpoints.`
    );
  }

  return {
    bookmarkType: "journey",
    id: row.id,
    routeId: row.route_id,
    journeyName,
    origin,
    destination,
    createdAt: row.created_at,
  };
}

// ============================================================
// LOAD SAVED ROUTE BOOKMARK RECORDS
// ============================================================

async function loadSavedRouteRows(
  userId: string
): Promise<SavedRouteBookmarkRow[]> {
  return loadRows<SavedRouteBookmarkRow>(
    (start, end) =>
      supabase
        .from("saved_routes")
        .select(`
          id,
          route_id,
          journey_name,
          origin_stop_id,
          origin_terminal_id,
          destination_stop_id,
          destination_terminal_id,
          created_at
        `)
        .eq("user_id", userId)
        .order("id", {
          ascending: true,
        })
        .range(start, end)
  );
}

export async function getSavedRouteBookmarks(
  userId: string | null
): Promise<SavedRouteBookmark[]> {
  if (!userId) {
    return [];
  }

  const rows = await loadSavedRouteRows(userId);

  return rows.map(mapSavedRouteBookmark);
}

// ============================================================
// LOAD ALL SAVED BOOKMARK DATA
// ============================================================

export async function getSavedBookmarks(
  userId: string | null
): Promise<SavedBookmarkData> {
  if (!userId) {
    return {
      bookmarkIds: emptyBookmarkIds(),
      routeBookmarks: [],
    };
  }

  const [
    routeRows,
    stopRows,
    terminalRows,
  ] = await Promise.all([
    loadSavedRouteRows(userId),

    loadRows<SavedStopBookmarkRow>(
      (start, end) =>
        supabase
          .from("saved_stops")
          .select("stop_id")
          .eq("user_id", userId)
          .order("stop_id", {
            ascending: true,
          })
          .range(start, end)
    ),

    loadRows<SavedTerminalBookmarkRow>(
      (start, end) =>
        supabase
          .from("saved_terminals")
          .select("terminal_id")
          .eq("user_id", userId)
          .order("terminal_id", {
            ascending: true,
          })
          .range(start, end)
    ),
  ]);

  const routeBookmarks =
    routeRows.map(mapSavedRouteBookmark);

  // Only whole-route bookmarks belong in routeIds.
  // Journey bookmarks remain separate saved records.

  const routeIds = routeBookmarks
    .filter(
      (
        bookmark
      ): bookmark is SavedWholeRouteBookmark =>
        bookmark.bookmarkType === "whole_route"
    )
    .map(
      (bookmark) => bookmark.routeId
    )
    .sort(
      (a, b) => a - b
    );

  return {
    bookmarkIds: {
      routeIds,

      stopIds: stopRows.map(
        (row) => row.stop_id
      ),

      terminalIds: terminalRows.map(
        (row) => row.terminal_id
      ),
    },

    routeBookmarks,
  };
}

// ============================================================
// BACKWARD-COMPATIBLE ID LOADING
// ============================================================

export async function getSavedBookmarkIds(
  userId: string | null
): Promise<SavedBookmarkIds> {
  const data = await getSavedBookmarks(userId);

  return data.bookmarkIds;
}

// ============================================================
// FIND EXISTING ROUTE BOOKMARK
// ============================================================

async function findExistingRouteBookmark(
  userId: string,
  routeId: number,
  origin: SavedJourneyEndpoint | null,
  destination: SavedJourneyEndpoint | null
): Promise<number | null> {
  const bookmarks =
    await getSavedRouteBookmarks(userId);

  const existing = bookmarks.find((bookmark) => {
    if (bookmark.routeId !== routeId) {
      return false;
    }

    // Whole-route bookmark lookup.
    if (
      origin === null &&
      destination === null
    ) {
      return bookmark.bookmarkType === "whole_route";
    }

    // Journey bookmark lookup.
    if (bookmark.bookmarkType !== "journey") {
      return false;
    }

    return (
      origin !== null &&
      destination !== null &&
      endpointsAreEqual(
        bookmark.origin,
        origin
      ) &&
      endpointsAreEqual(
        bookmark.destination,
        destination
      )
    );
  });

  return existing?.id ?? null;
}

// ============================================================
// SHARED ROUTE BOOKMARK INSERTION
// ============================================================

async function insertSavedRouteRecord(
  userId: string,
  record: SavedRouteInsert,
  origin: SavedJourneyEndpoint | null,
  destination: SavedJourneyEndpoint | null
): Promise<number> {
  const { data, error } = await supabase
    .from("saved_routes")
    .insert(record)
    .select("id")
    .single();

  if (error) {
    // --------------------------------------------------------
    // DUPLICATE BOOKMARK HANDLING
    //
    // Return the existing bookmark ID rather than creating
    // another record for the same user, route, and endpoints.
    //
    // An existing journey's name is not silently overwritten.
    // --------------------------------------------------------

    if (error.code === "23505") {
      const existingId =
        await findExistingRouteBookmark(
          userId,
          record.route_id,
          origin,
          destination
        );

      if (existingId !== null) {
        return existingId;
      }
    }

    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(
      "The saved route bookmark was not returned by the database."
    );
  }

  return data.id;
}

// ============================================================
// ADD WHOLE-ROUTE BOOKMARK
// ============================================================

export async function addSavedRouteBookmark(
  userId: string,
  routeId: number
): Promise<number> {
  assertUserId(userId);
  assertPositiveId(
    routeId,
    "Route ID"
  );

  return insertSavedRouteRecord(
    userId,
    {
      user_id: userId,
      route_id: routeId,

      journey_name: null,

      origin_stop_id: null,
      origin_terminal_id: null,

      destination_stop_id: null,
      destination_terminal_id: null,
    },
    null,
    null
  );
}

// ============================================================
// ADD JOURNEY BOOKMARK
// ============================================================

export async function addSavedJourneyBookmark(
  userId: string,
  routeId: number,
  origin: SavedJourneyEndpoint,
  destination: SavedJourneyEndpoint,
  journeyName: string
): Promise<number> {
  assertUserId(userId);

  assertPositiveId(
    routeId,
    "Route ID"
  );

  validateEndpoint(
    origin,
    "Origin"
  );

  validateEndpoint(
    destination,
    "Destination"
  );

  if (endpointsAreEqual(origin, destination)) {
    throw new Error(
      "Origin and destination cannot be the same location."
    );
  }

  const normalizedJourneyName =
    normalizeSavedJourneyName(journeyName);

  const record: SavedRouteInsert = {
    user_id: userId,
    route_id: routeId,

    journey_name: normalizedJourneyName,

    origin_stop_id:
      origin.kind === "stop"
        ? origin.id
        : null,

    origin_terminal_id:
      origin.kind === "terminal"
        ? origin.id
        : null,

    destination_stop_id:
      destination.kind === "stop"
        ? destination.id
        : null,

    destination_terminal_id:
      destination.kind === "terminal"
        ? destination.id
        : null,
  };

  return insertSavedRouteRecord(
    userId,
    record,
    origin,
    destination
  );
}

// ============================================================
// DELETE EXACT ROUTE BOOKMARK BY BOOKMARK ID
// ============================================================

export async function removeSavedRouteBookmark(
  userId: string,
  bookmarkId: number
): Promise<boolean> {
  assertUserId(userId);

  assertPositiveId(
    bookmarkId,
    "Bookmark ID"
  );

  // The RPC derives ownership from auth.uid().
  // The supplied userId is not trusted by the database.

  const { data, error } = await supabase.rpc(
    "delete_saved_route_bookmark",
    {
      p_bookmark_id: bookmarkId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return data === true;
}

// ============================================================
// ADD EXISTING BOOKMARK TYPES
// ============================================================

export async function addSavedBookmark(
  userId: string,
  kind: SavedKind,
  targetId: number
): Promise<void> {
  assertUserId(userId);

  assertPositiveId(
    targetId,
    "Bookmark target ID"
  );

  // Route bookmarks are whole-route bookmarks.
  // Journeys use addSavedJourneyBookmark() instead.

  if (kind === "route") {
    await addSavedRouteBookmark(
      userId,
      targetId
    );

    return;
  }

  const table =
    kind === "stop"
      ? "saved_stops"
      : "saved_terminals";

  const idColumn =
    kind === "stop"
      ? "stop_id"
      : "terminal_id";

  const { error } = await supabase
    .from(table)
    .insert({
      user_id: userId,
      [idColumn]: targetId,
    });

  if (
    error &&
    error.code !== "23505"
  ) {
    throw new Error(error.message);
  }
}

// ============================================================
// REMOVE EXISTING BOOKMARK TYPES
// ============================================================

export async function removeSavedBookmark(
  userId: string,
  kind: SavedKind,
  targetId: number
): Promise<void> {
  assertUserId(userId);

  assertPositiveId(
    targetId,
    "Bookmark target ID"
  );

  // ----------------------------------------------------------
  // ROUTE
  //
  // Delete only the whole-route bookmark associated with this
  // route. Never delete every journey bookmark for the route.
  // ----------------------------------------------------------

  if (kind === "route") {
    const bookmarks =
      await getSavedRouteBookmarks(userId);

    const wholeRouteBookmark = bookmarks.find(
      (bookmark) =>
        bookmark.bookmarkType === "whole_route" &&
        bookmark.routeId === targetId
    );

    if (!wholeRouteBookmark) {
      return;
    }

    await removeSavedRouteBookmark(
      userId,
      wholeRouteBookmark.id
    );

    return;
  }

  // ----------------------------------------------------------
  // STOPS AND TERMINALS
  //
  // Existing independent bookmark behavior is preserved.
  // ----------------------------------------------------------

  const table =
    kind === "stop"
      ? "saved_stops"
      : "saved_terminals";

  const idColumn =
    kind === "stop"
      ? "stop_id"
      : "terminal_id";

  const { error } = await supabase
    .from(table)
    .delete()
    .eq("user_id", userId)
    .eq(idColumn, targetId);

  if (error) {
    throw new Error(error.message);
  }
}