import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  getAdminSummary,
  type AdminSummary,
} from "@/lib/adminApi";
import { getAdminNavigationDestination } from "@/pages/admin/adminNavigation";
import {
  LayoutDashboard,
  Route,
  FileText,
  Flag,
  Users,
  Settings,
  Bell,
  Clock,
  MapPinned,
  Menu,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
    metric: null,
    note: "No reports data source is configured",
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

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "Route Management", icon: Route, active: false },
  { label: "Post Management", icon: FileText, active: false },
  { label: "Reports", icon: Flag, active: false },
  { label: "User Management", icon: Users, active: false },
  { label: "Settings", icon: Settings, active: false },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;

    const loadSummary = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw new Error(error.message);
        const userId = data.session?.user.id;
        if (!userId) throw new Error("Please sign in to continue.");

        const nextSummary = await getAdminSummary(userId);
        if (active) setSummary(nextSummary);
      } catch (error: unknown) {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load admin dashboard data.",
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadSummary();
    return () => {
      active = false;
    };
  }, [retryCount]);

  const retryLoadingSummary = () => {
    setSummary(null);
    setErrorMessage(null);
    setIsLoading(true);
    setRetryCount((count) => count + 1);
  };

  return (
    <div className="min-h-screen bg-[#F4F8FC] text-slate-800">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[250px] flex-col bg-[#102E4D] text-white md:flex">
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
                  onClick={() => destination && navigate(destination)}
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
                    <span className="ml-auto text-[10px]">Unavailable</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar bottom */}
        <div className="mt-auto p-5">
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-200 text-[#102E4D]">
                <Users size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold">Admin Panel</p>
                <p className="text-xs text-slate-300">
                  System management
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/admin")}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
          >
            <MapPinned size={17} />
            Switch to User Mode
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="min-h-screen md:ml-[250px]">
        {/* Header */}
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


            <button
              type="button"
              aria-label="Notifications"
              disabled
              title="Notifications are unavailable because no notification destination exists."
              className="relative flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-400"
            >
              <Bell size={19} />
            </button>

            <div className="hidden h-9 w-px bg-slate-200 sm:block" />

            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#DCE9F7] font-bold text-[#102E4D]">
                A
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-slate-800">
                  Admin
                </p>
                <p className="text-xs text-slate-500">
                  Administrator
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Body */}
        <div className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
          {/* Welcome Section */}
          <section className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>


              <h3 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
                Welcome back, Admin!
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                Here&apos;s an overview of your QRoute system.
              </p>
            </div>

          </section>

          {isLoading && (
            <p className="mt-5 text-sm text-slate-600" role="status">
              Loading dashboard data...
            </p>
          )}

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

          {/* Summary Cards */}
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              const value = card.metric
                ? isLoading
                  ? "Loading…"
                  : summary
                    ? summary[card.metric].toLocaleString()
                    : "Unavailable"
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
                      {card.note}
                    </span>
                  </div>
                </article>
              );
            })}
          </section>

          {/* Recent activity */}
          <section className="mt-8 grid grid-cols-1 gap-6">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_14px_rgba(15,23,42,0.035)]">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
                <div>
                  <h4 className="font-bold text-slate-900">
                    Recent activity
                  </h4>
                </div>

                <Clock size={19} className="text-slate-400" />
              </div>

              <div className="px-5 py-5 text-sm text-slate-500 sm:px-6">
                No admin activity data source is configured.
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
