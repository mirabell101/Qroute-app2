export function createCommunityVoteMutationQueue() {
  const pendingByPost = new Map<string, Promise<unknown>>();

  return {
    run<T>(postId: string, operation: () => Promise<T>): Promise<T> {
      const previous = pendingByPost.get(postId) ?? Promise.resolve();
      const current = previous.catch(() => undefined).then(operation);
      pendingByPost.set(postId, current);

      const clear = () => {
        if (pendingByPost.get(postId) === current) pendingByPost.delete(postId);
      };
      void current.then(clear, clear);
      return current;
    },

    async waitFor(postIds: string[]): Promise<void> {
      await Promise.all(postIds.map((postId) => pendingByPost.get(postId)?.catch(() => undefined)));
    },
  };
}
