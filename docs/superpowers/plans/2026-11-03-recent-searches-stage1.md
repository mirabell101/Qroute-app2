# Recent Searches Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the existing Recent Searches feature into compliance with the Stage 1 local-only requirements.

**Architecture:** Keep `recentSearches.ts` as the storage boundary, the existing `/recents` UI, and current map selection handlers. Replace identity-scoped keys with one shared browser key, enforce the retention/size rules, and report unavailable map selections without changing backend behavior.

**Tech Stack:** React, TypeScript, React Router, Vitest, browser `localStorage`.

**Spec:** `docs/superpowers/specs/2026-11-03-recent-searches-stage1-design.md`

## Global Constraints

- Use exactly one storage key: `qroute_recent_searches`.
- Store a maximum of 25 unique searches, retained for 30 days only.
- Record searches only after submission or result selection.
- Keep Stage 1 browser-only; do not make Supabase, Express, migration, RPC, or API changes.
- Preserve current map, Saved, Community, Contributions, authentication, and admin behavior.
- Stage 1 local history is browser-wide; authenticated-account cache isolation starts only with separately approved Stage 2.
- Future sync must use verified identity through the existing Express authentication architecture and preserve anonymous data until successful transfer.

## Review Focus

- **Restricted storage access:** read, write, and removal failures must not break search/map use; test storage methods that throw.
- **Malformed/outdated data:** malformed JSON and invalid entry shapes must load safely and be pruned; test malformed JSON and mixed valid/invalid entries.
- **Retention boundaries:** future timestamps expire, exactly 30-day-old entries remain, and older entries are removed on load/update; test all three cases.
- **Identity collisions:** same IDs of different item kinds remain distinct, while repeated kind/ID selections update the timestamp; test both.
- **Deleted map results:** an unavailable ID must not select an unrelated item and must produce a user-facing message; test selection resolution and exercise the UI path where feasible.

---

### Task 1: Enforce local history storage contract

**Files:**
- Modify: `src/lib/recentSearches.ts`
- Test: `src/lib/recentSearches.test.ts`

**Interfaces:**
- Keep the `RecentSearchKind`, `RecentSearch`, `getRecentSearchItem`, and selection-source concepts.
- Remove user identity from storage API semantics; all history reads and mutations use the one browser key.
- Continue exposing read, record, remove, and clear operations to the page and map hook.

- [x] **Step 1: Write failing tests** for the exact key, shared browser list, a 25-entry limit, valid deduplication by kind + ID, 30-day expiry and exact-boundary retention, malformed data, and unavailable storage operations.
- [x] **Step 2: Run** `npm test -- src/lib/recentSearches.test.ts`; confirm the new assertions fail on the current per-user keys and 100-entry cap.
- [x] **Step 3: Implement** the one-key storage boundary, validated normalization, 25-entry cap, and safe storage error handling. Preserve the existing `{ kind, targetId, name, searchedAt }` entry shape.
- [x] **Step 4: Run** `npm test -- src/lib/recentSearches.test.ts`; confirm all storage behavior passes.

### Task 2: Keep selection behavior and page consistent

**Files:**
- Modify: `src/components/transit-map/useTransitMap.ts`
- Modify: `src/pages/registered-user/Home/Home.tsx`
- Modify: `src/pages/visitor/Landing/Landing.tsx`
- Modify: `src/pages/registered-user/recent-searches/recent-searches.tsx`
- Test: `src/pages/registered-user/recent-searches/recent-searches.test.ts`

**Interfaces:**
- The map hook records through the storage module only from its existing search result selection handler; restore selections do not refresh history.
- The page continues navigating to `/home` or `/` with `{ savedSelection: { kind, targetId } }`.
- Existing map route/point resolution remains responsible for reopening map details and route geometry.

- [x] **Step 1: Write failing tests** for the exact required caption, guest/authenticated page access, and existing type, time, removal, clear, and empty-state rendering.
- [x] **Step 2: Run** `npm test -- src/pages/registered-user/recent-searches/recent-searches.test.ts`; confirm the caption assertion fails.
- [x] **Step 3: Update** callers to use shared local history, add the exact caption, and show a clear unavailable-item message when existing map resolution returns no result.
- [x] **Step 4: Run** focused recent-search and route-map tests; verify route, stop, and terminal IDs still resolve through existing map selection logic.

### Task 3: Verify complete Stage 1 behavior and scope

**Files:**
- Review all files changed by Tasks 1-2.

- [x] **Step 1: Run** `npm test` and record discovery failures; the 8 existing helper files with no Vitest suites remain out of scope. Run `npm test -- src server` to verify all application and server tests.
- [x] **Step 2: Run** `npm run lint` and record the 14 existing errors in untouched files; run ESLint directly on changed TypeScript files and confirm it passes.
- [x] **Step 3: Run** `npm run build`; require TypeScript and Vite production build success.
- [x] **Step 4: Review** the final diff to confirm the exact storage key/cap/caption and that no `server/`, `supabase/`, migration, auth, or unrelated feature files changed.

## Deferred Stage 2 and Stage 3

The following are design constraints only; they are not implementation tasks in this plan:

- Stage 2 will merge local and account history by kind + ID, retain the newest duplicate timestamp, apply the 30-day/25-entry limits, use verified authenticated identity, preserve local history until sync succeeds, isolate account caches, and enforce strict user RLS (including administrators).
- Stage 3 will add local-first throttled writes, bulk fetch/sync, deduplication, bounded cleanup, offline retry, and connectivity-triggered sync without unnecessary Realtime or infrastructure.
- No stage 2 or stage 3 backend, database, auth, synchronization, or caching behavior is authorized here.
