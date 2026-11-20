// adminAudit.ts

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "./supabaseClient.ts";

export interface AdminAuditLogInput {
  adminUserId: string;
  categoryKey: string;
  actionKey: string;
  actionTitle: string;
  description: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AdminAuditLogRecord {
  id: string;
  actionKey: string;
  category: string;
  title: string;
  detail: string;
  adminDisplayName: string;
  adminUsername: string | null;
  targetType: string | null;
  targetLabel: string | null;
  occurredAt: string;
}

interface AdminProfileSnapshot {
  display_name: string | null;
  username: string | null;
}

interface AdminAuditLogDatabaseRecord {
  id: string;
  admin_user_id: string;
  admin_display_name: string | null;
  admin_username: string | null;
  category_id: string;
  action_key: string;
  action_title: string;
  description: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
  admin_action_categories:
    | {
        category_name: string;
      }
    | {
        category_name: string;
      }[]
    | null;
}

function normalizeCategory(
  value:
    | AdminAuditLogDatabaseRecord["admin_action_categories"],
): string {
  if (Array.isArray(value)) {
    return value[0]?.category_name ?? "Administrative";
  }

  return value?.category_name ?? "Administrative";
}

function normalizeAuditRecord(
  record: AdminAuditLogDatabaseRecord,
): AdminAuditLogRecord {
  return {
    id: record.id,
    actionKey: record.action_key,
    category: normalizeCategory(record.admin_action_categories),
    title: record.action_title,
    detail: record.description,
    adminDisplayName:
      record.admin_display_name?.trim() || "Administrator",
    adminUsername: record.admin_username,
    targetType: record.target_type,
    targetLabel: record.target_label,
    occurredAt: record.occurred_at,
  };
}

async function getAdminProfileSnapshot(
  adminUserId: string,
): Promise<AdminProfileSnapshot> {
  const adminClient = getSupabaseAdminClient();

  const { data, error } = await adminClient
    .from("profiles")
    .select("display_name, username")
    .eq("id", adminUserId)
    .maybeSingle();

  if (error) {
    console.error(
      "[adminAudit] Failed to retrieve admin profile snapshot:",
      error.message,
    );

    return {
      display_name: null,
      username: null,
    };
  }

  return {
    display_name: data?.display_name ?? null,
    username: data?.username ?? null,
  };
}

/**
 * Inserts a single audit record.
 *
 * This function is intended to be called only from trusted backend
 * admin operations after the underlying operation succeeds.
 *
 * Audit failures are logged and do not throw, because the underlying
 * admin operation may already have succeeded.
 */
export async function writeAdminAuditLog(
  input: AdminAuditLogInput,
): Promise<void> {
  try {
    const adminClient = getSupabaseAdminClient();

    const profile = await getAdminProfileSnapshot(
      input.adminUserId,
    );

    const { data: category, error: categoryError } =
      await adminClient
        .from("admin_action_categories")
        .select("id")
        .eq("category_key", input.categoryKey)
        .eq("is_active", true)
        .maybeSingle();

    if (categoryError) {
      console.error(
        "[adminAudit] Category lookup failed:",
        categoryError.message,
      );

      return;
    }

    if (!category) {
      console.error(
        `[adminAudit] Category not found or inactive: ${input.categoryKey}`,
      );

      return;
    }

    const adminDisplayName =
      profile.display_name?.trim() ||
      profile.username?.trim() ||
      "Administrator";

    const { error: insertError } = await adminClient
      .from("admin_audit_logs")
      .insert({
        admin_user_id: input.adminUserId,
        admin_display_name: adminDisplayName,
        admin_username: profile.username,
        category_id: category.id,
        action_key: input.actionKey,
        action_title: input.actionTitle,
        description: input.description,
        target_type: input.targetType ?? null,
        target_id: input.targetId ?? null,
        target_label: input.targetLabel ?? null,
        metadata: input.metadata ?? {},
      });

    if (insertError) {
      console.error(
        "[adminAudit] Audit insertion failed:",
        insertError.message,
      );
    }
  } catch (error) {
    console.error(
      "[adminAudit] Unexpected audit logging error:",
      error,
    );
  }
}

/**
 * Retrieves the most recent audit records for the admin dashboard.
 */
export async function getRecentAdminAuditLogs(
  limit = 5,
): Promise<AdminAuditLogRecord[]> {
  const adminClient = getSupabaseAdminClient();

  const safeLimit = Math.min(
    Math.max(Math.floor(limit), 1),
    50,
  );

  const { data, error } = await adminClient
    .from("admin_audit_logs")
    .select(`
      id,
      admin_user_id,
      admin_display_name,
      admin_username,
      category_id,
      action_key,
      action_title,
      description,
      target_type,
      target_id,
      target_label,
      metadata,
      occurred_at,
      admin_action_categories (
        category_name
      )
    `)
    .order("occurred_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error(
      "[adminAudit] Failed to retrieve audit logs:",
      error.message,
    );

    throw new Error("Failed to retrieve admin activity.");
  }

  return (data ?? []).map((record) =>
    normalizeAuditRecord(
      record as unknown as AdminAuditLogDatabaseRecord,
    ),
  );
}

/**
 * Allows an explicitly supplied trusted Supabase client to retrieve
 * audit records, useful if you later need to reuse this function.
 */
export async function getRecentAdminAuditLogsWithClient(
  client: SupabaseClient,
  limit = 5,
): Promise<AdminAuditLogRecord[]> {
  const safeLimit = Math.min(
    Math.max(Math.floor(limit), 1),
    50,
  );

  const { data, error } = await client
    .from("admin_audit_logs")
    .select(`
      id,
      admin_user_id,
      admin_display_name,
      admin_username,
      category_id,
      action_key,
      action_title,
      description,
      target_type,
      target_id,
      target_label,
      metadata,
      occurred_at,
      admin_action_categories (
        category_name
      )
    `)
    .order("occurred_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error(
      "[adminAudit] Failed to retrieve audit logs:",
      error.message,
    );

    throw new Error("Failed to retrieve admin activity.");
  }

  return (data ?? []).map((record) =>
    normalizeAuditRecord(
      record as unknown as AdminAuditLogDatabaseRecord,
    ),
  );
}