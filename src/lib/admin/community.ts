import { requestAdmin } from "./request";
import type { CommunityPost } from "@/lib/community";

export async function getAdminCommunityPosts(expectedUserId: string): Promise<CommunityPost[]> {
  const payload = await requestAdmin("/posts", expectedUserId);
  if (!Array.isArray(payload.posts)) {
    throw new Error("Admin service returned invalid community post data.");
  }
  return payload.posts as CommunityPost[];
}

export async function deleteAdminCommunityPost(expectedUserId: string, id: string): Promise<void> {
  await requestAdmin(`/posts/${encodeURIComponent(id)}`, expectedUserId, {
    method: "DELETE",
  });
}

export async function setAdminPostVisibility(
  expectedUserId: string,
  postId: string,
  isHidden: boolean,
): Promise<void> {
  await requestAdmin(`/posts/${encodeURIComponent(postId)}/visibility`, expectedUserId, {
    method: "PATCH",
    body: { isHidden },
  });
}
