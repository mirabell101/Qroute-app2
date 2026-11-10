import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccountProfile } from "@/components/account/accountProfileStore";
import {
  getAdminRoutes,
  type AdminRouteRecord,
} from "@/lib/adminApi";
import { getAdminNavigationDestination } from "@/pages/admin/adminNavigation";
import {
  LayoutDashboard,
  Route as RouteIcon,
  FileText,
  Flag,
  Users,
  Settings,
  Bell,
  Search,
  UserRound,
  Eye,
  X,
  Bus,
  TrainFront,
  CarFront,
} from "lucide-react";

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Route Management", icon: RouteIcon },
  { label: "Post Management", icon: FileText },
  { label: "Reports", icon: Flag },
  { label: "User Management", icon: Users },
  { label: "Settings", icon: Settings },
];

function routeTransportType(route: AdminRouteRecord): string {
  return (
    route.transport_types?.name ??
    route.transport_variants?.name ??
    "Transport type unavailable"
  );
}

function routeStatus(route: AdminRouteRecord): string {
  if (route.is_deleted) return "Deleted";
  if (route.is_banned) return "Banned";
  if (!route.is_active) return "Inactive";
  return route.moderation_status;
}

export default function RouteManagement() {
  const navigate = useNavigate();
  const { userId } = useAccountProfile();
  const [routes, setRoutes] = useState<AdminRouteRecord[]>([]);
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<AdminRouteRecord | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;

    void getAdminRoutes(userId ?? "")
      .then((data) => {
        if (active) {
          setRoutes(data);
          setErrorMessage(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setRoutes([]);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load routes.",
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

  const filters = useMemo(
    () => [
      "All",
      ...new Set(
        routes
          .map(
            (route) =>
              route.transport_types?.name ??
              route.transport_variants?.name ??
              "",
          )
          .filter(Boolean),
      ),
    ],
    [routes],
  );

  const filteredRoutes = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return routes.filter((route) => {
      const transportType = routeTransportType(route);
      const stopNames = route.route_stops
        .map((stop) => stop.terminals?.name ?? stop.stops?.name ?? "")
        .join(" ");
      const matchesFilter =
        activeFilter === "All" || transportType === activeFilter;
      const matchesSearch = `${route.name} ${transportType} ${stopNames}`
        .toLowerCase()
        .includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [routes, activeFilter, searchTerm]);

  const transportIcon = (type: string) => {
    const normalized = type.toLowerCase();
    if (normalized.includes("bus")) return <Bus size={16} />;
    if (normalized.includes("train")) return <TrainFront size={16} />;
    if (normalized.includes("jeep")) return <CarFront size={16} />;
    return <RouteIcon size={16} />;
  };

  return (
    <div className="min-h-screen bg-[#F4F8FC] text-slate-800">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[250px] flex-col bg-[#102E4D] text-white md:flex">
        <div className="flex h-[105px] items-center border-b border-white/10 px-7">
          <button
            type="button"
            onClick={() => navigate("/admin/dashboard")}
            className="text-left"
            aria-label="QRoute dashboard"
          >
            <img
                src="/White%20Qroute%20Logo.png"
                alt="QRoute Logo"
                className="h-auto w-[150px] object-contain"
              />
            <p className="mt-0.5 text-xs tracking-wide text-blue-200">ADMINISTRATION</p>
          </button>
        </div>

        <div className="px-5 pt-8">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[2px] text-slate-400">
            Main Menu
          </p>
          <nav className="space-y-1.5">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active = item.label === "Route Management";
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
                getAdminNavigationDestination("Switch to User Mode");
              if (destination) navigate(destination);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
          >
            <UserRound size={17} />
            Switch to User Mode
          </button>
        </div>
      </aside>

      <main className="min-h-screen md:ml-[250px]">
        <header className="sticky top-0 z-20 flex min-h-[86px] items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur sm:px-8 lg:px-10">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[#102E4D] sm:text-2xl">
              Route Management
            </h2>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Review route and ordered-stop records
            </p>
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
                <p className="text-sm font-semibold text-slate-800">Admin</p>
                <p className="text-xs text-slate-500">Administrator</p>
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
          <section className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>

              <h3 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
                Transport Routes
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Review routes, transport types, and their ordered stops.
              </p>
            </div>
            <div className="flex w-fit items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <RouteIcon size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-500">Active Transit Routes</p>
                <p className="text-xl font-bold text-[#102E4D]">
                  {routes.length}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.035)] sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-h-11 flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 lg:max-w-[520px]">
                <Search size={18} className="shrink-0 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search route, stop, or transport type..."
                  aria-label="Search routes"
                  className="w-full border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
                {searchTerm && (
                  <button type="button" onClick={() => setSearchTerm("")} aria-label="Clear search">
                    <X size={16} className="text-slate-400 hover:text-slate-700" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {filters.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                      activeFilter === filter
                        ? "bg-[#102E4D] text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {filter}
                    {filter === "All" && (
                      <span className={`ml-2 text-xs ${activeFilter === filter ? "text-blue-100" : "text-slate-400"}`}>
                        {routes.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900">All Routes</h4>
                <p className="mt-1 text-xs text-slate-500">
                  {filteredRoutes.length} {filteredRoutes.length === 1 ? "route" : "routes"} displayed
                </p>
              </div>
              <span className="rounded-full bg-[#EAF1F8] px-3 py-1.5 text-xs font-semibold text-[#102E4D]">
                {activeFilter === "All" ? "All transport types" : `${activeFilter} routes`}
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead className="bg-[#EAF1F8] text-slate-600">
                    <tr>
                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide">Type</th>
                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide">Route Name</th>
                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide">Ordered Stops</th>
                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide">Status</th>
                      <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRoutes.length ? (
                      filteredRoutes.map((route) => (
                        <tr key={route.id} className="transition hover:bg-slate-50">
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                              {transportIcon(routeTransportType(route))}
                              {routeTransportType(route)}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-semibold text-slate-800">{route.name}</td>
                          <td className="px-5 py-4 text-slate-600">
                            {route.route_stops
                              .map(
                                (stop) =>
                                  stop.terminals?.name ??
                                  stop.stops?.name ??
                                  "Point unavailable",
                              )
                              .join(" → ") || "No stops recorded"}
                          </td>
                          <td className="px-5 py-4 text-slate-600">
                            {routeStatus(route)}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedRoute(route)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#EAF1F8] px-3 py-2 text-xs font-semibold text-[#102E4D] transition hover:bg-[#DCE9F7]"
                              >
                                <Eye size={13} /> View
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-16 text-center">
                          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF1F8] text-[#102E4D]">
                            <RouteIcon size={25} />
                          </div>
                          <p className="mt-4 font-semibold text-slate-800">
                            {isLoading
                              ? "Loading routes..."
                              : errorMessage
                                ? "Routes could not be loaded"
                                : routes.length === 0
                                  ? "No routes are available"
                                  : "No matching routes found"}
                          </p>
                          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                            {errorMessage ??
                              (isLoading
                                ? "Loading route records from the database."
                                : routes.length === 0
                                  ? "The database returned no route records."
                                  : "Try another search term or transport filter.")}
                          </p>
                          {errorMessage && (
                            <button
                              type="button"
                              onClick={() => {
                                setErrorMessage(null);
                                setIsLoading(true);
                                setRetryCount((count) => count + 1);
                              }}
                              className="mt-4 rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#19476D]"
                            >
                              Retry
                            </button>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-400">
              Route add, edit, and delete operations are unavailable in this
              schema-verified scope.
            </p>
          </section>

          <footer className="pb-2 pt-8 text-center text-xs text-slate-400">
            QRoute Admin Panel · Route Management
          </footer>
        </div>
      </main>

      {selectedRoute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="route-details-title"
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2
                  id="route-details-title"
                  className="text-xl font-bold text-[#102E4D]"
                >
                  Route Details
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Review the stored route information and stop sequence.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRoute(null)}
                aria-label="Close dialog"
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-4">
              <Detail label="Route name" value={selectedRoute.name} />
              <Detail
                label="Transport type"
                value={routeTransportType(selectedRoute)}
              />
              <Detail
                label="Transport variant"
                value={
                  selectedRoute.transport_variants?.code ??
                  "Variant unavailable"
                }
              />
              <Detail label="Status" value={routeStatus(selectedRoute)} />
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  Ordered stops
                </h3>
                {selectedRoute.route_stops.length ? (
                  <ol className="space-y-2">
                    {selectedRoute.route_stops.map((stop) => (
                      <li
                        key={`${stop.route_id}-${stop.stop_order}`}
                        className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EAF1F8] text-xs font-semibold text-[#102E4D]">
                          {stop.stop_order}
                        </span>
                        <span>
                          {stop.terminals?.name ??
                            stop.stops?.name ??
                            "Point unavailable"}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-slate-500">
                    No stops are associated with this route.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedRoute(null)}
                className="mt-3 w-full rounded-lg bg-[#102E4D] px-4 py-3 text-sm font-semibold text-white hover:bg-[#19476D]"
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}
