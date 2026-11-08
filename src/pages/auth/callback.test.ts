import { describe, expect, it } from "vitest";
import {
  getOAuthCallbackDestination,
  getOAuthCallbackError,
} from "@/lib/authCallback";

describe("OAuth callback destination", () => {
  it("waits for the application auth state before redirecting", () => {
    expect(getOAuthCallbackDestination(true, "user-1")).toBeNull();
  });

  it("sends a recognized user to Home", () => {
    expect(getOAuthCallbackDestination(false, "user-1")).toBe("/home");
  });

  it("returns unauthenticated callbacks to Login", () => {
    expect(getOAuthCallbackDestination(false, null)).toBe("/login");
  });
});

describe("OAuth callback errors", () => {
  it("uses the provider's error description from the query string", () => {
    expect(
      getOAuthCallbackError(
        "?error=access_denied&error_description=Consent%20cancelled",
        "",
      ),
    ).toBe("Consent cancelled");
  });

  it("reads errors returned in the hash fragment", () => {
    expect(getOAuthCallbackError("", "#error=invalid_request")).toBe(
      "Authentication failed: invalid_request",
    );
  });
});
