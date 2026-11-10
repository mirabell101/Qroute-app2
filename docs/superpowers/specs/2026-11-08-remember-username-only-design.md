# Remember Me: Username Prefill Only

## Intent

Let a returning user opt to prefill the login identifier, without remembering
their password or changing how authentication works.

## Goals and boundaries

- On the login page, prefill the previous username/email and check Remember Me
  when the stored value is non-empty.
- Persist the submitted, trimmed identifier only after password login and
  Supabase session establishment both succeed.
- On a successful unchecked password login, remove any previous remembered
  identifier. Failed attempts and Google OAuth do not change it.
- Keep the password field empty on every new login page.
- Leave logout behavior, Supabase session persistence, authentication APIs,
  authorization, RLS, RBAC, rate limits, CORS, and database schema unchanged.
- Never store passwords, tokens, sessions, user IDs, or other credentials.

## Storage and failure behavior

- Key: `qroute_remembered_login_identifier`.
- Store the username/email as a plain string, not an object or credential
  bundle.
- Use localStorage only. Do not remove this key on logout.
- Treat missing, empty, or inaccessible storage as no remembered value. A
  storage read/write/remove failure must not block authentication.
- Storage access stays behind a small helper so browser storage errors can be
  tested without coupling the login UI to storage implementation details.

## Approaches

- Inline localStorage access in the login component: fewest files, but makes
  storage failure and data-boundary tests harder to isolate.
- A small, tested storage helper, called by the existing login flow only after
  success: adds a focused helper/test while preserving the UI and auth
  architecture. **Chosen** because it makes the storage boundary and failure
  behavior directly testable.

## Implementation outline

1. Add the helper and tests for initial read, checked save, unchecked removal,
   and storage failures.
2. Initialize the existing identifier and checkbox state from the helper.
3. Update storage only after the existing password-login flow establishes a
   Supabase session; leave the password state initialized to an empty string.
4. Keep OAuth, logout, and all session/auth code unchanged.
5. Run focused tests, the full test suite, TypeScript production build, and
   lint; record actual results in the implementation task record.

## Verification status

Implemented as designed. The helper is `src/lib/rememberedLoginIdentifier.ts`;
it uses `qroute_remembered_login_identifier` and stores only a trimmed
username/email string. The login page saves or clears it only after
`supabase.auth.setSession` succeeds. The existing password state remains empty,
and logout intentionally does not remove this dedicated key.

## Verification results and lesson

- Focused helper tests: 11 passed.
- Full suite: 77 tests passed (66 passed at baseline).
- Production TypeScript/Vite build: passed; Vite reported a large-chunk advisory.
- ESLint on changed files: passed. Repository-wide lint remains blocked by 10
  pre-existing errors in unrelated server auth, button, contribution, and
  signup files.
- `git diff --check`: passed.
- Independent whole-change review: no findings.
- Keep remember storage changes after session establishment; an API response
  alone is insufficient to confirm the login completed in the frontend.
- No authentication/session, OAuth, logout, registration, recovery,
  authorization, RLS, RBAC, rate-limit, CORS, or database behavior was changed.
