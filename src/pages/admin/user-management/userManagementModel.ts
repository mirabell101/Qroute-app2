export type UserStatus = "Active" | "Banned";

export function getUserStatus(banned: boolean | undefined): UserStatus {
  return banned ? "Banned" : "Active";
}
