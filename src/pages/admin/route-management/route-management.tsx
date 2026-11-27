import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";
import AccountAvatar from "@/components/account/AccountAvatar";
import AdminNotificationBell from "@/components/admin/AdminNotificationBell";
import { RouteManagementMap } from "@/components/map/RouteManagementMap";
import { useAccountProfile } from "@/components/account/accountProfileStore";
import { logoutCurrentDevice } from "@/lib/authLogout";
import {
  createAdminTransportType,
  updateAdminTransportType,
  updateRouteManagementRecord,
  type AdminRouteChangeProposalRecord,
  type AdminTransitPointRecord,
} from "@/lib/adminApi";
import { getTransitCatalog, getTransportOptions, pointKey } from "@/lib/contributions";
import type { ExistingPoint, TransportVariantOption } from "@/lib/contributions";
import { getAdminNavigationDestination } from "@/pages/admin/adminNavigation";
import {
  Route as RouteIcon, Users, Search, UserRound, Eye, X, Pencil, Archive,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, LogOut, Check, Ban, Plus,
  GitBranch, MapPin, RotateCcw, CheckCircle2,
} from "lucide-react";

import { navigationItems, ROUTES_PER_PAGE, STATUSES, TABS } from "@/components/route-management/constants";
import {
  createEditorState, editorMapPoints, formatProposalDate, isRouteRecord,
  isTransportTypeRecord, isTransitPointRecord, pointKindLabel, recordMapPoints,
  recordStatus, routeStopsSummary, statusClass, transportIcon,
  proposalPointName, proposalPointType, proposalPoints, proposalTypeLabel,
} from "@/components/route-management/helpers";
import { Detail } from "@/components/route-management/components/Detail";
import { PendingReviewCard } from "@/components/route-management/components/PendingReviewCard";
import { MapImageReviewCard } from "@/components/route-management/components/MapImageReviewCard";
import { RouteChangeProposalCard } from "@/components/route-management/components/RouteChangeProposalCard";
import { useRouteManagementData } from "@/components/route-management/hooks/useRouteManagementData";
import { useRouteManagementActions } from "@/components/route-management/hooks/useRouteManagementActions";
import type { EditorState, ManagementRow, ManagementTab } from "@/components/route-management/types";

export default function RouteManagement() {
  const navigate = useNavigate();

  // ----------------------------------------------------------
  // AUTHENTICATED ACCOUNT AND SESSION
  // ----------------------------------------------------------

  const { userId, account } = useAccountProfile();

  // Auth/session validation, route data, and review-image loading are centralized in the data hook.

  // ----------------------------------------------------------
  // FILTER AND PAGINATION STATE
  // ----------------------------------------------------------

  const [activeTab, setActiveTab] =
    useState<ManagementTab>("All");

  const [statusFilter, setStatusFilter] =
    useState("All current records");

  const [transportTypeFilter, setTransportTypeFilter] =
    useState("");

  const [searchTerm, setSearchTerm] =
    useState("");

  const [currentPage, setCurrentPage] =
    useState(1);

  // ----------------------------------------------------------
  // SELECTION AND EDITOR STATE
  // ----------------------------------------------------------

  const [selectedRow, setSelectedRow] =
    useState<ManagementRow | null>(null);

  const [selectedProposal, setSelectedProposal] =
    useState<AdminRouteChangeProposalRecord | null>(null);

  const [editor, setEditor] =
    useState<EditorState | null>(null);

  const [editorError, setEditorError] =
    useState<string | null>(null);

  const [isEditorLoading, setIsEditorLoading] =
    useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [isMutating, setIsMutating] =
    useState(false);

  const [variants, setVariants] =
    useState<TransportVariantOption[]>([]);

  const [availablePoints, setAvailablePoints] =
    useState<ExistingPoint[]>([]);

  const [pointToAdd, setPointToAdd] =
    useState("");

  // ----------------------------------------------------------
  // LOGOUT STATE
  // ----------------------------------------------------------

  const [isLoggingOut, setIsLoggingOut] =
    useState(false);

  const [logoutError, setLogoutError] =
    useState<string | null>(null);

  const {
    data,
    dataOwnerId,
    role,
    roleError,
    isLoading,
    errorMessage,
    setErrorMessage,
    refreshData,
    reviewImages,
    reviewImagesLoading,
    reviewImagesError,
    setReviewImagesError,
    setImageRefreshVersion,
    archiveRecoveryStatuses,
    archiveRecoveryLoading,
    archiveRecoveryError,
  } = useRouteManagementData({
    userId,
    selectedRow,
    selectedProposal,
  });

  // ----------------------------------------------------------
  // ACCOUNT DISPLAY
  // ----------------------------------------------------------

  const isAdmin = role === "admin";

  const archiveRecoveryByRouteId = useMemo(
    () => new Map(archiveRecoveryStatuses.map((status) => [status.routeId, status])),
    [archiveRecoveryStatuses],
  );

  const accountName =
    account?.displayName?.trim() ||
    account?.username?.trim() ||
    (account?.email
      ? account.email.split("@")[0]
      : null) ||
    (isAdmin ? "Administrator" : "Moderator");

  // ==========================================================
  // 4. BUILD MANAGEMENT ROWS
  // ==========================================================

  const rows = useMemo<ManagementRow[]>(() => {
    if (!userId || dataOwnerId !== userId) {
      return [];
    }

    const typeNames = new Map(
      data.transportTypes.map((type) => [
        type.id,
        type.name,
      ]),
    );

    const routeRows: ManagementRow[] =
      data.routes.map((record) => ({
        key: `route-${record.id}`,
        entityType: "route",
        id: record.id,
        name: record.name,
        transportTypeId: record.transport_type_id,
        transportTypeName:
          record.transport_types?.name ??
          typeNames.get(record.transport_type_id) ??
          "Unavailable",
        status: recordStatus(record),
        moderationStatus: record.moderation_status,
        isActive: record.is_active === true,
        isBanned: record.is_banned === true,
        isDeleted: record.is_deleted === true,
        archiveRecovery: archiveRecoveryByRouteId.get(record.id) ?? null,
        record,
      }));

    const stopRows: ManagementRow[] =
      data.stops.map((record) => ({
        key: `stop-${record.id}`,
        entityType: "stop",
        id: record.id,
        name: record.name,
        transportTypeId: record.transport_type_id,
        transportTypeName:
          record.transport_types?.name ??
          (record.transport_type_id === null
            ? "Unassigned"
            : typeNames.get(record.transport_type_id) ??
              "Unavailable"),
        status: recordStatus(record),
        moderationStatus: record.moderation_status,
        isActive: record.is_active === true,
        isBanned: record.is_banned === true,
        isDeleted: record.is_deleted === true,
        archiveRecovery: null,
        record,
      }));

    const terminalRows: ManagementRow[] =
      data.terminals.map((record) => ({
        key: `terminal-${record.id}`,
        entityType: "terminal",
        id: record.id,
        name: record.name,
        transportTypeId: record.transport_type_id,
        transportTypeName:
          record.transport_types?.name ??
          (record.transport_type_id === null
            ? "Unassigned"
            : typeNames.get(record.transport_type_id) ??
              "Unavailable"),
        status: recordStatus(record),
        moderationStatus: record.moderation_status,
        isActive: record.is_active === true,
        isBanned: record.is_banned === true,
        isDeleted: record.is_deleted === true,
        archiveRecovery: null,
        record,
      }));

    const typeRows: ManagementRow[] =
      data.transportTypes.map((record) => ({
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
        archiveRecovery: null,
        record,
      }));

    return [
      ...routeRows,
      ...stopRows,
      ...terminalRows,
      ...typeRows,
    ];
  }, [data, dataOwnerId, userId, archiveRecoveryByRouteId]);

  // ==========================================================
  // 5. MAP DERIVED STATE
  // ==========================================================

  const editorPoints = editor
    ? editorMapPoints(
        editor,
        data,
        availablePoints,
      )
    : [];

  const editorMapPosition =
    editor &&
    (editor.entityType === "stop" ||
      editor.entityType === "terminal")
      ? ([
          Number(editor.latitude),
          Number(editor.longitude),
        ] as [number, number])
      : null;

  // ==========================================================
  // 6. FILTER RECORDS
  // ==========================================================

  const scopedRows = useMemo(() => {
    const tabRows =
      activeTab === "All"
        ? rows
        : activeTab === "Transport Types"
          ? rows.filter(
              (row) =>
                row.entityType === "transport_type",
            )
          : rows.filter(
              (row) =>
                row.entityType.toLowerCase() ===
                activeTab.slice(0, -1).toLowerCase(),
            );

    const query = searchTerm.trim().toLowerCase();

    return tabRows.filter((row) => {
      const matchesStatus =
        statusFilter === "All current records"
          ? row.status !== "Archived" &&
            row.status !== "Banned"
          : row.status === statusFilter;

      const matchesVehicle =
        !transportTypeFilter ||
        String(row.transportTypeId ?? "") ===
          transportTypeFilter;

      const relatedNames = isRouteRecord(row.record)
        ? routeStopsSummary(row.record)
        : "";

      const matchesSearch =
        `${row.name} ${row.transportTypeName} ${relatedNames}`
          .toLowerCase()
          .includes(query);

      return (
        matchesStatus &&
        matchesVehicle &&
        matchesSearch
      );
    });
  }, [
    rows,
    activeTab,
    statusFilter,
    transportTypeFilter,
    searchTerm,
  ]);

  // ==========================================================
  // 7. PAGINATION
  // ==========================================================

  const totalPages = Math.max(
    1,
    Math.ceil(scopedRows.length / ROUTES_PER_PAGE),
  );

  useEffect(() => {
    setCurrentPage((page) =>
      Math.min(Math.max(page, 1), totalPages),
    );
  }, [totalPages]);

  const paginatedRows = scopedRows.slice(
    (currentPage - 1) * ROUTES_PER_PAGE,
    currentPage * ROUTES_PER_PAGE,
  );

  const startItem = scopedRows.length
    ? (currentPage - 1) * ROUTES_PER_PAGE + 1
    : 0;

  const endItem = Math.min(
    currentPage * ROUTES_PER_PAGE,
    scopedRows.length,
  );

  // ==========================================================
  // 8. ACTIVE ROUTE COUNT
  // ==========================================================

  const activeRouteCount = data.routes.filter(
    (route) =>
      route.is_approved &&
      route.moderation_status === "approved" &&
      route.is_active &&
      !route.is_banned &&
      !route.is_deleted,
  ).length;

  // ==========================================================
  // 9. UNIFIED PENDING REVIEW ITEMS
  // ==========================================================

  const pendingLocationRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (row.entityType === "stop" || row.entityType === "terminal") &&
          row.moderationStatus === "pending" &&
          !row.isDeleted &&
          !row.isBanned,
      ),
    [rows],
  );

  // Keep route-change proposals as a distinct review category while
  // displaying them inside the same unified Pending Contributions card.
  // The API already returns pending proposals, but we filter defensively so
  // an accidentally stale/non-pending record is never shown as awaiting review.
  const pendingRouteChangeProposals = useMemo(
    () =>
      data.routeChangeProposals.filter(
        (proposal) => proposal.status === "pending",
      ),
    [data.routeChangeProposals],
  );

  const pendingReviewCount =
    pendingLocationRows.length + pendingRouteChangeProposals.length;

  // ==========================================================
  // 10. CENTRALIZED LOGOUT
  // ==========================================================

  const handleLogout = async () => {
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
      setLogoutError(
        error instanceof Error
          ? error.message
          : "Unable to sign out. Please try again.",
      );
    } finally {
      setIsLoggingOut(false);
    }
  };

  // ==========================================================
  // 11. OPEN EDITOR
  // ==========================================================

  const openEditor = async (
    row?: ManagementRow,
  ) => {
    if (!row && !isAdmin) {
      return;
    }

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

    if (row.entityType !== "route") {
      return;
    }

    setIsEditorLoading(true);

    try {
      const [options, catalog] = await Promise.all([
        getTransportOptions(),
        getTransitCatalog(),
      ]);

      setVariants(options.variants);
      setAvailablePoints(catalog.points);
    } catch (error: unknown) {
      setEditorError(
        error instanceof Error
          ? error.message
          : "Unable to load route editing options.",
      );
    } finally {
      setIsEditorLoading(false);
    }
  };

  // ==========================================================
  // 12. CLOSE EDITOR
  // ==========================================================

  const closeEditor = () => {
    if (isSaving) {
      return;
    }

    setEditor(null);
    setEditorError(null);
  };

  // ==========================================================
  // 13. SAVE EDITOR
  // ==========================================================

  const saveEditor = async () => {
    if (!userId || !editor || !isAdmin) {
      return;
    }

    const name = editor.name.trim();

    if (
      !name ||
      name.length >
        (editor.entityType === "route" ? 180 : 120)
    ) {
      setEditorError(
        "Enter a valid name within the allowed length.",
      );

      return;
    }

    if (editor.entityType === "transport_type") {
      if (!/^#[0-9A-Fa-f]{3,8}$/.test(editor.color)) {
        setEditorError(
          "Enter a valid hexadecimal color.",
        );

        return;
      }
    } else if (editor.entityType === "route") {
      if (
        editor.transportTypeId === null ||
        editor.variantId === null
      ) {
        setEditorError(
          "Choose a transport type and variant.",
        );

        return;
      }

      if (
        editor.stops.some((stop) => stop.unresolved) ||
        editor.stops.length < 2 ||
        editor.stops.length > 100
      ) {
        setEditorError(
          "A route needs between 2 and 100 valid ordered stops.",
        );

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
        setEditorError(
          "Enter valid latitude and longitude coordinates.",
        );

        return;
      }

      if (editor.description.length > 500) {
        setEditorError(
          "Descriptions must be 500 characters or fewer.",
        );

        return;
      }
    }

    setIsSaving(true);
    setEditorError(null);

    try {
      if (editor.entityType === "transport_type") {
        if (editor.id === null) {
          await createAdminTransportType(
            userId,
            name,
            editor.color,
          );
        } else {
          await updateAdminTransportType(
            userId,
            editor.id,
            name,
            editor.color,
          );
        }
      } else if (
        editor.entityType === "route" &&
        editor.id !== null
      ) {
        await updateRouteManagementRecord(
          userId,
          "route",
          editor.id,
          {
            name,
            transport_type_id: editor.transportTypeId,
            variant_id: editor.variantId,
            is_active: editor.isActive,
            stops: editor.stops.map(
              ({ kind, id }) => ({
                kind,
                id,
              }),
            ),
          },
        );
      } else if (editor.id !== null) {
        const payload: Record<string, unknown> = {
          name,
          latitude: Number(editor.latitude),
          longitude: Number(editor.longitude),
          transport_type_id: editor.transportTypeId,
          is_active: editor.isActive,
        };

        if (editor.entityType === "stop") {
          payload.description =
            editor.description.trim();

          payload.stop_type = editor.stopType;
        }

        await updateRouteManagementRecord(
          userId,
          editor.entityType,
          editor.id,
          payload,
        );
      }

      setEditor(null);
      refreshData();
    } catch (error: unknown) {
      setEditorError(
        error instanceof Error
          ? error.message
          : "Unable to save changes.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  // ==========================================================
  // 14. ADD ROUTE POINT
  // ==========================================================

  const addRoutePoint = () => {
    const point = availablePoints.find(
      (candidate) =>
        pointKey(candidate.kind, candidate.id) ===
        pointToAdd,
    );

    if (!point || !editor) {
      return;
    }

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

  const {
    handleMapImageModeration,
    handleModeration,
    handleRouteChangeProposalModeration,
    handleMapInformationAction,
    handleArchive,
    handleReinstateRoute,
    handleReconcileRouteArchive,
  } = useRouteManagementActions({
    userId,
    role,
    isAdmin,
    data,
    isMutating,
    setIsMutating,
    setErrorMessage,
    setReviewImagesError,
    setSelectedRow,
    setSelectedProposal,
    setImageRefreshVersion,
    refreshData,
  });

  // ==========================================================
  // 19. TAB CHANGE
  // ==========================================================

  const changeTab = (tab: ManagementTab) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="min-h-screen bg-[#F4F8FC] text-slate-800">
      {/* SIDEBAR */}

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[250px] flex-col bg-[#102E4D] text-white md:flex">
        <div className="flex h-[105px] items-center border-b border-white/10 px-7">
          <button
            type="button"
            onClick={() =>
              navigate("/admin/dashboard")
            }
            className="text-left"
            aria-label="QRoute dashboard"
          >
            <img
              src={qrouteWhiteLogo}
              alt="QRoute Logo"
              className="h-auto w-[150px] object-contain"
            />

            <p className="mt-0.5 text-xs tracking-wide text-blue-200">
              ADMINISTRATION
            </p>
          </button>
        </div>

        <div className="px-5 pt-8">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[2px] text-slate-400">
            Main Menu
          </p>

          <nav className="space-y-1.5">
            {navigationItems
              .filter(
                (item) =>
                  isAdmin ||
                  item.label === "Route Management",
              )
              .map((item) => {
                const Icon = item.icon;

                const active =
                  item.label === "Route Management";

                const destination =
                  getAdminNavigationDestination(
                    item.label,
                  );

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
                      destination &&
                      navigate(destination)
                    }
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                      active
                        ? "bg-[#CFD5DB] font-semibold text-[#102E4D]"
                        : destination
                          ? "text-slate-200 hover:bg-white/10 hover:text-white"
                          : "cursor-not-allowed text-slate-400"
                    }`}
                  >
                    <Icon
                      size={19}
                      strokeWidth={1.8}
                    />

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

        {/* SIDEBAR FOOTER */}

        <div className="mt-auto p-5">
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-200 text-[#102E4D]">
                <Users size={20} />
              </div>

              <div>
                <p className="text-sm font-semibold">
                  Route Management
                </p>

                <p className="text-xs text-slate-300">
                  {isAdmin
                    ? "Administrator"
                    : "Moderation workspace"}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const destination =
                getAdminNavigationDestination(
                  "Switch to User Mode",
                );

              if (destination) {
                navigate(destination);
              }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
          >
            <UserRound size={17} />
            Switch to User Mode
          </button>

          {logoutError && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200"
            >
              {logoutError}
            </p>
          )}

          <button
            type="button"
            disabled={isLoggingOut}
            onClick={() => void handleLogout()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut size={17} />

            {isLoggingOut
              ? "Signing Out..."
              : "Sign Out"}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}

      <main className="min-h-screen md:ml-[250px]">
        {/* HEADER */}

        <header className="sticky top-0 z-20 flex min-h-[86px] items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur sm:px-8 lg:px-10">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[#102E4D] sm:text-2xl">
              Route Management
            </h2>

            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Moderate contributions and manage transit records
            </p>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            {isAdmin && (
              <AdminNotificationBell
                adminUserId={userId ?? ""}
              />
            )}

            <div className="hidden h-9 w-px bg-slate-200 sm:block" />

            <div className="flex items-center gap-2.5">
              <AccountAvatar
                account={account}
                className="h-10 w-10 bg-[#DCE9F7] font-bold text-[#102E4D]"
                iconSize={20}
              />

              <div className="hidden text-left sm:block">
                <p className="text-sm font-semibold text-slate-800">
                  {accountName}
                </p>

                <p className="max-w-[180px] truncate text-xs text-slate-500">
                  {account?.email || "Route Management"}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* PAGE BODY */}

        <div className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
          {/* PAGE TITLE AND SUMMARY */}

          <section className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
                Transit Records
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                Review submissions, moderate records, and manage transport types.
              </p>
            </div>

            <div className="flex w-fit items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <RouteIcon size={20} />
              </div>

              <div>
                <p className="text-xs text-slate-500">
                  Active Transit Routes
                </p>

                <p className="text-xl font-bold text-[#102E4D]">
                  {activeRouteCount}
                </p>
              </div>
            </div>
          </section>

          {/* ERRORS */}

          {(roleError || errorMessage) && (
            <div
              role="alert"
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <span>
                {roleError ?? errorMessage}
              </span>

              {errorMessage && (
                <button
                  type="button"
                  onClick={refreshData}
                  className="font-semibold underline"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* =================================================
              UNIFIED PENDING CONTRIBUTION REVIEW
          ================================================== */}

          <section className="mb-8 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.035)] sm:p-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">
                    Pending Contributions for Review
                  </h3>

                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                    {pendingReviewCount} pending
                  </span>
                </div>

                <p className="mt-1 max-w-3xl text-sm text-slate-500">
                  Review newly submitted stops, terminals, and proposed changes to existing routes in one place. Open a submission to inspect its details and attached photographs before deciding.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Eye size={15} />
                Details and photos are reviewed together
              </div>
            </div>

            <div className="mt-5 space-y-5">
              {isLoading && pendingReviewCount === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
                  <p className="text-sm font-semibold text-slate-700">
                    Loading pending contributions...
                  </p>
                </div>
              ) : pendingReviewCount > 0 ? (
                <>
                  {/* MODIFY AN EXISTING ROUTE */}
                  <section className="rounded-xl border border-violet-100 bg-violet-50/40 p-4 sm:p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-800">
                          <GitBranch size={17} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">
                            Modify an Existing Route
                          </h4>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Insertions, extensions, replacements, reordering, and removal requests
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
                        {pendingRouteChangeProposals.length} pending
                      </span>
                    </div>

                    {pendingRouteChangeProposals.length > 0 ? (
                      <div className="space-y-3">
                        {pendingRouteChangeProposals.map((proposal) => {
                          const route = data.routes.find(
                            (record) => record.id === proposal.route_id,
                          );
                          const activeCount = proposal.route_change_proposal_points.filter(
                            (point) => !point.is_removed_from_route,
                          ).length;
                          const removalCount = proposal.route_change_proposal_points.filter(
                            (point) => point.is_removed_from_route,
                          ).length;

                          return (
                            <PendingReviewCard
                              key={`proposal-${proposal.id}`}
                              category="Route modification proposal"
                              title={
                                proposal.proposed_name?.trim() ||
                                route?.name ||
                                `Route #${proposal.route_id}`
                              }
                              description={`${proposalTypeLabel(proposal)} · ${activeCount} proposed active ${activeCount === 1 ? "point" : "points"}${removalCount ? ` · ${removalCount} removal${removalCount === 1 ? "" : "s"}` : ""}`}
                              metadata={`Proposal #${proposal.id} · Existing route #${proposal.route_id} · Submitted by ${proposal.contributor_display_name} · ${formatProposalDate(proposal.created_at)}`}
                              onView={() => {
                                setSelectedRow(null);
                                setSelectedProposal(proposal);
                              }}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-violet-200 bg-white/80 px-4 py-4 text-center text-xs text-slate-500">
                        No pending route modification proposals. New proposals to modify existing routes will appear here.
                      </p>
                    )}
                  </section>

                  {/* NEW STOPS AND TERMINALS */}
                  <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EAF1F8] text-[#102E4D]">
                          <MapPin size={17} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">
                            New Stops and Terminals
                          </h4>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Newly submitted standalone map locations
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                        {pendingLocationRows.length} pending
                      </span>
                    </div>

                    {pendingLocationRows.length > 0 ? (
                      <div className="space-y-3">
                        {pendingLocationRows.map((row) => (
                          <PendingReviewCard
                            key={row.key}
                            category={
                              row.entityType === "terminal"
                                ? "Terminal submission"
                                : "Stop submission"
                            }
                            title={row.name}
                            description={row.transportTypeName}
                            metadata={`Record #${row.id} · ${row.entityType === "terminal" ? "Terminal" : "Stop"}`}
                            onView={() => {
                              setSelectedProposal(null);
                              setSelectedRow(row);
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500">
                        No pending standalone stops or terminals.
                      </p>
                    )}
                  </section>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#EAF1F8] text-[#102E4D]">
                    <Check size={22} />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-800">
                    No pending contributions
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                    New standalone stops, terminals, and proposals to modify existing routes will appear here when submitted.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* RECORD MANAGEMENT PANEL */}

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.035)] sm:p-6">
            {/* TABS */}

            <div
              className="mb-5 flex flex-wrap gap-2 border-b border-slate-200 pb-4"
              role="tablist"
              aria-label="Route Management categories"
            >
              {TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => changeTab(tab)}
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                    activeTab === tab
                      ? "bg-[#102E4D] text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* SEARCH AND FILTERS */}

            <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_190px_210px_auto]">
              <div className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4">
                <Search
                  size={18}
                  className="shrink-0 text-slate-400"
                />

                <input
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search routes, stops, terminals..."
                  aria-label="Search records"
                  className="w-full border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />

                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm("");
                      setCurrentPage(1);
                    }}
                    aria-label="Clear search"
                  >
                    <X
                      size={16}
                      className="text-slate-400 hover:text-slate-700"
                    />
                  </button>
                )}
              </div>

              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setCurrentPage(1);
                }}
                aria-label="Filter by status"
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
              >
                {STATUSES.map((status) => (
                  <option
                    key={status}
                    value={status}
                  >
                    {status}
                  </option>
                ))}
              </select>

              <select
                value={transportTypeFilter}
                onChange={(event) => {
                  setTransportTypeFilter(
                    event.target.value,
                  );

                  setCurrentPage(1);
                }}
                aria-label="Filter by transport type"
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
              >
                <option value="">
                  All transport types
                </option>

                {data.transportTypes.map((type) => (
                  <option
                    key={type.id}
                    value={type.id}
                  >
                    {type.name}
                  </option>
                ))}
              </select>

              {isAdmin &&
                activeTab === "Transport Types" && (
                  <button
                    type="button"
                    onClick={() => void openEditor()}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#102E4D] px-4 text-sm font-semibold text-white hover:bg-[#19476D]"
                  >
                    <Plus size={16} />
                    Add Type
                  </button>
                )}
            </div>

            {/* RECORD SUMMARY */}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-slate-900">
                  {activeTab === "All"
                    ? "All Records"
                    : activeTab}
                </h4>

                <p className="mt-1 text-xs text-slate-500">
                  {scopedRows.length} matching{" "}
                  {scopedRows.length === 1
                    ? "record"
                    : "records"}
                </p>
              </div>

              <span className="rounded-full bg-[#EAF1F8] px-3 py-1.5 text-xs font-semibold text-[#102E4D]">
                {statusFilter}
              </span>
            </div>

            {/* RECORD TABLE */}

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                  <thead className="bg-[#EAF1F8] text-slate-600">
                    <tr>
                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide">
                        Category
                      </th>

                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide">
                        Record
                      </th>

                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide">
                        Transport Type
                      </th>

                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide">
                        Status
                      </th>

                      <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wide">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {paginatedRows.length ? (
                      paginatedRows.map((row) => {
                        const category =
                          row.entityType ===
                          "transport_type"
                            ? "Transport Type"
                            : `${row.entityType[0].toUpperCase()}${row.entityType.slice(1)}`;

                        const route = isRouteRecord(
                          row.record,
                        )
                          ? row.record
                          : null;

                        const point: AdminTransitPointRecord | null =
                          isTransitPointRecord(row.record)
                            ? row.record
                            : null;

                        return (
                          <tr
                            key={row.key}
                            className="transition hover:bg-slate-50"
                          >
                            <td className="px-5 py-4">
                              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                                {category}
                              </span>
                            </td>

                            <td className="px-5 py-4">
                              <p className="font-semibold text-slate-800">
                                {row.name}
                              </p>

                              {route && (
                                <p className="mt-1 max-w-[360px] truncate text-xs text-slate-500">
                                  {routeStopsSummary(route) ||
                                    "No stops recorded"}
                                </p>
                              )}

                              {point && (
                                <p className="mt-1 text-xs text-slate-500">
                                  {row.entityType === "stop"
                                    ? point.stop_type ===
                                      "train_station"
                                      ? "Train station"
                                      : "Road stop"
                                    : "Terminal"}
                                </p>
                              )}

                              {row.entityType ===
                                "transport_type" &&
                                isTransportTypeRecord(
                                  row.record,
                                ) && (
                                  <span
                                    className="mt-1 inline-block h-3 w-8 rounded border border-slate-200"
                                    style={{
                                      backgroundColor:
                                        row.record.color,
                                    }}
                                    aria-label="Transport type color"
                                  />
                                )}
                            </td>

                            <td className="px-5 py-4">
                              <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                                {transportIcon(
                                  row.transportTypeName,
                                )}

                                {row.transportTypeName}
                              </span>
                            </td>

                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${statusClass(row.status)}`}
                              >
                                {row.status}
                              </span>
                            </td>

                            <td className="px-5 py-4">
                              <div className="flex flex-wrap justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedProposal(null);
                                    setSelectedRow(row);
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#EAF1F8] px-3 py-2 text-xs font-semibold text-[#102E4D] hover:bg-[#DCE9F7]"
                                >
                                  <Eye size={13} />
                                  View
                                </button>

                                {/* Pending stop and terminal approvals live in the unified review queue above. */}
                                {role &&
                                  row.entityType === "route" &&
                                  row.moderationStatus === "pending" &&
                                  !row.isDeleted &&
                                  !row.isBanned && (
                                    <>
                                      {row.isActive && (
                                        <button
                                          type="button"
                                          disabled={isMutating}
                                          onClick={() => void handleModeration(row, "approve")}
                                          className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2.5 py-2 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50"
                                        >
                                          <Check size={13} /> Approve
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        disabled={isMutating}
                                        onClick={() => void handleModeration(row, "reject")}
                                        className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                                      >
                                        <Ban size={13} /> Reject
                                      </button>
                                    </>
                                  )}

                                {role &&
                                  row.entityType !==
                                    "transport_type" &&
                                  !row.isDeleted && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={isMutating}
                                        onClick={() =>
                                          void handleMapInformationAction(
                                            row,
                                            row.isActive
                                              ? "mute"
                                              : "unmute",
                                          )
                                        }
                                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                                      >
                                        {row.isActive
                                          ? "Mute"
                                          : "Unmute"}
                                      </button>

                                      <button
                                        type="button"
                                        disabled={isMutating}
                                        onClick={() =>
                                          void handleMapInformationAction(
                                            row,
                                            row.isBanned
                                              ? "unban"
                                              : "ban",
                                          )
                                        }
                                        className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                                      >
                                        {row.isBanned
                                          ? "Unban"
                                          : "Ban"}
                                      </button>
                                    </>
                                  )}

                                {isAdmin &&
                                  row.entityType ===
                                    "transport_type" && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void openEditor(row)
                                      }
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-[#102E4D] hover:text-[#102E4D]"
                                    >
                                      <Pencil size={13} />
                                      Edit
                                    </button>
                                  )}

                                {isAdmin &&
                                  row.entityType !==
                                    "transport_type" &&
                                  !row.isDeleted && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void openEditor(row)
                                        }
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-[#102E4D] hover:text-[#102E4D]"
                                      >
                                        <Pencil size={13} />
                                        Edit
                                      </button>

                                      <button
                                        type="button"
                                        disabled={
                                          isMutating ||
                                          Boolean(
                                            row.entityType === "route" &&
                                            (
                                              archiveRecoveryLoading ||
                                              archiveRecoveryError ||
                                              row.archiveRecovery?.archiveOperationId
                                            ),
                                          )
                                        }
                                        title={
                                          row.entityType === "route" && row.archiveRecovery?.archiveOperationId
                                            ? row.archiveRecovery.reason
                                            : row.entityType === "route" && archiveRecoveryLoading
                                              ? "Checking whether this route has an open archive recovery operation."
                                              : row.entityType === "route" && archiveRecoveryError
                                                ? archiveRecoveryError
                                                : undefined
                                        }
                                        onClick={() =>
                                          void handleArchive(row)
                                        }
                                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        <Archive size={13} />
                                        Archive
                                      </button>
                                    </>
                                  )}


                                {isAdmin &&
                                  row.entityType === "route" &&
                                  !row.isDeleted &&
                                  row.archiveRecovery?.archiveOperationId && (
                                    row.archiveRecovery.canReconcile ? (
                                      <button
                                        type="button"
                                        disabled={isMutating}
                                        onClick={() => void handleReconcileRouteArchive(row)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                                      >
                                        <CheckCircle2 size={13} />
                                        Finalize recovery
                                      </button>
                                    ) : (
                                      <span
                                        className="max-w-[150px] cursor-help rounded-lg bg-amber-50 px-2.5 py-2 text-center text-[11px] font-semibold text-amber-800"
                                        title={row.archiveRecovery.reason}
                                      >
                                        Manual review
                                      </span>
                                    )
                                  )}

                                {isAdmin &&
                                  row.entityType === "route" &&
                                  row.isDeleted && (
                                    row.archiveRecovery?.canReinstate ? (
                                      <div className="flex flex-col items-start gap-1">
                                        <button
                                          type="button"
                                          disabled={isMutating}
                                          onClick={() => void handleReinstateRoute(row)}
                                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                        >
                                          <RotateCcw size={13} />
                                          Re-instate
                                        </button>
                                        {((row.archiveRecovery.changedLocationCount + row.archiveRecovery.missingLocationCount) > 0) && (
                                          <span
                                            className="max-w-[190px] text-[10px] leading-4 text-amber-700"
                                            title={row.archiveRecovery.reason}
                                          >
                                            Some locations need manual review
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span
                                        className="max-w-[150px] cursor-help rounded-lg bg-amber-50 px-2.5 py-2 text-center text-[11px] font-semibold text-amber-800"
                                        title={
                                          row.archiveRecovery?.reason ??
                                          (archiveRecoveryLoading
                                            ? "Checking archive recovery status."
                                            : archiveRecoveryError ?? "Recovery status is unavailable; manual review is required.")
                                        }
                                      >
                                        {archiveRecoveryLoading
                                          ? "Checking recovery"
                                          : "Manual review"}
                                      </span>
                                    )
                                  )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-16 text-center"
                        >
                          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF1F8] text-[#102E4D]">
                            <RouteIcon size={25} />
                          </div>

                          <p className="mt-4 font-semibold text-slate-800">
                            {isLoading
                              ? "Loading records..."
                              : errorMessage
                                ? "Records could not be loaded"
                                : "No matching records"}
                          </p>

                          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                            {errorMessage ??
                              (isLoading
                                ? "Loading Route Management records."
                                : "Try another search term or filter.")}
                          </p>

                          {errorMessage && (
                            <button
                              type="button"
                              onClick={refreshData}
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

            {/* PAGINATION */}

            {scopedRows.length > 0 && (
              <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Showing{" "}
                  <span className="font-semibold text-slate-700">
                    {startItem}-{endItem}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-slate-700">
                    {scopedRows.length}
                  </span>{" "}
                  records
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((page) =>
                        Math.max(1, page - 1),
                      )
                    }
                    disabled={currentPage <= 1}
                    aria-label="Previous page"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </button>

                  {Array.from(
                    { length: totalPages },
                    (_, index) => index + 1,
                  ).map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() =>
                        setCurrentPage(page)
                      }
                      aria-label={`Page ${page}`}
                      aria-current={
                        currentPage === page
                          ? "page"
                          : undefined
                      }
                      className={`min-w-10 rounded-lg px-3 py-2 text-sm font-semibold ${
                        currentPage === page
                          ? "bg-[#102E4D] text-white"
                          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((page) =>
                        Math.min(totalPages, page + 1),
                      )
                    }
                    disabled={currentPage >= totalPages}
                    aria-label="Next page"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}

            <p className="mt-4 text-xs text-slate-400">
              New routes, stops, and terminals are submitted
              through Contributions. Archived records remain
              stored for audit and recovery.
            </p>
          </section>

          <footer className="pb-2 pt-8 text-center text-xs text-slate-400">
            QRoute · Route Management
          </footer>
        </div>
      </main>

      {/* =====================================================
          RECORD DETAILS DIALOG
      ====================================================== */}

      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-details-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2
                  id="record-details-title"
                  className="text-xl font-bold text-[#102E4D]"
                >
                  Record Details
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {selectedRow.entityType.replace(
                    "_",
                    " ",
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                aria-label="Close dialog"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-4">
              <Detail
                label="Name"
                value={selectedRow.name}
              />

              <Detail
                label="Transport type"
                value={selectedRow.transportTypeName}
              />

              <Detail
                label="Status"
                value={selectedRow.status}
              />

              {selectedRow.entityType !==
                "transport_type" && (
                <RouteManagementMap
                  points={recordMapPoints(selectedRow)}
                  routeColor={
                    data.transportTypes.find(
                      (type) =>
                        type.id ===
                        selectedRow.transportTypeId,
                    )?.color ?? "#2563eb"
                  }
                />
              )}

              {isRouteRecord(selectedRow.record) && (
                <>
                  <Detail
                    label="Transport variant"
                    value={
                      selectedRow.record
                        .transport_variants?.code ??
                      "Unavailable"
                    }
                  />

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-700">
                      Ordered stops
                    </h3>

                    <ol className="space-y-2">
                      {selectedRow.record.route_stops.map(
                        (stop) => (
                          <li
                            key={stop.id}
                            className="rounded-lg bg-slate-50 px-3 py-2 text-sm"
                          >
                            {stop.stop_order}.{" "}
                            {stop.terminals?.name ??
                              stop.stops?.name ??
                              "Point unavailable"}
                          </li>
                        ),
                      )}
                    </ol>
                  </div>
                </>
              )}

              {!isRouteRecord(selectedRow.record) &&
                !isTransportTypeRecord(
                  selectedRow.record,
                ) && (
                  <>
                    <p className="text-right text-xs text-slate-500">
                      Coordinates:{" "}
                      {selectedRow.record.latitude},{" "}
                      {selectedRow.record.longitude}
                    </p>

                    {selectedRow.record.description && (
                      <Detail
                        label="Description"
                        value={
                          selectedRow.record.description
                        }
                      />
                    )}
                  </>
                )}

              {(selectedRow.entityType === "stop" ||
                selectedRow.entityType === "terminal") && (
                <section className="border-t border-slate-200 pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Submitted photographs
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Review each photograph attached directly to this {selectedRow.entityType}.
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {reviewImages.length} {reviewImages.length === 1 ? "photo" : "photos"}
                    </span>
                  </div>

                  {reviewImagesError && (
                    <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {reviewImagesError}
                    </p>
                  )}

                  {reviewImagesLoading ? (
                    <p role="status" className="mt-4 rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                      Loading photographs and secure previews...
                    </p>
                  ) : reviewImages.length > 0 ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {reviewImages.map((image) => {
                        const pointRecord = isTransitPointRecord(selectedRow.record)
                          ? selectedRow.record
                          : null;
                        const parentAllowsImageApproval = Boolean(
                          pointRecord &&
                          pointRecord.moderation_status === "approved" &&
                          pointRecord.is_approved === true &&
                          pointRecord.is_active === true &&
                          pointRecord.is_banned !== true &&
                          pointRecord.is_deleted !== true,
                        );

                        return (
                          <MapImageReviewCard
                            key={image.id}
                            image={image}
                            canModerate={isAdmin}
                            canApprove={parentAllowsImageApproval}
                            isMutating={isMutating}
                            onModerate={handleMapImageModeration}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-7 text-center text-sm text-slate-500">
                      No photographs have been submitted for this location.
                    </p>
                  )}

                  {role && selectedRow.moderationStatus === "pending" &&
                    !selectedRow.isDeleted && !selectedRow.isBanned && (
                    <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => void handleModeration(selectedRow, "reject")}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        <Ban size={15} /> Reject submission
                      </button>
                      {selectedRow.isActive && (
                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() => void handleModeration(selectedRow, "approve")}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          <Check size={15} /> Approve submission
                        </button>
                      )}
                    </div>
                  )}
                </section>
              )}

              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="mt-3 w-full rounded-lg bg-[#102E4D] px-4 py-3 text-sm font-semibold text-white hover:bg-[#19476D]"
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {/* =====================================================
          ROUTE CHANGE PROPOSAL REVIEW DIALOG
      ====================================================== */}

      {selectedProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[2px] sm:p-5">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="proposal-review-title"
            className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
              <div>
                <h2 id="proposal-review-title" className="text-lg font-bold text-[#102E4D]">
                  Review route-change proposal #{selectedProposal.id}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Inspect the complete proposed route sequence and photographs attached to each proposed point.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProposal(null)}
                aria-label="Close proposal review"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
              <RouteChangeProposalCard
                proposal={selectedProposal}
                route={data.routes.find((route) => route.id === selectedProposal.route_id)}
                canModerate={role !== null}
                isMutating={isMutating}
                onModerate={handleRouteChangeProposalModeration}
              />

              <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Photographs by proposed route point
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Each image group is matched using its proposed sequence position, not the original route position.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {reviewImages.length} {reviewImages.length === 1 ? "photo" : "photos"}
                  </span>
                </div>

                {reviewImagesError && (
                  <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {reviewImagesError}
                  </p>
                )}

                {reviewImagesLoading ? (
                  <p role="status" className="mt-4 rounded-lg bg-slate-50 px-4 py-7 text-center text-sm text-slate-500">
                    Loading proposal photographs and secure previews...
                  </p>
                ) : (
                  reviewImages.length > 0 ? (
                    <div className="mt-4 space-y-5">
                      {proposalPoints(selectedProposal)
                      .filter((point) => !point.is_removed_from_route && point.proposed_stop_order > 0)
                      .map((point) => {
                        const pointImages = reviewImages.filter(
                          (image) => image.proposalStopOrder === point.proposed_stop_order,
                        );

                        return (
                          <section key={`${selectedProposal.id}-photos-${point.proposed_stop_order}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Proposed point #{point.proposed_stop_order}
                                </p>
                                <h4 className="mt-1 text-sm font-bold text-slate-800">
                                  {proposalPointName(point)}
                                </h4>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {proposalPointType(point)}
                                </p>
                              </div>
                              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                                {pointImages.length} {pointImages.length === 1 ? "photo" : "photos"}
                              </span>
                            </div>

                            {pointImages.length > 0 ? (
                              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {pointImages.map((image) => (
                                  <MapImageReviewCard
                                    key={image.id}
                                    image={image}
                                    canModerate={isAdmin}
                                    canApprove={false}
                                    isMutating={isMutating}
                                    onModerate={handleMapImageModeration}
                                  />
                                ))}
                              </div>
                            ) : (
                              <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-5 text-center text-xs text-slate-500">
                                No photographs were submitted for this proposed point.
                              </p>
                            )}
                          </section>
                        );
                      })}

                    {reviewImages.some((image) =>
                      !proposalPoints(selectedProposal).some(
                        (point) =>
                          !point.is_removed_from_route &&
                          point.proposed_stop_order === image.proposalStopOrder,
                      ),
                    ) && (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Some photographs could not be matched to an active proposed point. Review the proposal data before approving it.
                      </p>
                    )}

                    </div>
                  ) : (
                    <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-7 text-center text-sm text-slate-500">
                      No photographs were submitted with this route-change proposal.
                    </p>
                  )
                )}

                <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  Pending proposal photographs may be rejected individually. Remaining pending photographs are automatically approved or rejected with the parent proposal decision.
                </p>
              </section>
            </div>
          </section>
        </div>
      )}

      {/* =====================================================
          RECORD EDITOR DIALOG
      ====================================================== */}

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-editor-title"
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2
                  id="record-editor-title"
                  className="text-xl font-bold text-[#102E4D]"
                >
                  {editor.entityType ===
                  "transport_type"
                    ? editor.id === null
                      ? "Add Transport Type"
                      : "Edit Transport Type"
                    : `Edit ${editor.entityType}`}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Changes are authorized and audited by the server.
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditor}
                aria-label="Close dialog"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            {isEditorLoading ? (
              <p
                role="status"
                className="py-8 text-center text-sm text-slate-500"
              >
                Loading route options...
              </p>
            ) : (
              <div className="space-y-4">
                {/* NAME */}

                <label className="block text-sm font-semibold text-slate-700">
                  Name

                  <input
                    value={editor.name}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        name: event.target.value,
                      })
                    }
                    maxLength={
                      editor.entityType === "route"
                        ? 180
                        : 120
                    }
                    className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-[#102E4D]"
                  />
                </label>

                {/* TRANSPORT TYPE COLOR */}

                {editor.entityType ===
                  "transport_type" && (
                  <label className="block text-sm font-semibold text-slate-700">
                    Color

                    <input
                      type="color"
                      value={
                        /^#[0-9A-Fa-f]{6}$/.test(
                          editor.color,
                        )
                          ? editor.color
                          : "#123456"
                      }
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          color: event.target.value,
                        })
                      }
                      className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-2"
                    />
                  </label>
                )}

                {/* ROUTE EDITOR */}

                {editor.entityType === "route" && (
                  <>
                    <label className="block text-sm font-semibold text-slate-700">
                      Transport type

                      <select
                        value={
                          editor.transportTypeId ?? ""
                        }
                        onChange={(event) => {
                          const nextId = event.target.value
                            ? Number(event.target.value)
                            : null;

                          setEditor({
                            ...editor,
                            transportTypeId: nextId,
                            variantId: null,
                          });
                        }}
                        className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"
                      >
                        <option value="">
                          Choose a type
                        </option>

                        {data.transportTypes.map(
                          (type) => (
                            <option
                              key={type.id}
                              value={type.id}
                            >
                              {type.name}
                            </option>
                          ),
                        )}
                      </select>
                    </label>

                    <label className="block text-sm font-semibold text-slate-700">
                      Transport variant

                      <select
                        value={editor.variantId ?? ""}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            variantId: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                        disabled={!editor.transportTypeId}
                        className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal disabled:bg-slate-50"
                      >
                        <option value="">
                          Choose a variant
                        </option>

                        {variants
                          .filter(
                            (variant) =>
                              variant.transport_type_id ===
                              editor.transportTypeId,
                          )
                          .map((variant) => (
                            <option
                              key={variant.id}
                              value={variant.id}
                            >
                              {variant.name} ({variant.code})
                            </option>
                          ))}
                      </select>
                    </label>

                    {/* ORDERED ROUTE STOPS */}

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700">
                          Ordered stops
                        </span>

                        <span className="text-xs text-slate-400">
                          {editor.stops.length} of 100
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <select
                          value={pointToAdd}
                          onChange={(event) =>
                            setPointToAdd(
                              event.target.value,
                            )
                          }
                          aria-label="Choose stop or terminal"
                          className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                        >
                          <option value="">
                            Add an approved stop or terminal
                          </option>

                          {availablePoints.map((point) => (
                            <option
                              key={pointKey(
                                point.kind,
                                point.id,
                              )}
                              value={pointKey(
                                point.kind,
                                point.id,
                              )}
                            >
                              {point.name} ·{" "}
                              {pointKindLabel(point)}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={addRoutePoint}
                          disabled={!pointToAdd}
                          className="rounded-lg border border-slate-200 px-3 text-sm font-semibold disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>

                      <ol className="mt-3 space-y-2">
                        {editor.stops.map(
                          (stop, index) => (
                            <li
                              key={`${stop.kind}-${stop.id}-${index}`}
                              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                            >
                              <span className="flex-1">
                                {index + 1}. {stop.name}{" "}
                                <span className="text-xs text-slate-500">
                                  ({stop.kindLabel})
                                </span>
                              </span>

                              <button
                                type="button"
                                aria-label={`Move ${stop.name} up`}
                                disabled={index === 0}
                                onClick={() => {
                                  const items = [
                                    ...editor.stops,
                                  ];

                                  [
                                    items[index - 1],
                                    items[index],
                                  ] = [
                                    items[index],
                                    items[index - 1],
                                  ];

                                  setEditor({
                                    ...editor,
                                    stops: items,
                                  });
                                }}
                                className="rounded p-1 disabled:opacity-30"
                              >
                                <ChevronUp size={15} />
                              </button>

                              <button
                                type="button"
                                aria-label={`Move ${stop.name} down`}
                                disabled={
                                  index ===
                                  editor.stops.length - 1
                                }
                                onClick={() => {
                                  const items = [
                                    ...editor.stops,
                                  ];

                                  [
                                    items[index + 1],
                                    items[index],
                                  ] = [
                                    items[index],
                                    items[index + 1],
                                  ];

                                  setEditor({
                                    ...editor,
                                    stops: items,
                                  });
                                }}
                                className="rounded p-1 disabled:opacity-30"
                              >
                                <ChevronDown size={15} />
                              </button>

                              <button
                                type="button"
                                aria-label={`Remove ${stop.name}`}
                                onClick={() =>
                                  setEditor({
                                    ...editor,
                                    stops:
                                      editor.stops.filter(
                                        (_, stopIndex) =>
                                          stopIndex !== index,
                                      ),
                                  })
                                }
                                className="rounded p-1 text-red-600"
                              >
                                <X size={15} />
                              </button>
                            </li>
                          ),
                        )}
                      </ol>
                    </div>

                    <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={editor.isActive}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            isActive:
                              event.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-[#102E4D]"
                      />

                      Route is active
                    </label>
                  </>
                )}

                {/* STOP / TERMINAL TRANSPORT TYPE */}

                {(editor.entityType === "stop" ||
                  editor.entityType === "terminal") && (
                  <label className="block text-sm font-semibold text-slate-700">
                    Transport type

                    <select
                      value={
                        editor.transportTypeId ?? ""
                      }
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          transportTypeId: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                      className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"
                    >
                      <option value="">
                        Unassigned
                      </option>

                      {data.transportTypes.map((type) => (
                        <option
                          key={type.id}
                          value={type.id}
                        >
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {/* MAP */}

                {editor.entityType !==
                  "transport_type" && (
                  <>
                    <RouteManagementMap
                      points={editorPoints}
                      selectedPosition={editorMapPosition}
                      editable={
                        editor.entityType === "stop" ||
                        editor.entityType === "terminal"
                      }
                      onPick={
                        editor.entityType === "stop" ||
                        editor.entityType === "terminal"
                          ? ([latitude, longitude]) =>
                              setEditor({
                                ...editor,
                                latitude: String(latitude),
                                longitude: String(longitude),
                              })
                          : undefined
                      }
                      routeColor={
                        data.transportTypes.find(
                          (type) =>
                            type.id ===
                            editor.transportTypeId,
                        )?.color ?? "#2563eb"
                      }
                    />

                    {editorMapPosition && (
                      <p className="text-right text-xs text-slate-500">
                        Selected coordinates:{" "}
                        {editor.latitude},{" "}
                        {editor.longitude}. Click or drag the
                        marker to reposition; changes apply
                        when saved.
                      </p>
                    )}
                  </>
                )}

                {/* STOP / TERMINAL FIELDS */}

                {(editor.entityType === "stop" ||
                  editor.entityType === "terminal") && (
                  <>
                    {editor.entityType === "stop" && (
                      <>
                        <label className="block text-sm font-semibold text-slate-700">
                          Stop type

                          <select
                            value={editor.stopType}
                            onChange={(event) => {
                              const stopType =
                                event.target.value;

                              if (
                                stopType === "road_stop" ||
                                stopType === "train_station"
                              ) {
                                setEditor({
                                  ...editor,
                                  stopType,
                                });
                              }
                            }}
                            className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"
                          >
                            <option value="road_stop">
                              Road stop
                            </option>

                            <option value="train_station">
                              Train station
                            </option>
                          </select>
                        </label>

                        <label className="block text-sm font-semibold text-slate-700">
                          Description

                          <textarea
                            value={editor.description}
                            maxLength={500}
                            onChange={(event) =>
                              setEditor({
                                ...editor,
                                description:
                                  event.target.value,
                              })
                            }
                            rows={3}
                            className="mt-1.5 w-full rounded-lg border border-slate-300 p-3 font-normal"
                          />
                        </label>
                      </>
                    )}

                    <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={editor.isActive}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            isActive:
                              event.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-[#102E4D]"
                      />

                      Record is active
                    </label>
                  </>
                )}

                {/* EDITOR ERROR */}

                {editorError && (
                  <p
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  >
                    {editorError}
                  </p>
                )}

                {/* EDITOR ACTIONS */}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeEditor}
                    className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => void saveEditor()}
                    disabled={
                      isSaving || isEditorLoading
                    }
                    className="rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#19476D] disabled:opacity-50"
                  >
                    {isSaving
                      ? "Saving..."
                      : "Save changes"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
