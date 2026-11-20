import { getSupabaseAdminClient } from "./supabaseClient.ts";

type CommunityAuthorRecord = {
  author_id?: unknown;
};

export async function addAdminAuthorMarkers<T extends CommunityAuthorRecord>(
  records: readonly T[],
): Promise<Array<T & { author_is_admin: boolean }>> {
  const authorIds = [...new Set(
    records
      .map((record) => record.author_id)
      .filter((authorId): authorId is string =>
        typeof authorId === "string" && authorId.length > 0,
      ),
  )];

  if (!authorIds.length) {
    return records.map((record) => ({
      ...record,
      author_is_admin: false,
    }));
  }

  const { data, error } = await getSupabaseAdminClient()
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .in("user_id", authorIds);

  if (error) throw error;

  const adminUserIds = new Set((data ?? []).map((row) => row.user_id));
  return records.map((record) => ({
    ...record,
    author_is_admin:
      typeof record.author_id === "string" &&
      adminUserIds.has(record.author_id),
  }));
}
