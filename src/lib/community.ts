
import { API_BASE_URL } from "@/lib/api";
import { validateImage } from "@/lib/mapImages";
import { supabase } from "@/lib/supabase";
import {
  buildCommunityPhotoUrl,
  normalizeCommunityPhotoPaths,
  toPublicCommunityPost,
  type PublicCommunityPostData,
} from "@/lib/communityPublicData";
import {
  validateCommunityReportDraft,
  type CommunityReportReason,
  type CommunityReportTarget,
} from "@/lib/communityReport";

export {
  COMMUNITY_REPORT_REASONS,
  validateCommunityReportDraft,
} from "@/lib/communityReport";
export type {
  CommunityReportReason,
  CommunityReportTarget,
} from "@/lib/communityReport";

const COMMUNITY_PHOTO_BUCKET = "community-post-photos";
const PROFILE_PHOTO_BUCKET = "profile-photos";
const PROFILE_PHOTO_PATH = "profile";

export interface CommunityPoint {
  name: string;
  latitude: number;
  longitude: number;
}

export interface CommunityPost {
  id: string;
  author_id?: string;
  author_is_admin?: boolean;
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
  is_hidden: boolean;
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
  author_is_admin?: boolean;
  author_display_name: string;
  content: string;
  created_at: string;
}

export interface CommunityAuthorPhotoUrls {
  profilePhotoUrl: string;
  googleProfilePhotoUrl: string | null;
}

interface PublicCommunityData {
  posts: PublicCommunityPostData[];
  comments: CommunityComment[];
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
  isAdmin: boolean;
}

export interface CommunityReportResult {
  reportId: number;
}

/**
 * Sort Community comments newest-first.
 *
 * created_at is the primary ordering field.
 * id is used as a deterministic tie-breaker when timestamps are identical.
 */
export function sortCommunityCommentsNewestFirst(
  comments: CommunityComment[],
): CommunityComment[] {
  return [...comments].sort(
    (left, right) =>
      right.created_at.localeCompare(left.created_at) ||
      right.id.localeCompare(left.id),
  );
}

export async function getCommunityAccess(userId: string): Promise<CommunityAccess> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((row) => row.role);
  const isAdmin = roles.includes("admin");
  const canInteract = isAdmin || roles.includes("registered_user");
  return {
    canPublishAndVote: canInteract,
    canReceiveRealtime: canInteract,
    isAdmin,
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

export async function getCommunityPosts(
  scope: "feed" | "mine" = "feed",
  currentUserId: string | null | undefined = undefined,
): Promise<CommunityPost[]> {
  if (currentUserId === undefined) {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) throw new Error(sessionError.message);
    currentUserId = sessionData.session
      ? (sessionData.session.user?.id ?? "verified-session")
      : null;
  }
  if (currentUserId === null) {
    if (scope === "mine") throw new Error("Please sign in to view your posts.");
    const { data, error } = await supabase.rpc("get_public_community_data", {
      p_post_ids: null,
      p_include_posts: true,
      p_include_comments: false,
    });
    if (error) throw new Error(error.message);
    return ((data as PublicCommunityData | null)?.posts ?? []).map(toPublicCommunityPost);
  }

  const result = await request<{ posts: CommunityPost[] }>(
    `/posts?scope=${scope}`,
    {},
    true,
  );
  return (result.posts ?? []).map(withPhotoUrls);
}

export async function getCommunityPost(
  postId: string,
  currentUserId: string | null | undefined = undefined,
): Promise<{
  post: CommunityPost;
  comments: CommunityComment[];
}> {
  if (currentUserId === undefined) {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) throw new Error(sessionError.message);
    currentUserId = sessionData.session
      ? (sessionData.session.user?.id ?? "verified-session")
      : null;
  }
  if (currentUserId === null) {
    const { data, error } = await supabase.rpc("get_public_community_data", {
      p_post_ids: [postId],
      p_include_posts: true,
      p_include_comments: true,
    });
    if (error) throw new Error(error.message);
    const result = data as PublicCommunityData | null;
    const post = result?.posts?.[0];
    if (!post) throw new Error("Post not found.");
    return {
      post: toPublicCommunityPost(post),
      comments: sortCommunityCommentsNewestFirst(result?.comments ?? []),
    };
  }

  const result = await request<{
    post: CommunityPost;
    comments: CommunityComment[];
  }>(`/posts/${encodeURIComponent(postId)}`, {}, true);
  return {
    ...result,
    post: withPhotoUrls(result.post),
    comments: sortCommunityCommentsNewestFirst(result.comments ?? []),
  };
}

export async function getCommunityComments(
  postIds: string[],
  currentUserId: string | null | undefined = undefined,
): Promise<CommunityComment[]> {
  if (!postIds.length) return [];
  if (currentUserId === undefined) {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) throw new Error(sessionError.message);
    currentUserId = sessionData.session
      ? (sessionData.session.user?.id ?? "verified-session")
      : null;
  }
  if (currentUserId === null) {
    const { data, error } = await supabase.rpc("get_public_community_data", {
      p_post_ids: postIds,
      p_include_posts: false,
      p_include_comments: true,
    });
    if (error) throw new Error(error.message);
    return sortCommunityCommentsNewestFirst(
      (data as PublicCommunityData | null)?.comments ?? [],
    );
  }

  const result = await request<{ comments: CommunityComment[] }>(
    `/comments?postIds=${encodeURIComponent(postIds.join(","))}`,
    {},
    true,
  );
  return sortCommunityCommentsNewestFirst(result.comments ?? []);
}

export async function getCommunityProfilePhotoUrls(
  expectedUserId: string | null,
  authorIds: string[],
): Promise<Record<string, CommunityAuthorPhotoUrls>> {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (expectedUserId !== null && (
    !sessionData.session ||
    sessionData.session.user.id !== expectedUserId
  )) {
    throw new Error("Please sign in to continue.");
  }

  const userIds = [...new Set(
    authorIds.map((authorId) => authorId.trim()).filter(Boolean),
  )];
  if (!userIds.length) return {};

  const photoResult = await request<{
    success?: unknown;
    photos?: unknown;
  }>("/author-google-photos");
  if (
    photoResult.success !== true ||
    typeof photoResult.photos !== "object" ||
    photoResult.photos === null ||
    Array.isArray(photoResult.photos)
  ) {
    throw new Error("Community service returned invalid author photos.");
  }

  const googlePhotoUrls = photoResult.photos as Record<string, unknown>;
  const urls: Record<string, CommunityAuthorPhotoUrls> = {};
  const photoStorage = supabase.storage.from(PROFILE_PHOTO_BUCKET);
  for (const userId of userIds) {
    const path = `${userId}/${PROFILE_PHOTO_PATH}`;
    const candidate = googlePhotoUrls[userId];
    let googleProfilePhotoUrl: string | null = null;
    if (typeof candidate === "string") {
      try {
        const url = new URL(candidate);
        if (url.protocol === "https:" && url.hostname) {
          googleProfilePhotoUrl = url.toString();
        }
      } catch {
        googleProfilePhotoUrl = null;
      }
    }

    urls[userId] = {
      profilePhotoUrl: photoStorage.getPublicUrl(path).data.publicUrl,
      googleProfilePhotoUrl,
    };
  }
  return urls;
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

export async function reportCommunityTarget(
  target: CommunityReportTarget,
  reason: CommunityReportReason,
  description = "",
): Promise<CommunityReportResult> {
  const validationError = validateCommunityReportDraft(reason, description);
  if (validationError) throw new Error(validationError);

  const isComment = target.kind === "comment" || target.kind === "comment-author";
  const targetType = target.kind === "post" || target.kind === "comment"
    ? target.kind
    : "user";
  const targetId = isComment ? target.commentId : target.postId;
  const targetPath = isComment ? "comments" : "posts";
  const result = await request<{
    success?: unknown;
    report?: { id?: unknown };
  }>(
    `/${targetPath}/${encodeURIComponent(targetId)}/reports`,
    {
      method: "POST",
      body: JSON.stringify({
        targetType,
        reason,
        ...(description.trim() ? { description: description.trim() } : {}),
      }),
    },
    true,
  );

  if (
    result.success !== true ||
    typeof result.report?.id !== "number" ||
    !Number.isSafeInteger(result.report.id)
  ) {
    throw new Error("Community service returned an invalid response.");
  }

  return { reportId: result.report.id };
}

export async function createCommunityPost(input: CommunityPostInput): Promise<CommunityPost> {
  const result = await request<{ post: CommunityPost }>(
    "/posts",
    { method: "POST", body: JSON.stringify(input) },
    true,
  );
  return withPhotoUrls(result.post);
}

export function withPhotoUrls(post: CommunityPost): CommunityPost {
  const photoPaths = normalizeCommunityPhotoPaths(post.photo_paths);
  return {
    ...post,
    photo_paths: photoPaths,
    photos: photoPaths.map((path, index) => ({
      path,
      // The community photo endpoint validates the current user's access token
      // when present, allowing an author to view their own hidden-post photos.
      url: buildCommunityPhotoUrl(post.id, index),
    })),
  };
}

export function withAdminPhotoUrls(post: CommunityPost): CommunityPost {
  const photoPaths = normalizeCommunityPhotoPaths(post.photo_paths);
  return {
    ...post,
    photo_paths: photoPaths,
    photos: photoPaths.map((path, index) => ({
      path,
      url: `${API_BASE_URL}/api/admin/posts/${encodeURIComponent(post.id)}/photos/${index}`,
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
