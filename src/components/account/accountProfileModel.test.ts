import { describe, expect, it } from "vitest";
import type { AccountData } from "@/lib/accountApi";

type AccountProfileState = {
  userId: string | null;
  account: AccountData | null;
  loading: boolean;
  error: string | null;
};

type SelectAccountProfileState = (
  state: AccountProfileState,
  activeUserId: string | null,
) => AccountProfileState;
type UpdateAccountProfileState = (
  state: AccountProfileState,
  activeUserId: string | null,
  account: AccountData,
) => AccountProfileState;
type AccountDisplayLabel = (account: AccountData | null) => string | null;
type AccountInitials = (account: AccountData | null) => string | null;
type LoadAccountProfile = (
  userId: string,
  loadAccount: (userId: string) => Promise<AccountData>,
) => Promise<AccountProfileState>;
type LoadAccountProfileOnce = (
  userId: string,
  loadAccount: (userId: string) => Promise<AccountData>,
) => Promise<AccountProfileState>;
type AccountAvatarView =
  | { type: "photo"; url: string; label: string }
  | { type: "initials"; initials: string; label: string }
  | { type: "icon"; label: string };
type SelectAccountAvatar = (
  account: AccountData | null,
  failedPhotoUrl: string | null,
) => AccountAvatarView;

const modelModule = import.meta.glob<Record<string, unknown>>(
  "./accountProfileModel.ts",
  { eager: true },
)["./accountProfileModel.ts"];

function isSelectAccountProfileState(
  value: unknown,
): value is SelectAccountProfileState {
  return typeof value === "function";
}

function isAccountDisplayLabel(
  value: unknown,
): value is AccountDisplayLabel {
  return typeof value === "function";
}

function isUpdateAccountProfileState(
  value: unknown,
): value is UpdateAccountProfileState {
  return typeof value === "function";
}

function isAccountInitials(value: unknown): value is AccountInitials {
  return typeof value === "function";
}

function isLoadAccountProfile(value: unknown): value is LoadAccountProfile {
  return typeof value === "function";
}

function isLoadAccountProfileOnce(
  value: unknown,
): value is LoadAccountProfileOnce {
  return typeof value === "function";
}

function isSelectAccountAvatar(value: unknown): value is SelectAccountAvatar {
  return typeof value === "function";
}

const account: AccountData = {
  email: "rider@example.com",
  username: null,
  displayName: "Google Rider",
  profilePhotoUrl: "https://example.test/profile.png",
};

describe("account profile state", () => {
  it("does not expose a previous user's profile after the active UUID changes", () => {
    const selectState: unknown = modelModule?.["selectAccountProfileState"];
    expect(isSelectAccountProfileState(selectState)).toBe(true);
    if (!isSelectAccountProfileState(selectState)) return;

    expect(
      selectState(
        {
          userId: "google-user-id",
          account,
          loading: false,
          error: null,
        },
        "different-user-id",
      ),
    ).toEqual({
      userId: "different-user-id",
      account: null,
      loading: true,
      error: null,
    });
  });

  it("clears profile data when the active user logs out", () => {
    const selectState: unknown = modelModule?.["selectAccountProfileState"];
    expect(isSelectAccountProfileState(selectState)).toBe(true);
    if (!isSelectAccountProfileState(selectState)) return;

    expect(
      selectState(
        {
          userId: "google-user-id",
          account,
          loading: false,
          error: null,
        },
        null,
      ),
    ).toEqual({
      userId: null,
      account: null,
      loading: false,
      error: null,
    });
  });

  it("publishes profile edits for the active account", () => {
    const updateState: unknown =
      modelModule?.["updateAccountProfileState"];
    expect(isUpdateAccountProfileState(updateState)).toBe(true);
    if (!isUpdateAccountProfileState(updateState)) return;

    const updatedAccount = { ...account, displayName: "Updated Rider" };
    expect(
      updateState(
        {
          userId: "google-user-id",
          account,
          loading: false,
          error: null,
        },
        "google-user-id",
        updatedAccount,
      ),
    ).toEqual({
      userId: "google-user-id",
      account: updatedAccount,
      loading: false,
      error: null,
    });
  });

  it("does not publish an edit after the active account changes", () => {
    const updateState: unknown =
      modelModule?.["updateAccountProfileState"];
    expect(isUpdateAccountProfileState(updateState)).toBe(true);
    if (!isUpdateAccountProfileState(updateState)) return;

    expect(
      updateState(
        {
          userId: "google-user-id",
          account,
          loading: false,
          error: null,
        },
        "different-user-id",
        { ...account, displayName: "Stale edit" },
      ),
    ).toEqual({
      userId: "different-user-id",
      account: null,
      loading: true,
      error: null,
    });
  });
});

describe("account profile presentation", () => {
  it("prefers the saved display name for the account label", () => {
    const getAccountDisplayLabel: unknown =
      modelModule?.["getAccountDisplayLabel"];
    expect(isAccountDisplayLabel(getAccountDisplayLabel)).toBe(true);
    if (!isAccountDisplayLabel(getAccountDisplayLabel)) return;

    expect(getAccountDisplayLabel(account)).toBe("Google Rider");
  });

  describe("account profile request deduplication", () => {
    it("shares an in-flight load for the same user UUID", async () => {
      const loadOnce: unknown = modelModule?.["loadAccountProfileOnce"];
      expect(isLoadAccountProfileOnce(loadOnce)).toBe(true);
      if (!isLoadAccountProfileOnce(loadOnce)) return;

      let loadCount = 0;
      let resolveAccount: (value: AccountData) => void = () => {
        throw new Error("Account request did not start.");
      };
      const loadAccount = () => {
        loadCount += 1;
        return new Promise<AccountData>((resolve) => {
          resolveAccount = resolve;
        });
      };

      const first = loadOnce("google-user-id", loadAccount);
      const second = loadOnce("google-user-id", loadAccount);
      expect(loadCount).toBe(1);
      expect(loadCount).toBe(1);
      resolveAccount(account);

      const expectedState = {
        userId: "google-user-id",
        account,
        loading: false,
        error: null,
      };
      await expect(Promise.all([first, second])).resolves.toEqual([
        expectedState,
        expectedState,
      ]);
    });

    it("starts a fresh load after the previous request completes", async () => {
      const loadOnce: unknown = modelModule?.["loadAccountProfileOnce"];
      expect(isLoadAccountProfileOnce(loadOnce)).toBe(true);
      if (!isLoadAccountProfileOnce(loadOnce)) return;

      let loadCount = 0;
      const loadAccount = async () => {
        loadCount += 1;
        return account;
      };

      await loadOnce("google-user-id", loadAccount);
      await loadOnce("google-user-id", loadAccount);

      expect(loadCount).toBe(2);
    });
  });

  it("uses initials from the saved display name for the avatar fallback", () => {
    const getAccountInitials: unknown = modelModule?.["getAccountInitials"];
    expect(isAccountInitials(getAccountInitials)).toBe(true);
    if (!isAccountInitials(getAccountInitials)) return;

    expect(getAccountInitials(account)).toBe("GR");
  });

  it("falls back to the email local part when no name is available", () => {
    const getAccountInitials: unknown = modelModule?.["getAccountInitials"];
    expect(isAccountInitials(getAccountInitials)).toBe(true);
    if (!isAccountInitials(getAccountInitials)) return;

    expect(
      getAccountInitials({
        email: "rider@example.com",
        username: null,
        displayName: null,
        profilePhotoUrl: null,
      }),
    ).toBe("RI");
  });

  it("loads the account using the authenticated UUID", async () => {
    const loadProfile: unknown = modelModule?.["loadAccountProfile"];
    expect(isLoadAccountProfile(loadProfile)).toBe(true);
    if (!isLoadAccountProfile(loadProfile)) return;

    let requestedUserId = "";
    await expect(
      loadProfile("google-user-uuid", async (userId) => {
        requestedUserId = userId;
        return account;
      }),
    ).resolves.toEqual({
      userId: "google-user-uuid",
      account,
      loading: false,
      error: null,
    });
    expect(requestedUserId).toBe("google-user-uuid");
  });

  it("keeps profile load failures explicit", async () => {
    const loadProfile: unknown = modelModule?.["loadAccountProfile"];
    expect(isLoadAccountProfile(loadProfile)).toBe(true);
    if (!isLoadAccountProfile(loadProfile)) return;

    await expect(
      loadProfile("google-user-uuid", async () => {
        throw new Error("Profile unavailable.");
      }),
    ).resolves.toEqual({
      userId: "google-user-uuid",
      account: null,
      loading: false,
      error: "Profile unavailable.",
    });
  });

  it("uses the saved photo for the account avatar when available", () => {
    const selectAvatar: unknown = modelModule?.["selectAccountAvatar"];
    expect(isSelectAccountAvatar(selectAvatar)).toBe(true);
    if (!isSelectAccountAvatar(selectAvatar)) return;

    expect(selectAvatar(account, null)).toEqual({
      type: "photo",
      url: "https://example.test/profile.png",
      label: "Google Rider",
    });
  });

  it("uses saved-name initials when no profile photo exists", () => {
    const selectAvatar: unknown = modelModule?.["selectAccountAvatar"];
    expect(isSelectAccountAvatar(selectAvatar)).toBe(true);
    if (!isSelectAccountAvatar(selectAvatar)) return;

    expect(
      selectAvatar({ ...account, profilePhotoUrl: null }, null),
    ).toEqual({
      type: "initials",
      initials: "GR",
      label: "Google Rider",
    });
  });

  it("falls back to the generic icon when no profile exists", () => {
    const selectAvatar: unknown = modelModule?.["selectAccountAvatar"];
    expect(isSelectAccountAvatar(selectAvatar)).toBe(true);
    if (!isSelectAccountAvatar(selectAvatar)) return;

    expect(selectAvatar(null, null)).toEqual({
      type: "icon",
      label: "Profile",
    });
  });

  it("falls back when the saved photo URL fails to load", () => {
    const selectAvatar: unknown = modelModule?.["selectAccountAvatar"];
    expect(isSelectAccountAvatar(selectAvatar)).toBe(true);
    if (!isSelectAccountAvatar(selectAvatar)) return;

    expect(selectAvatar(account, account.profilePhotoUrl)).toEqual({
      type: "initials",
      initials: "GR",
      label: "Google Rider",
    });
  });
});
