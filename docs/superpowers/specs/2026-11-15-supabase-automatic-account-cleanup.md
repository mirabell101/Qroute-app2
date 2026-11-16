# Supabase Automatic Cleanup System
## Implementation Summary and Technical Documentation

**Project:** Supabase account cleanup  
**Implementation date:** November 14–15, 2026  
**Current status:** Deployed, tested, and scheduled  
**Cleanup interval:** Every 6 hours  
**Current mode:** Live (`DRY_RUN = false`)

---

## 1. Purpose of the cleanup system

The purpose is to automatically remove old, unverified email/password-only Auth accounts that have never verified their email address.

The cleanup system is deliberately restrictive. It must not delete:
- Verified email accounts.
- Google OAuth accounts.
- Other OAuth provider accounts.
- SSO accounts.
- Accounts younger than 24 hours.

The system also protects community data and shared application resources when an eligible Auth account is deleted.

## 2. Approved account eligibility policy

An account must satisfy ALL of these conditions:

| Requirement | Required condition |
|---|---|
| Email verification | `email_confirmed_at IS NULL` |
| Account age | Older than 24 hours |
| SSO | `is_sso_user = false` |
| App metadata provider | `email` |
| App metadata providers | Exactly `["email"]` |
| Email identity | At least one email identity |
| Other identities | No non-email identities |

The Edge Function performs preliminary checks, then uses the authoritative database eligibility RPC before deletion.

**Important:** Account age is calculated using `created_at`, not `updated_at`.

Because the cleanup runs every six hours, an account normally becomes eligible for deletion between 24 and 30 hours after creation.

## 3. Data-retention policies

We established the following protections before enabling automatic deletion.

| Data | Cleanup behavior |
|---|---|
| Community posts | Preserve |
| Community comments | Preserve |
| Historical author UUIDs | Preserve |
| Approved shared routes | Preserve |
| Approved shared stops | Preserve |
| Approved shared terminals | Preserve |
| Approved shared map images | Preserve |
| Pending moderation submissions | Remove from active moderation queue through underlying record cleanup |
| Pending routes | Soft-delete / deactivate |
| Pending stops | Soft-delete / deactivate |
| Pending terminals | Soft-delete / deactivate |
| Pending map images | Soft-delete |
| User moderation history | Preserve |
| `banned_by` references | Set to NULL if the moderator account is deleted |

We removed three foreign-key constraints that would otherwise interfere with preserving historical community and moderation records:

- `community_posts_author_id_fkey`
- `community_post_comments_author_id_fkey`
- `user_moderation_user_id_fkey`

We also discovered that `moderation_queue` is a UNION ALL view, not a directly updatable table. Instead of attempting to delete from the view, the trigger modifies the underlying pending records so they disappear from the queue naturally.

## 4. Database trigger

**Trigger name:**

`trg_cleanup_unverified_email_user`

**Trigger function:**

`public.cleanup_unverified_email_user_before_delete()`

**Trigger type:**

`BEFORE DELETE ON auth.users`

**Security configuration:**
- `SECURITY DEFINER = true`
- Empty `search_path`
- Uses explicitly qualified database objects.

### What the trigger does

Before an Auth user is deleted, the trigger checks whether the account has a valid one-time deletion authorization.

If an authorization exists:
1. It checks the authorization expiration.
2. It rechecks the account's eligibility.
3. It blocks deletion if the authorization is expired or eligibility no longer holds.
4. It consumes the authorization.
5. It proceeds with the approved cleanup operations.

For an eligible account, it quarantines pending unapproved application resources by marking them inactive or deleted.

### Important distinction: Policy A

The trigger uses Policy A for ordinary account deletion.

If there is no cleanup authorization, the trigger still allows ordinary Auth deletion to proceed, but skips the cleanup-specific operations for ineligible accounts.

This means the trigger is not a global account-deletion blocker. It protects the cleanup process without preventing normal account deletion elsewhere.

## 5. One-time deletion authorization system

We created a private schema:

`private`

Inside it, we created:

`private.cleanup_deletion_authorizations`

The table stores:
- `user_id`
- `authorization_id`
- `created_at`
- `expires_at`

Each authorization:
- Is associated with one specific Auth user.
- Has a unique authorization identifier.
- Expires after two minutes.
- Can only be consumed once.

The table has Row Level Security enabled, with direct access revoked from PUBLIC, anon, authenticated, and service_role.

The Edge Function does not directly access this private table.

Instead, it uses a restricted database function.

**Authorization RPC:**

`public.cleanup_unverified_email_user_authorize_deletion(uuid)`

Only `service_role` can execute it.

This prevents the cleanup function from attempting deletion without first obtaining a valid authorization.

## 6. Database RPC functions

We created three important RPC functions.

### A. Eligibility verification

`public.cleanup_unverified_email_user_is_eligible(uuid, integer)`

Purpose:
- Checks whether an account is still eligible.
- Reads Auth user and identity information.
- Applies the approved 24-hour eligibility policy.
- Returns a boolean.

Only `service_role` can execute it.

### B. Deletion authorization

`public.cleanup_unverified_email_user_authorize_deletion(uuid)`

Purpose:
- Rechecks eligibility.
- Creates a short-lived authorization.
- Returns the authorization UUID.

Only `service_role` can execute it.

### C. Deletion verification

`public.cleanup_unverified_email_user_exists(uuid)`

Purpose:
- Checks whether the Auth account still exists after deletion.
- Returns `true` if the account exists and `false` if it does not.

Only `service_role` can execute it.

The Edge Function uses this last RPC to avoid counting an account as deleted merely because it attempted a deletion.

## 7. Supabase Edge Function

**Function name:**

`cleanup-unverified-users`

**Endpoint:**

`https://qkipjkahjmzukkcakvpy.supabase.co/functions/v1/cleanup-unverified-users`

**Configuration:**

`supabase/config.toml`:

`[functions.cleanup-unverified-users]`

`verify_jwt = false`

The function uses `withSupabase({ auth: ["secret"] })` and authenticates requests using the Supabase Secret API key in the `apikey` header.

### Edge Function execution process

The function performs the following operations:

1. Lists Auth users and paginates through the results.
2. Checks account age.
3. Filters out verified accounts.
4. Filters out OAuth and SSO accounts.
5. Checks provider metadata.
6. Checks identity providers.
7. Calls the authoritative database eligibility RPC.
8. In live mode, performs another individual Auth check.
9. Rechecks database eligibility.
10. Requests a one-time deletion authorization.
11. Deletes the Auth account.
12. Verifies the account is actually absent from `auth.users`.
13. Reports the final deletion and failure counts.

The function also reports diagnostic counters such as:
- `totalScanned`
- `eligibleCount`
- `authorizationFailedCount`
- `deletionAttemptCount`
- `deletedCount`
- `verificationFailedCount`
- `failedCount`

### Dry-run and live modes

The function uses:

`DRY_RUN = true` for testing.

`DRY_RUN = false` for actual deletion.

We successfully tested the dry-run process before switching to live mode for the controlled deletion test.

The currently deployed function is confirmed to be in live mode.

## 8. Supabase Vault configuration

We installed and verified the Supabase Vault extension.

We also confirmed:
- `pg_cron` version 1.6.4
- `pg_net` version 0.20.4
- `supabase_vault` version 0.3.1

Two secrets were stored in Vault:

| Vault secret name | Purpose |
|---|---|
| `project_url` | Full Edge Function endpoint |
| `secret_key` | Supabase Secret API key |

The URL was initially stored as only the project base URL. We corrected it using `vault.update_secret()`.

The final endpoint was verified successfully.

Access checks confirmed:
- anon cannot read secrets.
- authenticated cannot read secrets.
- service_role can read secrets.
- postgres can read secrets.

The actual API key is never stored directly in the Cron command.

## 9. pg_net HTTP integration

We use `net.http_post()` to invoke the Edge Function.

The request retrieves:
- The endpoint from `vault.decrypted_secrets`.
- The API key from `vault.decrypted_secrets`.

It sends:
- `Content-Type: application/json`
- `apikey: <Vault secret>`
- An empty JSON request body.

`pg_net` sends requests asynchronously. This means receiving a request ID only confirms that the HTTP request was queued.

The actual HTTP response is recorded in:

`net._http_response`

We tested this integration successfully.

**Test result:**
- HTTP status: 200
- Mode: live
- Eligible accounts: 0
- Deletion attempts: 0
- Failed accounts: 0
- Verification failures: 0
- Timed out: false

This confirmed that Vault authentication, the Edge Function endpoint, and the HTTP request integration were working.

## 10. Supabase Cron configuration

We created one named Cron job.

**Job name:**

`cleanup-unverified-users-every-6-hours`

**Job ID:**

`1`

**Cron expression:**

`0 */6 * * *`

**Active:**

`true`

The schedule means the cleanup is invoked every six hours, at minute zero.

Assuming the Cron scheduler uses UTC, the corresponding Philippine times are:

| UTC | Philippines time |
|---|---|
| 00:00 | 08:00 |
| 06:00 | 14:00 |
| 12:00 | 20:00 |
| 18:00 | 02:00 next day |

### How the scheduled execution works

The flow is:

1. Supabase Cron reaches the scheduled time.
2. Cron executes the SQL command.
3. The command calls `net.http_post()`.
4. `pg_net` queues the HTTP request.
5. The request authenticates using the Vault API key.
6. The Edge Function starts its cleanup process.
7. The Edge Function checks eligibility and deletion authorization.
8. The trigger protects the database during Auth deletion.
9. The Edge Function verifies account absence.
10. The HTTP response is recorded for inspection.

Cron does not directly delete Auth users. It only invokes the Edge Function, which performs the controlled cleanup.

## 11. How to monitor the system

### A. Check Cron job status

```sql
SELECT
    jobid,
    jobname,
    schedule,
    active
FROM cron.job
WHERE jobid = 1;
```

Expected:
- Job ID 1
- Correct job name
- Schedule `0 */6 * * *`
- `active = true`

### B. Check Cron execution history

```sql
SELECT
    jobid,
    runid,
    status,
    return_message,
    start_time,
    end_time
FROM cron.job_run_details
WHERE jobid = 1
ORDER BY start_time DESC
LIMIT 10;
```

Look for `succeeded` or any execution errors.

### C. Check Edge Function HTTP responses

```sql
SELECT
    id,
    status_code,
    content::text AS response_body,
    timed_out,
    error_msg,
    created
FROM net._http_response
ORDER BY created DESC
LIMIT 10;
```

A successful HTTP response should show:
- HTTP status 200
- `status: ok`
- `mode: live`
- `failedCount: 0`
- `verificationFailedCount: 0`

Remember that a successful Cron execution means the HTTP request was queued successfully. The HTTP response is needed to confirm the Edge Function completed successfully.

## 12. Controlled live deletion test

We performed one controlled live deletion.

Before deletion, the account passed all approved eligibility checks.

The Edge Function returned:

- `mode: live`
- `eligibleCount: 1`
- `deletionAttemptCount: 1`
- `deletedCount: 1`
- `authorizationFailedCount: 0`
- `verificationFailedCount: 0`
- `failedCount: 0`

We then independently checked the database.

The result confirmed:
- The account no longer existed in `auth.users`.
- No leftover deletion authorization remained.

This verified the complete live deletion flow.

## 13. Current implementation status

| Component | Status |
|---|---|
| Eligibility policy | Completed |
| Database retention policies | Completed |
| Auth deletion trigger | Completed |
| One-time authorization system | Completed |
| Eligibility RPC | Completed |
| Authorization RPC | Completed |
| Deletion verification RPC | Completed |
| Edge Function | Deployed |
| Controlled live deletion | Successful |
| Vault secrets | Verified |
| pg_net HTTP test | Successful |
| Cron job | Active |

### Final operating rule

The system is now automatic.

Do not casually change:
- `DRY_RUN`
- The account eligibility conditions
- The trigger function
- The authorization expiration
- The retention policies
- The Cron schedule

Any changes to these components should be tested carefully before deployment.

**Current configuration:** Live cleanup of unverified email/password-only Auth accounts older than 24 hours, scheduled every six hours, with database-side authorization and post-deletion verification.