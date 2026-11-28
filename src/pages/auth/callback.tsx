import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session, User } from "@supabase/supabase-js";
import { parseAuthCallbackUrl, readAuthCallbackTokens, } from "@/lib/authCallback";
import { completeGoogleSignIn } from "@/lib/authSession";
import { supabase } from "@/lib/supabase";
import {
    getGoogleOAuthPopupFlowStatus,
    publishGoogleOAuthPopupResult,
} from "@/lib/googleOAuthPopup";
import { getSessionSnapshot, isCurrentAuthenticatedSession, isCurrentSessionAccessToken, subscribeSessionState, } from "@/lib/sessionCoordinator";
// ============================================================
// TYPES
// ============================================================
type AuthCallbackProps = {
    authLoading: boolean;
    currentUserId: string | null;
    onComplete?: () => void;
};
const SESSION_WAIT_TIMEOUT_MS = 15000;
// ============================================================
// GOOGLE PROVIDER DETECTION
// ============================================================
function isGoogleAuthenticatedUser(user: User | null): boolean {
    if (!user) {
        return false;
    }
    const appProvider = user.app_metadata?.provider;
    if (appProvider === "google") {
        return true;
    }
    const providers = user.app_metadata?.providers;
    if (Array.isArray(providers) &&
        providers.includes("google")) {
        return true;
    }
    return (user.identities?.some((identity) => identity.provider === "google") ?? false);
}
// ============================================================
// WAIT FOR THE SESSION COORDINATOR
// ============================================================
/**

  * Waits for the coordinator to independently validate

  * the active authenticated session.

  *

  * This is used only when the callback URL does not contain

  * an authorization code or implicit-flow token pair.

  *

  * An unauthenticated, password-recovery, or failed session

  * is never accepted as a successful Google callback.

  */
function waitForAuthenticatedCoordinatorSession(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        let settled = false;
        let unsubscribe: (() => void) | null = null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const finish = (callback: () => void): void => {
            if (settled) {
                return;
            }
            settled = true;
            unsubscribe?.();
            unsubscribe = null;
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            callback();
        };
        const checkSession = (): void => {
            if (settled) {
                return;
            }
            const snapshot = getSessionSnapshot();
            // ------------------------------------------------------
            // COORDINATOR VALIDATION FAILURE
            // ------------------------------------------------------
            if (snapshot.status === "error") {
                finish(() => {
                    reject(new Error(snapshot.error ??
                        "Unable to verify your Google sign-in session."));
                });
                return;
            }
            // ------------------------------------------------------
            // PASSWORD RECOVERY IS NOT NORMAL GOOGLE SIGN-IN
            // ------------------------------------------------------
            if (snapshot.status === "password_recovery" ||
                snapshot.purpose === "password_recovery") {
                finish(() => {
                    reject(new Error("A password-recovery session cannot complete Google sign-in."));
                });
                return;
            }
            // ------------------------------------------------------
            // NO ACTIVE SESSION
            // ------------------------------------------------------
            if (snapshot.status === "unauthenticated") {
                finish(() => {
                    reject(new Error("No active Google sign-in session was found. Please try signing in again."));
                });
                return;
            }
            // ------------------------------------------------------
            // VERIFIED AUTHENTICATED SESSION
            // ------------------------------------------------------
            if (snapshot.status === "authenticated" &&
                snapshot.purpose === "authenticated" &&
                snapshot.identity &&
                snapshot.user &&
                isCurrentAuthenticatedSession(snapshot.identity)) {
                finish(resolve);
            }
            // initializing and validating remain pending.
        };
        // Subscribe before the initial check to avoid missing changes.
        unsubscribe = subscribeSessionState(checkSession);
        timeoutId = setTimeout(() => {
            finish(() => {
                reject(new Error("Your existing authentication session could not be verified. Please sign in again."));
            });
        }, SESSION_WAIT_TIMEOUT_MS);
        checkSession();
    });
}
// ============================================================
// EXISTING SESSION RECOVERY
// ============================================================
/**

  * Recovers an existing Supabase session when the callback URL

  * contains neither a PKCE authorization code nor implicit tokens.

  *

  * The coordinator must first publish a verified authenticated

  * identity. The current Supabase session is then checked against

  * that identity before it can be used.

  */
async function recoverExistingSession(expectedUserId: string | null): Promise<Session> {
    await waitForAuthenticatedCoordinatorSession();
    const coordinatorSnapshot = getSessionSnapshot();
    if (coordinatorSnapshot.status !== "authenticated" ||
        coordinatorSnapshot.purpose !== "authenticated" ||
        !coordinatorSnapshot.identity) {
        throw new Error("The existing authentication session is not ready.");
    }
    const { data: { session }, error, } = await supabase.auth.getSession();
    if (error) {
        throw new Error("Unable to retrieve the existing Google sign-in session.");
    }
    if (!session?.access_token ||
        !session.user?.id) {
        throw new Error("No active Google sign-in session was found. Please try signing in again.");
    }
    // ----------------------------------------------------------
    // VERIFY THE USER ID
    // ----------------------------------------------------------
    if (session.user.id !== coordinatorSnapshot.identity.userId) {
        throw new Error("The active Supabase session does not match the verified session identity.");
    }
    if (expectedUserId &&
        session.user.id !== expectedUserId) {
        throw new Error("The authenticated account changed while completing Google sign-in.");
    }
    // ----------------------------------------------------------
    // VERIFY THE SESSION IS STILL CURRENT
    // ----------------------------------------------------------
    if (!isCurrentAuthenticatedSession(coordinatorSnapshot.identity) ||
        !isCurrentSessionAccessToken(session.access_token)) {
        throw new Error("The authentication session changed while completing Google sign-in.");
    }
    return session;
}
// ============================================================
// VERIFY GOOGLE ACCOUNT THROUGH SUPABASE
// ============================================================
/**

  * Independently verifies the session's user through Supabase Auth.

  *

  * Provider metadata is checked only after getUser() succeeds.

  * A user ID or locally decoded JWT is not sufficient.

  */
async function verifyGoogleAccount(session: Session): Promise<User> {
    const { data: { user }, error, } = await supabase.auth.getUser(session.access_token);
    if (error || !user) {
        throw new Error("Supabase could not verify the Google authentication account.");
    }
    if (user.id !== session.user.id) {
        throw new Error("The verified Google account does not match the active session.");
    }
    if (!isGoogleAuthenticatedUser(user)) {
        throw new Error("The active account is not authenticated through Google. Please use Google sign-in.");
    }
    return user;
}
// ============================================================
// SESSION OWNERSHIP CHECK
// ============================================================
/**

  * Confirms that the callback's original access token remains

  * associated with the active authenticated session.

  *

  * Token refreshes belonging to the same Supabase session

  * are accepted by the coordinator.

  */
function assertCallbackSessionCurrent(accessToken: string, expectedUserId: string): void {
    const current = getSessionSnapshot();
    const sessionBelongsToExpectedUser = current.identity?.userId === expectedUserId;
    const expectedAuthenticationPurpose = current.purpose === "authenticated";
    const authenticatedState = current.status === "authenticated";
    if (!sessionBelongsToExpectedUser ||
        !expectedAuthenticationPurpose ||
        !authenticatedState ||
        !isCurrentAuthenticatedSession(current.identity) ||
        !isCurrentSessionAccessToken(accessToken)) {
        throw new Error("Your authentication session changed while completing Google sign-in. Please try again.");
    }
}
// ============================================================
// MAIN COMPONENT
// ============================================================
function AuthCallback({ authLoading, currentUserId, onComplete, }: AuthCallbackProps) {
    const navigate = useNavigate();
    // ----------------------------------------------------------
    // CALLBACK EXECUTION CONTROL
    // ----------------------------------------------------------
    const started = useRef(false);
    const mountedRef = useRef(false);
    /**
 
      * Keep the latest props without restarting OAuth processing.
 
      */
    const propsRef = useRef({
        authLoading,
        currentUserId,
        onComplete,
    });
    propsRef.current = {
        authLoading,
        currentUserId,
        onComplete,
    };
    const [error, setError] = useState<string | null>(null);
    // ----------------------------------------------------------
    // CALLBACK EFFECT
    // ----------------------------------------------------------
    useEffect(() => {
        mountedRef.current = true;
        /**
  
          * React StrictMode can repeat effect setup and cleanup
  
          * during development.
  
          *
  
          * The authorization callback must only be processed once.
  
          */
        if (started.current) {
            return () => {
                mountedRef.current = false;
            };
        }
        started.current = true;
        // --------------------------------------------------------
        // URL CLEANUP
        // --------------------------------------------------------
        function cleanCallbackUrl(): void {
            window.history.replaceState(null, "", window.location.pathname);
        }
        // --------------------------------------------------------
        // ERROR HANDLING
        // --------------------------------------------------------
        function reportError(message: string): void {
            if (mountedRef.current) {
                setError(message);
            }
        }
        // --------------------------------------------------------
        // POPUP COMPLETION
        // --------------------------------------------------------
        function finishPopupFlow(result: {
            status: "success" | "error";
            userId?: string;
            message?: string;
        }): boolean {
            const published = publishGoogleOAuthPopupResult(result);
            if (!published) {
                return false;
            }
            // The parent tab receives the result through same-origin
            // storage events. No session tokens are sent between tabs.
            window.close();
            return true;
        }
        // CALLBACK PROCESSING
        // --------------------------------------------------------
        let callbackSessionEstablished = false;

        async function handleCallback(): Promise<void> {
            // ------------------------------------------------------
            // 1. READ THE CALLBACK URL
            // ------------------------------------------------------
            const callbackSearch = window.location.search;
            const callbackHash = window.location.hash;
            const callback = parseAuthCallbackUrl(callbackSearch, callbackHash);
            /**
   
              * Capture implicit tokens before removing credentials
   
              * from the browser address bar.
   
              */
            const implicitTokens = readAuthCallbackTokens(callbackSearch, callbackHash);
            // ------------------------------------------------------
            // 2. PROCESS PROVIDER ERRORS
            // ------------------------------------------------------
            if (callback.error) {
                cleanCallbackUrl();
                if (finishPopupFlow({
                    status: "error",
                    message: callback.error,
                })) {
                    return;
                }
                reportError(callback.error);
                return;
            }
            // ------------------------------------------------------
            // 3. IDENTIFY THE AUTHENTICATION RESPONSE
            // ------------------------------------------------------
            const hasCode = typeof callback.code === "string" &&
                callback.code.length > 0;
            const hasImplicitTokens = typeof implicitTokens?.access_token === "string" &&
                implicitTokens.access_token.length > 0 &&
                typeof implicitTokens?.refresh_token === "string" &&
                implicitTokens.refresh_token.length > 0;
            cleanCallbackUrl();
            if (!mountedRef.current) {
                return;
            }
            // ------------------------------------------------------
            // 4. ESTABLISH OR RECOVER THE SESSION
            // ------------------------------------------------------
            let session: Session | null = null;
            if (hasCode) {
                /**
    
                  * Normal PKCE flow.
    
                  *
    
                  * The same Supabase client that initiated OAuth
    
                  * must exchange the authorization code.
    
                  */
                const { data, error: exchangeError, } = await supabase.auth.exchangeCodeForSession(callback.code!);
                if (!mountedRef.current) {
                    return;
                }
                if (exchangeError) {
                    throw new Error(exchangeError.message);
                }
                session = data.session;
            }
            else if (hasImplicitTokens) {
                /**
    
                  * Compatibility with an existing implicit-flow callback.
    
                  *
    
                  * Normal Google OAuth should use PKCE.
    
                  */
                const { data, error: sessionError, } = await supabase.auth.setSession({
                    access_token: implicitTokens!.access_token,
                    refresh_token: implicitTokens!.refresh_token,
                });
                if (!mountedRef.current) {
                    return;
                }
                if (sessionError) {
                    throw new Error(sessionError.message);
                }
                session = data.session;
            }
            else {
                /**
    
                  * Existing-session fallback.
    
                  *
    
                  * The URL contained no authorization response.
    
                  * Do not immediately report an invalid callback.
    
                  *
    
                  * Wait for the central coordinator to confirm an
    
                  * existing authenticated session, then retrieve
    
                  * the corresponding Supabase session.
    
                  */
                session = await recoverExistingSession(propsRef.current.currentUserId);
                if (!mountedRef.current) {
                    return;
                }
            }
            // ------------------------------------------------------
            // 5. VALIDATE THE ESTABLISHED SESSION
            // ------------------------------------------------------
            if (!session?.access_token ||
                !session.user?.id) {
                throw new Error("We could not establish your Google sign-in session. Please try again.");
            }
            const callbackAccessToken = session.access_token;
            const callbackUserId = session.user.id;
            callbackSessionEstablished = true;
            // ------------------------------------------------------
            // 6. INDEPENDENTLY VERIFY THE GOOGLE ACCOUNT
            // ------------------------------------------------------
            await verifyGoogleAccount(session);
            if (!mountedRef.current) {
                return;
            }
            // ------------------------------------------------------
            // 7. COMPLETE GOOGLE SIGN-IN
            // ------------------------------------------------------
            /**
   
              * completeGoogleSignIn performs the remaining checks:
   
              *
   
              * - Validates the exact authenticated session.
   
              * - Waits for coordinator validation.
   
              * - Verifies the QRoute account through the backend.
   
              * - Retrieves the authoritative QRoute role.
   
              * - Checks the actual stored Display Name.
   
              * - Rejects session replacement.
   
              */
            const destination = await completeGoogleSignIn(callbackAccessToken, callbackUserId);
            if (!mountedRef.current) {
                return;
            }
            // ------------------------------------------------------
            // 8. FINAL SESSION OWNERSHIP CHECK
            // ------------------------------------------------------
            assertCallbackSessionCurrent(callbackAccessToken, callbackUserId);
            // ------------------------------------------------------
            // 9. COMPLETE OR NAVIGATE
            // ------------------------------------------------------
            if (finishPopupFlow({
                status: "success",
                userId: callbackUserId,
            })) {
                return;
            }
            if (propsRef.current.onComplete) {
                propsRef.current.onComplete();
            }
            else {
                navigate(destination, {
                    replace: true,
                });
            }
        }
        // --------------------------------------------------------
        // EXECUTE CALLBACK
        // --------------------------------------------------------
        void handleCallback().catch(async (unexpectedError: unknown) => {
            if (!mountedRef.current) {
                return;
            }
            console.error("Unexpected OAuth callback failure:", unexpectedError);
            cleanCallbackUrl();
            if (
                callbackSessionEstablished &&
                getGoogleOAuthPopupFlowStatus() === "pending"
            ) {
                try {
                    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
                    if (signOutError) {
                        console.error("Could not clear the unverified Google popup session:", signOutError);
                    }
                }
                catch (signOutError) {
                    console.error("Could not clear the unverified Google popup session:", signOutError);
                }
            }
            const message = unexpectedError instanceof Error
                ? unexpectedError.message
                : "Unable to complete Google sign-in.";
            if (finishPopupFlow({
                status: "error",
                message,
            })) {
                return;
            }
            reportError(message);
        });
        /**
  
          * The mounted flag is reset on cleanup.
  
          *
  
          * During React StrictMode's simulated cleanup/setup,
  
          * the second setup restores the flag while the original
  
          * callback continues processing.
  
          */
        return () => {
            mountedRef.current = false;
        };
    }, [navigate]);
    // ----------------------------------------------------------
    // RETURN TO SIGN-IN
    // ----------------------------------------------------------
    const handleReturnToSignIn = (): void => {
        navigate("/login", {
            replace: true,
        });
    };
    // ----------------------------------------------------------
    // ERROR UI
    // ----------------------------------------------------------
    if (error) {
        return (<main className="flex min-h-screen items-center justify-center bg-white px-4 py-8">

            <div className="w-full max-w-[420px] rounded-[6px] border border-[#333] px-10 py-9 text-center">

               <h1 className="text-[24px] font-bold text-black">

                  Authentication Error

               </h1>

               <p className="mt-4 text-sm text-red-600" role="alert">

                  {error}

               </p>

               <button type="button" onClick={handleReturnToSignIn} className="mt-6 text-sm font-semibold text-[#6C3FF5] hover:underline">

                  Return to Sign In

               </button>

            </div>

         </main>);
    }
    // ----------------------------------------------------------
    // LOADING UI
    // ----------------------------------------------------------
    return (<main className="flex min-h-screen items-center justify-center bg-white px-4 py-8">

         <div className="w-full max-w-[420px] rounded-[6px] border border-[#333] px-10 py-9 text-center">

            <h1 className="text-[24px] font-bold text-black">

               Signing you in…

            </h1>

            <p className="mt-4 text-sm text-gray-600">

               {authLoading
            ? "Checking your authentication session..."
            : currentUserId
                ? "Verifying your Google account and permissions..."
                : "Completing your Google sign-in..."}

            </p>

         </div>

      </main>);
}
export default AuthCallback;
