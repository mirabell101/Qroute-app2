import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";
import AccountAvatar from "@/components/account/AccountAvatar";
import AdminNotificationBell from "@/components/admin/AdminNotificationBell";
import { useAccountProfile } from "@/components/account/accountProfileStore";
import {
  getAdminNotifications,
  markAdminNotificationRead,
  type AdminNotificationRecord,
} from "@/lib/adminApi";
import { supabase } from "@/lib/supabase";
import { getAdminNavigationDestination } from "@/pages/admin/adminNavigation";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  FileText,
  Flag,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  Route as RouteIcon,
  Settings,
  Users,
} from "lucide-react";
import {
  buildReportDeepLink,
  countUnreadNotifications,
  getNotificationsViewState,
  markNotificationReadLocally,
} from "./notificationsModel";

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Route Management", icon: RouteIcon },
  { label: "Post Management", icon: FileText },
  { label: "Reports", icon: Flag },
  { label: "User Management", icon: Users },
  { label: "Settings", icon: Settings },
];

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export default function Notifications() {
  const navigate = useNavigate();
  const { userId, account } = useAccountProfile();
  const [notifications, setNotifications] = useState<AdminNotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markError, setMarkError] = useState("");
  const [markSuccess, setMarkSuccess] = useState("");
  const [bellRefreshKey, setBellRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const adminDisplayName =
    account?.displayName?.trim() ||
    account?.username?.trim() ||
    (account?.email ? account.email.split("@")[0] : null) ||
    "Admin";
  const adminEmail = account?.email || "Administrator";
  const effectiveErrorMessage = userId
    ? errorMessage
    : "Please sign in to continue.";
  const viewState = getNotificationsViewState(
    notifications,
    Boolean(userId) && loading,
    effectiveErrorMessage,
  );

  useEffect(() => {
    if (!userId) return;

    let active = true;
    void (async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        const result = await getAdminNotifications(userId);
        if (!active) return;
        setNotifications(result.notifications);
        setUnreadCount(result.unreadCount);
        setErrorMessage("");
      } catch (error: unknown) {
        if (!active) return;
        setNotifications([]);
        setUnreadCount(0);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load notifications.",
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [userId, retryCount]);

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: "local" });
    localStorage.removeItem("qroute_current_user");
    sessionStorage.removeItem("qroute_current_user");
    navigate("/login", { replace: true });
  };

  const handleMarkRead = async (notification: AdminNotificationRecord) => {
    if (!userId || markingId) return;
    setMarkingId(notification.id);
    setMarkError("");
    setMarkSuccess("");
    try {
      await markAdminNotificationRead(userId, notification.id);
      const updatedNotifications = markNotificationReadLocally(
        notifications,
        notification.id,
      );
      setNotifications(updatedNotifications);
      setUnreadCount(countUnreadNotifications(updatedNotifications));
      setMarkSuccess("Notification marked as read.");
      setBellRefreshKey((current) => current + 1);
    } catch (error: unknown) {
      setMarkError(
        error instanceof Error
          ? error.message
          : "Unable to mark the notification as read.",
      );
    } finally {
      setMarkingId(null);
    }
  };

  const handleViewReport = (notification: AdminNotificationRecord) => {
    const destination = buildReportDeepLink(notification.reportId);
    if (destination) navigate(destination);
  };

  return (
    <div className="min-h-screen bg-[#F4F8FC] text-slate-800">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col bg-[#102E4D] text-white transition-transform duration-200 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
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
              const destination = getAdminNavigationDestination(item.label);
              return (
                <button
                  key={item.label}
                  type="button"
                  disabled={!destination}
                  onClick={() => {
                    setSidebarOpen(false);
                    if (destination) navigate(destination);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                    destination
                      ? "text-slate-200 hover:bg-white/10 hover:text-white"
                      : "cursor-not-allowed text-slate-400"
                  }`}
                >
                  <Icon size={19} strokeWidth={1.8} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-5">
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
            onClick={() => void handleLogout()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/20"
          >
            <LogOut size={17} />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="min-h-screen md:ml-[250px]">
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
                Notifications
              </h2>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                Moderation events for reported community posts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            <AdminNotificationBell
              adminUserId={userId ?? ""}
              refreshKey={bellRefreshKey}
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

        <div className="mx-auto max-w-[1100px] p-5 sm:p-8 lg:p-10">
          <section className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                Admin Notifications
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Review moderation events created when a post reaches the report
                threshold.
              </p>
            </div>
            <div className="flex w-fit items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <Bell size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-500">Unread notifications</p>
                <p className="text-xl font-bold text-[#102E4D]">{unreadCount}</p>
              </div>
            </div>
          </section>

          {markError && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {markError}
            </p>
          )}
          {markSuccess && (
            <p
              role="status"
              className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
            >
              {markSuccess}
            </p>
          )}

          {viewState === "loading" && (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
              <p className="font-semibold text-slate-700">
                Loading notifications…
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Reading moderation events from the server.
              </p>
            </div>
          )}

          {viewState === "error" && (
            <div className="rounded-2xl border border-red-200 bg-white px-6 py-16 text-center">
              <AlertTriangle
                size={28}
                className="mx-auto text-red-500"
              />
              <p className="mt-3 font-semibold text-slate-700">
                Notifications could not be loaded
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {effectiveErrorMessage}
              </p>
              <button
                type="button"
                onClick={() => {
                  setRetryCount((current) => current + 1);
                }}
                className="mt-4 rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white"
              >
                Retry
              </button>
            </div>
          )}

          {viewState === "empty" && (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
              <Bell size={28} className="mx-auto text-slate-400" />
              <p className="mt-3 font-semibold text-slate-700">
                No notifications yet
              </p>
              <p className="mt-1 text-sm text-slate-500">
                You will be notified here when community posts need moderation.
              </p>
            </div>
          )}

          {viewState === "ready" && (
            <div className="space-y-3">
              {notifications.map((notification) => {
                const reportLink = buildReportDeepLink(notification.reportId);
                return (
                  <article
                    key={notification.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.035)]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#DFEAF4] text-[#102E4D]">
                        <Bell size={19} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-slate-900">
                            {notification.title}
                          </h4>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                              notification.isRead
                                ? "bg-green-50 text-green-700"
                                : "bg-orange-50 text-orange-700"
                            }`}
                          >
                            {notification.isRead ? (
                              <CheckCircle2 size={12} />
                            ) : (
                              <Clock size={12} />
                            )}
                            {notification.isRead ? "Read" : "Unread"}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">
                          {notification.message}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>
                            Report:{" "}
                            <strong className="font-semibold text-slate-700">
                              {notification.reportId ?? "Not linked"}
                            </strong>
                          </span>
                          <time dateTime={notification.createdAt}>
                            {formatDate(notification.createdAt)}
                          </time>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                      <button
                        type="button"
                        disabled={!reportLink}
                        onClick={() => handleViewReport(notification)}
                        className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#102E4D] hover:bg-blue-50 hover:text-[#102E4D] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        View Report
                      </button>
                      {!notification.isRead && (
                        <button
                          type="button"
                          disabled={markingId !== null}
                          onClick={() => void handleMarkRead(notification)}
                          className="rounded-lg bg-[#102E4D] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#19476D] disabled:opacity-50"
                        >
                          {markingId === notification.id
                            ? "Saving…"
                            : "Mark as read"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
