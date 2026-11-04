import type { AccountData } from "@/lib/accountApi";

export interface AccountProfileSnapshot {
  userId: string | null;
  account: AccountData | null;
  loading: boolean;
  error: string | null;
}

const pendingAccountProfileLoads = new Map<
  string,
  Promise<AccountProfileSnapshot>
>();

export function selectAccountProfileState(
  state: AccountProfileSnapshot,
  activeUserId: string | null,
): AccountProfileSnapshot {
  if (state.userId === activeUserId) return state;

  return {
    userId: activeUserId,
    account: null,
    loading: Boolean(activeUserId),
    error: null,
  };
}

export function updateAccountProfileState(
  state: AccountProfileSnapshot,
  activeUserId: string | null,
  account: AccountData,
): AccountProfileSnapshot {
  if (!activeUserId || state.userId !== activeUserId) {
    return selectAccountProfileState(state, activeUserId);
  }

  return {
    userId: activeUserId,
    account,
    loading: false,
    error: null,
  };
}

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

export async function loadAccountProfile(
  userId: string,
  loadAccount: (userId: string) => Promise<AccountData>,
): Promise<AccountProfileSnapshot> {
  try {
    return {
      userId,
      account: await loadAccount(userId),
      loading: false,
      error: null,
    };
  } catch (cause) {
    return {
      userId,
      account: null,
      loading: false,
      error:
        cause instanceof Error
          ? cause.message
          : "Unable to load account profile.",
    };
  }
}

export function loadAccountProfileOnce(
  userId: string,
  loadAccount: (userId: string) => Promise<AccountData>,
): Promise<AccountProfileSnapshot> {
  const pending = pendingAccountProfileLoads.get(userId);
  if (pending) return pending;

  const request = loadAccountProfile(userId, loadAccount);
  pendingAccountProfileLoads.set(userId, request);
  void request.then(() => {
    if (pendingAccountProfileLoads.get(userId) === request) {
      pendingAccountProfileLoads.delete(userId);
    }
  });
  return request;
}

export function selectAccountAvatar(
  account: AccountData | null,
  failedPhotoUrl: string | null,
): AccountAvatarView {
  const label = getAccountDisplayLabel(account) ?? "Profile";
  const photoUrl = account?.profilePhotoUrl?.trim() || null;

  if (photoUrl && photoUrl !== failedPhotoUrl) {
    return { type: "photo", url: photoUrl, label };
  }

  const initials = getAccountInitials(account);
  if (initials) return { type: "initials", initials, label };
  return { type: "icon", label };
}

export type AccountAvatarView =
  | { type: "photo"; url: string; label: string }
  | { type: "initials"; initials: string; label: string }
  | { type: "icon"; label: string };
