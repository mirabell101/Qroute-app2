export const COMMUNITY_REPORT_REASONS = [
  "Spam or misleading content",
  "Harassment or bullying",
  "Hate speech or discrimination",
  "Inappropriate or offensive content",
  "False or misleading information",
  "Threats or violence",
  "Privacy violation",
  "Other",
] as const;

export type CommunityReportReason = (typeof COMMUNITY_REPORT_REASONS)[number];

export type CommunityReportTarget =
  | { kind: "post"; postId: string }
  | { kind: "post-author"; postId: string }
  | { kind: "comment"; commentId: string }
  | { kind: "comment-author"; commentId: string };

export function validateCommunityReportDraft(
  reason: string,
  description: string,
): string | null {
  if (!COMMUNITY_REPORT_REASONS.some((option) => option === reason)) {
    return "Select a valid report reason.";
  }
  if (reason === "Other" && !description.trim()) {
    return "Please explain why you are reporting this content or user.";
  }
  return null;
}
