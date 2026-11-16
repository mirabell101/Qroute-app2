import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getOrCreateDefaultUserRole } from "./userRoles.ts";

type RoleRead = {
  data: unknown;
  error: unknown;
};

type RoleInsert = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

function createClient(reads: RoleRead[], insert?: RoleInsert) {
  let readIndex = 0;

  const single = vi.fn().mockResolvedValue(
    insert ?? {
      data: { role: "registered_user" },
      error: null,
    }
  );

  const eq = vi.fn(() => {
    const result = reads[readIndex];
    readIndex += 1;
    return Promise.resolve(result);
  });

  const select = vi.fn(() => ({ eq }));
  const insertMethod = vi.fn(() => ({
    select: vi.fn(() => ({ single })),
  }));

  const from = vi.fn(() => ({
    select,
    insert: insertMethod,
  }));

  return {
    client: { from } as unknown as SupabaseClient,
    eq,
    from,
    insert: insertMethod,
    single,
  };
}

describe("getOrCreateDefaultUserRole", () => {
  it("preserves an existing admin role without writing", async () => {
    const { client, insert } = createClient([
      { data: [{ role: "admin" }], error: null },
    ]);

    await expect(getOrCreateDefaultUserRole(client, "user-1")).resolves.toBe(
      "admin"
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("preserves an existing registered-user role", async () => {
    const { client, insert } = createClient([
      { data: [{ role: "registered_user" }], error: null },
    ]);

    await expect(getOrCreateDefaultUserRole(client, "user-1")).resolves.toBe(
      "registered_user"
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("preserves an existing unknown role rather than overwriting it", async () => {
    const { client, insert } = createClient([
      { data: [{ role: "moderator" }], error: null },
    ]);

    await expect(getOrCreateDefaultUserRole(client, "user-1")).resolves.toBe(
      "moderator"
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates only registered_user when the account has no role", async () => {
    const { client, insert } = createClient(
      [{ data: [], error: null }],
      {
        data: { role: "registered_user" },
        error: null,
      }
    );

    await expect(getOrCreateDefaultUserRole(client, "user-1")).resolves.toBe(
      "registered_user"
    );

    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      role: "registered_user",
      assigned_at: expect.any(String),
    });
  });

  it("treats a concurrent unique conflict as success and reads the role", async () => {
    const { client, insert } = createClient(
      [
        { data: [], error: null },
        { data: [{ role: "registered_user" }], error: null },
      ],
      {
        data: null,
        error: { code: "23505", message: "duplicate key" },
      }
    );

    await expect(getOrCreateDefaultUserRole(client, "user-1")).resolves.toBe(
      "registered_user"
    );
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("surfaces role read errors", async () => {
    const error = { message: "permission denied" };
    const { client } = createClient([{ data: null, error }]);

    await expect(getOrCreateDefaultUserRole(client, "user-1")).rejects.toBe(
      error
    );
  });

  it("surfaces non-conflict insert errors", async () => {
    const error = { code: "42501", message: "permission denied" };
    const { client } = createClient(
      [{ data: [], error: null }],
      { data: null, error }
    );

    await expect(getOrCreateDefaultUserRole(client, "user-1")).rejects.toBe(
      error
    );
  });

  it("rejects a missing verified user id before touching the database", async () => {
    const { client, from } = createClient([]);

    await expect(getOrCreateDefaultUserRole(client, "")).rejects.toThrow(
      /verified user ID/
    );
    expect(from).not.toHaveBeenCalled();
  });
});
