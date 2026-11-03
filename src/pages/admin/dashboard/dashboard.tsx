import { useNavigate } from "react-router-dom";
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

const summaryCards = [
  {
    title: "Registered Viewers",
    value: "1,248",
    note: "Total registered accounts",
    icon: Users,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-700",
  },
  {
    title: "Pending Reports",
    value: "12",
    note: "Reports awaiting review",
    icon: Flag,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-700",
  },
  {
    title: "Transport Routes",
    value: "86",
    note: "Routes in the system",
    icon: Route,
    iconBg: "bg-green-100",
    iconColor: "text-green-700",
  },
  {
    title: "Active Posts",
    value: "324",
    note: "Community posts",
    icon: FileText,
    iconBg: "bg-purple-100",
    iconColor: "text-purple-700",
  },
];

const accessDate = new Date();

const activities = [
  {
    title: "Admin accessed the dashboard",
    description: "Administrator account accessed the dashboard.",
    time: accessDate.toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    date: accessDate.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
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

              return (
                <button
                  key={item.label}
                  type="button"
                 onClick={() => {
                      switch (item.label) {
                        case "Dashboard":
                          navigate("/admin/dashboard");
                          break;
                        case "Route Management":
                          navigate("/admin/routes");
                          break;
                        case "Post Management":
                          navigate("/admin/post-management");
                          break;
                        case "Reports":
                          navigate("/admin/reports");
                          break;
                        case "User Management":
                          navigate("/admin/users");
                          break;
                        case "Settings":
                          navigate("/admin/settings");
                          break;
                      }
                    }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                    item.active
                      ? "bg-[#CFD5DB] font-semibold text-[#102E4D]"
                      : "text-slate-200 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon size={19} strokeWidth={1.8} />
                  <span>{item.label}</span>

                  {item.label === "Reports" && (
                    <span className="ml-auto rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      12
                    </span>
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
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white transition hover:bg-slate-100"
            >
              <Bell size={19} className="text-slate-600" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
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

          {/* Summary Cards */}
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => {
              const Icon = card.icon;

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
                        {card.value}
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

          {/* Admin Attendance */}
          <section className="mt-8 grid grid-cols-1 gap-6">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_14px_rgba(15,23,42,0.035)]">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
                <div>
                  <h4 className="font-bold text-slate-900">
                    Admin Attendance
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Recent dashboard access history
                  </p>
                </div>

                <Clock size={19} className="text-slate-400" />
              </div>

              <div className="divide-y divide-slate-100 px-5 sm:px-6">
{activities.map((activity) => (
  <div
    key={activity.title}
    className="flex items-center gap-4 py-5"
  >
    {/* Admin Avatar */}
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 font-bold text-blue-700">
      A
    </div>

    {/* Admin Details - Left Side */}
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-slate-800">
        Admin
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        {activity.description}
      </p>
    </div>

    {/* Date and Time - Right Side */}
    <div className="flex w-36 shrink-0 flex-col items-end text-right">
      <p className="whitespace-nowrap text-xs font-medium text-slate-600">
        {activity.time}
      </p>
      <p className="mt-1 whitespace-nowrap text-xs text-slate-400">
        {activity.date}
      </p>
    </div>
  </div>
))}
              </div>


            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
