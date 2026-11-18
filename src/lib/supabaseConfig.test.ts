import { describe, expect, it } from "vitest";

import { assertPublicSupabaseKey } from "./supabaseConfig";

function encodeJwtPayload(payload: Record<string, unknown>): string {
  const base64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `header.${base64}.signature`;
}

describe("assertPublicSupabaseKey", () => {
  it("accepts a publishable key", () => {
    expect(assertPublicSupabaseKey("  sb_publishable_abc123  ")).toBe(
      "sb_publishable_abc123"
    );
  });

  it("rejects a secret key so it cannot ship in the browser bundle", () => {
    expect(() => assertPublicSupabaseKey("sb_secret_abc123")).toThrow(
      /secret key/
    );
    expect(() => assertPublicSupabaseKey("SB_SECRET_abc123")).toThrow(
      /secret key/
    );
  });

  it("rejects JWTs carrying a privileged role claim", () => {
    expect(() =>
      assertPublicSupabaseKey(encodeJwtPayload({ role: "service_role" }))
    ).toThrow(/privileged/);

    expect(() =>
      assertPublicSupabaseKey(encodeJwtPayload({ role: "supabase_admin" }))
    ).toThrow(/privileged/);
  });

  it("accepts a JWT with the normal anon role claim", () => {
    const token = encodeJwtPayload({ role: "anon" });

    expect(assertPublicSupabaseKey(token)).toBe(token);
  });

  it("rejects a missing key", () => {
    expect(() => assertPublicSupabaseKey(undefined)).toThrow(/missing/);
    expect(() => assertPublicSupabaseKey("   ")).toThrow(/missing/);
  });
});
