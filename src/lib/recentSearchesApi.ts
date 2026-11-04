import type { RecentSearch, RecentSearchKind } from "./recentSearches";
import { API_BASE_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export interface RecentSearchApiEntry {
  kind: RecentSearchKind;
  targetId: number;
  searchedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapRecentSearchApiEntry(value: unknown): RecentSearchApiEntry {
  if (!isRecord(value)) {
    throw new Error("Recent Searches service returned an invalid item.");
  }
  const { item_type: kind, item_id: targetId, last_searched_at: timestamp } =
    value;
  const searchedAt =
    typeof timestamp === "string" ? Date.parse(timestamp) : Number.NaN;
  if (
    (kind !== "route" && kind !== "stop" && kind !== "terminal") ||
    typeof targetId !== "number" ||
    !Number.isSafeInteger(targetId) ||
    targetId < 1 ||
    !Number.isFinite(searchedAt)
  ) {
    throw new Error("Recent Searches service returned an invalid item.");
  }
  return { kind, targetId, searchedAt };
}

async function requestRecentSearches(
  path: string,
  expectedUserId: string,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const session = data.session;
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error("Please sign in to continue.");
  if (session.user.id !== expectedUserId) {
    throw new Error("The active account changed. Please try again.");
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (options.body) headers.set("Content-Type", "application/json");

  const response = await fetch(
    `${API_BASE_URL}/api/recent-searches${path}`,
    { ...options, headers },
  );
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw new Error(`Recent Searches request failed (HTTP ${response.status}).`);
    }
    throw new Error("Recent Searches service returned an invalid response.");
  }

  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : `Recent Searches request failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  if (!isRecord(payload) || payload.success !== true) {
    throw new Error("Recent Searches service returned an invalid response.");
  }
  return payload;
}

function mapResponseItems(payload: Record<string, unknown>): RecentSearchApiEntry[] {
  if (!Array.isArray(payload.items)) {
    throw new Error("Recent Searches service returned an invalid response.");
  }
  return payload.items.map(mapRecentSearchApiEntry);
}

export async function getRecentSearchesForAccount(
  expectedUserId: string,
): Promise<RecentSearchApiEntry[]> {
  return mapResponseItems(await requestRecentSearches("", expectedUserId));
}

export async function mergeRecentSearchesForAccount(
  entries: readonly RecentSearch[],
  expectedUserId: string,
): Promise<RecentSearchApiEntry[]> {
  const payloadEntries = entries.map((entry) => ({
    item_type: entry.kind,
    item_id: entry.targetId,
    last_searched_at: new Date(entry.searchedAt).toISOString(),
  }));
  return mapResponseItems(
    await requestRecentSearches("/merge", expectedUserId, {
      method: "POST",
      body: JSON.stringify({ entries: payloadEntries }),
    }),
  );
}

export async function removeRecentSearchForAccount(
  kind: RecentSearchKind,
  targetId: number,
  expectedUserId: string,
): Promise<void> {
  await requestRecentSearches(
    `/${encodeURIComponent(kind)}/${encodeURIComponent(String(targetId))}`,
    expectedUserId,
    { method: "DELETE" },
  );
}

export async function clearRecentSearchesForAccount(
  expectedUserId: string,
): Promise<void> {
  await requestRecentSearches("", expectedUserId, { method: "DELETE" });
}
