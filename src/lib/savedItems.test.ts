import { beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { from } }));

import {
  addSavedBookmark,
  getSavedBookmarkIds,
  hasSavedBookmark,
  removeSavedBookmark,
  updateSavedBookmarkIds,
} from "./savedItems";

describe("saved bookmark data access", () => {
  beforeEach(() => from.mockReset());

  it("does not query bookmark tables for anonymous visitors", async () => {
    await expect(getSavedBookmarkIds(null)).resolves.toEqual({
      routeIds: [],
      stopIds: [],
      terminalIds: [],
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("loads IDs in deterministic pages when a category exceeds one batch", async () => {
    const responsesByTable = {
      saved_routes: [
        {
          data: Array.from({ length: 500 }, (_, index) => ({
            route_id: index + 1,
          })),
          error: null,
        },
        { data: [{ route_id: 501 }], error: null },
      ],
      saved_stops: [{ data: [], error: null }],
      saved_terminals: [{ data: [], error: null }],
    };
    const ranges: Array<[string, number, number]> = [];
    const selectedColumns: Array<[string, string]> = [];

    from.mockImplementation((table: keyof typeof responsesByTable) => {
      const responses = responsesByTable[table];
      const query = {
        eq: vi.fn(),
        order: vi.fn(),
        range: vi.fn(),
      };
      query.eq.mockReturnValue(query);
      query.order.mockReturnValue(query);
      query.range.mockImplementation((start: number, end: number) => {
        ranges.push([table, start, end]);
        return Promise.resolve(
          responses.shift() ?? { data: [], error: null }
        );
      });

      return {
        select: vi.fn((column: string) => {
          selectedColumns.push([table, column]);
          return query;
        }),
      };
    });

    await expect(getSavedBookmarkIds("user-1")).resolves.toEqual({
      routeIds: Array.from({ length: 501 }, (_, index) => index + 1),
      stopIds: [],
      terminalIds: [],
    });

    expect(selectedColumns).toEqual(
      expect.arrayContaining([
        ["saved_routes", "route_id"],
        ["saved_stops", "stop_id"],
        ["saved_terminals", "terminal_id"],
      ])
    );
    expect(ranges).toEqual(
      expect.arrayContaining([
        ["saved_routes", 0, 499],
        ["saved_routes", 500, 999],
        ["saved_stops", 0, 499],
        ["saved_terminals", 0, 499],
      ])
    );
  });

  it.each([
    ["route", "saved_routes", "route_id", 4],
    ["stop", "saved_stops", "stop_id", 5],
    ["terminal", "saved_terminals", "terminal_id", 6],
  ] as const)("adds a %s bookmark", async (kind, table, column, targetId) => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ insert });

    await expect(addSavedBookmark("user-1", kind, targetId)).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith(table);
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      [column]: targetId,
    });
  });

  it("treats a duplicate insert as already saved", async () => {
    const insert = vi.fn().mockResolvedValue({
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    from.mockReturnValue({ insert });

    await expect(addSavedBookmark("user-1", "route", 4)).resolves.toBeUndefined();
  });

  it("surfaces non-duplicate insert errors", async () => {
    const insert = vi.fn().mockResolvedValue({
      error: { code: "42501", message: "permission denied" },
    });
    from.mockReturnValue({ insert });

    await expect(addSavedBookmark("user-1", "route", 4)).rejects.toThrow(
      "permission denied"
    );
  });

  it.each([
    ["route", "routeIds", 4],
    ["stop", "stopIds", 5],
    ["terminal", "terminalIds", 6],
  ] as const)("checks and updates the shared %s bookmark state", (kind, key, targetId) => {
    const emptyIds = {
      routeIds: [],
      stopIds: [],
      terminalIds: [],
    };
    const added = updateSavedBookmarkIds(emptyIds, kind, targetId, true);

    expect(added[key]).toEqual([targetId]);
    expect(hasSavedBookmark(added, kind, targetId)).toBe(true);
    expect(
      updateSavedBookmarkIds(added, kind, targetId, true)[key]
    ).toEqual([targetId]);

    const removed = updateSavedBookmarkIds(added, kind, targetId, false);
    expect(removed[key]).toEqual([]);
    expect(hasSavedBookmark(removed, kind, targetId)).toBe(false);
  });

  it.each([
    ["route", "saved_routes", "route_id", 4],
    ["stop", "saved_stops", "stop_id", 5],
    ["terminal", "saved_terminals", "terminal_id", 6],
  ] as const)("removes only the user's %s bookmark", async (kind, table, column, targetId) => {
    const query = { eq: vi.fn() };
    query.eq.mockReturnValue(query);
    query.eq.mockImplementationOnce(() => query).mockImplementationOnce(() =>
      Promise.resolve({ error: null })
    );
    const deleteRows = vi.fn(() => query);
    from.mockReturnValue({ delete: deleteRows });

    await expect(
      removeSavedBookmark("user-1", kind, targetId)
    ).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith(table);
    expect(deleteRows).toHaveBeenCalledOnce();
    expect(query.eq).toHaveBeenNthCalledWith(1, "user_id", "user-1");
    expect(query.eq).toHaveBeenNthCalledWith(2, column, targetId);
  });
});
