import { beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { from } }));

import { getMyContributions } from "./contributions.ts";

describe("getMyContributions", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("returns the caller's pending, approved, and rejected non-deleted submissions", async () => {
    const rowsByTable = {
      terminals: [
        { id: 1, name: "Pending Terminal", moderation_status: "pending", moderation_note: null, created_at: "2026-10-03", created_by: "user-a", is_deleted: false, is_approved: false },
      ],
      stops: [
        { id: 2, name: "Approved Stop", moderation_status: "approved", moderation_note: null, created_at: "2026-10-02", created_by: "user-a", is_deleted: false, is_approved: true },
        { id: 3, name: "Other User Stop", moderation_status: "pending", moderation_note: null, created_at: "2026-10-04", created_by: "user-b", is_deleted: false, is_approved: false },
      ],
      routes: [
        { id: 4, name: "Rejected Route", moderation_status: "rejected", moderation_note: "Needs changes", created_at: "2026-10-01", created_by: "user-a", is_deleted: false, is_approved: false },
        { id: 5, name: "Deleted Route", moderation_status: "pending", moderation_note: null, created_at: "2026-10-05", created_by: "user-a", is_deleted: true, is_approved: false },
      ],
    };
    const filtersByTable = new Map<string, [string, unknown][]>();

    from.mockImplementation((table: keyof typeof rowsByTable) => {
      const filters: [string, unknown][] = [];
      filtersByTable.set(table, filters);
      const query: Record<string, unknown> = {};
      query.select = vi.fn(() => query);
      query.eq = vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      });
      query.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve({
          data: rowsByTable[table].filter((row) =>
            filters.every(([column, value]) => row[column as keyof typeof row] === value),
          ),
          error: null,
        }).then(resolve, reject);
      return query;
    });

    const contributions = await getMyContributions("user-a");

    expect(contributions.map(({ name, status }) => [name, status])).toEqual([
      ["Pending Terminal", "pending"],
      ["Approved Stop", "approved"],
      ["Rejected Route", "rejected"],
    ]);
    for (const table of ["terminals", "stops", "routes"]) {
      expect(filtersByTable.get(table)).toContainEqual(["created_by", "user-a"]);
      expect(filtersByTable.get(table)).toContainEqual(["is_deleted", false]);
      expect(filtersByTable.get(table)).not.toContainEqual(["is_approved", true]);
      expect(filtersByTable.get(table)).not.toContainEqual(["moderation_status", "approved"]);
    }
  });
});
