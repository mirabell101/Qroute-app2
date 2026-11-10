import { describe, expect, it } from "vitest";

import {
  readRememberedLoginIdentifier,
  updateRememberedLoginIdentifier,
} from "./rememberedLoginIdentifier";

const STORAGE_KEY = "qroute_remembered_login_identifier";

function createStorage(initialValue: string | null = null) {
  const values = new Map<string, string>();
  if (initialValue !== null) {
    values.set(STORAGE_KEY, initialValue);
  }

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values,
  };
}

describe("readRememberedLoginIdentifier", () => {
  it("reads a valid username/email string", () => {
    const storage = createStorage("rider@example.com");

    expect(readRememberedLoginIdentifier(storage)).toBe(
      "rider@example.com"
    );
    expect([...storage.values.entries()]).toEqual([
      [STORAGE_KEY, "rider@example.com"],
    ]);
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["whitespace-only", "   "],
    ["surrounding whitespace", " rider "],
    ["overlong", "a".repeat(255)],
  ])("returns null for a %s value", (_description, value) => {
    const storage = createStorage(value);

    expect(readRememberedLoginIdentifier(storage)).toBeNull();
  });

  it("returns null when reading browser storage throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };

    expect(readRememberedLoginIdentifier(storage)).toBeNull();
  });
});

describe("updateRememberedLoginIdentifier", () => {
  it("stores only the submitted identifier when Remember Me is checked", () => {
    const storage = createStorage("old@example.com");

    expect(
      updateRememberedLoginIdentifier(
        "new@example.com",
        true,
        storage
      )
    ).toBe(true);
    expect([...storage.values.entries()]).toEqual([
      [STORAGE_KEY, "new@example.com"],
    ]);
  });

  it("removes the previous identifier when Remember Me is unchecked", () => {
    const storage = createStorage("old@example.com");

    expect(
      updateRememberedLoginIdentifier(
        "new@example.com",
        false,
        storage
      )
    ).toBe(true);
    expect([...storage.values.entries()]).toEqual([]);
  });

  it("returns false without throwing when writing browser storage throws", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage unavailable");
      },
      removeItem: () => undefined,
    };

    expect(() =>
      updateRememberedLoginIdentifier(
        "rider@example.com",
        true,
        storage
      )
    ).not.toThrow();
    expect(
      updateRememberedLoginIdentifier(
        "rider@example.com",
        true,
        storage
      )
    ).toBe(false);
  });

  it("returns false without throwing when removing browser storage throws", () => {
    const storage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => {
        throw new Error("storage unavailable");
      },
    };

    expect(() =>
      updateRememberedLoginIdentifier(
        "rider@example.com",
        false,
        storage
      )
    ).not.toThrow();
    expect(
      updateRememberedLoginIdentifier(
        "rider@example.com",
        false,
        storage
      )
    ).toBe(false);
  });
});
