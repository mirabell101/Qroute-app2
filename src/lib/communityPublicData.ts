import type { CommunityPost } from "./community.ts";

export type PublicCommunityPostData = Omit<
  CommunityPost,
  "author_id" | "photo_paths" | "photos"
>;

export function toPublicCommunityPost(post: PublicCommunityPostData): CommunityPost {
  return {
    ...post,
    photo_paths: [],
    photos: [],
  };
}
