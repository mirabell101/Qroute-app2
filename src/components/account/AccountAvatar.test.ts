import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AccountData } from "@/lib/accountApi";

type AccountAvatarComponent = (props: {
  account: AccountData | null;
  className: string;
  iconSize: number;
}) => ReactNode;

const avatarModule = import.meta.glob<Record<string, unknown>>("./*.tsx", {
  eager: true,
})["./AccountAvatar.tsx"];

function isAccountAvatarComponent(
  value: unknown,
): value is AccountAvatarComponent {
  return typeof value === "function";
}

const account: AccountData = {
  email: "rider@example.com",
  username: null,
  displayName: "Google Rider",
  profilePhotoUrl: "https://example.test/profile.png",
};

describe("Account avatar", () => {
  it("renders the saved profile photo", () => {
    const component: unknown = avatarModule?.["default"];
    expect(isAccountAvatarComponent(component)).toBe(true);
    if (!isAccountAvatarComponent(component)) return;

    const markup = renderToStaticMarkup(
      createElement(component, {
        account,
        className: "h-10 w-10",
        iconSize: 20,
      }),
    );

    expect(markup).toContain('src="https://example.test/profile.png"');
  });

  it("renders initials when the profile has no photo", () => {
    const component: unknown = avatarModule?.["default"];
    expect(isAccountAvatarComponent(component)).toBe(true);
    if (!isAccountAvatarComponent(component)) return;

    const markup = renderToStaticMarkup(
      createElement(component, {
        account: { ...account, profilePhotoUrl: null },
        className: "h-10 w-10",
        iconSize: 20,
      }),
    );

    expect(markup).toContain(">GR</span>");
  });

  it("renders the generic icon when no profile is available", () => {
    const component: unknown = avatarModule?.["default"];
    expect(isAccountAvatarComponent(component)).toBe(true);
    if (!isAccountAvatarComponent(component)) return;

    const markup = renderToStaticMarkup(
      createElement(component, {
        account: null,
        className: "h-10 w-10",
        iconSize: 20,
      }),
    );

    expect(markup).toContain('aria-label="Profile"');
    expect(markup).toContain("<svg");
  });
});
