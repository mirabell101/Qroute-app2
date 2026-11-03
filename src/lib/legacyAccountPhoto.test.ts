import { beforeAll, describe, expect, it } from "vitest";

type LegacyPhotoReader = (record: unknown, userId: string) => File | null;
let getLegacyProfilePhotoFile: LegacyPhotoReader | null = null;

describe("legacy account photo migration", () => {
  beforeAll(async () => {
    try {
      ({ getLegacyProfilePhotoFile } = await import("./legacyAccountPhoto"));
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("Cannot find module")
      ) {
        throw error;
      }
    }
  });

  it("does not migrate a photo from a different account record", () => {
    if (!getLegacyProfilePhotoFile) {
      expect(getLegacyProfilePhotoFile).not.toBeNull();
      return;
    }

    expect(
      getLegacyProfilePhotoFile(
        {
          id: "another-user",
          profilePicture: "data:image/png;base64,AQID",
        },
        "verified-user",
      ),
    ).toBeNull();
  });

  it("extracts a supported photo only from the matching account record", () => {
    expect(getLegacyProfilePhotoFile).not.toBeNull();
    const file = getLegacyProfilePhotoFile?.(
      {
        id: "verified-user",
        profilePicture: "data:image/png;base64,AQID",
      },
      "verified-user",
    );

    expect(file).toBeInstanceOf(File);
    expect(file?.type).toBe("image/png");
    expect(file?.size).toBe(3);
  });

  it("rejects malformed, unsupported, and empty photo data", () => {
    expect(getLegacyProfilePhotoFile?.({ id: "verified-user" }, "verified-user"))
      .toBeNull();
    expect(
      getLegacyProfilePhotoFile?.(
        {
          id: "verified-user",
          profilePicture: "data:image/gif;base64,AQID",
        },
        "verified-user",
      ),
    ).toBeNull();
    expect(
      getLegacyProfilePhotoFile?.(
        {
          id: "verified-user",
          profilePicture: "data:image/png;base64,",
        },
        "verified-user",
      ),
    ).toBeNull();
  });
});
