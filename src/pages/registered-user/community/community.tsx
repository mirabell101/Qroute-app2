import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Car,
  Heart,
  Home as HomeIcon,
  MapPin,
  MessageSquare,
  ThumbsDown,
  UserCircle,
  Flag,
  Send,
  X,
  Plus,
  Trash2,
} from "lucide-react";
import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";

interface CommunityProps {
  currentUserId: string;
  onLogout: () => void;
}

interface Account {
  id: string;
  username: string;
  email: string;
  password: string;
  profilePicture?: string | null;
}

interface Photo {
  name: string;
  dataUrl: string;
}

interface ReportRecord {
  id: string;
  userId: string;
  reason: string;
  createdAt: string;
}

interface CommentData {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
  reports?: ReportRecord[];
}

interface CommunityPost {
  id: string;
  userId: string;
  caption: string;
  terminal: string;
  origin: string;
  destination: string;
  vehicle: string;
  commuterType: string;
  fare: string;
  photos: Photo[];
  updatedAt: string;
  status: "Pending" | "Approved" | "Needs Revision";
  submittedAt: string;
  batchId: string;
  adminFeedback?: string;
  likedBy?: string[];
  dislikedBy?: string[];
  reportedBy?: string[];
  reports?: ReportRecord[];
  comments?: CommentData[];
}

interface ContributionDraft {
  id: string;
  caption: string;
  terminal: string;
  origin: string;
  destination: string;
  vehicle: string;
  commuterType: string;
  fare: string;
  photos: Photo[];
  updatedAt: string;
}

type FeedFilter = "Public Feed" | "My Posts";

const ACCOUNTS_KEY = "qroute_accounts";
const SUBMITTED_KEY = "qroute_submitted_contributions";
const MAX_PHOTOS = 5;
const MAX_DRAFTS = 5;

const navItems = [
  { label: "Recents", icon: HomeIcon, path: "/home" },
  { label: "Saved", icon: MapPin, path: "/saved" },
  { label: "Your Contribution", icon: Car, path: "/contribution" },
  { label: "Community", icon: MessageSquare, path: "/community" },
];

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function displayName(userId: string, accounts: Account[]) {
  return (
    accounts.find((account) => account.id === userId)?.username ??
    "QRoute user"
  );
}

function dateLabel(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function createDraft(): ContributionDraft {
  return {
    id: crypto.randomUUID(),
    caption: "",
    terminal: "",
    origin: "",
    destination: "",
    vehicle: "",
    commuterType: "",
    fare: "",
    photos: [],
    updatedAt: new Date().toISOString(),
  };
}

export default function Community({
  currentUserId,
  onLogout,
}: CommunityProps) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [profileMenu, setProfileMenu] = useState(false);
  const [commentOpen, setCommentOpen] = useState<string[]>([]);
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [reportTarget, setReportTarget] = useState<{
  postId: string;
  commentId?: string;
} | null>(null);

const [reportReason, setReportReason] = useState("");
  const [loginPrompt, setLoginPrompt] = useState("");
  const [notice, setNotice] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const [feedFilter, setFeedFilter] = useState<FeedFilter>("Public Feed");
  const [showAddPostModal, setShowAddPostModal] = useState(false);
  const [drafts, setDrafts] = useState<ContributionDraft[]>([]);
  const [activeDraftIndex, setActiveDraftIndex] = useState(0);
  const [showValidation, setShowValidation] = useState(false);
  const [draftNotice, setDraftNotice] = useState("");
  const [showSubmitConfirmation, setShowSubmitConfirmation] =
    useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const reload = () => {
    setAccounts(readStorage<Account[]>(ACCOUNTS_KEY, []));

    const all = readStorage<CommunityPost[]>(SUBMITTED_KEY, []);

    setPosts(
      all
        .filter((post) => post.status === "Approved")
        .map((post) => ({
          ...post,
          photos: post.photos ?? [],
          likedBy: post.likedBy ?? [],
          dislikedBy: post.dislikedBy ?? [],
          reportedBy: post.reportedBy ?? [],
          comments: post.comments ?? [],
        }))
        .sort(
          (a, b) =>
            new Date(b.submittedAt).getTime() -
            new Date(a.submittedAt).getTime(),
        ),
    );
  };

  useEffect(() => {
    reload();

    const onStorage = () => reload();

    window.addEventListener("storage", onStorage);

    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
  if (!notice) return;

  const timeoutId = window.setTimeout(() => {
    setNotice("");
  }, 3500);

  return () => window.clearTimeout(timeoutId);
}, [notice]);

  const saveChanges = (updated: CommunityPost[]) => {
    const all = readStorage<CommunityPost[]>(SUBMITTED_KEY, []);
    const changed = new Map(updated.map((post) => [post.id, post]));

    localStorage.setItem(
      SUBMITTED_KEY,
      JSON.stringify(all.map((post) => changed.get(post.id) ?? post)),
    );

    setPosts(
      updated
        .filter((post) => post.status === "Approved")
        .sort(
          (a, b) =>
            new Date(b.submittedAt).getTime() -
            new Date(a.submittedAt).getTime(),
        ),
    );
  };

  const needsLogin = (message: string) => {
    if (currentUserId) return false;

    setLoginPrompt(message);
    return true;
  };

  const react = (postId: string, type: "like" | "dislike") => {
    if (needsLogin("Log in to react to community posts.")) return;

    saveChanges(
      posts.map((post) => {
        if (post.id !== postId) return post;

        const liked = post.likedBy ?? [];
        const disliked = post.dislikedBy ?? [];

        if (type === "like") {
          return {
            ...post,
            likedBy: liked.includes(currentUserId)
              ? liked.filter((id) => id !== currentUserId)
              : [
                  ...liked.filter((id) => id !== currentUserId),
                  currentUserId,
                ],
            dislikedBy: disliked.filter((id) => id !== currentUserId),
          };
        }

        return {
          ...post,
          dislikedBy: disliked.includes(currentUserId)
            ? disliked.filter((id) => id !== currentUserId)
            : [
                ...disliked.filter((id) => id !== currentUserId),
                currentUserId,
              ],
          likedBy: liked.filter((id) => id !== currentUserId),
        };
      }),
    );
  };

  const comment = (postId: string) => {
    if (needsLogin("Log in to comment on community posts.")) return;

    const text = (commentText[postId] ?? "").trim();

    if (!text) return;

    saveChanges(
      posts.map((post) =>
        post.id !== postId
          ? post
          : {
              ...post,
              comments: [
                ...(post.comments ?? []),
                {
                  id: crypto.randomUUID(),
                  userId: currentUserId,
                  text,
                  createdAt: new Date().toISOString(),
                },
              ],
            },
      ),
    );

    setCommentText((previous) => ({ ...previous, [postId]: "" }));

    setCommentOpen((previous) =>
      previous.includes(postId) ? previous : [...previous, postId],
    );
  };

const submitReport = () => {
  if (!reportTarget || !reportReason) return;

  if (needsLogin("Log in to report a community post or comment.")) {
    setReportTarget(null);
    setReportReason("");
    return;
  }

  const report: ReportRecord = {
    id: crypto.randomUUID(),
    userId: currentUserId,
    reason: reportReason,
    createdAt: new Date().toISOString(),
  };

  const updatedPosts = posts.map((post) => {
    if (post.id !== reportTarget.postId) return post;

    // Report a specific comment.
    if (reportTarget.commentId) {
      return {
        ...post,
        comments: (post.comments ?? []).map((item) =>
          item.id !== reportTarget.commentId
            ? item
            : {
                ...item,
                reports: [...(item.reports ?? []), report],
              },
        ),
      };
    }

    // Report the post itself.
    return {
      ...post,
      reports: [...(post.reports ?? []), report],
    };
  });

  saveChanges(updatedPosts);

  setReportTarget(null);
  setReportReason("");
  setNotice(
    "Report received. Together we keep QRoute updated and accurate!",
  );
};

  const currentAccount = accounts.find(
    (account) => account.id === currentUserId,
  );

  const notifications = posts
    .filter((post) => post.userId === currentUserId)
    .flatMap((post) => [
      ...(post.likedBy ?? [])
        .filter((id) => id !== currentUserId)
        .map((id) => ({
          id: `${post.id}-like-${id}`,
          postId: post.id,
          text: `${displayName(id, accounts)} liked your post`,
        })),
      ...(post.dislikedBy ?? [])
        .filter((id) => id !== currentUserId)
        .map((id) => ({
          id: `${post.id}-dislike-${id}`,
          postId: post.id,
          text: `${displayName(id, accounts)} disliked your post`,
        })),
      ...(post.comments ?? [])
        .filter((item) => item.userId !== currentUserId)
        .map((item) => ({
          id: `${post.id}-comment-${item.id}`,
          postId: post.id,
          text: `${displayName(item.userId, accounts)} commented on your post`,
        })),
    ]);

  const openPost = (postId: string) => {
    setNotificationsOpen(false);
    setFeedFilter("Public Feed");

    setCommentOpen((previous) =>
      previous.includes(postId) ? previous : [...previous, postId],
    );

    window.setTimeout(() => {
      document
        .getElementById(`community-post-${postId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const getDraftsKey = () => `qroute_contribution_drafts_${currentUserId}`;

  const loadDrafts = () => {
    const saved = readStorage<ContributionDraft[]>(getDraftsKey(), []);
    return saved.slice(0, MAX_DRAFTS);
  };

  const saveDrafts = (nextDrafts: ContributionDraft[]) => {
    try {
      localStorage.setItem(getDraftsKey(), JSON.stringify(nextDrafts));
      setDrafts(nextDrafts);
      return true;
    } catch {
      setDraftNotice(
        "Unable to save drafts. Browser storage may be full. Try removing some photos.",
      );
      return false;
    }
  };

  const activeDraft = drafts[activeDraftIndex] ?? null;

  const updateActiveDraft = (updates: Partial<ContributionDraft>) => {
    if (!activeDraft) return;

    const nextDrafts = drafts.map((draft, index) =>
      index === activeDraftIndex
        ? {
            ...draft,
            ...updates,
            updatedAt: new Date().toISOString(),
          }
        : draft,
    );

    saveDrafts(nextDrafts);
  };

  const openAddPostModal = () => {
    if (needsLogin("Log in to create a community post.")) return;

    const savedDrafts = loadDrafts();
    const startingDrafts =
      savedDrafts.length > 0 ? savedDrafts : [createDraft()];

    if (!saveDrafts(startingDrafts)) return;

    setActiveDraftIndex(0);
    setShowValidation(false);
    setDraftNotice("");
    setShowSubmitConfirmation(false);
    setShowDeleteConfirmation(false);
    setShowAddPostModal(true);
  };

  const closeAddPostModal = () => {
    setShowAddPostModal(false);
    setShowSubmitConfirmation(false);
    setShowDeleteConfirmation(false);
    setShowValidation(false);
    setDraftNotice("");
  };

  const addAnotherDraft = () => {
    if (drafts.length >= MAX_DRAFTS) {
      setDraftNotice(`You can create up to ${MAX_DRAFTS} drafts at a time.`);
      return;
    }

    const nextDrafts = [...drafts, createDraft()];

    if (saveDrafts(nextDrafts)) {
      setActiveDraftIndex(nextDrafts.length - 1);
      setShowValidation(false);
      setDraftNotice("");
    }
  };

  const deleteActiveDraft = () => {
    if (!activeDraft) return;

    const nextDrafts = drafts.filter(
      (_, index) => index !== activeDraftIndex,
    );

    if (nextDrafts.length === 0) {
      const replacement = [createDraft()];

      if (saveDrafts(replacement)) {
        setActiveDraftIndex(0);
        setShowDeleteConfirmation(false);
        setShowValidation(false);
        setDraftNotice("");
      }

      return;
    }

    if (saveDrafts(nextDrafts)) {
      setActiveDraftIndex(Math.min(activeDraftIndex, nextDrafts.length - 1));
      setShowDeleteConfirmation(false);
      setShowValidation(false);
      setDraftNotice("");
    }
  };

  const handlePhotoChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!activeDraft) return;

    const selectedFiles = Array.from(event.target.files ?? []);
    const remainingSlots = MAX_PHOTOS - activeDraft.photos.length;
    const imageFiles = selectedFiles
      .filter((file) => file.type === "image/png" || file.type === "image/jpeg")
      .slice(0, remainingSlots);

    if (imageFiles.length === 0 && selectedFiles.length > 0) {
      setDraftNotice("Please choose PNG, JPG, or JPEG photos.");
      event.target.value = "";
      return;
    }

    try {
      const newPhotos = await Promise.all(
        imageFiles.map(
          (file) =>
            new Promise<Photo>((resolve, reject) => {
              const reader = new FileReader();

              reader.onload = () => {
                if (typeof reader.result !== "string") {
                  reject(new Error("Unable to read image."));
                  return;
                }

                resolve({ name: file.name, dataUrl: reader.result });
              };

              reader.onerror = () =>
                reject(new Error("Unable to read image."));
              reader.readAsDataURL(file);
            }),
        ),
      );

      updateActiveDraft({
        photos: [...activeDraft.photos, ...newPhotos],
      });

      if (selectedFiles.length > remainingSlots) {
        setDraftNotice(`You can upload up to ${MAX_PHOTOS} photos per post.`);
      } else {
        setDraftNotice("");
      }
    } catch {
      setDraftNotice("Unable to read a photo. Please try another PNG or JPG.");
    }

    event.target.value = "";
  };

  const removePhoto = (photoIndex: number) => {
    if (!activeDraft) return;

    updateActiveDraft({
      photos: activeDraft.photos.filter((_, index) => index !== photoIndex),
    });
  };

  const isDraftValid = (draft: ContributionDraft) => {
    const hasRouteDetails = Boolean(
      draft.terminal.trim() ||
        draft.origin.trim() ||
        draft.destination.trim(),
    );

    const isFareValid = /^\d+(\.\d{1,2})?$/.test(draft.fare.trim());

    return (
      draft.photos.length > 0 &&
      Boolean(draft.caption.trim()) &&
      hasRouteDetails &&
      Boolean(draft.vehicle.trim()) &&
      Boolean(draft.commuterType.trim()) &&
      isFareValid
    );
  };

  const handleSubmitAll = () => {
    setShowValidation(true);
    setDraftNotice("");

    if (drafts.length === 0) {
      setDraftNotice("There are no drafts to submit.");
      return;
    }

    const invalidIndex = drafts.findIndex((draft) => !isDraftValid(draft));

    if (invalidIndex !== -1) {
      setActiveDraftIndex(invalidIndex);
      setDraftNotice(
        `Some fields are missing or invalid in Draft ${invalidIndex + 1}. Please complete all drafts before submitting.`,
      );
      return;
    }

    setShowSubmitConfirmation(true);
  };

  const confirmSubmitAll = () => {
    if (isSubmitting || drafts.length === 0) return;

    setIsSubmitting(true);
    setDraftNotice("");

    try {
      const batchId = crypto.randomUUID();
      const submittedAt = new Date().toISOString();

      const newPosts: CommunityPost[] = drafts.map((draft) => ({
        ...draft,
        userId: currentUserId,
        status: "Pending",
        submittedAt,
        batchId,
        likedBy: [],
        dislikedBy: [],
        reportedBy: [],
        comments: [],
      }));

      const allPosts = readStorage<CommunityPost[]>(SUBMITTED_KEY, []);

      localStorage.setItem(
        SUBMITTED_KEY,
        JSON.stringify([...allPosts, ...newPosts]),
      );

      localStorage.removeItem(getDraftsKey());

      setShowAddPostModal(false);
      setShowSubmitConfirmation(false);
      setShowValidation(false);
      setDraftNotice("");
      setDrafts([]);
      setActiveDraftIndex(0);
      setNotice("Your post has been submitted for admin review.");
    } catch {
      setDraftNotice(
        "Unable to submit your posts. Browser storage may be full. Try removing some photos.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const routeError =
    showValidation &&
    activeDraft !== null &&
    !activeDraft.terminal.trim() &&
    !activeDraft.origin.trim() &&
    !activeDraft.destination.trim();

  const fareError =
    showValidation &&
    activeDraft !== null &&
    (!activeDraft.fare.trim() ||
      !/^\d+(\.\d{1,2})?$/.test(activeDraft.fare.trim()));

  const fieldClass = (hasError: boolean) =>
    `h-10 w-full rounded-lg border px-3 text-sm outline-none placeholder:text-gray-500 focus:ring-1 ${
      hasError
        ? "border-red-500 focus:border-red-500 focus:ring-red-500"
        : "border-gray-300 focus:border-[#12395A] focus:ring-[#12395A]"
    }`;

  const visiblePosts =
    feedFilter === "My Posts"
      ? posts.filter((post) => post.userId === currentUserId)
      : posts;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#f7f7f7]">
      <aside className="absolute left-0 top-0 z-[2000] flex h-screen w-[220px] flex-col bg-[#12395A] text-white sm:w-[230px] md:w-[240px] lg:w-[250px]">
        <button
          type="button"
          onClick={() => {
            window.location.href = "/home";
          }}
          title="Home"
          className="absolute flex items-center justify-center rounded-lg transition-colors duration-200 hover:bg-[#1b4b6f]"
          style={{ top: "30px", width: "100%", height: "75px" }}
        >
          <img
            src={qrouteWhiteLogo}
            alt="QRoute"
            className="max-h-full max-w-full object-contain"
          />
        </button>

        <nav className="absolute left-0 top-[145px] flex w-full flex-col">
          {navItems.map(({ label, icon: Icon, path }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                window.location.href = path;
              }}
              className={`group flex h-[46px] w-full items-center px-6 text-left transition-colors duration-200 ${
                label === "Community"
                  ? "bg-[#1b4b6f]"
                  : "hover:bg-[#d9dee3] hover:text-[#12395A]"
              }`}
            >
              <span className="flex w-[28px] shrink-0 items-center justify-center">
                <Icon
                  size={19}
                  strokeWidth={1.8}
                  className="transition-transform duration-200 group-hover:scale-110"
                />
              </span>
              <span className="ml-2 whitespace-nowrap text-[16px] font-medium">
                {label}
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <header className="absolute left-[220px] right-0 top-0 z-[40] flex min-h-[130px] items-start justify-between bg-[#f7f7f7] px-[30px] pt-[35px] sm:left-[20px] md:left-[290px] lg:left-[300px]">
        <div className="flex flex-col justify-center">
          <h1 className="text-[26px] font-semibold tracking-[-0.4px] text-gray-900">
            Community
          </h1>
          <p className="mt-1 text-[14px] text-gray-500">
            Share and explore commuter experiences.
          </p>
        </div>

        <div className="relative flex h-[55px] -translate-y-[5px] items-center gap-[20px]">
          <div className="relative">
            <button
              type="button"
              title="Notifications"
              onClick={() => {
                if (needsLogin("Log in to view your notifications.")) return;
                setNotificationsOpen((previous) => !previous);
              }}
              className="group relative flex h-[45px] w-[45px] items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-200 hover:scale-105 hover:bg-gray-100 hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]"
            >
              <Bell
                size={20}
                strokeWidth={2}
                className="transition-transform duration-200 group-hover:rotate-6"
              />
              {notifications.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {notifications.length}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 top-[55px] z-[3000] w-[300px] rounded-xl border border-gray-100 bg-white p-3 shadow-xl">
                <h2 className="mb-2 px-1 text-sm font-semibold text-gray-900">
                  Notifications
                </h2>

                {notifications.length === 0 ? (
                  <p className="px-1 py-4 text-sm text-gray-500">
                    No notifications yet.
                  </p>
                ) : (
                  <div className="max-h-[300px] overflow-y-auto">
                    {notifications.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openPost(item.postId)}
                        className="w-full rounded-lg px-2 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
                      >
                        {item.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setProfileMenu((previous) => !previous)}
            title="Profile"
            className="group flex h-[45px] w-[45px] items-center justify-center overflow-hidden rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-200 hover:scale-105 hover:bg-gray-100 hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]"
          >
            {currentAccount?.profilePicture ? (
              <img
                src={currentAccount.profilePicture}
                alt="Profile"
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <UserCircle
                size={21}
                strokeWidth={2}
                className="transition-transform duration-200 group-hover:scale-105"
              />
            )}
          </button>

          {profileMenu && (
            <div className="absolute right-0 top-[58px] z-[4000] w-[150px] rounded-xl bg-white p-2 shadow-[0_4px_15px_rgba(0,0,0,0.18)]">
              <button
                type="button"
                onClick={() => {
                  setProfileMenu(false);
                  window.location.href = "/profile";
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                Account
              </button>

              <button
                type="button"
                onClick={() => {
                  setProfileMenu(false);
                  onLogout();
                  window.location.href = "/";
                }}
                className="mt-1 w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                Log Out
              </button>
            </div>
          )}
        </div>
      </header>

      <section className="absolute inset-0 z-0 ml-[220px] overflow-y-auto pt-[10px] sm:ml-[230px] md:ml-[240px] lg:ml-[250px]">
        <div className="mx-auto w-full max-w-[900px] px-8 pb-12 pt-[125px]">
          <button
            type="button"
            onClick={openAddPostModal}
            className="group mt-1 flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 text-left shadow-[0_2px_8px_rgba(0,0,0,0.10)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-[0_4px_12px_rgba(0,0,0,0.14)]"
          >
            <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#12395A] text-white transition-transform duration-200 group-hover:scale-105">
              <Plus size={21} strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-gray-900">
                Add Post
              </p>
              <p className="mt-0.5 text-[13px] text-gray-500">
                Create up to {MAX_DRAFTS} drafts and submit them for review
              </p>
            </div>
          </button>

          <div className="mt-5 flex flex-wrap gap-2">
            {(["Public Feed", "My Posts"] as FeedFilter[]).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setFeedFilter(filter)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  feedFilter === filter
                    ? "bg-[#12395A] text-white"
                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="mt-4 w-full">
            
{visiblePosts.map((post) => {
  const liked = (post.likedBy ?? []).includes(currentUserId);
  const disliked = (post.dislikedBy ?? []).includes(currentUserId);
  const comments = post.comments ?? [];
  const author = accounts.find((account) => account.id === post.userId);

  return (
    <article
      id={`community-post-${post.id}`}
      key={post.id}
      className="mx-auto mb-3 w-full max-w-[4000px] rounded-xl border border-gray-200 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
    >
      {/* Profile, username, badge, and date */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {author?.profilePicture ? (
            <img
              src={author.profilePicture}
              alt="Profile"
              className="h-11 w-11 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8eef3] text-[#12395A]">
              <UserCircle size={25} />
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">
              {displayName(post.userId, accounts)}
            </p>
            <span className="mt-1 inline-block rounded-full bg-[#eaf1f7] px-2.5 py-1 text-[11px] font-medium text-[#12395A]">
              Contributor
            </span>
          </div>
        </div>

        <p className="shrink-0 pt-0.5 text-xs text-gray-500">
          {dateLabel(post.submittedAt)}
        </p>
      </div>

      {/* Route */}
      {(post.terminal || post.origin || post.destination) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-700">
          <MapPin size={16} className="shrink-0 text-[#12395A]" />

          {post.terminal && (
            <span>
              <span className="font-medium">Terminal:</span> {post.terminal}
            </span>
          )}

          {(post.origin || post.destination) && (
            <span className="font-medium">
              {post.origin || "—"} → {post.destination || "—"}
            </span>
          )}
        </div>
      )}

      {/* Square post image, aligned with the profile's left edge */}
      {post.photos?.[0] && (
  <img
    src={post.photos[0].dataUrl}
    alt="Community post"
    onClick={() => setSelectedImage(post.photos![0].dataUrl)}
    className="mt-2 h-[180px] w-full cursor-pointer rounded-lg bg-gray-50 object-cover transition-opacity hover:opacity-95"
  />
)}

      {/* Caption and details */}
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">
        {post.caption}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
        {post.vehicle && <span>{post.vehicle}</span>}
        {post.commuterType && <span>{post.commuterType}</span>}
        <span className="font-semibold">₱{post.fare}</span>
      </div>

      {/* Interactions */}
      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-gray-100 pt-2">
        <button
          type="button"
          onClick={() => react(post.id, "like")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
            liked
              ? "bg-pink-50 text-pink-700"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <Heart size={17} className={liked ? "fill-current" : ""} />
          {post.likedBy?.length ?? 0}
        </button>

        <button
          type="button"
          onClick={() => react(post.id, "dislike")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
            disliked
              ? "bg-blue-50 text-blue-700"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <ThumbsDown size={17} />
          {post.dislikedBy?.length ?? 0}
        </button>

        <button
          type="button"
          onClick={() =>
            setCommentOpen((previous) =>
              previous.includes(post.id)
                ? previous.filter((id) => id !== post.id)
                : [...previous, post.id],
            )
          }
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100"
        >
          <MessageSquare size={17} />
          {comments.length} Comments
        </button>

        <div className="ml-auto flex items-center gap-1">
  <span className="text-xs text-gray-500">
    {(post.reports?.length ?? 0) + (post.reportedBy?.length ?? 0)}
  </span>

  <button
    type="button"
    title="Report post"
    onClick={() => {
      if (needsLogin("Log in to report a community post.")) return;

      setReportReason("");
      setReportTarget({ postId: post.id });
    }}
    className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
  >
    <Flag size={16} />
    Report
  </button>
</div>
      </div>

      {/* Comments */}
      {commentOpen.includes(post.id) && (
        <div className="min-w-0 flex-1 rounded-lg bg-gray-50 px-3 py-2">
  <div className="flex items-start justify-between gap-2">
    <p className="text-xs font-semibold text-gray-800">
      {displayName(item.userId, accounts)}
    </p>

    <div className="flex shrink-0 items-center gap-1">
      <span className="text-[11px] text-gray-500">
        {(item.reports?.length ?? 0)}
      </span>

      <button
        type="button"
        title="Report comment"
        aria-label="Report comment"
        onClick={() => {
          if (needsLogin("Log in to report a community comment.")) return;

          setReportReason("");
          setReportTarget({
            postId: post.id,
            commentId: item.id,
          });
        }}
        className="rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <Flag size={14} />
      </button>
    </div>
  </div>

  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-gray-700">
    {item.text}
  </p>
</div>
      )}
    </article>
  );
})}

            {visiblePosts.length === 0 && (
              <div className="mt-4 flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 text-center shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                <div className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[#f1f3f5]">
                  <MessageSquare
                    size={27}
                    strokeWidth={1.8}
                    className="text-gray-400"
                  />
                </div>
                <h2 className="mt-5 text-[17px] font-semibold text-gray-800">
                  {feedFilter === "My Posts"
                    ? "You have no published posts yet."
                    : "No community posts yet."}
                </h2>
                <p className="mt-2 max-w-[380px] text-[13px] leading-[1.6] text-gray-500">
                  {feedFilter === "My Posts"
                    ? "Your approved posts will appear here."
                    : "Approved community contributions will appear here."}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {showAddPostModal && activeDraft && (
        <div
          className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/45 px-4 py-6"
          onClick={closeAddPostModal}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-post-title"
            className="max-h-[90vh] w-full max-w-[620px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2
                  id="add-post-title"
                  className="text-xl font-semibold text-gray-900"
                >
                  Create Post
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Save up to {MAX_DRAFTS} separate posts for admin review.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={closeAddPostModal}
                className="rounded-full px-2 py-1 text-xl leading-none text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
              >
                ×
              </button>
            </div>

            {draftNotice && (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                {draftNotice}
              </p>
            )}

            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-900">
                    Photos <span className="text-red-500">*</span>
                  </label>
                  <span className="text-xs text-gray-500">
                    {activeDraft.photos.length}/{MAX_PHOTOS} photos
                  </span>
                </div>

                <div
                  className={`grid grid-cols-2 gap-3 rounded-xl sm:grid-cols-3 ${
                    showValidation && activeDraft.photos.length === 0
                      ? "border border-red-500 p-2"
                      : ""
                  }`}
                >
                  {activeDraft.photos.map((photo, index) => (
                    <div
                      key={`${activeDraft.id}-${photo.name}-${index}`}
                      className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
                    >
                      <img
                        src={photo.dataUrl}
                        alt={`Selected photo ${index + 1}`}
                        className="h-28 w-full object-cover"
                      />
                      <button
                        type="button"
                        aria-label={`Remove photo ${index + 1}`}
                        onClick={() => removePhoto(index)}
                        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-red-600"
                      >
                        ×
                      </button>
                      <p className="truncate px-2 py-1.5 text-xs text-gray-600">
                        {photo.name}
                      </p>
                    </div>
                  ))}

                  {activeDraft.photos.length < MAX_PHOTOS && (
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="flex min-h-[112px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-center transition-colors hover:border-[#12395A] hover:bg-gray-100"
                    >
                      <Plus size={25} className="mb-1 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">
                        Add photo
                      </span>
                      <span className="mt-1 text-xs text-gray-500">
                        PNG, JPG, or JPEG
                      </span>
                    </button>
                  )}
                </div>

                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  multiple
                  className="hidden"
                  onChange={handlePhotoChange}
                />

                {showValidation && activeDraft.photos.length === 0 && (
                  <p className="mt-1 text-xs text-red-600">
                    Please add at least one photo.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="post-caption"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  Caption <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="post-caption"
                  value={activeDraft.caption}
                  onChange={(event) =>
                    updateActiveDraft({ caption: event.target.value })
                  }
                  placeholder="Share your route experience..."
                  rows={2}
                  className={`w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 ${
                    showValidation && !activeDraft.caption.trim()
                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-[#12395A] focus:ring-[#12395A]"
                  }`}
                />
                {showValidation && !activeDraft.caption.trim() && (
                  <p className="mt-1 text-xs text-red-600">
                    Caption is required.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="post-terminal"
                  className="mb-1.5 block text-sm font-medium text-gray-900"
                >
                  Terminal
                </label>
                <input
                  id="post-terminal"
                  value={activeDraft.terminal}
                  onChange={(event) =>
                    updateActiveDraft({ terminal: event.target.value })
                  }
                  placeholder="Enter terminal name"
                  className={fieldClass(routeError)}
                />
              </div>

              <div>
                <p className="mb-1.5 block text-sm font-medium text-gray-900">
                  Route details
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="post-origin"
                      className="mb-1 block text-xs text-gray-500"
                    >
                      Point A / Origin
                    </label>
                    <input
                      id="post-origin"
                      value={activeDraft.origin}
                      onChange={(event) =>
                        updateActiveDraft({ origin: event.target.value })
                      }
                      placeholder="Starting point"
                      className={fieldClass(routeError)}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="post-destination"
                      className="mb-1 block text-xs text-gray-500"
                    >
                      Point B / Destination
                    </label>
                    <input
                      id="post-destination"
                      value={activeDraft.destination}
                      onChange={(event) =>
                        updateActiveDraft({ destination: event.target.value })
                      }
                      placeholder="Destination"
                      className={fieldClass(routeError)}
                    />
                  </div>
                </div>
                {routeError && (
                  <p className="mt-1 text-xs text-red-600">
                    Enter a terminal, origin, or destination.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="post-vehicle"
                  className="mb-1.5 block text-sm font-medium text-gray-900"
                >
                  Type of vehicle <span className="text-red-500">*</span>
                </label>
                <select
                  id="post-vehicle"
                  value={activeDraft.vehicle}
                  onChange={(event) =>
                    updateActiveDraft({ vehicle: event.target.value })
                  }
                  className={fieldClass(showValidation && !activeDraft.vehicle)}
                >
                  <option value="" disabled>
                    Vehicle Type
                  </option>
                  <option value="Bus">Bus</option>
                  <option value="Jeepney">Jeepney</option>
                  <option value="Train">Train</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="post-commuter-type"
                  className="mb-1.5 block text-sm font-medium text-gray-900"
                >
                  Type of commuter <span className="text-red-500">*</span>
                </label>
                <select
                  id="post-commuter-type"
                  value={activeDraft.commuterType}
                  onChange={(event) =>
                    updateActiveDraft({ commuterType: event.target.value })
                  }
                  className={fieldClass(
                    showValidation && !activeDraft.commuterType,
                  )}
                >
                  <option value="" disabled>
                    Commuter Type
                  </option>
                  <option value="Regular">Regular</option>
                  <option value="Discounted">Discounted</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="post-fare"
                  className="mb-1.5 block text-sm font-medium text-gray-900"
                >
                  Fare (₱) <span className="text-red-500">*</span>
                </label>
                <input
                  id="post-fare"
                  type="text"
                  inputMode="decimal"
                  value={activeDraft.fare}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (/^\d*\.?\d{0,2}$/.test(value)) {
                      updateActiveDraft({ fare: value });
                    }
                  }}
                  placeholder="0.00"
                  className={fieldClass(fareError)}
                />
                {fareError && (
                  <p className="mt-1 text-xs text-red-600">
                    Enter a valid fare with up to two decimal places.
                  </p>
                )}
              </div>

              {showValidation && !isDraftValid(activeDraft) && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  Complete the required fields in this draft before
                  submitting the batch.
                </p>
              )}
            </div>

            <div className="mt-6 border-t border-gray-100 pt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Your draft posts
                  </p>
                  <p className="text-xs text-gray-500">
                    {drafts.length} of {MAX_DRAFTS} drafts
                  </p>
                </div>
                <p className="text-xs text-gray-500">
                  Draft {activeDraftIndex + 1} of {drafts.length}
                </p>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-2">
                {drafts.map((draft, index) => {
                  const isActive = index === activeDraftIndex;
                  const hasContent = Boolean(
                    draft.caption.trim() ||
                      draft.terminal.trim() ||
                      draft.origin.trim() ||
                      draft.destination.trim() ||
                      draft.photos.length > 0,
                  );

                  return (
                    <div
                      key={draft.id}
                      className={`flex items-center overflow-hidden rounded-lg border transition-colors ${
                        isActive
                          ? "border-[#12395A] bg-[#12395A] text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDraftIndex(index);
                          setShowValidation(false);
                          setDraftNotice("");
                        }}
                        className="px-3 py-2 text-xs font-semibold"
                      >
                        Draft {index + 1}
                        {hasContent ? " •" : ""}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete draft ${index + 1}`}
                        title={`Delete draft ${index + 1}`}
                        onClick={() => {
                          setActiveDraftIndex(index);
                          setShowDeleteConfirmation(true);
                        }}
                        className={`border-l px-2 py-2 transition-colors ${
                          isActive
                            ? "border-white/20 hover:bg-red-600"
                            : "border-gray-200 hover:bg-red-50 hover:text-red-600"
                        }`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex flex-col-reverse justify-end gap-3 sm:flex-row">
              <button
                type="button"
                onClick={addAnotherDraft}
                disabled={drafts.length >= MAX_DRAFTS}
                className="rounded-lg border border-[#12395A] px-4 py-2.5 text-sm font-semibold text-[#12395A] transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                + Add Another Post
              </button>

              <button
                type="button"
                onClick={handleSubmitAll}
                disabled={isSubmitting}
                className="rounded-lg bg-[#12395A] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1b4b6f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Submit All
              </button>
            </div>
          </section>
        </div>
      )}

      {showSubmitConfirmation && (
        <div
          className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/45 px-4"
          onClick={() => setShowSubmitConfirmation(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[390px] rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900">
              Submit your posts?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              Submit {drafts.length} post{drafts.length === 1 ? "" : "s"} for
              admin review? You cannot edit them while they are pending.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitConfirmation(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSubmitAll}
                disabled={isSubmitting}
                className="rounded-lg bg-[#12395A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b4b6f] disabled:opacity-50"
              >
                {isSubmitting ? "Submitting..." : "Confirm"}
              </button>
            </div>
          </section>
        </div>
      )}

      {showDeleteConfirmation && activeDraft && (
        <div
          className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/45 px-4"
          onClick={() => setShowDeleteConfirmation(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[390px] rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900">
              Delete this draft?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              The current draft and its photos will be removed.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirmation(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteActiveDraft}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Delete Draft
              </button>
            </div>
          </section>
        </div>
      )}

      {loginPrompt && (
        <div
          className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/45 px-4"
          onClick={() => setLoginPrompt("")}
        >
          <section
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[390px] rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setLoginPrompt("")}
              className="float-right rounded-full p-1 text-gray-500 hover:bg-gray-100"
            >
              <X size={18} />
            </button>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">
              Log in required
            </h2>
            <p className="mb-5 text-sm text-gray-600">{loginPrompt}</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setLoginPrompt("")}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginPrompt("");
                  window.location.href = "/login";
                }}
                className="rounded-lg bg-[#12395A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b4b6f]"
              >
                Log In
              </button>
            </div>
          </section>
        </div>
      )}

      {reportTarget && (
  <div
    className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/45 px-4"
    onClick={() => {
      setReportTarget(null);
      setReportReason("");
    }}
  >
    <section
  role="dialog"
  aria-modal="true"
  aria-labelledby="report-title"
  className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-2xl"
  onClick={(event) => event.stopPropagation()}
>
  <div className="mb-4 w-full">
    <h2
      id="report-title"
      className="w-full text-center text-lg font-bold text-gray-950"
    >
      Why are you reporting this{" "}
      {reportTarget.commentId ? "comment" : "contribution"}?
    </h2>
  </div>

  <p className="mb-5 text-center text-sm text-gray-600">
    Let the admins know why you are reporting this{" "}
    {reportTarget.commentId ? "comment" : "post"}.
  </p>

  <div className="space-y-1">
    {[
      "Misleading or troll submissions",
      "Offensive or inappropriate content",
    ].map((reason) => (
      <button
        key={reason}
        type="button"
        onClick={() => {
          setReportReason(reason);
        }}
        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors ${
          reportReason === reason
            ? "bg-gray-100 font-semibold text-gray-950"
            : "text-gray-800 hover:bg-gray-50"
        }`}
      >
        <span>{reason}</span>
        <span className="text-lg leading-none text-gray-950">›</span>
      </button>
    ))}
  </div>

      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            setReportTarget(null);
            setReportReason("");
          }}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={submitReport}
          disabled={!reportReason}
          className="rounded-lg bg-[#12395A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1b4b6f] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Submit Report
        </button>
      </div>
    </section>
  </div>
)}
      {notice && (
        <div className="fixed bottom-5 right-5 z-[9000] max-w-sm rounded-xl bg-[#12395A] px-4 py-3 text-sm text-white shadow-xl">
          <div className="flex items-start gap-3">
            <p>{notice}</p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setNotice("")}
              className="shrink-0 text-white/80 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      
    
{selectedImage && (
  <div
    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-4"
    onClick={() => setSelectedImage(null)}
  >
    <button
      type="button"
      onClick={() => setSelectedImage(null)}
      className="absolute right-5 top-5 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
      aria-label="Close image"
    >
      <X size={28} />
    </button>

    <img
      src={selectedImage}
      alt="Expanded post"
      onClick={(event) => event.stopPropagation()}
      className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
    />
  </div>
)}
    </main>
  );
}