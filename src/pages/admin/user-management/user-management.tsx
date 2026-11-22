import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useNavigate } from "react-router-dom";

import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";
import AdminNotificationBell from "@/components/admin/AdminNotificationBell";
import { useAccountProfile } from "@/components/account/accountProfileStore";

import {
  AdminApiError,
  applyAdminUserRestriction,
  getAdminUserModerationHistory,
  getAdminUsersPage,
  setAdminUserRole,
  type AdminUserManagementStatus,
  type AdminUserModerationHistoryItem,
  type AdminUserPageSize,
  type AdminUserRecord,
  type AdminUserRestrictionAction,
  type AdminUserRole,
} from "@/lib/adminApi";

import { logoutCurrentDevice } from "@/lib/authLogout";

import {
  getSessionSnapshot,
  isCurrentAuthenticatedSession,
  subscribeSessionState,
} from "@/lib/sessionCoordinator";

import { getAdminNavigationDestination } from "@/pages/admin/adminNavigation";

import {
  LayoutDashboard,
  Route as RouteIcon,
  Receipt,
  FileText,
  Flag,
  Users,
  Settings,
  Search,
  MapPinned,
  Menu,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  UserRound,
  Ban as BanIcon,
  ShieldCheck,
  Shield,
  LogOut,
  Clock,
  History,
  LockKeyhole,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */

type DurationUnit = "minutes" | "hours" | "days";

type ActionNotice = {
  type: "success" | "warning";
  message: string;
};

type UserAvatarProps = {
  photoUrl: string | null;
  displayName: string;
  size?: "table" | "details";
};

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Route Management", icon: RouteIcon },
  { label: "Fare Management", icon: Receipt },
  { label: "Post Management", icon: FileText },
  { label: "Reports", icon: Flag },
  { label: "User Management", icon: Users },
  { label: "Settings", icon: Settings },
];

const FILTER_OPTIONS: {
  label: string;
  value: AdminUserManagementStatus;
}[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Muted", value: "muted" },
  { label: "Banned", value: "banned" },
  { label: "Deleted", value: "deleted" },
];

const PAGE_SIZE_OPTIONS: AdminUserPageSize[] = [
  10,
  25,
  50,
  100,
];

const MAX_RESTRICTION_SECONDS = 365 * 24 * 60 * 60;
const SEARCH_DEBOUNCE_MS = 350;

const DURATION_FACTORS: Record<DurationUnit, number> = {
  minutes: 60,
  hours: 60 * 60,
  days: 24 * 60 * 60,
};

/* -------------------------------------------------------------------------- */
/*                              FORMAT HELPERS                                */
/* -------------------------------------------------------------------------- */

function formatCreatedAt(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString();
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "No expiration";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString();
}

function getDisplayName(user: AdminUserRecord): string {
  return user.displayName.trim() || "Unnamed user";
}

function getUserStatusBadges(
  user: AdminUserRecord,
): { label: string; className: string }[] {
  const badges: {
    label: string;
    className: string;
  }[] = [];

  if (user.isDeleted) {
    badges.push({
      label: "Deleted",
      className: "bg-slate-100 text-slate-600",
    });
  }

  if (user.isBanned) {
    badges.push({
      label: user.isPermanentBan
        ? "Permanently banned"
        : "Banned",
      className: "bg-red-50 text-red-700",
    });
  }

  if (user.isMuted) {
    badges.push({
      label: "Muted",
      className: "bg-amber-50 text-amber-700",
    });
  }

  if (badges.length === 0) {
    badges.push({
      label: "Active",
      className: "bg-green-50 text-green-700",
    });
  }

  return badges;
}

function getRestrictionActionLabel(
  action: AdminUserRestrictionAction,
): string {
  switch (action) {
    case "mute":
      return "Mute";

    case "unmute":
      return "Unmute";

    case "ban_temporary":
      return "Temporary ban";

    case "ban_permanent":
      return "Permanent ban";

    case "unban":
      return "Unban";

    default:
      return "Restriction";
  }
}

function getRestrictionSuccessMessage(
  action: AdminUserRestrictionAction,
  displayName: string,
): string {
  switch (action) {
    case "mute":
      return `${displayName} has been muted.`;

    case "unmute":
      return `${displayName} has been unmuted.`;

    case "ban_temporary":
      return `${displayName} has been temporarily banned.`;

    case "ban_permanent":
      return `${displayName} has been permanently banned.`;

    case "unban":
      return `${displayName} has been unbanned.`;

    default:
      return "The restriction was updated.";
  }
}

/* -------------------------------------------------------------------------- */
/*                              PROFILE AVATAR                                */
/* -------------------------------------------------------------------------- */

function UserAvatar({
  photoUrl,
  displayName,
  size = "table",
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [photoUrl]);

  const dimensions =
    size === "details"
      ? "h-20 w-20"
      : "h-10 w-10";

  const iconSize =
    size === "details"
      ? 34
      : 18;

  if (photoUrl && !imageFailed) {
    return (
      <img
        src={photoUrl}
        alt={`${displayName} profile`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setImageFailed(true)}
        className={`${dimensions} shrink-0 rounded-full border border-slate-200 bg-[#DCE9F7] object-cover`}
      />
    );
  }

  return (
    <div
      className={`flex ${dimensions} shrink-0 items-center justify-center rounded-full bg-[#DCE9F7] text-[#102E4D]`}
      aria-label={`${displayName} profile placeholder`}
    >
      <UserRound size={iconSize} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              MAIN COMPONENT                                */
/* -------------------------------------------------------------------------- */

export default function UserManagement() {
  const navigate = useNavigate();
  const { userId, account } = useAccountProfile();

  /* ------------------------------------------------------------------------ */
  /*                        SESSION COORDINATOR                               */
  /* ------------------------------------------------------------------------ */

  const sessionSnapshot = useSyncExternalStore(
    subscribeSessionState,
    getSessionSnapshot,
    getSessionSnapshot,
  );

  const sessionIdentity =
    sessionSnapshot.status === "authenticated" &&
    sessionSnapshot.purpose === "authenticated"
      ? sessionSnapshot.identity
      : null;

  /**
   * This verifies that an operation still belongs to the active
   * authenticated session and that the session generation has not changed.
   *
   * User ID equality alone is not sufficient because the same account
   * can sign out and establish a different session.
   */
  const isExpectedSessionCurrent = useCallback(
    (identity: typeof sessionIdentity): boolean => {
      return Boolean(
        identity &&
          identity.userId === userId &&
          isCurrentAuthenticatedSession(identity),
      );
    },
    [userId],
  );

  /* ------------------------------------------------------------------------ */
  /*                              ADMIN PROFILE                               */
  /* ------------------------------------------------------------------------ */

  // Do not use account.username as a fallback.
  // Usernames must never be displayed on this page.
  const adminDisplayName =
    account?.displayName?.trim() || "Administrator";

  const adminEmail =
    account?.email || "Administrator";

  const adminInitials = adminDisplayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  /* ------------------------------------------------------------------------ */
  /*                                  STATE                                   */
  /* ------------------------------------------------------------------------ */

  const [users, setUsers] = useState<AdminUserRecord[]>([]);

  const [totalCount, setTotalCount] = useState(0);

  const [page, setPage] = useState(1);

  const [pageSize, setPageSize] =
    useState<AdminUserPageSize>(25);

  const [totalPages, setTotalPages] = useState(0);

  const [searchTerm, setSearchTerm] = useState("");

  const [debouncedSearch, setDebouncedSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState<AdminUserManagementStatus>("all");

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const [retryCount, setRetryCount] = useState(0);

  const [actionError, setActionError] =
    useState<string | null>(null);

  const [actionNotice, setActionNotice] =
    useState<ActionNotice | null>(null);

  /* ------------------------------------------------------------------------ */
  /*                              LOGOUT STATE                                */
  /* ------------------------------------------------------------------------ */

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [logoutError, setLogoutError] =
    useState<string | null>(null);

  /* ------------------------------------------------------------------------ */
  /*                           SELECTED USER STATE                            */
  /* ------------------------------------------------------------------------ */

  const [selectedUserId, setSelectedUserId] =
    useState<string | null>(null);

  const selectedUser = useMemo(
    () =>
      selectedUserId
        ? users.find((user) => user.id === selectedUserId) ?? null
        : null,
    [users, selectedUserId],
  );

  /* ------------------------------------------------------------------------ */
  /*                           ROLE CHANGE STATE                              */
  /* ------------------------------------------------------------------------ */

  const [roleChangeTargetId, setRoleChangeTargetId] =
    useState<string | null>(null);

  const [updatingRoleUserId, setUpdatingRoleUserId] =
    useState<string | null>(null);

  const [roleError, setRoleError] =
    useState<string | null>(null);

  const roleChangeTarget = useMemo(
    () =>
      roleChangeTargetId
        ? users.find((user) => user.id === roleChangeTargetId) ?? null
        : null,
    [users, roleChangeTargetId],
  );

  const nextRole: AdminUserRole | null =
    roleChangeTarget
      ? roleChangeTarget.role === "admin"
        ? "registered_user"
        : "admin"
      : null;

  /* ------------------------------------------------------------------------ */
  /*                         RESTRICTION DIALOG STATE                         */
  /* ------------------------------------------------------------------------ */

  const [restrictionUserId, setRestrictionUserId] =
    useState<string | null>(null);

  const [restrictionAction, setRestrictionAction] =
    useState<AdminUserRestrictionAction>("mute");

  const [restrictionReason, setRestrictionReason] =
    useState("");

  const [durationAmount, setDurationAmount] =
    useState("1");

  const [durationUnit, setDurationUnit] =
    useState<DurationUnit>("days");

  const [indefiniteMute, setIndefiniteMute] =
    useState(false);

  const [isApplyingRestriction, setIsApplyingRestriction] =
    useState(false);

  const [restrictionError, setRestrictionError] =
    useState<string | null>(null);

  const restrictionTarget = useMemo(
    () =>
      restrictionUserId
        ? users.find((user) => user.id === restrictionUserId) ?? null
        : null,
    [users, restrictionUserId],
  );

  /* ------------------------------------------------------------------------ */
  /*                         MODERATION HISTORY STATE                         */
  /* ------------------------------------------------------------------------ */

  const [historyVisible, setHistoryVisible] =
    useState(false);

  const [historyItems, setHistoryItems] =
    useState<AdminUserModerationHistoryItem[]>([]);

  const [historyLoading, setHistoryLoading] =
    useState(false);

  const [historyError, setHistoryError] =
    useState<string | null>(null);

  const [historyLoadedFor, setHistoryLoadedFor] =
    useState<string | null>(null);

  /* ------------------------------------------------------------------------ */
  /*                           PAGINATION HELPERS                             */
  /* ------------------------------------------------------------------------ */

  const pageNumbers = useMemo(() => {
    if (totalPages <= 0) {
      return [];
    }

    const firstPage = Math.max(1, page - 2);
    const lastPage = Math.min(totalPages, page + 2);

    return Array.from(
      { length: lastPage - firstPage + 1 },
      (_, index) => firstPage + index,
    );
  }, [page, totalPages]);

  const firstResult =
    totalCount === 0
      ? 0
      : (page - 1) * pageSize + 1;

  const lastResult =
    totalCount === 0
      ? 0
      : Math.min(page * pageSize, totalCount);

  /* ------------------------------------------------------------------------ */
  /*                           PAGE STATISTICS                                */
  /* ------------------------------------------------------------------------ */

  /*
   * These four statistics describe the currently loaded page only.
   * The complete user list is deliberately not downloaded to calculate
   * global status counts.
   */

  const activeCount = users.filter(
    (user) => !user.isDeleted && !user.isBanned,
  ).length;

  const bannedCount = users.filter(
    (user) => user.isBanned,
  ).length;

  const mutedCount = users.filter(
    (user) => user.isMuted,
  ).length;

  const deletedCount = users.filter(
    (user) => user.isDeleted,
  ).length;

  /* ------------------------------------------------------------------------ */
  /*                       SESSION CHANGE CLEANUP                             */
  /* ------------------------------------------------------------------------ */

  /**
   * A user-specific page must not retain the previous account's data,
   * dialogs, selected records, or moderation history after a new session
   * generation becomes active.
   *
   * Search and status filters are intentionally preserved.
   */
  useEffect(() => {
    setUsers([]);
    setTotalCount(0);
    setTotalPages(0);
    setPage(1);

    setSelectedUserId(null);

    setRoleChangeTargetId(null);
    setUpdatingRoleUserId(null);
    setRoleError(null);

    setRestrictionUserId(null);
    setIsApplyingRestriction(false);
    setRestrictionError(null);

    setHistoryVisible(false);
    setHistoryItems([]);
    setHistoryLoading(false);
    setHistoryError(null);
    setHistoryLoadedFor(null);

    setActionError(null);
    setActionNotice(null);

    setLogoutError(null);
    setIsLoggingOut(false);

    setErrorMessage(null);
    setIsLoading(true);
  }, [userId, sessionIdentity?.generation]);

  /* ------------------------------------------------------------------------ */
  /*                             SEARCH DEBOUNCE                              */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchTerm]);

  /* ------------------------------------------------------------------------ */
  /*                             DATA REFRESH                                 */
  /* ------------------------------------------------------------------------ */

  /**
   * Refreshes the current server-side page after an administrative action.
   *
   * The caller must provide the identity that initiated the action.
   * This prevents a refresh started by an older session from replacing
   * the current account's user list.
   */
  const refreshUsers = useCallback(
    async (expectedIdentity: typeof sessionIdentity) => {
      if (
        !userId ||
        !expectedIdentity ||
        expectedIdentity.userId !== userId ||
        !isCurrentAuthenticatedSession(expectedIdentity)
      ) {
        throw new Error(
          "The active session changed. Please refresh the page.",
        );
      }

      setIsLoading(true);

      try {
        const data = await getAdminUsersPage(userId, {
          page,
          pageSize,
          search: debouncedSearch,
          status: statusFilter,
        });

        if (!isCurrentAuthenticatedSession(expectedIdentity)) {
          return null;
        }

        setUsers(data.users);
        setTotalCount(data.totalCount);
        setTotalPages(data.totalPages);
        setPage(data.page);
        setPageSize(data.pageSize);

        setSelectedUserId((currentId) => {
          if (
            currentId &&
            !data.users.some((user) => user.id === currentId)
          ) {
            return null;
          }

          return currentId;
        });

        setErrorMessage(null);

        return data;
      } finally {
        if (isCurrentAuthenticatedSession(expectedIdentity)) {
          setIsLoading(false);
        }
      }
    },
    [
      userId,
      page,
      pageSize,
      debouncedSearch,
      statusFilter,
    ],
  );

  /* ------------------------------------------------------------------------ */
  /*                             INITIAL DATA LOAD                            */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    let active = true;

    const loadUsers = async () => {
      setErrorMessage(null);

      const waitingForSession =
        sessionSnapshot.status === "initializing" ||
        sessionSnapshot.status === "validating";

      /**
       * Do not prematurely report an authentication failure while the
       * coordinator is still initializing or validating the session.
       */
      if (waitingForSession && !sessionIdentity) {
        setUsers([]);
        setTotalCount(0);
        setTotalPages(0);
        setIsLoading(true);
        return;
      }

      if (!userId) {
        setUsers([]);
        setTotalCount(0);
        setTotalPages(0);
        setIsLoading(false);

        setErrorMessage(
          "Please sign in to view user management.",
        );

        return;
      }

      const identity = sessionIdentity;

      if (
        !identity ||
        identity.userId !== userId ||
        !isCurrentAuthenticatedSession(identity)
      ) {
        setUsers([]);
        setTotalCount(0);
        setTotalPages(0);
        setIsLoading(false);

        setErrorMessage(
          "The active authenticated session could not be verified.",
        );

        return;
      }

      setIsLoading(true);

      try {
        const data = await getAdminUsersPage(userId, {
          page,
          pageSize,
          search: debouncedSearch,
          status: statusFilter,
        });

        /**
         * Both checks matter:
         * - active ensures this specific effect has not been cleaned up.
         * - isCurrentAuthenticatedSession ensures the request still belongs
         *   to the active authenticated session generation.
         */
        if (
          !active ||
          !isCurrentAuthenticatedSession(identity)
        ) {
          return;
        }

        setUsers(data.users);
        setTotalCount(data.totalCount);
        setTotalPages(data.totalPages);
        setPage(data.page);
        setPageSize(data.pageSize);

        setSelectedUserId((currentId) => {
          if (
            currentId &&
            !data.users.some((user) => user.id === currentId)
          ) {
            return null;
          }

          return currentId;
        });

        setErrorMessage(null);
      } catch (error: unknown) {
        if (
          !active ||
          !isCurrentAuthenticatedSession(identity)
        ) {
          return;
        }

        setUsers([]);
        setTotalCount(0);
        setTotalPages(0);

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load user accounts.",
        );
      } finally {
        if (
          active &&
          isCurrentAuthenticatedSession(identity)
        ) {
          setIsLoading(false);
        }
      }
    };

    void loadUsers();

    return () => {
      active = false;
    };
  }, [
    userId,
    sessionIdentity?.generation,
    sessionSnapshot.status,
    page,
    pageSize,
    debouncedSearch,
    statusFilter,
    retryCount,
  ]);

  /* ------------------------------------------------------------------------ */
  /*                           SEARCH AND FILTERS                             */
  /* ------------------------------------------------------------------------ */

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const handleStatusFilterChange = (
    value: AdminUserManagementStatus,
  ) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    const parsedValue = Number(value);

    if (
      PAGE_SIZE_OPTIONS.includes(
        parsedValue as AdminUserPageSize,
      )
    ) {
      setPageSize(parsedValue as AdminUserPageSize);
      setPage(1);
    }
  };

  const goToPage = (nextPage: number) => {
    if (
      nextPage < 1 ||
      nextPage > totalPages ||
      nextPage === page
    ) {
      return;
    }

    setPage(nextPage);
  };

  /* ------------------------------------------------------------------------ */
  /*                                LOGOUT                                    */
  /* ------------------------------------------------------------------------ */

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

  /* ------------------------------------------------------------------------ */
  /*                              RETRY LOADING                              */
  /* ------------------------------------------------------------------------ */

  const retryLoadingUsers = () => {
    setErrorMessage(null);
    setRetryCount((count) => count + 1);
  };

  /* ------------------------------------------------------------------------ */
  /*                           USER DETAILS MODAL                             */
  /* ------------------------------------------------------------------------ */

  const openUserDetails = (targetUser: AdminUserRecord) => {
    setSelectedUserId(targetUser.id);

    setActionError(null);
    setActionNotice(null);

    setHistoryVisible(false);
    setHistoryItems([]);
    setHistoryLoading(false);
    setHistoryError(null);
    setHistoryLoadedFor(null);
  };

  const closeUserDetails = () => {
    setSelectedUserId(null);

    setHistoryVisible(false);
    setHistoryItems([]);
    setHistoryLoading(false);
    setHistoryError(null);
    setHistoryLoadedFor(null);
  };

  /* ------------------------------------------------------------------------ */
  /*                           ROLE CHANGE ACTION                             */
  /* ------------------------------------------------------------------------ */

  const openRoleChangeDialog = (
    targetUser: AdminUserRecord,
  ) => {
    if (
      targetUser.isDeleted ||
      targetUser.id === userId
    ) {
      return;
    }

    setSelectedUserId(null);
    setRoleChangeTargetId(targetUser.id);
    setRoleError(null);
    setActionError(null);
    setActionNotice(null);
  };

  const closeRoleChangeDialog = () => {
    if (updatingRoleUserId) {
      return;
    }

    setRoleChangeTargetId(null);
    setRoleError(null);
  };

  const handleConfirmRoleChange = async () => {
    const identity = sessionIdentity;

    if (
      !userId ||
      !identity ||
      !isExpectedSessionCurrent(identity) ||
      !roleChangeTarget ||
      !nextRole
    ) {
      setRoleError(
        "The active session could not be verified. Please try again.",
      );
      return;
    }

    if (
      roleChangeTarget.isDeleted ||
      roleChangeTarget.id === userId
    ) {
      setRoleError(
        "This account is not eligible for a role change.",
      );
      return;
    }

    const targetUserId = roleChangeTarget.id;
    const targetDisplayName = getDisplayName(roleChangeTarget);
    const requestedRole = nextRole;

    setUpdatingRoleUserId(targetUserId);
    setRoleError(null);

    try {
      await setAdminUserRole(
        userId,
        targetUserId,
        requestedRole,
      );

      if (!isCurrentAuthenticatedSession(identity)) {
        return;
      }

      setRoleChangeTargetId(null);

      setActionNotice({
        type: "success",
        message:
          requestedRole === "admin"
            ? `${targetDisplayName} is now an administrator.`
            : `${targetDisplayName} is now a registered user.`,
      });

      try {
        await refreshUsers(identity);

        if (!isCurrentAuthenticatedSession(identity)) {
          return;
        }
      } catch {
        if (!isCurrentAuthenticatedSession(identity)) {
          return;
        }

        setActionNotice({
          type: "warning",
          message:
            "The role change was saved, but the user list could not be refreshed. Reload the page to view the latest role.",
        });
      }
    } catch (error: unknown) {
      if (!isCurrentAuthenticatedSession(identity)) {
        return;
      }

      setRoleError(
        error instanceof Error
          ? error.message
          : "Unable to update the user's role.",
      );
    } finally {
      if (isCurrentAuthenticatedSession(identity)) {
        setUpdatingRoleUserId(null);
      }
    }
  };

  /* ------------------------------------------------------------------------ */
  /*                       RESTRICTION DIALOG ACTIONS                         */
  /* ------------------------------------------------------------------------ */

  const openRestrictionDialog = (
    targetUser: AdminUserRecord,
  ) => {
    if (
      targetUser.isDeleted ||
      targetUser.role !== "registered_user"
    ) {
      return;
    }

    setSelectedUserId(null);

    setRestrictionUserId(targetUser.id);

    setRestrictionAction(
      targetUser.isMuted
        ? "unmute"
        : targetUser.isBanned
          ? "unban"
          : "mute",
    );

    setRestrictionReason("");
    setDurationAmount("1");
    setDurationUnit("days");
    setIndefiniteMute(false);
    setRestrictionError(null);

    setActionError(null);
    setActionNotice(null);
  };

  const closeRestrictionDialog = () => {
    if (isApplyingRestriction) {
      return;
    }

    setRestrictionUserId(null);
    setRestrictionError(null);
  };

  const handleRestrictionActionChange = (
    action: AdminUserRestrictionAction,
  ) => {
    setRestrictionAction(action);
    setRestrictionReason("");
    setRestrictionError(null);
    setIndefiniteMute(false);
  };

  const calculateDurationSeconds = (): number | null => {
    const amount = Number(durationAmount);

    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      return null;
    }

    const seconds =
      amount * DURATION_FACTORS[durationUnit];

    if (
      !Number.isSafeInteger(seconds) ||
      seconds < 60 ||
      seconds > MAX_RESTRICTION_SECONDS
    ) {
      return null;
    }

    return seconds;
  };

  const handleApplyRestriction = async () => {
    const identity = sessionIdentity;

    if (
      !userId ||
      !identity ||
      !isExpectedSessionCurrent(identity) ||
      !restrictionTarget
    ) {
      setRestrictionError(
        "The active session could not be verified. Please try again.",
      );
      return;
    }

    if (
      restrictionTarget.isDeleted ||
      restrictionTarget.role !== "registered_user"
    ) {
      setRestrictionError(
        "This account is not eligible for restrictions.",
      );
      return;
    }

    const targetUserId = restrictionTarget.id;
    const targetDisplayName = getDisplayName(restrictionTarget);
    const requestedAction = restrictionAction;

    const reason = restrictionReason.trim();

    const requiresReason =
      requestedAction === "mute" ||
      requestedAction === "ban_temporary" ||
      requestedAction === "ban_permanent";

    if (requiresReason && !reason) {
      setRestrictionError(
        "A reason is required for a new restriction.",
      );
      return;
    }

    let durationSeconds: number | null = null;

    if (requestedAction === "mute") {
      if (!indefiniteMute) {
        durationSeconds = calculateDurationSeconds();

        if (durationSeconds === null) {
          setRestrictionError(
            "Enter a valid mute duration between 60 seconds and 365 days, or select indefinite mute.",
          );
          return;
        }
      }
    }

    if (requestedAction === "ban_temporary") {
      durationSeconds = calculateDurationSeconds();

      if (durationSeconds === null) {
        setRestrictionError(
          "A temporary ban must be between 60 seconds and 365 days.",
        );
        return;
      }
    }

    if (
      requestedAction === "ban_permanent" ||
      requestedAction === "unmute" ||
      requestedAction === "unban"
    ) {
      durationSeconds = null;
    }

    setIsApplyingRestriction(true);
    setRestrictionError(null);
    setActionError(null);
    setActionNotice(null);

    try {
      await applyAdminUserRestriction(
        userId,
        targetUserId,
        {
          action: requestedAction,
          durationSeconds,
          ...(reason
            ? {
                reason,
              }
            : {}),
        },
      );

      if (!isCurrentAuthenticatedSession(identity)) {
        return;
      }

      const successMessage =
        getRestrictionSuccessMessage(
          requestedAction,
          targetDisplayName,
        );

      setRestrictionUserId(null);

      setActionNotice({
        type: "success",
        message: successMessage,
      });

      try {
        await refreshUsers(identity);

        if (!isCurrentAuthenticatedSession(identity)) {
          return;
        }
      } catch {
        if (!isCurrentAuthenticatedSession(identity)) {
          return;
        }

        setActionNotice({
          type: "warning",
          message:
            `${successMessage} However, the user list could not be refreshed. Reload the page to view the latest restriction state.`,
        });
      }
    } catch (error: unknown) {
      if (!isCurrentAuthenticatedSession(identity)) {
        return;
      }

      /*
       * A response with restrictionSaved=true means:
       * - The database restriction was saved.
       * - Supabase Auth synchronization failed afterward.
       *
       * Do not automatically repeat the action or offer a generic
       * Auth synchronization retry here.
       */
      if (
        error instanceof AdminApiError &&
        error.restrictionSaved
      ) {
        const actionLabel =
          getRestrictionActionLabel(requestedAction);

        setRestrictionUserId(null);

        setActionNotice({
          type: "warning",
          message:
            `The ${actionLabel.toLowerCase()} change was saved in the database, but Supabase Auth synchronization failed. The sign-in state may not yet match the saved restriction. Do not repeat the action automatically; the synchronization issue needs separate investigation.`,
        });

        try {
          await refreshUsers(identity);

          if (!isCurrentAuthenticatedSession(identity)) {
            return;
          }
        } catch {
          if (!isCurrentAuthenticatedSession(identity)) {
            return;
          }

          setActionNotice({
            type: "warning",
            message:
              `The ${actionLabel.toLowerCase()} change was saved, but Auth synchronization and refreshing the user list both failed. Reload the page and investigate the Auth synchronization issue before taking another action.`,
          });
        }
      } else {
        setRestrictionError(
          error instanceof Error
            ? error.message
            : "Unable to update the user's restriction.",
        );
      }
    } finally {
      if (isCurrentAuthenticatedSession(identity)) {
        setIsApplyingRestriction(false);
      }
    }
  };

  /* ------------------------------------------------------------------------ */
  /*                         MODERATION HISTORY                               */
  /* ------------------------------------------------------------------------ */

  const handleLoadModerationHistory = async () => {
    const identity = sessionIdentity;

    if (
      !userId ||
      !identity ||
      !isExpectedSessionCurrent(identity) ||
      !selectedUser
    ) {
      return;
    }

    const targetUserId = selectedUser.id;

    setHistoryVisible(true);
    setHistoryError(null);

    if (historyLoadedFor === targetUserId) {
      return;
    }

    setHistoryLoading(true);

    try {
      const history =
        await getAdminUserModerationHistory(
          userId,
          targetUserId,
        );

      if (
        !isCurrentAuthenticatedSession(identity) ||
        selectedUserId !== targetUserId
      ) {
        return;
      }

      setHistoryItems(history);
      setHistoryLoadedFor(targetUserId);
    } catch (error: unknown) {
      if (
        !isCurrentAuthenticatedSession(identity) ||
        selectedUserId !== targetUserId
      ) {
        return;
      }

      setHistoryError(
        error instanceof Error
          ? error.message
          : "Unable to load moderation history.",
      );
    } finally {
      if (
        isCurrentAuthenticatedSession(identity) &&
        selectedUserId === targetUserId
      ) {
        setHistoryLoading(false);
      }
    }
  };

  /* ------------------------------------------------------------------------ */
  /*                              STYLE HELPERS                               */
  /* ------------------------------------------------------------------------ */

  const getFilterButtonClass = (
    filter: AdminUserManagementStatus,
    currentFilter: AdminUserManagementStatus,
  ) =>
    `min-w-[70px] rounded-full border px-4 py-2.5 text-sm font-medium shadow-sm transition ${
      currentFilter === filter
        ? "border-[#102E4D] bg-[#102E4D] text-white"
        : "border-slate-200 bg-white text-slate-600 hover:border-[#102E4D] hover:text-[#102E4D]"
    }`;

  const paginationButtonClass =
    "flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";

  /* ------------------------------------------------------------------------ */
  /*                                  RENDER                                  */
  /* ------------------------------------------------------------------------ */

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
              const active = item.label === "User Management";
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
                  onClick={() => {
                    setSidebarOpen(false);

                    if (destination) {
                      navigate(destination);
                    }
                  }}
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
                    <span className="ml-auto text-[10px]">
                      Unavailable
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
            onClick={() => {
              const destination =
                getAdminNavigationDestination(
                  "Preview of the System",
                );

              if (destination) {
                navigate(destination);
              }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
          >
            <MapPinned size={17} />
            Preview of the System
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
            {isLoggingOut ? "Signing Out..." : "Sign Out"}
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
                Manage registered-user and administrator accounts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            <AdminNotificationBell
              adminUserId={userId ?? ""}
            />

            <div className="hidden h-9 w-px bg-slate-200 sm:block" />

            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#DCE9F7] text-sm font-bold text-[#102E4D]">
                {adminInitials || "A"}
              </div>

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

        <div className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
          {/* Page heading */}
          <section className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
                User Accounts
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                Review account information, roles, and independent access restrictions.
              </p>
            </div>

            {/* Current-page account statistics */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-700">
                  <ShieldCheck size={20} />
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Active on page
                  </p>

                  <p className="text-xl font-bold text-[#102E4D]">
                    {activeCount}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <LockKeyhole size={20} />
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Muted on page
                  </p>

                  <p className="text-xl font-bold text-[#102E4D]">
                    {mutedCount}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <BanIcon size={20} />
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Banned on page
                  </p>

                  <p className="text-xl font-bold text-[#102E4D]">
                    {bannedCount}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <Users size={20} />
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Deleted on page
                  </p>

                  <p className="text-xl font-bold text-[#102E4D]">
                    {deletedCount}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Search and page size */}
          <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-[#102E4D] focus-within:ring-2 focus-within:ring-blue-100">
              <Search
                size={18}
                className="shrink-0 text-slate-400"
              />

              <input
                type="text"
                value={searchTerm}
                onChange={(event) =>
                  handleSearchChange(event.target.value)
                }
                placeholder="Search display name, email, or username..."
                aria-label="Search user accounts"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />

              {searchTerm && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => handleSearchChange("")}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X size={17} />
                </button>
              )}
            </div>

            <div className="relative shrink-0 sm:w-[180px]">
              <label
                htmlFor="user-page-size"
                className="sr-only"
              >
                Users per page
              </label>

              <select
                id="user-page-size"
                value={pageSize}
                onChange={(event) =>
                  handlePageSizeChange(event.target.value)
                }
                aria-label="Users per page"
                className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm shadow-sm outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>

              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
              />
            </div>
          </section>

          {/* Server-side status filters */}
          <section className="mb-7 flex flex-wrap gap-2.5">
            {FILTER_OPTIONS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() =>
                  handleStatusFilterChange(filter.value)
                }
                aria-pressed={statusFilter === filter.value}
                className={getFilterButtonClass(
                  filter.value,
                  statusFilter,
                )}
              >
                {filter.label}
              </button>
            ))}
          </section>

          {/* Global action feedback */}
          {actionError && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {actionError}
            </p>
          )}

          {actionNotice && (
            <div
              role="status"
              className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
                actionNotice.type === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-green-200 bg-green-50 text-green-800"
              }`}
            >
              {actionNotice.message}
            </div>
          )}

          {/* User table */}
          <section
            aria-busy={isLoading}
            className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_14px_rgba(15,23,42,0.035)]"
          >
            <div className="flex flex-col gap-1 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h4 className="font-bold text-slate-900">
                  User Accounts
                </h4>

                <p className="mt-1 text-xs text-slate-500">
                  Registered users and administrators.
                </p>
              </div>

              <span className="text-xs font-medium text-slate-500">
                {totalCount.toLocaleString()}{" "}
                {totalCount === 1
                  ? "matching user"
                  : "matching users"}
              </span>
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
                <thead className="bg-[#DFEAF4] text-xs text-slate-700">
                  <tr>
                    <th className="px-5 py-4 font-semibold">
                      Display Name
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Email
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Joined
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Role
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Status
                    </th>

                    <th className="px-5 py-4 text-center font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {isLoading && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-16 text-center"
                      >
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-[#102E4D]">
                          <Clock size={22} className="animate-pulse" />
                        </div>

                        <p className="mt-3 font-semibold text-slate-700">
                          Loading user accounts...
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          Retrieving the requested page from the server.
                        </p>
                      </td>
                    </tr>
                  )}

                  {!isLoading &&
                    users.map((user) => {
                      const isSelf = user.id === userId;

                      const canManageRestrictions =
                        !user.isDeleted &&
                        user.role === "registered_user";

                      const canChangeRole =
                        !user.isDeleted &&
                        !isSelf;

                      const statusBadges =
                        getUserStatusBadges(user);

                      const displayName = getDisplayName(user);

                      return (
                        <tr
                          key={user.id}
                          className="transition hover:bg-[#F8FAFD]"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <UserAvatar
                                photoUrl={user.profilePhotoUrl}
                                displayName={displayName}
                                size="table"
                              />

                              <div className="min-w-0">
                                <p className="font-medium text-slate-700">
                                  {displayName}
                                </p>

                                {isSelf && (
                                  <p className="mt-0.5 text-[11px] text-slate-400">
                                    Current account
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-4 text-slate-600">
                            {user.email ?? "Email unavailable"}
                          </td>

                          <td className="px-5 py-4 text-slate-600">
                            {formatCreatedAt(user.createdAt)}
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-medium ${
                                user.role === "admin"
                                  ? "bg-indigo-50 text-indigo-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {user.role === "admin"
                                ? "Administrator"
                                : "Registered user"}
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex max-w-[220px] flex-wrap gap-1.5">
                              {statusBadges.map((badge) => (
                                <span
                                  key={badge.label}
                                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  openUserDetails(user)
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-[#102E4D] hover:bg-blue-50 hover:text-[#102E4D]"
                              >
                                <Eye size={14} />
                                View
                              </button>

                              {canManageRestrictions && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openRestrictionDialog(user)
                                  }
                                  disabled={isApplyingRestriction}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Shield size={14} />
                                  Restrictions
                                </button>
                              )}

                              {canChangeRole && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openRoleChangeDialog(user)
                                  }
                                  disabled={
                                    updatingRoleUserId === user.id
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-[#102E4D] hover:bg-blue-50 hover:text-[#102E4D] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {updatingRoleUserId === user.id
                                    ? "Saving..."
                                    : user.role === "admin"
                                      ? "Revoke Admin"
                                      : "Make Admin"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                  {!isLoading && users.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-16 text-center"
                      >
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                          <Search size={22} />
                        </div>

                        <p className="mt-3 font-semibold text-slate-700">
                          {errorMessage
                            ? "Users could not be loaded"
                            : totalCount === 0
                              ? "No user accounts found"
                              : "No users on this page"}
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          {errorMessage ??
                            (totalCount === 0
                              ? "No accounts match the current search and status filter."
                              : "There are no account records available on this page.")}
                        </p>

                        {errorMessage ? (
                          <button
                            type="button"
                            onClick={retryLoadingUsers}
                            className="mt-4 rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white"
                          >
                            Retry
                          </button>
                        ) : (
                          (searchTerm || statusFilter !== "all") && (
                            <button
                              type="button"
                              onClick={() => {
                                handleSearchChange("");
                                handleStatusFilterChange("all");
                              }}
                              className="mt-4 text-sm font-semibold text-[#102E4D] underline underline-offset-4"
                            >
                              Clear search and filters
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col gap-4 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="text-xs text-slate-500">
                Showing{" "}
                <span className="font-semibold text-slate-700">
                  {firstResult.toLocaleString()}–{lastResult.toLocaleString()}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-slate-700">
                  {totalCount.toLocaleString()}
                </span>{" "}
                matching accounts
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={isLoading || page <= 1}
                  aria-label="Previous page"
                  className={`${paginationButtonClass} border-slate-200 bg-white text-slate-600 hover:border-[#102E4D] hover:text-[#102E4D]`}
                >
                  <ChevronLeft size={17} />
                </button>

                {pageNumbers.length > 0 && pageNumbers[0] > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => goToPage(1)}
                      disabled={isLoading}
                      className={`${paginationButtonClass} border-slate-200 bg-white text-slate-600 hover:border-[#102E4D] hover:text-[#102E4D]`}
                    >
                      1
                    </button>

                    {pageNumbers[0] > 2 && (
                      <span className="px-1 text-sm text-slate-400">
                        ...
                      </span>
                    )}
                  </>
                )}

                {pageNumbers.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => goToPage(pageNumber)}
                    disabled={isLoading}
                    aria-current={
                      pageNumber === page
                        ? "page"
                        : undefined
                    }
                    className={`${paginationButtonClass} ${
                      pageNumber === page
                        ? "border-[#102E4D] bg-[#102E4D] text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-[#102E4D] hover:text-[#102E4D]"
                    }`}
                  >
                    {pageNumber}
                  </button>
                ))}

                {pageNumbers.length > 0 &&
                  pageNumbers[pageNumbers.length - 1] < totalPages && (
                    <>
                      {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && (
                        <span className="px-1 text-sm text-slate-400">
                          ...
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => goToPage(totalPages)}
                        disabled={isLoading}
                        className={`${paginationButtonClass} border-slate-200 bg-white text-slate-600 hover:border-[#102E4D] hover:text-[#102E4D]`}
                      >
                        {totalPages}
                      </button>
                    </>
                  )}

                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={
                    isLoading ||
                    totalPages === 0 ||
                    page >= totalPages
                  }
                  aria-label="Next page"
                  className={`${paginationButtonClass} border-slate-200 bg-white text-slate-600 hover:border-[#102E4D] hover:text-[#102E4D]`}
                >
                  <ChevronRight size={17} />
                </button>
              </div>

              <p className="text-right text-xs text-slate-400">
                {totalPages > 0
                  ? `Page ${page} of ${totalPages}`
                  : "No pages"}
              </p>
            </div>

            <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
              <p className="text-xs text-slate-400">
                QRoute User Management
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* ------------------------------------------------------------------ */}
      {/*                           USER DETAILS                              */}
      {/* ------------------------------------------------------------------ */}

      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4"
          onClick={closeUserDetails}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-modal-title"
            onClick={(event) => event.stopPropagation()}
            className="my-6 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
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
                  Account information, role, and restriction status.
                </p>
              </div>

              <button
                type="button"
                aria-label="Close user details"
                onClick={closeUserDetails}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                <X size={20} />
              </button>
            </div>

            {/* Identity */}
            <div className="mt-6 flex flex-col items-center rounded-xl bg-[#F4F8FC] p-6">
              <UserAvatar
                photoUrl={selectedUser.profilePhotoUrl}
                displayName={getDisplayName(selectedUser)}
                size="details"
              />

              <h4 className="mt-3 text-lg font-bold text-slate-800">
                {getDisplayName(selectedUser)}
              </h4>

              <span
                className={`mt-2 rounded-full px-3 py-1 text-xs font-semibold ${
                  selectedUser.role === "admin"
                    ? "bg-indigo-50 text-indigo-700"
                    : "bg-blue-50 text-blue-700"
                }`}
              >
                {selectedUser.role === "admin"
                  ? "Administrator"
                  : "Registered user"}
              </span>

              {selectedUser.isDeleted && (
                <span className="mt-2 rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                  Deleted account
                </span>
              )}
            </div>

            {/* Account information */}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-[#F4F8FC] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Email address
                </p>

                <p className="mt-1 break-all font-medium text-slate-800">
                  {selectedUser.email ?? "Email unavailable"}
                </p>
              </div>

              <div className="rounded-xl bg-[#F4F8FC] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Date joined
                </p>

                <p className="mt-1 font-semibold text-[#102E4D]">
                  {formatCreatedAt(selectedUser.createdAt)}
                </p>
              </div>
            </div>

            {/* Current account statuses */}
            <div className="mt-5">
              <h4 className="text-sm font-bold text-slate-800">
                Account Status
              </h4>

              <div className="mt-3 flex flex-wrap gap-2">
                {getUserStatusBadges(selectedUser).map(
                  (badge) => (
                    <span
                      key={badge.label}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  ),
                )}
              </div>
            </div>

            {/* Independent restriction details */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <BanIcon
                    size={17}
                    className="text-red-600"
                  />

                  <h4 className="text-sm font-bold text-slate-800">
                    Ban
                  </h4>
                </div>

                <p className="mt-3 text-sm font-semibold text-slate-700">
                  {selectedUser.isBanned
                    ? selectedUser.isPermanentBan
                      ? "Permanent ban"
                      : "Temporary ban"
                    : "Not banned"}
                </p>

                {selectedUser.isBanned && (
                  <>
                    <p className="mt-2 text-xs text-slate-500">
                      Expires:{" "}
                      {selectedUser.isPermanentBan
                        ? "Never"
                        : formatDateTime(
                            selectedUser.banExpiresAt,
                          )}
                    </p>

                    <p className="mt-3 break-words text-xs text-slate-600">
                      <span className="font-semibold">
                        Reason:
                      </span>{" "}
                      {selectedUser.banReason ||
                        "No reason recorded"}
                    </p>
                  </>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <LockKeyhole
                    size={17}
                    className="text-amber-600"
                  />

                  <h4 className="text-sm font-bold text-slate-800">
                    Mute
                  </h4>
                </div>

                <p className="mt-3 text-sm font-semibold text-slate-700">
                  {selectedUser.isMuted
                    ? "Muted"
                    : "Not muted"}
                </p>

                {selectedUser.isMuted && (
                  <>
                    <p className="mt-2 text-xs text-slate-500">
                      Expires:{" "}
                      {formatDateTime(
                        selectedUser.muteExpiresAt,
                      )}
                    </p>

                    <p className="mt-3 break-words text-xs text-slate-600">
                      <span className="font-semibold">
                        Reason:
                      </span>{" "}
                      {selectedUser.muteReason ||
                        "No reason recorded"}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Auth synchronization status */}
            {!selectedUser.authBanSynced && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">
                  Sign-in restriction synchronization needs attention
                </p>

                <p className="mt-1 text-xs leading-5 text-amber-800">
                  The Supabase Auth ban state does not currently match the database moderation state. Do not repeat a restriction action automatically. Investigate the synchronization state separately.
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5">
              {!selectedUser.isDeleted &&
                selectedUser.role === "registered_user" && (
                  <button
                    type="button"
                    onClick={() =>
                      openRestrictionDialog(selectedUser)
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
                  >
                    <Shield size={16} />
                    Manage Restrictions
                  </button>
                )}

              {!selectedUser.isDeleted &&
                selectedUser.id !== userId && (
                  <button
                    type="button"
                    onClick={() =>
                      openRoleChangeDialog(selectedUser)
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Users size={16} />
                    {selectedUser.role === "admin"
                      ? "Revoke Administrator Role"
                      : "Promote to Administrator"}
                  </button>
                )}

              <button
                type="button"
                onClick={() =>
                  void handleLoadModerationHistory()
                }
                disabled={historyLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <History size={16} />
                {historyLoading
                  ? "Loading History..."
                  : "View Moderation History"}
              </button>
            </div>

            {/* Moderation history */}
            {historyVisible && (
              <div className="mt-5 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-bold text-slate-800">
                    Moderation History
                  </h4>

                  <button
                    type="button"
                    onClick={() => setHistoryVisible(false)}
                    aria-label="Hide moderation history"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X size={17} />
                  </button>
                </div>

                {historyLoading && (
                  <p className="mt-4 text-sm text-slate-500">
                    Loading moderation history...
                  </p>
                )}

                {historyError && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-800">
                      {historyError}
                    </p>

                    <button
                      type="button"
                      onClick={() => {
                        setHistoryLoadedFor(null);
                        void handleLoadModerationHistory();
                      }}
                      className="mt-2 text-xs font-semibold text-red-800 underline underline-offset-2"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {!historyLoading &&
                  !historyError &&
                  historyItems.length === 0 && (
                    <p className="mt-4 text-sm text-slate-500">
                      No moderation history is available for this account.
                    </p>
                  )}

                {!historyLoading &&
                  historyItems.length > 0 && (
                    <div className="mt-4 max-h-[320px] space-y-3 overflow-y-auto">
                      {historyItems.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg bg-[#F8FAFD] p-3"
                        >
                          <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-start">
                            <p className="text-sm font-semibold text-slate-800">
                              {item.title}
                            </p>

                            <span className="text-[11px] text-slate-400">
                              {formatDateTime(item.occurredAt)}
                            </span>
                          </div>

                          <p className="mt-1 text-xs text-slate-600">
                            {item.description}
                          </p>

                          <p className="mt-2 text-[11px] text-slate-500">
                            By {item.adminDisplayName}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            )}

            <div className="mt-6 flex justify-end border-t border-slate-100 pt-5">
              <button
                type="button"
                onClick={closeUserDetails}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/*                         ROLE CHANGE DIALOG                          */}
      {/* ------------------------------------------------------------------ */}

      {roleChangeTarget && nextRole && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
          onClick={closeRoleChangeDialog}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="role-confirm-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <Users size={23} />
            </div>

            <h3
              id="role-confirm-title"
              className="mt-4 text-xl font-bold text-[#102E4D]"
            >
              {nextRole === "admin"
                ? "Promote to administrator?"
                : "Revoke administrator role?"}
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              {nextRole === "admin"
                ? `${getDisplayName(roleChangeTarget)} will receive administrator privileges.`
                : `${getDisplayName(roleChangeTarget)} will lose administrator privileges and become a registered user.`}
            </p>

            {nextRole === "registered_user" && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                The system will reject this change if it would remove the last administrator.
              </p>
            )}

            {roleError && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {roleError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeRoleChangeDialog}
                disabled={updatingRoleUserId !== null}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={updatingRoleUserId !== null}
                onClick={() =>
                  void handleConfirmRoleChange()
                }
                className="rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183D60] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {updatingRoleUserId !== null
                  ? "Saving..."
                  : "Confirm Change"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/*                         RESTRICTION DIALOG                          */}
      {/* ------------------------------------------------------------------ */}

      {restrictionTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4"
          onClick={closeRestrictionDialog}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="restriction-dialog-title"
            onClick={(event) => event.stopPropagation()}
            className="my-6 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Shield size={23} />
                </div>

                <h3
                  id="restriction-dialog-title"
                  className="mt-4 text-xl font-bold text-[#102E4D]"
                >
                  Manage Restrictions
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {getDisplayName(restrictionTarget)}
                </p>
              </div>

              <button
                type="button"
                aria-label="Close restriction dialog"
                onClick={closeRestrictionDialog}
                disabled={isApplyingRestriction}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Current restriction state */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-[#F8FAFD] p-3">
                <p className="text-xs text-slate-500">
                  Ban status
                </p>

                <p
                  className={`mt-1 text-sm font-semibold ${
                    restrictionTarget.isBanned
                      ? "text-red-700"
                      : "text-green-700"
                  }`}
                >
                  {restrictionTarget.isBanned
                    ? restrictionTarget.isPermanentBan
                      ? "Permanent"
                      : "Temporary"
                    : "Not banned"}
                </p>
              </div>

              <div className="rounded-lg bg-[#F8FAFD] p-3">
                <p className="text-xs text-slate-500">
                  Mute status
                </p>

                <p
                  className={`mt-1 text-sm font-semibold ${
                    restrictionTarget.isMuted
                      ? "text-amber-700"
                      : "text-green-700"
                  }`}
                >
                  {restrictionTarget.isMuted
                    ? "Muted"
                    : "Not muted"}
                </p>
              </div>
            </div>

            {/* Action selection */}
            <div className="mt-5">
              <label
                htmlFor="restriction-action"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Restriction action
              </label>

              <select
                id="restriction-action"
                value={restrictionAction}
                onChange={(event) =>
                  handleRestrictionActionChange(
                    event.target.value as AdminUserRestrictionAction,
                  )
                }
                disabled={isApplyingRestriction}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
              >
                <optgroup label="Mute">
                  <option value="mute">
                    {restrictionTarget.isMuted
                      ? "Set or update mute"
                      : "Mute user"}
                  </option>

                  <option
                    value="unmute"
                    disabled={!restrictionTarget.isMuted}
                  >
                    Remove mute
                  </option>
                </optgroup>

                <optgroup label="Ban">
                  <option value="ban_temporary">
                    {restrictionTarget.isBanned
                      ? "Set or update temporary ban"
                      : "Temporary ban"}
                  </option>

                  <option value="ban_permanent">
                    {restrictionTarget.isBanned
                      ? "Set or update permanent ban"
                      : "Permanent ban"}
                  </option>

                  <option
                    value="unban"
                    disabled={!restrictionTarget.isBanned}
                  >
                    Remove ban
                  </option>
                </optgroup>
              </select>
            </div>

            {/* Duration settings */}
            {(restrictionAction === "mute" ||
              restrictionAction === "ban_temporary") && (
              <div className="mt-5 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <Clock
                    size={17}
                    className="text-slate-500"
                  />

                  <h4 className="text-sm font-semibold text-slate-800">
                    Restriction duration
                  </h4>
                </div>

                {restrictionAction === "mute" && (
                  <label className="mt-4 flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={indefiniteMute}
                      onChange={(event) => {
                        setIndefiniteMute(
                          event.target.checked,
                        );
                        setRestrictionError(null);
                      }}
                      disabled={isApplyingRestriction}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#102E4D] focus:ring-[#102E4D]"
                    />

                    <span>
                      <span className="block text-sm font-medium text-slate-700">
                        Indefinite mute
                      </span>

                      <span className="mt-0.5 block text-xs text-slate-500">
                        The mute remains until an administrator removes it.
                      </span>
                    </span>
                  </label>
                )}

                {!(
                  restrictionAction === "mute" &&
                  indefiniteMute
                ) && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="restriction-duration"
                        className="mb-1.5 block text-xs font-medium text-slate-600"
                      >
                        Duration
                      </label>

                      <input
                        id="restriction-duration"
                        type="number"
                        min={1}
                        max={Math.floor(
                          MAX_RESTRICTION_SECONDS /
                            DURATION_FACTORS[durationUnit],
                        )}
                        step={1}
                        value={durationAmount}
                        onChange={(event) => {
                          setDurationAmount(
                            event.target.value,
                          );
                          setRestrictionError(null);
                        }}
                        disabled={isApplyingRestriction}
                        className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="restriction-duration-unit"
                        className="mb-1.5 block text-xs font-medium text-slate-600"
                      >
                        Unit
                      </label>

                      <select
                        id="restriction-duration-unit"
                        value={durationUnit}
                        onChange={(event) => {
                          setDurationUnit(
                            event.target.value as DurationUnit,
                          );
                          setRestrictionError(null);
                        }}
                        disabled={isApplyingRestriction}
                        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="minutes">
                          Minutes
                        </option>

                        <option value="hours">
                          Hours
                        </option>

                        <option value="days">
                          Days
                        </option>
                      </select>
                    </div>
                  </div>
                )}

                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Timed restrictions must be between 60 seconds and 365 days.
                </p>
              </div>
            )}

            {restrictionAction === "ban_permanent" && (
              <div className="mt-5 rounded-lg border border-red-100 bg-red-50 p-3">
                <p className="text-sm font-semibold text-red-800">
                  Permanent ban
                </p>

                <p className="mt-1 text-xs leading-5 text-red-700">
                  This ban will not expire automatically. An administrator must explicitly unban the account.
                </p>
              </div>
            )}

            {/* Reason */}
            <div className="mt-5">
              <label
                htmlFor="restriction-reason"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Reason{" "}
                {restrictionAction === "unmute" ||
                restrictionAction === "unban"
                  ? "(Optional)"
                  : "(Required)"}
              </label>

              <textarea
                id="restriction-reason"
                value={restrictionReason}
                onChange={(event) => {
                  setRestrictionReason(event.target.value);
                  setRestrictionError(null);
                }}
                maxLength={1000}
                rows={4}
                disabled={isApplyingRestriction}
                placeholder={
                  restrictionAction === "unmute"
                    ? "Optional explanation for removing the mute..."
                    : restrictionAction === "unban"
                      ? "Optional explanation for removing the ban..."
                      : "Explain why this restriction is being applied..."
                }
                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
              />

              <p className="mt-1 text-right text-[11px] text-slate-400">
                {restrictionReason.length}/1000
              </p>
            </div>

            {/* Restriction error */}
            {restrictionError && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {restrictionError}
              </p>
            )}

            {/* Actions */}
            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeRestrictionDialog}
                disabled={isApplyingRestriction}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() =>
                  void handleApplyRestriction()
                }
                disabled={isApplyingRestriction}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  restrictionAction === "unmute" ||
                  restrictionAction === "unban"
                    ? "bg-green-700 hover:bg-green-800"
                    : restrictionAction === "mute"
                      ? "bg-amber-600 hover:bg-amber-700"
                      : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {isApplyingRestriction
                  ? "Processing..."
                  : `Confirm ${getRestrictionActionLabel(restrictionAction)}`}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}