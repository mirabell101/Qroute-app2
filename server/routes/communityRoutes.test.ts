import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserClient: vi.fn(),
  getAdminClient: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
  storageDownload: vi.fn(),
  reportInsert: vi.fn(),
  insertResult: {
    data: { id: 101 },
    error: null as { code?: string; message: string } | null,
  },
  comment: {
    id: "30000000-0000-4000-8000-000000000001",
    post_id: "20000000-0000-4000-8000-000000000001",
    author_id: "comment-author-1",
    author_display_name: "Comment Author",
    content: "Comment content.",
    created_at: "2026-11-18T00:00:00.000Z",
  },
  post: {
    id: "20000000-0000-4000-8000-000000000001",
    author_id: "author-1",
    author_display_name: "Post Author",
    content: "The post content.",
    is_hidden: false,
  } as Record<string, unknown> | null,
}));

vi.mock("../supabaseClient.ts", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  }),
  getSupabaseClientForAccessToken: mocks.getUserClient,
  getSupabaseAdminClient: mocks.getAdminClient,
}));

import communityRoutes from "./communityRoutes.ts";

describe("Community routes", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.post = {
      id: "20000000-0000-4000-8000-000000000001",
      author_id: "author-1",
      author_display_name: "Post Author",
      content: "The post content.",
      is_hidden: false,
    };
    mocks.comment = {
      id: "30000000-0000-4000-8000-000000000001",
      post_id: "20000000-0000-4000-8000-000000000001",
      author_id: "comment-author-1",
      author_display_name: "Comment Author",
      content: "Comment content.",
      created_at: "2026-11-18T00:00:00.000Z",
    };
    mocks.insertResult = { data: { id: 101 }, error: null };
    mocks.rpc.mockResolvedValue({ data: { posts: [] }, error: null });
    mocks.storageDownload.mockResolvedValue({
      data: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
        type: "image/jpeg",
      }),
      error: null,
    });
    mocks.storageFrom.mockReturnValue({ download: mocks.storageDownload });
    mocks.getUser.mockImplementation(async (token: string) => {
      const users: Record<string, { id: string; email: string }> = {
        "registered-token": {
          id: "reporter-1",
          email: "rider@example.com",
        },
        "regular-token": {
          id: "regular-1",
          email: "regular@example.com",
        },
      };
      const user = users[token] ?? null;
      return {
        data: { user },
        error: user ? null : new Error("Invalid token"),
      };
    });

    mocks.getUserClient.mockImplementation((token: string) => ({
      from: (table: string) => {
        const filters: Record<string, string> = {};
        let selectedColumns: string[] = [];
        const query = {
          select: vi.fn((columns?: string) => {
            selectedColumns = columns?.split(",").map((column) => column.trim()) ?? [];
            return query;
          }),
          eq: vi.fn((column: string, value: string) => {
            filters[column] = value;
            return query;
          }),
          in: vi.fn(() => query),
          order: vi.fn(async () => ({
            data: table === "community_post_comments"
              ? [Object.fromEntries(
                  selectedColumns
                    .filter((column) => column in mocks.comment)
                    .map((column) => [column, mocks.comment[column as keyof typeof mocks.comment]]),
                )]
              : [],
            error: null,
          })),
          maybeSingle: vi.fn(async () => {
            if (table === "user_roles") {
              return token === "registered-token"
                ? { data: { role: "registered_user" }, error: null }
                : { data: null, error: null };
            }
            if (
              table === "community_posts" &&
              filters.id === "20000000-0000-4000-8000-000000000001"
            ) {
              return { data: mocks.post, error: null };
            }
            if (
              table === "community_post_comments" &&
              filters.id === "30000000-0000-4000-8000-000000000001"
            ) {
              return { data: mocks.comment, error: null };
            }
            return { data: null, error: null };
          }),
          insert: vi.fn((values: Record<string, unknown>) => {
            mocks.reportInsert(values);
            return query;
          }),
          single: vi.fn(async () => mocks.insertResult),
        };
        return query;
      },
    }));

    mocks.getAdminClient.mockReturnValue({
      from: (table: string) => {
        throw new Error(`Unexpected privileged table: ${table}`);
      },
      storage: { from: mocks.storageFrom },
    });

    const app = express();
    app.use(express.json());
    app.use("/api/community", communityRoutes);
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

  it("creates a post report from verified post details without trusting client identities", async () => {
    const response = await fetch(
      `${baseUrl}/api/community/posts/20000000-0000-4000-8000-000000000001/reports`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer registered-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType: "post",
          reason: "Spam or misleading content",
          description: "Repeated promotional content.",
          reporter: "forged reporter",
          reporter_user_id: "another-user",
          reported_user: "forged author",
        }),
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      report: { id: 101 },
    });

    expect(mocks.reportInsert).toHaveBeenCalledWith({
      target_type: "post",
      post_id: "20000000-0000-4000-8000-000000000001",
      comment_id: null,
      reported_user_id: "author-1",
      reported_user_name: "Post Author",
      reported_content: "The post content.",
      reason: "Spam or misleading content",
      description: "Repeated promotional content.",
    });
    expect(mocks.getAdminClient).not.toHaveBeenCalled();
  });

  it("creates comment and user reports with the comment's actual post and author", async () => {
    const commentReport = await fetch(
      `${baseUrl}/api/community/comments/30000000-0000-4000-8000-000000000001/reports`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer registered-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType: "comment",
          reason: "Harassment or bullying",
        }),
      },
    );

    expect(commentReport.status).toBe(201);
    expect(mocks.reportInsert).toHaveBeenLastCalledWith({
      target_type: "comment",
      post_id: "20000000-0000-4000-8000-000000000001",
      comment_id: "30000000-0000-4000-8000-000000000001",
      reported_user_id: "comment-author-1",
      reported_user_name: "Comment Author",
      reported_content: "Comment content.",
      reason: "Harassment or bullying",
      description: null,
    });

    const userReport = await fetch(
      `${baseUrl}/api/community/comments/30000000-0000-4000-8000-000000000001/reports`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer registered-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType: "user",
          reason: "Privacy violation",
        }),
      },
    );

    expect(userReport.status).toBe(201);
    expect(mocks.reportInsert).toHaveBeenLastCalledWith({
      target_type: "user",
      post_id: "20000000-0000-4000-8000-000000000001",
      comment_id: "30000000-0000-4000-8000-000000000001",
      reported_user_id: "comment-author-1",
      reported_user_name: "Comment Author",
      reported_content: "Comment content.",
      reason: "Privacy violation",
      description: null,
    });
  });

  it("reports a post author using the post author rather than client-supplied IDs", async () => {
    const response = await fetch(
      `${baseUrl}/api/community/posts/20000000-0000-4000-8000-000000000001/reports`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer registered-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType: "user",
          reason: "Privacy violation",
          reported_user_id: "forged-user",
        }),
      },
    );

    expect(response.status).toBe(201);
    expect(mocks.reportInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        target_type: "user",
        post_id: "20000000-0000-4000-8000-000000000001",
        comment_id: null,
        reported_user_id: "author-1",
        reported_user_name: "Post Author",
      }),
    );
  });

  it("preserves the exact stored author snapshot required by report RLS", async () => {
    mocks.post = {
      ...mocks.post!,
      author_display_name: " Post Author ",
    };

    const response = await fetch(
      `${baseUrl}/api/community/posts/20000000-0000-4000-8000-000000000001/reports`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer registered-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType: "post",
          reason: "Spam or misleading content",
        }),
      },
    );

    expect(response.status).toBe(201);
    expect(mocks.reportInsert).toHaveBeenCalledWith(
      expect.objectContaining({ reported_user_name: " Post Author " }),
    );
  });

  it("rejects own-content reports and target types that do not match the endpoint", async () => {
    mocks.post = {
      ...mocks.post!,
      author_id: "reporter-1",
    };
    const selfReport = await fetch(
      `${baseUrl}/api/community/posts/20000000-0000-4000-8000-000000000001/reports`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer registered-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType: "post",
          reason: "Spam or misleading content",
        }),
      },
    );

    expect(selfReport.status).toBe(400);
    expect(mocks.reportInsert).not.toHaveBeenCalled();

    const mismatchedTarget = await fetch(
      `${baseUrl}/api/community/posts/20000000-0000-4000-8000-000000000001/reports`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer registered-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType: "comment",
          reason: "Spam or misleading content",
        }),
      },
    );

    expect(mismatchedTarget.status).toBe(400);
    expect(mocks.reportInsert).not.toHaveBeenCalled();
  });

  it("does not report comments whose parent post is hidden or unavailable", async () => {
    mocks.post = null;
    const response = await fetch(
      `${baseUrl}/api/community/comments/30000000-0000-4000-8000-000000000001/reports`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer registered-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType: "comment",
          reason: "Spam or misleading content",
        }),
      },
    );

    expect(response.status).toBe(404);
    expect(mocks.reportInsert).not.toHaveBeenCalled();
  });

  it("includes the authenticated comment author ID in multi-post comment reads", async () => {
    const response = await fetch(
      `${baseUrl}/api/community/comments?postIds=20000000-0000-4000-8000-000000000001`,
      { headers: { Authorization: "Bearer registered-token" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      comments: [{
        id: "30000000-0000-4000-8000-000000000001",
        post_id: "20000000-0000-4000-8000-000000000001",
        author_id: "comment-author-1",
        author_display_name: "Comment Author",
      }],
    });
  });

  it("returns not found when the request-scoped client cannot see the post", async () => {
    mocks.post = null;
    const response = await fetch(
      `${baseUrl}/api/community/posts/20000000-0000-4000-8000-000000000001/reports`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer registered-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType: "post",
          reason: "Spam or misleading content",
          description: "Details",
        }),
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "Post not found.",
    });
    expect(mocks.reportInsert).not.toHaveBeenCalled();
  });

  it("rejects malformed post IDs and invalid report text", async () => {
    const headers = {
      Authorization: "Bearer registered-token",
      "Content-Type": "application/json",
    };
    const malformedPost = await fetch(
      `${baseUrl}/api/community/posts/not-a-uuid/reports`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          targetType: "post",
          reason: "Spam or misleading content",
          description: "Details",
        }),
      },
    );
    expect(malformedPost.status).toBe(400);

    const invalidReason = await fetch(
      `${baseUrl}/api/community/posts/20000000-0000-4000-8000-000000000001/reports`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          targetType: "post",
          reason: " ",
          description: "Details",
        }),
      },
    );
    expect(invalidReason.status).toBe(400);

    const oversizedDescription = await fetch(
      `${baseUrl}/api/community/posts/20000000-0000-4000-8000-000000000001/reports`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          targetType: "post",
          reason: "Spam or misleading content",
          description: "x".repeat(2001),
        }),
      },
    );
    expect(oversizedDescription.status).toBe(400);
    expect(mocks.reportInsert).not.toHaveBeenCalled();
  });

  it("requires authentication and registered-user authorization", async () => {
    const anonymous = await fetch(
      `${baseUrl}/api/community/posts/20000000-0000-4000-8000-000000000001/reports`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "post",
          reason: "Spam or misleading content",
          description: "Details",
        }),
      },
    );
    expect(anonymous.status).toBe(401);

    const nonRegistered = await fetch(
      `${baseUrl}/api/community/posts/20000000-0000-4000-8000-000000000001/reports`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer regular-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType: "post",
          reason: "Spam or misleading content",
          description: "Details",
        }),
      },
    );
    expect(nonRegistered.status).toBe(403);
    expect(mocks.reportInsert).not.toHaveBeenCalled();
  });

  it("returns conflict when a reporter submits the same report twice", async () => {
    mocks.insertResult = {
      data: null,
      error: { code: "23505", message: "duplicate linked report" },
    };
    const response = await fetch(
      `${baseUrl}/api/community/posts/20000000-0000-4000-8000-000000000001/reports`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer registered-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType: "post",
          reason: "Spam or misleading content",
          description: "Details",
        }),
      },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
    });
  });

  const photoPostId = "20000000-0000-4000-8000-000000000001";
  const visiblePhotoData = {
    posts: [
      {
        id: photoPostId,
        photo_paths: ["author-1/photo.jpg", "author-1/second.jpg"],
      },
    ],
    comments: [],
  };

  it("serves a visible post photo through the anonymous proxy with no-store headers", async () => {
    mocks.rpc.mockResolvedValue({ data: visiblePhotoData, error: null });

    const response = await fetch(
      `${baseUrl}/api/community/posts/${photoPostId}/photos/1`,
    );

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff]),
    );
    expect(response.headers.get("content-type")).toContain("image/");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("get_public_community_data", {
      p_post_ids: [photoPostId],
      p_include_posts: true,
      p_include_comments: false,
    });
    expect(mocks.storageFrom).toHaveBeenCalledWith("community-post-photos");
    expect(mocks.storageDownload).toHaveBeenCalledWith("author-1/second.jpg");
  });

  it("denies a hidden post photo to an anonymous caller", async () => {
    mocks.rpc.mockResolvedValue({ data: { posts: [], comments: [] }, error: null });

    const response = await fetch(
      `${baseUrl}/api/community/posts/${photoPostId}/photos/0`,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.storageDownload).not.toHaveBeenCalled();
  });

  it("denies a photo request after a post becomes hidden", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: visiblePhotoData, error: null })
      .mockResolvedValueOnce({ data: { posts: [], comments: [] }, error: null });

    const visible = await fetch(
      `${baseUrl}/api/community/posts/${photoPostId}/photos/0`,
    );
    const hidden = await fetch(
      `${baseUrl}/api/community/posts/${photoPostId}/photos/0`,
    );

    expect(visible.status).toBe(200);
    expect(hidden.status).toBe(404);
    expect(mocks.storageDownload).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing photo index and malformed post or index values", async () => {
    mocks.rpc.mockResolvedValue({ data: visiblePhotoData, error: null });

    const missingIndex = await fetch(
      `${baseUrl}/api/community/posts/${photoPostId}/photos/5`,
    );
    const badPost = await fetch(
      `${baseUrl}/api/community/posts/not-a-uuid/photos/0`,
    );
    const badIndex = await fetch(
      `${baseUrl}/api/community/posts/${photoPostId}/photos/not-a-number`,
    );

    expect(missingIndex.status).toBe(404);
    expect(badPost.status).toBe(400);
    expect(badIndex.status).toBe(400);
    expect(mocks.storageDownload).not.toHaveBeenCalled();
  });
});
