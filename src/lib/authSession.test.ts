import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {} }));

import { completeGoogleSignIn } from "./authSession";

describe("completeGoogleSignIn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes a Google sign-in with the registered_user role to /home", async () => {
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
});
