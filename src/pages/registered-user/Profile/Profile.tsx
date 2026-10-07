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
    const handleProfilePhotoChange = (
  event: React.ChangeEvent<HTMLInputElement>
) => {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    const accounts = getStoredAccounts();

    const updatedAccounts = accounts.map((account) =>
      account.id === currentUserId
        ? {
            ...account,
            profilePicture: reader.result as string,
          }
        : account
    );

    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updatedAccounts));

    window.location.reload();
  };

  reader.readAsDataURL(file);
};

  const accounts = getStoredAccounts();

  const currentAccount = accounts.find(
    (account) => account.id === currentUserId
  );

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

      {/* CHANGE PHOTO */}
      <>
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
</>
    </div>
  </main>
);
}

export default Profile;