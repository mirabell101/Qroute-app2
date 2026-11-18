import { describe, expect, it } from "vitest";

import {
  DEFAULT_USER_ROLE,
  isKnownRole,
  resolveUserRole,
  roleLandingPath,
} from "./roles";

describe("resolveUserRole", () => {
  it("returns admin when an admin role is present", () => {
    expect(resolveUserRole(["registered_user", "admin"])).toBe("admin");
    expect(resolveUserRole(["admin"])).toBe("admin");
  });

  it("returns the default role for a registered user", () => {
    expect(resolveUserRole([DEFAULT_USER_ROLE])).toBe("registered_user");
  });

  it("ignores unknown roles instead of granting access", () => {
    expect(resolveUserRole(["moderator"])).toBeNull();
    expect(resolveUserRole(["superadmin"])).toBeNull();
    expect(resolveUserRole([])).toBeNull();
    expect(resolveUserRole(null)).toBeNull();
  });
});

describe("isKnownRole", () => {
  it("recognises only the roles QRoute implements", () => {
    expect(isKnownRole("admin")).toBe(true);
    expect(isKnownRole("registered_user")).toBe(true);
    expect(isKnownRole("moderator")).toBe(false);
    expect(isKnownRole(null)).toBe(false);
  });
});

describe("roleLandingPath", () => {
  it("sends admins to the admin dashboard and everyone else home", () => {
    expect(roleLandingPath("admin")).toBe("/admin/dashboard");
    expect(roleLandingPath("registered_user")).toBe("/home");
    expect(roleLandingPath(null)).toBe("/home");
  });
});
