export interface CommunityMapLocation {
  latitude: number;
  longitude: number;
  label: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseCommunityMapLocation(
  state: unknown,
): CommunityMapLocation | null {
  if (!isRecord(state) || !isRecord(state.mapLocation)) return null;
  const { latitude, longitude, label } = state.mapLocation;
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    typeof label !== "string" ||
    label.trim().length === 0
  ) {
    return null;
  }
  return { latitude, longitude, label: label.trim() };
}
