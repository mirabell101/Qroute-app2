import { beforeAll, describe, expect, it } from "vitest";

type AdminNavigationModule = typeof import("./adminNavigation");
let adminNavigation: AdminNavigationModule | null = null;

function getNavigationModule(): AdminNavigationModule {
  expect(adminNavigation).not.toBeNull();
  return adminNavigation!;
}

describe("admin navigation destinations", () => {
  beforeAll(async () => {
    try {
      adminNavigation = await import("./adminNavigation");
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("Cannot find module")
      ) {
        throw error;
      }
    }
  });

  it("maps existing user destinations to their application routes", () => {
    const destination = getNavigationModule().getAdminNavigationDestination;

    expect(destination("Recents")).toBe("/recents");
    expect(destination("Saved")).toBe("/saved");
    expect(destination("Your Contribution")).toBe("/contribution");
    expect(destination("Community")).toBe("/community");
    expect(destination("Profile")).toBe("/profile");
  });

  it("does not map unsupported admin controls to a route", () => {
    const destination = getNavigationModule().getAdminNavigationDestination;

    expect(destination("Settings")).toBeNull();
    expect(destination("Notifications")).toBeNull();
    expect(destination("Map filters")).toBeNull();
    expect(destination("Unknown")).toBeNull();
  });
});
