import type { CommunityComment, CommunityVoteState } from "./community";

export function mergeCommunityCommentRows(
  ...groups: CommunityComment[][]
): CommunityComment[] {
  const byId = new Map<string, CommunityComment>();

  for (const group of groups) {
    for (const comment of group) byId.set(comment.id, comment);
  }

  return [...byId.values()].sort(
    (left, right) =>
      right.created_at.localeCompare(left.created_at) ||
      right.id.localeCompare(left.id),
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
