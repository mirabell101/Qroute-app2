import type { AdminReportRecord } from "../types";
import { isNullableString, isPositiveInteger, isRecord } from "./common";

export function isAdminReportRecord(value: unknown): value is AdminReportRecord {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    (value.type === "Post" || value.type === "Comment" || value.type === "User") &&
    (value.targetType === "post" || value.targetType === "comment" || value.targetType === "user") &&
    isNullableString(value.postId) &&
    isNullableString(value.commentId) &&
    isNullableString(value.reportedUserId) &&
    typeof value.reason === "string" &&
    typeof value.reportedContent === "string" &&
    typeof value.reporter === "string" &&
    typeof value.reportedUser === "string" &&
    typeof value.date === "string" &&
    (value.status === "Pending" || value.status === "Reviewed" || value.status === "Dismissed") &&
    typeof value.description === "string"
  );
}
