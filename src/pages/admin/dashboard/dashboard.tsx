
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";
import AccountAvatar from "@/components/account/AccountAvatar";
import AdminNotificationBell from "@/components/admin/AdminNotificationBell";
import { useAccountProfile } from "@/components/account/accountProfileStore";

import {
  getAdminReports,
  getAdminSummary,
  type AdminSummary,
} from "@/lib/adminApi";

import { logoutCurrentDevice } from "@/lib/authLogout";

import { getAdminNavigationDestination } from "@/pages/admin/adminNavigation";

import {
  LayoutDashboard,
  Route,
  Receipt,
  FileText,
  Flag,
  Users,
  Settings,
  Clock,
  MapPinned,
  Menu,
  LogOut,
  ShieldCheck,
  Map,
  UserCog,
  EyeOff,
  Eye,
  Activity,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

// ============================================================
// DASHBOARD SUMMARY CARDS
// ============================================================

const summaryCards: Array<{
  title: string;
  metric: keyof AdminSummary | null;
  note: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
}> = [
  {
    title: "Registered Users",
    metric: "registeredUsers",
    note: "Total registered accounts",
    icon: Users,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-700",
  },
  {
    title: "Reports",
    metric: "reports",
    note: "Community reports in the system",
    icon: Flag,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-700",
  },
  {
    title: "Transport Routes",
    metric: "routes",
    note: "Routes in the system",
    icon: Route,
    iconBg: "bg-green-100",
    iconColor: "text-green-700",
  },
  {
    title: "Community Posts",
    metric: "communityPosts",
    note: "Total community posts",
    icon: FileText,
    iconBg: "bg-purple-100",
    iconColor: "text-purple-700",
  },
];

// ============================================================
// NAVIGATION
// ============================================================

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "Route Management", icon: Route, active: false },
  { label: "Fare Management", icon: Receipt, active: false },
  { label: "Post Management", icon: FileText, active: false },
  { label: "Reports", icon: Flag, active: false },
  { label: "User Management", icon: Users, active: false },
  { label: "Settings", icon: Settings, active: false },
];

// ============================================================
// DISPLAY HELPERS
// ============================================================

function formatActivityTime(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Time unavailable"
    : date.toLocaleString();
}

function getActivityIcon(
  category: string,
  actionKey: string,
): LucideIcon {
  const normalizedCategory = category.toLowerCase();
  const normalizedAction = actionKey.toLowerCase();

  if (normalizedAction.includes("hidden")) return EyeOff;
  if (normalizedAction.includes("unhidden")) return Eye;

  switch (normalizedCategory) {
    case "moderation":
      return ShieldCheck;
    case "route_management":
      return Route;
    case "map_management":
      return Map;
    case "report_management":
      return Flag;
    case "account_management":
      return UserCog;
    case "system_management":
      return Settings;
    default:
      return Activity;
  }
}

function getActivityIconStyle(category: string): string {
  switch (category.toLowerCase()) {
    case "moderation":
      return "bg-emerald-100 text-emerald-700";
    case "route_management":
      return "bg-blue-100 text-blue-700";
    case "map_management":
      return "bg-cyan-100 text-cyan-700";
    case "report_management":
      return "bg-orange-100 text-orange-700";
    case "account_management":
      return "bg-violet-100 text-violet-700";
    case "system_management":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function formatCategory(category: string): string {
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// ============================================================
// DASHBOARD
// ============================================================

export default function Dashboard() {
  const navigate = useNavigate();

  const { userId, account } = useAccountProfile();

  const [summary, setSummary] =
    useState<AdminSummary | null>(null);

  const [pendingReportsCount, setPendingReportsCount] =
    useState<number | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const [retryCount, setRetryCount] = useState(0);

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [logoutError, setLogoutError] =
    useState<string | null>(null);

  // ----------------------------------------------------------
  // ADMIN PROFILE DISPLAY
  // ----------------------------------------------------------

  const adminDisplayName =
    account?.displayName?.trim() ||
    account?.username?.trim() ||
    (account?.email
      ? account.email.split("@")[0]
      : null) ||
    "Admin";

  const adminEmail =
    account?.email || "Administrator";

  // ----------------------------------------------------------
  // CENTRALIZED LOGOUT
  // ----------------------------------------------------------

  /**
   * Ordinary current-device logout.
   *
   * Delegates authentication cleanup to the shared logout
   * handler rather than directly signing out or manually
   * manipulating Supabase session storage.
   *
   * Navigation occurs only after logout succeeds.
   */
  const handleLogout = async (): Promise<void> => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      await logoutCurrentDevice();

      navigate("/login", {
        replace: true,
      });
    } catch (error: unknown) {
      console.error(
        "Dashboard logout failed:",
        error,
      );

      setLogoutError(
        "Unable to sign out. Please try again.",
      );
    } finally {
      setIsLoggingOut(false);
    }
  };

  // ----------------------------------------------------------
  // LOAD DASHBOARD DATA
  // ----------------------------------------------------------

  useEffect(() => {
    let active = true;

    const loadSummary = async (): Promise<void> => {
      if (!userId) {
        throw new Error(
          "Please sign in to continue.",
        );
      }

      const [nextSummary, reports] =
        await Promise.all([
          getAdminSummary(userId),
          getAdminReports(userId).catch(() => null),
        ]);

      if (active) {
        setSummary(nextSummary);

        if (reports) {
          const pending = reports.filter(
            (report) => report.status === "Pending",
          ).length;

          setPendingReportsCount(pending);
        }

        setErrorMessage(null);
      }
    };

    void loadSummary()
      .catch((error: unknown) => {
        if (active) {
          setSummary(null);

          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load admin dashboard data.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [userId, retryCount]);

  // ----------------------------------------------------------
  // RETRY DASHBOARD DATA
  // ----------------------------------------------------------

  const retryLoadingSummary = (): void => {
    setSummary(null);
    setErrorMessage(null);
    setIsLoading(true);
    setRetryCount((count) => count + 1);
  };

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#F4F8FC] text-slate-800">
      {/* SIDEBAR */}

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[250px] flex-col bg-[#102E4D] text-white md:flex">
        <div className="flex h-[105px] items-center border-b border-white/10 px-7">
          <div>
            <img
              src={qrouteWhiteLogo}
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

              const destination =
                getAdminNavigationDestination(item.label);

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
                  onClick={() =>
                    destination && navigate(destination)
                  }
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                    item.active
                      ? "bg-[#CFD5DB] font-semibold text-[#102E4D]"
                      : destination
                        ? "text-slate-200 hover:bg-white/10 hover:text-white"
                        : "cursor-not-allowed text-slate-400"
                  }`}
                >
                  <Icon size={19} strokeWidth={1.8} />

                  <span>{item.label}</span>

                  {!destination && (
                    <span className="ml-auto text-[10px]">
                      Unavailable
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* SIDEBAR BOTTOM */}

        <div className="mt-auto p-5">
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-200 text-[#102E4D]">
                <Users size={20} />
              </div>

              <div>
                <p className="text-sm font-semibold">
                  Admin Panel
                </p>

                <p className="text-xs text-slate-300">
                  System management
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/admin/base")}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
          >
            <MapPinned size={17} />
            Preview of the System
          </button>

          <button
            type="button"
            disabled={isLoggingOut}
            onClick={() => void handleLogout()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut size={17} />

            {isLoggingOut ? "Signing Out..." : "Sign Out"}
          </button>

          {logoutError && (
            <p
              role="alert"
              className="mt-2 text-center text-xs text-red-300"
            >
              {logoutError}
            </p>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT */}

      <main className="min-h-screen md:ml-[250px]">
        {/* HEADER */}

        <header className="sticky top-0 z-20 flex min-h-[86px] items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#102E4D] text-white md:hidden">
              <Menu size={21} />
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-[#102E4D] sm:text-2xl">
                Dashboard
              </h2>

              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                Preview of the System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            <AdminNotificationBell
              adminUserId={userId ?? ""}
            />

            <div className="hidden h-9 w-px bg-slate-200 sm:block" />

            <div className="flex items-center gap-2.5">
              <AccountAvatar
                account={account}
                className="h-10 w-10 bg-[#DCE9F7] font-bold text-[#102E4D]"
                iconSize={20}
              />

              <div className="hidden text-left sm:block">
                <p className="text-sm font-semibold text-slate-800">
                  {adminDisplayName}
                </p>

                <p
                  className="max-w-[180px] truncate text-xs text-slate-500"
                  title={adminEmail}
                >
                  {adminEmail}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* DASHBOARD BODY */}

        <div className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
          {/* WELCOME SECTION */}

          <section className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
                Welcome back, {adminDisplayName}!
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                Here&apos;s an overview of your QRoute system.
              </p>
            </div>
          </section>

          {/* LOADING */}

          {isLoading && (
            <p
              className="mt-5 text-sm text-slate-600"
              role="status"
            >
              Loading dashboard data...
            </p>
          )}

          {/* DASHBOARD ERROR */}

          {errorMessage && (
            <div
              className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              <span>{errorMessage}</span>

              <button
                type="button"
                onClick={retryLoadingSummary}
                className="rounded-lg border border-red-300 px-3 py-1.5 font-semibold hover:bg-red-100"
              >
                Retry
              </button>
            </div>
          )}

          {/* SUMMARY CARDS */}

          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => {
              const Icon = card.icon;

              const metricValue =
                card.metric && summary
                  ? summary[card.metric]
                  : null;

              const value = isLoading
                ? "Loading…"
                : typeof metricValue === "number"
                  ? metricValue.toLocaleString()
                  : "Unavailable";

              return (
                <article
                  key={card.title}
                  className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.035)] transition duration-200 hover:-translate-y-1 hover:shadow-md sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        {card.title}
                      </p>

                      <p className="mt-4 text-3xl font-bold tracking-tight text-[#102E4D]">
                        {value}
                      </p>
                    </div>

                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${card.iconBg} ${card.iconColor}`}
                    >
                      <Icon size={23} strokeWidth={1.8} />
                    </div>
                  </div>

                  <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4">
                    <span className="text-xs text-slate-500">
                      {card.metric === "reports" &&
                      pendingReportsCount !== null &&
                      pendingReportsCount > 0
                        ? `${pendingReportsCount} pending review`
                        : card.note}
                    </span>
                  </div>
                </article>
              );
            })}
          </section>

          {/* RECENT ACTIVITY */}

          <section className="mt-8 grid grid-cols-1 gap-6">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_14px_rgba(15,23,42,0.035)]">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
                <div>
                  <h4 className="font-bold text-slate-900">
                    Recent activity
                  </h4>

                  <p className="mt-1 text-xs text-slate-500">
                    Recent administrative actions
                  </p>
                </div>

                <Clock
                  size={19}
                  className="text-slate-400"
                />
              </div>

              <div className="px-5 py-5 sm:px-6">
                {isLoading ? (
                  <p
                    role="status"
                    className="text-sm text-slate-500"
                  >
                    Loading recent activity...
                  </p>
                ) : !summary ||
                  summary.recentActivity === null ? (
                  <p className="text-sm text-slate-500">
                    Recent activity is unavailable right now.
                  </p>
                ) : summary.recentActivity.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No recent administrative activity yet.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {summary.recentActivity.map((item) => {
                      const ActivityIcon = getActivityIcon(
                        item.category,
                        item.actionKey,
                      );

                      const iconStyle =
                        getActivityIconStyle(item.category);

                      const adminName =
                        item.adminDisplayName.trim() ||
                        item.adminUsername ||
                        "Administrator";

                      return (
                        <li
                          key={item.id}
                          className="flex items-start gap-3 rounded-lg border border-slate-100 bg-[#F8FAFD] px-4 py-3"
                        >
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconStyle}`}
                          >
                            <ActivityIcon size={16} />
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p
                                className="font-medium text-slate-800"
                                title={item.title}
                              >
                                {item.title}
                              </p>

                              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
                                {formatCategory(item.category)}
                              </span>
                            </div>

                            <p
                              className="mt-1 break-words text-sm text-slate-600"
                              title={item.detail}
                            >
                              {item.detail}
                            </p>

                            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                              <span className="font-medium text-slate-600">
                                {adminName}
                              </span>

                              {item.adminUsername && (
                                <span>
                                  @{item.adminUsername}
                                </span>
                              )}
                            </div>

                            {item.targetLabel && (
                              <p
                                className="mt-1 break-words text-xs text-slate-500"
                                title={item.targetLabel}
                              >
                                Target: {item.targetLabel}
                              </p>
                            )}

                            <p className="mt-1 text-xs text-slate-400">
                              {formatActivityTime(
                                item.occurredAt,
                              )}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
