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

  it("maps Settings to the protected admin settings route", () => {
    expect(
      getNavigationModule().getAdminNavigationDestination("Settings"),
    ).toBe("/admin/settings");
  });

  it("maps Notifications to the protected admin notifications page", () => {
    const destination = getNavigationModule().getAdminNavigationDestination;

    expect(destination("Notifications")).toBe("/admin/notifications");
    expect(destination("Map filters")).toBeNull();
    expect(destination("Unknown")).toBeNull();
  });

  it("navigates the notification bell to the notifications page", () => {
    const destinations: string[] = [];

    getNavigationModule().navigateToAdminDestination(
      "Notifications",
      (destination) => destinations.push(destination),
    );

    expect(destinations).toEqual(["/admin/notifications"]);
  });
});
