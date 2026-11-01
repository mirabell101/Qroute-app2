import type { CommunityComment, CommunityVoteState } from "./community";

export function mergeCommunityCommentRows(
  ...groups: CommunityComment[][]
): CommunityComment[] {
  const byId = new Map<string, CommunityComment>();
  for (const group of groups) {
    for (const comment of group) byId.set(comment.id, comment);
  }
  return [...byId.values()].sort((left, right) =>
    left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id),
  );
}

export function selectCurrentCommunityVoteStates(
  states: CommunityVoteState[],
  expectedRevisions: Map<string, number>,
  currentRevisions: Map<string, number>,
): CommunityVoteState[] {
  return states.filter((state) =>
    currentRevisions.get(state.post_id) === expectedRevisions.get(state.post_id),
  );
}
