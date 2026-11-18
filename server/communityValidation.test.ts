import { describe, expect, it } from "vitest";
import { parseCommunityReportInput } from "./communityValidation.ts";

describe("parseCommunityReportInput", () => {
  it("accepts an approved target and reason with optional non-Other details", () => {
    expect(
      parseCommunityReportInput({
        targetType: "comment",
        reason: "Harassment or bullying",
      }),
    ).toEqual({
      data: {
        targetType: "comment",
        reason: "Harassment or bullying",
        description: null,
      },
      error: null,
    });
  });

  it.each([
    { targetType: "route", reason: "Spam or misleading content" },
    { targetType: "post", reason: "Spam" },
    { targetType: "post", reason: "Other", description: "   " },
  ])("rejects unsupported targets, reasons, and empty Other details", (input) => {
    expect(parseCommunityReportInput(input).error).toBeTruthy();
  });
});
