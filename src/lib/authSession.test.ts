import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {} }));

describe("completeGoogleSignIn", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes a Google sign-in with the registered_user role to /home", async () => {
    const { completeGoogleSignIn } = await import("./authSession");
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, role: "registered_user" }),
      })
    );

    await expect(completeGoogleSignIn("access-token")).resolves.toBe("/home");
  });

  it("routes a Google sign-in with the admin role to /admin/dashboard", async () => {
    const { completeGoogleSignIn } = await import("./authSession");
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, role: "admin" }),
      })
    );

    await expect(completeGoogleSignIn("access-token")).resolves.toBe(
      "/admin/dashboard"
    );
  });

  it("only requests role resolution once for duplicate callback completion", async () => {
    const { completeGoogleSignIn } = await import("./authSession");
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, role: "registered_user" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      Promise.all([
        completeGoogleSignIn("access-token"),
        completeGoogleSignIn("access-token"),
      ])
    ).resolves.toEqual(["/home", "/home"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
