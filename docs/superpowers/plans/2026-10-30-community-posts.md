# Community Posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immediately published public Community posts with registered-user voting and comments, secured by `requireAuth`, role authorization, and Supabase RLS.

**Architecture:** Extend the existing `/community` page and use a focused Express API. Reuse `requireAuth`, add only registered-role authorization, and pass the validated user's token into Supabase so database RLS remains active. Add dedicated post, vote, comment tables and a small Leaflet point-pair map component based on the Contributions map patterns.

**Tech Stack:** React, TypeScript, Express 5, Supabase JS, PostgreSQL RLS, React Leaflet.

**Spec:** Approved Community Posts architecture in the conversation on 2026-10-30.

## Global Constraints

- Do not read, modify, or expose `.env`, `.env.local`, or credentials.
- Community posts and comments publish immediately; do not add an approval workflow.
- Preserve Contributions approval and submission behavior.
- Keep anonymous post and comment reads public; restrict participation to `registered_user`.
- Do not add dependencies or expose privileged Supabase keys to the browser.
- Keep all work within the existing Community page and API architecture.

## Review Focus

- Anonymous requests must read visible posts/comments but cannot write; test role middleware and RLS policies.
- A registered user can have only one vote per post and switch/remove it; test vote type validation and unique constraint.
- Hidden/missing posts cannot receive comments or votes; test foreign keys and API handling.
- Invalid or out-of-range coordinates and blank/oversized content are rejected; test validators.
- Switching selected posts updates both markers and connector; verify map component state/props and frontend build.

---

### Task 1: Community schema and RLS

**Files:** Create a timestamped migration under `supabase/migrations/`.

**Interfaces:** Tables: `community_posts`, `community_post_votes`, `community_post_comments`; identity references use `auth.users.id`, transport references use `public.transport_types.id`.

- [x] Add UUID primary keys, foreign keys, non-empty/length/coordinate/vote checks, chronology indexes, and unique `(post_id, user_id)` vote constraint.
- [x] Enable RLS and add public read policies for posts/comments; add registered-user insert policies bound to `auth.uid()` and `user_roles.role = 'registered_user'`.
- [x] Limit vote row reads to the owning user/admin; expose only vote value/post id to anonymous readers for count calculation.
- [x] Omit approval status; Community content is public immediately after insert.
- [x] Verify the live tables, RLS policies, grants, triggers, and constraints with read-only SQL.

### Task 2: API authorization and routes

**Files:** Modify `server/index.ts` and `server/supabaseClient.ts`; create `server/middleware/requireRegisteredUser.ts` and `server/routes/communityRoutes.ts`.

**Interfaces:** Routes mounted at `/api/community`; public `GET /posts`, `GET /posts/:id`; authenticated `POST /posts`, `POST /posts/:id/vote`, `DELETE /posts/:id/vote`, `POST /posts/:id/comments`.

- [x] Add request-scoped Supabase client construction using the already validated Bearer token.
- [x] Implement registered-role middleware after existing `requireAuth`; do not repeat token validation.
- [x] Implement input validation, public feed/detail reads, safe author fields, vote counts/current user's vote, and comment reads.
- [x] Implement post, vote update/insert/removal, and comment writes through the request-scoped client so RLS applies.
- [x] Test input validators; inspect the deployed RLS policies and privileges for anonymous reads and restricted writes.

### Task 3: Frontend API and point-pair map

**Files:** Create `src/lib/community.ts` and `src/components/map/CommunityPostMap.tsx`.

**Interfaces:** Typed Community post/comment/vote responses and API functions; map props accept optional start/end points and selection callbacks.

- [x] Add API helpers using the existing API base URL and current Supabase access token.
- [x] Add a Leaflet map using existing tile, marker, and fit-bounds conventions from Contributions; represent posts only with a straight connector.
- [x] Run focused validator tests with the existing Vitest dependency.

### Task 4: Extend existing Community page

**Files:** Modify `src/pages/registered-user/community/community.tsx`.

- [x] Replace local-storage feed, voting, and comments with API-backed state; preserve the existing `/community` page and public access.
- [x] Add title/content and start/end point selection with map click/search; preserve optional transport selection.
- [x] Add post selection, point-pair map, counts, comments, loading/empty/error states, and login prompts for anonymous participation.
- [x] Keep all new submissions immediately visible; do not change Contribution submission/approval logic.

### Task 5: Verification

- [x] Run focused Vitest tests, TypeScript checking, and ESLint for changed files without reading environment files.
- [x] Verify deployed table structure, RLS policies, write grants, author-name triggers, and migration history without exposing credentials.
- [x] Review the changed files; no Contribution page/service files were changed for this feature.
