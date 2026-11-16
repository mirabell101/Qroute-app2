import express from "express";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSupabaseClientForAccessToken: vi.fn(),
  getSupabaseAdminClient: vi.fn(),
  adminFrom: vi.fn(),
  adminResults: {} as Record<string, QueryResult[]>,
  storageFrom: vi.fn(),
  storageRemove: vi.fn(),
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

function createQuery(result: QueryResult) {
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
  query.insert.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.delete.mockReturnValue(query);
  return query;
}

describe("admin API authorization", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
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
        from: () =>
          createQuery({
            data: [
              {
                role: token === "admin-token" ? "admin" : "registered_user",
              },
            ],
            error: null,
          }),
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
      reports: [
        { data: null, error: null, count: 3 },
        {
          data: [
            {
              id: 1,
              type: "Post",
              reason: "Spam report",
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
      return createQuery(result);
    });
    mocks.storageRemove.mockReturnValue({ data: null, error: null });
    mocks.storageFrom.mockImplementation(() => ({
      remove: mocks.storageRemove,
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

  it.each(["summary", "routes", "users"])(
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
            title: "Spam report",
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
});
