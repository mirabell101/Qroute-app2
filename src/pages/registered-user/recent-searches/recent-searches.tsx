
import { useState } from "react";
import {
  Award,
  Car,
  Home as HomeIcon,
  LogOut,
  MapPin,
  MessageSquare,
  UserRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import MapSidebar from "@/components/map-layout/MapSidebar";
import MapHeader from "@/components/map-layout/MapHeader";
import AccountAvatar from "@/components/account/AccountAvatar";
import { useAccountProfile } from "@/components/account/accountProfileStore";

import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";

import type { RecentSearchKind } from "@/lib/recentSearches";
import { useRecentSearches } from "@/components/recent-searches/recentSearchesStore";

interface RecentSearchesProps {
  currentUserId: string | null;
  onLogout: () => Promise<void>;
}

const navItems = [
  { label: "Recents", icon: HomeIcon },
  { label: "Saved", icon: MapPin },
  { label: "Your Contribution", icon: Car },
  { label: "Community", icon: MessageSquare },
];

const getKindLabel = (kind: RecentSearchKind): string =>
  kind === "route" ? "Route" : kind === "stop" ? "Stop" : "Terminal";

const formatSearchedAt = (searchedAt: number): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(searchedAt));

export default function RecentSearches({
  currentUserId,
  onLogout,
}: RecentSearchesProps) {
  const navigate = useNavigate();

  const { account, userId: profileUserId } = useAccountProfile();

  const profileAccount =
    currentUserId && profileUserId === currentUserId ? account : null;

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const { items, loading, error, remove, clear, retrySync } =
    useRecentSearches();

  const mapPath = currentUserId ? "/home" : "/";

  const handleNavigation = (label: string) => {
    switch (label) {
      case "Recents":
        navigate(currentUserId ? "/recents" : "/recent-searches");
        break;
      case "Saved":
        if (currentUserId) navigate("/saved");
        break;
      case "Your Contribution":
        if (currentUserId) navigate("/contribution");
        break;
      case "Community":
        navigate("/community");
        break;
      default:
        break;
    }
  };

  const handleSelect = (item: (typeof items)[number]) => {
    navigate(mapPath, {
      state: {
        savedSelection: {
          kind: item.kind,
          targetId: item.targetId,
        },
      },
    });
  };

  const handleRemove = (item: (typeof items)[number]) => {
    void remove(item.kind, item.targetId);
  };

  const handleClearAll = () => {
    if (
      !window.confirm(
        "Clear all recent searches? This cannot be undone."
      )
    ) {
      return;
    }

    void clear();
  };

  const handleAccountNavigation = () => {
    setShowProfileMenu(false);
    navigate("/profile");
  };

  const handleBadgesNavigation = () => {
    setShowProfileMenu(false);
    navigate("/points-badges");
  };

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);
    setLogoutError("");

    try {
      await onLogout();
      setShowProfileMenu(false);
      navigate("/");
    } catch (err) {
      console.error("Logout failed:", err);
      setLogoutError("Unable to log out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <MapSidebar
        logo={
          <img
            src={qrouteWhiteLogo}
            alt="Qroute"
            className="h-10 w-auto object-contain"
          />
        }
        logoTitle="Home"
        onLogoClick={() => navigate(mapPath)}
        items={navItems}
        onItemClick={handleNavigation}
      />

      <MapHeader>
        <div className="flex h-full w-full items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#0f2a47]">
              Recent Searches
            </h1>
            <p className="text-xs text-gray-500">
              Your recently selected routes, stops, and terminals
            </p>
          </div>

          {currentUserId && (
            <div className="relative flex h-full items-center">
              <button
                type="button"
                onClick={() => {
                  setLogoutError("");
                  setShowProfileMenu((previous) => !previous);
                }}
                className="h-10 w-10 overflow-hidden rounded-full border border-gray-200 bg-white transition hover:ring-2 hover:ring-[#0f2a47]/20"
                aria-label="Open account menu"
                aria-expanded={showProfileMenu}
              >
                <AccountAvatar
                  key={currentUserId}
                  account={profileAccount}
                  className="h-full w-full"
                  iconSize={21}
                />
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
                  <button
                    type="button"
                    onClick={handleAccountNavigation}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                  >
                    <UserRound className="h-4 w-4 text-gray-500" />
                    <span>Account</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleBadgesNavigation}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                  >
                    <Award className="h-4 w-4 text-gray-500" />
                    <span>Badges</span>
                  </button>

                  <div className="my-1 border-t border-gray-100" />

                  {logoutError && (
                    <p
                      role="alert"
                      className="px-4 py-2 text-xs text-red-600"
                    >
                      {logoutError}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    disabled={loggingOut}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>{loggingOut ? "Logging out..." : "Log Out"}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </MapHeader>

      <main className="min-h-screen pl-[270px] pr-6 pt-[115px] pb-10 sm:pr-8">
        <div className="mx-auto max-w-5xl">
          <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Your Recent Searches
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Reopen routes, stops, and terminals you recently selected.
              </p>

              <p className="mt-2 text-sm text-gray-500">
                {currentUserId
                  ? "Showing up to 25 recent searches. Your search history is kept for 30 days only and saved to your account."
                  : "Showing up to 25 recent searches. Your search history is kept for 30 days only. Clearing your browser or website data will permanently remove your search history."}
              </p>
            </div>

            {items.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="self-start rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-white"
              >
                Clear All
              </button>
            )}
          </header>

          {/* Error state */}
          {error && (
            <div
              role="alert"
              className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-red-50 p-4 text-sm text-red-800"
            >
              <span>{error}</span>

              {currentUserId && (
                <button
                  type="button"
                  onClick={() => void retrySync()}
                  className="font-semibold underline"
                >
                  Retry sync
                </button>
              )}
            </div>
          )}

          {/* Recent searches */}
          {loading ? (
            <p
              role="status"
              className="rounded-xl bg-white p-6 text-sm text-gray-500 shadow-sm"
            >
              Loading recent searches...
            </p>
          ) : items.length === 0 ? (
            <p className="rounded-xl bg-white p-6 text-sm text-gray-500 shadow-sm">
              Search for a route, stop, or terminal and select a result to see
              it here.
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => {
                const key = `${item.kind}:${item.targetId}`;
                const label = getKindLabel(item.kind);

                return (
                  <li
                    key={key}
                    className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">
                        {item.name}
                      </p>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                        <span>{label}</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={new Date(item.searchedAt).toISOString()}>
                          {formatSearchedAt(item.searchedAt)}
                        </time>
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelect(item)}
                        className="rounded-lg bg-[#0f2a47] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#183b60]"
                      >
                        View on map
                      </button>

                      <button
                        type="button"
                        aria-label={`Remove ${item.name} from recent searches`}
                        onClick={() => handleRemove(item)}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
