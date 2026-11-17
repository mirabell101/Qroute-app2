export type PostVisibility = "Visible" | "Hidden";

export interface PostVisibilityRecord {
  id: string;
  is_hidden: boolean;
}

export interface PostManagementPost extends PostVisibilityRecord {
  author_display_name: string;
  title: string;
  content: string;
  start_name: string;
  destination_name: string;
  transport_type: string | null;
}

export interface PostManagementFilters {
  searchTerm: string;
  transportFilter: string;
  statusFilter: "All" | PostVisibility;
}

export function getPostVisibility(post: {
  is_hidden?: boolean;
}): PostVisibility {
  return post.is_hidden === true ? "Hidden" : "Visible";
}

export function applyPostVisibility<T extends PostVisibilityRecord>(
  posts: T[],
  postId: string,
  isHidden: boolean,
): T[] {
  return posts.map((post) =>
    post.id === postId ? { ...post, is_hidden: isHidden } : post,
  );
}

export function filterCommunityPosts<T extends PostManagementPost>(
  posts: T[],
  filters: PostManagementFilters,
): T[] {
  const search = filters.searchTerm.toLowerCase().trim();

  return posts.filter((post) => {
    const route = `${post.start_name} ${post.destination_name}`;
    const matchesSearch = [
      route,
      post.author_display_name,
      post.title,
      post.content,
      post.transport_type ?? "Unknown",
    ].some((value) => value.toLowerCase().includes(search));

    const transportType = post.transport_type ?? "Unknown";
    const matchesTransport =
      filters.transportFilter === "All" ||
      transportType === filters.transportFilter;
    const matchesStatus =
      filters.statusFilter === "All" ||
      getPostVisibility(post) === filters.statusFilter;

    return matchesSearch && matchesTransport && matchesStatus;
  });
}
