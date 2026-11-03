import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import PointsBadges from "./points-badges";

describe("Points and Badges page", () => {
  it("shows unavailable status without fabricating totals or badge milestones", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <PointsBadges />
      </MemoryRouter>,
    );

    expect(markup).toContain("Not available yet");
    expect(markup).not.toContain("First Contributor");
    expect(markup).not.toContain("QRoute Legend");
    expect(markup).not.toContain("75 QPoints");
  });
});
