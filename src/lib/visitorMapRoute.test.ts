import { describe, expect, it } from "vitest";

import { resolveVisitorMapRoute } from "./visitorMapRoute";

describe("resolveVisitorMapRoute", () => {
  it("shows the Visitor landing map while authentication is loading", () => {
    expect(resolveVisitorMapRoute({
      authLoading: true,
      roleLoading: false,
      currentUserId: null,
    })).toBe("loading");
  });

  it("shows the Visitor landing map to a logged-out user", () => {
    expect(resolveVisitorMapRoute({
      authLoading: false,
      roleLoading: false,
      currentUserId: null,
    })).toBe("visitor");
  });

  it("shows the Registered map to registered and admin sessions", () => {
    expect(resolveVisitorMapRoute({
      authLoading: false,
      roleLoading: false,
      currentUserId: "registered-user",
    })).toBe("registered");
    expect(resolveVisitorMapRoute({
      authLoading: false,
      roleLoading: false,
      currentUserId: "admin-user",
    })).toBe("registered");
  });

  it("waits for role loading before choosing an authenticated map", () => {
    expect(resolveVisitorMapRoute({
      authLoading: false,
      roleLoading: true,
      currentUserId: "registered-user",
    })).toBe("loading");
  });

  it("does not classify an authenticated unknown role as a Visitor", () => {
    expect(resolveVisitorMapRoute({
      authLoading: false,
      roleLoading: false,
      currentUserId: "unknown-role-user",
    })).toBe("registered");
  });
});
