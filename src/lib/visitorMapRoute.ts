export type VisitorMapRoute = "loading" | "visitor" | "registered";

export function resolveVisitorMapRoute({
  authLoading,
  roleLoading,
  currentUserId,
}: {
  authLoading: boolean;
  roleLoading: boolean;
  currentUserId: string | null;
}): VisitorMapRoute {
  if (authLoading || roleLoading) return "loading";
  if (!currentUserId) return "visitor";
  return "registered";
}
