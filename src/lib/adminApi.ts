/**
 * Backwards-compatible public entry point for administrator API functions.
 *
 * Existing imports from "@/lib/adminApi" remain valid. The implementation is
 * organized by feature inside "@/lib/admin/".
 */
export * from "./admin/types";
export * from "./admin/errors";

export * from "./admin/summary";
export * from "./admin/routes";
export * from "./admin/routeManagement";
export * from "./admin/routeArchiveRecovery";
export * from "./admin/mapImages";
export * from "./admin/users";
export * from "./admin/community";
export * from "./admin/reports";
export * from "./admin/notifications";
