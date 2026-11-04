import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

type AccountApiModule = typeof import("./accountApi");
let accountApi: AccountApiModule | null = null;

describe("account API client", () => {
  beforeAll(async () => {
    try {
      accountApi = await import("./accountApi");
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
          access_token: "account-token",
          user: { id: "user-1" },
        },
      },
      error: null,
    });
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockReset();
  });

  it("exposes account operations through a dedicated API module", () => {
    expect(accountApi).not.toBeNull();
  });

  it("does not issue a request when the active user differs from the page account", async () => {
    await expect(accountApi?.getAccount("user-2")).rejects.toThrow(
      "The active account changed. Please try again.",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("loads a profile with no username through Express using the verified session token", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        account: {
          email: "one@example.com",
          username: null,
          displayName: "Google Rider",
          profilePhotoUrl: null,
        },
      }),
    });

    await expect(accountApi?.getAccount("user-1")).resolves.toEqual({
      email: "one@example.com",
      username: null,
      displayName: "Google Rider",
      profilePhotoUrl: null,
    });
    const [url, options] = mocks.fetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/api\/account$/);
    expect(new Headers(options.headers).get("Authorization")).toBe(
      "Bearer account-token",
    );
  });

  it("surfaces the backend's safe account error message", async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        success: false,
        message: "That username is already in use.",
      }),
    });

    await expect(
      accountApi?.updateAccountUsername("user-1", "taken_name"),
    ).rejects.toThrow("That username is already in use.");
  });
});
