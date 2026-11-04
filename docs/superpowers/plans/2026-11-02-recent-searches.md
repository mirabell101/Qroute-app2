# Recent Searches Implementation Plan

> Superseded for current Stage 1 requirements by [2026-11-03-recent-searches-stage1.md](./2026-11-03-recent-searches-stage1.md). This earlier plan specifies per-user keys and a 100-entry cap.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add private, persistent recent route/stop/terminal searches and a page that reopens them through the current map-selection flow.

**Architecture:** Add a typed localStorage helper scoped by authenticated user ID or anonymous visitor. Record selections inside the shared map result handler; add a public Recent Searches page and route, linking both visitor Landing and signed-in Home to it and returning entries through the existing kind/ID selection state.

**Tech Stack:** React, TypeScript, React Router, Vitest, browser `localStorage`.

**Spec:** `docs/superpowers/specs/2026-11-02-recent-searches-design.md`

## Global Constraints

- “No database table, migration, new dependency, global state library, or transfer of anonymous history to an account.”
- “Do not change search matching, map rendering, Saved behavior, auth permissions, or Community/Contributions flows.”
- “Store only the search item type, stable ID, display name, and selection timestamp.”
- Expire entries older than 30 days and cap history at 100.

## Review Focus

- Corrupt or outdated localStorage data must produce a safe empty/pruned history without crashing; test malformed JSON, unknown shapes, and invalid fields.
- A different account must not read another account's key; test account and anonymous key separation.
- Repeated kind/ID selection must update the timestamp and reorder without duplicates; test same item twice and same ID across different kinds.
- An item missing from current map data must not select an unrelated item; test resolution failure for unknown IDs.
- Query typing alone must not write history; verify in the browser alongside result selection.

---

### Task 1: Local recent-search storage

**Files:**
- Create: `src/lib/recentSearches.ts`
- Test: `src/lib/recentSearches.test.ts`

**Interfaces:**
- Produces `RecentSearchKind = "route" | "stop" | "terminal"` and `RecentSearch = { kind: RecentSearchKind; targetId: number; name: string; searchedAt: number }`.
- Produces `getRecentSearches(userId: string | null): RecentSearch[]`, `recordRecentSearch(userId: string | null, item: Pick<RecentSearch, "kind" | "targetId" | "name">): RecentSearch[]`, `removeRecentSearch(userId: string | null, kind: RecentSearchKind, targetId: number): RecentSearch[]`, and `clearRecentSearches(userId: string | null): void`.
- Produces `getRecentSearchItem(result: RouteMapSearchResult): Pick<RecentSearch, "kind" | "targetId" | "name">`, mapping route results to route IDs and point results to their stop/terminal IDs.

- [ ] **Step 1: Write failing tests** for identity-scoped keys, empty/corrupted data, valid entry checks, 30-day pruning on load/update, repeat-item timestamp/order updates, 100-item cap, individual removal, clear, and route/stop/terminal result-to-record mapping.
- [ ] **Step 2: Run** `npm test -- src/lib/recentSearches.test.ts`; confirm failures are caused by the missing helper.
- [ ] **Step 3: Implement** the typed helper using browser localStorage, with safe validation and pruning on every read/write.
- [ ] **Step 4: Run** `npm test -- src/lib/recentSearches.test.ts`; confirm all storage behavior passes.

### Task 2: Record selected map results and share selection-state parsing

**Files:**
- Modify: `src/components/transit-map/useTransitMap.ts`
- Modify: `src/lib/routeMap.ts`
- Modify: `src/lib/routeMap.test.ts`
- Modify: `src/pages/registered-user/Home/Home.tsx`
- Modify: `src/pages/visitor/Landing/Landing.tsx`

**Interfaces:**
- Consumes Task 1's `recordRecentSearch`.
- Produces `parseSavedMapSelection(state: unknown): { kind: SavedKind; targetId: number } | null` in `src/lib/routeMap.ts` for the existing `{ savedSelection: { kind, targetId } }` router state.

- [ ] **Step 1: Write failing tests** for parsing valid/invalid saved-selection state and resolving route, stop, and terminal IDs against current map data.
- [ ] **Step 2: Run** `npm test -- src/lib/routeMap.test.ts`; confirm the new parser tests fail.
- [ ] **Step 3: Implement** the parser; pass the current user ID (or `null` for anonymous) into the map hook in Home and Landing, and call Task 1's `getRecentSearchItem` plus `recordRecentSearch` only inside `handleSearchResultSelect`.
- [ ] **Step 4: Run** `npm test -- src/lib/routeMap.test.ts src/lib/recentSearches.test.ts`; confirm route/stop/terminal mapping and history tests pass.

### Task 3: Recent Searches page and navigation

**Files:**
- Create: `src/pages/registered-user/recent-searches/recent-searches.tsx`
- Test: `src/pages/registered-user/recent-searches/recent-searches.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/pages/registered-user/Home/Home.tsx`
- Modify: `src/pages/visitor/Landing/Landing.tsx`

**Interfaces:**
- Consumes Task 1's history read/remove/clear functions and Task 2's selection-state shape.
- The page receives `currentUserId: string | null`; clicking an entry navigates to `/home` when signed in or `/` when anonymous with `{ savedSelection: { kind, targetId } }`.

- [ ] **Step 1: Write failing server-render tests** for the empty state and a populated list showing names, type, timestamp, and action controls.
- [ ] **Step 2: Run** `npm test -- src/pages/registered-user/recent-searches/recent-searches.test.ts`; confirm the missing page behavior fails.
- [ ] **Step 3: Implement** the public `/recents` route and responsive page, with newest-first rows, item type, readable date/time, individual remove, confirmed Clear All, and an empty state. Connect visitor Landing and signed-in Home navigation and map-return state.
- [ ] **Step 4: Run** the page and library tests, then `npm test -- --config vitest.community.config.ts`, `npm run build`, and `npm run lint`.
- [ ] **Step 5: Exercise** browser behavior: typing does not record; mouse/keyboard selection records; refresh preserves it; repeat selection reorders; expired entries disappear; remove/confirmed clear work; selecting each item type reopens the corresponding map selection.
