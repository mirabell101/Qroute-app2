import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Route as RouteIcon,
  FileText,
  Flag,
  Users,
  Settings,
  Bell,
  Search,
  Plus,
  UserRound,
  Pencil,
  Eye,
  X,
  Bus,
  TrainFront,
  CarFront,
  MapPin,
  ArrowLeftRight,
} from "lucide-react";

type TransportType = "Jeep" | "Bus" | "Train";
type TransportRoute = {
  id: number;
  type: TransportType;
  name: string;
  origin: string;
  destination: string;
  fare: number;
};

const filters = ["All", "Jeep", "Bus", "Train"] as const;
type Filter = (typeof filters)[number];

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/admin/dashboard" },
  { label: "Route Management", icon: RouteIcon, path: "/admin/routes" },
  { label: "Post Management", icon: FileText, path: "/admin/post-management" },
  { label: "Reports", icon: Flag, path: "/admin/reports" },
  { label: "User Management", icon: Users, path: "/admin/users" },
  { label: "Settings", icon: Settings, path: "/admin/settings" },
];

export default function RouteManagement() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [activeFilter, setActiveFilter] = useState<Filter>("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [modalMode, setModalMode] = useState<"add" | "edit" | "view" | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<TransportRoute | null>(null);
  const [form, setForm] = useState({
    type: "Jeep" as TransportType,
    name: "",
    origin: "",
    destination: "",
    fare: "",
  });

  const filteredRoutes = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return routes.filter((route) => {
      const matchesFilter = activeFilter === "All" || route.type === activeFilter;
      const matchesSearch =
        !query ||
        route.name.toLowerCase().includes(query) ||
        route.origin.toLowerCase().includes(query) ||
        route.destination.toLowerCase().includes(query) ||
        route.type.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [routes, activeFilter, searchTerm]);

  const resetForm = () =>
    setForm({ type: "Jeep", name: "", origin: "", destination: "", fare: "" });

  const openAddModal = () => {
    setSelectedRoute(null);
    resetForm();
    setModalMode("add");
  };

  const openEditModal = (route: TransportRoute) => {
    setSelectedRoute(route);
    setForm({
      type: route.type,
      name: route.name,
      origin: route.origin,
      destination: route.destination,
      fare: String(route.fare),
    });
    setModalMode("edit");
  };

  const closeModal = () => {
    setModalMode(null);
    setSelectedRoute(null);
  };

  const saveRoute = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fare = Number(form.fare);
    if (
      !form.name.trim() ||
      !form.origin.trim() ||
      !form.destination.trim() ||
      form.fare.trim() === "" ||
      !Number.isFinite(fare) ||
      fare < 0
    ) return;

    const values = {
      type: form.type,
      name: form.name.trim(),
      origin: form.origin.trim(),
      destination: form.destination.trim(),
      fare,
    };

    if (modalMode === "edit" && selectedRoute) {
      setRoutes((current) =>
        current.map((route) =>
          route.id === selectedRoute.id ? { ...route, ...values } : route
        )
      );
    } else {
      setRoutes((current) => [...current, { id: Date.now(), ...values }]);
    }
    closeModal();
  };

  const transportIcon = (type: TransportType) => {
    if (type === "Jeep") return <CarFront size={16} />;
    if (type === "Bus") return <Bus size={16} />;
    return <TrainFront size={16} />;
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
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    if (item.path !== "/admin/routes") navigate(item.path);
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
                      12
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
            onClick={() => navigate("/")}
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
              Manage transport routes and information
            </p>
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
                Add, review, and maintain the transport routes available in QRoute.
              </p>
            </div>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#102E4D] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#19476D]"
            >
              <Plus size={17} />
              Add Route
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.035)] sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-h-11 flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 lg:max-w-[520px]">
                <Search size={18} className="shrink-0 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search route, origin, or destination..."
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
                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide">Origin to Destination</th>
                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide">Fare</th>
                      <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRoutes.length ? (
                      filteredRoutes.map((route) => (
                        <tr key={route.id} className="transition hover:bg-slate-50">
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                              {transportIcon(route.type)}
                              {route.type}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-semibold text-slate-800">{route.name}</td>
                          <td className="px-5 py-4 text-slate-600">
                            <span className="inline-flex items-center gap-2">
                              <MapPin size={15} className="text-slate-400" />
                              {route.origin}
                              <ArrowLeftRight size={14} className="text-slate-400" />
                              {route.destination}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-medium text-slate-700">₱{route.fare.toFixed(2)}</td>
                          <td className="px-5 py-4">
                            <div className="flex justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditModal(route)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-[#102E4D] hover:text-[#102E4D]"
                              >
                                <Pencil size={13} /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => { setSelectedRoute(route); setModalMode("view"); }}
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
                            {searchTerm || activeFilter !== "All" ? "No matching routes found" : "No routes added yet"}
                          </p>
                          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                            {searchTerm || activeFilter !== "All"
                              ? "Try another search term or choose a different transport filter."
                              : "Add a transport route to start building the QRoute route directory."}
                          </p>
                          {!searchTerm && activeFilter === "All" && (
                            <button type="button" onClick={openAddModal} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#19476D]">
                              <Plus size={16} /> Add your first route
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
              Route information shown here is managed by the admin.
            </p>
          </section>

          <footer className="pb-2 pt-8 text-center text-xs text-slate-400">
            QRoute Admin Panel · Route Management
          </footer>
        </div>
      </main>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#102E4D]">
                  {modalMode === "add" ? "Add Route" : modalMode === "edit" ? "Edit Route" : "Route Details"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {modalMode === "view" ? "Review the route information below." : "Enter the transport route details."}
                </p>
              </div>
              <button type="button" onClick={closeModal} aria-label="Close dialog" className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100">
                <X size={19} />
              </button>
            </div>

            {modalMode === "view" && selectedRoute ? (
              <div className="space-y-4">
                <Detail label="Transport type" value={selectedRoute.type} />
                <Detail label="Route name" value={selectedRoute.name} />
                <Detail label="Origin" value={selectedRoute.origin} />
                <Detail label="Destination" value={selectedRoute.destination} />
                <Detail label="Fare" value={`₱${selectedRoute.fare.toFixed(2)}`} />
                <button type="button" onClick={closeModal} className="mt-3 w-full rounded-lg bg-[#102E4D] px-4 py-3 text-sm font-semibold text-white hover:bg-[#19476D]">
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={saveRoute} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Transport Type</label>
                  <select
                    value={form.type}
                    onChange={(event) => setForm({ ...form, type: event.target.value as TransportType })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="Jeep">Jeep</option>
                    <option value="Bus">Bus</option>
                    <option value="Train">Train</option>
                  </select>
                </div>
                <Field label="Route Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="e.g. Route 1" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Origin" value={form.origin} onChange={(value) => setForm({ ...form, origin: value })} placeholder="Starting point" />
                  <Field label="Destination" value={form.destination} onChange={(value) => setForm({ ...form, destination: value })} placeholder="End point" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Fare (₱)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={form.fare}
                    onChange={(event) => setForm({ ...form, fare: event.target.value })}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
                  <button type="button" onClick={closeModal} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    Cancel
                  </button>
                  <button type="submit" className="rounded-lg bg-[#102E4D] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#19476D]">
                    {modalMode === "edit" ? "Save Changes" : "Add Route"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <input
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
      />
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
