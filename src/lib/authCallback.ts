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
