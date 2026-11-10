const LOCAL_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

export function getAllowedOrigins(): Set<string> {
  return new Set([
    ...LOCAL_ALLOWED_ORIGINS,
    ...(process.env.CORS_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  ]);
}

function parseHttpOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function getRecoveryRedirectOrigin(
  requestOrigin: string | undefined,
): string | null {
  const allowedOrigins = getAllowedOrigins();

  if (requestOrigin !== undefined) {
    const origin = parseHttpOrigin(requestOrigin);
    return origin && allowedOrigins.has(origin) ? origin : null;
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:5173";
  }

  const configuredOrigin = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => parseHttpOrigin(origin.trim()))
    .find((origin) => origin && allowedOrigins.has(origin));

  if (configuredOrigin) {
    return configuredOrigin;
  }

  return null;
}
