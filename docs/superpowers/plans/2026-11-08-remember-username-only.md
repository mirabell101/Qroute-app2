# Remember Me: Username Prefill Only Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remember only the last successfully authenticated username/email when Remember Me is checked, and prefill it on a later login.

**Architecture:** Keep the existing login page and Supabase flow. Add a small localStorage helper that accepts an injectable Storage-like object for tests; call it only after password login has established its session.

**Tech Stack:** React, TypeScript, Vitest, browser localStorage.

**Spec:** `docs/superpowers/specs/2026-11-08-remember-username-only-design.md`

## Global Constraints

- Use only the dedicated localStorage key `qroute_remembered_login_identifier`.
- Store only the plain username/email string; never store a password, token, session, user ID, or other credential.
- Never let a storage failure block authentication.
- Do not change Supabase session persistence, Google OAuth, logout, registration, recovery, authorization, RLS, RBAC, rate limits, CORS, or database schema.
- Do not read sensitive environment files or add dependencies.

## Review Focus

- **A malformed value is already in localStorage:** do not prefill an empty, whitespace-only, overlong, or surrounding-whitespace value; cover this in the read-helper test.
- **Browser storage throws on read, write, or remove:** keep the login flow usable and avoid throwing; cover each operation in helper tests.
- **Login API rejects the credentials:** keep the previous remembered identifier; verify the storage update is after all failure exits.
- **Supabase rejects session establishment:** do not save or clear the remembered identifier; verify the storage update is after the `setSession` error exit.
- **The user signs in with Google or logs out:** retain the existing remembered identifier; verify neither flow is changed and the logout cleanup targets only the legacy key.

---

### Task 1: Add Safe Username-Only Persistence to Login

**Files:**
- Create: `src/lib/rememberedLoginIdentifier.ts`
- Test: `src/lib/rememberedLoginIdentifier.test.ts`
- Modify: `src/pages/visitor/login/login.tsx`
- Modify: this plan with actual test/build/lint results after implementation

**Interfaces:**
- Produces `readRememberedLoginIdentifier(storage?: RememberedIdentifierStorage): string | null`.
- Produces `updateRememberedLoginIdentifier(identifier: string, rememberMe: boolean, storage?: RememberedIdentifierStorage): boolean`.
- `RememberedIdentifierStorage` is the `getItem`, `setItem`, and `removeItem` subset of `Storage`; omitted storage resolves to `window.localStorage` inside a guarded access.
- The login page initializes identifier and checkbox state from one read. It calls the update function only after password login and `supabase.auth.setSession` succeed.

- [x] **Step 1: Write helper tests first**

  Cover reading a valid string; treating missing, empty, whitespace-only, overlong, or untrimmed values as absent; saving exactly the submitted identifier under the one dedicated key when checked; removing the old key when unchecked; and returning safe results without throwing when `getItem`, `setItem`, or `removeItem` throws. Assert stored data contains only the identifier string.

- [x] **Step 2: Run the focused test and observe the expected failure**

  Run: `npm test -- src/lib/rememberedLoginIdentifier.test.ts`
  Result: FAIL as expected because `./rememberedLoginIdentifier` did not exist.

- [x] **Step 3: Implement the minimal safe helper**

  Use the key `qroute_remembered_login_identifier`. Catch storage access errors, return `null` for reads and `false` for failed updates, and use only generic diagnostics that never include stored values.

- [x] **Step 4: Run focused tests and observe them pass**

  Run: `npm test -- src/lib/rememberedLoginIdentifier.test.ts`
  Result: PASS, 1 test file and 11 tests.

- [x] **Step 5: Wire the existing login form**

  Initialize the identifier and Remember Me checkbox from one helper read. Keep password initialized to `""`. After the existing successful `setSession` path, persist the normalized submitted identifier if checked or remove the remembered key if unchecked. A failed storage update may emit a generic warning without the identifier and must not interrupt navigation. Do not change the API request, OAuth handler, or logout.

- [x] **Step 6: Run all verification**

  Run: `npm test`
  Result: PASS, 10 test files and 77 tests (66 tests passed at baseline).

  Run: `npm run build`
  Result: PASS; TypeScript and Vite production build completed. Vite emitted its existing large-chunk advisory.

  Run: `npm run lint`
  Result: repository-wide lint reports 10 errors in unrelated existing files (`server/routes/auth/resendResetOTP.ts`, `server/routes/auth/resetPassword.ts`, `server/routes/auth/verifyResetOTP.ts`, `src/components/ui/button.tsx`, `src/pages/registered-user/contribution/contribution.tsx`, and `src/pages/visitor/signup/signup.tsx`). Targeted ESLint on all three changed TypeScript files passes.

  Result: `git diff --check` passes. The storage update follows successful session establishment; the password state remains initialized to `""`; Google OAuth, logout, and existing authentication requests are unchanged. Only the dedicated username key is touched by the helper. No dependencies or auth/database configuration were changed.

  Independent final review: no Critical, Important, or Minor findings; reviewer assessment was ready to merge.

## Implementation lesson

Keep persistence strictly after successful `setSession`, not merely after a
successful API response: this preserves the previous remembered value for
invalid credentials and session-establishment failures. Keep logout cleanup
separate from the dedicated identifier key so logout retains the prefill.
