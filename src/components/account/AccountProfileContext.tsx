
import type { AccountData } from "@/lib/accountApi";

// ============================================================
// TYPES
// ============================================================

export interface AccountProfileSnapshot {
  userId: string | null;
  sessionGeneration: number | null;
  account: AccountData | null;
  loading: boolean;
  error: string | null;
}

export type AccountAvatarView =
  | {
      type: "photo";
      url: string;
      label: string;
    }
  | {
      type: "initials";
      initials: string;
      label: string;
    }
  | {
      type: "icon";
      label: string;
    };

// ============================================================
// PENDING LOAD CACHE
// ============================================================

/**
 * Pending profile requests are unique to a session generation.
 *
 * Two sessions belonging to the same user must never share
 * a pending profile request.
 *
 * Only pending requests are cached. Completed requests are
 * removed so a later explicit load can retrieve fresh data.
 */
const pendingAccountProfileLoads = new Map<
  string,
  Promise<AccountProfileSnapshot>
>();

function createProfileLoadKey(
  userId: string,
  sessionGeneration: number,
): string {
  return JSON.stringify([
    userId,
    sessionGeneration,
  ]);
}

// ============================================================
// STATE SELECTION
// ============================================================

/**
 * Selects profile state for the currently active identity.
 *
 * A profile is visible only when BOTH the user ID and
 * session generation match.
 *
 * If the state belongs to another identity, return an empty
 * loading snapshot instead of exposing stale account data.
 */
export function selectAccountProfileState(
  state: AccountProfileSnapshot,
  activeUserId: string | null,
  activeSessionGeneration: number | null,
): AccountProfileSnapshot {
  if (
    state.userId === activeUserId &&
    state.sessionGeneration ===
      activeSessionGeneration
  ) {
    return state;
  }

  return {
    userId: activeUserId,
    sessionGeneration: activeSessionGeneration,
    account: null,
    loading:
      Boolean(activeUserId) &&
      activeSessionGeneration !== null,
    error: null,
  };
}

// ============================================================
// STATE UPDATE
// ============================================================

/**
 * Applies an account update only when the current profile
 * state still belongs to the active user and generation.
 *
 * A stale component cannot overwrite profile state belonging
 * to a different session.
 */
export function updateAccountProfileState(
  state: AccountProfileSnapshot,
  activeUserId: string | null,
  activeSessionGeneration: number | null,
  account: AccountData,
): AccountProfileSnapshot {
  if (
    !activeUserId ||
    activeSessionGeneration === null ||
    state.userId !== activeUserId ||
    state.sessionGeneration !== activeSessionGeneration
  ) {
    return selectAccountProfileState(
      state,
      activeUserId,
      activeSessionGeneration,
    );
  }

  return {
    userId: activeUserId,
    sessionGeneration: activeSessionGeneration,
    account,
    loading: false,
    error: null,
  };
}

// ============================================================
// DISPLAY LABEL
// ============================================================

/**
 * Determines the best available visible account label.
 *
 * Priority:
 * 1. Stored Display Name
 * 2. Username
 * 3. Email
 */
export function getAccountDisplayLabel(
  account: AccountData | null,
): string | null {
  return (
    account?.displayName?.trim() ||
    account?.username?.trim() ||
    account?.email?.trim() ||
    null
  );
}

// ============================================================
// ACCOUNT INITIALS
// ============================================================

/**
 * Creates initials from the best available account label.
 *
 * Examples:
 * - "Jane Doe" -> "JD"
 * - "Jane" -> "JA"
 * - "jane@example.com" -> "JA"
 */
export function getAccountInitials(
  account: AccountData | null,
): string | null {
  const name =
    account?.displayName?.trim() ||
    account?.username?.trim() ||
    account?.email?.split("@")[0]?.trim();

  if (!name) {
    return null;
  }

  const parts = name
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return null;
  }

  const initials =
    parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : parts[0].slice(0, 2);

  return initials.toUpperCase();
}

// ============================================================
// ACCOUNT PROFILE LOADING
// ============================================================

/**
 * Loads the account profile for one exact session generation.
 *
 * Errors are converted into an AccountProfileSnapshot so
 * callers can always resolve to a predictable state.
 */
export async function loadAccountProfile(
  userId: string,
  sessionGeneration: number,
  loadAccount: (
    userId: string,
  ) => Promise<AccountData>,
): Promise<AccountProfileSnapshot> {
  try {
    const account = await loadAccount(userId);

    return {
      userId,
      sessionGeneration,
      account,
      loading: false,
      error: null,
    };
  } catch (cause: unknown) {
    return {
      userId,
      sessionGeneration,
      account: null,
      loading: false,
      error:
        cause instanceof Error
          ? cause.message
          : "Unable to load account profile.",
    };
  }
}

// ============================================================
// DEDUPLICATED PROFILE LOADING
// ============================================================

/**
 * Loads an account profile once for a particular user and
 * session generation while that request is pending.
 *
 * Requests from different generations never share a promise.
 *
 * The cache entry is removed after either success or failure.
 */
export function loadAccountProfileOnce(
  userId: string,
  sessionGeneration: number,
  loadAccount: (
    userId: string,
  ) => Promise<AccountData>,
): Promise<AccountProfileSnapshot> {
  const cacheKey = createProfileLoadKey(
    userId,
    sessionGeneration,
  );

  const pending =
    pendingAccountProfileLoads.get(cacheKey);

  if (pending) {
    return pending;
  }

  const request = loadAccountProfile(
    userId,
    sessionGeneration,
    loadAccount,
  );

  pendingAccountProfileLoads.set(
    cacheKey,
    request,
  );

  /**
   * Remove only this exact request.
   *
   * The equality check prevents an older request from
   * deleting a newer cache entry for the same identity.
   */
  const clearPendingRequest = (): void => {
    if (
      pendingAccountProfileLoads.get(cacheKey) ===
      request
    ) {
      pendingAccountProfileLoads.delete(cacheKey);
    }
  };

  void request.then(
    clearPendingRequest,
    clearPendingRequest,
  );

  return request;
}

// ============================================================
// ACCOUNT AVATAR
// ============================================================

/**
 * Selects the account avatar presentation.
 *
 * Priority:
 * 1. Uploaded profile photo
 * 2. Google profile photo
 * 3. Account initials
 * 4. Default profile icon
 *
 * A failed image URL can be supplied to skip an image that
 * previously failed to load.
 */
export function selectAccountAvatar(
  account: AccountData | null,
  failedPhotoUrls: readonly string[] = [],
): AccountAvatarView {
  const label =
    getAccountDisplayLabel(account) ?? "Profile";

  const uploadedPhotoUrl =
    account?.profilePhotoUrl?.trim() || null;

  if (
    uploadedPhotoUrl &&
    !failedPhotoUrls.includes(uploadedPhotoUrl)
  ) {
    return {
      type: "photo",
      url: uploadedPhotoUrl,
      label,
    };
  }

  const googlePhotoUrl =
    account?.googleProfilePhotoUrl?.trim() || null;

  if (
    googlePhotoUrl &&
    !failedPhotoUrls.includes(googlePhotoUrl)
  ) {
    return {
      type: "photo",
      url: googlePhotoUrl,
      label,
    };
  }

  const initials = getAccountInitials(account);

  if (initials) {
    return {
      type: "initials",
      initials,
      label,
    };
  }

  return {
    type: "icon",
    label,
  };
}
