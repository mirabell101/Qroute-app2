import { describe, expect, it } from "vitest";

import { supabase } from "./supabase";

describe("Supabase OAuth client", () => {
  it("uses PKCE for Google sign-in while preserving the localhost callback", async () => {
    const redirectTo = "http://localhost:5173/auth/callback";
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    expect(error).toBeNull();

    if (!data.url) {
      throw new Error("Supabase did not return an authorization URL.");
    }

    const authorizationUrl = new URL(data.url);
    const returnedRedirect = authorizationUrl.searchParams.get("redirect_to");
    const callbackUrl = returnedRedirect
      ? new URL(returnedRedirect)
      : null;
    const codeChallenge = authorizationUrl.searchParams.get("code_challenge");

    expect(callbackUrl?.origin).toBe("http://localhost:5173");
    expect(callbackUrl?.pathname).toBe("/auth/callback");
    expect(codeChallenge).not.toBeNull();
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe(
      "s256"
    );
  });
});
