
import type { SupabaseClient } from "@supabase/supabase-js";

const PROFILE_PHOTO_BUCKET = "profile-photos";
const PROFILE_PHOTO_PATH = "profile";

const MIN_DISPLAY_NAME_LENGTH = 2;
const MAX_DISPLAY_NAME_LENGTH = 50;

export interface AuthenticatedAccountUser {
  id: string;
  email: string;
  userMetadata?: Record<string, unknown> | null;
}

export interface AccountResponse {
  email: string;
  username: string | null;
  displayName: string | null;
  profilePhotoUrl: string | null;
  googleProfilePhotoUrl: string | null;
}

export class AccountRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AccountRequestError";
  }
}

export function isValidAccountUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,30}$/.test(username);
}

export function isStrongAccountPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    password.length <= 128 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[!@#$%^&*(),.?":{}|<>_\-\\]/.test(password)
  );
}

export function getGoogleProfilePhotoUrl(
  userMetadata: Record<string, unknown> | null | undefined,
): string | null {
  const candidate = [
    userMetadata?.avatar_url,
    userMetadata?.picture,
  ].find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );

  if (!candidate) return null;

  try {
    const url = new URL(candidate.trim());

    // Only accept secure image URLs from authentication metadata.
    if (url.protocol !== "https:") return null;

    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Retrieves the actual stored Display Name from profiles.
 *
 * This intentionally does not fall back to Google metadata.
 * A missing, empty, or whitespace-only stored Display Name
 * is considered incomplete.
 */
export async function getStoredAccountDisplayName(
  client: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  if (
    !data ||
    typeof data.display_name !== "string" ||
    !data.display_name.trim()
  ) {
    return null;
  }

  return data.display_name.trim();
}

/**
 * Saves a Display Name to the authenticated user's profiles row
 * and verifies the returned database value.
 */
export async function updateAccountDisplayName(
  client: SupabaseClient,
  userId: string,
  displayName: string,
): Promise<string> {
  const normalizedDisplayName = displayName.trim();

  if (
    normalizedDisplayName.length < MIN_DISPLAY_NAME_LENGTH ||
    normalizedDisplayName.length > MAX_DISPLAY_NAME_LENGTH
  ) {
    throw new AccountRequestError(
      400,
      `Display Name must be between ${MIN_DISPLAY_NAME_LENGTH} and ${MAX_DISPLAY_NAME_LENGTH} characters.`,
    );
  }

  const { data, error } = await client
    .from("profiles")
    .update({ display_name: normalizedDisplayName })
    .eq("id", userId)
    .select("display_name")
    .maybeSingle();

  if (error) throw error;

  if (
    !data ||
    typeof data.display_name !== "string" ||
    !data.display_name.trim()
  ) {
    throw new AccountRequestError(
      404,
      "Account profile not found or Display Name was not saved.",
    );
  }

  return data.display_name.trim();
}

export async function getAccount(
  client: SupabaseClient,
  user: AuthenticatedAccountUser,
): Promise<AccountResponse> {
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("username, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  const storedDisplayName =
    profile &&
    typeof profile.display_name === "string" &&
    profile.display_name.trim()
      ? profile.display_name
      : null;

  const metadataDisplayName = [
    user.userMetadata?.display_name,
    user.userMetadata?.full_name,
    user.userMetadata?.name,
  ].find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  ) ?? null;

  const uploadedPhoto = await getProfilePhotoUrl(
    client,
    user.id,
  ).catch(() => null);

  const googleProfilePhotoUrl = getGoogleProfilePhotoUrl(
    user.userMetadata,
  );

  return {
    email: user.email,
    username:
      profile && typeof profile.username === "string"
        ? profile.username
        : null,
    displayName: storedDisplayName ?? metadataDisplayName,
    profilePhotoUrl: uploadedPhoto,
    googleProfilePhotoUrl,
  };
}

export async function getProfilePhotoUrl(
  client: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const photoStorage = client.storage.from(PROFILE_PHOTO_BUCKET);

  const { data: files, error: listError } = await photoStorage.list(
    userId,
    {
      limit: 10,
      search: PROFILE_PHOTO_PATH,
    },
  );

  if (listError) throw listError;

  if (!files?.some((file) => file.name === PROFILE_PHOTO_PATH)) {
    return null;
  }

  return photoStorage.getPublicUrl(
    `${userId}/${PROFILE_PHOTO_PATH}`,
  ).data.publicUrl;
}

export async function updateAccountUsername(
  client: SupabaseClient,
  userId: string,
  username: string,
): Promise<string> {
  const { data, error } = await client
    .from("profiles")
    .update({ username })
    .eq("id", userId)
    .select("username")
    .maybeSingle();

  if (error) {
    if ("code" in error && error.code === "23505") {
      throw new AccountRequestError(
        409,
        "That username is already in use.",
      );
    }

    throw error;
  }

  if (!data || typeof data.username !== "string") {
    throw new AccountRequestError(
      404,
      "Account profile not found.",
    );
  }

  return data.username;
}

export async function updateAccountPassword(
  client: SupabaseClient,
  user: AuthenticatedAccountUser,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (error || data.user?.id !== user.id || !data.session) {
    throw new AccountRequestError(
      400,
      "Your current password is incorrect.",
    );
  }

  const { error: updateError } = await client.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    throw new AccountRequestError(
      400,
      "Unable to update your password. Please try again.",
    );
  }
}

export async function uploadAccountPhoto(
  client: SupabaseClient,
  userId: string,
  contents: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await client.storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(`${userId}/${PROFILE_PHOTO_PATH}`, contents, {
      contentType,
      upsert: true,
    });

  if (error) throw error;
}
