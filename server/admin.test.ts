import { beforeAll, describe, expect, it, vi } from "vitest";

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

type AdminRouteStopInput = { kind: "terminal" | "stop"; id: number };

type AdminServices = {
  getAdminSummary: (client: never, reportClient: never) => Promise<unknown>;
  getAdminRoutes: (client: never) => Promise<unknown>;
  getAdminRouteManagementData: (
    client: never,
  ) => Promise<{ routes: unknown[] }>;
  getAdminUsers: (client: never) => Promise<unknown>;
  getAdminReports: (client: never) => Promise<unknown>;
  updateAdminReportStatus: (
    client: never,
    reportId: number,
    status: "Pending" | "Reviewed" | "Dismissed",
  ) => Promise<unknown>;
  updateAdminRoute: (
    client: never,
    routeId: number,
    input: {
      name?: string;
      transportTypeId?: number;
      variantId?: number;
      moderationStatus?: "pending" | "approved" | "rejected";
      moderationNote?: string | null;
      isActive?: boolean;
      stops?: AdminRouteStopInput[];
    },
  ) => Promise<unknown>;
  deleteAdminRoute: (
    client: never,
    routeId: number,
  ) => Promise<unknown>;
  deleteAdminPost: (client: never, postId: string) => Promise<unknown>;
};

let services: AdminServices | undefined;

beforeAll(async () => {
  try {
    services = await import("./admin.ts");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Cannot find module")) {
      throw error;
    }
  }
});

interface WriteCall {
  table: string;
  kind: "insert" | "update" | "delete";
  payload: unknown;
}

function createQuery(
  table: string,
  result: QueryResult,
  onWrite?: (call: WriteCall) => void,
) {
  const record = (kind: WriteCall["kind"], payload: unknown) => {
    onWrite?.({ table, kind, payload });
  };
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
  query.insert.mockImplementation((payload?: unknown) => {
    record("insert", payload);
    return query;
  });
  query.update.mockImplementation((payload?: unknown) => {
    record("update", payload);
    return query;
  });
  query.delete.mockImplementation(() => {
    record("delete", null);
    return query;
  });
  return query;
}

type StorageResult = { data: null; error: { message: string } | null };

function createClient(results: Record<string, QueryResult[]>) {
  const queues = new Map(
    Object.entries(results).map(([table, tableResults]) => [
      table,
      [...tableResults],
    ]),
  );
  const writeCalls: WriteCall[] = [];
  const from = vi.fn((table: string) => {
    const result = queues.get(table)?.shift();
    if (!result) throw new Error(`Unexpected query for ${table}.`);
    return createQuery(table, result, (call) => writeCalls.push(call));
  });
  const listUsers = vi.fn();
  const rpc = vi.fn().mockResolvedValue({ data: { id: 12 }, error: null });
  const storageRemove = vi.fn<() => StorageResult>(() => ({
    data: null,
    error: null,
  }));
  const storageFrom = vi.fn(() => ({ remove: storageRemove }));
  const client = {
    from,
    rpc,
    auth: { admin: { listUsers } },
    storage: { from: storageFrom },
  };
  return {
    client,
    from,
    rpc,
    listUsers,
    writeCalls,
    storageFrom,
    storageRemove,
  };
}

function requireService<
  T extends (...args: never[]) => Promise<unknown>,
>(service: T | undefined): T {
  expect(service).toBeTypeOf("function");
  return service!;
}

describe("admin data services", () => {
  it("counts unique registered users and exact route, post, and report totals", async () => {
    const { client, from } = createClient({
      user_roles: [
        {
          data: [
            { user_id: "user-1" },
            { user_id: "user-1" },
            { user_id: "user-2" },
          ],
          error: null,
        },
      ],
      routes: [{ data: null, error: null, count: 17 }],
      community_posts: [
        { data: null, error: null, count: 29 },
        {
          data: [
            {
              id: "post-1",
              title: "New terminal open",
              author_display_name: "Rider One",
              created_at: "2026-11-01T09:00:00.000Z",
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
              id: 2,
              target_type: "post",
              post_id: "post-1",
              comment_id: null,
              reported_user_id: "author-1",
              reported_user_name: "Rider One",
              reporter_id: "reporter-1",
              reason: "Spam or misleading content",
              reported_content: "Repeated promotion",
              description: null,
              status: "Pending",
              created_at: "2026-11-02T10:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
    });

    const getAdminSummary = requireService(services?.getAdminSummary);
    await expect(getAdminSummary(client as never, client as never)).resolves.toEqual({
      registeredUsers: 2,
      routes: 17,
      communityPosts: 29,
      reports: 3,
      recentActivity: [
        {
          kind: "report",
          title: "Spam or misleading content",
          detail: "Repeated promotion",
          occurredAt: "2026-11-02T10:00:00.000Z",
        },
        {
          kind: "post",
          title: "New terminal open",
          detail: "Posted by Rider One",
          occurredAt: "2026-11-01T09:00:00.000Z",
        },
      ],
    });
    expect(from).toHaveBeenCalledTimes(6);
  });

  it("degrades report metrics to null instead of fabricating zero totals", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { client } = createClient({
        user_roles: [{ data: [{ user_id: "user-1" }], error: null }],
        routes: [{ data: null, error: null, count: 5 }],
        community_posts: [
          { data: null, error: null, count: 9 },
          {
            data: [
              {
                id: "post-1",
                title: "Recent post",
                author_display_name: "Rider One",
                created_at: "2026-11-01T00:00:00.000Z",
              },
            ],
            error: null,
          },
        ],
        community_reports: [
          {
            data: null,
            error: { message: "community_reports table unavailable" },
            count: null,
          },
            { data: null, error: { message: "community_reports table unavailable" } },
        ],
      });

      const getAdminSummary = requireService(services?.getAdminSummary);
        await expect(getAdminSummary(client as never, client as never)).resolves.toEqual({
        registeredUsers: 1,
        routes: 5,
        communityPosts: 9,
        reports: null,
        recentActivity: null,
      });
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("returns actual route stops in stored stop order", async () => {
    const route = {
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
          stop_order: 2,
          terminals: null,
          stops: { id: 6, name: "Second Stop" },
        },
        {
          route_id: 12,
          stop_order: 1,
          terminals: { id: 3, name: "First Terminal" },
          stops: null,
        },
      ],
    };
    const { client } = createClient({
      routes: [{ data: [route], error: null }],
    });

    const getAdminRoutes = requireService(services?.getAdminRoutes);
    await expect(getAdminRoutes(client as never)).resolves.toMatchObject([
      {
        id: 12,
        route_stops: [
          { stop_order: 1, terminals: { name: "First Terminal" } },
          { stop_order: 2, stops: { name: "Second Stop" } },
        ],
      },
    ]);
  });

  it("returns the supplied pending route without changing its moderation fields", async () => {
    const pendingRoute = {
      id: 3,
      name: "NOVA BAYAN TO QCU",
      transport_type_id: 1,
      fare_area_id: null,
      is_active: true,
      is_approved: false,
      is_banned: false,
      is_deleted: false,
      moderation_status: "pending",
      moderation_note: null,
      transport_types: { name: "Jeepney", color: "#123456" },
      transport_variants: null,
      route_stops: [
        {
          route_id: 3,
          stop_order: 2,
          terminals: null,
          stops: {
            id: 5,
            name: "QCU",
            latitude: 14.71,
            longitude: 121.06,
            is_approved: true,
            moderation_status: "approved",
            description: null,
            stop_type: "road_stop",
          },
        },
        {
          route_id: 3,
          stop_order: 1,
          terminals: {
            id: 4,
            name: "NOVA BAYAN",
            latitude: 14.65,
            longitude: 121.05,
            is_approved: true,
            moderation_status: "approved",
          },
          stops: null,
        },
      ],
    };
    const { client } = createClient({
      routes: [{ data: [pendingRoute], error: null }],
      stops: [{ data: [], error: null }],
      terminals: [{ data: [], error: null }],
      transport_types: [{ data: [], error: null }],
    });

    const getAdminRouteManagementData = requireService(
      services?.getAdminRouteManagementData,
    );
    const data = await getAdminRouteManagementData(client as never);

    expect(data.routes).toContainEqual(
      expect.objectContaining({
        id: 3,
        name: "NOVA BAYAN TO QCU",
        is_active: true,
        is_approved: false,
        is_deleted: false,
        is_banned: false,
        moderation_status: "pending",
        route_stops: [
          expect.objectContaining({
            stop_order: 1,
            terminals: expect.objectContaining({
              latitude: 14.65,
              longitude: 121.05,
            }),
          }),
          expect.objectContaining({
            stop_order: 2,
            stops: expect.objectContaining({
              latitude: 14.71,
              longitude: 121.06,
            }),
          }),
        ],
      }),
    );
  });

  it("returns registered users and Moderators with their database roles", async () => {
    const { client, listUsers } = createClient({
      user_roles: [
        {
          data: [
            { user_id: "user-1", role: "registered_user" },
            { user_id: "user-2", role: "registered_user" },
            { user_id: "user-2", role: "registered_user" },
            { user_id: "moderator-1", role: "moderator" },
          ],
          error: null,
        },
      ],
      profiles: [
        {
          data: [
            { id: "user-1", username: "rider_one" },
            { id: "user-2", username: null },
            { id: "moderator-1", username: "route_mod" },
          ],
          error: null,
        },
      ],
    });
    listUsers.mockResolvedValue({
      data: {
        users: [
          {
            id: "user-1",
            email: "one@example.com",
            created_at: "2026-01-02T00:00:00.000Z",
          },
          {
            id: "user-2",
            email: "two@example.com",
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "moderator-1",
            email: "moderator@example.com",
            created_at: "2025-12-15T00:00:00.000Z",
          },
          {
            id: "admin-1",
            email: "admin@example.com",
            created_at: "2025-12-01T00:00:00.000Z",
          },
        ],
      },
      error: null,
    });

    const getAdminUsers = requireService(services?.getAdminUsers);
    await expect(getAdminUsers(client as never)).resolves.toEqual([
      {
        id: "user-1",
        email: "one@example.com",
        username: "rider_one",
        createdAt: "2026-01-02T00:00:00.000Z",
        role: "registered_user",
      },
      {
        id: "user-2",
        email: "two@example.com",
        username: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        role: "registered_user",
      },
      {
        id: "moderator-1",
        email: "moderator@example.com",
        username: "route_mod",
        createdAt: "2025-12-15T00:00:00.000Z",
        role: "moderator",
      },
    ]);
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 1000 });
  });

  it("rejects a dashboard query error rather than returning successful zero totals", async () => {
    const { client } = createClient({
      user_roles: [
        { data: null, error: { message: "roles unavailable" } },
      ],
      routes: [{ data: null, error: null, count: 0 }],
      community_posts: [
        { data: null, error: null, count: 0 },
        { data: [], error: null },
      ],
      community_reports: [
        { data: null, error: null, count: 0 },
        { data: [], error: null },
      ],
    });

    const getAdminSummary = requireService(services?.getAdminSummary);
    await expect(getAdminSummary(client as never, client as never)).rejects.toThrow("roles unavailable");
  });

  it("maps community report target identity and snapshots for Admin moderation", async () => {
    const { client, from } = createClient({
      community_reports: [{
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
          description: "Repeated targeting.",
          status: "Pending",
          created_at: "2026-11-02T10:00:00.000Z",
        }],
        error: null,
      }],
    });

    const getAdminReports = requireService(services?.getAdminReports);
    await expect(getAdminReports(client as never)).resolves.toEqual([{
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
      description: "Repeated targeting.",
    }]);
    expect(from).toHaveBeenCalledWith("community_reports");
  });

  it("updates report status in community_reports", async () => {
    const { client, from, writeCalls } = createClient({
      community_reports: [{ data: { id: 7 }, error: null }],
    });

    const updateAdminReportStatus = requireService(
      services?.updateAdminReportStatus,
    );
    await expect(
      updateAdminReportStatus(client as never, 7, "Reviewed"),
    ).resolves.toBeUndefined();
    expect(from).toHaveBeenCalledWith("community_reports");
    expect(writeCalls).toEqual([
      expect.objectContaining({
        table: "community_reports",
        kind: "update",
        payload: expect.objectContaining({ status: "Reviewed" }),
      }),
    ]);
  });

  it("rejects auth and profile failures instead of returning partial users", async () => {
    const { client: rolesClient, listUsers } = createClient({
      user_roles: [
        { data: [{ user_id: "user-1" }], error: null },
      ],
    });
    listUsers.mockResolvedValue({
      data: null,
      error: { message: "Auth Admin unavailable" },
    });
    const getAdminUsers = requireService(services?.getAdminUsers);
    await expect(getAdminUsers(rolesClient as never)).rejects.toThrow(
      "Auth Admin unavailable",
    );

    const { client: profilesClient, listUsers: successfulListUsers } =
      createClient({
        user_roles: [
          { data: [{ user_id: "user-1" }], error: null },
        ],
        profiles: [
          { data: null, error: { message: "profiles unavailable" } },
        ],
      });
    successfulListUsers.mockResolvedValue({
      data: {
        users: [
          {
            id: "user-1",
            email: "one@example.com",
            created_at: "2026-01-02T00:00:00.000Z",
          },
        ],
      },
      error: null,
    });
    await expect(getAdminUsers(profilesClient as never)).rejects.toThrow(
      "profiles unavailable",
    );
  });

  it("updates route details and replaces the ordered stops", async () => {
    const { client, rpc } = createClient({});

    const updateAdminRoute = requireService(services?.updateAdminRoute);
    await expect(
      updateAdminRoute(
        client as never,
        12,
        {
          name: "Renamed Loop",
          moderationStatus: "approved",
          stops: [
            { kind: "terminal", id: 3 },
            { kind: "stop", id: 6 },
          ],
        },
      ),
    ).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledWith(
      "manage_transit_record",
      {
        p_entity_type: "route",
        p_action: "update",
        p_entity_id: 12,
        p_payload: {
          name: "Renamed Loop",
          moderation_status: "approved",
          moderation_note: null,
          stops: [
            { kind: "terminal", id: 3 },
            { kind: "stop", id: 6 },
          ],
        },
      },
    );
  });

  it("rejects updates for a missing route", async () => {
    const { client, rpc } = createClient({});
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "route not found" },
    });

    const updateAdminRoute = requireService(services?.updateAdminRoute);
    await expect(
      updateAdminRoute(
        client as never,
        12,
        { name: "Renamed Loop" },
      ),
    ).rejects.toThrow("Route not found.");
  });

  it("soft-deletes a live route", async () => {
    const { client, rpc } = createClient({});

    const deleteAdminRoute = requireService(services?.deleteAdminRoute);
    await expect(
      deleteAdminRoute(client as never, 12),
    ).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledWith(
      "manage_transit_record",
      {
        p_entity_type: "route",
        p_action: "archive",
        p_entity_id: 12,
        p_payload: {},
      },
    );
  });

  it("treats deleting an already-deleted route as success", async () => {
    const { client } = createClient({});

    const deleteAdminRoute = requireService(services?.deleteAdminRoute);
    await expect(
      deleteAdminRoute(client as never, 12),
    ).resolves.toBeUndefined();
  });

  it("rejects deleting a route that never existed", async () => {
    const { client, rpc } = createClient({});
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "missing route" },
    });

    const deleteAdminRoute = requireService(services?.deleteAdminRoute);
    await expect(
      deleteAdminRoute(client as never, 12),
    ).rejects.toThrow("Route not found.");
  });

  it("deletes a community post and cleans up only its stored photo paths", async () => {
    const { client, storageFrom, storageRemove, writeCalls } = createClient({
      community_posts: [
        { data: { photo_paths: ["posts/a.jpg", 42, ""] }, error: null },
        { data: null, error: null },
      ],
    });

    const deleteAdminPost = requireService(services?.deleteAdminPost);
    await expect(
      deleteAdminPost(client as never, "post-1"),
    ).resolves.toBeUndefined();

    expect(storageFrom).toHaveBeenCalledWith("community-post-photos");
    expect(storageRemove).toHaveBeenCalledWith(["posts/a.jpg"]);
    expect(writeCalls).toEqual([
      { table: "community_posts", kind: "delete", payload: null },
    ]);
  });

  it("rejects deleting a missing community post", async () => {
    const { client } = createClient({
      community_posts: [{ data: null, error: null }],
    });

    const deleteAdminPost = requireService(services?.deleteAdminPost);
    await expect(
      deleteAdminPost(client as never, "post-1"),
    ).rejects.toThrow("Community post not found.");
  });

  it("tolerates photo cleanup failures after the post row is deleted", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { client, storageRemove } = createClient({
        community_posts: [
          { data: { photo_paths: ["posts/a.jpg"] }, error: null },
          { data: null, error: null },
        ],
      });
      storageRemove.mockReturnValue({
        data: null,
        error: { message: "storage unavailable" },
      });

      const deleteAdminPost = requireService(services?.deleteAdminPost);
      await expect(
        deleteAdminPost(client as never, "post-1"),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
