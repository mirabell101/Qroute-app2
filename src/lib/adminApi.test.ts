import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

type AdminApiModule = typeof import("./adminApi");
let adminApi: AdminApiModule | null = null;

function getAdminApi(): AdminApiModule {
  expect(adminApi).not.toBeNull();
  return adminApi!;
}

describe("admin API client", () => {
  beforeAll(async () => {
    try {
      adminApi = await import("./adminApi");
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("Cannot find module")
      ) {
        throw error;
      }
    }
  });

  beforeEach(() => {
    mocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "admin-token",
          user: { id: "admin-1" },
        },
      },
      error: null,
    });
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockReset();
  });

  it("exposes typed summary, route, and user admin reads", () => {
    expect(adminApi).not.toBeNull();
  });

  it("does not issue a request without a session", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(getAdminApi().getAdminSummary("admin-1")).rejects.toThrow(
      "Please sign in to continue.",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not issue a request when the active user changed", async () => {
    await expect(getAdminApi().getAdminSummary("another-admin")).rejects.toThrow(
      "The active account changed. Please try again.",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("sends the verified session token and parses real summary totals", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        summary: {
          registeredUsers: 14,
          routes: 8,
          communityPosts: 31,
          reports: 3,
          recentActivity: [
            {
              kind: "report",
              title: "Spam report",
              detail: "Repeated promotion",
              occurredAt: "2026-11-02T00:00:00.000Z",
            },
          ],
        },
      }),
    });

    await expect(getAdminApi().getAdminSummary("admin-1")).resolves.toEqual({
      registeredUsers: 14,
      routes: 8,
      communityPosts: 31,
      reports: 3,
      recentActivity: [
        {
          kind: "report",
          title: "Spam report",
          detail: "Repeated promotion",
          occurredAt: "2026-11-02T00:00:00.000Z",
        },
      ],
    });
    const [url, options] = mocks.fetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/api\/admin\/summary$/);
    expect(new Headers(options.headers).get("Authorization")).toBe(
      "Bearer admin-token",
    );
  });

  it("preserves zero database totals", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        summary: {
          registeredUsers: 0,
          routes: 0,
          communityPosts: 0,
          reports: 0,
          recentActivity: [],
        },
      }),
    });

    await expect(getAdminApi().getAdminSummary("admin-1")).resolves.toEqual({
      registeredUsers: 0,
      routes: 0,
      communityPosts: 0,
      reports: 0,
      recentActivity: [],
    });
  });

  it("accepts degraded report metrics without fabricating totals", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        summary: {
          registeredUsers: 14,
          routes: 8,
          communityPosts: 31,
          reports: null,
          recentActivity: null,
        },
      }),
    });

    await expect(getAdminApi().getAdminSummary("admin-1")).resolves.toEqual({
      registeredUsers: 14,
      routes: 8,
      communityPosts: 31,
      reports: null,
      recentActivity: null,
    });
  });

  it("rejects malformed recent activity entries", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        summary: {
          registeredUsers: 14,
          routes: 8,
          communityPosts: 31,
          reports: 3,
          recentActivity: [
            {
              kind: "announcement",
              title: "Not a real activity kind",
              detail: "detail",
              occurredAt: "2026-11-01T00:00:00.000Z",
            },
          ],
        },
      }),
    });

    await expect(getAdminApi().getAdminSummary("admin-1")).rejects.toThrow(
      "Admin service returned an invalid response.",
    );
  });

  it("returns valid empty route and user collections without fabricating records", async () => {
    mocks.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, routes: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, users: [] }),
      });

    await expect(getAdminApi().getAdminRoutes("admin-1")).resolves.toEqual([]);
    await expect(getAdminApi().getAdminUsers("admin-1")).resolves.toEqual([]);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("loads community report identities and snapshots with the verified Admin token", async () => {
    const report = {
      id: 7,
      type: "Comment",
      targetType: "comment",
      postId: "post-1",
      commentId: "comment-1",
      reportedUserId: "author-1",
      reason: "Harassment or bullying",
      reportedContent: "Reported comment",
      reporter: "reporter-1",
      reportedUser: "Comment Author",
      date: "Nov 2, 2026",
      status: "Pending",
      description: "",
    };
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, reports: [report] }),
    });

    await expect(getAdminApi().getAdminReports("admin-1")).resolves.toEqual([
      report,
    ]);
    const [url, options] = mocks.fetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/api\/admin\/reports$/);
    expect(new Headers(options.headers).get("Authorization")).toBe(
      "Bearer admin-token",
    );
  });

  it("rejects malformed community report records", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        reports: [{ id: "not-an-id", type: "Legacy" }],
      }),
    });

    await expect(getAdminApi().getAdminReports("admin-1")).rejects.toThrow(
      "Admin service returned invalid reports data.",
    );
  });

  it("updates a report with the verified Admin token", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await expect(
      getAdminApi().updateAdminReportStatus("admin-1", 7, "Reviewed"),
    ).resolves.toBeUndefined();
    const [url, options] = mocks.fetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/api\/admin\/reports\/7$/);
    expect(new Headers(options.headers).get("Authorization")).toBe(
      "Bearer admin-token",
    );
    expect(JSON.parse(String(options.body))).toEqual({ status: "Reviewed" });
  });

  it("preserves route stop order from the server", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        routes: [
          {
            id: 12,
            name: "Central Loop",
            transport_type_id: 3,
            fare_area_id: null,
            is_active: true,
            is_approved: true,
            is_banned: false,
            is_deleted: false,
            moderation_status: "approved",
            transport_types: { name: "Jeepney", color: "#123456" },
            transport_variants: {
              id: 8,
              code: "JEEP",
              name: "Jeepney",
              fare_model: "distance",
            },
            route_stops: [
              {
                route_id: 12,
                stop_order: 1,
                terminals: {
                  id: 3,
                  name: "First Terminal",
                  latitude: 14.6,
                  longitude: 121.0,
                  is_approved: true,
                },
                stops: null,
              },
              {
                route_id: 12,
                stop_order: 2,
                terminals: null,
                stops: {
                  id: 6,
                  name: "Second Stop",
                  latitude: 14.61,
                  longitude: 121.01,
                  is_approved: true,
                  description: null,
                  stop_type: "road_stop",
                },
              },
            ],
          },
        ],
      }),
    });

    const [route] = await getAdminApi().getAdminRoutes("admin-1");

    expect(route.route_stops.map((stop) => stop.stop_order)).toEqual([1, 2]);
    expect(route.transport_variants?.fare_model).toBe("distance");
  });

  it("preserves nullable profile fields without adding account status", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        users: [
          {
            id: "user-2",
            email: null,
            username: null,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    });

    await expect(getAdminApi().getAdminUsers("admin-1")).resolves.toEqual([
      {
        id: "user-2",
        email: null,
        username: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("surfaces backend errors without returning successful fallback data", async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        success: false,
        message: "Unable to load admin data.",
      }),
    });

    await expect(getAdminApi().getAdminRoutes("admin-1")).rejects.toThrow(
      "Unable to load admin data.",
    );
  });

  it("rejects malformed success payloads", async () => {
    mocks.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          summary: { registeredUsers: "14", routes: 8, communityPosts: 31 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          users: [{ id: "user-1", email: "one@example.com" }],
        }),
      });

    await expect(getAdminApi().getAdminSummary("admin-1")).rejects.toThrow(
      "Admin service returned an invalid response.",
    );
    await expect(getAdminApi().getAdminUsers("admin-1")).rejects.toThrow(
      "Admin service returned an invalid response.",
    );
  });

  it("surfaces session lookup errors", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: new Error("session lookup failed"),
    });

    await expect(getAdminApi().getAdminSummary("admin-1")).rejects.toThrow(
      "session lookup failed",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("sends moderation decisions through the Route Management API", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await expect(
      getAdminApi().moderateRouteManagementRecord(
        "admin-1",
        "stop",
        12,
        "reject",
        "Duplicate stop",
      ),
    ).resolves.toBeUndefined();

    const [url, options] = mocks.fetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/api\/route-management\/moderation\/stop\/12$/);
    expect(options.method).toBe("POST");
    expect(new Headers(options.headers).get("Authorization")).toBe(
      "Bearer admin-token",
    );
    expect(new Headers(options.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(JSON.parse(options.body as string)).toEqual({
      action: "reject",
      moderation_note: "Duplicate stop",
    });
  });

  it("updates managed transit records through the Route Management API", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await getAdminApi().updateRouteManagementRecord("admin-1", "route", 12, {
      name: "Renamed Loop",
      transport_type_id: 3,
      is_active: false,
    });

    const [url, options] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/route-management\/records\/route\/12$/);
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body as string)).toEqual({
      name: "Renamed Loop",
      transport_type_id: 3,
      is_active: false,
    });
  });

  it("sends route update payloads to the route endpoint", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await expect(
      getAdminApi().updateAdminRoute("admin-1", 12, {
        name: "Renamed Loop",
        isActive: false,
      }),
    ).resolves.toBeUndefined();

    const [url, options] = mocks.fetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/api\/admin\/routes\/12$/);
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body as string)).toEqual({
      name: "Renamed Loop",
      isActive: false,
    });
  });

  it("sends route deletions without a request body", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await expect(
      getAdminApi().deleteAdminRoute("admin-1", 12),
    ).resolves.toBeUndefined();

    const [url, options] = mocks.fetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/api\/admin\/routes\/12$/);
    expect(options.method).toBe("DELETE");
    expect(options.body).toBeUndefined();
  });

  it("parses the verified unread notification count", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, unreadCount: 3 }),
    });

    await expect(
      getAdminApi().getAdminUnreadNotificationCount("admin-1"),
    ).resolves.toBe(3);

    const [url] = mocks.fetch.mock.calls[0] as [string];
    expect(url).toMatch(/\/api\/admin\/notifications\/unread-count$/);
  });

  it("preserves zero unread notifications", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, unreadCount: 0 }),
    });

    await expect(
      getAdminApi().getAdminUnreadNotificationCount("admin-1"),
    ).resolves.toBe(0);
  });

  it("rejects malformed unread counts", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, unreadCount: "three" }),
    });

    await expect(
      getAdminApi().getAdminUnreadNotificationCount("admin-1"),
    ).rejects.toThrow("Admin service returned an invalid response.");
  });

  it("parses notification events with per-admin read state", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        unreadCount: 1,
        notifications: [
          {
            id: "notif-1",
            postId: "post-1",
            reportId: 42,
            title: "Post reported",
            message: "Three unique reports",
            createdAt: "2026-11-17T10:00:00.000Z",
            isRead: false,
          },
          {
            id: "notif-2",
            postId: "post-2",
            reportId: null,
            title: "Post reported",
            message: "No linked report",
            createdAt: "2026-11-16T10:00:00.000Z",
            isRead: true,
          },
        ],
      }),
    });

    await expect(
      getAdminApi().getAdminNotifications("admin-1"),
    ).resolves.toEqual({
      unreadCount: 1,
      notifications: [
        {
          id: "notif-1",
          postId: "post-1",
          reportId: 42,
          title: "Post reported",
          message: "Three unique reports",
          createdAt: "2026-11-17T10:00:00.000Z",
          isRead: false,
        },
        {
          id: "notif-2",
          postId: "post-2",
          reportId: null,
          title: "Post reported",
          message: "No linked report",
          createdAt: "2026-11-16T10:00:00.000Z",
          isRead: true,
        },
      ],
    });

    const [url] = mocks.fetch.mock.calls[0] as [string];
    expect(url).toMatch(/\/api\/admin\/notifications$/);
  });

  it("rejects malformed notification events", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        unreadCount: 1,
        notifications: [
          {
            id: "notif-1",
            postId: "post-1",
            reportId: "not-a-number",
            title: "Post reported",
            message: "Three unique reports",
            createdAt: "2026-11-17T10:00:00.000Z",
            isRead: false,
          },
        ],
      }),
    });

    await expect(
      getAdminApi().getAdminNotifications("admin-1"),
    ).rejects.toThrow("Admin service returned an invalid response.");
  });

  it("marks a notification read with the verified session", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await expect(
      getAdminApi().markAdminNotificationRead("admin-1", "notif-1"),
    ).resolves.toBeUndefined();

    const [url, options] = mocks.fetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/api\/admin\/notifications\/notif-1\/read$/);
    expect(options.method).toBe("PATCH");
    expect(new Headers(options.headers).get("Authorization")).toBe(
      "Bearer admin-token",
    );
    expect(options.body).toBeUndefined();
  });

  it("sends a hide visibility payload to the admin post endpoint", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, postId: "post-1", isHidden: true }),
    });

    await expect(
      getAdminApi().setAdminPostVisibility("admin-1", "post-1", true),
    ).resolves.toBeUndefined();

    const [url, options] = mocks.fetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/api\/admin\/posts\/post-1\/visibility$/);
    expect(options.method).toBe("PATCH");
    expect(new Headers(options.headers).get("Authorization")).toBe(
      "Bearer admin-token",
    );
    expect(JSON.parse(options.body as string)).toEqual({ isHidden: true });
  });

  it("sends a show visibility payload to the admin post endpoint", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, postId: "post-1", isHidden: false }),
    });

    await expect(
      getAdminApi().setAdminPostVisibility("admin-1", "post-1", false),
    ).resolves.toBeUndefined();

    const [, options] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({ isHidden: false });
  });

  it("surfaces visibility update errors", async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ success: false, message: "Visibility update failed." }),
    });

    await expect(
      getAdminApi().setAdminPostVisibility("admin-1", "post-1", true),
    ).rejects.toThrow("Visibility update failed.");
  });
});
