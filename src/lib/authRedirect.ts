const REDIRECT_BASE = "https://qroute.invalid";

const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

/**
 * Application pages that may be used as a post-authentication destination.
 *
 * This is an allowlist, not a blocklist. Any page that is not listed here is
 * rejected, even if it is a relative path on the QRoute origin.
 */
const TRUSTED_POST_AUTH_PATHS = new Set([
  "/",
  "/home",
  "/saved",
  "/recents",
  "/contribution",
  "/profile",
  "/points-badges",
  "/community",
  "/admin",
  "/admin/dashboard",
  "/admin/routes",
  "/admin/post-management",
  "/admin/reports",
  "/admin/users",
]);

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    if (url.username || url.password) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function canonicalTrustedPath(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  // Reject absolute URLs, protocol-relative URLs, and backslash tricks.
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\")
  ) {
    return null;
  }

  // Reject control characters that can confuse URL parsers.
  for (const character of trimmed) {
    const code = character.charCodeAt(0);

    if (code <= 0x1f || code === 0x7f) {
      return null;
    }
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed, REDIRECT_BASE);
  } catch {
    return null;
  }

  // A relative path must stay on the placeholder origin. This rejects inputs
  // such as `https://evil.example` that somehow passed the checks above.
  if (parsed.origin !== REDIRECT_BASE) {
    return null;
  }

  const path = parsed.pathname.replace(/\/+$/, "") || "/";

  return TRUSTED_POST_AUTH_PATHS.has(path) ? path : null;
}

export function isTrustedPostAuthPath(
  value: string | null | undefined
): boolean {
  return canonicalTrustedPath(value) !== null;
}

/**
 * Returns a safe in-app destination after authentication.
 *
 * User-supplied `next`/`redirect` values must always pass through this
 * function before being handed to React Router.
 */
export function resolvePostAuthPath(
  requestedPath: string | null | undefined,
  fallbackPath: string | null | undefined
): string {
  return (
    canonicalTrustedPath(requestedPath) ??
    canonicalTrustedPath(fallbackPath) ??
    "/home"
  );
}

export function resolveAuthenticatedRootPath(
  isAuthenticated: boolean
): string | null {
  return isAuthenticated ? "/home" : null;
}

type OAuthCallbackOptions = {
  configuredAppUrl?: string | null;
  currentOrigin?: string | null;
  allowLoopback?: boolean;
};

/**
 * Builds the callback URL that Supabase is allowed to return the browser to.
 *
 * Production builds must set VITE_APP_URL to the deployed QRoute origin. In
 * development, a loopback origin is accepted when VITE_APP_URL is unset.
 * Any other origin fails closed instead of trusting window.location.origin.
 */
export function getOAuthCallbackUrl({
  configuredAppUrl,
  currentOrigin,
  allowLoopback = false,
}: OAuthCallbackOptions): string {
  const configured = configuredAppUrl?.trim();

  if (configured) {
    const configuredUrl = parseHttpUrl(configured);

    if (!configuredUrl) {
      throw new Error(
        "VITE_APP_URL must be an absolute http(s) application URL."
      );
    }

    return new URL("/auth/callback", configuredUrl.origin).toString();
  }

  if (allowLoopback && currentOrigin) {
    const originUrl = parseHttpUrl(currentOrigin);

    if (originUrl && LOOPBACK_HOSTNAMES.has(originUrl.hostname)) {
      return new URL("/auth/callback", originUrl.origin).toString();
    }
  }

  throw new Error(
    "Google sign-in is not configured for this origin. Set VITE_APP_URL to the trusted QRoute application URL."
  );
}
