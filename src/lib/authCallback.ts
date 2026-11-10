export type AuthCallbackUrl = {
  error: string | null;
  code: string | null;
};

function toSearchParams(value: string): URLSearchParams {
  return new URLSearchParams(value.startsWith("#") ? value.slice(1) : value);
}

function firstValue(
  searchParams: URLSearchParams,
  hashParams: URLSearchParams,
  key: string,
): string | null {
  const value = searchParams.get(key) ?? hashParams.get(key);
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function parseAuthCallbackUrl(
  search: string,
  hash: string,
): AuthCallbackUrl {
  const searchParams = toSearchParams(search);
  const hashParams = toSearchParams(hash);
  const error = firstValue(searchParams, hashParams, "error");
  const errorCode = firstValue(searchParams, hashParams, "error_code");
  const errorDescription = firstValue(
    searchParams,
    hashParams,
    "error_description",
  );

  if (error || errorCode || errorDescription) {
    return {
      error:
        errorDescription ??
        `Authentication failed${error || errorCode ? `: ${error ?? errorCode}` : ""}.`,
      code: null,
    };
  }

  return {
    error: null,
    code: firstValue(searchParams, hashParams, "code"),
  };
}

export type AuthCallbackTokens = {
  access_token: string;
  refresh_token: string;
};

export function readAuthCallbackTokens(
  search: string,
  hash: string,
): AuthCallbackTokens | null {
  const searchParams = toSearchParams(search);
  const hashParams = toSearchParams(hash);
  const accessToken = firstValue(searchParams, hashParams, "access_token");
  const refreshToken = firstValue(searchParams, hashParams, "refresh_token");

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
  };
}

export function getOAuthCallbackDestination(
  authLoading: boolean,
  currentUserId: string | null,
): "/home" | "/login" | null {
  if (authLoading) return null;
  return currentUserId ? "/home" : "/login";
}

export function getOAuthCallbackError(
  search: string,
  hash: string,
): string | null {
  const searchParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const error = searchParams.get("error") || hashParams.get("error");

  if (!error) return null;

  const description =
    searchParams.get("error_description") ||
    hashParams.get("error_description");
  return description || `Authentication failed: ${error}`;
}
