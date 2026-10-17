
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  ChevronDown,
  Eye,
  EyeOff,
  X,
} from "lucide-react";

type TransportType = "Jeep" | "Bus" | "Train";
type PostStatus = "Visible" | "Hidden";

type CommunityPost = {
  id: number;
  type: TransportType;
  route: string;
  username: string;
  post: string;
  date: string;
  fare: number;
  reports: number;
  status: PostStatus;
};

const initialPosts: CommunityPost[] = [
  {
    id: 1,
    type: "Jeep",
    route: "Cubao - Fairview",
    username: "sample_user1",
    post: "Fare update for today's commute",
    date: "Oct 15, 2026",
    fare: 13,
    reports: 0,
    status: "Visible",
  },
  {
    id: 2,
    type: "Bus",
    route: "SM North - PITX",
    username: "commuter02",
    post: "Bus fare and route information",
    date: "Oct 14, 2026",
    fare: 25,
    reports: 2,
    status: "Visible",
  },
  {
    id: 3,
    type: "Jeep",
    route: "Philcoa - Katipunan",
    username: "qroute_member",
    post: "Updated jeepney fare information",
    date: "Oct 13, 2026",
    fare: 15,
    reports: 1,
    status: "Hidden",
  },
  {
    id: 4,
    type: "Train",
    route: "North Avenue - Taft Avenue",
    username: "sample_user4",
    post: "Train commute information",
    date: "Oct 12, 2026",
    fare: 30,
    reports: 0,
    status: "Visible",
  },
];

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/admin/dashboard" },
  { label: "Route Management", icon: RouteIcon, path: "/admin/routes" },
  {
    label: "Post Management",
    icon: FileText,
    path: "/admin/post-management",
  },
  { label: "Reports", icon: Flag, path: "/admin/reports" },
  { label: "User Management", icon: Users, path: "/admin/users" },
  { label: "Settings", icon: Settings, path: "/admin/settings" },
];

export default function PostManagement() {
  const navigate = useNavigate();

  const [posts, setPosts] = useState<CommunityPost[]>(initialPosts);
  const [searchTerm, setSearchTerm] = useState("");
  const [transportFilter, setTransportFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedPost, setSelectedPost] =
    useState<CommunityPost | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filteredPosts = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();

    return posts.filter((post) => {
      const matchesSearch =
        post.route.toLowerCase().includes(search) ||
        post.username.toLowerCase().includes(search) ||
        post.post.toLowerCase().includes(search) ||
        post.type.toLowerCase().includes(search);

      const matchesTransport =
        transportFilter === "All" || post.type === transportFilter;

      const matchesStatus =
        statusFilter === "All" || post.status === statusFilter;

      return matchesSearch && matchesTransport && matchesStatus;
    });
  }, [posts, searchTerm, transportFilter, statusFilter]);

  function togglePostVisibility(id: number) {
    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === id
          ? {
              ...post,
              status: post.status === "Visible" ? "Hidden" : "Visible",
            }
          : post,
      ),
    );

    setSelectedPost((currentPost) =>
      currentPost?.id === id
        ? {
            ...currentPost,
            status: currentPost.status === "Visible" ? "Hidden" : "Visible",
          }
        : currentPost,
    );
  }

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

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setSidebarOpen(false);
                    navigate(item.path);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                    active
                      ? "bg-[#CFD5DB] font-semibold text-[#102E4D]"
                      : "text-slate-200 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon size={19} strokeWidth={1.8} />
                  <span>{item.label}</span>
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
            onClick={() => navigate("/admin")}
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
              Review post details and manage their visibility.
            </p>
          </section>

          {/* Search and status filter */}
          <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm focus-within:border-[#102E4D] focus-within:ring-2 focus-within:ring-blue-100">
              <Search size={18} className="shrink-0 text-slate-500" />

              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search post, user or route"
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

            <div className="relative sm:w-[160px]">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                aria-label="Filter by status"
                className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm shadow-sm outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
              >
                <option value="All">All Statuses</option>
                <option value="Visible">Visible</option>
                <option value="Hidden">Hidden</option>
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
              />
            </div>
          </section>

          {/* Transport filters */}
          <section className="mb-7 flex flex-wrap gap-2.5">
            {["All", "Jeep", "Bus", "Train"].map((type) => {
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
                  Review submissions and control post visibility.
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
                    <th className="px-4 py-4 font-semibold">Username</th>
                    <th className="px-4 py-4 font-semibold">Post</th>
                    <th className="px-4 py-4 font-semibold">Date</th>
                    <th className="px-4 py-4 font-semibold">Fare</th>
                    <th className="px-4 py-4 font-semibold">Reports</th>
                    <th className="px-4 py-4 font-semibold">Status</th>
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
                          {post.type}
                        </span>
                      </td>

                      <td className="max-w-[180px] px-4 py-4 font-medium text-slate-700">
                        {post.route}
                      </td>

                      <td className="px-4 py-4 text-slate-600">
                        @{post.username}
                      </td>

                      <td className="max-w-[210px] px-4 py-4">
                        <p className="truncate text-slate-600" title={post.post}>
                          {post.post}
                        </p>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-slate-500">
                        {post.date}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-700">
                        ₱{post.fare.toFixed(2)}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`font-semibold ${
                            post.reports > 0
                              ? "text-orange-600"
                              : "text-slate-500"
                          }`}
                        >
                          {post.reports}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                            post.status === "Visible"
                              ? "bg-green-50 text-green-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              post.status === "Visible"
                                ? "bg-green-500"
                                : "bg-slate-400"
                            }`}
                          />
                          {post.status}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => togglePostVisibility(post.id)}
                            title={
                              post.status === "Visible"
                                ? "Hide post"
                                : "Make post visible"
                            }
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                              post.status === "Visible"
                                ? "border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                                : "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                            }`}
                          >
                            {post.status === "Visible" ? (
                              <EyeOff size={14} />
                            ) : (
                              <Eye size={14} />
                            )}
                            {post.status === "Visible" ? "Hide" : "Visible"}
                          </button>

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
                      <td colSpan={9} className="px-6 py-16 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                          <Search size={22} />
                        </div>
                        <p className="mt-3 font-semibold text-slate-700">
                          No posts found
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Try changing your search or filters.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchTerm("");
                            setTransportFilter("All");
                            setStatusFilter("All");
                          }}
                          className="mt-4 text-sm font-semibold text-[#102E4D] underline underline-offset-4"
                        >
                          Clear filters
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
              <p className="text-xs text-slate-400">
                QRoute Post Management · UI Preview
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
                  Username
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  @{selectedPost.username}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Post description
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  {selectedPost.post}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-[#F4F8FC] p-4">
                  <p className="text-xs text-slate-500">Transport</p>
                  <p className="mt-1 font-semibold text-[#102E4D]">
                    {selectedPost.type}
                  </p>
                </div>

                <div className="rounded-xl bg-[#F4F8FC] p-4">
                  <p className="text-xs text-slate-500">Fare</p>
                  <p className="mt-1 font-semibold text-[#102E4D]">
                    ₱{selectedPost.fare.toFixed(2)}
                  </p>
                </div>

                <div className="rounded-xl bg-[#F4F8FC] p-4">
                  <p className="text-xs text-slate-500">Route</p>
                  <p className="mt-1 text-sm font-semibold text-[#102E4D]">
                    {selectedPost.route}
                  </p>
                </div>

                <div className="rounded-xl bg-[#F4F8FC] p-4">
                  <p className="text-xs text-slate-500">Date submitted</p>
                  <p className="mt-1 text-sm font-semibold text-[#102E4D]">
                    {selectedPost.date}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                <div>
                  <p className="text-xs text-slate-500">Reports</p>
                  <p className="mt-1 font-semibold text-slate-800">
                    {selectedPost.reports}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    selectedPost.status === "Visible"
                      ? "bg-green-50 text-green-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {selectedPost.status}
                </span>
              </div>
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
                onClick={() => togglePostVisibility(selectedPost.id)}
                className="rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#19476D]"
              >
                {selectedPost.status === "Visible"
                  ? "Hide Post"
                  : "Make Visible"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
