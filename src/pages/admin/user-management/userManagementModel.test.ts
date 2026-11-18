import { beforeAll, describe, expect, it } from "vitest";

type UserManagementModelModule =
  typeof import("./userManagementModel");
let userManagementModel: UserManagementModelModule | null = null;

function getModel(): UserManagementModelModule {
  expect(userManagementModel).not.toBeNull();
  return userManagementModel!;
}

describe("user account status", () => {
  beforeAll(async () => {
    try {
      userManagementModel = await import("./userManagementModel");
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("Cannot find module")
      ) {
        throw error;
      }
    }
  });

  it("derives Active and Banned labels from the API ban flag", () => {
    const { getUserStatus } = getModel();

    expect(getUserStatus(false)).toBe("Active");
    expect(getUserStatus(true)).toBe("Banned");
    expect(getUserStatus(undefined)).toBe("Active");
  });
});
