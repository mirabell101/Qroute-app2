import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { from, getSession } = vi.hoisted(() => ({
  from: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession },
    from,
  },
}));

const emptyResponse = { data: [], error: null };

function configureAuthenticatedQueries() {
  getSession.mockResolvedValue({
    data: { session: { user: { id: "user-1" } } },
    error: null,
  });

  from.mockImplementation((table: string) => {
    let equalityCount = 0;
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockImplementation(() => {
      equalityCount += 1;
      if (table === "terminals" && equalityCount === 5) {
        return Promise.resolve(emptyResponse);
      }
      return query;
    });
    query.order.mockResolvedValue(emptyResponse);

    return query;
  });
}

describe("authenticated map-data cache", () => {
  beforeEach(() => {
    vi.resetModules();
    from.mockReset();
    getSession.mockReset();
    configureAuthenticatedQueries();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares an in-flight route index request across callers", async () => {
    const { getRouteMapIndex } = await import("./routes");

    await Promise.all([getRouteMapIndex(), getRouteMapIndex()]);

    expect(from).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("routes");
  });

  it("reuses route data for 60 seconds and refreshes after expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { getRouteMapIndex } = await import("./routes");

    await getRouteMapIndex();
    await vi.advanceTimersByTimeAsync(59_999);
    await getRouteMapIndex();
    expect(from).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(2);
    await getRouteMapIndex();
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("reuses terminal data for 60 seconds and refreshes after expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { getTerminals } = await import("./terminals");

    await getTerminals();
    await vi.advanceTimersByTimeAsync(59_999);
    await getTerminals();
    expect(from).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(2);
    await getTerminals();
    expect(from).toHaveBeenCalledTimes(2);
  });
});
