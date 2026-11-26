import { requestAdmin } from "./request";
import {
  isAdminUserManagementStatus,
  isAdminUserPageSize,
  parseAdminUserModerationHistory,
  parseAdminUsersPage,
} from "./validation";
import type {
  AdminUserModerationHistoryItem,
  AdminUserRecord,
  AdminUserRestrictionPayload,
  AdminUserRole,
  AdminUsersPage,
  AdminUsersPageRequest,
} from "./types";

/** Retrieves one server-paginated page of administrator-managed accounts. */
export async function getAdminUsersPage(
  expectedUserId: string,
  options: AdminUsersPageRequest = {},
): Promise<AdminUsersPage> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 25;
  const search = options.search?.trim() ?? "";
  const status = options.status ?? "all";

  if (!Number.isSafeInteger(page) || page < 1) {
    throw new Error("Page must be a positive integer.");
  }
  if (!isAdminUserPageSize(pageSize)) {
    throw new Error("Page size must be 10, 25, 50, or 100.");
  }
  if (search.length > 100) {
    throw new Error("Search text cannot exceed 100 characters.");
  }
  if (!isAdminUserManagementStatus(status)) {
    throw new Error("Invalid user status filter.");
  }

  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    search,
    status,
  });

  const payload = await requestAdmin(`/users?${query.toString()}`, expectedUserId);
  return parseAdminUsersPage(payload, pageSize);
}

/** Compatibility helper for callers that still require an array of all users. */
export async function getAdminUsers(expectedUserId: string): Promise<AdminUserRecord[]> {
  const firstPage = await getAdminUsersPage(expectedUserId, {
    page: 1,
    pageSize: 100,
    status: "all",
  });

  const users = [...firstPage.users];
  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const nextPage = await getAdminUsersPage(expectedUserId, {
      page,
      pageSize: 100,
      status: "all",
    });
    users.push(...nextPage.users);
  }

  return users;
}

/** Changes a user's role; authorization and protections remain server-side. */
export async function setAdminUserRole(
  expectedUserId: string,
  id: string,
  role: AdminUserRole,
): Promise<void> {
  await requestAdmin(`/users/${encodeURIComponent(id)}/role`, expectedUserId, {
    method: "PATCH",
    body: { role },
  });
}

/** Applies or removes a user restriction after validating the request locally. */
export async function applyAdminUserRestriction(
  expectedUserId: string,
  id: string,
  restriction: AdminUserRestrictionPayload,
): Promise<void> {
  const { action, durationSeconds, reason } = restriction;
  const requiresReason = action === "mute" || action === "ban_temporary" || action === "ban_permanent";

  if (requiresReason && (!reason || !reason.trim())) {
    throw new Error("A reason is required for this restriction.");
  }

  if (action === "ban_temporary") {
    if (
      typeof durationSeconds !== "number" ||
      !Number.isSafeInteger(durationSeconds) ||
      durationSeconds < 60 ||
      durationSeconds > 365 * 24 * 60 * 60
    ) {
      throw new Error("A temporary ban must be between 60 seconds and 365 days.");
    }
  }

  if (
    action === "mute" &&
    durationSeconds !== undefined &&
    durationSeconds !== null &&
    (!Number.isSafeInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 365 * 24 * 60 * 60)
  ) {
    throw new Error("A temporary mute must be between 60 seconds and 365 days.");
  }

  if (action === "ban_permanent" && durationSeconds !== undefined && durationSeconds !== null) {
    throw new Error("A permanent ban must not have a duration.");
  }

  if ((action === "unmute" || action === "unban") && durationSeconds !== undefined && durationSeconds !== null) {
    throw new Error("A removal action must not have a duration.");
  }

  await requestAdmin(`/users/${encodeURIComponent(id)}/restrictions`, expectedUserId, {
    method: "POST",
    body: {
      action,
      durationSeconds: durationSeconds ?? null,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    },
  });
}

/** Retrieves one user's moderation audit history. Usernames are not rendered. */
export async function getAdminUserModerationHistory(
  expectedUserId: string,
  id: string,
): Promise<AdminUserModerationHistoryItem[]> {
  const payload = await requestAdmin(`/users/${encodeURIComponent(id)}/moderation-history`, expectedUserId);
  return parseAdminUserModerationHistory(payload.history);
}

