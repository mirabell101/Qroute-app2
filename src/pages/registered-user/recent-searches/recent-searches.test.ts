import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  recordRecentSearch,
  type RecentSearch,
} from "@/lib/recentSearches";

import RecentSearches from "./recent-searches";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function renderPage(currentUserId: string | null): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(RecentSearches, { currentUserId })
    )
  );
}

describe("Recent Searches page", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a helpful empty state when no searches exist", () => {
    const markup = renderPage(null);

    expect(markup).toContain("Recent Searches");
    expect(markup).toContain("Search for a route, stop, or terminal");
    expect(markup).not.toContain("Clear All");
  });

  it("shows recent item details and actions newest first", () => {
    const firstSearch: Pick<RecentSearch, "kind" | "targetId" | "name"> = {
      kind: "route",
      targetId: 21,
      name: "Blue Line",
    };
    const secondSearch: Pick<RecentSearch, "kind" | "targetId" | "name"> = {
      kind: "terminal",
      targetId: 9,
      name: "Central Terminal",
    };
    recordRecentSearch(null, firstSearch);
    recordRecentSearch(null, secondSearch);

    const markup = renderPage(null);

    expect(markup.indexOf("Central Terminal")).toBeLessThan(
      markup.indexOf("Blue Line")
    );
    expect(markup).toContain(">Terminal<");
    expect(markup).toContain(">Route<");
    expect(markup).toContain("Clear All");
    expect(markup).toContain("View on map");
    expect(markup).toContain("Remove Central Terminal from recent searches");
    expect(markup).toMatch(/<time dateTime="[^"]+">[^<]+<\/time>/);
  });
});
