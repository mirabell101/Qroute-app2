/** Shared primitive validators used by the feature-specific validators. */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

export function isNullableRecord(
  value: unknown,
  predicate: (record: Record<string, unknown>) => boolean,
): boolean {
  return value === null || (isRecord(value) && predicate(value));
}

export function isNullableCount(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

export function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

export function isNullableHttpsUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isNullableImagePreviewUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}
