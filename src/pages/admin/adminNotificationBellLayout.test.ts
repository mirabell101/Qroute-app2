import { describe, expect, it } from "vitest";

import appSource from "../../App.tsx?raw";
import bellSource from "../../components/admin/AdminNotificationBell.tsx?raw";
import baseSource from "./base/base.tsx?raw";
import dashboardSource from "./dashboard/dashboard.tsx?raw";
import notificationsSource from "./notifications/notifications.tsx?raw";
import postManagementSource from "./post-management/post-management.tsx?raw";
import reportsSource from "./reports/reports.tsx?raw";
import routeManagementSource from "./route-management/route-management.tsx?raw";
import settingsSource from "./settings/settings.tsx?raw";
import userManagementSource from "./user-management/user-management.tsx?raw";

const adminPageSources: Array<[string, string]> = [
  ["dashboard/dashboard.tsx", dashboardSource],
  ["base/base.tsx", baseSource],
  ["route-management/route-management.tsx", routeManagementSource],
  ["post-management/post-management.tsx", postManagementSource],
  ["reports/reports.tsx", reportsSource],
  ["user-management/user-management.tsx", userManagementSource],
  ["settings/settings.tsx", settingsSource],
  ["notifications/notifications.tsx", notificationsSource],
];

describe("admin notification bell layout", () => {
  it("renders the notification bell in every admin page header", () => {
    for (const [file, source] of adminPageSources) {
      expect(source, `${file} should render AdminNotificationBell`).toContain(
        "<AdminNotificationBell",
      );
    }
  });

  it("does not define a Notifications entry in any admin sidebar", () => {
    for (const [file, source] of adminPageSources) {
      expect(
        source,
        `${file} should not add a Notifications sidebar item`,
      ).not.toMatch(/label:\s*["']Notifications["']/);
    }
  });

  it("uses the bell as the only navigation entry point to notifications", () => {
    expect(bellSource).toContain(
      'navigateToAdminDestination("Notifications", navigate)',
    );
  });

  it("routes the bell destination to the dedicated Notifications page", () => {
    expect(appSource).toContain('path="/admin/notifications"');
    expect(appSource).toContain("element={adminPage(() => <Notifications />)}");
  });
});
