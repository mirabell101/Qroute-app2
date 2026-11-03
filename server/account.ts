import type { SupabaseClient } from "@supabase/supabase-js";

const PROFILE_PHOTO_BUCKET = "profile-photos";
const PROFILE_PHOTO_PATH = "profile";
const PROFILE_PHOTO_URL_TTL_SECONDS = 60 * 60;

export interface AuthenticatedAccountUser {
  id: string;
  email: string;
}

export interface AccountResponse {
  email: string;
  username: string;
  profilePhotoUrl: string | null;
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

export async function getAccount(
  client: SupabaseClient,
  user: AuthenticatedAccountUser,
): Promise<AccountResponse> {
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile || typeof profile.username !== "string") {
    throw new AccountRequestError(404, "Account profile not found.");
  }

  return {
    email: user.email,
    username: profile.username,
    profilePhotoUrl: await getProfilePhotoUrl(client, user.id),
  };
}

export async function getProfilePhotoUrl(
  client: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const photoStorage = client.storage.from(PROFILE_PHOTO_BUCKET);
  const { data: files, error: listError } = await photoStorage.list(userId, {
    limit: 10,
    search: PROFILE_PHOTO_PATH,
  });
  if (listError) throw listError;

  let profilePhotoUrl: string | null = null;
  if (files?.some((file) => file.name === PROFILE_PHOTO_PATH)) {
    const { data, error } = await photoStorage.createSignedUrl(
      `${userId}/${PROFILE_PHOTO_PATH}`,
      PROFILE_PHOTO_URL_TTL_SECONDS,
    );
    if (error) throw error;
    profilePhotoUrl = data.signedUrl;
  }

  return profilePhotoUrl;
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
      throw new AccountRequestError(409, "That username is already in use.");
    }
    throw error;
  }
  if (!data || typeof data.username !== "string") {
    throw new AccountRequestError(404, "Account profile not found.");
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
    throw new AccountRequestError(400, "Your current password is incorrect.");
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
