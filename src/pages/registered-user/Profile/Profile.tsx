import { useEffect, useRef, useState } from "react";
import {
  updateAccountPassword,
  updateAccountUsername,
  uploadAccountPhoto,
} from "@/lib/accountApi";
import { useAccountProfile } from "@/components/account/accountProfileStore";
import { getLegacyProfilePhotoFile } from "@/lib/legacyAccountPhoto";

interface ProfileProps {
  currentUserId: string;
  onLogout: () => void;
}

const ACCOUNTS_KEY = "qroute_accounts";

function getLegacyProfilePhoto(userId: string): File | null {
  try {
    const stored = localStorage.getItem(ACCOUNTS_KEY);
    if (!stored) return null;

    const accounts: unknown = JSON.parse(stored);
    if (!Array.isArray(accounts)) return null;

    const account = accounts.find(
      (candidate) =>
        typeof candidate === "object" &&
        candidate !== null &&
        "id" in candidate &&
        candidate.id === userId,
    );
    return getLegacyProfilePhotoFile(account, userId);
  } catch {
    return null;
  }
}

function clearLegacyAccountData(): boolean {
  try {
    localStorage.removeItem(ACCOUNTS_KEY);
    return true;
  } catch {
    return false;
  }
}

function Profile({ currentUserId, onLogout }: ProfileProps) {
  const {
    userId: profileUserId,
    account,
    error: profileError,
    setAccount,
  } = useAccountProfile();
  const currentAccount = profileUserId === currentUserId ? account : null;
  const loadError =
    profileUserId === currentUserId ? profileError : null;
  const initializedUserId = useRef<string | null>(null);
  const [editingUsername, setEditingUsername] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("error");
  const [savingUsername, setSavingUsername] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [profileInitializationPending, setProfileInitializationPending] =
    useState(true);

  useEffect(() => {
    if (
      profileUserId !== currentUserId ||
      !currentAccount ||
      initializedUserId.current === currentUserId
    ) {
      return;
    }

    initializedUserId.current = currentUserId;
    let cancelled = false;

    void (async () => {
      let loadedAccount = currentAccount;
      const legacyPhoto = getLegacyProfilePhoto(currentUserId);
      let migrationMessage = "";

      if (legacyPhoto && loadedAccount.profilePhotoUrl === null) {
        try {
          loadedAccount = await uploadAccountPhoto(currentUserId, legacyPhoto);
          if (cancelled) return;
          setAccount(loadedAccount);
        } catch (error) {
          migrationMessage = `Account loaded, but the old profile photo could not be migrated: ${
            error instanceof Error ? error.message : "Please try again."
          }`;
        }
      }

      if (cancelled) return;
      const legacyDataCleared = clearLegacyAccountData();
      setProfileInitializationPending(false);
      setUsername(loadedAccount.username ?? "");
      setEditingUsername(false);
      setChangingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage(
        [
          migrationMessage,
          !legacyDataCleared
            ? "Saved account data could not be removed from this browser."
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
      setMessageType("error");
    })();

    return () => {
      cancelled = true;
    };
  }, [currentAccount, currentUserId, profileUserId, setAccount]);

  const showMessage = (text: string, type: "success" | "error" = "error") => {
    setMessage(text);
    setMessageType(type);
  };

  const handleProfilePhotoChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file || !currentAccount) return;
    setUploadingPhoto(true);
    try {
      const updatedAccount = await uploadAccountPhoto(currentUserId, file);
      setAccount(updatedAccount);
      showMessage("Profile photo updated successfully.", "success");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Unable to update profile photo.",
      );
    } finally {
      setUploadingPhoto(false);
      event.target.value = "";
    }
  };

  const handleUsernameSave = async () => {
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      showMessage("Username cannot be empty.");
      return;
    }

    if (trimmedUsername.length > 30) {
      showMessage("Username must be 30 characters or fewer.");
      return;
    }

    setSavingUsername(true);
    try {
      const updatedAccount = await updateAccountUsername(
        currentUserId,
        trimmedUsername,
      );
      setAccount(updatedAccount);
      setUsername(updatedAccount.username ?? "");
      setEditingUsername(false);
      showMessage("Username updated successfully.", "success");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Unable to update username.",
      );
    } finally {
      setSavingUsername(false);
    }
  };

  const handlePasswordSave = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showMessage("Please complete all password fields.");
      return;
    }

    const strongPassword =
      newPassword.length >= 8 &&
      /[A-Z]/.test(newPassword) &&
      /[a-z]/.test(newPassword) &&
      /\d/.test(newPassword) &&
      /[!@#$%^&*(),.?":{}|<>_-]/.test(newPassword);

    if (!strongPassword) {
      showMessage(
        "New password must be at least 8 characters and include uppercase, lowercase, a number, and a special character."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage("New password and confirmation do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      showMessage("Your new password must differ from your current password.");
      return;
    }

    setSavingPassword(true);
    try {
      await updateAccountPassword(
        currentUserId,
        currentPassword,
        newPassword,
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setChangingPassword(false);
      showMessage("Password updated successfully.", "success");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Unable to update password.",
      );
    } finally {
      setSavingPassword(false);
    }
  };

  if (!currentAccount) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-gray-500" role={loadError ? "alert" : undefined}>
          {loadError || "Loading account..."}
        </p>
        <button
          type="button"
          onClick={onLogout}
          className="text-sm font-medium text-gray-600 transition-colors hover:text-black"
        >
          Log Out
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-10 py-8">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            window.location.href = "/home";
          }}
          className="text-sm font-medium text-gray-600 transition-colors hover:text-black"
        >
          ← Back
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="text-sm font-medium text-gray-600 transition-colors hover:text-black"
        >
          Log Out
        </button>
      </div>

      {/* PROFILE */}
      <div className="mx-auto mt-16 flex w-full max-w-[500px] flex-col items-center">
        {/* PROFILE PICTURE */}
        <div className="flex h-[130px] w-[130px] items-center justify-center overflow-hidden rounded-full border border-[#d9d9d9] bg-[#eeeeee]">
          {currentAccount.profilePhotoUrl ? (
            <img
              src={currentAccount.profilePhotoUrl}
              alt="Profile"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#d6d6d6]">
              <svg
                viewBox="0 0 24 24"
                className="h-[75px] w-[75px] text-[#777777]"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5.33 0-8 2.67-8 6v2h16v-2c0-3.33-2.67-6-8-6Z" />
              </svg>
            </div>
          )}
        </div>

        {/* ACCOUNT INFORMATION */}
        <h1 className="mt-6 text-[24px] font-semibold text-black">
          {currentAccount.displayName ||
            currentAccount.username ||
            currentAccount.email}
        </h1>

        <p className="mt-1 text-[13px] text-gray-500">
          {currentAccount.email}
        </p>

        {/* POINTS AND BADGES */}
        <section className="mt-8 w-full rounded-xl border border-gray-200 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
          <h2 className="text-base font-semibold text-gray-900">
            Points and Badges
          </h2>

          <div className="mt-4 rounded-lg bg-[#f4f2ff] p-4">
            <p className="text-sm font-medium text-gray-600">Total QPoints</p>
            <p className="mt-1 text-sm font-medium text-[#6355F5]">
              Not available yet
            </p>
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-semibold text-gray-900">
              Earned Badges
            </h3>
            <p className="mt-3 text-sm text-gray-500">Not available yet</p>
          </div>
        </section>

        {message && (
          <p
            role="status"
            className={`mt-4 max-w-full text-center text-sm ${
              messageType === "success" ? "text-green-600" : "text-red-600"
            }`}
          >
            {message}
          </p>
        )}

        {/* CHANGE PHOTO */}
        <input
          id="profile-photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleProfilePhotoChange}
          disabled={profileInitializationPending || uploadingPhoto}
        />

        <label
          htmlFor="profile-photo"
          aria-disabled={profileInitializationPending || uploadingPhoto}
          className={`mt-6 rounded-[6px] bg-[#6355F5] px-6 py-2.5 text-[12px] font-medium text-white transition-colors ${
            profileInitializationPending || uploadingPhoto
              ? "cursor-not-allowed opacity-60"
              : "cursor-pointer hover:bg-[#5547E8]"
          }`}
        >
          {profileInitializationPending
            ? "Preparing Profile..."
            : uploadingPhoto
              ? "Uploading Photo..."
              : "Change Photo"}
        </label>

        {/* EDIT USERNAME */}
        <section className="mt-8 w-full border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">
              Username
            </h2>

            {!editingUsername && (
              <button
                type="button"
                onClick={() => {
                  setUsername(currentAccount.username ?? "");
                  setEditingUsername(true);
                  setMessage("");
                }}
                className="text-sm font-medium text-[#6355F5] hover:underline"
              >
                Edit
              </button>
            )}
          </div>

          {editingUsername ? (
            <div className="mt-3 space-y-3">
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                maxLength={30}
                autoComplete="username"
                className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-[#6355F5]"
                placeholder="Enter username"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleUsernameSave()}
                  disabled={savingUsername}
                  className="rounded-md bg-[#6355F5] px-4 py-2 text-sm font-medium text-white hover:bg-[#5547E8]"
                >
                  {savingUsername ? "Saving..." : "Save Username"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUsername(currentAccount.username ?? "");
                    setEditingUsername(false);
                    setMessage("");
                  }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-600">
              {currentAccount.username ?? "Not set"}
            </p>
          )}
        </section>

        {/* CHANGE PASSWORD */}
        <section className="mt-6 w-full border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">
              Password
            </h2>

            {!changingPassword && (
              <button
                type="button"
                onClick={() => {
                  setChangingPassword(true);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setMessage("");
                }}
                className="text-sm font-medium text-[#6355F5] hover:underline"
              >
                Change Password
              </button>
            )}
          </div>

          {changingPassword && (
            <div className="mt-3 space-y-3">
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-[#6355F5]"
                placeholder="Current password"
              />

              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-[#6355F5]"
                placeholder="New password"
              />

              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-[#6355F5]"
                placeholder="Confirm new password"
              />

              <p className="text-xs leading-relaxed text-gray-500">
                Use at least 8 characters, including uppercase and lowercase
                letters, a number, and a special character.
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handlePasswordSave()}
                  disabled={savingPassword}
                  className="rounded-md bg-[#6355F5] px-4 py-2 text-sm font-medium text-white hover:bg-[#5547E8]"
                >
                  {savingPassword ? "Saving..." : "Save Password"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setChangingPassword(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setMessage("");
                  }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default Profile;