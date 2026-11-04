import type { SupabaseClient } from "@supabase/supabase-js";

export type RecentSearchItemType = "route" | "stop" | "terminal";
const MAX_RECENT_SEARCHES = 25;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface RecentSearchInput {
  item_type: RecentSearchItemType;
  item_id: number;
  last_searched_at: string;
}

export interface RecentSearchRow extends RecentSearchInput {
  id: string;
  user_id: string;
  created_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isItemType(value: unknown): value is RecentSearchItemType {
  return value === "route" || value === "stop" || value === "terminal";
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function toRecentSearchRow(value: unknown): RecentSearchRow | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.user_id !== "string" ||
    !isItemType(value.item_type) ||
    typeof value.item_id !== "number" ||
    !Number.isSafeInteger(value.item_id) ||
    value.item_id < 1 ||
    !isValidTimestamp(value.last_searched_at) ||
    !isValidTimestamp(value.created_at)
  ) {
    return null;
  }

  return {
    id: value.id,
    user_id: value.user_id,
    item_type: value.item_type,
    item_id: value.item_id,
    last_searched_at: value.last_searched_at,
    created_at: value.created_at,
  };
}

export function parseRecentSearchEntries(
  value: unknown,
  now: number,
): RecentSearchInput[] {
  if (!Array.isArray(value) || !Number.isFinite(now)) return [];

  const cutoff = now - RETENTION_MS;
  const latestByItem = new Map<
    string,
    { entry: RecentSearchInput; searchedAt: number }
  >();

  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    if (
      !isItemType(candidate.item_type) ||
      typeof candidate.item_id !== "number" ||
      !Number.isSafeInteger(candidate.item_id) ||
      candidate.item_id < 1 ||
      !isValidTimestamp(candidate.last_searched_at)
    ) {
      continue;
    }

    const searchedAt = Date.parse(candidate.last_searched_at);
    if (searchedAt < cutoff || searchedAt > now) continue;

    const entry: RecentSearchInput = {
      item_type: candidate.item_type,
      item_id: candidate.item_id,
      last_searched_at: candidate.last_searched_at,
    };
    const key = `${entry.item_type}:${entry.item_id}`;
    const previous = latestByItem.get(key);
    if (!previous || searchedAt > previous.searchedAt) {
      latestByItem.set(key, { entry, searchedAt });
    }
  }

  return [...latestByItem.values()]
    .sort((left, right) => right.searchedAt - left.searchedAt)
    .slice(0, MAX_RECENT_SEARCHES)
    .map(({ entry }) => entry);
}

export async function mergeRecentSearches(
  client: SupabaseClient,
  entries: RecentSearchInput[],
): Promise<RecentSearchRow[]> {
  const { data, error } = await client.rpc("merge_recent_searches", {
    p_entries: entries,
  });
  if (error) throw error;
  if (!Array.isArray(data)) {
    throw new Error("Recent searches merge returned an invalid response.");
  }

  const rows: RecentSearchRow[] = [];
  for (const value of data) {
    const row = toRecentSearchRow(value);
    if (!row) {
      throw new Error("Recent searches merge returned an invalid row.");
    }
    rows.push(row);
  }

  return rows;
}
