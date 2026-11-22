import { describe, expect, it } from "vitest";

import dashboardSource from "./dashboard/dashboard.tsx?raw";
import notificationsSource from "./notifications/notifications.tsx?raw";
import postManagementSource from "./post-management/post-management.tsx?raw";
import reportsSource from "./reports/reports.tsx?raw";
import routeManagementSource from "./route-management/route-management.tsx?raw";
import settingsSource from "./settings/settings.tsx?raw";
import userManagementSource from "./user-management/user-management.tsx?raw";

const adminPageSources: Array<[string, string]> = [
  ["dashboard/dashboard.tsx", dashboardSource],
  ["route-management/route-management.tsx", routeManagementSource],
  ["post-management/post-management.tsx", postManagementSource],
  ["reports/reports.tsx", reportsSource],
  ["user-management/user-management.tsx", userManagementSource],
  ["settings/settings.tsx", settingsSource],
  ["notifications/notifications.tsx", notificationsSource],
];

describe("admin header controls", () => {
  it("renders the QRoute logo in every admin sidebar", () => {
    for (const [file, source] of adminPageSources) {
      expect(
        source,
        `${file} should import the existing QRoute logo asset`,
      ).toContain('qrouteWhiteLogo from "@/assets/White Qroute Logo.png"');

      expect(
        source,
        `${file} should render the QRoute logo image`,
      ).toContain("src={qrouteWhiteLogo}");
    }
  });

  it("renders Sign Out in every admin sidebar", () => {
    for (const [file, source] of adminPageSources) {
      expect(
        source,
        `${file} should render Sign Out`,
      ).toContain("Sign Out");
    }
  });
});