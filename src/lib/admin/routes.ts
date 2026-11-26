import { requestAdmin } from "./request";
import { isPositiveInteger, parseAdminRoutes } from "./validation";
import type { AdminRouteRecord, AdminRouteUpdatePayload } from "./types";

export async function getAdminRoutes(expectedUserId: string): Promise<AdminRouteRecord[]> {
  const payload = await requestAdmin("/routes", expectedUserId);
  return parseAdminRoutes(payload.routes);
}

export async function updateAdminRoute(
  expectedUserId: string,
  routeId: number,
  payload: AdminRouteUpdatePayload,
): Promise<void> {
  if (!isPositiveInteger(routeId)) {
    throw new Error("A valid route ID is required.");
  }

  await requestAdmin(`/routes/${routeId}`, expectedUserId, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteAdminRoute(expectedUserId: string, routeId: number): Promise<void> {
  if (!isPositiveInteger(routeId)) {
    throw new Error("A valid route ID is required.");
  }

  await requestAdmin(`/routes/${routeId}`, expectedUserId, {
    method: "DELETE",
  });
}
