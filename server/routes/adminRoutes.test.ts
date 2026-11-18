import express from "express";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
  count?: number | null;
};

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSupabaseClientForAccessToken: vi.fn(),
  getSupabaseAdminClient: vi.fn(),
  adminFrom: vi.fn(),
  adminUpdate: vi.fn(),
  adminResults: {} as Record<string, QueryResult[]>,
  requestFrom: vi.fn(),
  requestInsert: vi.fn(),
  requestUpdate: vi.fn(),
  requestResults: {} as Record<string, QueryResult[]>,
  storageFrom: vi.fn(),
  storageRemove: vi.fn(),
  storageDownload: vi.fn(),
}));

vi.mock("../supabaseClient.ts", () => ({
  getSupabaseClient: () => ({ auth: { getUser: mocks.getUser } }),
  getSupabaseClientForAccessToken: mocks.getSupabaseClientForAccessToken,
  getSupabaseAdminClient: mocks.getSupabaseAdminClient,
}));

let adminRouter: express.Router | undefined;

beforeAll(async () => {
  try {
    adminRouter = (await import("./adminRoutes.ts")).default;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Cannot find module")) {
      throw error;
    }
  }
});

function createQuery(
  result: QueryResult,
  onInsert?: (values: unknown) => void,
  onUpdate?: (values: unknown) => void,
) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    in: vi.fn(),
    limit: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.insert.mockImplementation((values: unknown) => {
    onInsert?.(values);
    return query;
  });
  query.update.mockImplementation((values: unknown) => {
    onUpdate?.(values);
    return query;
  });
  query.delete.mockReturnValue(query);
  return query;
}

describe("admin API authorization", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requestResults = {};
    mocks.getUser.mockImplementation(async (token: string) => {
      const users: Record<string, { id: string }> = {
        "admin-token": { id: "admin-1" },
        "user-token": { id: "user-1" },
      };
      const user = users[token] ?? null;
      return {
        data: { user },
        error: user ? null : new Error("Invalid token"),
      };
    });
    mocks.getSupabaseClientForAccessToken.mockImplementation(
      (token: string) => ({
        from: (table: string) => {
          mocks.requestFrom(table);
          if (table === "user_roles") {
            return createQuery({
              data: [
                {
                  role: token === "admin-token" ? "admin" : "registered_user",
                },
              ],
              error: null,
            });
          }
          const result = mocks.requestResults[table]?.shift();
          if (!result) throw new Error(`Unexpected request query for ${table}.`);
          return createQuery(result, mocks.requestInsert, mocks.requestUpdate);
        },
      }),
    );
    mocks.adminResults = {
      user_roles: [{ data: [{ user_id: "user-1" }], error: null }],
      routes: [{ data: null, error: null, count: 2 }],
      community_posts: [
        { data: null, error: null, count: 4 },
        {
          data: [
            {
              id: "post-1",
              title: "Fare update",
              author_display_name: "Rider One",
              created_at: "2026-11-01T00:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
      community_reports: [
        { data: null, error: null, count: 3 },
        {
          data: [
            {
              id: 1,
              target_type: "post",
              reason: "Spam or misleading content",
              reported_content: "Repeated promotion",
              created_at: "2026-11-02T00:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
    };
    mocks.adminFrom.mockImplementation((table: string) => {
      const result = mocks.adminResults[table]?.shift();
      if (!result) throw new Error(`Unexpected query for ${table}.`);
      return createQuery(result, undefined, mocks.adminUpdate);
    });
    mocks.storageRemove.mockReturnValue({ data: null, error: null });
    mocks.storageDownload.mockResolvedValue({
      data: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
        type: "image/jpeg",
      }),
      error: null,
    });
    mocks.storageFrom.mockImplementation(() => ({
      remove: mocks.storageRemove,
      download: mocks.storageDownload,
    }));
    mocks.getSupabaseAdminClient.mockReturnValue({
      from: mocks.adminFrom,
      auth: { admin: { listUsers: vi.fn() } },
      storage: { from: mocks.storageFrom },
    });

    const app = express();
    app.use(express.json());
    if (adminRouter) {
      app.use("/api/admin", adminRouter);
    } else {
      app.use("/api/admin", (_req, res) => res.sendStatus(404));
    }
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not bind to a TCP port.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it.each(["summary", "routes", "users", "reports"])(
    "rejects unauthenticated access to %s",
    async (endpoint) => {
      const response = await fetch(`${baseUrl}/api/admin/${endpoint}`);

      expect(response.status).toBe(401);
      expect(mocks.getSupabaseAdminClient).not.toHaveBeenCalled();
    },
  );

  it.each(["summary", "routes", "users"])(
    "rejects a registered user from %s",
    async (endpoint) => {
      const response = await fetch(`${baseUrl}/api/admin/${endpoint}`, {
        headers: { Authorization: "Bearer user-token" },
      });

      expect(response.status).toBe(403);
      expect(mocks.getSupabaseAdminClient).not.toHaveBeenCalled();
    },
  );

  const writeTargets: Array<
    [string, string, Record<string, unknown> | null]
  > = [
    [
      "POST",
      "/routes",
      {
        name: "Loop",
        transportTypeId: 3,
        variantId: 8,
        stops: [
          { kind: "terminal", id: 3 },
          { kind: "stop", id: 6 },
        ],
      },
    ],
    ["PATCH", "/routes/12", { name: "Renamed" }],
    ["DELETE", "/routes/12", null],
    ["DELETE", "/posts/post-1", null],
    ["PATCH", "/reports/7", { status: "Reviewed" }],
    [
      "PATCH",
      "/posts/20000000-0000-4000-8000-000000000001/visibility",
      { isHidden: true },
    ],
  ];

  it.each(writeTargets)(
    "rejects unauthenticated write access to %s %s",
    async (method, path, body) => {
      const response = await fetch(`${baseUrl}/api/admin${path}`, {
        method,
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });

      expect(response.status).toBe(401);
      expect(mocks.getSupabaseAdminClient).not.toHaveBeenCalled();
    },
  );

  it.each(writeTargets)(
    "rejects a registered user from writing %s %s",
    async (method, path, body) => {
      const response = await fetch(`${baseUrl}/api/admin${path}`, {
        method,
        headers: {
          Authorization: "Bearer user-token",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      expect(response.status).toBe(403);
      expect(mocks.getSupabaseAdminClient).not.toHaveBeenCalled();
    },
  );

  it("allows an admin to read actual summary totals", async () => {
    mocks.requestResults.community_reports = [
      { data: null, error: null, count: 3 },
      {
        data: [{
          id: 1,
          target_type: "post",
          reason: "Spam or misleading content",
          reported_content: "Repeated promotion",
          created_at: "2026-11-02T00:00:00.000Z",
        }],
        error: null,
      },
    ];
    const response = await fetch(`${baseUrl}/api/admin/summary`, {
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      summary: {
        registeredUsers: 1,
        routes: 2,
        communityPosts: 4,
        reports: 3,
        recentActivity: [
          {
            kind: "report",
            title: "Spam or misleading content",
            detail: "Repeated promotion",
            occurredAt: "2026-11-02T00:00:00.000Z",
          },
          {
            kind: "post",
            title: "Fare update",
            detail: "Posted by Rider One",
            occurredAt: "2026-11-01T00:00:00.000Z",
          },
        ],
      },
    });
    expect(mocks.requestFrom).toHaveBeenCalledWith("community_reports");
    expect(mocks.getSupabaseAdminClient).toHaveBeenCalledTimes(1);
  });

  it("lists Community reports through the verified Admin token", async () => {
    mocks.requestResults.community_reports = [{
      data: [{
        id: 7,
        target_type: "comment",
        post_id: "post-1",
        comment_id: "comment-1",
        reported_user_id: "author-1",
        reported_user_name: "Comment Author",
        reported_content: "Reported comment",
        reporter_id: "reporter-1",
        reason: "Harassment or bullying",
        description: null,
        status: "Pending",
        created_at: "2026-11-02T10:00:00.000Z",
      }],
      error: null,
    }];

    const response = await fetch(`${baseUrl}/api/admin/reports`, {
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      reports: [{
        type: "Comment",
        targetType: "comment",
        postId: "post-1",
        commentId: "comment-1",
        reporter: "reporter-1",
        reportedUser: "Comment Author",
      }],
    });
    expect(mocks.requestFrom).toHaveBeenCalledWith("community_reports");
    expect(mocks.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("updates Community report status through the verified Admin token", async () => {
    mocks.requestResults.community_reports = [{ data: { id: 7 }, error: null }];

    const response = await fetch(`${baseUrl}/api/admin/reports/7`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "Reviewed" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requestFrom).toHaveBeenCalledWith("community_reports");
    expect(mocks.requestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "Reviewed" }),
    );
    expect(mocks.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("rejects a status update without a request body", async () => {
    const response = await fetch(`${baseUrl}/api/admin/reports/7`, {
      method: "PATCH",
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(response.status).toBe(400);
    expect(mocks.requestFrom).not.toHaveBeenCalledWith("community_reports");
  });

  it("returns an error when dashboard data cannot be loaded", async () => {
    mocks.adminResults.user_roles = [
      { data: null, error: { message: "private database detail" } },
    ];

    const response = await fetch(`${baseUrl}/api/admin/summary`, {
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: expect.not.stringContaining("private database detail"),
    });
  });

  it("creates a route for an admin", async () => {
    mocks.adminResults = {
      transport_variants: [
        { data: { id: 8, transport_type_id: 3 }, error: null },
      ],
      terminals: [{ data: [{ id: 3 }], error: null }],
      stops: [{ data: [{ id: 6 }], error: null }],
      routes: [{ data: { id: 99 }, error: null }],
      route_stops: [{ data: null, error: null }],
    };

    const response = await fetch(`${baseUrl}/api/admin/routes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-token",
      },
      body: JSON.stringify({
        name: "Quezon Loop",
        transportTypeId: 3,
        variantId: 8,
        stops: [
          { kind: "terminal", id: 3 },
          { kind: "stop", id: 6 },
        ],
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      route: { id: 99 },
    });
  });

  it("rejects invalid route creation payloads", async () => {
    const response = await fetch(`${baseUrl}/api/admin/routes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-token",
      },
      body: JSON.stringify({ name: "" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "Route name must be between 1 and 180 characters.",
    });
    expect(mocks.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("rejects a variant that does not belong to the selected transport type", async () => {
    mocks.adminResults = {
      transport_variants: [
        { data: { id: 8, transport_type_id: 4 }, error: null },
      ],
    };

    const response = await fetch(`${baseUrl}/api/admin/routes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-token",
      },
      body: JSON.stringify({
        name: "Quezon Loop",
        transportTypeId: 3,
        variantId: 8,
        stops: [
          { kind: "terminal", id: 3 },
          { kind: "stop", id: 6 },
        ],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "The selected variant does not belong to the selected transport type.",
    });
  });

  it("updates a route for an admin", async () => {
    mocks.adminResults = {
      routes: [
        { data: { id: 12, transport_type_id: 3, variant_id: 8 }, error: null },
        { data: null, error: null },
      ],
    };

    const response = await fetch(`${baseUrl}/api/admin/routes/12`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-token",
      },
      body: JSON.stringify({ name: "Renamed Loop" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("rejects route updates for a missing route", async () => {
    mocks.adminResults = {
      routes: [{ data: null, error: null }],
    };

    const response = await fetch(`${baseUrl}/api/admin/routes/12`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-token",
      },
      body: JSON.stringify({ name: "Renamed Loop" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "Route not found.",
    });
  });

  it("deletes a route for an admin", async () => {
    mocks.adminResults = {
      routes: [{ data: { id: 12 }, error: null }],
    };

    const response = await fetch(`${baseUrl}/api/admin/routes/12`, {
      method: "DELETE",
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("rejects deleting a route that never existed", async () => {
    mocks.adminResults = {
      routes: [
        { data: null, error: null },
        { data: null, error: null },
      ],
    };

    const response = await fetch(`${baseUrl}/api/admin/routes/12`, {
      method: "DELETE",
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "Route not found.",
    });
  });

  it("deletes a community post for an admin and removes its photos", async () => {
    mocks.adminResults = {
      community_posts: [
        { data: { photo_paths: ["posts/a.jpg"] }, error: null },
        { data: null, error: null },
      ],
    };

    const response = await fetch(`${baseUrl}/api/admin/posts/post-1`, {
      method: "DELETE",
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.storageFrom).toHaveBeenCalledWith("community-post-photos");
    expect(mocks.storageRemove).toHaveBeenCalledWith(["posts/a.jpg"]);
  });

  it.each(["notifications", "notifications/unread-count"])(
    "rejects unauthenticated access to %s",
    async (endpoint) => {
      const response = await fetch(`${baseUrl}/api/admin/${endpoint}`);

      expect(response.status).toBe(401);
    },
  );

  it.each(["notifications", "notifications/unread-count"])(
    "rejects a registered user from %s",
    async (endpoint) => {
      const response = await fetch(`${baseUrl}/api/admin/${endpoint}`, {
        headers: { Authorization: "Bearer user-token" },
      });

      expect(response.status).toBe(403);
    },
  );

  it("lists notifications with read state scoped to the verified admin", async () => {
    mocks.requestResults = {
      admin_notifications: [
        {
          data: [
            {
              id: "30000000-0000-4000-8000-000000000001",
              post_id: "20000000-0000-4000-8000-000000000001",
              report_id: 7,
              title: "Post Needs Review",
              message: "The post reached the report threshold.",
              created_at: "2026-11-17T12:00:00.000Z",
            },
            {
              id: "30000000-0000-4000-8000-000000000002",
              post_id: "20000000-0000-4000-8000-000000000002",
              report_id: null,
              title: "Post Needs Review",
              message: "Another post reached the threshold.",
              created_at: "2026-11-17T11:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
      admin_notification_reads: [
        {
          data: [
            {
              notification_id: "30000000-0000-4000-8000-000000000002",
            },
          ],
          error: null,
        },
      ],
    };

    const response = await fetch(`${baseUrl}/api/admin/notifications`, {
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      unreadCount: 1,
      notifications: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          postId: "20000000-0000-4000-8000-000000000001",
          reportId: 7,
          title: "Post Needs Review",
          message: "The post reached the report threshold.",
          createdAt: "2026-11-17T12:00:00.000Z",
          isRead: false,
        },
        {
          id: "30000000-0000-4000-8000-000000000002",
          postId: "20000000-0000-4000-8000-000000000002",
          reportId: null,
          title: "Post Needs Review",
          message: "Another post reached the threshold.",
          createdAt: "2026-11-17T11:00:00.000Z",
          isRead: true,
        },
      ],
    });
  });

  it("returns the current admin's unread notification count", async () => {
    mocks.requestResults = {
      admin_notifications: [
        {
          data: [
            { id: "30000000-0000-4000-8000-000000000001" },
            { id: "30000000-0000-4000-8000-000000000002" },
          ],
          error: null,
        },
      ],
      admin_notification_reads: [
        {
          data: [{ notification_id: "30000000-0000-4000-8000-000000000002" }],
          error: null,
        },
      ],
    };

    const response = await fetch(
      `${baseUrl}/api/admin/notifications/unread-count`,
      { headers: { Authorization: "Bearer admin-token" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      unreadCount: 1,
    });
  });

  it("marks notifications read idempotently for the verified admin only", async () => {
    const notificationId = "30000000-0000-4000-8000-000000000001";
    mocks.requestResults = {
      admin_notification_reads: [
        { data: null, error: null },
        {
          data: null,
          error: { code: "23505", message: "duplicate receipt" },
        },
      ],
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(
        `${baseUrl}/api/admin/notifications/${notificationId}/read`,
        {
          method: "PATCH",
          headers: { Authorization: "Bearer admin-token" },
        },
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true });
    }

    expect(mocks.requestInsert).toHaveBeenCalledTimes(2);
    expect(mocks.requestInsert).toHaveBeenNthCalledWith(1, {
      notification_id: notificationId,
      admin_user_id: "admin-1",
    });
    expect(mocks.requestInsert).toHaveBeenNthCalledWith(2, {
      notification_id: notificationId,
      admin_user_id: "admin-1",
    });
  });

  it("rejects malformed notification IDs before writing a receipt", async () => {
    const response = await fetch(
      `${baseUrl}/api/admin/notifications/not-a-uuid/read`,
      {
        method: "PATCH",
        headers: { Authorization: "Bearer admin-token" },
      },
    );

    expect(response.status).toBe(400);
    expect(mocks.requestInsert).not.toHaveBeenCalled();
  });

  it("persists admin post visibility changes and supports restoring a post", async () => {
    mocks.adminResults = {
      community_posts: [
        { data: { id: "20000000-0000-4000-8000-000000000001" }, error: null },
        { data: { id: "20000000-0000-4000-8000-000000000001" }, error: null },
      ],
    };

    for (const isHidden of [true, false]) {
      const response = await fetch(
        `${baseUrl}/api/admin/posts/20000000-0000-4000-8000-000000000001/visibility`,
        {
          method: "PATCH",
          headers: {
            Authorization: "Bearer admin-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ isHidden }),
        },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true });
    }

    expect(mocks.adminUpdate).toHaveBeenNthCalledWith(1, { is_hidden: true });
    expect(mocks.adminUpdate).toHaveBeenNthCalledWith(2, { is_hidden: false });
  });

  it("rejects malformed post visibility payloads", async () => {
    const response = await fetch(
      `${baseUrl}/api/admin/posts/20000000-0000-4000-8000-000000000001/visibility`,
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isHidden: "yes", title: "Unexpected update" }),
      },
    );

    expect(response.status).toBe(400);
    expect(mocks.adminUpdate).not.toHaveBeenCalled();
  });

  const adminPhotoPostId = "20000000-0000-4000-8000-000000000001";

  it("serves a hidden post photo to an admin with no-store headers", async () => {
    mocks.adminResults = {
      community_posts: [
        {
          data: { photo_paths: ["author-1/hidden.jpg"] },
          error: null,
        },
      ],
    };

    const response = await fetch(
      `${baseUrl}/api/admin/posts/${adminPhotoPostId}/photos/0`,
      { headers: { Authorization: "Bearer admin-token" } },
    );

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff]),
    );
    expect(response.headers.get("content-type")).toContain("image/");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.storageFrom).toHaveBeenCalledWith("community-post-photos");
    expect(mocks.storageDownload).toHaveBeenCalledWith("author-1/hidden.jpg");
  });

  it("denies admin photo access to anonymous and regular callers", async () => {
    const anonymous = await fetch(
      `${baseUrl}/api/admin/posts/${adminPhotoPostId}/photos/0`,
    );
    const regular = await fetch(
      `${baseUrl}/api/admin/posts/${adminPhotoPostId}/photos/0`,
      { headers: { Authorization: "Bearer user-token" } },
    );

    expect(anonymous.status).toBe(401);
    expect(regular.status).toBe(403);
    expect(mocks.getSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.storageDownload).not.toHaveBeenCalled();
  });

  it("rejects malformed admin photo IDs and indexes", async () => {
    const badPost = await fetch(
      `${baseUrl}/api/admin/posts/not-a-uuid/photos/0`,
      { headers: { Authorization: "Bearer admin-token" } },
    );
    const badIndex = await fetch(
      `${baseUrl}/api/admin/posts/${adminPhotoPostId}/photos/-1`,
      { headers: { Authorization: "Bearer admin-token" } },
    );

    expect(badPost.status).toBe(400);
    expect(badIndex.status).toBe(400);
    expect(mocks.storageDownload).not.toHaveBeenCalled();
  });

  it("returns not found when the requested photo does not belong to the post", async () => {
    mocks.adminResults = {
      community_posts: [
        {
          data: { photo_paths: ["author-1/hidden.jpg"] },
          error: null,
        },
      ],
    };

    const response = await fetch(
      `${baseUrl}/api/admin/posts/${adminPhotoPostId}/photos/2`,
      { headers: { Authorization: "Bearer admin-token" } },
    );

    expect(response.status).toBe(404);
    expect(mocks.storageDownload).not.toHaveBeenCalled();
  });
});
