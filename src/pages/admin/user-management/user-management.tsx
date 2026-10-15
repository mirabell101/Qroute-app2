
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  ChevronDown,
  Eye,
  Ban as BanIcon,
  ShieldCheck,
  UserRound,
} from "lucide-react";

type AccountStatus = "Active" | "Banned";

type UserAccount = {
  id: number;
  username: string;
  email: string;
  status: AccountStatus;
  joinedDate: string;
  contributions: number;
};

const initialUsers: UserAccount[] = [
  {
    id: 1,
    username: "sample_user1",
    email: "sample1@example.com",
    status: "Active",
    joinedDate: "Oct 10, 2026",
    contributions: 8,
  },
  {
    id: 2,
    username: "commuter02",
    email: "commuter02@example.com",
    status: "Active",
    joinedDate: "Oct 8, 2026",
    contributions: 12,
  },
  {
    id: 3,
    username: "sample_user3",
    email: "sample3@example.com",
    status: "Banned",
    joinedDate: "Oct 5, 2026",
    contributions: 3,
  },
  {
    id: 4,
    username: "qroute_member",
    email: "member@example.com",
    status: "Active",
    joinedDate: "Oct 2, 2026",
    contributions: 5,
  },
  {
    id: 5,
    username: "sample_user5",
    email: "sample5@example.com",
    status: "Banned",
    joinedDate: "Sep 28, 2026",
    contributions: 1,
  },
];

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/admin/dashboard" },
  { label: "Route Management", icon: RouteIcon, path: "/admin/routes" },
  {
    label: "Post Management",
    icon: FileText,
    path: "/admin/post-management",
  },
  { label: "Reports", icon: Flag, path: "/admin/reports" },
  { label: "User Management", icon: Users, path: "/admin/users" },
  { label: "Settings", icon: Settings, path: "/admin/settings" },
];

export default function UserManagement() {
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserAccount[]>(initialUsers);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [quickFilter, setQuickFilter] = useState("All");
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);

  const filteredUsers = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();

    return users.filter((user) => {
      const matchesSearch =
        user.username.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search);

      const matchesStatus =
        statusFilter === "All" || user.status === statusFilter;

      const matchesQuickFilter =
        quickFilter === "All" || user.status === quickFilter;

      return matchesSearch && matchesStatus && matchesQuickFilter;
    });
  }, [users, searchTerm, statusFilter, quickFilter]);

  const activeCount = users.filter(
    (user) => user.status === "Active",
  ).length;

  const bannedCount = users.filter(
    (user) => user.status === "Banned",
  ).length;

  function toggleBanStatus(userId: number) {
    const targetUser = users.find((user) => user.id === userId);

    if (!targetUser) return;

    const nextStatus: AccountStatus =
      targetUser.status === "Active" ? "Banned" : "Active";

    setUsers((currentUsers) =>
      currentUsers.map((user) =>
        user.id === userId ? { ...user, status: nextStatus } : user,
      ),
    );

    setSelectedUser((currentUser) =>
      currentUser?.id === userId
        ? { ...currentUser, status: nextStatus }
        : currentUser,
    );

    setPendingUserId(null);
  }

  function getStatusStyle(status: AccountStatus) {
    return status === "Active"
      ? "bg-green-50 text-green-700"
      : "bg-red-50 text-red-700";
  }

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
            <h1 className="text-[32px] font-extrabold tracking-[-1.5px]">
              QRoute
            </h1>
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

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setSidebarOpen(false);
                    navigate(item.path);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                    active
                      ? "bg-[#CFD5DB] font-semibold text-[#102E4D]"
                      : "text-slate-200 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon size={19} strokeWidth={1.8} />
                  <span>{item.label}</span>

                  {item.label === "Reports" && (
                    <span className="ml-auto rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      !
                    </span>
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
            onClick={() => navigate("/admin")}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
          >
            <MapPinned size={17} />
            Preview of the System
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
                View and manage user accounts
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
              <p className="text-sm text-slate-500">
                Overview /{" "}
                <span className="font-medium text-[#102E4D]">
                  User Management
                </span>
              </p>

              <h3 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
                Registered Users
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                Review account details and manage user access.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-700">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Active</p>
                  <p className="text-xl font-bold text-[#102E4D]">
                    {activeCount}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <BanIcon size={20} />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Banned</p>
                  <p className="text-xl font-bold text-[#102E4D]">
                    {bannedCount}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Search and status filter */}
          <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-[#102E4D] focus-within:ring-2 focus-within:ring-blue-100">
              <Search size={18} className="shrink-0 text-slate-400" />

              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search username or email"
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

            <div className="relative sm:w-[180px]">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                aria-label="Filter accounts by status"
                className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm shadow-sm outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
              >
                <option value="All">All Status</option>
                <option value="Active">Active</option>
                <option value="Banned">Banned</option>
              </select>

              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
              />
            </div>
          </section>

          {/* Quick status filters */}
          <section className="mb-7 flex flex-wrap gap-2.5">
            {[
              { label: "All", value: "All" },
              { label: "Active", value: "Active" },
              { label: "Banned", value: "Banned" },
            ].map((filter) => {
              const active = quickFilter === filter.value;

              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setQuickFilter(filter.value)}
                  className={`min-w-[70px] rounded-full border px-5 py-2.5 text-sm font-medium shadow-sm transition ${
                    active
                      ? "border-[#102E4D] bg-[#102E4D] text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-[#102E4D] hover:text-[#102E4D]"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </section>

          {/* User table */}
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_14px_rgba(15,23,42,0.035)]">
            <div className="flex flex-col gap-1 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h4 className="font-bold text-slate-900">User Accounts</h4>
                <p className="mt-1 text-xs text-slate-500">
                  View account information and control account access.
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
                    <th className="px-5 py-4 font-semibold">Status</th>
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
                            @{user.username}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {user.email}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${getStatusStyle(user.status)}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              user.status === "Active"
                                ? "bg-green-500"
                                : "bg-red-500"
                            }`}
                          />
                          {user.status}
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

                          <button
                            type="button"
                            onClick={() => setPendingUserId(user.id)}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition ${
                              user.status === "Active"
                                ? "border-red-200 bg-white text-red-600 hover:bg-red-50"
                                : "border-green-200 bg-white text-green-700 hover:bg-green-50"
                            }`}
                          >
                            {user.status === "Active" ? (
                              <BanIcon size={14} />
                            ) : (
                              <ShieldCheck size={14} />
                            )}
                            {user.status === "Active" ? "Ban" : "Unban"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-16 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                          <Search size={22} />
                        </div>
                        <p className="mt-3 font-semibold text-slate-700">
                          No users found
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Try another username, email, or status filter.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchTerm("");
                            setStatusFilter("All");
                            setQuickFilter("All");
                          }}
                          className="mt-4 text-sm font-semibold text-[#102E4D] underline underline-offset-4"
                        >
                          Clear filters
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
              <p className="text-xs text-slate-400">
                QRoute User Management · UI Preview
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
                @{selectedUser.username}
              </h4>
              <span
                className={`mt-2 rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(selectedUser.status)}`}
              >
                {selectedUser.status}
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Email address
                </p>
                <p className="mt-1 break-all font-medium text-slate-800">
                  {selectedUser.email}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-[#F4F8FC] p-4">
                  <p className="text-xs text-slate-500">Date joined</p>
                  <p className="mt-1 text-sm font-semibold text-[#102E4D]">
                    {selectedUser.joinedDate}
                  </p>
                </div>

                <div className="rounded-xl bg-[#F4F8FC] p-4">
                  <p className="text-xs text-slate-500">Contributions</p>
                  <p className="mt-1 text-sm font-semibold text-[#102E4D]">
                    {selectedUser.contributions}
                  </p>
                </div>
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
                onClick={() => setPendingUserId(selectedUser.id)}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition ${
                  selectedUser.status === "Active"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-green-700 hover:bg-green-800"
                }`}
              >
                {selectedUser.status === "Active" ? "Ban User" : "Unban User"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Ban / Unban confirmation */}
      {pendingUserId !== null &&
        (() => {
          const targetUser = users.find(
            (user) => user.id === pendingUserId,
          );

          if (!targetUser) return null;

          const isBanning = targetUser.status === "Active";

          return (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
              onClick={() => setPendingUserId(null)}
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
                    isBanning
                      ? "bg-red-50 text-red-600"
                      : "bg-green-50 text-green-700"
                  }`}
                >
                  {isBanning ? (
                    <BanIcon size={23} />
                  ) : (
                    <ShieldCheck size={23} />
                  )}
                </div>

                <h3
                  id="confirm-title"
                  className="mt-4 text-xl font-bold text-[#102E4D]"
                >
                  {isBanning ? "Ban this user?" : "Unban this user?"}
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {isBanning
                    ? `Are you sure you want to ban @${targetUser.username}? This changes the account status in this UI preview.`
                    : `Are you sure you want to restore access for @${targetUser.username}?`}
                </p>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setPendingUserId(null)}
                    className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleBanStatus(targetUser.id)}
                    className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white ${
                      isBanning
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-green-700 hover:bg-green-800"
                    }`}
                  >
                    Confirm {isBanning ? "Ban" : "Unban"}
                  </button>
                </div>
              </section>
            </div>
          );
        })()}
    </div>
  );
}
