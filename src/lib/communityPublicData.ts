import { API_BASE_URL } from "./api";
import type { CommunityPost } from "./community.ts";

export type PublicCommunityPostData = Omit<
  CommunityPost,
  "author_id" | "photo_paths" | "photos" | "is_hidden"
> & {
  photo_paths?: unknown;
};

export function normalizeCommunityPhotoPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (path): path is string => typeof path === "string" && path.length > 0,
  );
}

export function buildCommunityPhotoUrl(postId: string, index: number): string {
  return `${API_BASE_URL}/api/community/posts/${encodeURIComponent(postId)}/photos/${index}`;
}

export function toPublicCommunityPost(post: PublicCommunityPostData): CommunityPost {
  const photoPaths = normalizeCommunityPhotoPaths(post.photo_paths);
  return {
    ...post,
    is_hidden: false,
    photo_paths: photoPaths,
    photos: photoPaths.map((path, index) => ({
      path,
      url: buildCommunityPhotoUrl(post.id, index),
    })),
  };
}
