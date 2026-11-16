
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { withSupabase } from "jsr:@supabase/server@^1";

// ======================================================
// SAFETY SETTINGS
// ======================================================

// Keep TRUE during testing.
// No Auth accounts will be deleted.

const DRY_RUN = false;

// Only accounts older than this threshold are eligible.

const ACCOUNT_AGE_HOURS = 24;

// Auth API pagination.

const PAGE_SIZE = 100;

// Optional test account UUID for diagnostics.
// Leave empty to disable target-specific diagnostics.

const TARGET_USER_ID = "";

// ======================================================
// TYPES
// ======================================================

type AuthIdentity = {
  provider?: string;
};

type AuthUser = {
  id: string;
  created_at: string;
  email_confirmed_at?: string | null;
  identities?: AuthIdentity[] | null;
  is_sso_user?: boolean;
  app_metadata?: Record<string, unknown>;
};

type EligibleUser = {
  id: string;
  createdAt: string;
  accountAgeHours: number;
};

// ======================================================
// PROVIDER METADATA CHECK
// ======================================================

function hasEmailOnlyMetadata(user: AuthUser): boolean {
  const appMetadata = user.app_metadata ?? {};

  const primaryProvider = appMetadata.provider;
  const providers = appMetadata.providers;

  if (
    typeof primaryProvider !== "string" ||
    primaryProvider.toLowerCase() !== "email"
  ) {
    return false;
  }

  if (
    !Array.isArray(providers) ||
    providers.length !== 1 ||
    typeof providers[0] !== "string" ||
    providers[0].toLowerCase() !== "email"
  ) {
    return false;
  }

  return true;
}

// ======================================================
// INDIVIDUAL AUTH IDENTITY CHECK
// ======================================================

function hasEmailOnlyIdentity(user: AuthUser): boolean {
  const identities = user.identities;

  if (!Array.isArray(identities) || identities.length === 0) {
    return false;
  }

  return identities.every(
    (identity) =>
      typeof identity.provider === "string" &&
      identity.provider.toLowerCase() === "email"
  );
}

// ======================================================
// EDGE FUNCTION
// ======================================================

Deno.serve(
  withSupabase(
    { auth: ["secret"] },
    async (req, ctx) => {
      try {
        // ==================================================
        // STEP 0: HTTP METHOD CHECK
        // ==================================================

        if (req.method !== "POST") {
          return new Response(
            JSON.stringify({
              status: "error",
              message: "Only POST requests are allowed.",
            }),
            {
              headers: {
                "Content-Type": "application/json",
              },
              status: 405,
            }
          );
        }

        const cutoffTime =
          Date.now() -
          ACCOUNT_AGE_HOURS * 60 * 60 * 1000;

        let page = 1;

        let totalScanned = 0;
        let pagesFetched = 0;
        let oldEnoughCount = 0;
        let unverifiedCount = 0;
        let preliminaryCandidateCount = 0;
        let individualLookupPassedCount = 0;
        let databaseVerificationPassedCount = 0;
        let getUserByIdFailedCount = 0;
        let databaseVerificationFailedCount = 0;

        const eligibleUsers: EligibleUser[] = [];

        let targetDiagnostics:
          Record<string, unknown> | null = null;

        // ==================================================
        // STEP 1: RETRIEVE AUTH USERS
        // ==================================================

        while (true) {
          const { data, error } =
            await ctx.supabaseAdmin.auth.admin.listUsers({
              page,
              perPage: PAGE_SIZE,
            });

          if (error) {
            throw new Error(
              `Failed to retrieve Auth users: ${error.message}`
            );
          }

          pagesFetched++;

          const users = data.users as AuthUser[];

          if (users.length === 0) {
            break;
          }

          totalScanned += users.length;

          // ==================================================
          // STEP 2: PRELIMINARY CANDIDATE DISCOVERY
          // ==================================================

          for (const user of users) {
            const createdAt = new Date(user.created_at);

            const isOldEnough =
              createdAt.getTime() < cutoffTime;

            const isUnverified =
              user.email_confirmed_at == null;

            const metadataCheckPassed =
              hasEmailOnlyMetadata(user);

            if (isOldEnough) {
              oldEnoughCount++;
            }

            if (isUnverified) {
              unverifiedCount++;
            }

            const isPreliminaryCandidate =
              isOldEnough &&
              isUnverified &&
              metadataCheckPassed;

            if (
              TARGET_USER_ID &&
              user.id === TARGET_USER_ID
            ) {
              targetDiagnostics = {
                foundByListUsers: true,
                createdAt: user.created_at,
                isOldEnough,
                isUnverified,
                metadataCheckPassed,
                preliminaryCandidate:
                  isPreliminaryCandidate,
              };
            }

            if (!isPreliminaryCandidate) {
              continue;
            }

            preliminaryCandidateCount++;

            // ==================================================
            // STEP 3: VERIFY INDIVIDUAL AUTH USER
            // ==================================================

            const {
              data: individualData,
              error: individualError,
            } =
              await ctx.supabaseAdmin.auth.admin.getUserById(
                user.id
              );

            if (individualError || !individualData?.user) {
              getUserByIdFailedCount++;

              if (
                TARGET_USER_ID &&
                user.id === TARGET_USER_ID
              ) {
                targetDiagnostics = {
                  ...(targetDiagnostics ?? {}),
                  getUserByIdPassed: false,
                  getUserByIdError:
                    individualError?.message ??
                    "User was not returned.",
                };
              }

              continue;
            }

            const individualUser =
              individualData.user as AuthUser;

            const individualCreatedAt =
              new Date(individualUser.created_at);

            const individualIsOldEnough =
              individualCreatedAt.getTime() < cutoffTime;

            const individualIsUnverified =
              individualUser.email_confirmed_at == null;

            const identityCheckPassed =
              hasEmailOnlyIdentity(individualUser);

            const individualMetadataCheckPassed =
              hasEmailOnlyMetadata(individualUser);

            const individualCheckPassed =
              individualIsOldEnough &&
              individualIsUnverified &&
              identityCheckPassed &&
              individualMetadataCheckPassed;

            if (!individualCheckPassed) {
              if (
                TARGET_USER_ID &&
                user.id === TARGET_USER_ID
              ) {
                targetDiagnostics = {
                  ...(targetDiagnostics ?? {}),
                  getUserByIdPassed: true,
                  identityCheckPassed,
                  individualMetadataCheckPassed,
                  individualIsOldEnough,
                  individualIsUnverified,
                  individualCheckPassed,
                  identityProviders:
                    individualUser.identities?.map(
                      (identity) =>
                        identity.provider?.toLowerCase() ?? null
                    ) ?? null,
                };
              }

              continue;
            }

            individualLookupPassedCount++;

            // ==================================================
            // STEP 4: AUTHORITATIVE DATABASE VERIFICATION
            // ==================================================

            const {
              data: databaseEligible,
              error: rpcError,
            } = await ctx.supabaseAdmin.rpc(
              "cleanup_unverified_email_user_is_eligible",
              {
                p_user_id: user.id,
                p_account_age_hours: ACCOUNT_AGE_HOURS,
              }
            );

            if (rpcError) {
              databaseVerificationFailedCount++;

              console.error(
                "Database eligibility verification failed."
              );

              if (
                TARGET_USER_ID &&
                user.id === TARGET_USER_ID
              ) {
                targetDiagnostics = {
                  ...(targetDiagnostics ?? {}),
                  databaseVerificationPassed: false,
                  databaseVerificationError: rpcError.message,
                };
              }

              continue;
            }

            if (databaseEligible !== true) {
              if (
                TARGET_USER_ID &&
                user.id === TARGET_USER_ID
              ) {
                targetDiagnostics = {
                  ...(targetDiagnostics ?? {}),
                  databaseVerificationPassed: false,
                  databaseEligible: false,
                };
              }

              continue;
            }

            databaseVerificationPassedCount++;

            // ==================================================
            // STEP 5: FINAL ELIGIBILITY
            // ==================================================

            const accountAgeHours =
              (Date.now() - individualCreatedAt.getTime()) /
              (1000 * 60 * 60);

            eligibleUsers.push({
              id: individualUser.id,
              createdAt: individualUser.created_at,
              accountAgeHours:
                Number(accountAgeHours.toFixed(2)),
            });

            if (
              TARGET_USER_ID &&
              user.id === TARGET_USER_ID
            ) {
              targetDiagnostics = {
                ...(targetDiagnostics ?? {}),
                getUserByIdPassed: true,
                identityCheckPassed: true,
                individualMetadataCheckPassed: true,
                individualIsOldEnough: true,
                individualIsUnverified: true,
                individualCheckPassed: true,
                identityProviders: ["email"],
                databaseVerificationPassed: true,
                databaseEligible: true,
                finalEligibility: true,
              };
            }
          }

          // ==================================================
          // STEP 6: PAGINATION
          // ==================================================

          if (users.length < PAGE_SIZE) {
            break;
          }

          page++;
        }

        // ==================================================
        // STEP 7: DRY RUN RESPONSE
        // ==================================================

        if (DRY_RUN) {
          return new Response(
            JSON.stringify(
              {
                status: "ok",
                mode: "dry-run",
                accountAgeHours: ACCOUNT_AGE_HOURS,
                pageSize: PAGE_SIZE,

                diagnostics: {
                  totalScanned,
                  pagesFetched,
                  oldEnoughCount,
                  unverifiedCount,
                  preliminaryCandidateCount,
                  individualLookupPassedCount,
                  databaseVerificationPassedCount,
                  getUserByIdFailedCount,
                  databaseVerificationFailedCount,

                  targetAccount:
                    targetDiagnostics ?? {
                      foundByListUsers: false,
                    },
                },

                eligibleCount: eligibleUsers.length,
                eligibleUsers,

                deletedCount: 0,
                failedCount: 0,

                message:
                  "Dry run completed. No Auth accounts were deleted.",
              },
              null,
              2
            ),
            {
              headers: {
                "Content-Type": "application/json",
              },
              status: 200,
            }
          );
        }

        // ==================================================
        // STEP 8: AUTHORIZATION AND DELETION MODE
        // ==================================================

        let deletedCount = 0;
        let authorizationFailedCount = 0;
        let deletionAttemptCount = 0;
        let verificationFailedCount = 0;

        const failedUsers: Array<{
          id: string;
          error: string;
        }> = [];

        for (const user of eligibleUsers) {
          // ==================================================
          // STEP 8A: FINAL INDIVIDUAL AUTH CHECK
          // ==================================================

          const {
            data: latestData,
            error: latestError,
          } =
            await ctx.supabaseAdmin.auth.admin.getUserById(
              user.id
            );

          if (latestError || !latestData?.user) {
            failedUsers.push({
              id: user.id,
              error:
                latestError?.message ??
                "Final Auth user lookup failed.",
            });

            continue;
          }

          const latestUser =
            latestData.user as AuthUser;

          const latestCreatedAt =
            new Date(latestUser.created_at);

          const latestUserCheckPassed =
            latestCreatedAt.getTime() < cutoffTime &&
            latestUser.email_confirmed_at == null &&
            hasEmailOnlyMetadata(latestUser) &&
            hasEmailOnlyIdentity(latestUser);

          if (!latestUserCheckPassed) {
            failedUsers.push({
              id: user.id,
              error:
                "Account no longer passes final Auth eligibility checks.",
            });

            continue;
          }

          // ==================================================
          // STEP 8B: FINAL DATABASE ELIGIBILITY CHECK
          // ==================================================

          const {
            data: finalDatabaseEligible,
            error: finalDatabaseError,
          } = await ctx.supabaseAdmin.rpc(
            "cleanup_unverified_email_user_is_eligible",
            {
              p_user_id: user.id,
              p_account_age_hours: ACCOUNT_AGE_HOURS,
            }
          );

          if (
            finalDatabaseError ||
            finalDatabaseEligible !== true
          ) {
            failedUsers.push({
              id: user.id,
              error:
                finalDatabaseError?.message ??
                "Final database eligibility check failed.",
            });

            continue;
          }

          // ==================================================
          // STEP 8C: REQUEST ONE-TIME DELETE AUTHORIZATION
          // ==================================================

          const {
            data: authorizationId,
            error: authorizationError,
          } = await ctx.supabaseAdmin.rpc(
            "cleanup_unverified_email_user_authorize_deletion",
            {
              p_user_id: user.id,
            }
          );

          if (
            authorizationError ||
            typeof authorizationId !== "string" ||
            authorizationId.trim().length === 0
          ) {
            authorizationFailedCount++;

            failedUsers.push({
              id: user.id,
              error:
                authorizationError?.message ??
                "Database did not issue a deletion authorization.",
            });

            continue;
          }

          // Authorization UUID received.
          // The database trigger identifies authorization
          // using the account UUID.
          // Authorization expires after two minutes.

          // ==================================================
          // STEP 8D: ATTEMPT AUTH DELETION
          // ==================================================

          deletionAttemptCount++;

          const { error: deletionError } =
            await ctx.supabaseAdmin.auth.admin.deleteUser(
              user.id
            );

          // ==================================================
          // STEP 8E: AUTHORITATIVE DATABASE DELETION CHECK
          // ==================================================

          const {
            data: accountStillExists,
            error: verificationError,
          } = await ctx.supabaseAdmin.rpc(
            "cleanup_unverified_email_user_exists",
            {
              p_user_id: user.id,
            }
          );

          if (verificationError) {
            verificationFailedCount++;

            failedUsers.push({
              id: user.id,
              error:
                "Database deletion verification failed: " +
                verificationError.message,
            });

            continue;
          }

          if (accountStillExists === false) {
            // The database confirms the Auth account is gone.

            deletedCount++;

            continue;
          }

          if (accountStillExists === true) {
            verificationFailedCount++;

            failedUsers.push({
              id: user.id,
              error:
                deletionError?.message ??
                "Auth account still exists after deletion attempt.",
            });

            continue;
          }

          // Unexpected or invalid RPC result.

          verificationFailedCount++;

          failedUsers.push({
            id: user.id,
            error:
              "Deletion verification returned an unexpected result.",
          });

        } // END OF DELETION LOOP

        // ==================================================
        // STEP 9: LIVE RESPONSE
        // ==================================================

        return new Response(
          JSON.stringify(
            {
              status: "ok",
              mode: "live",

              eligibleCount: eligibleUsers.length,
              authorizationFailedCount,
              deletionAttemptCount,
              deletedCount,
              verificationFailedCount,

              failedCount: failedUsers.length,
              failedUsers,

              message:
                "Cleanup completed. Deletions were counted only after Auth absence was verified.",
            },
            null,
            2
          ),
          {
            headers: {
              "Content-Type": "application/json",
            },
            status: 200,
          }
        );

      } catch (error) {
        console.error("Cleanup function error:", error);

        return new Response(
          JSON.stringify({
            status: "error",
            message:
              "Cleanup function encountered an error.",
          }),
          {
            headers: {
              "Content-Type": "application/json",
            },
            status: 500,
          }
        );
      }
    }
  )
);
