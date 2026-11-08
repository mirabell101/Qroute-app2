import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUserPassword: vi.fn(),
}));

vi.mock("../../supabaseClient.ts", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: mocks.getUser,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
    },
  }),
  updateSupabaseUserPassword: mocks.updateUserPassword,
}));

describe("password recovery routes", () => {
  let server: ReturnType<express.Express["listen"]>;
  let baseUrl: string;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://qroute.example");
    mocks.getUser.mockImplementation(async (token: string) => ({
      data: {
        user:
          token === "test-access-token"
            ? { id: "verified-user", email: "rider@example.com" }
            : null,
      },
      error:
        token === "test-access-token" ? null : new Error("Invalid token"),
    }));
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    mocks.updateUserPassword.mockResolvedValue(undefined);

    const authRoutes = (await import("../authRoutes.ts")).default;
    const app = express();
    app.use(express.json());
    app.use("/api/auth", authRoutes);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not bind to a TCP port.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("requests a recovery email with the direct reset-page redirect", async () => {
    const response = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: {
        Origin: "https://qroute.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "Rider@Example.com" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
    });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "rider@example.com",
      { redirectTo: "https://qroute.example/resetpassword" },
    );
  });

  it("uses the configured app origin when the request has no Origin header", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "rider@example.com" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "rider@example.com",
      { redirectTo: "https://qroute.example/resetpassword" },
    );
  });

  it("uses the Vite app origin when its proxy removes Origin in development", async () => {
    const response = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "rider@example.com" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "rider@example.com",
      { redirectTo: "http://localhost:5173/resetpassword" },
    );
  });

  it("rejects recovery redirects to origins outside the app allow-list", async () => {
    const response = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "rider@example.com" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("fails closed when a production request has no configured recovery origin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "");

    const response = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "rider@example.com" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "Unable to process your request. Please try again later.",
    });
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("returns a generic failure when Supabase cannot request the email", async () => {
    const errorLogger = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mocks.resetPasswordForEmail.mockResolvedValueOnce({
      error: {
        status: 400,
        code: "email_address_invalid",
        message: "provider details must not be logged",
      },
    });

    const response = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: {
        Origin: "https://qroute.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "rider@example.com" }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "Unable to process your request. Please try again later.",
    });
    expect(errorLogger).toHaveBeenCalledWith(
      "[auth] Password recovery request failed.",
      { status: 400, code: "email_address_invalid" },
    );
  });

  it("reports Supabase email-send and request rate limits as safe 429 responses", async () => {
    for (const code of [
      "over_email_send_rate_limit",
      "over_request_rate_limit",
    ]) {
      mocks.resetPasswordForEmail.mockResolvedValueOnce({
        error: {
          status: 429,
          code,
          message: "provider details must not be returned",
        },
      });

      const response = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: {
          Origin: "https://qroute.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "rider@example.com" }),
      });

      expect(response.status).toBe(429);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        code,
        message: expect.not.stringContaining("provider details"),
      });
    }
  });

  it("identifies the Express recovery limit and reports its cooldown", async () => {
    for (let request = 0; request < 3; request += 1) {
      const allowedResponse = await fetch(
        `${baseUrl}/api/auth/forgot-password`,
        {
          method: "POST",
          headers: {
            Origin: "https://qroute.example",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: "rider@example.com" }),
        },
      );

      expect(allowedResponse.status).toBe(200);
    }

    const limitedResponse = await fetch(
      `${baseUrl}/api/auth/forgot-password`,
      {
        method: "POST",
        headers: {
          Origin: "https://qroute.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "rider@example.com" }),
      },
    );

    expect(limitedResponse.status).toBe(429);
    await expect(limitedResponse.json()).resolves.toMatchObject({
      success: false,
      code: "RECOVERY_RATE_LIMITED",
      retryAfterSeconds: expect.any(Number),
    });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(3);
  });

  it("rejects invalid email addresses before requesting recovery", async () => {
    const response = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("requires a verified bearer token before updating a password", async () => {
    const response = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "NewSecure1!" }),
    });

    expect(response.status).toBe(401);
    expect(mocks.updateUserPassword).not.toHaveBeenCalled();
  });

  it("updates the password using only the verified caller's access token", async () => {
    const response = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: "NewSecure1!" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
    });
    expect(mocks.getUser).toHaveBeenCalledWith("test-access-token");
    expect(mocks.updateUserPassword).toHaveBeenCalledWith(
      "test-access-token",
      "NewSecure1!",
    );
  });

  it.each([
    { password: "NewSecure1!", userId: "another-user" },
    {
      password: "NewSecure1!",
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
    },
  ])("rejects identity or token fields in the password request body", async (body) => {
    const response = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
    expect(mocks.updateUserPassword).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer token", async () => {
    const response = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: {
        Authorization: "Bearer invalid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: "NewSecure1!" }),
    });

    expect(response.status).toBe(401);
    expect(mocks.updateUserPassword).not.toHaveBeenCalled();
  });
});
