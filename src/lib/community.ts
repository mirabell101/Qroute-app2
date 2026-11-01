import { API_BASE_URL } from "@/lib/api";
import { validateImage } from "@/lib/mapImages";
import { supabase } from "@/lib/supabase";

const COMMUNITY_PHOTO_BUCKET = "community-post-photos";

export interface CommunityPoint {
  name: string;
  latitude: number;
  longitude: number;
}

export interface CommunityPost {
  id: string;
  author_id: string;
  author_display_name: string;
  title: string;
  content: string;
  start_name: string;
  start_latitude: number;
  start_longitude: number;
  destination_name: string;
  destination_latitude: number;
  destination_longitude: number;
  transport_type_id: number | null;
  transport_type: string | null;
  photo_paths: string[];
  photos: CommunityPostPhoto[];
  created_at: string;
  comment_count: number;
  upvotes: number;
  downvotes: number;
}

export interface CommunityPostPhoto {
  path: string;
  url: string;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  author_id?: string;
  author_display_name: string;
  content: string;
  created_at: string;
}

export interface CommunityPostInput {
  title: string;
  content: string;
  start: CommunityPoint;
  destination: CommunityPoint;
  transportTypeId: number | null;
  photoPaths?: string[];
}

export type CommunityVoteType = "upvote" | "downvote";
export interface CommunityVote {
  post_id: string;
  vote_type: CommunityVoteType;
}
export interface CommunityVoteState {
  post_id: string;
  vote_type: CommunityVoteType | null;
  upvotes: number;
  downvotes: number;
}

export interface CommunityAccess {
  canPublishAndVote: boolean;
  canReceiveRealtime: boolean;
}

export async function getCommunityAccess(userId: string): Promise<CommunityAccess> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    canPublishAndVote: data?.role === "registered_user",
    canReceiveRealtime: data?.role === "registered_user" || data?.role === "admin",
  };
}

async function request<T>(path: string, options: RequestInit = {}, authenticated = false): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");

  if (authenticated) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message);
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error("Please sign in to continue.");
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}/api/community${path}`, {
    ...options,
    headers,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
  };
  if (!response.ok) {
    throw new Error(payload.message || "Community request failed.");
  }
  return payload as T;
}

export async function getCommunityPosts(): Promise<CommunityPost[]> {
  const result = await request<{ posts: CommunityPost[] }>("/posts");
  return (result.posts ?? []).map(withPhotoUrls);
}

export async function getCommunityPost(postId: string): Promise<{
  post: CommunityPost;
  comments: CommunityComment[];
}> {
  const result = await request<{
    post: CommunityPost;
    comments: CommunityComment[];
  }>(`/posts/${encodeURIComponent(postId)}`);
  return { ...result, post: withPhotoUrls(result.post) };
}

export async function getCommunityComments(postIds: string[]): Promise<CommunityComment[]> {
  if (!postIds.length) return [];
  const result = await request<{ comments: CommunityComment[] }>(
    `/comments?postIds=${encodeURIComponent(postIds.join(","))}`,
  );
  return result.comments ?? [];
}

export async function getMyCommunityVotes(): Promise<CommunityVote[]> {
  const result = await request<{ votes: CommunityVote[] }>("/votes/me", {}, true);
  return result.votes ?? [];
}

export async function getCommunityVoteStates(postIds: string[]): Promise<CommunityVoteState[]> {
  if (!postIds.length) return [];
  const result = await request<{ states: CommunityVoteState[] }>(
    `/votes/state?postIds=${encodeURIComponent(postIds.join(","))}`,
    {},
    true,
  );
  return result.states ?? [];
}

export async function createCommunityPost(input: CommunityPostInput): Promise<CommunityPost> {
  const result = await request<{ post: CommunityPost }>(
    "/posts",
    { method: "POST", body: JSON.stringify(input) },
    true,
  );
  return withPhotoUrls(result.post);
}

function withPhotoUrls(post: CommunityPost): CommunityPost {
  const photoPaths = post.photo_paths ?? [];
  return {
    ...post,
    photo_paths: photoPaths,
    photos: photoPaths.map((path) => ({
      path,
      url: supabase.storage.from(COMMUNITY_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl,
    })),
  };
}

export async function uploadCommunityPostPhotos(files: File[]): Promise<string[]> {
  if (files.length > 5) throw new Error("You can attach up to five photos.");
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Please sign in to upload photos.");

  const uploadedPaths: string[] = [];
  try {
    for (const file of files) {
      const validationError = validateImage(file);
      if (validationError) throw new Error(validationError);
      const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
      const path = `${auth.user.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage
        .from(COMMUNITY_PHOTO_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);
      uploadedPaths.push(path);
    }
    return uploadedPaths;
  } catch (error) {
    if (uploadedPaths.length) {
      await supabase.storage.from(COMMUNITY_PHOTO_BUCKET).remove(uploadedPaths);
    }
    throw error;
  }
}

export async function removeCommunityPostPhotos(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const ownedPaths = paths.filter((path) => path.startsWith(`${auth.user.id}/`));
  if (ownedPaths.length) {
    const { error } = await supabase.storage.from(COMMUNITY_PHOTO_BUCKET).remove(ownedPaths);
    if (error) throw new Error(error.message);
  }
}

export async function setCommunityVote(
  postId: string,
  voteType: CommunityVoteType,
): Promise<CommunityVoteState> {
  return request(
    `/posts/${encodeURIComponent(postId)}/vote`,
    { method: "POST", body: JSON.stringify({ voteType }) },
    true,
  );
}

export async function removeCommunityVote(
  postId: string,
): Promise<CommunityVoteState> {
  return request(
    `/posts/${encodeURIComponent(postId)}/vote`,
    { method: "DELETE" },
    true,
  );
}

export async function createCommunityComment(
  postId: string,
  content: string,
): Promise<CommunityComment> {
  const result = await request<{ comment: CommunityComment }>(
    `/posts/${encodeURIComponent(postId)}/comments`,
    { method: "POST", body: JSON.stringify({ content }) },
    true,
  );
  return result.comment;
}
