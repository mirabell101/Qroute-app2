import { requestAdmin } from "./request";
import { isAdminReportRecord } from "./validation";
import type { AdminReportRecord } from "./types";

export async function getAdminReports(expectedUserId: string): Promise<AdminReportRecord[]> {
  const payload = await requestAdmin("/reports", expectedUserId);
  if (!Array.isArray(payload.reports) || !payload.reports.every(isAdminReportRecord)) {
    throw new Error("Admin service returned invalid reports data.");
  }
  return payload.reports as AdminReportRecord[];
}

export async function updateAdminReportStatus(
  expectedUserId: string,
  id: number,
  status: "Pending" | "Reviewed" | "Dismissed",
): Promise<void> {
  await requestAdmin(`/reports/${id}`, expectedUserId, {
    method: "PATCH",
    body: { status },
  });
}
