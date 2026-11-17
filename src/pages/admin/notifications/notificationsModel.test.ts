import { describe, expect, it } from "vitest";

import type { AdminNotificationRecord } from "@/lib/adminApi";
import {
  buildReportDeepLink,
  countUnreadNotifications,
  getNotificationsViewState,
  markNotificationReadLocally,
  parseReportIdParam,
} from "./notificationsModel";

function notification(
  overrides: Partial<AdminNotificationRecord> = {},
): AdminNotificationRecord {
  return {
    id: "notif-1",
    postId: "post-1",
    reportId: 42,
    title: "Post reported",
    message: "Three unique reports",
    createdAt: "2026-11-17T10:00:00.000Z",
    isRead: false,
    ...overrides,
  };
}

describe("admin notifications model", () => {
  it("reports an empty state only after loading succeeds", () => {
    expect(getNotificationsViewState([], false, "")).toBe("empty");
    expect(getNotificationsViewState([], true, "")).toBe("loading");
    expect(getNotificationsViewState([], false, "Network error")).toBe(
      "error",
    );
    expect(
      getNotificationsViewState([notification()], false, "Network error"),
    ).toBe("error");
    expect(getNotificationsViewState([notification()], false, "")).toBe(
      "ready",
    );
  });

  it("builds a safe deep link only for a real report ID", () => {
    expect(buildReportDeepLink(42)).toBe("/admin/reports?reportId=42");
    expect(buildReportDeepLink(null)).toBeNull();
    expect(buildReportDeepLink(0)).toBeNull();
    expect(buildReportDeepLink("42")).toBeNull();
  });

  it("parses only positive integer report IDs from the query string", () => {
    expect(parseReportIdParam("42")).toBe(42);
    expect(parseReportIdParam("0")).toBeNull();
    expect(parseReportIdParam("42.5")).toBeNull();
    expect(parseReportIdParam("abc")).toBeNull();
    expect(parseReportIdParam(null)).toBeNull();
  });

  it("marks only the selected notification read and recounts unread items", () => {
    const notifications = [
      notification({ id: "notif-1", isRead: false }),
      notification({ id: "notif-2", reportId: null, isRead: false }),
    ];

    const updated = markNotificationReadLocally(notifications, "notif-1");

    expect(updated.map((item) => [item.id, item.isRead])).toEqual([
      ["notif-1", true],
      ["notif-2", false],
    ]);
    expect(countUnreadNotifications(updated)).toBe(1);
    expect(notifications[0]?.isRead).toBe(false);
  });
});
