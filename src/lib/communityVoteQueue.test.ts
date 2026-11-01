import { describe, expect, it } from "vitest";
import { createCommunityVoteMutationQueue } from "./communityVoteQueue.ts";

describe("community vote mutation queue", () => {
  it("runs rapid mutations for one post in click order", async () => {
    const queue = createCommunityVoteMutationQueue();
    const completed: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = queue.run("post-1", async () => {
      await firstGate;
      completed.push("upvote");
    });
    const second = queue.run("post-1", async () => {
      completed.push("downvote");
    });

    expect(completed).toEqual([]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(completed).toEqual(["upvote", "downvote"]);
  });

  it("does not serialize unrelated posts", async () => {
    const queue = createCommunityVoteMutationQueue();
    const completed: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = queue.run("post-1", async () => {
      await firstGate;
      completed.push("post-1");
    });
    await queue.run("post-2", async () => { completed.push("post-2"); });

    expect(completed).toEqual(["post-2"]);
    releaseFirst();
    await first;
    expect(completed).toEqual(["post-2", "post-1"]);
  });
});
