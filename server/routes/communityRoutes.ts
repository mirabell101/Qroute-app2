import { Router, type Request, type Response } from "express";
import requireAuth from "../middleware/requireAuth.ts";
import requireCommunityWriter from "../middleware/requireCommunityWriter.ts";
import {
  getSupabaseClient,
  getSupabaseClientForAccessToken,
  getSupabaseAdminClient,
} from "../supabaseClient.ts";
import { getGoogleProfilePhotoUrl } from "../account.ts";
import {
  type CommunityReportInput,
  parseCommunityCommentInput,
  parseCommunityReportInput,
  isCommunityPostId,
  parseCommunityPostInput,
  parseCommunityVoteInput,
} from "../communityValidation.ts";
import { upsertCommunityVote } from "../communityVoteWrites.ts";
import {
  downloadCommunityPhoto,
  parsePhotoIndex,
  resolvePhotoPath,
  sendCommunityPhoto,
} from "../communityPhotos.ts";
import { addAdminAuthorMarkers } from "../communityAuthorRoles.ts";

const router = Router();

const communityPhotoBucket = "community-post-photos";

interface CommunityReportSnapshot {
  postId: string;
  commentId: string | null;
  authorId: string;
  authorName: string;
  content: string;
}

async function submitCommunityReport(
  res: Response,
  supabase: ReturnType<typeof getSupabaseClientForAccessToken>,
  reporterId: string,
  input: CommunityReportInput,
  snapshot: CommunityReportSnapshot,
) {
  const authorName = snapshot.authorName;
  if (snapshot.authorId === reporterId) {
    res.status(400).json({
      success: false,
      message: "You cannot report your own content or account.",
    });
    return;
  }
  if (
    !snapshot.authorId ||
    !authorName.trim() ||
    authorName.trim().length > 120 ||
    !snapshot.content.trim() ||
    snapshot.content.length > 5000
  ) {
    sendDatabaseError(res, {
      message: "Community target returned incomplete report details.",
    });
    return;
  }

  const { data: report, error } = await supabase
    .from("community_reports")
    .insert({
      target_type: input.targetType,
      post_id: snapshot.postId,
      comment_id: snapshot.commentId,
      reported_user_id: snapshot.authorId,
      reported_user_name: authorName,
      reported_content: snapshot.content,
      reason: input.reason,
      description: input.description,
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    const targetLabel =
      input.targetType === "user" ? "this user" :
      input.targetType === "comment" ? "this comment" : "this post";
    res.status(409).json({
      success: false,
      message: `You have already reported ${targetLabel}.`,
    });
    return;
  }
  if (error) {
    sendDatabaseError(res, error);
    return;
  }
  if (!report || !Number.isSafeInteger(report.id) || report.id < 1) {
    sendDatabaseError(res, {
      message: "Report insert returned an invalid report record.",
    });
    return;
  }

  res.status(201).json({
    success: true,
    report: { id: report.id },
  });
}

const postFields =
  "id, author_id, author_display_name, title, content, start_name, start_latitude, start_longitude, destination_name, destination_latitude, destination_longitude, transport_type_id, photo_paths, is_hidden, created_at, transport_types(name), community_post_comments(count)";

type VoteTotals = {
  upvotes: number;
  downvotes: number;
};

function sendDatabaseError(
  res: Response,
  error: { code?: string; message: string },
) {
  if (error.code === "PGRST116") {
    res.status(404).json({
      success: false,
      message: "Post not found.",
    });
    return;
  }

  console.error("[community] Database request failed:", error.message);

  res.status(500).json({
    success: false,
    message: "Unable to complete the Community request.",
  });
}

router.get(
  "/author-google-photos",
  async (_req: Request, res: Response) => {
    try {
      const { data, error } = await getSupabaseClient().rpc(
        "get_public_community_author_google_photos",
      );

      if (error) {
        sendDatabaseError(res, error);
        return;
      }

      const photos: Record<string, string> = {};
      for (const value of data ?? []) {
        if (
          typeof value !== "object" ||
          value === null ||
          !("author_id" in value) ||
          typeof value.author_id !== "string" ||
          !("google_profile_photo_url" in value)
        ) {
          continue;
        }

        const photoUrl = getGoogleProfilePhotoUrl({
          picture: value.google_profile_photo_url,
        });
        if (photoUrl) photos[value.author_id] = photoUrl;
      }

      res.json({
        success: true,
        photos,
      });
    } catch (error: unknown) {
      sendDatabaseError(res, {
        message:
          error instanceof Error
            ? error.message
            : "Unknown database error",
      });
    }
  },
);

function sendPhotoNotFound(res: Response) {
  res.status(404).json({
    success: false,
    message: "Photo not found.",
  });
}

function getBearerToken(req: Request): string | null {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match || !match[1].trim()) {
    return "";
  }

  return match[1].trim();
}

async function voteCounts(
  postIds: string[],
): Promise<Map<string, VoteTotals>> {
  const totals = new Map<string, VoteTotals>();

  if (postIds.length === 0) {
    return totals;
  }

  for (const id of postIds) {
    totals.set(id, {
      upvotes: 0,
      downvotes: 0,
    });
  }

  const { data, error } = await getSupabaseClient().rpc(
    "get_public_community_data",
    {
      p_post_ids: postIds,
      p_include_posts: true,
      p_include_comments: false,
    },
  );

  if (error) {
    throw error;
  }

  const posts = (
    data as {
      posts?: Array<{
        id: string;
        upvotes: number;
        downvotes: number;
      }>;
    } | null
  )?.posts ?? [];

  for (const post of posts) {
    if (!totals.has(post.id)) {
      continue;
    }

    totals.set(post.id, {
      upvotes: post.upvotes,
      downvotes: post.downvotes,
    });
  }

  return totals;
}

async function voteStates(
  postIds: string[],
  userId: string,
  userSupabase: ReturnType<typeof getSupabaseClientForAccessToken>,
) {
  if (postIds.length === 0) {
    return [];
  }

  const [{ data: ownVotes, error: ownVotesError }, totals] =
    await Promise.all([
      userSupabase
        .from("community_post_votes")
        .select("post_id, vote_type")
        .eq("user_id", userId)
        .in("post_id", postIds),

      voteCounts(postIds),
    ]);

  if (ownVotesError) {
    throw ownVotesError;
  }

  const ownVoteByPost = new Map(
    (ownVotes ?? []).map((vote) => [
      vote.post_id,
      vote.vote_type,
    ]),
  );

  return postIds.map((postId) => ({
    post_id: postId,
    vote_type: ownVoteByPost.get(postId) ?? null,
    upvotes: totals.get(postId)?.upvotes ?? 0,
    downvotes: totals.get(postId)?.downvotes ?? 0,
  }));
}

/*
|--------------------------------------------------------------------------
| GET COMMUNITY POSTS
|--------------------------------------------------------------------------
|
| scope=feed:
|   Returns only public posts.
|
| scope=mine:
|   Returns only the authenticated user's own posts.
|   This includes the user's hidden posts.
|
| The server enforces the visibility rules. The frontend does not determine
| whether a hidden post can be retrieved.
|
*/

router.get(
  "/posts",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = res.locals.user as { id: string };

      const scope =
        typeof req.query.scope === "string"
          ? req.query.scope
          : "feed";

      if (scope !== "feed" && scope !== "mine") {
        res.status(400).json({
          success: false,
          message: "Invalid Community post scope.",
        });
        return;
      }

      const supabase = getSupabaseClientForAccessToken(
        res.locals.accessToken as string,
      );

      let query = supabase
        .from("community_posts")
        .select(postFields)
        .order("created_at", { ascending: false })
        .limit(100);

      if (scope === "feed") {
        query = query.eq("is_hidden", false);
      } else {
        query = query.eq("author_id", user.id);
      }

      const { data, error } = await query;

      if (error) {
        sendDatabaseError(res, error);
        return;
      }

      const posts = await addAdminAuthorMarkers(data ?? []);

      const totals = await voteCounts(
        posts.map((post) => post.id),
      );

      res.json({
        success: true,
        posts: posts.map((post) => ({
          ...post,
          transport_type: post.transport_types?.name ?? null,
          comment_count:
            post.community_post_comments?.[0]?.count ?? 0,
          upvotes:
            totals.get(post.id)?.upvotes ?? 0,
          downvotes:
            totals.get(post.id)?.downvotes ?? 0,
          transport_types: undefined,
          community_post_comments: undefined,
        })),
      });
    } catch (error: unknown) {
      sendDatabaseError(res, {
        message:
          error instanceof Error
            ? error.message
            : "Unknown database error",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| GET COMMUNITY POST PHOTOS
|--------------------------------------------------------------------------
|
| Public visitor:
|   Can retrieve photos only when the post is publicly visible.
|
| Authenticated visitor:
|   Uses the supplied access token and RLS to determine whether the user
|   can access the post's photos.
|
| This allows the author to view their own hidden post photos while
| preventing unrelated users from accessing hidden-post photos.
|
| The service-role client is used only to download the photo after
| visibility has already been checked.
|
*/

router.get(
  "/posts/:postId/photos/:photoIndex",
  async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");

    if (!isCommunityPostId(req.params.postId)) {
      res.status(400).json({
        success: false,
        message: "Invalid post ID.",
      });
      return;
    }

    const photoIndex = parsePhotoIndex(req.params.photoIndex);

    if (photoIndex === null) {
      res.status(400).json({
        success: false,
        message: "Invalid photo index.",
      });
      return;
    }

    try {
      const accessToken = getBearerToken(req);

      let photoPaths: unknown = null;

      if (accessToken !== null) {
        if (!accessToken) {
          res.status(401).json({
            success: false,
            message: "Invalid authorization header.",
          });
          return;
        }

        /*
         * Authenticated photo request.
         *
         * This query uses the user's access token, not the service-role
         * client. RLS determines whether the user can see the post.
         */
        const userSupabase =
          getSupabaseClientForAccessToken(accessToken);

        const { data: post, error } = await userSupabase
          .from("community_posts")
          .select("photo_paths")
          .eq("id", req.params.postId)
          .maybeSingle();

        if (error) {
          if (
            error.code === "PGRST116" ||
            error.code === "42501"
          ) {
            sendPhotoNotFound(res);
            return;
          }

          if (
            error.message.toLowerCase().includes("jwt") ||
            error.message.toLowerCase().includes("token")
          ) {
            res.status(401).json({
              success: false,
              message: "Your session is invalid or expired.",
            });
            return;
          }

          sendDatabaseError(res, error);
          return;
        }

        if (!post) {
          sendPhotoNotFound(res);
          return;
        }

        photoPaths = post.photo_paths;
      } else {
        /*
         * Public photo request.
         *
         * The public RPC excludes hidden posts. Therefore, a hidden post
         * cannot be used to retrieve its photo without authorized access.
         */
        const { data, error } = await getSupabaseClient().rpc(
          "get_public_community_data",
          {
            p_post_ids: [req.params.postId],
            p_include_posts: true,
            p_include_comments: false,
          },
        );

        if (error) {
          sendDatabaseError(res, error);
          return;
        }

        const posts = (
          data as {
            posts?: unknown;
          } | null
        )?.posts;

        const post = Array.isArray(posts)
          ? posts.find(
              (item) =>
                item &&
                typeof item === "object" &&
                (item as { id?: unknown }).id ===
                  req.params.postId,
            )
          : null;

        if (!post) {
          sendPhotoNotFound(res);
          return;
        }

        photoPaths = (
          post as { photo_paths?: unknown }
        ).photo_paths;
      }

      const photoPath = resolvePhotoPath(
        photoPaths,
        photoIndex,
      );

      if (!photoPath) {
        sendPhotoNotFound(res);
        return;
      }

      /*
       * Only download after the visibility check above succeeds.
       */
      const photo = await downloadCommunityPhoto(
        getSupabaseAdminClient(),
        photoPath,
      );

      sendCommunityPhoto(
        res,
        photo.bytes,
        photo.contentType,
      );
    } catch (error: unknown) {
      sendDatabaseError(res, {
        message:
          error instanceof Error
            ? error.message
            : "Unknown database error",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| REPORT COMMUNITY POSTS, COMMENTS, AND AUTHORS
|--------------------------------------------------------------------------
|
| Targets are read through the registered user's RLS-scoped client and all
| author/content fields are derived from those visible rows.
|
*/

router.post(
  "/posts/:postId/reports",
  requireAuth,
  requireCommunityWriter,
  async (req: Request, res: Response) => {
    if (!isCommunityPostId(req.params.postId)) {
      res.status(400).json({
        success: false,
        message: "Invalid post ID.",
      });
      return;
    }

    const user = res.locals.user as { id: string };
    const parsed = parseCommunityReportInput(req.body);

    if (parsed.error) {
      res.status(400).json({
        success: false,
        message: parsed.error,
      });
      return;
    }
    if (parsed.data.targetType !== "post" && parsed.data.targetType !== "user") {
      res.status(400).json({
        success: false,
        message: "This target type is not valid for a Community post.",
      });
      return;
    }

    const userSupabase = res.locals.communitySupabase as ReturnType<
      typeof getSupabaseClientForAccessToken
    >;

    try {
      const { data: post, error: postError } =
        await userSupabase
          .from("community_posts")
          .select(
            "author_id, author_display_name, content, is_hidden",
          )
          .eq("id", req.params.postId)
          .maybeSingle();

      if (postError) {
        sendDatabaseError(res, postError);
        return;
      }

      if (!post) {
        res.status(404).json({
          success: false,
          message: "Post not found.",
        });
        return;
      }

      if (post.is_hidden === true) {
        res.status(404).json({
          success: false,
          message: "Post not found.",
        });
        return;
      }

      if (
        typeof post.author_id !== "string" ||
        typeof post.author_display_name !== "string" ||
        typeof post.content !== "string"
      ) {
        sendDatabaseError(res, {
          message:
            "Community post returned incomplete report details.",
        });
        return;
      }

      await submitCommunityReport(res, userSupabase, user.id, parsed.data, {
        postId: req.params.postId,
        commentId: null,
        authorId: post.author_id,
        authorName: post.author_display_name,
        content: post.content,
      });
    } catch (error: unknown) {
      sendDatabaseError(res, {
        message:
          error instanceof Error
            ? error.message
            : "Unknown database error",
        ...(error &&
        typeof error === "object" &&
        "code" in error
          ? { code: String(error.code) }
          : {}),
      });
    }
  },
);

router.post(
  "/comments/:commentId/reports",
  requireAuth,
  requireCommunityWriter,
  async (req: Request, res: Response) => {
    if (!isCommunityPostId(req.params.commentId)) {
      res.status(400).json({
        success: false,
        message: "Invalid comment ID.",
      });
      return;
    }

    const parsed = parseCommunityReportInput(req.body);
    if (parsed.error) {
      res.status(400).json({
        success: false,
        message: parsed.error,
      });
      return;
    }
    if (parsed.data.targetType !== "comment" && parsed.data.targetType !== "user") {
      res.status(400).json({
        success: false,
        message: "This target type is not valid for a Community comment.",
      });
      return;
    }

    const user = res.locals.user as { id: string };
    const userSupabase = res.locals.communitySupabase as ReturnType<
      typeof getSupabaseClientForAccessToken
    >;

    try {
      const { data: comment, error: commentError } = await userSupabase
        .from("community_post_comments")
        .select("id, post_id, author_id, author_display_name, content")
        .eq("id", req.params.commentId)
        .maybeSingle();

      if (commentError) {
        sendDatabaseError(res, commentError);
        return;
      }
      if (!comment) {
        res.status(404).json({
          success: false,
          message: "Comment not found.",
        });
        return;
      }
      if (
        typeof comment.post_id !== "string" ||
        typeof comment.author_id !== "string" ||
        typeof comment.author_display_name !== "string" ||
        typeof comment.content !== "string"
      ) {
        sendDatabaseError(res, {
          message: "Community comment returned incomplete report details.",
        });
        return;
      }

      const { data: visiblePost, error: postError } = await userSupabase
        .from("community_posts")
        .select("id")
        .eq("id", comment.post_id)
        .eq("is_hidden", false)
        .maybeSingle();

      if (postError) {
        sendDatabaseError(res, postError);
        return;
      }
      if (!visiblePost) {
        res.status(404).json({
          success: false,
          message: "Comment not found.",
        });
        return;
      }

      await submitCommunityReport(res, userSupabase, user.id, parsed.data, {
        postId: comment.post_id,
        commentId: req.params.commentId,
        authorId: comment.author_id,
        authorName: comment.author_display_name,
        content: comment.content,
      });
    } catch (error: unknown) {
      sendDatabaseError(res, {
        message:
          error instanceof Error ? error.message : "Unknown database error",
        ...(error && typeof error === "object" && "code" in error
          ? { code: String(error.code) }
          : {}),
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| GET SINGLE COMMUNITY POST
|--------------------------------------------------------------------------
*/

router.get(
  "/posts/:postId",
  requireAuth,
  async (req: Request, res: Response) => {
    if (!isCommunityPostId(req.params.postId)) {
      res.status(400).json({
        success: false,
        message: "Invalid post ID.",
      });
      return;
    }

    try {
      const supabase = getSupabaseClientForAccessToken(
        res.locals.accessToken as string,
      );

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
        res.status(404).json({
          success: false,
          message: "Post not found.",
        });
        return;
      }

      const [
        { data: comments, error: commentsError },
        totals,
      ] = await Promise.all([
        supabase
          .from("community_post_comments")
          .select(
            "id, author_id, author_display_name, content, created_at",
          )
          .eq("post_id", post.id)
          .order("created_at", { ascending: false }),

        voteCounts([post.id]),
      ]);

      if (commentsError) {
        sendDatabaseError(res, commentsError);
        return;
      }

      const [postWithRole] = await addAdminAuthorMarkers([post]);
      const commentsWithRoles = await addAdminAuthorMarkers(comments ?? []);

      res.json({
        success: true,
        post: {
          ...postWithRole,
          transport_type:
            postWithRole.transport_types?.name ?? null,
          comment_count: commentsWithRoles.length,
          upvotes:
            totals.get(post.id)?.upvotes ?? 0,
          downvotes:
            totals.get(post.id)?.downvotes ?? 0,
          transport_types: undefined,
          community_post_comments: undefined,
        },
        comments: commentsWithRoles,
      });
    } catch (error: unknown) {
      sendDatabaseError(res, {
        message:
          error instanceof Error
            ? error.message
            : "Unknown database error",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| GET COMMENTS FOR MULTIPLE POSTS
|--------------------------------------------------------------------------
*/

router.get(
  "/comments",
  requireAuth,
  async (req: Request, res: Response) => {
    const rawPostIds = req.query.postIds;

    const postIds =
      typeof rawPostIds === "string"
        ? [...new Set(rawPostIds.split(","))]
        : [];

    if (
      postIds.length < 1 ||
      postIds.length > 100 ||
      postIds.some(
        (postId) => !isCommunityPostId(postId),
      )
    ) {
      res.status(400).json({
        success: false,
        message:
          "Provide between 1 and 100 valid post IDs.",
      });
      return;
    }

    try {
      const supabase = getSupabaseClientForAccessToken(
        res.locals.accessToken as string,
      );

      const { data, error } = await supabase
        .from("community_post_comments")
        .select(
          "id, post_id, author_id, author_display_name, content, created_at",
        )
        .in("post_id", postIds)
        .order("created_at", { ascending: false });

      if (error) {
        sendDatabaseError(res, error);
        return;
      }

      res.json({
        success: true,
        comments: await addAdminAuthorMarkers(data ?? []),
      });
    } catch (error: unknown) {
      sendDatabaseError(res, {
        message:
          error instanceof Error
            ? error.message
            : "Unknown database error",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| GET CURRENT USER'S VOTES
|--------------------------------------------------------------------------
*/

router.get(
  "/votes/me",
  requireAuth,
  async (_req: Request, res: Response) => {
    const user = res.locals.user as {
      id: string;
    };

    const token = res.locals.accessToken as string;

    const { data, error } =
      await getSupabaseClientForAccessToken(token)
        .from("community_post_votes")
        .select("post_id, vote_type")
        .eq("user_id", user.id);

    if (error) {
      sendDatabaseError(res, error);
      return;
    }

    res.json({
      success: true,
      votes: data ?? [],
    });
  },
);

/*
|--------------------------------------------------------------------------
| GET VOTE STATES
|--------------------------------------------------------------------------
*/

router.get(
  "/votes/state",
  requireAuth,
  async (req: Request, res: Response) => {
    const rawPostIds = req.query.postIds;

    const postIds =
      typeof rawPostIds === "string"
        ? [...new Set(rawPostIds.split(","))]
        : [];

    if (
      postIds.length < 1 ||
      postIds.length > 100 ||
      postIds.some(
        (postId) => !isCommunityPostId(postId),
      )
    ) {
      res.status(400).json({
        success: false,
        message:
          "Provide between 1 and 100 valid post IDs.",
      });
      return;
    }

    const user = res.locals.user as {
      id: string;
    };

    const token = res.locals.accessToken as string;

    try {
      const states = await voteStates(
        postIds,
        user.id,
        getSupabaseClientForAccessToken(token),
      );

      res.json({
        success: true,
        states,
      });
    } catch (error: unknown) {
      sendDatabaseError(res, {
        message:
          error instanceof Error
            ? error.message
            : "Unknown database error",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| CREATE COMMUNITY POST
|--------------------------------------------------------------------------
*/

router.post(
  "/posts",
  requireAuth,
  requireCommunityWriter,
  async (req: Request, res: Response) => {
    const parsed = parseCommunityPostInput(req.body);

    if (parsed.error) {
      res.status(400).json({
        success: false,
        message: parsed.error,
      });
      return;
    }

    const user = res.locals.user as {
      id: string;
    };

    const supabase =
      res.locals.communitySupabase as ReturnType<
        typeof getSupabaseClientForAccessToken
      >;

    /*
     * Verify that every uploaded photo belongs to the current user.
     */
    for (const photoPath of parsed.data.photoPaths) {
      const [ownerId, fileName, extraPath] =
        photoPath.split("/");

      if (
        ownerId !== user.id ||
        !fileName ||
        extraPath
      ) {
        res.status(400).json({
          success: false,
          message:
            "A photo attachment is not owned by this account.",
        });
        return;
      }

      const { data: files, error: storageError } =
        await supabase.storage
          .from(communityPhotoBucket)
          .list(ownerId, {
            limit: 10,
            search: fileName,
          });

      if (storageError) {
        sendDatabaseError(res, storageError);
        return;
      }

      if (
        !files?.some(
          (file) => file.name === fileName,
        )
      ) {
        res.status(400).json({
          success: false,
          message:
            "A photo attachment could not be verified.",
        });
        return;
      }
    }

    /*
     * Validate the selected transportation type.
     */
    if (parsed.data.transportTypeId !== null) {
      const {
        data: transportType,
        error: transportTypeError,
      } = await supabase
        .from("transport_types")
        .select("id")
        .eq("id", parsed.data.transportTypeId)
        .maybeSingle();

      if (transportTypeError) {
        sendDatabaseError(
          res,
          transportTypeError,
        );
        return;
      }

      if (!transportType) {
        res.status(400).json({
          success: false,
          message:
            "Transportation type was not found.",
        });
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
        start_latitude:
          parsed.data.start.latitude,
        start_longitude:
          parsed.data.start.longitude,
        destination_name:
          parsed.data.destination.name,
        destination_latitude:
          parsed.data.destination.latitude,
        destination_longitude:
          parsed.data.destination.longitude,
        transport_type_id:
          parsed.data.transportTypeId,
        photo_paths: parsed.data.photoPaths,
      })
      .select(
        "id, author_id, author_display_name, title, content, start_name, start_latitude, start_longitude, destination_name, destination_latitude, destination_longitude, transport_type_id, photo_paths, created_at, transport_types(name)",
      )
      .single();

    if (error) {
      sendDatabaseError(res, error);
      return;
    }

    res.status(201).json({
      success: true,
      post: {
        ...data,
        author_is_admin: res.locals.communityRole === "admin",
        transport_type:
          data.transport_types?.name ?? null,
        comment_count: 0,
        upvotes: 0,
        downvotes: 0,
        transport_types: undefined,
      },
    });
  },
);

/*
|--------------------------------------------------------------------------
| VOTE ON COMMUNITY POST
|--------------------------------------------------------------------------
*/

router.post(
  "/posts/:postId/vote",
  requireAuth,
  requireCommunityWriter,
  async (req: Request, res: Response) => {
    if (!isCommunityPostId(req.params.postId)) {
      res.status(400).json({
        success: false,
        message: "Invalid post ID.",
      });
      return;
    }

    const parsed = parseCommunityVoteInput(req.body);

    if (parsed.error) {
      res.status(400).json({
        success: false,
        message: parsed.error,
      });
      return;
    }

    const user = res.locals.user as {
      id: string;
    };

    const supabase =
      res.locals.communitySupabase as ReturnType<
        typeof getSupabaseClientForAccessToken
      >;

    try {
      await upsertCommunityVote(
        supabase,
        req.params.postId,
        parsed.data,
      );

      const [state] = await voteStates(
        [req.params.postId],
        user.id,
        supabase,
      );

      res.json({
        success: true,
        ...state,
      });
    } catch (error: unknown) {
      sendDatabaseError(res, {
        message:
          error instanceof Error
            ? error.message
            : "Unknown database error",
        ...(error &&
        typeof error === "object" &&
        "code" in error
          ? { code: String(error.code) }
          : {}),
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| REMOVE CURRENT USER'S VOTE
|--------------------------------------------------------------------------
|
| The database DELETE policy remains responsible for allowing a user
| to remove their own existing vote, including on a hidden post.
|
*/

router.delete(
  "/posts/:postId/vote",
  requireAuth,
  requireCommunityWriter,
  async (req: Request, res: Response) => {
    if (!isCommunityPostId(req.params.postId)) {
      res.status(400).json({
        success: false,
        message: "Invalid post ID.",
      });
      return;
    }

    const user = res.locals.user as {
      id: string;
    };

    const supabase =
      res.locals.communitySupabase as ReturnType<
        typeof getSupabaseClientForAccessToken
      >;

    try {
      const { error } = await supabase
        .from("community_post_votes")
        .delete()
        .eq("post_id", req.params.postId)
        .eq("user_id", user.id);

      if (error) {
        throw error;
      }

      const [state] = await voteStates(
        [req.params.postId],
        user.id,
        supabase,
      );

      res.json({
        success: true,
        ...state,
      });
    } catch (error: unknown) {
      sendDatabaseError(res, {
        message:
          error instanceof Error
            ? error.message
            : "Unknown database error",
        ...(error &&
        typeof error === "object" &&
        "code" in error
          ? { code: String(error.code) }
          : {}),
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| CREATE COMMUNITY COMMENT
|--------------------------------------------------------------------------
|
| The database INSERT policy prevents commenting on hidden posts.
|
*/

router.post(
  "/posts/:postId/comments",
  requireAuth,
  requireCommunityWriter,
  async (req: Request, res: Response) => {
    if (!isCommunityPostId(req.params.postId)) {
      res.status(400).json({
        success: false,
        message: "Invalid post ID.",
      });
      return;
    }

    const parsed = parseCommunityCommentInput(req.body);

    if (parsed.error) {
      res.status(400).json({
        success: false,
        message: parsed.error,
      });
      return;
    }

    const user = res.locals.user as {
      id: string;
    };

    const supabase =
      res.locals.communitySupabase as ReturnType<
        typeof getSupabaseClientForAccessToken
      >;

    const { data, error } = await supabase
      .from("community_post_comments")
      .insert({
        post_id: req.params.postId,
        author_id: user.id,
        content: parsed.data,
      })
      .select(
        "id, post_id, author_id, author_display_name, content, created_at",
      )
      .single();

    if (error) {
      sendDatabaseError(res, error);
      return;
    }

    res.status(201).json({
      success: true,
      comment: {
        ...data,
        author_is_admin: res.locals.communityRole === "admin",
      },
    });
  },
);

export default router;