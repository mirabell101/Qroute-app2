import { describe, expect, it } from "vitest";

import {
  getOAuthCallbackUrl,
  isTrustedPostAuthPath,
  resolveAuthenticatedRootPath,
  resolvePostAuthPath,
} from "./authRedirect";

describe("isTrustedPostAuthPath", () => {
  it.each([
    "/",
    "/home",
    "/saved",
    "/recents",
    "/contribution",
    "/profile",
    "/points-badges",
    "/community",
    "/admin",
    "/admin/dashboard",
  ])("accepts the known application path %s", (path) => {
    expect(isTrustedPostAuthPath(path)).toBe(true);
  });

  it("accepts query strings and hashes only on trusted paths", () => {
    expect(isTrustedPostAuthPath("/home?tab=saved")).toBe(true);
    expect(isTrustedPostAuthPath("/community#latest")).toBe(true);
    expect(isTrustedPostAuthPath("/not-a-page?next=/home")).toBe(false);
  });

  it.each([
    "https://evil.example/home",
    "//evil.example/home",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "data:text/html,hello",
    "/home\nLocation: https://evil.example",
    "/unknown",
    "",
  ])("rejects the untrusted destination %s", (path) => {
    expect(isTrustedPostAuthPath(path)).toBe(false);
  });
});

describe("resolvePostAuthPath", () => {
  it("uses a trusted requested path", () => {
    expect(resolvePostAuthPath("/saved", "/home")).toBe("/saved");
  });

  it("falls back when the requested path is not trusted", () => {
    expect(resolvePostAuthPath("https://evil.example", "/profile")).toBe(
      "/profile"
    );
  });

  it("uses /home when neither value is trusted", () => {
    expect(resolvePostAuthPath("//evil.example", "/unknown")).toBe("/home");
    expect(resolvePostAuthPath(null, null)).toBe("/home");
  });
});

describe("resolveAuthenticatedRootPath", () => {
  it("sends authenticated visitors from the root route to home", () => {
    expect(resolveAuthenticatedRootPath(true)).toBe("/home");
  });

  it("keeps the public landing page available to signed-out visitors", () => {
    expect(resolveAuthenticatedRootPath(false)).toBeNull();
  });
});

describe("getOAuthCallbackUrl", () => {
  it("uses the configured application origin and ignores its path", () => {
    expect(
      getOAuthCallbackUrl({
        configuredAppUrl: "https://app.qroute.test/some/path",
      })
    ).toBe("https://app.qroute.test/auth/callback");
  });

  it("allows a configured loopback development origin", () => {
    expect(
      getOAuthCallbackUrl({
        configuredAppUrl: "http://localhost:5173",
      })
    ).toBe("http://localhost:5173/auth/callback");
  });

  it("rejects configured URLs that are not absolute http(s) origins", () => {
    expect(() =>
      getOAuthCallbackUrl({ configuredAppUrl: "qroute.test" })
    ).toThrow(/absolute http/);

    expect(() =>
      getOAuthCallbackUrl({ configuredAppUrl: "ftp://qroute.test" })
    ).toThrow(/absolute http/);

    expect(() =>
      getOAuthCallbackUrl({
        configuredAppUrl: "https://user:pass@qroute.test",
      })
    ).toThrow(/absolute http/);
  });

  it("uses a loopback current origin when development fallback is enabled", () => {
    expect(
      getOAuthCallbackUrl({
        configuredAppUrl: null,
        currentOrigin: "http://localhost:5173",
        allowLoopback: true,
      })
    ).toBe("http://localhost:5173/auth/callback");

    expect(
      getOAuthCallbackUrl({
        configuredAppUrl: "  ",
        currentOrigin: "http://127.0.0.1:3000",
        allowLoopback: true,
      })
    ).toBe("http://127.0.0.1:3000/auth/callback");
  });

  it("fails closed for non-loopback origins", () => {
    expect(() =>
      getOAuthCallbackUrl({
        configuredAppUrl: null,
        currentOrigin: "https://evil.example",
        allowLoopback: true,
      })
    ).toThrow(/not configured/);

    expect(() =>
      getOAuthCallbackUrl({
        configuredAppUrl: null,
        currentOrigin: "http://localhost:5173",
        allowLoopback: false,
      })
    ).toThrow(/not configured/);
  });
});
