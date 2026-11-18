import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "./api";
import * as community from "./community";
import {
  toPublicCommunityPost,
  type PublicCommunityPostData,
} from "./communityPublicData";

const mocks = vi.hoisted(() => {
  const getPublicUrl = vi.fn(() => ({
    data: { publicUrl: "https://public.example/direct-photo.jpg" },
  }));
  const createSignedUrls = vi.fn();

  return {
    getSession: vi.fn(),
    getPublicUrl,
    createSignedUrls,
    storageFrom: vi.fn(() => ({ getPublicUrl, createSignedUrls })),
    fetch: vi.fn(),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    storage: { from: mocks.storageFrom },
  },
}));

const POST_ID = "11111111-1111-4111-8111-111111111111";

function publicPost(
  overrides: Partial<PublicCommunityPostData> = {},
): PublicCommunityPostData {
  return {
    id: POST_ID,
    author_display_name: "Alice",
    title: " commute question ",
    content: "Has anyone tried this route?",
    start_name: "Start",
    start_latitude: 14.5,
    start_longitude: 121,
    destination_name: "Destination",
    destination_latitude: 14.6,
    destination_longitude: 121.1,
    transport_type_id: null,
    transport_type: null,
    photo_paths: [`${POST_ID}/0.webp`, `${POST_ID}/1.webp`],
    created_at: "2026-11-17T00:00:00.000Z",
    comment_count: 0,
    upvotes: 0,
    downvotes: 0,
    ...overrides,
  };
}

function expectedPhotoUrl(index: number): string {
  return `${API_BASE_URL}/api/community/posts/${encodeURIComponent(POST_ID)}/photos/${index}`;
}

function expectedAdminPhotoUrl(index: number): string {
  return `${API_BASE_URL}/api/admin/posts/${encodeURIComponent(POST_ID)}/photos/${index}`;
}

type ReportTarget =
  | { kind: "post"; postId: string }
  | { kind: "post-author"; postId: string }
  | { kind: "comment"; commentId: string }
  | { kind: "comment-author"; commentId: string };

type ReportCommunityTarget = (
  target: ReportTarget,
  reason: string,
  description?: string,
) => Promise<{ reportId: number }>;

type ValidateCommunityReportDraft = (
  reason: string,
  description: string,
) => string | null;

type GetCommunityProfilePhotoUrls = (
  expectedUserId: string,
  authorIds: string[],
) => Promise<Record<string, string>>;

function getReportCommunityTarget(): ReportCommunityTarget | undefined {
  return (community as unknown as {
    reportCommunityTarget?: ReportCommunityTarget;
  }).reportCommunityTarget;
}

function getValidateCommunityReportDraft(): ValidateCommunityReportDraft | undefined {
  return (community as unknown as {
    validateCommunityReportDraft?: ValidateCommunityReportDraft;
  }).validateCommunityReportDraft;
}

function getCommunityProfilePhotoUrls(): GetCommunityProfilePhotoUrls | undefined {
  return (community as unknown as {
    getCommunityProfilePhotoUrls?: GetCommunityProfilePhotoUrls;
  }).getCommunityProfilePhotoUrls;
}

describe("Community public photo URLs", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.fetch.mockReset();
    mocks.storageFrom.mockClear();
    mocks.getPublicUrl.mockClear();
    mocks.createSignedUrls.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("preserves visible RPC photo paths and points each photo at the proxy", () => {
    const post = toPublicCommunityPost(publicPost());

    expect(post.photo_paths).toEqual([
      `${POST_ID}/0.webp`,
      `${POST_ID}/1.webp`,
    ]);
    expect(post.photos).toEqual([
      { path: `${POST_ID}/0.webp`, url: expectedPhotoUrl(0) },
      { path: `${POST_ID}/1.webp`, url: expectedPhotoUrl(1) },
    ]);
  });

  it("preserves empty photo arrays instead of inventing photos", () => {
    const post = toPublicCommunityPost(publicPost({ photo_paths: [] }));

    expect(post.photo_paths).toEqual([]);
    expect(post.photos).toEqual([]);
  });

  it("uses proxy URLs for signed-in feed photos without direct Storage URLs", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "user-token" } },
      error: null,
    });
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ posts: [publicPost()] }),
    });

    const posts = await community.getCommunityPosts();

    expect(posts).toHaveLength(1);
    expect(posts[0]?.photos).toEqual([
      { path: `${POST_ID}/0.webp`, url: expectedPhotoUrl(0) },
      { path: `${POST_ID}/1.webp`, url: expectedPhotoUrl(1) },
    ]);
    expect(mocks.getPublicUrl).not.toHaveBeenCalled();
  });

  it("uses the protected admin photo route for hidden posts", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "admin-token" } },
      error: null,
    });
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        posts: [{ ...publicPost(), is_hidden: true }],
      }),
    });

    const posts = await community.getCommunityPosts();

    expect(posts[0]?.photos.map((photo) => photo.url)).toEqual([
      expectedAdminPhotoUrl(0),
      expectedAdminPhotoUrl(1),
    ]);
    expect(mocks.getPublicUrl).not.toHaveBeenCalled();
  });
});

describe("Community profile photo URLs", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.storageFrom.mockClear();
    mocks.createSignedUrls.mockReset();
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "viewer-1" } } },
      error: null,
    });
  });

  it("signs each unique author profile object once", async () => {
    mocks.createSignedUrls.mockResolvedValue({
      data: [
        { path: "author-1/profile", signedUrl: "https://signed.example/author-1" },
        { path: "author-2/profile", signedUrl: "https://signed.example/author-2" },
      ],
      error: null,
    });
    const loadUrls = getCommunityProfilePhotoUrls();
    expect(loadUrls).toBeTypeOf("function");
    if (!loadUrls) return;

    await expect(
      loadUrls("viewer-1", ["author-1", "author-1", "author-2"]),
    ).resolves.toEqual({
      "author-1": "https://signed.example/author-1",
      "author-2": "https://signed.example/author-2",
    });
    expect(mocks.storageFrom).toHaveBeenCalledWith("profile-photos");
    expect(mocks.createSignedUrls).toHaveBeenCalledWith(
      ["author-1/profile", "author-2/profile"],
      3600,
    );
  });

  it("rejects session identity mismatches before signing photos", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "different-viewer" } } },
      error: null,
    });
    const loadUrls = getCommunityProfilePhotoUrls();
    expect(loadUrls).toBeTypeOf("function");
    if (!loadUrls) return;

    await expect(loadUrls("viewer-1", ["author-1"])).rejects.toThrow(
      "Please sign in to continue.",
    );
    expect(mocks.createSignedUrls).not.toHaveBeenCalled();
  });

  it("omits profile photos that do not exist", async () => {
    mocks.createSignedUrls.mockResolvedValue({
      data: [{ path: "author-1/profile", signedUrl: null }],
      error: null,
    });
    const loadUrls = getCommunityProfilePhotoUrls();
    expect(loadUrls).toBeTypeOf("function");
    if (!loadUrls) return;

    await expect(loadUrls("viewer-1", ["author-1"])).resolves.toEqual({});
  });

  it("surfaces storage signing errors", async () => {
    mocks.createSignedUrls.mockResolvedValue({
      data: null,
      error: { message: "Storage unavailable" },
    });
    const loadUrls = getCommunityProfilePhotoUrls();
    expect(loadUrls).toBeTypeOf("function");
    if (!loadUrls) return;

    await expect(loadUrls("viewer-1", ["author-1"])).rejects.toThrow(
      "Storage unavailable",
    );
  });
});

describe("community report client", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "user-token" } },
      error: null,
    });
  });

  it("uses the predefined reasons and requires details only for Other", () => {
    const reasons = (community as unknown as {
      COMMUNITY_REPORT_REASONS?: string[];
    }).COMMUNITY_REPORT_REASONS;
    const validate = getValidateCommunityReportDraft();

    expect(reasons).toEqual([
      "Spam or misleading content",
      "Harassment or bullying",
      "Hate speech or discrimination",
      "Inappropriate or offensive content",
      "False or misleading information",
      "Threats or violence",
      "Privacy violation",
      "Other",
    ]);
    expect(validate).toBeTypeOf("function");
    if (!validate) return;

    expect(validate("", "")).not.toBeNull();
    expect(validate("Unknown reason", "details")).not.toBeNull();
    expect(validate("Other", "   ")).not.toBeNull();
    expect(validate("Other", "additional context")).toBeNull();
    expect(validate("Spam or misleading content", "")).toBeNull();
  });

  it.each([
    {
      name: "a post",
      target: { kind: "post", postId: POST_ID },
      path: `/posts/${encodeURIComponent(POST_ID)}/reports`,
      targetType: "post",
    },
    {
      name: "a post author",
      target: { kind: "post-author", postId: POST_ID },
      path: `/posts/${encodeURIComponent(POST_ID)}/reports`,
      targetType: "user",
    },
    {
      name: "a comment",
      target: { kind: "comment", commentId: "comment-42" },
      path: "/comments/comment-42/reports",
      targetType: "comment",
    },
    {
      name: "a comment author",
      target: { kind: "comment-author", commentId: "comment-42" },
      path: "/comments/comment-42/reports",
      targetType: "user",
    },
  ] as const)("sends only the selected target and report text for $name", async ({
    target,
    path,
    targetType,
  }) => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true, report: { id: 42 } }),
    });
    const report = getReportCommunityTarget();
    expect(report).toBeTypeOf("function");
    if (!report) return;

    await expect(report(
      target as ReportTarget,
      "Spam or misleading content",
      "Repeated ads",
    )).resolves.toEqual({ reportId: 42 });

    const [url, options] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/community${path}`);
    expect(options.method).toBe("POST");
    expect(new Headers(options.headers).get("Authorization")).toBe(
      "Bearer user-token",
    );

    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(body).toEqual({
      targetType,
      reason: "Spam or misleading content",
      description: "Repeated ads",
    });
    expect(body).not.toHaveProperty("reporterId");
    expect(body).not.toHaveProperty("authorId");
  });

  it("rejects a malformed report response instead of inventing an ID", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true, report: { id: "not-a-number" } }),
    });
    const report = getReportCommunityTarget();
    expect(report).toBeTypeOf("function");
    if (!report) return;

    await expect(
      report({ kind: "post", postId: POST_ID }, "Spam or misleading content", "Repeated ads"),
    ).rejects.toThrow("Community service returned an invalid response.");
  });
});
