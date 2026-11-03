import type { SupabaseClient } from "@supabase/supabase-js";

export type CommunityVoteType = "upvote" | "downvote";

export async function upsertCommunityVote(
  supabase: SupabaseClient,
  postId: string,
  voteType: CommunityVoteType,
): Promise<void> {
  const { error } = await supabase.rpc("set_community_vote", {
    p_post_id: postId,
    p_vote_type: voteType,
  });

  if (error) throw error;
}
