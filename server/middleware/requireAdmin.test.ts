import type { Request, RequestHandler, Response } from "express";
import { beforeEach, beforeAll, describe, expect, it, vi } from "vitest";

const { getSupabaseClientForAccessToken } = vi.hoisted(() => ({
  getSupabaseClientForAccessToken: vi.fn(),
}));

vi.mock("../supabaseClient.ts", () => ({
  getSupabaseClientForAccessToken,
}));

let requireAdmin: RequestHandler | undefined;

beforeAll(async () => {
  try {
    ({ requireAdmin } = await import("./requireAdmin.ts"));
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Cannot find module")) {
      throw error;
    }
  }
});

function createRoleQuery(result: {
  data: { role: string }[] | null;
  error: { message: string } | null;
}) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  getSupabaseClientForAccessToken.mockReturnValue({
    from: vi.fn().mockReturnValue(query),
  });
  return query;
}

function createResponse(user?: unknown, accessToken?: string) {
  return {
    locals: { user, accessToken },
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
}

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function invokeMiddleware(
    res: Response,
    next: ReturnType<typeof vi.fn>,
  ) {
    expect(requireAdmin).toBeTypeOf("function");
    await requireAdmin!({} as Request, res, next);
  }

  it("allows a verified user whose database role is admin", async () => {
    const query = createRoleQuery({
      data: [{ role: "registered_user" }, { role: "admin" }],
      error: null,
    });
    const user = { id: "user-1", app_metadata: { role: "registered_user" } };
    const res = createResponse(user, "verified-token");
    const next = vi.fn();

    await invokeMiddleware(res, next);

    expect(getSupabaseClientForAccessToken).toHaveBeenCalledWith(
      "verified-token",
    );
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each(["registered_user", "unknown_role"])(
    "rejects a database role of %s",
    async (role) => {
      createRoleQuery({ data: [{ role }], error: null });
      const res = createResponse({ id: "user-1" }, "verified-token");
      const next = vi.fn();

      await invokeMiddleware(res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }),
      );
      expect(next).not.toHaveBeenCalled();
    },
  );

  it("does not grant access from user metadata when the database role is not admin", async () => {
    createRoleQuery({
      data: [{ role: "registered_user" }],
      error: null,
    });
    const res = createResponse(
      { id: "user-1", user_metadata: { role: "admin" } },
      "verified-token",
    );
    const next = vi.fn();

    await invokeMiddleware(res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("fails closed when the role lookup fails", async () => {
    createRoleQuery({
      data: null,
      error: { message: "role lookup failed" },
    });
    const res = createResponse({ id: "user-1" }, "verified-token");
    const next = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await invokeMiddleware(res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
    expect(next).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("rejects missing verified request context", async () => {
    const res = createResponse(undefined, undefined);
    const next = vi.fn();

    await invokeMiddleware(res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(getSupabaseClientForAccessToken).not.toHaveBeenCalled();
  });
});
