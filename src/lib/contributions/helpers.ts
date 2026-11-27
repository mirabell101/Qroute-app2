import type { PointKind } from "./types";

export const pointKey = (kind: PointKind, id: number): string =>
  `${kind}-${id}`;

export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
