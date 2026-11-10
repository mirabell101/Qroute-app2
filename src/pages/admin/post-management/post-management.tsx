import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccountProfile } from "@/components/account/accountProfileStore";
import { getCommunityPosts, type CommunityPost } from "@/lib/community";
import { deleteAdminCommunityPost } from "@/lib/adminApi";
import { getAdminNavigationDestination } from "@/pages/admin/adminNavigation";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  Route as RouteIcon,
  FileText,
  Flag,
  Users,
  Settings,
  Search,
  MapPinned,
  Menu,
  X,
} from "lucide-react";

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Route Management", icon: RouteIcon },
  {
    label: "Post Management",
    icon: FileText,
  },
  { label: "Reports", icon: Flag },
  { label: "User Management", icon: Users },
  { label: "Settings", icon: Settings },
];

function formatPostDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString();
}

export default function PostManagement() {
  const navigate = useNavigate();
  const { userId } = useAccountProfile();

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [transportFilter, setTransportFilter] = useState("All");
  const [selectedPost, setSelectedPost] =
    useState<CommunityPost | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeletePost = async (postId: string) => {
    if (!userId) return;
    setIsDeleting(true);
    try {
      await deleteAdminCommunityPost(userId, postId);
      setPosts((current) => current.filter((post) => post.id !== postId));
      setSelectedPost(null);
    } catch (error) {
      console.warn("Could not delete community post:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    let active = true;

    const loadPosts = async () => {
      if (!userId) {
        throw new Error("The active admin account could not be verified.");
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);
      if (sessionData.session?.user.id !== userId) {
        throw new Error("The active account changed. Please try again.");
      }

      return getCommunityPosts();
    };

    void loadPosts()
      .then((data) => {
        if (active) {
          setPosts(data);
          setErrorMessage(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setPosts([]);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load community posts.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [retryCount, userId]);

  const transportFilters = useMemo(
    () => [
      "All",
      ...new Set(
        posts
          .map((post) => post.transport_type ?? "Unknown")
          .filter(Boolean),
      ),
    ],
    [posts],
  );

  const filteredPosts = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();

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
        transportFilter === "All" || transportType === transportFilter;

      return matchesSearch && matchesTransport;
    });
  }, [posts, searchTerm, transportFilter]);

  return (
    <div className="min-h-screen bg-[#F4F8FC] text-slate-800">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col bg-[#102E4D] text-white transition-transform duration-200 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[105px] items-center border-b border-white/10 px-7">
          <div>
             <img
                src="/White%20Qroute%20Logo.png"
                alt="QRoute Logo"
                className="h-auto w-[150px] object-contain"
              />
            <p className="mt-0.5 text-xs tracking-wide text-blue-200">
              ADMINISTRATION
            </p>
          </div>
        </div>

        <div className="px-5 pt-8">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[2px] text-slate-400">
            Main Menu
          </p>

          <nav className="space-y-1.5">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active = item.label === "Post Management";
              const destination = getAdminNavigationDestination(item.label);

              return (
                <button
                  key={item.label}
                  type="button"
                  disabled={!destination}
                  title={
                    destination
                      ? undefined
                      : `${item.label} is unavailable in the current system.`
                  }
                  onClick={() => {
                    setSidebarOpen(false);
                    if (destination) navigate(destination);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                    active
                      ? "bg-[#CFD5DB] font-semibold text-[#102E4D]"
                      : destination
                        ? "text-slate-200 hover:bg-white/10 hover:text-white"
                        : "cursor-not-allowed text-slate-400"
                  }`}
                >
                  <Icon size={19} strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {!destination && (
                    <span className="ml-auto text-[10px]">Unavailable</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-5">
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-200 text-[#102E4D]">
                <Users size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold">Admin Panel</p>
                <p className="text-xs text-slate-300">System management</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const destination =
                getAdminNavigationDestination("Preview of the System");
              if (destination) navigate(destination);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
          >
            <MapPinned size={17} />
            Preview of the System
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="min-h-screen md:ml-[250px]">
        {/* Header */}
        <header className="sticky top-0 z-20 flex min-h-[86px] items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#102E4D] text-white md:hidden"
            >
              <Menu size={21} />
            </button>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-[#102E4D] sm:text-2xl">
                Post Management
              </h2>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                Review and manage community posts
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#DCE9F7] font-bold text-[#102E4D]">
              A
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Admin</p>
              <p className="text-xs text-slate-500">Administrator</p>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
          {/* Page title */}
          <section className="mb-7">


            <h3 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
              Community Posts
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Review posts returned by the community service. Moderation is
              unavailable because the existing API has no moderation actions.
            </p>
          </section>

          {/* Search */}
          <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm focus-within:border-[#102E4D] focus-within:ring-2 focus-within:ring-blue-100">
              <Search size={18} className="shrink-0 text-slate-500" />

              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search post, user, route, or transport..."
                aria-label="Search posts, users or routes"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />

              {searchTerm && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchTerm("")}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X size={17} />
                </button>
              )}
            </div>
          </section>

          {/* Transport filters */}
          <section className="mb-7 flex flex-wrap gap-2.5">
            {transportFilters.map((type) => {
              const active = transportFilter === type;

              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTransportFilter(type)}
                  className={`min-w-[70px] rounded-full border px-5 py-2.5 text-sm font-medium shadow-sm transition ${
                    active
                      ? "border-[#102E4D] bg-[#102E4D] text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-[#102E4D] hover:text-[#102E4D]"
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </section>

          {/* Posts table */}
          <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_3px_14px_rgba(15,23,42,0.035)]">
            <div className="flex flex-col gap-1 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h4 className="font-bold text-slate-900">Community Posts</h4>
                <p className="mt-1 text-xs text-slate-500">
                  {posts.length} posts loaded from the community service.
                </p>
              </div>
              <span className="text-xs font-medium text-slate-500">
                {filteredPosts.length}{" "}
                {filteredPosts.length === 1 ? "post" : "posts"} found
              </span>
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
                <thead className="bg-[#DFEAF4] text-xs text-slate-700">
                  <tr>
                    <th className="px-4 py-4 font-semibold">Type</th>
                    <th className="px-4 py-4 font-semibold">Route</th>
                    <th className="px-4 py-4 font-semibold">Author</th>
                    <th className="px-4 py-4 font-semibold">Post</th>
                    <th className="px-4 py-4 font-semibold">Submitted</th>
                    <th className="px-4 py-4 font-semibold">Responses</th>
                    <th className="px-4 py-4 text-center font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredPosts.map((post) => (
                    <tr
                      key={post.id}
                      className="transition hover:bg-[#F8FAFD]"
                    >
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#102E4D]">
                          {post.transport_type ?? "Unknown"}
                        </span>
                      </td>

                      <td className="max-w-[180px] px-4 py-4 font-medium text-slate-700">
                        {post.start_name} → {post.destination_name}
                      </td>

                      <td className="px-4 py-4 text-slate-600">
                        {post.author_display_name}
                      </td>

                      <td className="max-w-[210px] px-4 py-4">
                        <p className="truncate text-slate-600" title={post.title}>
                          {post.title}
                        </p>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-slate-500">
                        {formatPostDate(post.created_at)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                        {post.comment_count} comments · {post.upvotes} upvotes ·{" "}
                        {post.downvotes} downvotes
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedPost(post)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-[#102E4D] hover:bg-blue-50 hover:text-[#102E4D]"
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredPosts.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                          <Search size={22} />
                        </div>
                        <p className="mt-3 font-semibold text-slate-700">
                          {isLoading
                            ? "Loading community posts..."
                            : errorMessage
                              ? "Community posts could not be loaded"
                              : posts.length === 0
                                ? "No community posts are available"
                                : "No posts found"}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {errorMessage ??
                            (isLoading
                              ? "Loading post records from the server."
                              : posts.length === 0
                                ? "The community service returned no posts."
                                : "Try changing your search or transport filter.")}
                        </p>
                        {errorMessage ? (
                          <button
                            type="button"
                            onClick={() => {
                              setErrorMessage(null);
                              setIsLoading(true);
                              setRetryCount((count) => count + 1);
                            }}
                            className="mt-4 rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white"
                          >
                            Retry
                          </button>
                        ) : (
                          (searchTerm || transportFilter !== "All") && (
                            <button
                              type="button"
                              onClick={() => {
                                setSearchTerm("");
                                setTransportFilter("All");
                              }}
                              className="mt-4 text-sm font-semibold text-[#102E4D] underline underline-offset-4"
                            >
                              Clear filters
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
              <p className="text-xs text-slate-400">
                QRoute Community Post Management
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* View post modal */}
      {selectedPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setSelectedPost(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="post-modal-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="post-modal-title"
                  className="text-xl font-bold text-[#102E4D]"
                >
                  Post Details
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Review the selected community post.
                </p>
              </div>

              <button
                type="button"
                aria-label="Close post details"
                onClick={() => setSelectedPost(null)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Author
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {selectedPost.author_display_name}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Title
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {selectedPost.title}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Post content
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {selectedPost.content}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-[#F4F8FC] p-4">
                  <p className="text-xs text-slate-500">Transport</p>
                  <p className="mt-1 font-semibold text-[#102E4D]">
                    {selectedPost.transport_type ?? "Unknown"}
                  </p>
                </div>

                <div className="rounded-xl bg-[#F4F8FC] p-4">
                  <p className="text-xs text-slate-500">Submitted</p>
                  <p className="mt-1 font-semibold text-[#102E4D]">
                    {formatPostDate(selectedPost.created_at)}
                  </p>
                </div>

                <div className="rounded-xl bg-[#F4F8FC] p-4">
                  <p className="text-xs text-slate-500">Route</p>
                  <p className="mt-1 text-sm font-semibold text-[#102E4D]">
                    {selectedPost.start_name} → {selectedPost.destination_name}
                  </p>
                </div>

                <div className="rounded-xl bg-[#F4F8FC] p-4">
                  <p className="text-xs text-slate-500">Comments</p>
                  <p className="mt-1 text-sm font-semibold text-[#102E4D]">
                    {selectedPost.comment_count}
                  </p>
                </div>
              </div>

              <p className="border-t border-slate-100 pt-4 text-sm text-slate-600">
                {selectedPost.upvotes} upvotes · {selectedPost.downvotes}{" "}
                downvotes
              </p>

              {selectedPost.photos.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {selectedPost.photos.map((photo) => (
                    <img
                      key={photo.path}
                      src={photo.url}
                      alt=""
                      className="h-36 w-full rounded-lg object-cover"
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSelectedPost(null)}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleDeletePost(selectedPost.id)}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete Post"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
