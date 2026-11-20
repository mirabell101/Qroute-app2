import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";
import AccountAvatar from "@/components/account/AccountAvatar";
import AdminNotificationBell from "@/components/admin/AdminNotificationBell";
import { RouteManagementMap } from "@/components/map/RouteManagementMap";
import type { RouteManagementMapPoint } from "@/components/map/RouteManagementMap";
import { useAccountProfile } from "@/components/account/accountProfileStore";
import {
  archiveRouteManagementRecord,
  createAdminTransportType,
  getRouteManagementData,
  moderateRouteManagementRecord,
  updateAdminTransportType,
  updateRouteManagementRecord,
  type AdminRouteManagementData,
  type AdminRouteRecord,
  type AdminTransitPointRecord,
  type AdminTransportTypeRecord,
  type RouteManagementEntityType,
} from "@/lib/adminApi";
import {
  getTransitCatalog,
  getTransportOptions,
  pointKey,
  type ExistingPoint,
  type TransportVariantOption,
} from "@/lib/contributions";
import { getUserRole } from "@/lib/authSession";
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
  UserRound,
  Eye,
  X,
  Bus,
  TrainFront,
  CarFront,
  Pencil,
  Archive,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Check,
  Ban,
  Plus,
} from "lucide-react";

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Route Management", icon: RouteIcon },
  { label: "Post Management", icon: FileText },
  { label: "Reports", icon: Flag },
  { label: "User Management", icon: Users },
  { label: "Settings", icon: Settings },
];

const ROUTES_PER_PAGE = 10;
const TABS = ["All", "Stops", "Routes", "Terminals", "Transport Types"] as const;
const STATUSES = ["All current records", "Pending", "Approved", "Rejected", "Inactive", "Banned", "Archived"];

type ManagementTab = (typeof TABS)[number];
type ManagementEntity = RouteManagementEntityType | "transport_type";
type RecordData = AdminRouteRecord | AdminTransitPointRecord | AdminTransportTypeRecord;

interface ManagementRow {
  key: string;
  entityType: ManagementEntity;
  id: number;
  name: string;
  transportTypeId: number | null;
  transportTypeName: string;
  status: string;
  moderationStatus: "pending" | "approved" | "rejected" | null;
  isActive: boolean;
  isBanned: boolean;
  isDeleted: boolean;
  record: RecordData;
}

interface EditableRouteStop {
  kind: "terminal" | "stop";
  id: number;
  name: string;
  kindLabel: string;
  unresolved: boolean;
}

interface EditorState {
  entityType: ManagementEntity;
  id: number | null;
  name: string;
  color: string;
  transportTypeId: number | null;
  variantId: number | null;
  isActive: boolean;
  latitude: string;
  longitude: string;
  description: string;
  stopType: "road_stop" | "train_station";
  stops: EditableRouteStop[];
}

function isRouteRecord(record: RecordData): record is AdminRouteRecord {
  return "route_stops" in record;
}

function isTransportTypeRecord(
  record: RecordData,
): record is AdminTransportTypeRecord {
  return !("route_stops" in record) && !("latitude" in record);
}

function pointKindLabel(point: ExistingPoint): string {
  if (point.kind === "terminal") return "Terminal";
  return point.stopType === "train_station" ? "Train station" : "Road stop";
}

function recordStatus(record: AdminRouteRecord | AdminTransitPointRecord): string {
  if (record.is_deleted) return "Archived";
  if (record.is_banned) return "Banned";
  if (record.moderation_status === "pending") return "Pending";
  if (record.moderation_status === "rejected") return "Rejected";
  if (!record.is_active) return "Inactive";
  return "Approved";
}

function statusClass(status: string): string {
  switch (status) {
    case "Approved":
      return "bg-green-100 text-green-700";
    case "Pending":
      return "bg-amber-100 text-amber-700";
    case "Rejected":
      return "bg-red-100 text-red-700";
    case "Banned":
      return "bg-red-100 text-red-800";
    case "Archived":
      return "bg-slate-200 text-slate-500";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function transportIcon(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes("bus")) return <Bus size={16} />;
  if (normalized.includes("train")) return <TrainFront size={16} />;
  if (normalized.includes("jeep")) return <CarFront size={16} />;
  return <RouteIcon size={16} />;
}

function routeStopsSummary(route: AdminRouteRecord): string {
  return route.route_stops
    .map((stop) => stop.terminals?.name ?? stop.stops?.name ?? "Point unavailable")
    .join(" → ");
}

function routeMapPoints(route: AdminRouteRecord): RouteManagementMapPoint[] {
  return route.route_stops.flatMap((routeStop) => {
    if (routeStop.terminals) {
      return [{
        key: `route-${route.id}-terminal-${routeStop.stop_order}`,
        name: routeStop.terminals.name,
        kind: "terminal" as const,
        latitude: routeStop.terminals.latitude,
        longitude: routeStop.terminals.longitude,
      }];
    }
    if (routeStop.stops) {
      return [{
        key: `route-${route.id}-stop-${routeStop.stop_order}`,
        name: routeStop.stops.name,
        kind: "stop" as const,
        stopType: routeStop.stops.stop_type,
        latitude: routeStop.stops.latitude,
        longitude: routeStop.stops.longitude,
      }];
    }
    return [];
  });
}

function recordMapPoints(row: ManagementRow): RouteManagementMapPoint[] {
  const record = row.record;
  if (isRouteRecord(record)) return routeMapPoints(record);
  if (row.entityType === "transport_type" || isTransportTypeRecord(record)) return [];
  return [{
    key: `${row.entityType}-${record.id}`,
    name: record.name,
    kind: row.entityType === "terminal" ? "terminal" : "stop",
    stopType: record.stop_type,
    latitude: record.latitude,
    longitude: record.longitude,
  }];
}

function editorMapPoints(
  editor: EditorState,
  data: AdminRouteManagementData,
  availablePoints: ExistingPoint[],
): RouteManagementMapPoint[] {
  if (editor.entityType === "route") {
    const route = editor.id === null
      ? undefined
      : data.routes.find((record) => record.id === editor.id);
    return editor.stops.flatMap((selectedStop, index) => {
      const catalogPoint = availablePoints.find(
        (point) =>
          point.kind === selectedStop.kind && point.id === selectedStop.id,
      );
      if (catalogPoint) {
        return [{
          key: `route-editor-${index}-${selectedStop.kind}-${selectedStop.id}`,
          name: catalogPoint.name,
          kind: catalogPoint.kind,
          stopType: catalogPoint.stopType === "train_station"
            ? "train_station" as const
            : null,
          latitude: catalogPoint.latitude,
          longitude: catalogPoint.longitude,
        }];
      }

      const routeStop = route?.route_stops.find((record) =>
        selectedStop.kind === "terminal"
          ? record.terminals?.id === selectedStop.id
          : record.stops?.id === selectedStop.id,
      );
      if (routeStop?.terminals) {
        return [{
          key: `route-editor-${index}-terminal-${routeStop.terminals.id}`,
          name: routeStop.terminals.name,
          kind: "terminal" as const,
          latitude: routeStop.terminals.latitude,
          longitude: routeStop.terminals.longitude,
        }];
      }
      if (routeStop?.stops) {
        return [{
          key: `route-editor-${index}-stop-${routeStop.stops.id}`,
          name: routeStop.stops.name,
          kind: "stop" as const,
          stopType: routeStop.stops.stop_type,
          latitude: routeStop.stops.latitude,
          longitude: routeStop.stops.longitude,
        }];
      }
      return [];
    });
  }

  if (editor.entityType !== "stop" && editor.entityType !== "terminal") return [];
  const record = editor.entityType === "stop"
    ? data.stops.find((point) => point.id === editor.id)
    : data.terminals.find((point) => point.id === editor.id);
  if (!record) return [];
  return [{
    key: `${editor.entityType}-${record.id}`,
    name: record.name,
    kind: editor.entityType,
    stopType: record.stop_type,
    latitude: record.latitude,
    longitude: record.longitude,
  }];
}

function createEditorState(row: ManagementRow): EditorState {
  const base: EditorState = {
    entityType: row.entityType,
    id: row.id,
    name: row.name,
    color: "#123456",
    transportTypeId: null,
    variantId: null,
    isActive: row.isActive,
    latitude: "",
    longitude: "",
    description: "",
    stopType: "road_stop",
    stops: [],
  };

  if (isRouteRecord(row.record)) {
    return {
      ...base,
      transportTypeId: row.record.transport_type_id,
      variantId: row.record.transport_variants?.id ?? null,
      stops: row.record.route_stops.map((stop) => {
        if (stop.terminals) {
          return {
            kind: "terminal",
            id: stop.terminals.id,
            name: stop.terminals.name,
            kindLabel: "Terminal",
            unresolved: false,
          };
        }
        if (stop.stops) {
          return {
            kind: "stop",
            id: stop.stops.id,
            name: stop.stops.name,
            kindLabel:
              stop.stops.stop_type === "train_station" ? "Train station" : "Road stop",
            unresolved: false,
          };
        }
        return {
          kind: "terminal",
          id: 0,
          name: "Point unavailable",
          kindLabel: "Point unavailable",
          unresolved: true,
        };
      }),
    };
  }

  if (isTransportTypeRecord(row.record)) {
    return { ...base, color: row.record.color };
  }

  return {
    ...base,
    transportTypeId: row.record.transport_type_id,
    latitude: String(row.record.latitude),
    longitude: String(row.record.longitude),
    description: row.record.description ?? "",
    stopType: row.record.stop_type ?? "road_stop",
  };
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[65%] text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}

export default function RouteManagement() {
  const navigate = useNavigate();
  const { userId, account } = useAccountProfile();
  const [data, setData] = useState<AdminRouteManagementData>({
    routes: [],
    stops: [],
    terminals: [],
    transportTypes: [],
  });
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "moderator" | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [activeTab, setActiveTab] = useState<ManagementTab>("All");
  const [statusFilter, setStatusFilter] = useState("All current records");
  const [transportTypeFilter, setTransportTypeFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<ManagementRow | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isEditorLoading, setIsEditorLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [variants, setVariants] = useState<TransportVariantOption[]>([]);
  const [availablePoints, setAvailablePoints] = useState<ExistingPoint[]>([]);
  const [pointToAdd, setPointToAdd] = useState("");

  const isAdmin = role === "admin";
  const accountName =
    account?.displayName?.trim() ||
    account?.username?.trim() ||
    (account?.email ? account.email.split("@")[0] : null) ||
    (isAdmin ? "Administrator" : "Moderator");

  useEffect(() => {
    let active = true;
    setRole(null);
    setRoleError(null);
    if (!userId) {
      setDataOwnerId(null);
      setData({ routes: [], stops: [], terminals: [], transportTypes: [] });
      setRoleError("Please sign in to continue.");
      return;
    }

    void getUserRole(userId)
      .then((currentRole) => {
        if (active) {
          setRole(currentRole === "admin" || currentRole === "moderator" ? currentRole : null);
          setRoleError(
            currentRole === "admin" || currentRole === "moderator"
              ? null
              : "Route Management access could not be verified.",
          );
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setRole(null);
          setRoleError(error instanceof Error ? error.message : "Unable to verify your role.");
        }
      });

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    let active = true;
    setDataOwnerId(null);
    setData({ routes: [], stops: [], terminals: [], transportTypes: [] });
    setErrorMessage(null);
    if (!userId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    void getRouteManagementData(userId)
      .then((records) => {
        if (active) {
          setData(records);
          setDataOwnerId(userId);
          setErrorMessage(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setDataOwnerId(null);
          setData({ routes: [], stops: [], terminals: [], transportTypes: [] });
          setErrorMessage(error instanceof Error ? error.message : "Unable to load records.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId, retryCount]);

  const refreshData = () => {
    setIsLoading(true);
    setRetryCount((count) => count + 1);
  };

  const rows = useMemo<ManagementRow[]>(() => {
    if (!userId || dataOwnerId !== userId) return [];
    const typeNames = new Map(data.transportTypes.map((type) => [type.id, type.name]));
    const routeRows: ManagementRow[] = data.routes.map((record) => ({
      key: `route-${record.id}`,
      entityType: "route",
      id: record.id,
      name: record.name,
      transportTypeId: record.transport_type_id,
      transportTypeName: record.transport_types?.name ?? typeNames.get(record.transport_type_id) ?? "Unavailable",
      status: recordStatus(record),
      moderationStatus: record.moderation_status,
      isActive: record.is_active === true,
      isBanned: record.is_banned === true,
      isDeleted: record.is_deleted === true,
      record,
    }));
    const stopRows: ManagementRow[] = data.stops.map((record) => ({
      key: `stop-${record.id}`,
      entityType: "stop",
      id: record.id,
      name: record.name,
      transportTypeId: record.transport_type_id,
      transportTypeName: record.transport_types?.name ??
        (record.transport_type_id === null ? "Unassigned" : typeNames.get(record.transport_type_id) ?? "Unavailable"),
      status: recordStatus(record),
      moderationStatus: record.moderation_status,
      isActive: record.is_active === true,
      isBanned: record.is_banned === true,
      isDeleted: record.is_deleted === true,
      record,
    }));
    const terminalRows: ManagementRow[] = data.terminals.map((record) => ({
      key: `terminal-${record.id}`,
      entityType: "terminal",
      id: record.id,
      name: record.name,
      transportTypeId: record.transport_type_id,
      transportTypeName: record.transport_types?.name ??
        (record.transport_type_id === null ? "Unassigned" : typeNames.get(record.transport_type_id) ?? "Unavailable"),
      status: recordStatus(record),
      moderationStatus: record.moderation_status,
      isActive: record.is_active,
      isBanned: record.is_banned === true,
      isDeleted: record.is_deleted,
      record,
    }));
    const typeRows: ManagementRow[] = data.transportTypes.map((record) => ({
      key: `transport_type-${record.id}`,
      entityType: "transport_type",
      id: record.id,
      name: record.name,
      transportTypeId: record.id,
      transportTypeName: record.name,
      status: "Managed",
      moderationStatus: null,
      isActive: true,
      isBanned: false,
      isDeleted: false,
      record,
    }));
    return [...routeRows, ...stopRows, ...terminalRows, ...typeRows];
  }, [data, dataOwnerId, userId]);

  const editorPoints = editor
    ? editorMapPoints(editor, data, availablePoints)
    : [];
  const editorMapPosition =
    editor && (editor.entityType === "stop" || editor.entityType === "terminal")
      ? [Number(editor.latitude), Number(editor.longitude)] as [number, number]
      : null;

  const scopedRows = useMemo(() => {
    const tabRows = activeTab === "All"
      ? rows
      : activeTab === "Transport Types"
        ? rows.filter((row) => row.entityType === "transport_type")
        : rows.filter((row) => row.entityType.toLowerCase() === activeTab.slice(0, -1).toLowerCase());
    const query = searchTerm.trim().toLowerCase();
    return tabRows.filter((row) => {
      const matchesStatus = statusFilter === "All current records"
        ? row.status !== "Archived" && row.status !== "Banned"
        : row.status === statusFilter;
      const matchesVehicle =
        !transportTypeFilter || String(row.transportTypeId ?? "") === transportTypeFilter;
      const relatedNames = isRouteRecord(row.record) ? routeStopsSummary(row.record) : "";
      const matchesSearch = `${row.name} ${row.transportTypeName} ${relatedNames}`.toLowerCase().includes(query);
      return matchesStatus && matchesVehicle && matchesSearch;
    });
  }, [rows, activeTab, statusFilter, transportTypeFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(scopedRows.length / ROUTES_PER_PAGE));
  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(page, 1), totalPages));
  }, [totalPages]);
  const paginatedRows = scopedRows.slice(
    (currentPage - 1) * ROUTES_PER_PAGE,
    currentPage * ROUTES_PER_PAGE,
  );
  const startItem = scopedRows.length ? (currentPage - 1) * ROUTES_PER_PAGE + 1 : 0;
  const endItem = Math.min(currentPage * ROUTES_PER_PAGE, scopedRows.length);
  const activeRouteCount = data.routes.filter(
    (route) =>
      route.is_approved &&
      route.moderation_status === "approved" &&
      route.is_active &&
      !route.is_banned &&
      !route.is_deleted,
  ).length;

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: "local" });
    localStorage.removeItem("qroute_current_user");
    sessionStorage.removeItem("qroute_current_user");
    navigate("/login", { replace: true });
  };

  const openEditor = async (row?: ManagementRow) => {
    if (!row && !isAdmin) return;
    setEditorError(null);
    setPointToAdd("");
    setVariants([]);
    setAvailablePoints([]);
    if (!row) {
      setEditor({
        entityType: "transport_type",
        id: null,
        name: "",
        color: "#123456",
        transportTypeId: null,
        variantId: null,
        isActive: true,
        latitude: "",
        longitude: "",
        description: "",
        stopType: "road_stop",
        stops: [],
      });
      return;
    }

    setEditor(createEditorState(row));
    if (row.entityType !== "route") return;
    setIsEditorLoading(true);
    try {
      const [options, catalog] = await Promise.all([
        getTransportOptions(),
        getTransitCatalog(),
      ]);
      setVariants(options.variants);
      setAvailablePoints(catalog.points);
    } catch (error: unknown) {
      setEditorError(error instanceof Error ? error.message : "Unable to load route editing options.");
    } finally {
      setIsEditorLoading(false);
    }
  };

  const closeEditor = () => {
    if (isSaving) return;
    setEditor(null);
    setEditorError(null);
  };

  const saveEditor = async () => {
    if (!userId || !editor || !isAdmin) return;
    const name = editor.name.trim();
    if (!name || name.length > (editor.entityType === "route" ? 180 : 120)) {
      setEditorError("Enter a valid name within the allowed length.");
      return;
    }

    if (editor.entityType === "transport_type") {
      if (!/^#[0-9A-Fa-f]{3,8}$/.test(editor.color)) {
        setEditorError("Enter a valid hexadecimal color.");
        return;
      }
    } else if (editor.entityType === "route") {
      if (editor.transportTypeId === null || editor.variantId === null) {
        setEditorError("Choose a transport type and variant.");
        return;
      }
      if (editor.stops.some((stop) => stop.unresolved) || editor.stops.length < 2 || editor.stops.length > 100) {
        setEditorError("A route needs between 2 and 100 valid ordered stops.");
        return;
      }
    } else {
      const latitude = Number(editor.latitude);
      const longitude = Number(editor.longitude);
      if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        setEditorError("Enter valid latitude and longitude coordinates.");
        return;
      }
      if (editor.description.length > 500) {
        setEditorError("Descriptions must be 500 characters or fewer.");
        return;
      }
    }

    setIsSaving(true);
    setEditorError(null);
    try {
      if (editor.entityType === "transport_type") {
        if (editor.id === null) {
          await createAdminTransportType(userId, name, editor.color);
        } else {
          await updateAdminTransportType(userId, editor.id, name, editor.color);
        }
      } else if (editor.entityType === "route" && editor.id !== null) {
        await updateRouteManagementRecord(userId, "route", editor.id, {
          name,
          transport_type_id: editor.transportTypeId,
          variant_id: editor.variantId,
          is_active: editor.isActive,
          stops: editor.stops.map(({ kind, id }) => ({ kind, id })),
        });
      } else if (editor.id !== null) {
        const payload: Record<string, unknown> = {
          name,
          latitude: Number(editor.latitude),
          longitude: Number(editor.longitude),
          transport_type_id: editor.transportTypeId,
          is_active: editor.isActive,
        };
        if (editor.entityType === "stop") {
          payload.description = editor.description.trim();
          payload.stop_type = editor.stopType;
        }
        await updateRouteManagementRecord(userId, editor.entityType, editor.id, payload);
      }
      setEditor(null);
      refreshData();
    } catch (error: unknown) {
      setEditorError(error instanceof Error ? error.message : "Unable to save changes.");
    } finally {
      setIsSaving(false);
    }
  };

  const addRoutePoint = () => {
    const point = availablePoints.find(
      (candidate) => pointKey(candidate.kind, candidate.id) === pointToAdd,
    );
    if (!point || !editor) return;
    setEditor({
      ...editor,
      stops: [
        ...editor.stops,
        {
          kind: point.kind,
          id: point.id,
          name: point.name,
          kindLabel: pointKindLabel(point),
          unresolved: false,
        },
      ],
    });
    setPointToAdd("");
  };

  const handleModeration = async (row: ManagementRow, action: "approve" | "reject") => {
    if (
      !userId ||
      row.entityType === "transport_type" ||
      row.moderationStatus !== "pending"
    ) return;
    const moderationNote =
      action === "reject"
        ? window.prompt("Optional rejection note (500 characters maximum):", "") ?? null
        : undefined;
    if (moderationNote === null) return;
    if (moderationNote !== undefined && moderationNote.length > 500) {
      setErrorMessage("Rejection notes must be 500 characters or fewer.");
      return;
    }
    setIsMutating(true);
    setErrorMessage(null);
    try {
      await moderateRouteManagementRecord(
        userId,
        row.entityType as RouteManagementEntityType,
        row.id,
        action,
        moderationNote,
      );
      refreshData();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update moderation status.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleMapInformationAction = async (
    row: ManagementRow,
    action: "mute" | "unmute" | "ban" | "unban",
  ) => {
    if (!userId || !role || row.entityType === "transport_type" || row.isDeleted) {
      return;
    }
    if (
      action === "ban" &&
      !window.confirm(`Ban "${row.name}" from public map information?`)
    ) {
      return;
    }

    setIsMutating(true);
    setErrorMessage(null);
    try {
      await moderateRouteManagementRecord(userId, row.entityType, row.id, action);
      refreshData();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update map information status.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleArchive = async (row: ManagementRow) => {
    if (!userId || !isAdmin || row.entityType === "transport_type") return;
    if (!window.confirm(`Archive "${row.name}"? This hides it without deleting its record.`)) return;
    setIsMutating(true);
    setErrorMessage(null);
    try {
      await archiveRouteManagementRecord(userId, row.entityType, row.id);
      refreshData();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to archive the record.");
    } finally {
      setIsMutating(false);
    }
  };

  const changeTab = (tab: ManagementTab) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-[#F4F8FC] text-slate-800">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[250px] flex-col bg-[#102E4D] text-white md:flex">
        <div className="flex h-[105px] items-center border-b border-white/10 px-7">
          <button type="button" onClick={() => navigate("/admin/dashboard")} className="text-left" aria-label="QRoute dashboard">
            <img src={qrouteWhiteLogo} alt="QRoute Logo" className="h-auto w-[150px] object-contain" />
            <p className="mt-0.5 text-xs tracking-wide text-blue-200">ADMINISTRATION</p>
          </button>
        </div>
        <div className="px-5 pt-8">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[2px] text-slate-400">Main Menu</p>
          <nav className="space-y-1.5">
            {navigationItems
              .filter((item) => isAdmin || item.label === "Route Management")
              .map((item) => {
                const Icon = item.icon;
                const active = item.label === "Route Management";
                const destination = getAdminNavigationDestination(item.label);
                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled={!destination}
                    title={destination ? undefined : `${item.label} is unavailable in the current system.`}
                    onClick={() => destination && navigate(destination)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                      active ? "bg-[#CFD5DB] font-semibold text-[#102E4D]" : destination ? "text-slate-200 hover:bg-white/10 hover:text-white" : "cursor-not-allowed text-slate-400"
                    }`}
                  >
                    <Icon size={19} strokeWidth={1.8} />
                    <span>{item.label}</span>
                    {!destination && <span className="ml-auto text-[10px]">Unavailable</span>}
                  </button>
                );
              })}
          </nav>
        </div>
        <div className="mt-auto p-5">
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-200 text-[#102E4D]"><Users size={20} /></div>
              <div><p className="text-sm font-semibold">Route Management</p><p className="text-xs text-slate-300">{isAdmin ? "Administrator" : "Moderation workspace"}</p></div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const destination = getAdminNavigationDestination("Switch to User Mode");
              if (destination) navigate(destination);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
          ><UserRound size={17} />Switch to User Mode</button>
          <button type="button" onClick={() => void handleLogout()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/20"><LogOut size={17} />Sign Out</button>
        </div>
      </aside>

      <main className="min-h-screen md:ml-[250px]">
        <header className="sticky top-0 z-20 flex min-h-[86px] items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur sm:px-8 lg:px-10">
          <div><h2 className="text-xl font-bold tracking-tight text-[#102E4D] sm:text-2xl">Route Management</h2><p className="mt-1 text-xs text-slate-500 sm:text-sm">Moderate contributions and manage transit records</p></div>
          <div className="flex items-center gap-3 sm:gap-5">
            {isAdmin && <AdminNotificationBell adminUserId={userId ?? ""} />}
            <div className="hidden h-9 w-px bg-slate-200 sm:block" />
            <div className="flex items-center gap-2.5">
              <AccountAvatar account={account} className="h-10 w-10 bg-[#DCE9F7] font-bold text-[#102E4D]" iconSize={20} />
              <div className="hidden text-left sm:block"><p className="text-sm font-semibold text-slate-800">{accountName}</p><p className="max-w-[180px] truncate text-xs text-slate-500">{account?.email || "Route Management"}</p></div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
          <section className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div><h3 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">Transit Records</h3><p className="mt-2 text-sm text-slate-500">Review submissions, moderate records, and manage transport types.</p></div>
            <div className="flex w-fit items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><RouteIcon size={20} /></div>
              <div><p className="text-xs text-slate-500">Active Transit Routes</p><p className="text-xl font-bold text-[#102E4D]">{activeRouteCount}</p></div>
            </div>
          </section>

          {(roleError || errorMessage) && (
            <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <span>{roleError ?? errorMessage}</span>
              {errorMessage && <button type="button" onClick={refreshData} className="font-semibold underline">Retry</button>}
            </div>
          )}

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.035)] sm:p-6">
            <div className="mb-5 flex flex-wrap gap-2 border-b border-slate-200 pb-4" role="tablist" aria-label="Route Management categories">
              {TABS.map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => changeTab(tab)} className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${activeTab === tab ? "bg-[#102E4D] text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{tab}</button>
              ))}
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_190px_210px_auto]">
              <div className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4">
                <Search size={18} className="shrink-0 text-slate-400" />
                <input value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setCurrentPage(1); }} placeholder="Search routes, stops, terminals..." aria-label="Search records" className="w-full border-0 bg-transparent text-sm outline-none placeholder:text-slate-400" />
                {searchTerm && <button type="button" onClick={() => { setSearchTerm(""); setCurrentPage(1); }} aria-label="Clear search"><X size={16} className="text-slate-400 hover:text-slate-700" /></button>}
              </div>
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setCurrentPage(1); }} aria-label="Filter by status" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <select value={transportTypeFilter} onChange={(event) => { setTransportTypeFilter(event.target.value); setCurrentPage(1); }} aria-label="Filter by transport type" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                <option value="">All transport types</option>
                {data.transportTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
              {isAdmin && activeTab === "Transport Types" && <button type="button" onClick={() => void openEditor()} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#102E4D] px-4 text-sm font-semibold text-white hover:bg-[#19476D]"><Plus size={16} />Add Type</button>}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div><h4 className="font-bold text-slate-900">{activeTab === "All" ? "All Records" : activeTab}</h4><p className="mt-1 text-xs text-slate-500">{scopedRows.length} matching {scopedRows.length === 1 ? "record" : "records"}</p></div>
              <span className="rounded-full bg-[#EAF1F8] px-3 py-1.5 text-xs font-semibold text-[#102E4D]">{statusFilter}</span>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                  <thead className="bg-[#EAF1F8] text-slate-600"><tr>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide">Category</th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide">Record</th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide">Transport Type</th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide">Status</th>
                    <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wide">Actions</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedRows.length ? paginatedRows.map((row) => {
                      const category = row.entityType === "transport_type" ? "Transport Type" : `${row.entityType[0].toUpperCase()}${row.entityType.slice(1)}`;
                      const route = isRouteRecord(row.record) ? row.record : null;
                      const point = !route && !isTransportTypeRecord(row.record) ? row.record : null;
                      return (
                        <tr key={row.key} className="transition hover:bg-slate-50">
                          <td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">{category}</span></td>
                          <td className="px-5 py-4">
                            <p className="font-semibold text-slate-800">{row.name}</p>
                            {route && <p className="mt-1 max-w-[360px] truncate text-xs text-slate-500">{routeStopsSummary(route) || "No stops recorded"}</p>}
                            {point && <p className="mt-1 text-xs text-slate-500">{row.entityType === "stop" ? (point.stop_type === "train_station" ? "Train station" : "Road stop") : "Terminal"}</p>}
                            {row.entityType === "transport_type" && isTransportTypeRecord(row.record) && <span className="mt-1 inline-block h-3 w-8 rounded border border-slate-200" style={{ backgroundColor: row.record.color }} aria-label="Transport type color" />}
                          </td>
                          <td className="px-5 py-4"><span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">{transportIcon(row.transportTypeName)}{row.transportTypeName}</span></td>
                          <td className="px-5 py-4"><span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${statusClass(row.status)}`}>{row.status}</span></td>
                          <td className="px-5 py-4">
                            <div className="flex flex-wrap justify-center gap-2">
                              <button type="button" onClick={() => setSelectedRow(row)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#EAF1F8] px-3 py-2 text-xs font-semibold text-[#102E4D] hover:bg-[#DCE9F7]"><Eye size={13} />View</button>
                              {role && row.moderationStatus === "pending" && !row.isDeleted && !row.isBanned && (
                                <>
                                  {row.isActive && <button type="button" disabled={isMutating} onClick={() => void handleModeration(row, "approve")} className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2.5 py-2 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50"><Check size={13} />Approve</button>}
                                  <button type="button" disabled={isMutating} onClick={() => void handleModeration(row, "reject")} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"><Ban size={13} />Reject</button>
                                </>
                              )}
                              {role && row.entityType !== "transport_type" && !row.isDeleted && (
                                <>
                                  <button type="button" disabled={isMutating} onClick={() => void handleMapInformationAction(row, row.isActive ? "mute" : "unmute")} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{row.isActive ? "Mute" : "Unmute"}</button>
                                  <button type="button" disabled={isMutating} onClick={() => void handleMapInformationAction(row, row.isBanned ? "unban" : "ban")} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">{row.isBanned ? "Unban" : "Ban"}</button>
                                </>
                              )}
                              {isAdmin && row.entityType === "transport_type" && <button type="button" onClick={() => void openEditor(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-[#102E4D] hover:text-[#102E4D]"><Pencil size={13} />Edit</button>}
                              {isAdmin && row.entityType !== "transport_type" && !row.isDeleted && (
                                <>
                                  <button type="button" onClick={() => void openEditor(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-[#102E4D] hover:text-[#102E4D]"><Pencil size={13} />Edit</button>
                                  <button type="button" disabled={isMutating} onClick={() => void handleArchive(row)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"><Archive size={13} />Archive</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan={5} className="px-6 py-16 text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF1F8] text-[#102E4D]"><RouteIcon size={25} /></div>
                        <p className="mt-4 font-semibold text-slate-800">{isLoading ? "Loading records..." : errorMessage ? "Records could not be loaded" : "No matching records"}</p>
                        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{errorMessage ?? (isLoading ? "Loading Route Management records." : "Try another search term or filter.")}</p>
                        {errorMessage && <button type="button" onClick={refreshData} className="mt-4 rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#19476D]">Retry</button>}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {scopedRows.length > 0 && (
              <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">Showing <span className="font-semibold text-slate-700">{startItem}-{endItem}</span> of <span className="font-semibold text-slate-700">{scopedRows.length}</span> records</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage <= 1} aria-label="Previous page" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={16} />Previous</button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => <button key={page} type="button" onClick={() => setCurrentPage(page)} aria-label={`Page ${page}`} aria-current={currentPage === page ? "page" : undefined} className={`min-w-10 rounded-lg px-3 py-2 text-sm font-semibold ${currentPage === page ? "bg-[#102E4D] text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{page}</button>)}
                  <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage >= totalPages} aria-label="Next page" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight size={16} /></button>
                </div>
              </div>
            )}
            <p className="mt-4 text-xs text-slate-400">New routes, stops, and terminals are submitted through Contributions. Archived records remain stored for audit and recovery.</p>
          </section>
          <footer className="pb-2 pt-8 text-center text-xs text-slate-400">QRoute · Route Management</footer>
        </div>
      </main>

      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
          <section role="dialog" aria-modal="true" aria-labelledby="record-details-title" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between"><div><h2 id="record-details-title" className="text-xl font-bold text-[#102E4D]">Record Details</h2><p className="mt-1 text-sm text-slate-500">{selectedRow.entityType.replace("_", " ")}</p></div><button type="button" onClick={() => setSelectedRow(null)} aria-label="Close dialog" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X size={19} /></button></div>
            <div className="space-y-4">
              <Detail label="Name" value={selectedRow.name} />
              <Detail label="Transport type" value={selectedRow.transportTypeName} />
              <Detail label="Status" value={selectedRow.status} />
              {selectedRow.entityType !== "transport_type" && (
                <RouteManagementMap
                  points={recordMapPoints(selectedRow)}
                  routeColor={data.transportTypes.find(
                    (type) => type.id === selectedRow.transportTypeId,
                  )?.color ?? "#2563eb"}
                />
              )}
              {isRouteRecord(selectedRow.record) && <>
                <Detail label="Transport variant" value={selectedRow.record.transport_variants?.code ?? "Unavailable"} />
                <div><h3 className="mb-2 text-sm font-semibold text-slate-700">Ordered stops</h3><ol className="space-y-2">{selectedRow.record.route_stops.map((stop) => <li key={`${stop.route_id}-${stop.stop_order}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">{stop.stop_order}. {stop.terminals?.name ?? stop.stops?.name ?? "Point unavailable"}</li>)}</ol></div>
              </>}
              {!isRouteRecord(selectedRow.record) && !isTransportTypeRecord(selectedRow.record) && <>
                <p className="text-right text-xs text-slate-500">Coordinates: {selectedRow.record.latitude}, {selectedRow.record.longitude}</p>
                {selectedRow.record.description && <Detail label="Description" value={selectedRow.record.description} />}
              </>}
              <button type="button" onClick={() => setSelectedRow(null)} className="mt-3 w-full rounded-lg bg-[#102E4D] px-4 py-3 text-sm font-semibold text-white hover:bg-[#19476D]">Close</button>
            </div>
          </section>
        </div>
      )}

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
          <section role="dialog" aria-modal="true" aria-labelledby="record-editor-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between"><div><h2 id="record-editor-title" className="text-xl font-bold text-[#102E4D]">{editor.entityType === "transport_type" ? (editor.id === null ? "Add Transport Type" : "Edit Transport Type") : `Edit ${editor.entityType}`}</h2><p className="mt-1 text-sm text-slate-500">Changes are authorized and audited by the server.</p></div><button type="button" onClick={closeEditor} aria-label="Close dialog" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X size={19} /></button></div>
            {isEditorLoading ? <p role="status" className="py-8 text-center text-sm text-slate-500">Loading route options...</p> : (
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700">Name<input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} maxLength={editor.entityType === "route" ? 180 : 120} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-[#102E4D]" /></label>
                {editor.entityType === "transport_type" && <label className="block text-sm font-semibold text-slate-700">Color<input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(editor.color) ? editor.color : "#123456"} onChange={(event) => setEditor({ ...editor, color: event.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-2" /></label>}
                {editor.entityType === "route" && <>
                  <label className="block text-sm font-semibold text-slate-700">Transport type<select value={editor.transportTypeId ?? ""} onChange={(event) => { const nextId = event.target.value ? Number(event.target.value) : null; setEditor({ ...editor, transportTypeId: nextId, variantId: null }); }} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal">
                    <option value="">Choose a type</option>{data.transportTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                  </select></label>
                  <label className="block text-sm font-semibold text-slate-700">Transport variant<select value={editor.variantId ?? ""} onChange={(event) => setEditor({ ...editor, variantId: event.target.value ? Number(event.target.value) : null })} disabled={!editor.transportTypeId} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal disabled:bg-slate-50">
                    <option value="">Choose a variant</option>{variants.filter((variant) => variant.transport_type_id === editor.transportTypeId).map((variant) => <option key={variant.id} value={variant.id}>{variant.name} ({variant.code})</option>)}
                  </select></label>
                  <div><div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold text-slate-700">Ordered stops</span><span className="text-xs text-slate-400">{editor.stops.length} of 100</span></div>
                    <div className="flex gap-2"><select value={pointToAdd} onChange={(event) => setPointToAdd(event.target.value)} aria-label="Choose stop or terminal" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Add an approved stop or terminal</option>{availablePoints.map((point) => <option key={pointKey(point.kind, point.id)} value={pointKey(point.kind, point.id)}>{point.name} · {pointKindLabel(point)}</option>)}</select><button type="button" onClick={addRoutePoint} disabled={!pointToAdd} className="rounded-lg border border-slate-200 px-3 text-sm font-semibold disabled:opacity-50">Add</button></div>
                    <ol className="mt-3 space-y-2">{editor.stops.map((stop, index) => <li key={`${stop.kind}-${stop.id}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"><span className="flex-1">{index + 1}. {stop.name} <span className="text-xs text-slate-500">({stop.kindLabel})</span></span><button type="button" aria-label={`Move ${stop.name} up`} disabled={index === 0} onClick={() => { const items = [...editor.stops]; [items[index - 1], items[index]] = [items[index], items[index - 1]]; setEditor({ ...editor, stops: items }); }} className="rounded p-1 disabled:opacity-30"><ChevronUp size={15} /></button><button type="button" aria-label={`Move ${stop.name} down`} disabled={index === editor.stops.length - 1} onClick={() => { const items = [...editor.stops]; [items[index + 1], items[index]] = [items[index], items[index + 1]]; setEditor({ ...editor, stops: items }); }} className="rounded p-1 disabled:opacity-30"><ChevronDown size={15} /></button><button type="button" aria-label={`Remove ${stop.name}`} onClick={() => setEditor({ ...editor, stops: editor.stops.filter((_, stopIndex) => stopIndex !== index) })} className="rounded p-1 text-red-600"><X size={15} /></button></li>)}</ol>
                  </div>
                  <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={editor.isActive} onChange={(event) => setEditor({ ...editor, isActive: event.target.checked })} className="h-4 w-4 accent-[#102E4D]" />Route is active</label>
                </>}
                {(editor.entityType === "stop" || editor.entityType === "terminal") && <>
                  <label className="block text-sm font-semibold text-slate-700">Transport type<select value={editor.transportTypeId ?? ""} onChange={(event) => setEditor({ ...editor, transportTypeId: event.target.value ? Number(event.target.value) : null })} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"><option value="">Unassigned</option>{data.transportTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
                </>}
                {editor.entityType !== "transport_type" && <>
                  <RouteManagementMap
                    points={editorPoints}
                    selectedPosition={editorMapPosition}
                    editable={editor.entityType === "stop" || editor.entityType === "terminal"}
                    onPick={
                      editor.entityType === "stop" || editor.entityType === "terminal"
                        ? ([latitude, longitude]) => setEditor({
                            ...editor,
                            latitude: String(latitude),
                            longitude: String(longitude),
                          })
                        : undefined
                    }
                    routeColor={data.transportTypes.find(
                      (type) => type.id === editor.transportTypeId,
                    )?.color ?? "#2563eb"}
                  />
                  {editorMapPosition && (
                    <p className="text-right text-xs text-slate-500">
                      Selected coordinates: {editor.latitude}, {editor.longitude}. Click or drag the marker to reposition; changes apply when saved.
                    </p>
                  )}
                </>}
                {(editor.entityType === "stop" || editor.entityType === "terminal") && <>
                  {editor.entityType === "stop" && <>
                    <label className="block text-sm font-semibold text-slate-700">Stop type<select value={editor.stopType} onChange={(event) => { const stopType = event.target.value; if (stopType === "road_stop" || stopType === "train_station") setEditor({ ...editor, stopType }); }} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"><option value="road_stop">Road stop</option><option value="train_station">Train station</option></select></label>
                    <label className="block text-sm font-semibold text-slate-700">Description<textarea value={editor.description} maxLength={500} onChange={(event) => setEditor({ ...editor, description: event.target.value })} rows={3} className="mt-1.5 w-full rounded-lg border border-slate-300 p-3 font-normal" /></label>
                  </>}
                  <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={editor.isActive} onChange={(event) => setEditor({ ...editor, isActive: event.target.checked })} className="h-4 w-4 accent-[#102E4D]" />Record is active</label>
                </>}
                {editorError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{editorError}</p>}
                <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={closeEditor} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button><button type="button" onClick={() => void saveEditor()} disabled={isSaving || isEditorLoading} className="rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#19476D] disabled:opacity-50">{isSaving ? "Saving..." : "Save changes"}</button></div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
