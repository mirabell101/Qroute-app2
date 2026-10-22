import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Car,
  Home as HomeIcon,
  MapPin,
  MessageSquare,
  UserCircle,
  Plus,
  Trash2,
} from "lucide-react";
import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";

interface ContributionProps {
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

interface DraftPhoto {
  name: string;
  dataUrl: string;
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
  photos: DraftPhoto[];
  updatedAt: string;
}

type PostStatus = "Pending" | "Approved" | "Needs Revision";

interface SubmittedContribution extends ContributionDraft {
  userId: string;
  status: PostStatus;
  submittedAt: string;
  batchId: string;
  adminFeedback?: string;
}
const ACCOUNTS_KEY = "qroute_accounts";
const SUBMITTED_KEY = "qroute_submitted_contributions";
const MAX_PHOTOS = 5;
const MAX_DRAFTS = 5;
const navItems = [
  { label: "Recents", icon: HomeIcon },
  { label: "Saved", icon: MapPin },
  { label: "Your Contribution", icon: Car },
  { label: "Community", icon: MessageSquare },
];

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function getStoredAccounts(): Account[] {
  return readLocalStorage<Account[]>(ACCOUNTS_KEY, []);
}

function getDraftStorageKey(userId: string) {
  return `qroute_contribution_drafts_${userId}`;
}

function getUserDrafts(userId: string): ContributionDraft[] {
  return readLocalStorage<ContributionDraft[]>(
    getDraftStorageKey(userId),
    [],
  );
}

function saveUserDrafts(userId: string, drafts: ContributionDraft[]) {
  try {
    localStorage.setItem(getDraftStorageKey(userId), JSON.stringify(drafts));
    return true;
  } catch {
    return false;
  }
}

function getAllSubmitted(): SubmittedContribution[] {
  return readLocalStorage<SubmittedContribution[]>(SUBMITTED_KEY, []);
}

function saveAllSubmitted(posts: SubmittedContribution[]) {
  localStorage.setItem(SUBMITTED_KEY, JSON.stringify(posts));
}

function createEmptyDraft(): ContributionDraft {
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

function isSameDraftContent(
  draft: ContributionDraft,
  original: ContributionDraft,
) {
  return (
    draft.caption === original.caption &&
    draft.terminal === original.terminal &&
    draft.origin === original.origin &&
    draft.destination === original.destination &&
    draft.vehicle === original.vehicle &&
    draft.commuterType === original.commuterType &&
    draft.fare === original.fare &&
    draft.photos.length === original.photos.length &&
    draft.photos.every(
      (photo, index) => photo.dataUrl === original.photos[index]?.dataUrl,
    )
  );
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Contribution({
  currentUserId,
  onLogout,
}: ContributionProps) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showAddPostModal, setShowAddPostModal] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [showDraftNotice, setShowDraftNotice] = useState("");
  const [drafts, setDrafts] = useState<ContributionDraft[]>([]);
  const [activeDraftIndex, setActiveDraftIndex] = useState(0);
  const [contribution, setContribution] = useState<
    SubmittedContribution[]
  >([]);const [isSubmitting] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [showWithdrawConfirmation, setShowWithdrawConfirmation] =
    useState(false);
  const [showCancelPostConfirmation, setShowCancelPostConfirmation] =
  useState(false);

const [pendingCancelPostId, setPendingCancelPostId] =
  useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] =
  useState(false);
const [pendingDeletePostId, setPendingDeletePostId] =
  useState<string | null>(null);
  const [pendingWithdrawPostId, setPendingWithdrawPostId] = useState<
    string | null
  >(null);
  const [draftIndexToDelete, setDraftIndexToDelete] = useState<number | null>(
    null,
  );
  const [withdrawnOriginal, setWithdrawnOriginal] =
    useState<SubmittedContribution | null>(null);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [showSaveChangesConfirmation, setShowSaveChangesConfirmation] =
    useState(false);
  const [notice, setNotice] = useState("");

  const accounts = getStoredAccounts();
  const currentAccount = accounts.find(
    (account) => account.id === currentUserId,
  );

  const activeDraft = drafts[activeDraftIndex];

  const withdrawnDraft = withdrawnOriginal
    ? (drafts.find((draft) => draft.id === withdrawnOriginal.id) ?? null)
    : null;

  const isWithdrawnUnchanged =
    withdrawnOriginal !== null &&
    withdrawnDraft !== null &&
    isSameDraftContent(withdrawnDraft, withdrawnOriginal);

  useEffect(() => {
    if (!currentUserId) {
      setDrafts([]);
      setContribution([]);
      setIsLoaded(true);
      return;
    }

    const storedDrafts = getUserDrafts(currentUserId);
    const userPosts = getAllSubmitted().filter(
      (post) => post.userId === currentUserId,
    );

    setDrafts(storedDrafts);
    setContribution(userPosts);
    setActiveDraftIndex(0);
    setIsLoaded(true);
  }, [currentUserId]);

  useEffect(() => {
    if (!isLoaded || !currentUserId) return;

    const success = saveUserDrafts(currentUserId, drafts);

    if (!success) {
      setShowDraftNotice(
        "Unable to save drafts. Browser storage may be full. Try removing some photos.",
      );
    }
  }, [drafts, currentUserId, isLoaded]);

  useEffect(() => {
    if (!notice) return;

    const timer = window.setTimeout(() => setNotice(""), 4000);

    return () => window.clearTimeout(timer);
  }, [notice]);

  const updateActiveDraft = (updates: Partial<ContributionDraft>) => {
    setDrafts((previous) =>
      previous.map((draft, index) =>
        index === activeDraftIndex
          ? {
              ...draft,
              ...updates,
              updatedAt: new Date().toISOString(),
            }
          : draft,
      ),
    );
  };

  const handleNavigation = (name: string) => {
    if (name === "Recents") {
      window.location.href = "/home";
      return;
    }

    if (name === "Saved") {
      window.location.href = "/saved";
      return;
    }

    if (name === "Community") {
      window.location.href = "/community";
      return;
    }
  };

  const openAddPostModal = () => {
    setShowValidation(false);
    setShowDraftNotice("");
    setWithdrawnOriginal(null);

    if (drafts.length === 0) {
      setDrafts([createEmptyDraft()]);
      setActiveDraftIndex(0);
    } else {
      setActiveDraftIndex(0);
    }

    setShowAddPostModal(true);
  };

  const closeAddPostModal = () => {
    setShowAddPostModal(false);
    setShowValidation(false);
    setShowDraftNotice("");
    setShowLeaveConfirmation(false);
    setShowSaveChangesConfirmation(false);
    setWithdrawnOriginal(null);
  };

  const requestCloseAddPostModal = () => {
    if (isWithdrawnUnchanged) {
      setShowLeaveConfirmation(true);
      return;
    }

    if (withdrawnOriginal && withdrawnDraft) {
      setShowSaveChangesConfirmation(true);
      return;
    }

    closeAddPostModal();
  };

  const confirmSaveChanges = () => {
    if (!withdrawnDraft) {
      closeAddPostModal();
      return;
    }

    const label =
      withdrawnDraft.terminal.trim() ||
      `${withdrawnDraft.origin.trim() || "—"} → ${
        withdrawnDraft.destination.trim() || "—"
      }`;

    closeAddPostModal();
    setNotice(`Draft (${label}) updated.`);
  };

  const confirmLeaveWithoutChanges = () => {
    if (!withdrawnOriginal) {
      closeAddPostModal();
      return;
    }

    const original = withdrawnOriginal;

    try {
      const allPosts = getAllSubmitted();

      saveAllSubmitted([
        ...allPosts.filter((post) => post.id !== original.id),
        original,
      ]);
    } catch {
      setShowLeaveConfirmation(false);
      setShowDraftNotice(
        "Unable to return the post to your pending list. Browser storage may be full. Your draft remains saved.",
      );
      return;
    }

    setDrafts((previous) => previous.filter((draft) => draft.id !== original.id));
    setContribution((previous) =>
      previous.some((item) => item.id === original.id)
        ? previous
        : [original, ...previous],
    );
    setActiveDraftIndex(0);
    closeAddPostModal();
  };

  const handleAddAnotherPost = () => {
    if (drafts.length >= MAX_DRAFTS) {
      setShowDraftNotice(
        `You've reached the maximum of ${MAX_DRAFTS} drafts for this batch. Please submit the batch before creating a new one.`,
      );
      return;
    }

    if (!activeDraft) return;

    setDrafts((previous) => {
      const next = [...previous, createEmptyDraft()];
      setActiveDraftIndex(next.length - 1);
      return next;
    });

    setShowValidation(false);
    setShowDraftNotice("");
  };

  const handleDeleteDraft = (indexToDelete: number) => {
    setDraftIndexToDelete(indexToDelete);
  };

  const confirmDeleteDraft = () => {
    if (draftIndexToDelete === null) return;

    const indexToDelete = draftIndexToDelete;
    const nextDrafts = drafts.filter((_, index) => index !== indexToDelete);

    setDrafts(nextDrafts);
    setDraftIndexToDelete(null);

    if (nextDrafts.length === 0) {
      setActiveDraftIndex(0);
      setShowValidation(false);
      return;
    }

    if (indexToDelete < activeDraftIndex) {
      setActiveDraftIndex(activeDraftIndex - 1);
    } else if (indexToDelete === activeDraftIndex) {
      setActiveDraftIndex(Math.min(indexToDelete, nextDrafts.length - 1));
    }
  };

  const handlePhotoChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!activeDraft) return;

    const selectedFiles = Array.from(event.target.files ?? []);
    const remainingSlots = MAX_PHOTOS - activeDraft.photos.length;

    const imageFiles = selectedFiles.filter(
      (file) => file.type === "image/png" || file.type === "image/jpeg",
    );

    const filesToAdd = imageFiles.slice(0, remainingSlots);

    const newPhotos: DraftPhoto[] = await Promise.all(
      filesToAdd.map(
        (file) =>
          new Promise<DraftPhoto>((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => {
              if (typeof reader.result === "string") {
                resolve({
                  name: file.name,
                  dataUrl: reader.result,
                });
              } else {
                reject(new Error("Unable to read image."));
              }
            };

            reader.onerror = () => reject(new Error("Unable to read image."));

            reader.readAsDataURL(file);
          }),
      ),
    ).catch(() => {
      setShowDraftNotice(
        "The photo cannot be read. Please try again using a PNG or JPG image..",
      );
      return [];
    });

    if (newPhotos.length > 0) {
      updateActiveDraft({
        photos: [...activeDraft.photos, ...newPhotos],
      });
    }

    if (imageFiles.length > remainingSlots) {
      setShowDraftNotice(
        `You can only add up to ${MAX_PHOTOS} photos per post.`,
      );
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
    setShowDraftNotice("");

    if (drafts.length === 0) {
      setShowDraftNotice("There are no drafts to submit.");
      return;
    }

    const invalidIndex = drafts.findIndex((draft) => !isDraftValid(draft));

    if (invalidIndex !== -1) {
      setActiveDraftIndex(invalidIndex);
      setShowDraftNotice(
        `Some fields are missing or invalid in Draft ${invalidIndex + 1}. Please complete all drafts before submitting.`,
      );
      return;
    }

    setShowSubmitConfirmation(true);
  };

const confirmSubmitAll = () => {
  if (!currentUserId || drafts.length === 0) return;

  const submittedAt = new Date().toISOString();

  const newPosts: SubmittedContribution[] = drafts.map((draft) => ({
    ...draft,
    userId: currentUserId,
    status: "Pending",
    submittedAt,
    batchId: crypto.randomUUID(),
  }));

  const allPosts = getAllSubmitted();
  saveAllSubmitted([...allPosts, ...newPosts]);

  setContribution((previous) => [...newPosts, ...previous]);
  setDrafts([]);
  setActiveDraftIndex(0);
  setShowSubmitConfirmation(false);
};

  const withdrawPendingPost = (postId: string) => {
    const allPosts = getAllSubmitted();

    const post = allPosts.find(
      (item) =>
        item.id === postId &&
        item.userId === currentUserId &&
        item.status === "Pending",
    );

    if (!post) return;

    const updatedDrafts = getUserDrafts(currentUserId);

    if (updatedDrafts.length >= MAX_DRAFTS) {
      setShowDraftNotice(
        "You already have 5 drafts. Delete a draft before withdrawing this post.",
      );
      return;
    }

    setPendingWithdrawPostId(postId);
    setShowWithdrawConfirmation(true);
  };

const cancelPendingPost = (postId: string) => {
  const post = getAllSubmitted().find(
    (item) =>
      item.id === postId &&
      item.userId === currentUserId &&
      item.status === "Pending",
  );

  if (!post) return;

  setPendingCancelPostId(postId);
  setShowCancelPostConfirmation(true);
};

const closeCancelPostConfirmation = () => {
  setShowCancelPostConfirmation(false);
  setPendingCancelPostId(null);
};

const confirmCancelPendingPost = () => {
  if (!pendingCancelPostId) return;

  const allPosts = getAllSubmitted();

  const post = allPosts.find(
    (item) =>
      item.id === pendingCancelPostId &&
      item.userId === currentUserId &&
      item.status === "Pending",
  );

  if (!post) {
    closeCancelPostConfirmation();
    return;
  }

  try {
    const updatedPosts = allPosts.filter(
      (item) =>
        !(
          item.id === pendingCancelPostId &&
          item.userId === currentUserId &&
          item.status === "Pending"
        ),
    );

    saveAllSubmitted(updatedPosts);

    setContribution((previous) =>
      previous.filter((item) => item.id !== pendingCancelPostId),
    );

    closeCancelPostConfirmation();
    setNotice("Pending post cancelled successfully.");
  } catch {
    setNotice("Unable to cancel the post. Please try again.");
  }
};


  const cancelWithdrawConfirmation = () => {
    setShowWithdrawConfirmation(false);
    setPendingWithdrawPostId(null);
  };

  const confirmWithdrawPendingPost = () => {
    if (!pendingWithdrawPostId) return;

    const postId = pendingWithdrawPostId;
    const allPosts = getAllSubmitted();

    const post = allPosts.find(
      (item) =>
        item.id === postId &&
        item.userId === currentUserId &&
        item.status === "Pending",
    );

    if (!post) {
      cancelWithdrawConfirmation();
      return;
    }

    const updatedDrafts = getUserDrafts(currentUserId);

    if (updatedDrafts.length >= MAX_DRAFTS) {
      cancelWithdrawConfirmation();
      setShowDraftNotice(
        "You already have 5 drafts. Delete a draft before withdrawing this post.",
      );
      return;
    }

    const editableDraft: ContributionDraft = {
      id: post.id,
      caption: post.caption,
      terminal: post.terminal,
      origin: post.origin,
      destination: post.destination,
      vehicle: post.vehicle,
      commuterType: post.commuterType,
      fare: post.fare,
      photos: post.photos,
      updatedAt: new Date().toISOString(),
    };

    const nextDrafts = [...updatedDrafts, editableDraft];

    if (!saveUserDrafts(currentUserId, nextDrafts)) {
      cancelWithdrawConfirmation();
      setShowDraftNotice(
        "Unable to save the draft. Browser storage may be full. Try removing some photos.",
      );
      return;
    }

    try {
      saveAllSubmitted(
        allPosts.filter(
          (item) => !(item.id === postId && item.userId === currentUserId),
        ),
      );
    } catch {
      cancelWithdrawConfirmation();
      setShowDraftNotice(
        "Unable to update submitted posts. Your editable draft remains saved. Please try again.",
      );
      return;
    }

    setWithdrawnOriginal(post);
    setDrafts(nextDrafts);
    setContribution((previous) =>
      previous.filter((item) => item.id !== postId),
    );
    setActiveDraftIndex(nextDrafts.length - 1);
    setShowValidation(false);
    setShowDraftNotice("");
    cancelWithdrawConfirmation();
    setShowAddPostModal(true);
  };
const deleteApprovedPost = (postId: string) => {
  const post = getAllSubmitted().find(
    (item) =>
      item.id === postId &&
      item.userId === currentUserId &&
      item.status === "Approved",
  );

  if (!post) return;

  setPendingDeletePostId(postId);
  setShowDeleteConfirmation(true);
};

const cancelDeleteConfirmation = () => {
  setShowDeleteConfirmation(false);
  setPendingDeletePostId(null);
};

const confirmDeleteApprovedPost = () => {
  if (!pendingDeletePostId) return;

  const allPosts = getAllSubmitted();

  const post = allPosts.find(
    (item) =>
      item.id === pendingDeletePostId &&
      item.userId === currentUserId &&
      item.status === "Approved",
  );

  if (!post) {
    cancelDeleteConfirmation();
    return;
  }

  try {
    const updatedPosts = allPosts.filter(
      (item) =>
        !(
          item.id === pendingDeletePostId &&
          item.userId === currentUserId &&
          item.status === "Approved"
        ),
    );

    saveAllSubmitted(updatedPosts);

    setContribution((previous) =>
      previous.filter((item) => item.id !== pendingDeletePostId),
    );

    cancelDeleteConfirmation();
    setNotice("Approved post deleted successfully.");
  } catch {
    setNotice(
      "Unable to delete the post. Please try again.",
    );
  }
};
  const startRevision = (contribution: SubmittedContribution) => {
    const revisionDraft: ContributionDraft = {
      id: contribution.id,
      caption: contribution.caption,
      terminal: contribution.terminal,
      origin: contribution.origin,
      destination: contribution.destination,
      vehicle: contribution.vehicle,
      commuterType: contribution.commuterType,
      fare: contribution.fare,
      photos: contribution.photos,
      updatedAt: new Date().toISOString(),
    };

    const existingDrafts = getUserDrafts(currentUserId);

    const nextDrafts = [
      ...existingDrafts.filter((draft) => draft.id !== contribution.id),
      revisionDraft,
    ];

    if (!saveUserDrafts(currentUserId, nextDrafts)) {
      setShowDraftNotice(
        "Unable to save the revision draft. Please try again.",
      );
      return;
    }

    setWithdrawnOriginal(null);
    setDrafts(nextDrafts);
    setActiveDraftIndex(nextDrafts.length - 1);
    setShowValidation(false);
    setShowDraftNotice("");
    setShowAddPostModal(true);
  };

  const routeError =
    showValidation &&
    Boolean(activeDraft) &&
    !activeDraft.terminal.trim() &&
    !activeDraft.origin.trim() &&
    !activeDraft.destination.trim();

  const fareError =
    showValidation &&
    Boolean(activeDraft) &&
    (!activeDraft.fare.trim() ||
      !/^\d+(\.\d{1,2})?$/.test(activeDraft.fare.trim()));

  const fieldClass = (hasError: boolean) =>
    `h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-1 ${
      hasError
        ? "border-red-500 focus:border-red-500 focus:ring-red-500"
        : "border-gray-300 focus:border-[#12395A] focus:ring-[#12395A]"
    }`;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#f7f7f7]">
      <aside className="absolute left-0 top-0 z-[2000] flex h-screen w-[220px] flex-col border-r border-white/10 bg-[#0f2a47] text-white sm:w-[230px] md:w-[240px] lg:w-[250px]">
        <button
          type="button"
          onClick={() => {
            window.location.href = "/home";
          }}
          title="Home"
          className="absolute flex items-center justify-center rounded-lg transition-colors duration-200 hover:bg-white/10"
          style={{ top: "30px", width: "100%", height: "75px" }}
        >
          <img
            src={qrouteWhiteLogo}
            alt="Qroute"
            className="max-h-full max-w-full object-contain"
          />
        </button>

        <nav className="absolute left-0 top-[145px] flex w-full flex-col gap-1.5 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.label === "Your Contribution";

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleNavigation(item.label)}
                className={`group flex h-[46px] w-full items-center rounded-xl px-3 text-left transition-colors duration-200 ${
                  isActive
                    ? "bg-[#d9dee3] font-semibold text-[#0f2a47]"
                    : "font-medium text-white hover:bg-[#d0d5db] hover:text-[#0f2a47]"
                }`}
              >
                <span className="flex w-[28px] shrink-0 items-center justify-center">
                  <Icon
                    size={19}
                    strokeWidth={1.8}
                    className="transition-transform duration-200 group-hover:scale-110"
                  />
                </span>
                <span
                  className="ml-2 whitespace-nowrap"
                  style={{ fontSize: "16px" }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <header className="absolute left-[220px] right-0 top-0 z-[40] flex min-h-[130px] items-start justify-between bg-[#f7f7f7] px-[30px] pt-[35px] sm:left-[20px] md:left-[290px] lg:left-[300px]">
        <div className="flex flex-col justify-center">
          <h1 className="text-[26px] font-semibold tracking-[-0.4px] text-gray-900">
            Your Contributions
          </h1>
          <p className="mt-1 text-[14px] text-gray-500">
            Manage your route contributions and published posts.
          </p>
        </div>

        <div className="relative flex h-[55px] -translate-y-[5px] items-center gap-[20px]">
          <button
            type="button"
            onClick={() => {
              console.log("Notifications clicked", { currentUserId });
            }}
            title="Notifications"
            className="group flex h-[45px] w-[45px] items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-200 hover:scale-105 hover:bg-gray-100 hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]"
          >
            <Bell
              size={20}
              strokeWidth={2}
              className="transition-transform duration-200 group-hover:rotate-6"
            />
          </button>

          <button
            type="button"
            onClick={() => setShowProfileMenu((previous) => !previous)}
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

          {showProfileMenu && (
            <div className="absolute right-0 top-[58px] z-[4000] w-[150px] rounded-xl bg-white p-2 shadow-[0_4px_15px_rgba(0,0,0,0.18)]">
              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu(false);
                  window.location.href = "/profile";
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                Account
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu(false);
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

      <section className="absolute inset-0 z-0 ml-[220px] overflow-y-auto pt-[10px] sm:ml-[230px] md:ml-[170px] lg:ml-[250px]">
        <div className="mx-auto w-full max-w-[900px] px-8 pb-12 pt-[105px]">
          <div className="h-[23px]" />

          <button
            type="button"
            onClick={openAddPostModal}
            className="group mt-7 flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 text-left shadow-[0_2px_8px_rgba(0,0,0,0.10)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-[0_4px_12px_rgba(0,0,0,0.14)]"
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

          <div className="mt-6 flex flex-col gap-3">
            {contribution.length === 0 ? (
              <div className="flex min-h-[330px] flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 text-center shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                <div className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[#f1f3f5]">
                  <Car
                    size={27}
                    strokeWidth={1.8}
                    className="text-gray-400"
                  />
                </div>
                <h2 className="mt-5 text-[17px] font-semibold text-gray-800">
                  Nothing to see here yet.
                </h2>
                <p className="mt-2 max-w-[380px] text-[13px] leading-[1.6] text-gray-500">
                  Your submitted contributions and their review statuses
                  will appear here.
                </p>
              </div>
            ) : (
              [...contribution]
  .sort(
    (a, b) =>
      new Date(b.submittedAt).getTime() -
      new Date(a.submittedAt).getTime()
  )
  .map((contribution) => (
                <article
                  key={contribution.id}
                  className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                >
                  <div className="flex flex-col gap-4 sm:flex-row">
                    {/* Picture preview */}
                    {contribution.photos[0] && (
                      <img
                        src={contribution.photos[0].dataUrl}
                        alt="Contribution preview"
                        className="h-28 w-full rounded-lg object-cover sm:w-36"
                      />
                    )}

                    <div className="min-w-0 flex-1">
                      {/* Submission date and status */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-gray-500">
                          Submitted {formatDate(contribution.submittedAt)}
                        </p>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            contribution.status === "Pending"
                              ? "bg-amber-100 text-amber-800"
                              : contribution.status === "Approved"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                          }`}
                        >
                          {contribution.status}
                        </span>
                      </div>

                      {/* Route or terminal */}
                      <p className="mt-2 break-words text-sm font-semibold text-gray-900">
                        {contribution.terminal?.trim()
                          ? contribution.terminal
                          : `${contribution.origin || "—"} → ${contribution.destination || "—"}`}
                      </p>

                      {/* Full details for Approved posts only */}
                      {contribution.status === "Approved" && (
                        <>
                          <p className="mt-2 break-words text-sm text-gray-700">
                            {contribution.caption}
                          </p>

                          <p className="mt-1 text-sm text-gray-600">
                            {contribution.origin || "—"} →{" "}
                            {contribution.destination || "—"}
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            {contribution.vehicle} ·{" "}
                            {contribution.commuterType} · ₱
                            {contribution.fare}
                          </p>

                          <div className="mt-3 flex justify-end">
  <button
    type="button"
    onClick={() => deleteApprovedPost(contribution.id)}
    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
  >
    <Trash2 size={14} />
    Delete Post
  </button>
</div>
                        </>
                      )}

                      {/* Pending action */}
                      
{contribution.status === "Pending" && (
  <div className="mt-3 flex flex-wrap gap-2">
    <button
      type="button"
      onClick={() => withdrawPendingPost(contribution.id)}
      className="rounded-lg border border-[#12395A] px-3 py-1.5 text-xs font-semibold text-[#12395A] transition-colors hover:bg-[#12395A] hover:text-white"
    >
      Withdraw to Edit
    </button>

    <button
      type="button"
      onClick={() => cancelPendingPost(contribution.id)}
      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
    >
      Cancel Post
    </button>
  </div>
)}


                      {/* Needs Revision */}
                      {contribution.status === "Needs Revision" && (
                        <div className="mt-3">
                          {contribution.adminFeedback && (
                            <p className="mb-2 text-sm text-red-700">
                              Admin feedback: {contribution.adminFeedback}
                            </p>
                          )}

                          <button
                            type="button"
                            onClick={() => startRevision(contribution)}
                            className="rounded-lg border border-[#12395A] px-3 py-1.5 text-xs font-semibold text-[#12395A] transition-colors hover:bg-[#12395A] hover:text-white"
                          >
                            Edit and Resubmit
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      {showAddPostModal && activeDraft && (
        <div
          className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/45 px-4 py-6"
          onClick={requestCloseAddPostModal}
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
                  Create Contributions
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Save up to {MAX_DRAFTS} separate posts for admin review.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={requestCloseAddPostModal}
                className="rounded-full px-2 py-1 text-xl leading-none text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
              >
                ×
              </button>
            </div>

            {showDraftNotice && (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                {showDraftNotice}
              </p>
            )}

            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
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
                  id="post-photo"
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
                  className="mb-1.5 block text-sm font-medium text-gray-700"
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
                <p className="mb-1.5 block text-sm font-medium text-gray-700">
                  Route details
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="post-point-a"
                      className="mb-1 block text-xs text-gray-500"
                    >
                      Point A / Origin
                    </label>
                    <input
                      id="post-point-a"
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
                      htmlFor="post-point-b"
                      className="mb-1 block text-xs text-gray-500"
                    >
                      Point B / Destination
                    </label>
                    <input
                      id="post-point-b"
                      value={activeDraft.destination}
                      onChange={(event) =>
                        updateActiveDraft({
                          destination: event.target.value,
                        })
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

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label
                    htmlFor="post-vehicle"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Type of vehicle <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="post-vehicle"
                    value={activeDraft.vehicle}
                    onChange={(event) =>
                      updateActiveDraft({ vehicle: event.target.value })
                    }
                    className={fieldClass(
                      showValidation && !activeDraft.vehicle.trim(),
                    )}
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
                    className="mb-1.5 block text-sm font-medium text-gray-700"
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
                    className="mb-1.5 block text-sm font-medium text-gray-700"
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
                          setShowDraftNotice("");
                        }}
                        className="px-3 py-2 text-xs font-semibold"
                      >
                        Draft {index + 1}
                        {hasContent ? " •" : ""}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete draft ${index + 1}`}
                        onClick={() => handleDeleteDraft(index)}
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

              <div className="mt-4 flex flex-col-reverse justify-end gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleAddAnotherPost}
                  disabled={drafts.length >= MAX_DRAFTS}
                  className="rounded-lg border border-[#12395A] px-4 py-2.5 text-sm font-semibold text-[#12395A] transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Add Another Post
                </button>
                <button
                  type="button"
                  onClick={handleSubmitAll}
                  disabled={isSubmitting || drafts.length === 0}
                  className="rounded-lg bg-[#12395A] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1b4b6f] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting..." : "Submit All"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {showSaveChangesConfirmation && (
        <div
          className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/45 px-4"
          onClick={() => setShowSaveChangesConfirmation(false)}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="save-changes-title"
            aria-describedby="save-changes-message"
            className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="save-changes-title"
              className="text-lg font-semibold text-gray-900"
            >
              Confirm changes?
            </h2>
            <p
              id="save-changes-message"
              className="mt-2 text-sm leading-relaxed text-gray-600"
            >
              Do you want to save your changes to this draft? It will stay in
              your drafts until you submit it again.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSaveChangesConfirmation(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={confirmSaveChanges}
                className="rounded-lg bg-[#12395A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1b4b6f]"
              >
                Yes, Save Changes
              </button>
            </div>
          </section>
        </div>
      )}

      {showLeaveConfirmation && (
        <div
          className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/45 px-4"
          onClick={() => setShowLeaveConfirmation(false)}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="leave-confirmation-title"
            aria-describedby="leave-confirmation-message"
            className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="leave-confirmation-title"
              className="text-lg font-semibold text-gray-900"
            >
              Leave without changes?
            </h2>
            <p
              id="leave-confirmation-message"
              className="mt-2 text-sm leading-relaxed text-gray-600"
            >
              Are you sure you want to leave without changing anything? This
              post will go back to your pending posts.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowLeaveConfirmation(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={confirmLeaveWithoutChanges}
                className="rounded-lg bg-[#12395A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1b4b6f]"
              >
                Yes, Leave
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

      {showWithdrawConfirmation && (
        <div
          className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/45 px-4"
          onClick={cancelWithdrawConfirmation}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="withdraw-confirmation-title"
            aria-describedby="withdraw-confirmation-message"
            className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="withdraw-confirmation-title"
              className="text-lg font-semibold text-gray-900"
            >
              Withdraw Pending Post?
            </h2>

            <p
              id="withdraw-confirmation-message"
              className="mt-2 text-sm leading-relaxed text-gray-600"
            >
              Are you sure you want to withdraw this pending post? It will be
              returned to your drafts so you can edit and resubmit it.
            </p>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelWithdrawConfirmation}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmWithdrawPendingPost}
                className="rounded-lg bg-[#12395A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1b4b6f]"
              >
                Confirm
              </button>
            </div>
          </section>
        </div>
      )}


{showCancelPostConfirmation && (
  <div
    className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/45 px-4"
    onClick={closeCancelPostConfirmation}
  >
    <section
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="cancel-post-title"
      aria-describedby="cancel-post-message"
      className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      <h2
        id="cancel-post-title"
        className="text-lg font-semibold text-gray-900"
      >
        Cancel Pending Post?
      </h2>

      <p
        id="cancel-post-message"
        className="mt-2 text-sm leading-relaxed text-gray-600"
      >
        Are you sure you want to cancel this pending post?
        It will be permanently removed from your submissions
        and will not be saved as a draft.
      </p>

      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          onClick={closeCancelPostConfirmation}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
        >
          Keep Post
        </button>

        <button
          type="button"
          onClick={confirmCancelPendingPost}
          className="rounded-lg bg-[#12395A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1b4b6f]"
        >
          Confirm
        </button>
      </div>
    </section>
  </div>
)}

{showDeleteConfirmation && (
  <div
    className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/45 px-4"
    onClick={cancelDeleteConfirmation}
  >
    <section
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-post-title"
      className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      <h2
        id="delete-post-title"
        className="text-lg font-semibold text-gray-900"
      >
        Delete Approved Post?
      </h2>

      <p className="mt-2 text-sm leading-relaxed text-gray-600">
        Are you sure you want to delete this approved post?
        This action cannot be undone.
      </p>

      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          onClick={cancelDeleteConfirmation}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
        >
          Keep Post
        </button>

        <button
          type="button"
          onClick={confirmDeleteApprovedPost}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Delete Post
        </button>
      </div>
    </section>
  </div>
)}

      {draftIndexToDelete !== null && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-[390px] rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900">
              Delete this draft?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              The current draft and its photos will be removed.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDraftIndexToDelete(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmDeleteDraft}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Delete Draft
              </button>
            </div>
          </div>
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
              className="shrink-0 text-lg leading-none text-white/80 hover:text-white"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </main>
  );
}