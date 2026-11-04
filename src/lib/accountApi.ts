import { API_BASE_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export interface AccountData {
  email: string;
  username: string | null;
  displayName: string | null;
  profilePhotoUrl: string | null;
}

const PROFILE_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAccount(value: unknown): AccountData {
  if (
    !isRecord(value) ||
    typeof value.email !== "string" ||
    !(
      value.username === null ||
      typeof value.username === "string"
    ) ||
    !(
      value.displayName === null ||
      typeof value.displayName === "string"
    ) ||
    !(
      value.profilePhotoUrl === null ||
      typeof value.profilePhotoUrl === "string"
    )
  ) {
    throw new Error("Account service returned an invalid response.");
  }
  return {
    email: value.email,
    username: value.username,
    displayName: value.displayName,
    profilePhotoUrl: value.profilePhotoUrl,
  };
}

async function requestAccount(
  path: string,
  expectedUserId: string,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const session = data.session;
  if (!session?.access_token) throw new Error("Please sign in to continue.");
  if (session.user.id !== expectedUserId) {
    throw new Error("The active account changed. Please try again.");
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  const response = await fetch(`${API_BASE_URL}/api/account${path}`, {
    ...options,
    headers,
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw new Error(`Account request failed (HTTP ${response.status}).`);
    }
    throw new Error("Account service returned an invalid response.");
  }
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : `Account request failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  if (!isRecord(payload) || payload.success !== true) {
    throw new Error("Account service returned an invalid response.");
  }
  return payload;
}

function accountFromResponse(payload: Record<string, unknown>): AccountData {
  return parseAccount(payload.account);
}

export async function getAccount(
  expectedUserId: string,
): Promise<AccountData> {
  return accountFromResponse(await requestAccount("", expectedUserId));
}

export async function updateAccountUsername(
  expectedUserId: string,
  username: string,
): Promise<AccountData> {
  return accountFromResponse(
    await requestAccount("", expectedUserId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    }),
  );
}

export async function updateAccountPassword(
  expectedUserId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const payload = await requestAccount("/password", expectedUserId, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (typeof payload.message !== "string") {
    throw new Error("Account service returned an invalid response.");
  }
}

export async function uploadAccountPhoto(
  expectedUserId: string,
  file: File,
): Promise<AccountData> {
  if (!PROFILE_PHOTO_TYPES.has(file.type)) {
    throw new Error("Please select a JPEG, PNG, or WebP image.");
  }
  if (file.size < 1 || file.size > MAX_PROFILE_PHOTO_BYTES) {
    throw new Error("Profile photos must be 5 MB or smaller.");
  }

  return accountFromResponse(
    await requestAccount("/photo", expectedUserId, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    }),
  );
}
