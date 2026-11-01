import { Router, type Request, type Response } from "express";
import requireAuth from "../middleware/requireAuth.ts";
import requireRegisteredUser from "../middleware/requireRegisteredUser.ts";
import {
  getSupabaseClient,
  getSupabaseClientForAccessToken,
} from "../supabaseClient.ts";
import {
  parseCommunityCommentInput,
  isCommunityPostId,
  parseCommunityPostInput,
  parseCommunityVoteInput,
} from "../communityValidation.ts";
import { upsertCommunityVote } from "../communityVoteWrites.ts";

const router = Router();
const communityPhotoBucket = "community-post-photos";
const postFields =
  "id, author_id, author_display_name, title, content, start_name, start_latitude, start_longitude, destination_name, destination_latitude, destination_longitude, transport_type_id, photo_paths, created_at, transport_types(name), community_post_comments(count)";

function sendDatabaseError(res: Response, error: { code?: string; message: string }) {
  if (error.code === "PGRST116") {
    res.status(404).json({ success: false, message: "Post not found." });
    return;
  }
  console.error("[community] Database request failed:", error.message);
  res.status(500).json({
    success: false,
    message: "Unable to complete the Community request.",
  });
}

async function voteCounts(postIds: string[]) {
  if (postIds.length === 0) return new Map<string, { upvotes: number; downvotes: number }>();
  const { data, error } = await getSupabaseClient().rpc("get_public_community_data", {
    p_post_ids: postIds,
    p_include_posts: true,
    p_include_comments: false,
  });
  if (error) throw error;

  const totals = new Map<string, { upvotes: number; downvotes: number }>();
  for (const id of postIds) totals.set(id, { upvotes: 0, downvotes: 0 });
  const posts = (data as { posts?: Array<{ id: string; upvotes: number; downvotes: number }> } | null)?.posts ?? [];
  for (const post of posts) {
    if (!totals.has(post.id)) continue;
    totals.set(post.id, { upvotes: post.upvotes, downvotes: post.downvotes });
  }
  return totals;
}

async function voteStates(
  postIds: string[],
  userId: string,
  userSupabase: ReturnType<typeof getSupabaseClientForAccessToken>,
) {
  const [{ data: ownVotes, error: ownVotesError }, totals] = await Promise.all([
    userSupabase
      .from("community_post_votes")
      .select("post_id, vote_type")
      .eq("user_id", userId)
      .in("post_id", postIds),
    voteCounts(postIds),
  ]);
  if (ownVotesError) throw ownVotesError;

  const ownVoteByPost = new Map((ownVotes ?? []).map((vote) => [vote.post_id, vote.vote_type]));
  return postIds.map((postId) => ({
    post_id: postId,
    vote_type: ownVoteByPost.get(postId) ?? null,
    upvotes: totals.get(postId)?.upvotes ?? 0,
    downvotes: totals.get(postId)?.downvotes ?? 0,
  }));
}

router.get("/posts", requireAuth, async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseClientForAccessToken(res.locals.accessToken as string);
    const { data, error } = await supabase
      .from("community_posts")
      .select(postFields)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      sendDatabaseError(res, error);
      return;
    }

    const posts = data ?? [];
    const totals = await voteCounts(posts.map((post) => post.id));
    res.json({
      success: true,
      posts: posts.map((post) => ({
        ...post,
        transport_type: post.transport_types?.name ?? null,
        comment_count: post.community_post_comments?.[0]?.count ?? 0,
        upvotes: totals.get(post.id)?.upvotes ?? 0,
        downvotes: totals.get(post.id)?.downvotes ?? 0,
        transport_types: undefined,
        community_post_comments: undefined,
      })),
    });
  } catch (error: unknown) {
    sendDatabaseError(res, {
      message: error instanceof Error ? error.message : "Unknown database error",
    });
  }
});

router.get("/posts/:postId", requireAuth, async (req: Request, res: Response) => {
  if (!isCommunityPostId(req.params.postId)) {
    res.status(400).json({ success: false, message: "Invalid post ID." });
    return;
  }
  try {
    const supabase = getSupabaseClientForAccessToken(res.locals.accessToken as string);
    const { data: post, error } = await supabase
      .from("community_posts")
      .select(postFields)
      .eq("id", req.params.postId)
      .maybeSingle();
    if (error) {
      sendDatabaseError(res, error);
      return;
    }
    if (!post) {
      res.status(404).json({ success: false, message: "Post not found." });
      return;
    }

    const [{ data: comments, error: commentsError }, totals] = await Promise.all([
      supabase
        .from("community_post_comments")
        .select("id, author_id, author_display_name, content, created_at")
        .eq("post_id", post.id)
        .order("created_at", { ascending: true }),
      voteCounts([post.id]),
    ]);
    if (commentsError) {
      sendDatabaseError(res, commentsError);
      return;
    }

    res.json({
      success: true,
      post: {
        ...post,
        transport_type: post.transport_types?.name ?? null,
        comment_count: comments?.length ?? 0,
        upvotes: totals.get(post.id)?.upvotes ?? 0,
        downvotes: totals.get(post.id)?.downvotes ?? 0,
        transport_types: undefined,
        community_post_comments: undefined,
      },
      comments: comments ?? [],
    });
  } catch (error: unknown) {
    sendDatabaseError(res, {
      message: error instanceof Error ? error.message : "Unknown database error",
    });
  }
});

router.get("/comments", requireAuth, async (req: Request, res: Response) => {
  const rawPostIds = req.query.postIds;
  const postIds = typeof rawPostIds === "string"
    ? [...new Set(rawPostIds.split(","))]
    : [];
  if (
    postIds.length < 1 ||
    postIds.length > 100 ||
    postIds.some((postId) => !isCommunityPostId(postId))
  ) {
    res.status(400).json({ success: false, message: "Provide between 1 and 100 valid post IDs." });
    return;
  }
  try {
    const supabase = getSupabaseClientForAccessToken(res.locals.accessToken as string);
    const { data, error } = await supabase
      .from("community_post_comments")
      .select("id, post_id, author_display_name, content, created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: true });
    if (error) {
      sendDatabaseError(res, error);
      return;
    }
    res.json({ success: true, comments: data ?? [] });
  } catch (error: unknown) {
    sendDatabaseError(res, {
      message: error instanceof Error ? error.message : "Unknown database error",
    });
  }
});

router.get("/votes/me", requireAuth, async (_req: Request, res: Response) => {
  const user = res.locals.user as { id: string };
  const token = res.locals.accessToken as string;
  const { data, error } = await getSupabaseClientForAccessToken(token)
    .from("community_post_votes")
    .select("post_id, vote_type")
    .eq("user_id", user.id);
  if (error) {
    sendDatabaseError(res, error);
    return;
  }
  res.json({ success: true, votes: data ?? [] });
});

router.get("/votes/state", requireAuth, async (req: Request, res: Response) => {
  const rawPostIds = req.query.postIds;
  const postIds = typeof rawPostIds === "string"
    ? [...new Set(rawPostIds.split(","))]
    : [];
  if (
    postIds.length < 1 ||
    postIds.length > 100 ||
    postIds.some((postId) => !isCommunityPostId(postId))
  ) {
    res.status(400).json({ success: false, message: "Provide between 1 and 100 valid post IDs." });
    return;
  }

  const user = res.locals.user as { id: string };
  const token = res.locals.accessToken as string;
  try {
    const states = await voteStates(
      postIds,
      user.id,
      getSupabaseClientForAccessToken(token),
    );
    res.json({ success: true, states });
  } catch (error: unknown) {
    sendDatabaseError(res, {
      message: error instanceof Error ? error.message : "Unknown database error",
    });
  }
});

router.post("/posts", requireAuth, requireRegisteredUser, async (req: Request, res: Response) => {
  const parsed = parseCommunityPostInput(req.body);
  if (parsed.error) {
    res.status(400).json({ success: false, message: parsed.error });
    return;
  }

  const user = res.locals.user as { id: string };
  const supabase = res.locals.communitySupabase as ReturnType<typeof getSupabaseClientForAccessToken>;
  for (const photoPath of parsed.data.photoPaths) {
    const [ownerId, fileName, extraPath] = photoPath.split("/");
    if (ownerId !== user.id || !fileName || extraPath) {
      res.status(400).json({ success: false, message: "A photo attachment is not owned by this account." });
      return;
    }
    const { data: files, error: storageError } = await supabase.storage
      .from(communityPhotoBucket)
      .list(ownerId, { limit: 10, search: fileName });
    if (storageError) {
      sendDatabaseError(res, storageError);
      return;
    }
    if (!files?.some((file) => file.name === fileName)) {
      res.status(400).json({ success: false, message: "A photo attachment could not be verified." });
      return;
    }
  }
  if (parsed.data.transportTypeId !== null) {
    const { data: transportType, error: transportTypeError } = await supabase
      .from("transport_types")
      .select("id")
      .eq("id", parsed.data.transportTypeId)
      .maybeSingle();
    if (transportTypeError) {
      sendDatabaseError(res, transportTypeError);
      return;
    }
    if (!transportType) {
      res.status(400).json({ success: false, message: "Transportation type was not found." });
      return;
    }
  }
  const { data, error } = await supabase
    .from("community_posts")
    .insert({
      author_id: user.id,
      title: parsed.data.title,
      content: parsed.data.content,
      start_name: parsed.data.start.name,
      start_latitude: parsed.data.start.latitude,
      start_longitude: parsed.data.start.longitude,
      destination_name: parsed.data.destination.name,
      destination_latitude: parsed.data.destination.latitude,
      destination_longitude: parsed.data.destination.longitude,
      transport_type_id: parsed.data.transportTypeId,
      photo_paths: parsed.data.photoPaths,
    })
    .select("id, author_id, author_display_name, title, content, start_name, start_latitude, start_longitude, destination_name, destination_latitude, destination_longitude, transport_type_id, photo_paths, created_at, transport_types(name)")
    .single();
  if (error) {
    sendDatabaseError(res, error);
    return;
  }
  res.status(201).json({
    success: true,
    post: {
      ...data,
      transport_type: data.transport_types?.name ?? null,
      comment_count: 0,
      upvotes: 0,
      downvotes: 0,
      transport_types: undefined,
    },
  });
});

router.post("/posts/:postId/vote", requireAuth, requireRegisteredUser, async (req: Request, res: Response) => {
  if (!isCommunityPostId(req.params.postId)) {
    res.status(400).json({ success: false, message: "Invalid post ID." });
    return;
  }
  const parsed = parseCommunityVoteInput(req.body);
  if (parsed.error) {
    res.status(400).json({ success: false, message: parsed.error });
    return;
  }

  const user = res.locals.user as { id: string };
  const supabase = res.locals.communitySupabase as ReturnType<typeof getSupabaseClientForAccessToken>;
  try {
    await upsertCommunityVote(supabase, req.params.postId, parsed.data);
    const [state] = await voteStates([req.params.postId], user.id, supabase);
    res.json({ success: true, ...state });
  } catch (error: unknown) {
    sendDatabaseError(res, {
      message: error instanceof Error ? error.message : "Unknown database error",
      ...(error && typeof error === "object" && "code" in error
        ? { code: String(error.code) }
        : {}),
    });
  }
});

router.delete("/posts/:postId/vote", requireAuth, requireRegisteredUser, async (req: Request, res: Response) => {
  if (!isCommunityPostId(req.params.postId)) {
    res.status(400).json({ success: false, message: "Invalid post ID." });
    return;
  }
  const user = res.locals.user as { id: string };
  const supabase = res.locals.communitySupabase as ReturnType<typeof getSupabaseClientForAccessToken>;
  try {
    const { error } = await supabase
      .from("community_post_votes")
      .delete()
      .eq("post_id", req.params.postId)
      .eq("user_id", user.id);
    if (error) throw error;
    const [state] = await voteStates([req.params.postId], user.id, supabase);
    res.json({ success: true, ...state });
  } catch (error: unknown) {
    sendDatabaseError(res, {
      message: error instanceof Error ? error.message : "Unknown database error",
      ...(error && typeof error === "object" && "code" in error
        ? { code: String(error.code) }
        : {}),
    });
  }
});

router.post("/posts/:postId/comments", requireAuth, requireRegisteredUser, async (req: Request, res: Response) => {
  if (!isCommunityPostId(req.params.postId)) {
    res.status(400).json({ success: false, message: "Invalid post ID." });
    return;
  }
  const parsed = parseCommunityCommentInput(req.body);
  if (parsed.error) {
    res.status(400).json({ success: false, message: parsed.error });
    return;
  }

  const user = res.locals.user as { id: string };
  const supabase = res.locals.communitySupabase as ReturnType<typeof getSupabaseClientForAccessToken>;
  const { data, error } = await supabase
    .from("community_post_comments")
    .insert({
      post_id: req.params.postId,
      author_id: user.id,
      content: parsed.data,
    })
    .select("id, post_id, author_id, author_display_name, content, created_at")
    .single();
  if (error) {
    sendDatabaseError(res, error);
    return;
  }
  res.status(201).json({ success: true, comment: data });
});

export default router;
