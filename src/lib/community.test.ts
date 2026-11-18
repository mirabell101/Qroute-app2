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

  return {
    getSession: vi.fn(),
    getPublicUrl,
    storageFrom: vi.fn(() => ({ getPublicUrl })),
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

describe("Community public photo URLs", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.fetch.mockReset();
    mocks.storageFrom.mockClear();
    mocks.getPublicUrl.mockClear();
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

describe("reportCommunityPost", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "user-token" } },
      error: null,
    });
  });

  it("sends only report text with the verified session token", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true, report: { id: 42 } }),
    });

    await expect(
      community.reportCommunityPost(POST_ID, "Spam", "Repeated ads"),
    ).resolves.toEqual({ reportId: 42 });

    const [url, options] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${API_BASE_URL}/api/community/posts/${encodeURIComponent(POST_ID)}/reports`,
    );
    expect(options.method).toBe("POST");
    expect(new Headers(options.headers).get("Authorization")).toBe(
      "Bearer user-token",
    );

    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(body).toEqual({ reason: "Spam", description: "Repeated ads" });
    expect(Object.keys(body).sort()).toEqual(["description", "reason"]);
  });

  it("rejects a malformed report response instead of inventing an ID", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true, report: { id: "not-a-number" } }),
    });

    await expect(
      community.reportCommunityPost(POST_ID, "Spam", "Repeated ads"),
    ).rejects.toThrow("Community service returned an invalid response.");
  });
});
