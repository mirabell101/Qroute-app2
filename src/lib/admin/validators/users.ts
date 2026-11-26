import type {
  AdminUserManagementStatus,
  AdminUserModerationHistoryItem,
  AdminUserPageSize,
  AdminUserRecord,
  AdminUsersPage,
} from "../types";
import { isNonNegativeInteger, isNullableHttpsUrl, isNullableString, isPositiveInteger, isRecord } from "./common";

export function isAdminUserPageSize(value: unknown): value is AdminUserPageSize {
  return value === 10 || value === 25 || value === 50 || value === 100;
}

export function isAdminUserManagementStatus(value: unknown): value is AdminUserManagementStatus {
  return value === "all" || value === "active" || value === "muted" || value === "banned" || value === "deleted";
}

export function isAdminUserRecord(value: unknown): value is AdminUserRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isNullableString(value.email) &&
    typeof value.displayName === "string" &&
    isNullableString(value.searchUsername) &&
    typeof value.createdAt === "string" &&
    Number.isFinite(new Date(value.createdAt).getTime()) &&
    (value.role === "registered_user" || value.role === "admin") &&
    typeof value.isDeleted === "boolean" &&
    isNullableHttpsUrl(value.profilePhotoUrl) &&
    typeof value.isBanned === "boolean" &&
    typeof value.isMuted === "boolean" &&
    typeof value.isPermanentBan === "boolean" &&
    isNullableString(value.banExpiresAt) &&
    isNullableString(value.muteExpiresAt) &&
    isNullableString(value.banReason) &&
    isNullableString(value.muteReason) &&
    typeof value.authBanSynced === "boolean"
  );
}

export function parseAdminUsersPage(
  value: unknown,
  requestedPageSize: AdminUserPageSize,
): AdminUsersPage {
  if (!isRecord(value)) {
    throw new Error("Admin service returned invalid user pagination data.");
  }

  const rawUsers = value.users;
  const totalCount = value.totalCount;
  const page = value.page;
  const pageSize = value.pageSize;
  const totalPages = value.totalPages;

  if (
    !Array.isArray(rawUsers) ||
    !rawUsers.every(isAdminUserRecord) ||
    !isNonNegativeInteger(totalCount) ||
    !isPositiveInteger(page) ||
    !isAdminUserPageSize(pageSize) ||
    pageSize !== requestedPageSize ||
    !isNonNegativeInteger(totalPages)
  ) {
    throw new Error("Admin service returned invalid user pagination data.");
  }

  const expectedTotalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
  if (
    totalPages !== expectedTotalPages ||
    (totalPages === 0 ? page !== 1 : page > totalPages) ||
    rawUsers.length > pageSize ||
    (totalCount === 0 && rawUsers.length !== 0)
  ) {
    throw new Error("Admin service returned inconsistent user pagination information.");
  }

  return {
    users: rawUsers as AdminUserRecord[],
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

export function isAdminUserModerationHistoryItem(value: unknown): value is AdminUserModerationHistoryItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.actionKey === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.adminDisplayName === "string" &&
    typeof value.occurredAt === "string" &&
    Number.isFinite(new Date(value.occurredAt).getTime()) &&
    isRecord(value.metadata)
  );
}

export function parseAdminUserModerationHistory(value: unknown): AdminUserModerationHistoryItem[] {
  if (!Array.isArray(value) || !value.every(isAdminUserModerationHistoryItem)) {
    throw new Error("Admin service returned invalid moderation history.");
  }
  return value as AdminUserModerationHistoryItem[];
}
