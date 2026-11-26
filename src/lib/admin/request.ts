import { API_BASE_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { AdminApiError } from "./errors";

export interface AdminRequestOptions {
  method?: string;
  body?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Shared authenticated request handler for the two administrator API areas.
 * It verifies that the active Supabase account still matches the caller.
 */
async function requestApi(
  basePath: string,
  path: string,
  expectedUserId: string,
  options?: AdminRequestOptions,
): Promise<Record<string, unknown>> {
  const serviceName = basePath === "/api/admin" ? "Admin" : "Route Management";
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  const session = data.session;
  if (!session?.access_token) {
    throw new Error("Please sign in to continue.");
  }

  if (session.user.id !== expectedUserId) {
    throw new Error("The active account changed. Please try again.");
  }

  const hasBody = options?.body !== undefined;
  const response = await fetch(`${API_BASE_URL}${basePath}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw new AdminApiError(
        `${serviceName} request failed (HTTP ${response.status}).`,
        response.status,
      );
    }
    throw new Error(`${serviceName} service returned an invalid response.`);
  }

  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : `${serviceName} request failed (HTTP ${response.status}).`;
    const restrictionSaved = isRecord(payload) && payload.restrictionSaved === true;
    throw new AdminApiError(message, response.status, restrictionSaved);
  }

  if (!isRecord(payload) || payload.success !== true) {
    throw new Error(`${serviceName} service returned an invalid response.`);
  }

  return payload;
}

export function requestAdmin(
  path: string,
  expectedUserId: string,
  options?: AdminRequestOptions,
): Promise<Record<string, unknown>> {
  return requestApi("/api/admin", path, expectedUserId, options);
}

export function requestRouteManagement(
  path: string,
  expectedUserId: string,
  options?: AdminRequestOptions,
): Promise<Record<string, unknown>> {
  return requestApi("/api/route-management", path, expectedUserId, options);
}
