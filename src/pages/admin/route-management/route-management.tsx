import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccountProfile } from "@/components/account/accountProfileStore";
import {
  createAdminRoute,
  deleteAdminRoute,
  getAdminRoutes,
  updateAdminRoute,
  type AdminRouteRecord,
  type AdminRouteUpdatePayload,
} from "@/lib/adminApi";
import {
  getTransitCatalog,
  getTransportOptions,
  pointKey,
  type ExistingPoint,
  type TransportTypeOption,
  type TransportVariantOption,
} from "@/lib/contributions";
import { getAdminNavigationDestination } from "@/pages/admin/adminNavigation";
import { supabase } from "@/lib/supabase";
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
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  LogOut,
} from "lucide-react";

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Route Management", icon: RouteIcon },
  { label: "Post Management", icon: FileText },
  { label: "Reports", icon: Flag },
  { label: "User Management", icon: Users },
  { label: "Settings", icon: Settings },
];

type RouteFormState = "closed" | "create" | "edit";

type RouteModerationStatus = "pending" | "approved" | "rejected";

interface EditableRouteStop {
  kind: "terminal" | "stop";
  id: number;
  name: string;
  kindLabel: string;
  unresolved: boolean;
}

interface RouteFormData {
  types: TransportTypeOption[];
  variants: TransportVariantOption[];
  points: ExistingPoint[];
}

function pointKindLabel(point: ExistingPoint): string {
  if (point.kind === "terminal") return "Terminal";
  return point.stopType === "train_station" ? "Train station" : "Road stop";
}

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

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: "local" });
    localStorage.removeItem("qroute_current_user");
    sessionStorage.removeItem("qroute_current_user");
    navigate("/login", { replace: true });
  };

  const [formState, setFormState] = useState<RouteFormState>("closed");
  const [editingRoute, setEditingRoute] = useState<AdminRouteRecord | null>(
    null,
  );
  const [routeName, setRouteName] = useState("");
  const [transportTypeId, setTransportTypeId] = useState<number | null>(null);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [moderationStatus, setModerationStatus] =
    useState<RouteModerationStatus>("approved");
  const [isActive, setIsActive] = useState(true);
  const [stops, setStops] = useState<EditableRouteStop[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState<RouteFormData | null>(null);
  const [formDataError, setFormDataError] = useState<string | null>(null);
  const [isFormDataLoading, setIsFormDataLoading] = useState(false);

  const [pendingDeleteRoute, setPendingDeleteRoute] =
    useState<AdminRouteRecord | null>(null);
  const [isDeletingRoute, setIsDeletingRoute] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const refreshRoutes = () => {
    setErrorMessage(null);
    setIsLoading(true);
    setRetryCount((count) => count + 1);
  };

  const ensureFormData = async (): Promise<void> => {
    if (formData) return;
    setIsFormDataLoading(true);
    setFormDataError(null);
    try {
      const [options, catalog] = await Promise.all([
        getTransportOptions(),
        getTransitCatalog(),
      ]);
      setFormData({
        types: options.types,
        variants: options.variants,
        points: catalog.points,
      });
    } catch (error: unknown) {
      setFormDataError(
        error instanceof Error
          ? error.message
          : "Unable to load route form options.",
      );
    } finally {
      setIsFormDataLoading(false);
    }
  };

  const openCreateForm = () => {
    setFormState("create");
    setEditingRoute(null);
    setRouteName("");
    setTransportTypeId(null);
    setVariantId(null);
    setModerationStatus("approved");
    setIsActive(true);
    setStops([]);
    setFormError(null);
    void ensureFormData();
  };

  const openEditForm = (route: AdminRouteRecord) => {
    setFormState("edit");
    setEditingRoute(route);
    setRouteName(route.name);
    setTransportTypeId(route.transport_type_id);
    setVariantId(route.transport_variants?.id ?? null);
    setModerationStatus(route.moderation_status);
    setIsActive(route.is_active);
    setStops(
      [...route.route_stops]
        .sort((left, right) => left.stop_order - right.stop_order)
        .map((stop) => {
          if (stop.terminals) {
            return {
              kind: "terminal" as const,
              id: stop.terminals.id,
              name: stop.terminals.name,
              kindLabel: "Terminal",
              unresolved: false,
            };
          }
          if (stop.stops) {
            return {
              kind: "stop" as const,
              id: stop.stops.id,
              name: stop.stops.name,
              kindLabel:
                stop.stops.stop_type === "train_station"
                  ? "Train station"
                  : "Road stop",
              unresolved: false,
            };
          }
          return {
            kind: "terminal" as const,
            id: 0,
            name: "Point unavailable",
            kindLabel: "Point unavailable",
            unresolved: true,
          };
        }),
    );
    setFormError(null);
    void ensureFormData();
  };

  const closeRouteForm = () => {
    setFormState("closed");
    setEditingRoute(null);
    setFormError(null);
  };

  const moveStop = (index: number, direction: -1 | 1) => {
    setStops((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeStop = (index: number) => {
    setStops((current) => current.filter((_, i) => i !== index));
  };

  const addStop = (key: string) => {
    if (!formData || !key) return;
    const point = formData.points.find(
      (candidate) => pointKey(candidate.kind, candidate.id) === key,
    );
    if (!point) return;
    setStops((current) => [
      ...current,
      {
        kind: point.kind,
        id: point.id,
        name: point.name,
        kindLabel: pointKindLabel(point),
        unresolved: false,
      },
    ]);
  };

  const validateRouteForm = (): string | null => {
    const name = routeName.trim();
    if (name.length < 1 || name.length > 180) {
      return "Route name must be between 1 and 180 characters.";
    }
    if (transportTypeId === null) {
      return "Choose a transport type.";
    }
    if (variantId === null) {
      return "Choose a transport variant.";
    }
    if (stops.some((stop) => stop.unresolved)) {
      return "This route has a stop that could not be resolved. Remove it and add a valid stop before saving.";
    }
    if (stops.length < 2 || stops.length > 100) {
      return "A route needs between 2 and 100 ordered stops.";
    }
    return null;
  };

  const handleCreateRoute = async () => {
    if (!userId) {
      setFormError("Please sign in to continue.");
      return;
    }
    const validationError = validateRouteForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      await createAdminRoute(userId, {
        name: routeName.trim(),
        transportTypeId: transportTypeId!,
        variantId: variantId!,
        stops: stops.map((stop) => ({ kind: stop.kind, id: stop.id })),
      });
      closeRouteForm();
      refreshRoutes();
    } catch (error: unknown) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to create the route.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateRoute = async () => {
    if (!editingRoute) return;
    if (!userId) {
      setFormError("Please sign in to continue.");
      return;
    }
    const validationError = validateRouteForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const nextStops = stops.map((stop) => ({
      kind: stop.kind,
      id: stop.id,
    }));
    const stopsChanged =
      nextStops.length !== editingRoute.route_stops.length ||
      editingRoute.route_stops.some((stop, index) => {
        const embedded = stop.terminals
          ? { kind: "terminal" as const, id: stop.terminals.id }
          : stop.stops
            ? { kind: "stop" as const, id: stop.stops.id }
            : null;
        return (
          !embedded ||
          embedded.kind !== nextStops[index].kind ||
          embedded.id !== nextStops[index].id
        );
      });

    const payload: AdminRouteUpdatePayload = {};
    if (routeName.trim() !== editingRoute.name) {
      payload.name = routeName.trim();
    }
    if (transportTypeId !== editingRoute.transport_type_id) {
      payload.transportTypeId = transportTypeId!;
    }
    if (variantId !== editingRoute.transport_variants?.id) {
      payload.variantId = variantId!;
    }
    if (moderationStatus !== editingRoute.moderation_status) {
      payload.moderationStatus = moderationStatus;
    }
    if (isActive !== editingRoute.is_active) {
      payload.isActive = isActive;
    }
    if (stopsChanged) {
      payload.stops = nextStops;
    }

    if (Object.keys(payload).length === 0) {
      closeRouteForm();
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      await updateAdminRoute(userId, editingRoute.id, payload);
      closeRouteForm();
      refreshRoutes();
    } catch (error: unknown) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to update the route.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteDialog = (route: AdminRouteRecord) => {
    setPendingDeleteRoute(route);
    setDeleteError(null);
  };

  const closeDeleteDialog = () => {
    setPendingDeleteRoute(null);
    setDeleteError(null);
  };

  const handleDeleteRoute = async (routeId: number) => {
    if (!userId) {
      setDeleteError("Please sign in to continue.");
      return;
    }
    setIsDeletingRoute(true);
    try {
      await deleteAdminRoute(userId, routeId);
      closeDeleteDialog();
      refreshRoutes();
    } catch (error: unknown) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Unable to delete the route.",
      );
    } finally {
      setIsDeletingRoute(false);
    }
  };

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

  const activeRouteCount = useMemo(
    () =>
      routes.filter(
        (route) =>
          route.is_approved &&
          route.moderation_status === "approved" &&
          route.is_active &&
          !route.is_banned &&
          !route.is_deleted,
      ).length,
    [routes],
  );

  const availableVariants =
    formData?.variants.filter(
      (variant) => variant.transport_type_id === transportTypeId,
    ) ?? [];

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
                  {activeRouteCount}
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

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-slate-900">All Routes</h4>
                <p className="mt-1 text-xs text-slate-500">
                  {filteredRoutes.length} {filteredRoutes.length === 1 ? "route" : "routes"} displayed
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-[#EAF1F8] px-3 py-1.5 text-xs font-semibold text-[#102E4D]">
                  {activeFilter === "All" ? "All transport types" : `${activeFilter} routes`}
                </span>
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#19476D]"
                >
                  <Plus size={16} />
                  Add Route
                </button>
              </div>
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
                              {!route.is_deleted && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditForm(route)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#102E4D] hover:bg-blue-50 hover:text-[#102E4D]"
                                  >
                                    <Pencil size={13} /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openDeleteDialog(route)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                                  >
                                    <Trash2 size={13} /> Delete
                                  </button>
                                </>
                              )}
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
              Routes created here are saved as approved and active. Deleting a
              route hides it from the system while keeping its record.
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

      {/* Create / edit route modal */}
      {formState !== "closed" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
          onClick={closeRouteForm}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="route-form-title"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2
                  id="route-form-title"
                  className="text-xl font-bold text-[#102E4D]"
                >
                  {formState === "create" ? "Add Route" : "Edit Route"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {formState === "create"
                    ? "Create a route with its transport details and ordered stops."
                    : "Update the stored route information and stop sequence."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeRouteForm}
                aria-label="Close dialog"
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            {isFormDataLoading ? (
              <p role="status" className="py-10 text-center text-sm text-slate-500">
                Loading route form options...
              </p>
            ) : !formData ? (
              <div className="text-center">
                <p
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  {formDataError ?? "Unable to load route form options."}
                </p>
                <button
                  type="button"
                  onClick={() => void ensureFormData()}
                  className="mt-4 rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#19476D]"
                >
                  Retry
                </button>
              </div>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (formState === "create") {
                    void handleCreateRoute();
                  } else {
                    void handleUpdateRoute();
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="route-name-input"
                    className="mb-1.5 block text-sm font-semibold text-slate-700"
                  >
                    Route name
                  </label>
                  <input
                    id="route-name-input"
                    type="text"
                    value={routeName}
                    maxLength={180}
                    onChange={(event) => setRouteName(event.target.value)}
                    placeholder="Enter the route name"
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="route-type-select"
                    className="mb-1.5 block text-sm font-semibold text-slate-700"
                  >
                    Transport type
                  </label>
                  <select
                    id="route-type-select"
                    value={transportTypeId ?? ""}
                    onChange={(event) => {
                      setTransportTypeId(
                        event.target.value ? Number(event.target.value) : null,
                      );
                      setVariantId(null);
                    }}
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Choose a transport type</option>
                    {formData.types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="route-variant-select"
                    className="mb-1.5 block text-sm font-semibold text-slate-700"
                  >
                    Transport variant
                  </label>
                  <select
                    id="route-variant-select"
                    value={variantId ?? ""}
                    onChange={(event) => {
                      setVariantId(
                        event.target.value ? Number(event.target.value) : null,
                      );
                    }}
                    disabled={!transportTypeId}
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">Choose a transport variant</option>
                    {availableVariants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.name} ({variant.code})
                      </option>
                    ))}
                  </select>
                </div>

                {formState === "edit" && (
                  <div>
                    <label
                      htmlFor="route-status-select"
                      className="mb-1.5 block text-sm font-semibold text-slate-700"
                    >
                      Moderation status
                    </label>
                    <select
                      id="route-status-select"
                      value={moderationStatus}
                      onChange={(event) =>
                        setModerationStatus(
                          event.target.value as RouteModerationStatus,
                        )
                      }
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                    <p className="mt-1.5 text-xs text-slate-400">
                      Saving a status records you as the moderator and
                      re-applies route approval.
                    </p>
                  </div>
                )}

                <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(event) => setIsActive(event.target.checked)}
                    className="h-4 w-4 accent-[#102E4D]"
                  />
                  Route is active
                </label>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">
                      Ordered stops
                    </span>
                    <span className="text-xs text-slate-400">
                      {stops.length} of 100
                    </span>
                  </div>

                  {stops.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                      Add at least two ordered stops to define the route.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {stops.map((stop, index) => (
                        <li
                          key={`${stop.kind}-${stop.id}-${index}`}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                            stop.unresolved
                              ? "border-red-200 bg-red-50"
                              : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EAF1F8] text-xs font-semibold text-[#102E4D]">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`truncate font-medium ${
                                stop.unresolved
                                  ? "text-red-700"
                                  : "text-slate-800"
                              }`}
                            >
                              {stop.name}
                            </p>
                            <p className="text-xs text-slate-400">
                              {stop.kindLabel}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Move ${stop.name} up`}
                              disabled={index === 0}
                              onClick={() => moveStop(index, -1)}
                              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <ChevronUp size={15} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${stop.name} down`}
                              disabled={index === stops.length - 1}
                              onClick={() => moveStop(index, 1)}
                              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <ChevronDown size={15} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove ${stop.name}`}
                              onClick={() => removeStop(index)}
                              className="rounded-md p-1.5 text-slate-500 transition hover:bg-red-100 hover:text-red-700"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <select
                    value=""
                    onChange={(event) => addStop(event.target.value)}
                    aria-label="Add a stop to the route"
                    className="mt-3 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Add a stop…</option>
                    {formData.points.map((point) => (
                      <option
                        key={pointKey(point.kind, point.id)}
                        value={pointKey(point.kind, point.id)}
                      >
                        {pointKindLabel(point)} · {point.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-slate-400">
                    Only approved terminals and stops can be added.
                  </p>
                </div>

                {formError && (
                  <p
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  >
                    {formError}
                  </p>
                )}

                <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={closeRouteForm}
                    className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#19476D] disabled:opacity-50"
                  >
                    {isSaving
                      ? "Saving..."
                      : formState === "create"
                        ? "Create Route"
                        : "Save Changes"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      {/* Delete route confirmation */}
      {pendingDeleteRoute && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
          onClick={closeDeleteDialog}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="route-delete-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <Trash2 size={23} />
            </div>

            <h3
              id="route-delete-title"
              className="mt-4 text-xl font-bold text-[#102E4D]"
            >
              Delete this route?
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              {`Are you sure you want to delete "${pendingDeleteRoute.name}"? The route will be hidden from the system while its record is kept.`}
            </p>

            {deleteError && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {deleteError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteDialog}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingRoute}
                onClick={() => void handleDeleteRoute(pendingDeleteRoute.id)}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {isDeletingRoute ? "Deleting..." : "Delete Route"}
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
