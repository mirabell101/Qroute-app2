
import { useEffect, useMemo, useState } from "react";
import {
  Award,
  Bell,
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

import { useSavedItems } from "@/components/saved/savedItemsStore";
import { mergeMapTerminals } from "@/lib/routeMap";
import type { RouteMapIndex } from "@/lib/routeMap";
import { getRouteMapIndex } from "@/lib/routes";
import type {
  SavedJourneyEndpoint,
  SavedKind,
  SavedRouteBookmark,
} from "@/lib/savedItems";
import { getTerminals } from "@/lib/terminals";
import type { Terminal } from "@/lib/terminals";

// ============================================================
// TYPES
// ============================================================

interface SavedProps {
  currentUserId: string | null;
  onLogout: () => Promise<void>;
}

interface SavedCard {
  /**
   * Stable UI identity.
   *
   * Route bookmark cards use the saved_routes bookmark ID.
   * Individual stops and terminals use their kind and target ID.
   */
  key: string;

  kind: SavedKind;
  targetId: number;
  name: string;
  details: string[];

  /**
   * Only route bookmark cards have a bookmarkId.
   * This is the saved_routes.id, not the route ID.
   */
  bookmarkId?: number;

  /**
   * Present only when the card represents a saved journey.
   */
  journey?: {
    origin: SavedJourneyEndpoint;
    destination: SavedJourneyEndpoint;
  };
}

interface SavedMapData {
  routeMapIndex: RouteMapIndex;
  terminals: Terminal[];
}

interface SavedMapDataResult {
  key: string;
  data: SavedMapData | null;
  error: string | null;
}

// ============================================================
// CONSTANTS
// ============================================================

const categories: {
  kind: SavedKind;
  label: string;
}[] = [
  { kind: "route", label: "Saved Routes & Journeys" },
  { kind: "stop", label: "Saved Stops" },
  { kind: "terminal", label: "Saved Terminals" },
];

const navItems = [
  { label: "Recents", icon: HomeIcon },
  { label: "Saved", icon: MapPin },
  { label: "Your Contribution", icon: Car },
  { label: "Community", icon: MessageSquare },
];

// ============================================================
// HELPERS
// ============================================================

function createMapRequestKey(
  userId: string | null,
  attempt: number,
): string {
  return JSON.stringify([userId, attempt]);
}

/**
 * Resolve a saved journey endpoint to its currently available
 * public map point.
 *
 * A fallback label is used when a location is not currently
 * included in the public map response. This prevents the saved
 * bookmark from disappearing simply because its point cannot
 * currently be resolved from public map data.
 */
function getJourneyEndpointName(
  endpoint: SavedJourneyEndpoint,
  mapPoints: ReturnType<typeof mergeMapTerminals>,
): string {
  const point = mapPoints.find(
    (item) =>
      item.kind === endpoint.kind &&
      item.ref_id === endpoint.id,
  );

  if (point) {
    return point.name;
  }

  const endpointLabel =
    endpoint.kind === "stop" ? "Stop" : "Terminal";

  return `${endpointLabel} #${endpoint.id}`;
}

/**
 * Build a saved route card from a complete saved_routes record.
 *
 * Whole-route bookmarks and journey bookmarks are intentionally
 * represented separately, even when they refer to the same route.
 *
 * Journey cards use the passenger-defined journey name as their
 * primary title. Their endpoints and selected route are supporting
 * details rather than being used to reconstruct the title.
 */
function createRouteCard(
  bookmark: SavedRouteBookmark,
  routeMapIndex: RouteMapIndex,
  mapPoints: ReturnType<typeof mergeMapTerminals>,
): SavedCard {
  const route = routeMapIndex.routes.find(
    (item) => item.id === bookmark.routeId,
  );

  const routePoints = route
    ? mapPoints
        .flatMap((point) => {
          const routeStop = point.routes.find(
            (item) => item.route.id === route.id,
          );

          return routeStop
            ? [
                {
                  point,
                  stopOrder: routeStop.stop_order,
                },
              ]
            : [];
        })
        .sort(
          (left, right) =>
            left.stopOrder - right.stopOrder,
        )
    : [];

  const transportName = route?.transport_types?.name;

  // ----------------------------------------------------------
  // WHOLE-ROUTE BOOKMARK
  // ----------------------------------------------------------

  if (bookmark.bookmarkType === "whole_route") {
    const origin = routePoints[0]?.point.name;

    const destination =
      routePoints[routePoints.length - 1]?.point.name;

    return {
      key: `route-bookmark:${bookmark.id}`,
      kind: "route",
      targetId: bookmark.routeId,
      bookmarkId: bookmark.id,
      name: route?.name ?? `Route #${bookmark.routeId}`,
      details: [
        transportName ?? "Whole-route bookmark",
        origin && destination
          ? `${origin} to ${destination}`
          : route
            ? "Route path details unavailable"
            : "Route is not currently available on the public map",
      ],
    };
  }

  // ----------------------------------------------------------
  // JOURNEY BOOKMARK
  // ----------------------------------------------------------

  const originName = getJourneyEndpointName(
    bookmark.origin,
    mapPoints,
  );

  const destinationName = getJourneyEndpointName(
    bookmark.destination,
    mapPoints,
  );

  return {
    key: `route-bookmark:${bookmark.id}`,
    kind: "route",
    targetId: bookmark.routeId,
    bookmarkId: bookmark.id,

    // Use the passenger-defined name.
    name: bookmark.journeyName,

    // Keep the actual journey endpoints and selected service
    // visible independently of the passenger-defined title.
    details: [
      `${originName} → ${destinationName}`,
      route?.name ?? `Route #${bookmark.routeId}`,
      transportName ?? "Saved journey",
      ...(
        route
          ? []
          : [
              "Route is not currently available on the public map",
            ]
      ),
    ],

    journey: {
      origin: bookmark.origin,
      destination: bookmark.destination,
    },
  };
}

// ============================================================
// PAGE
// ============================================================

export default function Saved({
  currentUserId,
  onLogout,
}: SavedProps) {
  const navigate = useNavigate();

  const { account, userId: profileUserId } =
    useAccountProfile();

  const profileAccount =
    profileUserId === currentUserId ? account : null;

  // ----------------------------------------------------------
  // ACCOUNT MENU STATE
  // ----------------------------------------------------------

  const [showProfileMenu, setShowProfileMenu] =
    useState(false);

  const [showSignInPrompt, setShowSignInPrompt] =
    useState(false);

  const [loggingOut, setLoggingOut] =
    useState(false);

  const [logoutError, setLogoutError] =
    useState<string | null>(null);

  // ----------------------------------------------------------
  // SAVED ITEMS CONTEXT
  // ----------------------------------------------------------

  const {
    bookmarkIds,
    routeBookmarks,
    loading: bookmarksLoading,
    error: bookmarksError,
    removeBookmark,
    removeRouteBookmark,
  } = useSavedItems();

  // ----------------------------------------------------------
  // PAGE STATE
  // ----------------------------------------------------------

  const [activeCategory, setActiveCategory] =
    useState<SavedKind>("route");

  const [mapDataResult, setMapDataResult] =
    useState<SavedMapDataResult>({
      key: "",
      data: null,
      error: null,
    });

  const [loadAttempt, setLoadAttempt] =
    useState(0);

  const [removingKey, setRemovingKey] =
    useState<string | null>(null);

  const [removeError, setRemoveError] =
    useState<string | null>(null);

  // ==========================================================
  // LOAD PUBLIC MAP INFORMATION
  // ==========================================================

  const mapRequestKey = createMapRequestKey(
    currentUserId,
    loadAttempt,
  );

  useEffect(() => {
    let active = true;

    const requestKey = createMapRequestKey(
      currentUserId,
      loadAttempt,
    );

    void Promise.all([
      getRouteMapIndex(currentUserId),
      getTerminals(currentUserId),
    ])
      .then(([routeMapIndex, terminals]) => {
        if (!active) {
          return;
        }

        setMapDataResult({
          key: requestKey,
          data: {
            routeMapIndex,
            terminals,
          },
          error: null,
        });
      })
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }

        setMapDataResult({
          key: requestKey,
          data: null,
          error:
            cause instanceof Error
              ? cause.message
              : "Unable to load public map information.",
        });
      });

    return () => {
      active = false;
    };
  }, [currentUserId, loadAttempt]);

  const mapDataLoading =
    mapDataResult.key !== mapRequestKey;

  const mapData =
    mapDataResult.key === mapRequestKey
      ? mapDataResult.data
      : null;

  const mapDataError =
    mapDataResult.key === mapRequestKey
      ? mapDataResult.error
      : null;

  // ==========================================================
  // MAP POINTS
  // ==========================================================

  const mapPoints = useMemo(
    () =>
      mapData
        ? mergeMapTerminals(
            mapData.routeMapIndex,
            mapData.terminals,
          )
        : [],
    [mapData],
  );

  // ==========================================================
  // BUILD VISIBLE SAVED ITEMS
  // ==========================================================

  const visibleItems = useMemo<
    Record<SavedKind, SavedCard[]>
  >(() => {
    if (!mapData) {
      return {
        route: [],
        stop: [],
        terminal: [],
      };
    }

    // --------------------------------------------------------
    // ROUTE AND JOURNEY CARDS
    // --------------------------------------------------------

    const routeCards = routeBookmarks.map(
      (bookmark) =>
        createRouteCard(
          bookmark,
          mapData.routeMapIndex,
          mapPoints,
        ),
    );

    // --------------------------------------------------------
    // INDIVIDUAL STOP AND TERMINAL CARDS
    // --------------------------------------------------------

    const pointCards = (
      kind: "stop" | "terminal",
    ): SavedCard[] =>
      bookmarkIds[
        kind === "stop" ? "stopIds" : "terminalIds"
      ].flatMap((targetId) => {
        const point = mapPoints.find(
          (item) =>
            item.kind === kind &&
            item.ref_id === targetId,
        );

        if (!point) {
          return [];
        }

        const servingRoutes = point.routes.map(
          ({ route }) =>
            `${route.transport_types.name}: ${route.name}`,
        );

        return [
          {
            key: `${kind}:${targetId}`,
            kind,
            targetId,
            name: point.name,
            details: [
              kind === "stop"
                ? point.stop_type === "train_station"
                  ? "Train station"
                  : "Bus / jeepney stop"
                : "Transit terminal",
              ...servingRoutes,
              `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`,
            ],
          },
        ];
      });

    return {
      route: routeCards,
      stop: pointCards("stop"),
      terminal: pointCards("terminal"),
    };
  }, [
    routeBookmarks,
    bookmarkIds,
    mapData,
    mapPoints,
  ]);

  const items = visibleItems[activeCategory];

  // ==========================================================
  // NAVIGATION
  // ==========================================================

  const handleNavigation = (label: string) => {
    switch (label) {
      case "Recents":
        navigate("/recents");
        break;

      case "Saved":
        navigate("/saved");
        break;

      case "Your Contribution":
        navigate("/contribution");
        break;

      case "Community":
        navigate("/community");
        break;

      default:
        break;
    }
  };

  // ==========================================================
  // LOGOUT
  // ==========================================================

  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    setLogoutError(null);

    try {
      await onLogout();

      setShowProfileMenu(false);
      navigate("/");
    } catch (cause: unknown) {
      setLogoutError(
        cause instanceof Error
          ? cause.message
          : "Unable to log out. Please try again.",
      );

      setLoggingOut(false);
    }
  };

  // ==========================================================
  // REMOVE SAVED ITEM
  // ==========================================================

  const handleRemove = async (item: SavedCard) => {
    setRemovingKey(item.key);
    setRemoveError(null);

    try {
      if (item.kind === "route") {
        if (item.bookmarkId == null) {
          throw new Error(
            "The saved route bookmark ID is missing.",
          );
        }

        const removed = await removeRouteBookmark(
          item.bookmarkId,
        );

        if (!removed) {
          throw new Error(
            "This saved bookmark was not found or is no longer available.",
          );
        }
      } else {
        await removeBookmark(
          item.kind,
          item.targetId,
        );
      }
    } catch (cause: unknown) {
      setRemoveError(
        cause instanceof Error
          ? cause.message
          : "Unable to remove this item.",
      );
    } finally {
      setRemovingKey(null);
    }
  };

  // ==========================================================
  // SELECT SAVED ITEM
  // ==========================================================

  const selectItem = (item: SavedCard) => {
    navigate("/home", {
      state: {
        savedSelection: {
          /**
           * Preserve the existing selection contract.
           *
           * kind="route" and targetId still identify the route
           * for existing map-selection behavior.
           */
          kind: item.kind,
          targetId: item.targetId,

          /**
           * Additional route bookmark metadata.
           *
           * This distinguishes an individual journey from
           * a whole-route bookmark.
           */
          bookmarkId: item.bookmarkId ?? null,

          bookmarkType: item.journey
            ? "journey"
            : item.kind === "route"
              ? "whole_route"
              : null,

          journey: item.journey ?? null,
        },
      },
    });
  };

  // ==========================================================
  // RENDER
  // ==========================================================

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
        onLogoClick={() => navigate("/home")}
        items={navItems}
        onItemClick={handleNavigation}
      />

      <MapHeader>
        <div className="flex h-full w-full items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#0f2a47]">
              Saved Items
            </h1>

            <p className="text-xs text-gray-500">
              Your bookmarked routes, journeys, stops, and terminals
            </p>
          </div>

          {/* Header actions */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              title="Notifications"
              aria-label="Notifications"
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100"
            >
              <Bell size={20} strokeWidth={2} />
            </button>

            {/* Account menu */}
            <div className="relative">
              <button
                type="button"
                title="Account menu"
                aria-label="Open account menu"
                aria-expanded={showProfileMenu}
                onClick={() => {
                  setShowProfileMenu(
                    (previous) => !previous,
                  );

                  setLogoutError(null);
                }}
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#e8eef3] text-[#12395A] transition hover:ring-2 hover:ring-[#12395A]/20"
              >
                <AccountAvatar
                  key={currentUserId ?? "anonymous"}
                  account={profileAccount}
                  className="h-full w-full"
                  iconSize={21}
                />
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 top-[58px] z-[4000] w-[150px] rounded-xl bg-white p-2 shadow-[0_4px_15px_rgba(0,0,0,0.18)]">
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileMenu(false);
                      navigate("/profile");
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100"
                  >
                    <UserRound size={16} />
                    Account
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileMenu(false);

                      if (currentUserId) {
                        navigate("/points-badges");
                      } else {
                        setShowSignInPrompt(true);
                      }
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100"
                  >
                    <Award size={16} />
                    Badges
                  </button>

                  <div className="my-1 border-t border-gray-100" />

                  <button
                    type="button"
                    disabled={loggingOut}
                    onClick={() => void handleLogout()}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <LogOut size={16} />
                    {loggingOut
                      ? "Logging out..."
                      : "Log Out"}
                  </button>

                  {logoutError && (
                    <p
                      role="alert"
                      className="mt-2 px-2 text-xs text-red-600"
                    >
                      {logoutError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </MapHeader>

      {/* Sign-in prompt */}
      {showSignInPrompt && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="signin-prompt-title"
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
          >
            <h2
              id="signin-prompt-title"
              className="text-lg font-bold text-[#0f2a47]"
            >
              Sign in required
            </h2>

            <p className="mt-2 text-sm text-gray-600">
              Please sign in to view your QPoints and badges.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSignInPrompt(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => navigate("/signin")}
                className="rounded-lg bg-[#0f2a47] px-4 py-2 text-sm font-medium text-white hover:bg-[#183b60]"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="min-h-screen pl-[270px] pr-6 pt-[115px] pb-10 sm:pr-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              Your Saved Items
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Manage the routes, journeys, stops, and terminals you have bookmarked.
            </p>
          </div>

          {/* Saved item categories */}
          <div
            role="group"
            aria-label="Saved item categories"
            className="mb-5 flex flex-wrap gap-2"
          >
            {categories.map(({ kind, label }) => (
              <button
                key={kind}
                type="button"
                aria-pressed={activeCategory === kind}
                onClick={() => {
                  setActiveCategory(kind);
                  setRemoveError(null);
                }}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeCategory === kind
                    ? "bg-[#0f2a47] text-white"
                    : "bg-white text-gray-600 shadow-sm hover:bg-gray-100"
                }`}
              >
                {label} ({visibleItems[kind].length})
              </button>
            ))}
          </div>

          {/* Loading state */}
          {(bookmarksLoading || mapDataLoading) && (
            <p
              role="status"
              className="rounded-lg bg-white p-5 text-sm text-gray-500 shadow-sm"
            >
              Loading your saved items...
            </p>
          )}

          {/* Loading errors */}
          {(bookmarksError || mapDataError) && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 p-5 text-sm text-red-700"
            >
              <p>{bookmarksError ?? mapDataError}</p>

              {mapDataError && (
                <button
                  type="button"
                  onClick={() =>
                    setLoadAttempt(
                      (attempt) => attempt + 1,
                    )
                  }
                  className="mt-3 font-semibold underline"
                >
                  Retry loading map information
                </button>
              )}
            </div>
          )}

          {/* Bookmark removal error */}
          {removeError && (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700"
            >
              {removeError}
            </p>
          )}

          {/* Saved items */}
          {!bookmarksLoading &&
            !mapDataLoading &&
            !bookmarksError &&
            !mapDataError &&
            (items.length === 0 ? (
              <p className="rounded-lg bg-white p-6 text-sm text-gray-500 shadow-sm">
                No saved{" "}
                {activeCategory === "route"
                  ? "routes or journeys"
                  : `${activeCategory}s`}{" "}
                yet. Save items from their information panel on the map.
              </p>
            ) : (
              <ul className="space-y-3">
                {items.map((item) => {
                  const isRemoving =
                    removingKey === item.key;

                  return (
                    <li
                      key={item.key}
                      className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">
                          {item.name}
                        </p>

                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500">
                          {item.details.map(
                            (detail, index) => (
                              <span
                                key={`${item.key}:detail:${index}`}
                              >
                                {detail}
                              </span>
                            ),
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => selectItem(item)}
                          className="rounded-lg bg-[#0f2a47] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#183b60]"
                        >
                          View on map
                        </button>

                        <button
                          type="button"
                          disabled={isRemoving}
                          onClick={() => void handleRemove(item)}
                          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isRemoving
                            ? "Removing..."
                            : "Remove"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ))}
        </div>
      </main>
    </div>
  );
}
