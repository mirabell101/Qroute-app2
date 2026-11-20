import { describe, expect, it } from "vitest";

import routeManagementSource from "./route-management.tsx?raw";

describe("Route Management view contract", () => {
  it("uses moderation fields and retains explicit removed-record filters", () => {
    expect(routeManagementSource).toContain(
      'record.moderation_status === "pending"',
    );
    expect(routeManagementSource).toContain(
      'statusFilter === "All current records"',
    );
    expect(routeManagementSource).toContain(
      'row.status !== "Archived" && row.status !== "Banned"',
    );
    expect(routeManagementSource).toContain('"Banned", "Archived"');
    expect(routeManagementSource).toContain("row.status === statusFilter");
  });

  it("renders a dedicated map in record details and the editor", () => {
    expect(routeManagementSource.match(/<RouteManagementMap\b/g) ?? []).toHaveLength(
      2,
    );
  });

  it("populates vehicle filtering from transport types", () => {
    expect(routeManagementSource).toContain(
      "data.transportTypes.map((type) => <option",
    );
  });
});
