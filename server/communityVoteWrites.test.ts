import { describe, expect, it, vi } from "vitest";
import { upsertCommunityVote } from "./communityVoteWrites.ts";

describe("upsertCommunityVote", () => {
  it("calls the atomic invoker function with only the post and validated vote", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const client = { rpc } as never;

    await upsertCommunityVote(client, "post-1", "downvote");

    expect(rpc).toHaveBeenCalledWith("set_community_vote", {
      p_post_id: "post-1",
      p_vote_type: "downvote",
    });
  });

  it("surfaces database and RLS errors without retrying under another identity", async () => {
    const error = { code: "42501", message: "row violates row-level security policy" };
    const rpc = vi.fn().mockResolvedValue({ error });

    await expect(
      upsertCommunityVote({ rpc } as never, "post-1", "upvote"),
    ).rejects.toBe(error);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
