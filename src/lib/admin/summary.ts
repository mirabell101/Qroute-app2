import { requestAdmin } from "./request";
import { parseAdminSummary } from "./validation";
import type { AdminSummary } from "./types";

export async function getAdminSummary(expectedUserId: string): Promise<AdminSummary> {
  const payload = await requestAdmin("/summary", expectedUserId);
  return parseAdminSummary(payload.summary);
}
