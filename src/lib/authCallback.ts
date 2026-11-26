// ============================================================
// TYPES
// ============================================================

export type AuthCallbackUrl = {
  error: string | null;
  code: string | null;
};

export type AuthCallbackTokens = {
  access_token: string;
  refresh_token: string;
};

interface ResolvedValue {
  value: string | null;
  ambiguous: boolean;
}

interface TokenPairResult {
  tokens: AuthCallbackTokens | null;
  hasAnyToken: boolean;
  invalid: boolean;
}

// ============================================================
// URL PARAMETER HELPERS
// ============================================================

/**
 * Normalizes a URL query string or fragment into URLSearchParams.
 *
 * Accepts:
 * - "?code=..."
 * - "#access_token=..."
 * - "code=..."
 * - "access_token=..."
 *
 * This function does not accept arbitrary full URLs.
 */
function toSearchParams(value: string): URLSearchParams {
  const normalized = value.trim().replace(/^[?#]/, "");
  return new URLSearchParams(normalized);
}

/**
 * Retrieves all non-empty values for a parameter.
 *
 * Trimming prevents whitespace-only values from being
 * interpreted as valid authentication credentials.
 */
function getNonEmptyValues(
  params: URLSearchParams,
  key: string,
): string[] {
  return params
    .getAll(key)
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Resolves a parameter that must have at most one distinct value.
 *
 * Identical duplicated values are tolerated.
 * Conflicting values are rejected.
 */
function resolveUniqueValue(
  values: string[],
): ResolvedValue {
  const uniqueValues = [...new Set(values)];

  if (uniqueValues.length > 1) {
    return {
      value: null,
      ambiguous: true,
    };
  }

  return {
    value: uniqueValues[0] ?? null,
    ambiguous: false,
  };
}

function hasAnyParameter(
  searchParams: URLSearchParams,
  hashParams: URLSearchParams,
  key: string,
): boolean {
  return (
    getNonEmptyValues(searchParams, key).length > 0 ||
    getNonEmptyValues(hashParams, key).length > 0
  );
}

// ============================================================
// TOKEN PAIR PARSING
// ============================================================

/**
 * Reads an implicit-flow token pair from ONE URL location.
 *
 * Access and refresh tokens must come from the same query
 * string or the same fragment.
 *
 * Mixing tokens across locations is not allowed.
 */
function readTokenPair(
  params: URLSearchParams,
): TokenPairResult {
  const accessValues = getNonEmptyValues(
    params,
    "access_token",
  );

  const refreshValues = getNonEmptyValues(
    params,
    "refresh_token",
  );

  const access = resolveUniqueValue(accessValues);
  const refresh = resolveUniqueValue(refreshValues);

  const hasAnyToken =
    accessValues.length > 0 ||
    refreshValues.length > 0;

  const invalid =
    access.ambiguous ||
    refresh.ambiguous ||
    (access.value !== null) !== (refresh.value !== null);

  if (invalid || !access.value || !refresh.value) {
    return {
      tokens: null,
      hasAnyToken,
      invalid,
    };
  }

  return {
    tokens: {
      access_token: access.value,
      refresh_token: refresh.value,
    },
    hasAnyToken: true,
    invalid: false,
  };
}

/**
 * Reads implicit-flow tokens from the callback URL.
 *
 * A complete pair must exist in either:
 * - The query string, or
 * - The URL fragment.
 *
 * If both locations contain complete but different pairs,
 * the response is considered ambiguous and rejected.
 */
export function readAuthCallbackTokens(
  search: string,
  hash: string,
): AuthCallbackTokens | null {
  const searchParams = toSearchParams(search);
  const hashParams = toSearchParams(hash);

  const searchResult = readTokenPair(searchParams);
  const hashResult = readTokenPair(hashParams);

  if (
    searchResult.invalid ||
    hashResult.invalid
  ) {
    return null;
  }

  if (
    searchResult.tokens &&
    hashResult.tokens
  ) {
    const samePair =
      searchResult.tokens.access_token ===
        hashResult.tokens.access_token &&
      searchResult.tokens.refresh_token ===
        hashResult.tokens.refresh_token;

    if (!samePair) {
      return null;
    }
  }

  return (
    searchResult.tokens ??
    hashResult.tokens ??
    null
  );
}

// ============================================================
// AUTHENTICATION ERROR PARSING
// ============================================================

function resolveCallbackError(
  searchParams: URLSearchParams,
  hashParams: URLSearchParams,
): string | null {
  const error = resolveUniqueValue([
    ...getNonEmptyValues(searchParams, "error"),
    ...getNonEmptyValues(hashParams, "error"),
  ]);

  const errorCode = resolveUniqueValue([
    ...getNonEmptyValues(searchParams, "error_code"),
    ...getNonEmptyValues(hashParams, "error_code"),
  ]);

  const errorDescription = resolveUniqueValue([
    ...getNonEmptyValues(
      searchParams,
      "error_description",
    ),
    ...getNonEmptyValues(
      hashParams,
      "error_description",
    ),
  ]);

  if (
    error.ambiguous ||
    errorCode.ambiguous ||
    errorDescription.ambiguous
  ) {
    return "The authentication provider returned conflicting error information. Please try signing in again.";
  }

  const hasError =
    error.value !== null ||
    errorCode.value !== null ||
    errorDescription.value !== null;

  if (!hasError) {
    return null;
  }

  if (errorDescription.value) {
    return errorDescription.value.slice(0, 1000);
  }

  const errorIdentifier =
    error.value ?? errorCode.value;

  return errorIdentifier
    ? `Authentication failed: ${errorIdentifier}.`
    : "Authentication failed.";
}

// ============================================================
// CALLBACK RESPONSE PARSING
// ============================================================

/**
 * Parses the authentication callback.
 *
 * Supports:
 * - PKCE authorization-code callbacks.
 * - Existing implicit-flow token callbacks.
 * - OAuth provider error responses.
 *
 * Rejects:
 * - Conflicting authorization codes.
 * - Conflicting token pairs.
 * - Partial token pairs.
 * - Mixed authorization-code and implicit-token responses.
 * - Authentication error responses.
 *
 * JWT verification is deliberately not performed here.
 * Supabase Auth and the QRoute backend remain responsible
 * for authentication verification and authorization.
 */
export function parseAuthCallbackUrl(
  search: string,
  hash: string,
): AuthCallbackUrl {
  const searchParams = toSearchParams(search);
  const hashParams = toSearchParams(hash);

  // ----------------------------------------------------------
  // 1. PROCESS PROVIDER ERRORS
  // ----------------------------------------------------------

  const callbackError = resolveCallbackError(
    searchParams,
    hashParams,
  );

  if (callbackError) {
    return {
      error: callbackError,
      code: null,
    };
  }

  // ----------------------------------------------------------
  // 2. CHECK AUTHORIZATION CODE
  // ----------------------------------------------------------

  const codeResult = resolveUniqueValue([
    ...getNonEmptyValues(searchParams, "code"),
    ...getNonEmptyValues(hashParams, "code"),
  ]);

  if (codeResult.ambiguous) {
    return {
      error:
        "The sign-in callback contains conflicting authorization codes. Please try signing in again.",
      code: null,
    };
  }

  const code = codeResult.value;

  // ----------------------------------------------------------
  // 3. VALIDATE IMPLICIT-FLOW TOKEN PAIRS
  // ----------------------------------------------------------

  const searchTokenResult =
    readTokenPair(searchParams);

  const hashTokenResult =
    readTokenPair(hashParams);

  if (
    searchTokenResult.invalid ||
    hashTokenResult.invalid
  ) {
    return {
      error:
        "The sign-in callback contains an incomplete or invalid authentication token pair. Please try signing in again.",
      code: null,
    };
  }

  const hasImplicitTokens =
    searchTokenResult.tokens !== null ||
    hashTokenResult.tokens !== null;

  // ----------------------------------------------------------
  // 4. REJECT AMBIGUOUS TOKEN PAIRS
  // ----------------------------------------------------------

  if (
    searchTokenResult.tokens &&
    hashTokenResult.tokens
  ) {
    const samePair =
      searchTokenResult.tokens.access_token ===
        hashTokenResult.tokens.access_token &&
      searchTokenResult.tokens.refresh_token ===
        hashTokenResult.tokens.refresh_token;

    if (!samePair) {
      return {
        error:
          "The sign-in callback contains conflicting authentication sessions. Please try signing in again.",
        code: null,
      };
    }
  }

  // ----------------------------------------------------------
  // 5. REJECT MIXED AUTHENTICATION RESPONSES
  // ----------------------------------------------------------

  if (code && hasImplicitTokens) {
    return {
      error:
        "The sign-in callback contains multiple authentication response types. Please try signing in again.",
      code: null,
    };
  }

  // ----------------------------------------------------------
  // 6. REJECT PARTIAL TOKEN RESPONSES
  // ----------------------------------------------------------

  const hasAccessToken = hasAnyParameter(
    searchParams,
    hashParams,
    "access_token",
  );

  const hasRefreshToken = hasAnyParameter(
    searchParams,
    hashParams,
    "refresh_token",
  );

  if (hasAccessToken !== hasRefreshToken) {
    return {
      error:
        "The sign-in callback is missing a required authentication token. Please try signing in again.",
      code: null,
    };
  }

  // ----------------------------------------------------------
  // 7. RETURN THE VALID CALLBACK
  // ----------------------------------------------------------

  return {
    error: null,
    code,
  };
}

// ============================================================
// LEGACY CALLBACK DESTINATION
// ============================================================

/**
 * Retained for compatibility with existing callback consumers.
 *
 * Returns:
 * - null while authentication is loading.
 * - /home when an authenticated user is available.
 * - /login when no authenticated user is available.
 *
 * This helper does not independently authorize a user.
 */
export function getOAuthCallbackDestination(
  authLoading: boolean,
  currentUserId: string | null,
): "/home" | "/login" | null {
  if (authLoading) {
    return null;
  }

  return currentUserId ? "/home" : "/login";
}

// ============================================================
// LEGACY ERROR HELPER
// ============================================================

/**
 * Retained for compatibility.
 *
 * Delegates to the complete callback parser so error handling
 * stays consistent across the application's authentication
 * entry points.
 */
export function getOAuthCallbackError(
  search: string,
  hash: string,
): string | null {
  return parseAuthCallbackUrl(search, hash).error;
}
