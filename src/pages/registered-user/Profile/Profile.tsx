import { useState } from "react";

interface Account {
  id: string;
  username: string;
  email: string;
  password: string;
  profilePicture?: string | null;
}

interface ProfileProps {
  currentUserId: string;
  onLogout: () => void;
}

const ACCOUNTS_KEY = "qroute_accounts";

function getStoredAccounts(): Account[] {
  try {
    const stored = localStorage.getItem(ACCOUNTS_KEY);
    return stored ? (JSON.parse(stored) as Account[]) : [];
  } catch {
    return [];
  }
}

function Profile({ currentUserId, onLogout }: ProfileProps) {
  const [accounts, setAccounts] = useState<Account[]>(getStoredAccounts);
  const [editingUsername, setEditingUsername] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [username, setUsername] = useState(
    accounts.find((account) => account.id === currentUserId)?.username ?? ""
  );

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("error");

  const currentAccount = accounts.find(
    (account) => account.id === currentUserId
  );

  const showMessage = (text: string, type: "success" | "error" = "error") => {
    setMessage(text);
    setMessageType(type);
  };

  const saveAccounts = (updatedAccounts: Account[]) => {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updatedAccounts));
    setAccounts(updatedAccounts);
  };

  const handleProfilePhotoChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file || !currentAccount) return;

    if (!file.type.startsWith("image/")) {
      showMessage("Please select a valid image file.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        showMessage("Unable to read the selected image.");
        return;
      }

      const latestAccounts = getStoredAccounts();

      const updatedAccounts = latestAccounts.map((account) =>
        account.id === currentUserId
          ? { ...account, profilePicture: reader.result as string }
          : account
      );

      saveAccounts(updatedAccounts);
      showMessage("Profile photo updated successfully.", "success");
    };

    reader.onerror = () => {
      showMessage("Unable to read the selected image.");
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleUsernameSave = () => {
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      showMessage("Username cannot be empty.");
      return;
    }

    if (trimmedUsername.length > 30) {
      showMessage("Username must be 30 characters or fewer.");
      return;
    }

    const latestAccounts = getStoredAccounts();
    const updatedAccounts = latestAccounts.map((account) =>
      account.id === currentUserId
        ? { ...account, username: trimmedUsername }
        : account
    );

    if (!latestAccounts.some((account) => account.id === currentUserId)) {
      showMessage("Account not found.");
      return;
    }

    saveAccounts(updatedAccounts);
    setUsername(trimmedUsername);
    setEditingUsername(false);
    showMessage("Username updated successfully.", "success");
  };

  const handlePasswordSave = () => {
    const latestAccounts = getStoredAccounts();
    const account = latestAccounts.find(
      (item) => item.id === currentUserId
    );

    if (!account) {
      showMessage("Account not found.");
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      showMessage("Please complete all password fields.");
      return;
    }

    if (currentPassword !== account.password) {
      showMessage("Your current password is incorrect.");
      return;
    }

    const strongPassword =
      newPassword.length >= 8 &&
      /[A-Z]/.test(newPassword) &&
      /[a-z]/.test(newPassword) &&
      /\d/.test(newPassword) &&
      /[!@#$%^&*(),.?":{}|<>_\-]/.test(newPassword);

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

    const updatedAccounts = latestAccounts.map((item) =>
      item.id === currentUserId
        ? { ...item, password: newPassword }
        : item
    );

    saveAccounts(updatedAccounts);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setChangingPassword(false);
    showMessage("Password updated successfully.", "success");
  };

  if (!currentAccount) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Account not found.</p>
      </div>
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
          {currentAccount.profilePicture ? (
            <img
              src={currentAccount.profilePicture}
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
          {currentAccount.username}
        </h1>

        <p className="mt-1 text-[13px] text-gray-500">
          {currentAccount.email}
        </p>

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
          accept="image/*"
          className="hidden"
          onChange={handleProfilePhotoChange}
        />

        <label
          htmlFor="profile-photo"
          className="mt-6 cursor-pointer rounded-[6px] bg-[#6355F5] px-6 py-2.5 text-[12px] font-medium text-white transition-colors hover:bg-[#5547E8]"
        >
          Change Photo
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
                  setUsername(currentAccount.username);
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
                  onClick={handleUsernameSave}
                  className="rounded-md bg-[#6355F5] px-4 py-2 text-sm font-medium text-white hover:bg-[#5547E8]"
                >
                  Save Username
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUsername(currentAccount.username);
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
              {currentAccount.username}
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
                  onClick={handlePasswordSave}
                  className="rounded-md bg-[#6355F5] px-4 py-2 text-sm font-medium text-white hover:bg-[#5547E8]"
                >
                  Save Password
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