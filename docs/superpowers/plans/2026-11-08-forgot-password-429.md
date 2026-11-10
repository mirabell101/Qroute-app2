# Forgot Password 429 Investigation and Fix

## Root cause

The browser sends one `POST /api/auth/forgot-password` request from the Forgot Password submit handler. No React effect or automatic retry calls the recovery endpoint. The Express route applies a per-IP limit of three requests per 15 minutes before it calls Supabase. Its default limiter response was an HTTP 429 without the API's normal JSON shape or a retry interval. The fourth request from that IP therefore failed before `resetPasswordForEmail` ran. The old submit guard used React state only, which did not reliably block same-tick double submissions and allowed retries after errors.

The current source path confirms that this app-generated 429 is the Express limiter: errors returned by Supabase were previously converted to HTTP 502 (or hidden behind a generic success in the committed baseline). No production Network response or Supabase Auth log was available, so this conclusion applies to requests served by this Express route; a different deployed endpoint would need its own response trace.

There are two distinct Supabase Auth 429 causes, neither interchangeable with the Express limit:

- `over_email_send_rate_limit`: Supabase's email-send quota/cooldown was reached.
- `over_request_rate_limit`: a Supabase Auth request quota was reached.

The handler now preserves these recognized upstream codes as safe 429 responses and logs only status/code. It does not expose provider messages, retry automatically, or relax Supabase limits. Supabase documents a 60-second default per-user password-recovery cooldown; the email quota is 2 messages/hour with the built-in mailer and has a 30 messages/hour default with Custom SMTP (configurable in Auth rate-limit settings). The project's actual Auth rate limits are dashboard configuration and were not inspected.

## Email and recovery flow

The existing signup and OTP resend routes use Supabase Auth (`signUp` and `resend`); repository source has no Nodemailer transport or separate Gmail sender. The password recovery route also calls Supabase Auth, so it uses the same Supabase Custom SMTP configuration that delivers OTP mail when that project setting is enabled. No second SMTP integration or privileged admin-link flow is needed for this route.

Recovery requests pass `redirectTo: <request origin>/resetpassword`. Supabase Auth creates and verifies the recovery link; the reset page checks the recovery callback/session with `getUser`, and the authenticated Express reset route still validates the bearer session before updating the password. The legacy reset-OTP resend action is user-initiated and already has a 30-second UI cooldown; it is not automatically called by the new Forgot Password link flow. Login, signup OTP, registration, and Google OAuth flows were not changed by this fix.

## Changes

- `server/routes/auth/forgotPassword.ts`: return a structured local 429 with `Retry-After` and the actual local cooldown; preserve Supabase's recognized rate-limit status/code while keeping the message generic.
- `src/pages/visitor/Forgotpassword/Forgotpassword.tsx`: use a synchronous in-flight guard, stop resubmission after a successful request, and display a bounded cooldown after 429.
- `server/routes/auth/passwordRecoveryRoutes.test.ts`: cover the two Supabase rate-limit codes and the fourth request reaching the local Express limit.

## Verification

- `npm test -- server/routes/auth/passwordRecoveryRoutes.test.ts`: 10 tests passed after the change. The two new rate-limit tests failed before the route/UI change for the expected reasons (upstream 429 was converted to 502; local limiter had no JSON code/cooldown response).
- Installed API checked against `@supabase/supabase-js` 2.118.0 and its Auth typings: `resetPasswordForEmail(email, { redirectTo })` is supported. Supabase's `auth.admin.generateLink()` generates a link without sending an email and requires a privileged server-side client; it is unnecessary for the existing Custom SMTP flow.
- Supabase docs reviewed: [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Password-based Auth](https://supabase.com/docs/guides/auth/passwords), [JavaScript `resetPasswordForEmail`](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), and [JavaScript `auth.admin.generateLink`](https://supabase.com/docs/reference/javascript/auth-admin-generatelink). `generateLink()` creates a link for a custom email sender; it is not used here because `resetPasswordForEmail()` already uses Supabase Auth's configured email provider. The changelog's October 12 TLS 1.2 CBC deprecation also covers Auth HTTP APIs, but does not change this API flow; supported TLS 1.2/1.3 clients are unaffected.
- `git diff --check`: no whitespace errors.
- The full test suite, TypeScript production build, and lint were not run because this environment did not provide an isolated execution workspace for those checks.
- Gmail delivery and the deployed Supabase recovery template/redirect allow-list were not exercised. These require manual verification in the Supabase Auth SMTP, email-template, rate-limit, and redirect-URL settings. In particular, verify Gmail delivery and that the recovery template links through Supabase's confirmation URL to the allow-listed `/resetpassword` path.

No environment files, SMTP credentials, database schema, RLS policies, or installed Superpowers skill files were read or changed.

## Follow-up: HTTP 400 origin rejection

The separate HTTP 400 report was caused before Supabase Auth was called. The Vite API proxy in `vite.config.ts` intentionally removes the `Origin` request header, while `server/routes/auth/forgotPassword.ts` required that header to construct the reset-page redirect and returned the same generic 400 response when it was absent. Therefore this failure had no Supabase Auth error code or SMTP error; it was not evidence that the registered address or SMTP provider was invalid.

`server/origins.ts` now shares the existing CORS allow-list with `server/index.ts`. The recovery route uses an explicitly supplied origin only when it is on that allow-list, uses the local Vite origin when the development proxy strips `Origin`, and uses the configured CORS origin as the production fallback. Production still fails closed if no trusted origin is available. Auth errors are logged with only a validated HTTP status and code; provider messages, email addresses, tokens, and links are not logged.

The flow continues to call `resetPasswordForEmail(email, { redirectTo })`. Repository source contains no Nodemailer transport: Supabase Auth sends the recovery message through the project's configured Custom SMTP provider, the same provider used for Auth OTP mail. `generateLink()` is not needed here: the installed SDK 2.118.0 and official docs describe it as generating a link/OTP for a custom email sender, not sending the email. Its `data.properties.action_link` is Supabase's verification link, accompanied by `verification_type`, `redirect_to`, and token/OTP properties; using it would add an unnecessary privileged backend path.

The reset page continues to let Supabase process the recovery link, verify the resulting session with `getUser`, and send the authenticated session's access token to the protected Express password-update route. Unknown email addresses retain Supabase's non-enumerating generic response.

### Follow-up verification

- Added regression coverage for a request without `Origin`, the development-proxy fallback, trusted production fallback, fail-closed production behavior, rejection of an untrusted origin, and safe logging of upstream Auth status/code.
- The new missing-origin test reproduced the original 400 before the fix; all 14 password-recovery route tests and the full 66-test suite passed after it.
- `npx tsc -b` passed. A production Vite build passed with a temporary empty environment directory so no repository environment files were loaded.
- `npm run lint` still reports 10 errors in existing unrelated code (`resendResetOTP.ts`, `resetPassword.ts`, `verifyResetOTP.ts`, `button.tsx`, `contribution.tsx`, and `signup.tsx`); none are in the new origin helper or forgot-password route.
- Live Gmail delivery, the deployed recovery template, and password reset with a real, expired, or reused Supabase link were not exercised. Before production use, confirm the frontend origin is configured in `CORS_ALLOWED_ORIGINS`, `/resetpassword` is allow-listed in Supabase Auth URL Configuration, and the recovery email template preserves `{{ .RedirectTo }}` or uses Supabase's confirmation URL. Do not treat the mocked route tests as proof of end-to-end email delivery.
