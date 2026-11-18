import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isAdminCommunityPhotoUrl,
  loadAdminCommunityPhoto,
  releaseAdminCommunityPhoto,
} from "./adminPhoto";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  fetch: vi.fn(),
  createObjectURL: vi.fn(() => "blob:admin-photo"),
  revokeObjectURL: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
  },
}));

const ADMIN_PHOTO_URL = "/api/admin/posts/11111111-1111-4111-8111-111111111111/photos/0";
const PUBLIC_PHOTO_URL = "/api/community/posts/11111111-1111-4111-8111-111111111111/photos/0";

describe("admin community photos", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.fetch.mockReset();
    mocks.createObjectURL.mockClear();
    mocks.revokeObjectURL.mockClear();
    vi.stubGlobal("fetch", mocks.fetch);
    vi.spyOn(URL, "createObjectURL").mockImplementation(mocks.createObjectURL);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(mocks.revokeObjectURL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("recognizes only the protected admin photo route", () => {
    expect(isAdminCommunityPhotoUrl(ADMIN_PHOTO_URL)).toBe(true);
    expect(isAdminCommunityPhotoUrl(PUBLIC_PHOTO_URL)).toBe(false);
  });

  it("loads a hidden-post photo with the verified access token and returns an object URL", async () => {
    const blob = new Blob(["hidden photo"], { type: "image/webp" });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "admin-token" } },
      error: null,
    });
    mocks.fetch.mockResolvedValue({ ok: true, blob: async () => blob });

    const objectUrl = await loadAdminCommunityPhoto(ADMIN_PHOTO_URL);

    expect(mocks.fetch).toHaveBeenCalledWith(ADMIN_PHOTO_URL, {
      headers: { Authorization: "Bearer admin-token" },
    });
    expect(mocks.createObjectURL).toHaveBeenCalledWith(blob);
    expect(objectUrl).toBe("blob:admin-photo");
  });

  it("rejects without requesting a photo when no verified session exists", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(loadAdminCommunityPhoto(ADMIN_PHOTO_URL)).rejects.toThrow(
      "Please sign in to continue.",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects when the protected photo endpoint refuses the request", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "admin-token" } },
      error: null,
    });
    mocks.fetch.mockResolvedValue({ ok: false, status: 401 });

    await expect(loadAdminCommunityPhoto(ADMIN_PHOTO_URL)).rejects.toThrow(
      "Unable to load the photo.",
    );
  });

  it("releases the object URL when a photo is no longer displayed", () => {
    releaseAdminCommunityPhoto("blob:admin-photo");

    expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:admin-photo");
  });
});
