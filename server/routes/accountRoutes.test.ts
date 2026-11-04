import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authUsers: Record<string, { id: string; email: string }> = {
  "token-user-1": { id: "user-1", email: "one@example.com" },
  "token-user-2": { id: "user-2", email: "two@example.com" },
};

const profiles: Record<string, { username: string }> = {
  "user-1": { username: "commuter_one" },
  "user-2": { username: "commuter_two" },
};
const uploadedPhotos: Array<{
  userId: string | undefined;
  path: string;
  contentType: string;
  contents: Buffer;
}> = [];
const profilePhotos = new Set<string>();

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserClient: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("../supabaseClient.ts", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: mocks.getUser,
      signInWithPassword: mocks.signInWithPassword,
      updateUser: mocks.updateUser,
    },
  }),
  getSupabaseClientForAccessToken: mocks.getUserClient,
}));

describe("authenticated account routes", () => {
  let server: ReturnType<typeof appListen>;
  let baseUrl: string;

  function appListen(application: express.Express) {
    return application.listen(0);
  }

  beforeEach(async () => {
    profiles["user-1"] = { username: "commuter_one" };
    profiles["user-2"] = { username: "commuter_two" };
    uploadedPhotos.length = 0;
    profilePhotos.clear();
    let accountRoutes: express.Router | undefined;
    try {
      accountRoutes = (await import("./accountRoutes.ts")).default;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("Cannot find module")
      ) {
        throw error;
      }
    }

    mocks.getUser.mockImplementation(async (token: string) => {
      const user = authUsers[token];
      return {
        data: { user: user ?? null },
        error: user ? null : new Error("Invalid token"),
      };
    });
    mocks.signInWithPassword.mockImplementation(
      async ({ email, password }: { email: string; password: string }) => {
        const user = Object.values(authUsers).find(
          (candidate) => candidate.email === email,
        );
        if (password !== "CurrentPass1!") {
          return {
            data: { user: null, session: null },
            error: new Error("Invalid login credentials"),
          };
        }
        return {
          data: { user: user ?? null, session: user ? { access_token: "unused" } : null },
          error: user ? null : new Error("Unknown email"),
        };
      },
    );
    mocks.updateUser.mockResolvedValue({ error: null });

    mocks.getUserClient.mockImplementation((token: string) => {
      const user = authUsers[token];
      return {
        from: (table: string) => {
          const query: {
            eq: (column: string, value: string) => typeof query;
            select: (columns: string) => typeof query;
            maybeSingle: () => Promise<{
              data: { username: string } | null;
              error: { code: string; message: string } | null;
            }>;
          } = {
            eq: () => query,
            select: () => query,
            maybeSingle: async () => ({ data: null, error: null }),
          };
          let selectedId: string | undefined;
          let selectedColumns = "";
          let updateUsername: string | undefined;
          query.eq = (column, value) => {
            if (column === "id") selectedId = value;
            return query;
          };
          query.select = (columns) => {
            selectedColumns = columns;
            return query;
          };
          const selectProfile = () => ({
            maybeSingle: async () =>
              table === "profiles" &&
              selectedColumns === "username" &&
              selectedId === user?.id
                ? { data: profiles[selectedId] ?? null, error: null }
                : { data: null, error: null },
          });
          return {
            select: (columns: string) => {
              selectedColumns = columns;
              return {
                eq: (column: string, value: string) => {
                  if (column === "id") selectedId = value;
                  return selectProfile();
                },
              };
            },
            update: (values: { username: string }) => {
              updateUsername = values.username;
              return {
                eq: (column: string, value: string) => {
                  if (column === "id") selectedId = value;
                  return {
                    select: (columns: string) => {
                      selectedColumns = columns;
                      return {
                        maybeSingle: async () => {
                          if (
                            table !== "profiles" ||
                            selectedColumns !== "username" ||
                            selectedId !== user?.id ||
                            !updateUsername
                          ) {
                            return { data: null, error: null };
                          }
                          const duplicate = Object.entries(profiles).some(
                            ([id, profile]) =>
                              id !== selectedId &&
                              profile.username === updateUsername,
                          );
                          if (duplicate) {
                            return {
                              data: null,
                              error: {
                                code: "23505",
                                message: "duplicate username",
                              },
                            };
                          }
                          profiles[selectedId] = {
                            username: updateUsername,
                          };
                          return {
                            data: profiles[selectedId],
                            error: null,
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        storage: {
          from: (bucket: string) => ({
            list: async (folder: string) => ({
              data: bucket === "profile-photos" && folder === user?.id
                ? (profilePhotos.has(user.id)
                  ? [{ name: "profile" }]
                  : [])
                : null,
              error: null,
            }),
            createSignedUrl: async (path: string) => ({
              data: { signedUrl: `https://signed.example/${path}` },
              error: null,
            }),
            upload: async (
              path: string,
              contents: Buffer,
              options: { contentType: string },
            ) => {
              uploadedPhotos.push({
                userId: user?.id,
                path,
                contentType: options.contentType,
                contents,
              });
              if (user?.id) profilePhotos.add(user.id);
              return { error: null };
            },
          }),
        },
      };
    });

    const app = express();
    app.use(express.json());
    if (accountRoutes) {
      app.use("/api/account", accountRoutes);
    } else {
      app.use("/api/account", (_req, res) => res.sendStatus(404));
    }
    server = appListen(app);
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
    vi.clearAllMocks();
  });

  it("returns only the authenticated user's profile and verified email", async () => {
    const response = await fetch(`${baseUrl}/api/account?userId=user-2`, {
      headers: { Authorization: "Bearer token-user-1" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      account: {
        email: "one@example.com",
        username: "commuter_one",
        profilePhotoUrl: null,
      },
    });
  });

  it("rejects account reads without a valid authenticated session", async () => {
    const response = await fetch(`${baseUrl}/api/account`);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
    });
  });

  it("updates only the authenticated user's username", async () => {
    const response = await fetch(`${baseUrl}/api/account`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer token-user-1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: "new_name", id: "user-2" }),
    });

    expect(response.status).toBe(400);

    const ownedUpdate = await fetch(`${baseUrl}/api/account`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer token-user-1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: "new_name" }),
    });
    expect(ownedUpdate.status).toBe(200);
    await expect(ownedUpdate.json()).resolves.toMatchObject({
      success: true,
      account: { username: "new_name", email: "one@example.com" },
    });
    expect(profiles).toEqual({
      "user-1": { username: "new_name" },
      "user-2": { username: "commuter_two" },
    });
  });

  it("rejects invalid and duplicate usernames without changing the profile", async () => {
    const invalid = await fetch(`${baseUrl}/api/account`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer token-user-1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: "!" }),
    });
    expect(invalid.status).toBe(400);

    const duplicate = await fetch(`${baseUrl}/api/account`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer token-user-1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: "commuter_two" }),
    });
    expect(duplicate.status).toBe(409);
    expect(profiles["user-1"].username).toBe("commuter_one");
  });

  it("rejects weak new passwords before authenticating", async () => {
    const response = await fetch(`${baseUrl}/api/account/password`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer token-user-1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "CurrentPass1!",
        newPassword: "weak",
      }),
    });

    expect(response.status).toBe(400);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejects an incorrect current password", async () => {
    const response = await fetch(`${baseUrl}/api/account/password`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer token-user-1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "wrong",
        newPassword: "NewSecure1!",
      }),
    });

    expect(response.status).toBe(400);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("changes the password only when the verified identity matches", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: "user-2" },
        session: { access_token: "unused" },
      },
      error: null,
    });

    const mismatch = await fetch(`${baseUrl}/api/account/password`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer token-user-1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "CurrentPass1!",
        newPassword: "NewSecure1!",
      }),
    });
    expect(mismatch.status).toBe(400);
    expect(mocks.updateUser).not.toHaveBeenCalled();

    mocks.signInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: "user-1" },
        session: { access_token: "unused" },
      },
      error: null,
    });
    const response = await fetch(`${baseUrl}/api/account/password`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer token-user-1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "CurrentPass1!",
        newPassword: "NewSecure1!",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Password updated successfully.",
    });
    expect(mocks.updateUser).toHaveBeenCalledWith({
      password: "NewSecure1!",
    });
  });

  it.each(["image/jpeg", "image/png", "image/webp"])(
    "uploads a %s photo to the verified user's private folder",
    async (contentType) => {
    const response = await fetch(`${baseUrl}/api/account/photo`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer token-user-1",
        "Content-Type": contentType,
      },
      body: new Uint8Array([1, 2, 3]),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      account: {
        username: "commuter_one",
        profilePhotoUrl: "https://signed.example/user-1/profile",
      },
    });
    expect(uploadedPhotos).toHaveLength(1);
    expect(uploadedPhotos[0]).toMatchObject({
      userId: "user-1",
      path: "user-1/profile",
      contentType,
    });
    expect(uploadedPhotos[0].contents).toEqual(Buffer.from([1, 2, 3]));
  });

  it("rejects unsupported photo types without uploading", async () => {
    const response = await fetch(`${baseUrl}/api/account/photo`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer token-user-1",
        "Content-Type": "image/gif",
      },
      body: new Uint8Array([1, 2, 3]),
    });

    expect(response.status).toBe(400);
    expect(uploadedPhotos).toHaveLength(0);
  });

  it("rejects profile photos larger than 5 MB", async () => {
    const response = await fetch(`${baseUrl}/api/account/photo`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer token-user-1",
        "Content-Type": "image/jpeg",
      },
      body: new Uint8Array(5 * 1024 * 1024 + 1),
    });

    expect(response.status).toBe(413);
    expect(uploadedPhotos).toHaveLength(0);
  });
});
