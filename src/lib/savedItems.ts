import { supabase } from "@/lib/supabase";

export type SavedKind = "route" | "stop" | "terminal";

export interface SavedBookmarkIds {
  routeIds: number[];
  stopIds: number[];
  terminalIds: number[];
}

function getBookmarkIdsKey(kind: SavedKind): keyof SavedBookmarkIds {
  if (kind === "route") return "routeIds";
  if (kind === "stop") return "stopIds";
  return "terminalIds";
}

export function hasSavedBookmark(
  bookmarkIds: SavedBookmarkIds,
  kind: SavedKind,
  targetId: number
): boolean {
  return bookmarkIds[getBookmarkIdsKey(kind)].includes(targetId);
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
      : currentIds.filter((id) => id !== targetId),
  };
}

const emptyBookmarkIds = (): SavedBookmarkIds => ({
  routeIds: [],
  stopIds: [],
  terminalIds: [],
});

const bookmarkPageSize = 500;

async function loadBookmarkIds<T>(
  fetchPage: (
    start: number,
    end: number
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  getId: (row: T) => number
): Promise<number[]> {
  const ids: number[] = [];

  for (let start = 0; ; start += bookmarkPageSize) {
    const { data, error } = await fetchPage(
      start,
      start + bookmarkPageSize - 1
    );

    if (error) throw new Error(error.message);

    const page = data ?? [];
    ids.push(...page.map(getId));
    if (page.length < bookmarkPageSize) return ids;
  }
}

export async function getSavedBookmarkIds(
  userId: string | null
): Promise<SavedBookmarkIds> {
  if (!userId) return emptyBookmarkIds();

  const [routeIds, stopIds, terminalIds] = await Promise.all([
    loadBookmarkIds(
      (start, end) =>
        supabase
          .from("saved_routes")
          .select("route_id")
          .eq("user_id", userId)
          .order("route_id", { ascending: true })
          .range(start, end),
      (row) => row.route_id
    ),
    loadBookmarkIds(
      (start, end) =>
        supabase
          .from("saved_stops")
          .select("stop_id")
          .eq("user_id", userId)
          .order("stop_id", { ascending: true })
          .range(start, end),
      (row) => row.stop_id
    ),
    loadBookmarkIds(
      (start, end) =>
        supabase
          .from("saved_terminals")
          .select("terminal_id")
          .eq("user_id", userId)
          .order("terminal_id", { ascending: true })
          .range(start, end),
      (row) => row.terminal_id
    ),
  ]);

  return { routeIds, stopIds, terminalIds };
}

export async function addSavedBookmark(
  userId: string,
  kind: SavedKind,
  targetId: number
): Promise<void> {
  const table = kind === "route"
    ? "saved_routes"
    : kind === "stop"
      ? "saved_stops"
      : "saved_terminals";
  const idColumn = kind === "route"
    ? "route_id"
    : kind === "stop"
      ? "stop_id"
      : "terminal_id";

  const { error } = await supabase
    .from(table)
    .insert({ user_id: userId, [idColumn]: targetId });
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function removeSavedBookmark(
  userId: string,
  kind: SavedKind,
  targetId: number
): Promise<void> {
  const table = kind === "route"
    ? "saved_routes"
    : kind === "stop"
      ? "saved_stops"
      : "saved_terminals";
  const idColumn = kind === "route"
    ? "route_id"
    : kind === "stop"
      ? "stop_id"
      : "terminal_id";

  const { error } = await supabase
    .from(table)
    .delete()
    .eq("user_id", userId)
    .eq(idColumn, targetId);
  if (error) throw new Error(error.message);
}
