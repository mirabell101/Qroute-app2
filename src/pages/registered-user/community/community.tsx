import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  Car,
  Home as HomeIcon,
  ImagePlus,
  MapPin,
  MessageSquare,
  Plus,
  Send,
  ThumbsDown,
  ThumbsUp,
  UserCircle,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";
import { CommunityPostMap } from "@/components/map/CommunityPostMap";
import {
  createCommunityComment,
  createCommunityPost,
  getCommunityAccess,
  getCommunityComments,
  getCommunityPost,
  getCommunityPosts,
  getMyCommunityVotes,
  getCommunityVoteStates,
  removeCommunityVote,
  removeCommunityPostPhotos,
  setCommunityVote,
  uploadCommunityPostPhotos,
} from "@/lib/community";
import { supabase } from "@/lib/supabase";
import { createCommunityVoteMutationQueue } from "@/lib/communityVoteQueue";
import {
  mergeCommunityCommentRows,
  selectCurrentCommunityVoteStates,
} from "@/lib/communityRealtimeState";
import type {
  CommunityComment,
  CommunityPoint,
  CommunityPost,
  CommunityVoteType,
} from "@/lib/community";
import {
  getTransitCatalog,
  getTransportOptions,
} from "@/lib/contributions";
import { validateImage } from "@/lib/mapImages";
import type {
  ExistingPoint,
  TransportTypeOption,
} from "@/lib/contributions";

interface CommunityProps {
  currentUserId: string | null;
  onLogout: () => void;
}

type FeedFilter = "Public Feed" | "My Posts";
type Target = "start" | "destination";
type PendingPhoto = { file: File; name: string; dataUrl: string };

const MAX_PHOTOS = 5;

const navItems = [
  { label: "Recents", icon: HomeIcon, path: "/home" },
  { label: "Saved", icon: MapPin, path: "/saved" },
  { label: "Your Contribution", icon: Car, path: "/contribution" },
  { label: "Community", icon: MessageSquare, path: "/community" },
];

const formatDate = (value: string) =>
  new Date(value).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });

export default function Community({
  currentUserId,
  onLogout,
}: CommunityProps) {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const postsRef = useRef(posts);
  const [votes, setVotes] = useState<Record<string, CommunityVoteType>>({});
  const [votesUserId, setVotesUserId] = useState<string | null>(null);
  const [communityAccessUserId, setCommunityAccessUserId] = useState<string | null>(null);
  const [hasRegisteredRole, setHasRegisteredRole] = useState(false);
  const [canReceiveRealtime, setCanReceiveRealtime] = useState(false);
  const [locations, setLocations] = useState<ExistingPoint[]>([]);
  const [transportTypes, setTransportTypes] = useState<TransportTypeOption[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("Public Feed");
  const [comments, setComments] = useState<Record<string, CommunityComment[]>>({});
  const commentsRef = useRef(comments);
  const [commentsOpen, setCommentsOpen] = useState<Record<string, boolean>>({});
  const commentsOpenRef = useRef(commentsOpen);
  const [commentsLoading, setCommentsLoading] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [hasLoadedInitialPosts, setHasLoadedInitialPosts] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loginPrompt, setLoginPrompt] = useState("");
  const [profileMenu, setProfileMenu] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [transportTypeId, setTransportTypeId] = useState<number | null>(null);
  const [start, setStart] = useState<CommunityPoint | null>(null);
  const [destination, setDestination] = useState<CommunityPoint | null>(null);
  const [activeTarget, setActiveTarget] = useState<Target | null>("start");
  const [startSearch, setStartSearch] = useState("");
  const [destinationSearch, setDestinationSearch] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState<PendingPhoto[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const voteMutationQueueRef = useRef(createCommunityVoteMutationQueue());
  const voteRevisionRef = useRef(new Map<string, number>());
  const requestedVotesRef = useRef<Record<string, CommunityVoteType | null>>({});
  const seenCommentIdsRef = useRef(new Map<string, Set<string>>());
  const pendingCommentsRef = useRef(new Map<string, CommunityComment[]>());
  const commentRevisionRef = useRef(new Map<string, number>());
  const isRegisteredUser = Boolean(
    currentUserId && currentUserId === communityAccessUserId && hasRegisteredRole,
  );

  const getVoteRevision = useCallback((postId: string) => voteRevisionRef.current.get(postId) ?? 0, []);
  const advanceVoteRevision = useCallback((postId: string) => {
    const next = getVoteRevision(postId) + 1;
    voteRevisionRef.current.set(postId, next);
    return next;
  }, [getVoteRevision]);

  useEffect(() => { postsRef.current = posts; }, [posts]);
  useEffect(() => { commentsRef.current = comments; }, [comments]);
  useEffect(() => { commentsOpenRef.current = commentsOpen; }, [commentsOpen]);

  const applyVoteStates = useCallback((
    states: Awaited<ReturnType<typeof getCommunityVoteStates>>,
    expectedRevisions?: Map<string, number>,
  ) => {
    const accepted = expectedRevisions === undefined
      ? states
      : selectCurrentCommunityVoteStates(states, expectedRevisions, voteRevisionRef.current);
    if (!accepted.length) return;

    for (const state of accepted) {
      if (state.vote_type) requestedVotesRef.current[state.post_id] = state.vote_type;
      else delete requestedVotesRef.current[state.post_id];
    }
    setPosts((previous) => previous.map((post) => {
      const state = accepted.find((item) => item.post_id === post.id);
      return state
        ? { ...post, upvotes: state.upvotes, downvotes: state.downvotes }
        : post;
    }));
    setVotes((previous) => {
      const next = { ...previous };
      for (const state of accepted) {
        if (state.vote_type) next[state.post_id] = state.vote_type;
        else delete next[state.post_id];
      }
      return next;
    });
    if (currentUserId) setVotesUserId(currentUserId);
  }, [currentUserId]);

  const mergeCommunityComments = useCallback((postId: string, incoming: CommunityComment[]) => {
    const seen = seenCommentIdsRef.current.get(postId) ?? new Set<string>();
    const pending = pendingCommentsRef.current.get(postId) ?? [];
    const existing = commentsRef.current[postId] ?? [];
    for (const comment of [...existing, ...pending, ...incoming]) {
      seen.add(comment.id);
    }
    seenCommentIdsRef.current.set(postId, seen);
    pendingCommentsRef.current.delete(postId);
    const merged = mergeCommunityCommentRows(existing, pending, incoming);
    commentsRef.current = { ...commentsRef.current, [postId]: merged };
    setComments((previous) => ({ ...previous, [postId]: merged }));
  }, []);

  const addCommunityCommentOnce = useCallback((comment: CommunityComment) => {
    const seen = seenCommentIdsRef.current.get(comment.post_id) ?? new Set<string>();
    if (seen.has(comment.id)) return;
    seen.add(comment.id);
    seenCommentIdsRef.current.set(comment.post_id, seen);
    commentRevisionRef.current.set(
      comment.post_id,
      (commentRevisionRef.current.get(comment.post_id) ?? 0) + 1,
    );

    if (Object.prototype.hasOwnProperty.call(commentsRef.current, comment.post_id)) {
      commentsRef.current = {
        ...commentsRef.current,
        [comment.post_id]: mergeCommunityCommentRows(
          commentsRef.current[comment.post_id] ?? [],
          [comment],
        ),
      };
      setComments((previous) => {
        const current = previous[comment.post_id] ?? [];
        if (current.some((item) => item.id === comment.id)) return previous;
        return {
          ...previous,
          [comment.post_id]: [...current, comment].sort((left, right) =>
            left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id),
          ),
        };
      });
    } else {
      const pending = pendingCommentsRef.current.get(comment.post_id) ?? [];
      pendingCommentsRef.current.set(comment.post_id, [...pending, comment]);
    }
    setPosts((previous) => previous.map((post) =>
      post.id === comment.post_id
        ? { ...post, comment_count: post.comment_count + 1 }
        : post,
    ));
  }, []);

  const reloadPosts = async () => {
    setLoading(true);
    setError("");
    try {
      const nextPosts = await getCommunityPosts();
      setPosts(nextPosts);
      setSelectedPostId((current) =>
        current && nextPosts.some((post) => post.id === current)
          ? current
          : nextPosts[0]?.id ?? null,
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load community posts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void getCommunityPosts()
      .then((nextPosts) => {
        if (!active) return;
        setPosts(nextPosts);
        setSelectedPostId(nextPosts[0]?.id ?? null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load community posts.");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setHasLoadedInitialPosts(true);
        }
      });
    void getTransitCatalog()
      .then((catalog) => { if (active) setLocations(catalog.points); })
      .catch(() => { if (active) setNotice("Transit point search is unavailable. You can still select locations on the map."); });
    void getTransportOptions()
      .then((options) => { if (active) setTransportTypes(options.types); })
      .catch(() => { if (active) setNotice("Transportation types could not be loaded; you can leave that field empty."); });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!currentUserId) return;
    void getCommunityAccess(currentUserId)
      .then((access) => {
        if (active) {
          setCommunityAccessUserId(currentUserId);
          setHasRegisteredRole(access.canPublishAndVote);
          setCanReceiveRealtime(access.canReceiveRealtime);
        }
      })
      .catch(() => {
        if (active) {
          setCommunityAccessUserId(currentUserId);
          setHasRegisteredRole(false);
          setCanReceiveRealtime(false);
        }
      });
    return () => { active = false; };
  }, [currentUserId]);

  useEffect(() => {
    let active = true;
    if (!currentUserId) {
      return;
    }
    const voteRevisions = new Map(
      postsRef.current.map((post) => [post.id, getVoteRevision(post.id)]),
    );
    void getMyCommunityVotes()
      .then((rows) => {
        if (active) {
          const votesByPost = new Map(rows.map((row) => [row.post_id, row.vote_type]));
          const unchangedPostIds = [...new Set([
            ...postsRef.current.map((post) => post.id),
            ...rows.map((row) => row.post_id),
          ])].filter((postId) =>
            getVoteRevision(postId) === (voteRevisions.get(postId) ?? 0),
          );
          for (const postId of unchangedPostIds) {
            const vote = votesByPost.get(postId);
            if (vote) requestedVotesRef.current[postId] = vote;
            else delete requestedVotesRef.current[postId];
          }
          setVotes((previous) => {
            const next = { ...previous };
            for (const postId of unchangedPostIds) {
              const vote = votesByPost.get(postId);
              if (vote) next[postId] = vote;
              else delete next[postId];
            }
            return next;
          });
          setVotesUserId(currentUserId);
        }
      })
      .catch(() => {
        if (active) {
          setVotesUserId(currentUserId);
        }
      });
    return () => {
      active = false;
    };
  }, [currentUserId, getVoteRevision]);

  useEffect(() => {
    if (
      !currentUserId ||
      !canReceiveRealtime ||
      communityAccessUserId !== currentUserId ||
      !hasLoadedInitialPosts
    ) return;
    let active = true;
    let hasSubscribed = false;
    let voteRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingVotePostIds = new Set<string>();

    const reconcileAfterConnection = async () => {
      const startingPosts = postsRef.current;
      const voteRevisions = new Map(startingPosts.map((post) => [post.id, getVoteRevision(post.id)]));
      const commentRevisions = new Map(startingPosts.map((post) => [
        post.id,
        commentRevisionRef.current.get(post.id) ?? 0,
      ]));
      const openPostIds = Object.keys(commentsOpenRef.current)
        .filter((postId) => commentsOpenRef.current[postId]);
      const [freshPosts, ownVotes, freshComments] = await Promise.all([
        getCommunityPosts(),
        getMyCommunityVotes(),
        getCommunityComments(openPostIds),
      ]);
      if (!active) return;

      setPosts((previous) => freshPosts.map((freshPost) => {
        const previousPost = previous.find((post) => post.id === freshPost.id);
        const voteUnchanged = getVoteRevision(freshPost.id) === (voteRevisions.get(freshPost.id) ?? 0);
        const commentUnchanged = (commentRevisionRef.current.get(freshPost.id) ?? 0) ===
          (commentRevisions.get(freshPost.id) ?? 0);
        return {
          ...freshPost,
          upvotes: voteUnchanged ? freshPost.upvotes : previousPost?.upvotes ?? freshPost.upvotes,
          downvotes: voteUnchanged ? freshPost.downvotes : previousPost?.downvotes ?? freshPost.downvotes,
          comment_count: commentUnchanged
            ? freshPost.comment_count
            : previousPost?.comment_count ?? freshPost.comment_count,
        };
      }));
      setSelectedPostId((current) =>
        current && freshPosts.some((post) => post.id === current)
          ? current
          : freshPosts[0]?.id ?? null,
      );

      const votesByPost = new Map(ownVotes.map((vote) => [vote.post_id, vote.vote_type]));
      const unchangedPostIds = freshPosts
        .filter((post) => getVoteRevision(post.id) === (voteRevisions.get(post.id) ?? 0))
        .map((post) => post.id);
      for (const postId of unchangedPostIds) {
        const vote = votesByPost.get(postId);
        if (vote) requestedVotesRef.current[postId] = vote;
        else delete requestedVotesRef.current[postId];
      }
      setVotes((previous) => {
        const next = { ...previous };
        for (const postId of unchangedPostIds) {
          const vote = votesByPost.get(postId);
          if (vote) next[postId] = vote;
          else delete next[postId];
        }
        return next;
      });
      setVotesUserId(currentUserId);
      for (const postId of openPostIds) {
        mergeCommunityComments(postId, freshComments.filter((comment) => comment.post_id === postId));
      }
    };

    const flushVoteRefresh = async () => {
      voteRefreshTimer = null;
      const postIds = [...pendingVotePostIds];
      pendingVotePostIds.clear();
      if (!postIds.length) return;
      await voteMutationQueueRef.current.waitFor(postIds);
      if (!active) return;
      const revisions = new Map(postIds.map((postId) => [postId, getVoteRevision(postId)]));
      try {
        const states = await getCommunityVoteStates(postIds);
        if (active) applyVoteStates(states, revisions);
      } catch (refreshError) {
        console.warn("Could not refresh Community vote totals:", refreshError);
      }
    };

    const channel = supabase.channel("community:feed", { config: { private: true } });
    channel
      .on("broadcast", { event: "vote_changed" }, ({ payload }) => {
        const postId = typeof payload?.post_id === "string" ? payload.post_id : "";
        if (!postId || !postsRef.current.some((post) => post.id === postId)) return;
        advanceVoteRevision(postId);
        pendingVotePostIds.add(postId);
        if (voteRefreshTimer) clearTimeout(voteRefreshTimer);
        voteRefreshTimer = setTimeout(() => { void flushVoteRefresh(); }, 120);
      })
      .on("broadcast", { event: "comment_created" }, ({ payload }) => {
        if (
          typeof payload?.id !== "string" ||
          typeof payload?.post_id !== "string" ||
          typeof payload?.author_display_name !== "string" ||
          typeof payload?.content !== "string" ||
          typeof payload?.created_at !== "string"
        ) return;
        addCommunityCommentOnce({
          id: payload.id,
          post_id: payload.post_id,
          author_display_name: payload.author_display_name,
          content: payload.content,
          created_at: payload.created_at,
        });
      });

    const handleChannelStatus = (status: string) => {
      if (!active) return;
      if (status === "SUBSCRIBED") {
        hasSubscribed = true;
        setNotice((current) => current === "Live updates are reconnecting…" ? "" : current);
        void reconcileAfterConnection().catch((syncError: unknown) => {
          console.warn("Could not resync Community after reconnect:", syncError);
        });
      } else if (hasSubscribed && (status === "CHANNEL_ERROR" || status === "TIMED_OUT")) {
        setNotice("Live updates are reconnecting…");
      }
    };

    const connect = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active || sessionError || data.session?.user.id !== currentUserId) return;
      await supabase.realtime.setAuth(data.session.access_token);
      if (active) channel.subscribe(handleChannelStatus);
    };
    void connect().catch((connectionError: unknown) => {
      console.warn("Could not authorize Community realtime:", connectionError);
    });

    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        void reconcileAfterConnection().catch((syncError: unknown) => {
          console.warn("Could not refresh Community after returning to the page:", syncError);
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      active = false;
      if (voteRefreshTimer) clearTimeout(voteRefreshTimer);
      document.removeEventListener("visibilitychange", handleVisible);
      void supabase.removeChannel(channel);
    };
  }, [
    currentUserId,
    canReceiveRealtime,
    communityAccessUserId,
    hasLoadedInitialPosts,
    applyVoteStates,
    mergeCommunityComments,
    addCommunityCommentOnce,
    advanceVoteRevision,
    getVoteRevision,
  ]);

  const visiblePosts = useMemo(
    () =>
      feedFilter === "My Posts"
        ? posts.filter((post) => post.author_id === currentUserId)
        : posts,
    [feedFilter, posts, currentUserId],
  );
  const selectedPost = visiblePosts.find((post) => post.id === selectedPostId)
    ?? visiblePosts[0]
    ?? null;

  const filteredLocations = (query: string) => {
    const normalized = query.trim().toLowerCase();
    return locations
      .filter((point) =>
        transportTypeId === null ||
        point.transportTypeId === null ||
        point.transportTypeId === transportTypeId,
      )
      .filter((point) => !normalized || point.name.toLowerCase().includes(normalized))
      .slice(0, 6);
  };

  const promptLogin = () => {
    setLoginPrompt("Sign in with a registered QRoute account to participate in the Community.");
  };

  const chooseLocation = (target: Target, point: ExistingPoint) => {
    const nextPoint = {
      name: point.name,
      latitude: point.latitude,
      longitude: point.longitude,
    };
    if (target === "start") setStart(nextPoint);
    else setDestination(nextPoint);
    setActiveTarget(target === "start" ? "destination" : null);
    if (target === "start") setStartSearch("");
    else setDestinationSearch("");
  };

  const handleMapPick = (coordinates: [number, number]) => {
    if (!activeTarget) return;
    const [latitude, longitude] = coordinates;
    const point = {
      name: `Map point ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      latitude,
      longitude,
    };
    if (activeTarget === "start") setStart(point);
    else setDestination(point);
    setActiveTarget(activeTarget === "start" ? "destination" : null);
  };

  const resetComposer = () => {
    setTitle("");
    setContent("");
    setTransportTypeId(null);
    setStart(null);
    setDestination(null);
    setActiveTarget("start");
    setStartSearch("");
    setDestinationSearch("");
    setSelectedPhotos([]);
  };

  const handlePhotoSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    const remaining = MAX_PHOTOS - selectedPhotos.length;
    const nextFiles = selectedFiles.slice(0, remaining);
    if (selectedFiles.length > remaining) {
      setError(`You can attach up to ${MAX_PHOTOS} photos per post.`);
    }
    try {
      const nextPhotos = await Promise.all(nextFiles.map(async (file) => {
        const validationError = validateImage(file);
        if (validationError) throw new Error(validationError);
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("Unable to preview this photo."));
          reader.onerror = () => reject(new Error("Unable to preview this photo."));
          reader.readAsDataURL(file);
        });
        return { file, name: file.name, dataUrl };
      }));
      setSelectedPhotos((previous) => [...previous, ...nextPhotos].slice(0, MAX_PHOTOS));
      setError("");
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "Unable to read a photo.");
    } finally {
      event.target.value = "";
    }
  };

  const submitPost = async () => {
    if (!currentUserId || !isRegisteredUser) {
      if (currentUserId) {
        setError("A registered-user account is required to publish community posts.");
        return;
      }
      promptLogin();
      return;
    }
    if (!title.trim() || !content.trim() || !start || !destination) {
      setError("Add a title, description, starting point, and destination.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    let uploadedPhotoPaths: string[] = [];
    try {
      uploadedPhotoPaths = await uploadCommunityPostPhotos(selectedPhotos.map((photo) => photo.file));
      const created = await createCommunityPost({
        title: title.trim(),
        content: content.trim(),
        start,
        destination,
        transportTypeId,
        photoPaths: uploadedPhotoPaths,
      });
      setPosts((previous) => [created, ...previous]);
      setSelectedPostId(created.id);
      setShowCreatePost(false);
      resetComposer();
      setNotice("Your post is now public.");
    } catch (submitError) {
      if (uploadedPhotoPaths.length) {
        await removeCommunityPostPhotos(uploadedPhotoPaths).catch(() => undefined);
      }
      setError(submitError instanceof Error ? submitError.message : "Unable to publish your post.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const reactToPost = (post: CommunityPost, type: CommunityVoteType) => {
    if (!currentUserId || !isRegisteredUser) {
      if (currentUserId) {
        setError("A registered-user account is required to vote.");
        return;
      }
      promptLogin();
      return;
    }
    setError("");
    const currentVote = Object.prototype.hasOwnProperty.call(requestedVotesRef.current, post.id)
      ? requestedVotesRef.current[post.id]
      : votesUserId === currentUserId ? votes[post.id] ?? null : null;
    const nextVote = currentVote === type ? null : type;
    requestedVotesRef.current[post.id] = nextVote;
    const revision = advanceVoteRevision(post.id);
    setVotesUserId(currentUserId);
    setVotes((previous) => {
      const next = { ...previous };
      if (nextVote) next[post.id] = nextVote;
      else delete next[post.id];
      return next;
    });

    void voteMutationQueueRef.current.run(post.id, async () => {
      try {
        const savedState = nextVote
          ? await setCommunityVote(post.id, nextVote)
          : await removeCommunityVote(post.id);
        applyVoteStates([savedState], new Map([[post.id, revision]]));
      } catch (voteError) {
        if (getVoteRevision(post.id) === revision) {
          try {
            const [savedState] = await getCommunityVoteStates([post.id]);
            if (savedState) applyVoteStates([savedState], new Map([[post.id, revision]]));
          } catch {
            setError(voteError instanceof Error ? voteError.message : "Unable to save your vote.");
          }
        }
      }
    });
  };

  const toggleComments = async (postId: string) => {
    const opening = !commentsOpenRef.current[postId];
    const nextOpen = { ...commentsOpenRef.current, [postId]: opening };
    commentsOpenRef.current = nextOpen;
    setCommentsOpen(nextOpen);
    if (!opening || comments[postId]) return;
    setCommentsLoading((previous) => ({ ...previous, [postId]: true }));
    try {
      const detail = await getCommunityPost(postId);
      mergeCommunityComments(postId, detail.comments);
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : "Unable to load comments.");
    } finally {
      setCommentsLoading((previous) => ({ ...previous, [postId]: false }));
    }
  };

  const submitComment = async (postId: string) => {
    if (!currentUserId || !isRegisteredUser) {
      if (currentUserId) {
        setError("A registered-user account is required to comment.");
        return;
      }
      promptLogin();
      return;
    }
    const text = (commentDrafts[postId] ?? "").trim();
    if (!text) return;
    try {
      const created = await createCommunityComment(postId, text);
      addCommunityCommentOnce(created);
      setCommentDrafts((previous) => ({ ...previous, [postId]: "" }));
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : "Unable to submit your comment.");
    }
  };

  const locationPicker = (target: Target, value: CommunityPoint | null, query: string) => {
    const setQuery = target === "start" ? setStartSearch : setDestinationSearch;
    const results = filteredLocations(query);
    return (
      <div className="relative rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {target === "start" ? "Starting point" : "Destination"}
            </p>
            <p className="mt-1 text-sm font-medium text-gray-800">
              {value?.name ?? "Choose a transit point or map location"}
            </p>
            {value && (
              <p className="text-xs text-gray-500">
                {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setActiveTarget(activeTarget === target ? null : target)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold ${activeTarget === target ? "bg-[#12395A] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            {activeTarget === target ? "Click the map" : "Choose on map"}
          </button>
        </div>
        <label className="mt-3 block text-xs font-medium text-gray-600">
          Search existing approved points
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search terminal or stop"
            className="mt-1 h-9 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-[#12395A]"
          />
        </label>
        {query && (
          <div className="absolute inset-x-3 top-[116px] z-[1000] max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {results.length ? results.map((point) => (
              <button
                type="button"
                key={`${point.kind}-${point.id}`}
                onClick={() => chooseLocation(target, point)}
                className="block w-full border-b border-gray-100 px-3 py-2 text-left hover:bg-blue-50"
              >
                <span className="block text-sm font-medium text-gray-800">{point.name}</span>
                <span className="text-xs text-gray-500">{point.kind === "terminal" ? "Terminal" : point.stopType === "train_station" ? "Station" : "Stop"}</span>
              </button>
            )) : <p className="px-3 py-3 text-sm text-gray-500">No matching approved points.</p>}
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="relative min-h-screen bg-[#f7f7f7] text-gray-900">
      <aside className="fixed inset-y-0 left-0 z-[2000] flex w-[64px] flex-col border-r border-white/10 bg-[#0f2a47] text-white sm:w-[72px] lg:w-[250px]">
        <button type="button" onClick={() => navigate("/")} title="Home" className="mx-auto mt-7 flex h-[75px] w-full items-center justify-center px-2 hover:bg-white/10 lg:px-5">
          <img src={qrouteWhiteLogo} alt="QRoute" className="max-h-full max-w-full object-contain" />
        </button>
        <nav className="mt-8 flex flex-col gap-1.5 px-2 lg:px-3">
          {navItems.map(({ label, icon: Icon, path }) => (
            <button
              key={label}
              type="button"
              onClick={() => label === "Community" ? navigate(path) : currentUserId ? navigate(path) : promptLogin()}
              title={label}
              className={`group flex h-[46px] w-full items-center justify-center rounded-xl px-2 text-left lg:justify-start lg:px-3 ${label === "Community" ? "bg-[#d9dee3] font-semibold text-[#0f2a47]" : "font-medium text-white hover:bg-white/15"}`}
            >
              <Icon size={19} className="lg:mr-3" /><span className="hidden lg:inline">{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="ml-[64px] min-h-screen sm:ml-[72px] lg:ml-[250px]">
        <header className="fixed left-[64px] right-0 top-0 z-[1500] flex h-[86px] items-center justify-between border-b border-gray-200 bg-white px-3 shadow-sm sm:left-[72px] sm:px-5 lg:left-[250px]">
          <div>
            <h1 className="text-xl font-bold text-[#12395A]">QRoute Community</h1>
            <p className="text-xs text-gray-500">Share commute questions and local experiences.</p>
          </div>
          <div className="relative flex items-center gap-3">
            <Bell size={19} className="text-gray-500" />
            <button type="button" onClick={() => setProfileMenu((open) => !open)} aria-label="Profile menu" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8eef3] text-[#12395A]">
              <UserCircle size={23} />
            </button>
            {profileMenu && (
              <div className="absolute right-0 top-12 z-[3000] w-36 rounded-xl bg-white p-2 shadow-lg">
                {currentUserId ? <>
                  <button type="button" onClick={() => navigate("/profile")} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100">Account</button>
                  <button type="button" onClick={() => { void onLogout(); navigate("/"); }} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100">Log out</button>
                </> : <button type="button" onClick={() => navigate("/login")} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100">Sign in</button>}
              </div>
            )}
          </div>
        </header>

        <div className="mx-auto max-w-[1050px] px-5 pb-10 pt-[106px]">
          <section className="min-w-0">
            <button
              type="button"
              onClick={() => currentUserId && isRegisteredUser ? setShowCreatePost(true) : currentUserId ? setError("A registered-user account is required to publish community posts.") : promptLogin()}
              className="group flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm transition hover:bg-gray-50 hover:shadow-md"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#12395A] text-white"><Plus size={21} /></span>
              <span><strong className="block text-sm">Create a community post</strong><small className="text-gray-500">Ask a question or share a commute experience</small></span>
            </button>

            <div className="mt-5 flex gap-2">
              {(["Public Feed", "My Posts"] as FeedFilter[]).map((filter) => (
                <button key={filter} type="button" onClick={() => {
                  if (filter === "My Posts" && !currentUserId) { promptLogin(); return; }
                  setFeedFilter(filter);
                }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${feedFilter === filter ? "bg-[#12395A] text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-100"}`}>
                  {filter}
                </button>
              ))}
              <button type="button" onClick={() => void reloadPosts()} aria-label="Refresh posts" className="ml-auto rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-600 hover:bg-gray-100">Refresh</button>
            </div>

            {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            {notice && <p role="status" className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
            {loading ? <p role="status" className="mt-6 rounded-xl bg-white p-8 text-center text-sm text-gray-500">Loading community posts…</p> : (
              <div className="mt-4 space-y-3">
                {visiblePosts.map((post) => (
                  <article key={post.id} className={`rounded-xl border bg-white p-4 shadow-sm ${selectedPost?.id === post.id ? "border-[#12395A] ring-1 ring-[#12395A]/15" : "border-gray-200"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e8eef3] text-[#12395A]"><UserCircle size={22} /></span>
                        <div className="min-w-0"><p className="truncate text-sm font-semibold">{post.author_display_name}</p><p className="text-xs text-gray-500">{formatDate(post.created_at)}</p></div>
                      </div>
                      <button type="button" onClick={() => setSelectedPostId(post.id)} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#12395A] hover:bg-blue-50">View map</button>
                    </div>
                    <button type="button" onClick={() => setSelectedPostId(post.id)} className="mt-3 block w-full text-left">
                      <h2 className="text-base font-bold text-gray-900">{post.title}</h2>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700">{post.content}</p>
                    </button>
                    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-[#f4f8fb] px-3 py-2 text-xs text-gray-700">
                      <span className="font-semibold">{post.start_name}</span><ArrowRight size={14} /><span className="font-semibold">{post.destination_name}</span>
                      {post.transport_type && <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-[#12395A]">{post.transport_type}</span>}
                    </div>
                    {post.photos.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {post.photos.map((photo) => (
                          <a key={photo.path} href={photo.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-gray-200">
                            <img src={photo.url} alt={`Photo attached to ${post.title}`} loading="lazy" className="h-32 w-full object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                    {selectedPost?.id === post.id && (
                      <div className="mt-3">
                        <CommunityPostMap
                          start={{ name: post.start_name, latitude: post.start_latitude, longitude: post.start_longitude }}
                          destination={{ name: post.destination_name, latitude: post.destination_latitude, longitude: post.destination_longitude }}
                          transportType={post.transport_type ?? ""}
                          routeColor={transportTypes.find((type) => type.id === post.transport_type_id)?.color ?? "#2563eb"}
                          height="h-[300px]"
                        />
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
                          <p><strong>Start</strong><br />{post.start_name}</p>
                          <p><strong>Destination</strong><br />{post.destination_name}</p>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">The line visualizes submitted locations and does not necessarily show a transit route.</p>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
                      <button type="button" onClick={() => void reactToPost(post, "upvote")} aria-pressed={currentUserId === votesUserId && votes[post.id] === "upvote"} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm ${currentUserId === votesUserId && votes[post.id] === "upvote" ? "bg-green-50 text-green-700" : "text-gray-600 hover:bg-gray-100"}`}><ThumbsUp size={16} />{post.upvotes}</button>
                      <button type="button" onClick={() => void reactToPost(post, "downvote")} aria-pressed={currentUserId === votesUserId && votes[post.id] === "downvote"} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm ${currentUserId === votesUserId && votes[post.id] === "downvote" ? "bg-red-50 text-red-700" : "text-gray-600 hover:bg-gray-100"}`}><ThumbsDown size={16} />{post.downvotes}</button>
                      <button type="button" onClick={() => void toggleComments(post.id)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-100"><MessageSquare size={16} />{post.comment_count} Comments</button>
                    </div>

                    {commentsOpen[post.id] && (
                      <div className="mt-2 space-y-2 border-t border-gray-100 pt-3">
                        {commentsLoading[post.id] && <p role="status" className="text-sm text-gray-500">Loading comments…</p>}
                        {(comments[post.id] ?? []).map((comment) => <div key={comment.id} className="rounded-lg bg-gray-50 px-3 py-2"><div className="flex justify-between gap-3"><strong className="text-xs">{comment.author_display_name}</strong><time className="text-[11px] text-gray-500">{formatDate(comment.created_at)}</time></div><p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">{comment.content}</p></div>)}
                        {!commentsLoading[post.id] && (comments[post.id]?.length ?? 0) === 0 && <p className="text-sm text-gray-500">No comments yet.</p>}
                        {currentUserId && isRegisteredUser ? <div className="flex gap-2"><input maxLength={1000} value={commentDrafts[post.id] ?? ""} onChange={(event) => setCommentDrafts((previous) => ({ ...previous, [post.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") void submitComment(post.id); }} placeholder="Write a comment…" className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#12395A]" /><button type="button" onClick={() => void submitComment(post.id)} aria-label="Send comment" className="rounded-lg bg-[#12395A] px-3 text-white"><Send size={16} /></button></div> : <button type="button" onClick={currentUserId ? () => setError("A registered-user account is required to comment.") : promptLogin} className="text-sm font-medium text-[#12395A] underline">{currentUserId ? "Registered users can comment" : "Sign in to comment"}</button>}
                      </div>
                    )}
                  </article>
                ))}
                {!visiblePosts.length && <div className="rounded-xl border border-gray-200 bg-white px-6 py-14 text-center"><MessageSquare size={28} className="mx-auto text-gray-400" /><p className="mt-3 font-semibold">{feedFilter === "My Posts" ? "You haven’t published a post yet." : "No community posts yet."}</p><p className="mt-1 text-sm text-gray-500">Posts from QRoute members appear here as soon as they are published.</p></div>}
              </div>
            )}
          </section>

        </div>
      </div>

      {showCreatePost && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/50 p-3 sm:p-6" onClick={() => setShowCreatePost(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="community-create-title" onClick={(event) => event.stopPropagation()} className="max-h-[94vh] w-full max-w-[900px] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="community-create-title" className="text-xl font-bold text-[#12395A]">Create a public post</h2><p className="mt-1 text-sm text-gray-500">Your post will be visible as soon as you publish it.</p></div><button type="button" onClick={() => setShowCreatePost(false)} aria-label="Close" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X size={20} /></button></div>
            {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-4">
                <label className="block text-sm font-medium">Title<input maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 outline-none focus:border-[#12395A]" placeholder="What should commuters know?" /></label>
                <label className="block text-sm font-medium">Description<textarea maxLength={5000} rows={5} value={content} onChange={(event) => setContent(event.target.value)} className="mt-1 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-[#12395A]" placeholder="Share your question or experience…" /></label>
                <div>
                  <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => void handlePhotoSelection(event)} />
                  <button type="button" onClick={() => photoInputRef.current?.click()} disabled={selectedPhotos.length >= MAX_PHOTOS} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    <ImagePlus size={17} /> Add photos ({selectedPhotos.length}/{MAX_PHOTOS})
                  </button>
                  {selectedPhotos.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {selectedPhotos.map((photo, index) => (
                        <div key={`${photo.name}-${index}`} className="relative overflow-hidden rounded-lg border border-gray-200">
                          <img src={photo.dataUrl} alt={`Preview of ${photo.name}`} className="h-24 w-full object-cover" />
                          <button type="button" aria-label={`Remove ${photo.name}`} onClick={() => setSelectedPhotos((previous) => previous.filter((_, photoIndex) => photoIndex !== index))} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-gray-700 shadow"><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-500">JPEG, PNG, or WebP, up to 5 MB each. Up to five photos.</p>
                </div>
                <label className="block text-sm font-medium">Transportation type (optional)<select value={transportTypeId ?? ""} onChange={(event) => setTransportTypeId(event.target.value ? Number(event.target.value) : null)} className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3"><option value="">Any / not specified</option>{transportTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
                {locationPicker("start", start, startSearch)}
                {locationPicker("destination", destination, destinationSearch)}
              </div>
              <div><p className="mb-2 text-sm font-medium text-gray-700">Choose {activeTarget === "destination" ? "destination" : "starting point"} by searching or clicking the map.</p><CommunityPostMap start={start} destination={destination} activeTarget={activeTarget} existingPoints={locations.filter((point) => transportTypeId === null || point.transportTypeId === null || point.transportTypeId === transportTypeId)} onMapPick={handleMapPick} onExistingPointPick={(point) => activeTarget && chooseLocation(activeTarget, point)} transportType={transportTypes.find((type) => type.id === transportTypeId)?.name ?? ""} routeColor={transportTypes.find((type) => type.id === transportTypeId)?.color ?? "#2563eb"} height="h-[300px]" /><p className="mt-2 text-xs text-gray-500">Select a start or destination above, then click any map location. The line only visualizes your selected points.</p></div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => { setShowCreatePost(false); resetComposer(); }} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button><button type="button" disabled={isSubmitting} onClick={() => void submitPost()} className="rounded-lg bg-[#12395A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1b4b6f] disabled:opacity-50">{isSubmitting ? "Publishing…" : "Publish post"}</button></div>
          </section>
        </div>
      )}

      {loginPrompt && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/45 p-4" onClick={() => setLoginPrompt("")}>
          <section role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}><h2 className="text-lg font-semibold text-[#12395A]">Sign in to participate</h2><p className="mt-2 text-sm text-gray-600">{loginPrompt}</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setLoginPrompt("")} className="rounded-lg border border-gray-200 px-4 py-2 text-sm">Close</button><button type="button" onClick={() => navigate("/login")} className="rounded-lg bg-[#12395A] px-4 py-2 text-sm font-semibold text-white">Sign in</button></div></section>
        </div>
      )}
    </main>
  );
}
