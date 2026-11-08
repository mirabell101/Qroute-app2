import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AccountData } from "@/lib/accountApi";
import { AccountProfileContext } from "@/components/account/accountProfileStore";
import type { AccountProfileValue } from "@/components/account/accountProfileStore";
import Profile from "./Profile";

const account: AccountData = {
  email: "rider@example.com",
  username: "rider",
  displayName: "Rider",
  profilePhotoUrl: null,
};

describe("Profile page photo migration", () => {
  it("keeps photo editing disabled until legacy profile initialization finishes", () => {
    const profile: AccountProfileValue = {
      userId: "google-user-id",
      account,
      loading: false,
      error: null,
      setAccount: () => undefined,
    };

    const markup = renderToStaticMarkup(
      createElement(
        AccountProfileContext.Provider,
        { value: profile },
        createElement(Profile, {
          currentUserId: "google-user-id",
          onLogout: () => undefined,
        }),
      ),
    );

    expect(markup).toMatch(
      /<input[^>]*id="profile-photo"[^>]*disabled=""/,
    );
  });
});
