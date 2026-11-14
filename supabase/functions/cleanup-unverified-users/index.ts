
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

// SAFETY SETTINGS
const DRY_RUN = true;

// Only accounts older than this threshold are eligible.
const ACCOUNT_AGE_HOURS = 24;

// Number of Auth users fetched per page.
const PAGE_SIZE = 100;

type EligibleUser = {
  id: string;
  email: string | null;
  created_at: string;
};

type CleanupFailure = {
  id: string;
  email: string | null;
};

function isEmailPasswordOnlyUser(user: {
  identities?: Array<{ provider?: string }> | null;
  app_metadata?: {
    provider?: string;
    providers?: unknown;
  };
  is_sso_user?: boolean;
}): boolean {
  // Never delete SSO accounts.
  if (user.is_sso_user === true) {
    return false;
  }

  const identities = user.identities;

  // Fail closed if identity information is missing.
  if (!Array.isArray(identities) || identities.length === 0) {
    return false;
  }

  const identityProviders = identities
    .map((identity) => identity.provider?.toLowerCase())
    .filter((provider): provider is string => Boolean(provider));

  // Every identity must be email/password.
  if (
    identityProviders.length !== identities.length ||
    !identityProviders.includes("email") ||
    identityProviders.some((provider) => provider !== "email")
  ) {
    return false;
  }

  const appMetadata = user.app_metadata ?? {};

  // Protect accounts whose primary provider is not email.
  if (
    appMetadata.provider &&
    appMetadata.provider.toLowerCase() !== "email"
  ) {
    return false;
  }

  // Protect accounts with any additional provider listed in metadata.
  if (appMetadata.providers !== undefined) {
    if (!Array.isArray(appMetadata.providers)) {
      return false;
    }

    const metadataProviders = appMetadata.providers.map(
      (provider) =>
        typeof provider === "string" ? provider.toLowerCase() : "",
    );

    if (
      metadataProviders.length === 0 ||
      metadataProviders.some((provider) => provider !== "email")
    ) {
      return false;
    }
  }

  return true;
}

export default {
  fetch: withSupabase(
    { auth: ["secret"] },
    async (_req, ctx) => {
      try {
        const cutoff =
          Date.now() - ACCOUNT_AGE_HOURS * 60 * 60 * 1000;

        const eligibleUsers: EligibleUser[] = [];

        // --------------------------------------------------
        // STEP 1: FETCH ALL AUTH USERS
        // --------------------------------------------------

        let page = 1;

        while (true) {
          const { data, error } =
            await ctx.supabaseAdmin.auth.admin.listUsers({
              page,
              perPage: PAGE_SIZE,
            });

          if (error) {
            throw error;
          }

          for (const user of data.users) {
            const createdAt = Date.parse(user.created_at);

            const isOldEnough =
              Number.isFinite(createdAt) && createdAt < cutoff;

            const isUnverified = !user.email_confirmed_at;

            const isEligibleProvider =
              isEmailPasswordOnlyUser(user);

            if (
              isOldEnough &&
              isUnverified &&
              isEligibleProvider
            ) {
              eligibleUsers.push({
                id: user.id,
                email: user.email ?? null,
                created_at: user.created_at,
              });
            }
          }

          if (data.users.length < PAGE_SIZE) {
            break;
          }

          page++;
        }

        // --------------------------------------------------
        // STEP 2: DRY RUN
        // --------------------------------------------------

        if (DRY_RUN) {
          return Response.json({
            status: "ok",
            mode: "dry-run",
            accountAgeHours: ACCOUNT_AGE_HOURS,
            pageSize: PAGE_SIZE,
            eligibleCount: eligibleUsers.length,
            eligibleUsers,
            deletedCount: 0,
            failedCount: 0,
            message:
              "Dry run completed. No Auth accounts were deleted.",
          });
        }

        // --------------------------------------------------
        // STEP 3: DELETE ELIGIBLE USERS
        // --------------------------------------------------

        const failures: CleanupFailure[] = [];
        let deletedCount = 0;

        // All candidates are collected before deletion.
        // This avoids skipping users when pagination changes
        // as accounts are removed.
        for (const user of eligibleUsers) {
          const { error } =
            await ctx.supabaseAdmin.auth.admin.deleteUser(
              user.id,
            );

          if (error) {
            console.error(
              `Failed to delete account ${user.id}:`,
              error,
            );

            failures.push({
              id: user.id,
              email: user.email,
            });

            continue;
          }

          deletedCount++;
        }

        // --------------------------------------------------
        // STEP 4: RETURN EXECUTION SUMMARY
        // --------------------------------------------------

        const failedCount = failures.length;

        return Response.json(
          {
            status:
              failedCount === 0
                ? "ok"
                : "partial_failure",
            mode: "delete",
            accountAgeHours: ACCOUNT_AGE_HOURS,
            eligibleCount: eligibleUsers.length,
            deletedCount,
            failedCount,
            failures,
          },
          {
            status: failedCount === 0 ? 200 : 500,
          },
        );
      } catch (error) {
        console.error("Unverified account cleanup failed:", error);

        return Response.json(
          {
            status: "error",
            message:
              "Could not complete the account cleanup.",
          },
          { status: 500 },
        );
      }
    },
  ),
};
