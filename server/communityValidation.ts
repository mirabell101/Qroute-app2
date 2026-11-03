export interface CommunityPointInput {
  name: string;
  latitude: number;
  longitude: number;
}

export interface CommunityPostInput {
  title: string;
  content: string;
  start: CommunityPointInput;
  destination: CommunityPointInput;
  transportTypeId: number | null;
  photoPaths: string[];
}

export function isCommunityPostId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type ParseResult<T> = { data: T; error: null } | { data: null; error: string };

function parsePoint(value: unknown): CommunityPointInput | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Record<string, unknown>;
  if (
    typeof point.name !== "string" ||
    typeof point.latitude !== "number" ||
    !Number.isFinite(point.latitude) ||
    point.latitude < -90 ||
    point.latitude > 90 ||
    typeof point.longitude !== "number" ||
    !Number.isFinite(point.longitude) ||
    point.longitude < -180 ||
    point.longitude > 180
  ) {
    return null;
  }

  const name = point.name.trim();
  if (!name || name.length > 180) return null;
  return { name, latitude: point.latitude, longitude: point.longitude };
}

export function parseCommunityPostInput(value: unknown): ParseResult<CommunityPostInput> {
  if (!value || typeof value !== "object") {
    return { data: null, error: "Post details are required." };
  }

  const input = value as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";
  const start = parsePoint(input.start);
  const destination = parsePoint(input.destination);
  const transportTypeId = input.transportTypeId ?? null;
  const photoPaths = input.photoPaths ?? [];

  if (!title || title.length > 120) {
    return { data: null, error: "Title must be between 1 and 120 characters." };
  }
  if (!content || content.length > 5000) {
    return { data: null, error: "Content must be between 1 and 5000 characters." };
  }
  if (!start || !destination) {
    return { data: null, error: "Choose valid starting and destination points." };
  }
  if (
    transportTypeId !== null &&
    (typeof transportTypeId !== "number" ||
      !Number.isSafeInteger(transportTypeId) ||
      transportTypeId < 1)
  ) {
    return { data: null, error: "Choose a valid transportation type." };
  }
  if (
    !Array.isArray(photoPaths) ||
    photoPaths.length > 5 ||
    photoPaths.some((path) =>
      typeof path !== "string" ||
      path.length > 240 ||
      !/^[0-9a-f-]{36}\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(path),
    ) ||
    new Set(photoPaths).size !== photoPaths.length
  ) {
    return { data: null, error: "Choose up to five valid photo attachments." };
  }

  return {
    data: { title, content, start, destination, transportTypeId, photoPaths },
    error: null,
  };
}

export function parseCommunityVoteInput(
  value: unknown,
): ParseResult<"upvote" | "downvote"> {
  const voteType =
    value && typeof value === "object"
      ? (value as Record<string, unknown>).voteType
      : null;
  if (voteType !== "upvote" && voteType !== "downvote") {
    return { data: null, error: "Vote must be upvote or downvote." };
  }
  return { data: voteType, error: null };
}

export function parseCommunityCommentInput(value: unknown): ParseResult<string> {
  const content =
    value && typeof value === "object" &&
    typeof (value as Record<string, unknown>).content === "string"
      ? ((value as Record<string, string>).content ?? "").trim()
      : "";
  if (!content || content.length > 1000) {
    return { data: null, error: "Comment must be between 1 and 1000 characters." };
  }
  return { data: content, error: null };
}
