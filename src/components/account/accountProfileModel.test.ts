import { describe, expect, it } from "vitest";

import { selectAccountAvatar } from "./accountProfileModel";

const communityAuthorAccount = {
  email: "",
  username: null,
  displayName: null,
  profilePhotoUrl: "https://public.example/user/profile",
  googleProfilePhotoUrl: "https://lh3.googleusercontent.com/user",
};

describe("Community avatar photo precedence", () => {
  it("uses the uploaded photo, then Google, then the fallback", () => {
    expect(selectAccountAvatar(communityAuthorAccount)).toMatchObject({
      type: "photo",
      url: "https://public.example/user/profile",
    });

    expect(
      selectAccountAvatar(communityAuthorAccount, [
        "https://public.example/user/profile",
      ]),
    ).toMatchObject({
      type: "photo",
      url: "https://lh3.googleusercontent.com/user",
    });

    expect(
      selectAccountAvatar(communityAuthorAccount, [
        "https://public.example/user/profile",
        "https://lh3.googleusercontent.com/user",
      ]),
    ).toEqual({
      type: "icon",
      label: "Profile",
    });
  });
});
