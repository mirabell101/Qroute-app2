
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

export function selectAccountProfileState(
  state: AccountProfileSnapshot,
  activeUserId: string | null,
  activeSessionGeneration: number | null,
): AccountProfileSnapshot {
  if (
    state.userId === activeUserId &&
    state.sessionGeneration === activeSessionGeneration
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

export function getAccountDisplayLabel(
  account: AccountData | null,
): string | null {
  return (
    account?.displayName?.trim() ||
    account?.username?.trim() ||
    account?.email.trim() ||
    null
  );
}

// ============================================================
// ACCOUNT INITIALS
// ============================================================

export function getAccountInitials(
  account: AccountData | null,
): string | null {
  const name =
    account?.displayName?.trim() ||
    account?.username?.trim() ||
    account?.email.split("@")[0]?.trim();

  if (!name) return null;

  const parts = name.split(/\s+/).filter(Boolean);

  if (!parts.length) return null;

  const initials =
    parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : parts[0].slice(0, 2);

  return initials.toUpperCase();
}

// ============================================================
// ACCOUNT PROFILE LOADING
// ============================================================

export async function loadAccountProfile(
  userId: string,
  sessionGeneration: number,
  loadAccount: (
    userId: string,
  ) => Promise<AccountData>,
): Promise<AccountProfileSnapshot> {
  try {
    return {
      userId,
      sessionGeneration,
      account: await loadAccount(userId),
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

  const pending = pendingAccountProfileLoads.get(cacheKey);

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

  void request.then(() => {
    if (
      pendingAccountProfileLoads.get(cacheKey) === request
    ) {
      pendingAccountProfileLoads.delete(cacheKey);
    }
  });

  return request;
}

// ============================================================
// ACCOUNT AVATAR
// ============================================================

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
