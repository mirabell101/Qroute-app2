import { describe, expect, it } from "vitest";

import {
  isPasswordRecoveryCallback,
  shouldPersistSupabaseSession,
  validateRecoveryEmail,
  validateRecoveryPassword,
  validateRecoveryPasswordConfirmation,
} from "@/lib/passwordRecovery";

describe("password recovery validation", () => {
  it("accepts a registered Gmail address and rejects invalid addresses", () => {
    expect(validateRecoveryEmail("rider@gmail.com")).toBe("");
    expect(validateRecoveryEmail("")).toBe("Email address is required.");
    expect(validateRecoveryEmail("rider@example.com")).toBe(
      "Please enter a valid Gmail address.",
    );
  });

  it("applies the existing strong-password rules and maximum length", () => {
    expect(validateRecoveryPassword("NewSecure1!")).toBe("");
    expect(validateRecoveryPassword("weak")).toBe(
      "Password must be at least 8 characters.",
    );
    expect(validateRecoveryPassword(`${"A1!a".repeat(33)}`)).toBe(
      "Password must be 128 characters or fewer.",
    );
  });

  it("requires a non-empty matching confirmation", () => {
    expect(validateRecoveryPasswordConfirmation("NewSecure1!", "")).toBe(
      "Please confirm your password.",
    );
    expect(
      validateRecoveryPasswordConfirmation("NewSecure1!", "Different1!"),
    ).toBe("Passwords do not match.");
    expect(
      validateRecoveryPasswordConfirmation("NewSecure1!", "NewSecure1!"),
    ).toBe("");
  });
});

describe("password recovery callback detection", () => {
  it("recognizes Supabase recovery callbacks in the URL fragment or query", () => {
    expect(
      isPasswordRecoveryCallback(
        "",
        "#access_token=opaque&type=recovery",
      ),
    ).toBe(true);
    expect(isPasswordRecoveryCallback("?type=recovery", "")).toBe(true);
  });

  it("does not treat a normal authentication callback as password recovery", () => {
    expect(isPasswordRecoveryCallback("", "#type=signup")).toBe(false);
    expect(isPasswordRecoveryCallback("", "")).toBe(false);
  });
});

describe("Supabase session persistence", () => {
  it("does not persist sessions on password reset routes", () => {
    expect(shouldPersistSupabaseSession("/resetpassword")).toBe(false);
    expect(shouldPersistSupabaseSession("/reset-password")).toBe(false);
    expect(shouldPersistSupabaseSession("/RESETpassword/")).toBe(false);
  });

  it("preserves persistence on other routes", () => {
    expect(shouldPersistSupabaseSession("/login")).toBe(true);
    expect(shouldPersistSupabaseSession("/")).toBe(true);
  });
});
