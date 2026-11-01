import { describe, expect, it } from "vitest";
import {
  mergeCommunityCommentRows,
  selectCurrentCommunityVoteStates,
} from "./communityRealtimeState.ts";

describe("mergeCommunityCommentRows", () => {
  it("deduplicates matching API and Broadcast comments and sorts by creation time", () => {
    const fromApi = {
      id: "comment-1",
      post_id: "post-1",
      author_id: "user-1",
      author_display_name: "Member",
      content: "Saved comment",
      created_at: "2026-10-31T10:00:00.000Z",
    };
    const fromBroadcast = {
      id: "comment-1",
      post_id: "post-1",
      author_display_name: "Member",
      content: "Saved comment",
      created_at: "2026-10-31T10:00:00.000Z",
    };
    const earlier = { ...fromApi, id: "comment-0", created_at: "2026-10-31T09:59:00.000Z" };

    expect(mergeCommunityCommentRows([fromBroadcast], [earlier, fromApi])).toEqual([
      earlier,
      fromApi,
    ]);
  });
});

describe("selectCurrentCommunityVoteStates", () => {
  it("ignores a vote-state response after a newer action or notification", () => {
    const state = {
      post_id: "post-1",
      vote_type: "upvote" as const,
      upvotes: 8,
      downvotes: 2,
    };

    expect(selectCurrentCommunityVoteStates(
      [state],
      new Map([["post-1", 4]]),
      new Map([["post-1", 5]]),
    )).toEqual([]);
  });
});
