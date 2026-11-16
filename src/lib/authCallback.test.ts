import { describe, expect, it } from "vitest";

import {
  parseAuthCallbackUrl,
  readAuthCallbackTokens,
} from "./authCallback";

describe("parseAuthCallbackUrl", () => {
  it("returns a PKCE code from the query string", () => {
    expect(parseAuthCallbackUrl("?code=abc123", "")).toEqual({
      error: null,
      code: "abc123",
    });
  });

  it("reads OAuth errors from the hash fragment", () => {
    expect(
      parseAuthCallbackUrl(
        "",
        "#error=access_denied&error_description=User%20cancelled"
      )
    ).toEqual({
      error: "User cancelled",
      code: null,
    });
  });

  it("reports an error_code even when no error parameter is present", () => {
    const result = parseAuthCallbackUrl("", "#error_code=bad_oauth_state");

    expect(result.error).toContain("bad_oauth_state");
    expect(result.code).toBeNull();
  });

  it("prefers error_description over the raw error code", () => {
    expect(
      parseAuthCallbackUrl(
        "?error=server_error&error_code=unexpected_failure&error_description=Please%20try%20again",
        ""
      )
    ).toEqual({ error: "Please try again", code: null });
  });

  it("returns no error and no code for an empty callback", () => {
    expect(parseAuthCallbackUrl("", "")).toEqual({
      error: null,
      code: null,
    });
  });
});

describe("readAuthCallbackTokens", () => {
  it("reads implicit tokens from the hash fragment", () => {
    expect(
      readAuthCallbackTokens(
        "",
        "#access_token=access-1&refresh_token=refresh-1&expires_in=3600"
      )
    ).toEqual({
      access_token: "access-1",
      refresh_token: "refresh-1",
    });
  });

  it("reads tokens from the query string", () => {
    expect(
      readAuthCallbackTokens(
        "?access_token=access-2&refresh_token=refresh-2",
        ""
      )
    ).toEqual({
      access_token: "access-2",
      refresh_token: "refresh-2",
    });
  });

  it("requires both tokens", () => {
    expect(
      readAuthCallbackTokens("", "#access_token=access-1")
    ).toBeNull();
    expect(
      readAuthCallbackTokens("", "#refresh_token=refresh-1")
    ).toBeNull();
  });

  it("ignores blank values", () => {
    expect(
      readAuthCallbackTokens(
        "",
        "#access_token=%20&refresh_token=refresh-1"
      )
    ).toBeNull();
  });
});
