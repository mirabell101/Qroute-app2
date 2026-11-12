import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccountProfile } from "@/components/account/accountProfileStore";
import {
  getAdminUsers,
  toggleAdminUserBan,
  type AdminUserRecord,
} from "@/lib/adminApi";
import { getAdminNavigationDestination } from "@/pages/admin/adminNavigation";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  Route as RouteIcon,
  FileText,
  Flag,
  Users,
  Settings,
  Search,
  MapPinned,
  Menu,
  X,
  Eye,
  UserRound,
  Ban as BanIcon,
  ShieldCheck,
  LogOut,
} from "lucide-react";

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Route Management", icon: RouteIcon },
  {
    label: "Post Management",
    icon: FileText,
  },
  { label: "Reports", icon: Flag },
  { label: "User Management", icon: Users },
  { label: "Settings", icon: Settings },
];

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString();
}

export default function UserManagement() {
  const navigate = useNavigate();
  const { userId } = useAccountProfile();

  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(
    null,
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [isBanning, setIsBanning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: "local" });
    localStorage.removeItem("qroute_current_user");
    sessionStorage.removeItem("qroute_current_user");
    navigate("/login", { replace: true });
  };

  const handleToggleBan = async (targetUserId: string) => {
    const targetUser = users.find((u) => u.id === targetUserId);
    if (!targetUser) return;
    if (!userId) {
      setActionError("Please sign in to continue.");
      return;
    }

    const nextBannedState = !targetUser.banned;
    setIsBanning(true);
    try {
      await toggleAdminUserBan(userId, targetUserId, nextBannedState);
      setUsers((current) =>
        current.map((u) =>
          u.id === targetUserId ? { ...u, banned: nextBannedState } : u
        )
      );
      if (selectedUser?.id === targetUserId) {
        setSelectedUser((current) =>
          current ? { ...current, banned: nextBannedState } : null
        );
      }
      setPendingUserId(null);
      setActionError(null);
    } catch (error: unknown) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to update the user's access.",
      );
    } finally {
      setIsBanning(false);
    }
  };

  useEffect(() => {
    let active = true;

    void getAdminUsers(userId ?? "")
      .then((data) => {
        if (active) {
          setUsers(data);
          setErrorMessage(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setUsers([]);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load registered users.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId, retryCount]);

  const filteredUsers = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();

    return users.filter((user) => {
      const matchesSearch =
        (user.username?.toLowerCase().includes(search) ?? false) ||
        (user.email?.toLowerCase().includes(search) ?? false);

      return matchesSearch;
    });
  }, [users, searchTerm]);

  const retryLoadingUsers = () => {
    setUsers([]);
    setErrorMessage(null);
    setIsLoading(true);
    setRetryCount((count) => count + 1);
  };

  return (
    <div className="min-h-screen bg-[#F4F8FC] text-slate-800">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col bg-[#102E4D] text-white transition-transform duration-200 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[105px] items-center border-b border-white/10 px-7">
          <div>
             <img
                src="/White%20Qroute%20Logo.png"
                alt="QRoute Logo"
                className="h-auto w-[150px] object-contain"
              />
            <p className="mt-0.5 text-xs tracking-wide text-blue-200">
              ADMINISTRATION
            </p>
          </div>
        </div>

        <div className="px-5 pt-8">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[2px] text-slate-400">
            Main Menu
          </p>

          <nav className="space-y-1.5">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active = item.label === "User Management";
              const destination = getAdminNavigationDestination(item.label);

              return (
                <button
                  key={item.label}
                  type="button"
                  disabled={!destination}
                  title={
                    destination
                      ? undefined
                      : `${item.label} is unavailable in the current system.`
                  }
                  onClick={() => {
                    setSidebarOpen(false);
                    if (destination) navigate(destination);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                    active
                      ? "bg-[#CFD5DB] font-semibold text-[#102E4D]"
                      : destination
                        ? "text-slate-200 hover:bg-white/10 hover:text-white"
                        : "cursor-not-allowed text-slate-400"
                  }`}
                >
                  <Icon size={19} strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {!destination && (
                    <span className="ml-auto text-[10px]">Unavailable</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-5">
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-200 text-[#102E4D]">
                <Users size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold">Admin Panel</p>
                <p className="text-xs text-slate-300">System management</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const destination =
                getAdminNavigationDestination("Preview of the System");
              if (destination) navigate(destination);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
          >
            <MapPinned size={17} />
            Preview of the System
          </button>

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/20"
          >
            <LogOut size={17} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="min-h-screen md:ml-[250px]">
        {/* Header */}
        <header className="sticky top-0 z-20 flex min-h-[86px] items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#102E4D] text-white md:hidden"
            >
              <Menu size={21} />
            </button>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-[#102E4D] sm:text-2xl">
                User Management
              </h2>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                View registered-user accounts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            <div className="hidden h-9 w-px bg-slate-200 sm:block" />
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#DCE9F7] font-bold text-[#102E4D]">
                A
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-slate-800">Admin</p>
                <p className="text-xs text-slate-500">Administrator</p>
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
          {/* Page heading */}
          <section className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>

              <h3 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
                Registered Users
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                Review accounts with a verified registered-user role.
              </p>
            </div>
          </section>

          <section className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-[#102E4D] focus-within:ring-2 focus-within:ring-blue-100">
              <Search size={18} className="shrink-0 text-slate-400" />

              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search username or email..."
                aria-label="Search username or email"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />

              {searchTerm && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchTerm("")}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X size={17} />
                </button>
              )}
            </div>
          </section>

          {/* User table */}
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_14px_rgba(15,23,42,0.035)]">
            <div className="flex flex-col gap-1 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h4 className="font-bold text-slate-900">User Accounts</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Accounts with the registered_user database role.
                </p>
              </div>

              <span className="text-xs font-medium text-slate-500">
                {filteredUsers.length}{" "}
                {filteredUsers.length === 1 ? "user" : "users"} found
              </span>
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-[#DFEAF4] text-xs text-slate-700">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Username</th>
                    <th className="px-5 py-4 font-semibold">Email</th>
                    <th className="px-5 py-4 font-semibold">Joined</th>
                    <th className="px-5 py-4 font-semibold">Role</th>
                    <th className="px-5 py-4 text-center font-semibold">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="transition hover:bg-[#F8FAFD]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DCE9F7] text-[#102E4D]">
                            <UserRound size={17} />
                          </div>
                          <span className="font-medium text-slate-700">
                            {user.username ? `@${user.username}` : "Not set"}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {user.email ?? "Email unavailable"}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {formatCreatedAt(user.createdAt)}
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                          Registered user
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedUser(user)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 transition hover:border-[#102E4D] hover:bg-blue-50 hover:text-[#102E4D]"
                          >
                            <Eye size={14} />
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                          <Search size={22} />
                        </div>
                        <p className="mt-3 font-semibold text-slate-700">
                          {isLoading
                            ? "Loading registered users..."
                            : errorMessage
                              ? "Users could not be loaded"
                              : users.length === 0
                                ? "No registered users are available"
                                : "No users found"}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {errorMessage ??
                            (isLoading
                              ? "Loading account records from the server."
                              : users.length === 0
                                ? "The database returned no registered-user accounts."
                                : "Try another username or email search.")}
                        </p>
                        {errorMessage ? (
                          <button
                            type="button"
                            onClick={retryLoadingUsers}
                            className="mt-4 rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white"
                          >
                            Retry
                          </button>
                        ) : (
                          searchTerm && (
                            <button
                              type="button"
                              onClick={() => setSearchTerm("")}
                              className="mt-4 text-sm font-semibold text-[#102E4D] underline underline-offset-4"
                            >
                              Clear search
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
              <p className="text-xs text-slate-400">
                QRoute User Management
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* User details modal */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setSelectedUser(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-modal-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="user-modal-title"
                  className="text-xl font-bold text-[#102E4D]"
                >
                  User Details
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  View registered account information.
                </p>
              </div>

              <button
                type="button"
                aria-label="Close user details"
                onClick={() => setSelectedUser(null)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-6 flex flex-col items-center rounded-xl bg-[#F4F8FC] p-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#DCE9F7] text-[#102E4D]">
                <UserRound size={30} />
              </div>
              <h4 className="mt-3 text-lg font-bold text-slate-800">
                {selectedUser.username
                  ? `@${selectedUser.username}`
                  : "Username not set"}
              </h4>
              <span className="mt-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                Registered user
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Email address
                </p>
                <p className="mt-1 break-all font-medium text-slate-800">
                  {selectedUser.email ?? "Email unavailable"}
                </p>
              </div>

              <div className="rounded-xl bg-[#F4F8FC] p-4">
                <p className="text-xs text-slate-500">Date joined</p>
                <p className="mt-1 text-sm font-semibold text-[#102E4D]">
                  {formatCreatedAt(selectedUser.createdAt)}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => {
                  setPendingUserId(selectedUser.id);
                  setActionError(null);
                }}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition ${
                  selectedUser.banned
                    ? "bg-green-700 hover:bg-green-800"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {selectedUser.banned ? "Unban User" : "Ban User"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Ban / Unban confirmation dialog */}
      {pendingUserId !== null &&
        (() => {
          const targetUser = users.find((user) => user.id === pendingUserId);
          if (!targetUser) return null;
          const banning = !targetUser.banned;

          return (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
              onClick={() => {
                setPendingUserId(null);
                setActionError(null);
              }}
            >
              <section
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                onClick={(event) => event.stopPropagation()}
                className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                    banning
                      ? "bg-red-50 text-red-600"
                      : "bg-green-50 text-green-700"
                  }`}
                >
                  {banning ? (
                    <BanIcon size={23} />
                  ) : (
                    <ShieldCheck size={23} />
                  )}
                </div>

                <h3
                  id="confirm-title"
                  className="mt-4 text-xl font-bold text-[#102E4D]"
                >
                  {banning ? "Ban this user?" : "Unban this user?"}
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {banning
                    ? `Are you sure you want to ban @${targetUser.username ?? targetUser.email}? This will restrict their account access.`
                    : `Are you sure you want to restore access for @${targetUser.username ?? targetUser.email}?`}
                </p>

                {actionError && (
                  <p
                    role="alert"
                    className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  >
                    {actionError}
                  </p>
                )}

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingUserId(null);
                      setActionError(null);
                    }}
                    className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={isBanning}
                    onClick={() => void handleToggleBan(targetUser.id)}
                    className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white ${
                      banning
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-green-700 hover:bg-green-800"
                    }`}
                  >
                    {isBanning ? "Processing..." : `Confirm ${banning ? "Ban" : "Unban"}`}
                  </button>
                </div>
              </section>
            </div>
          );
        })()}
    </div>
  );
}
