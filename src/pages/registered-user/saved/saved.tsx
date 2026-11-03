import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useSavedItems } from "@/components/saved/savedItemsStore";
import { mergeMapTerminals } from "@/lib/routeMap";
import type { RouteMapIndex } from "@/lib/routeMap";
import { getRouteMapIndex } from "@/lib/routes";
import type { SavedKind } from "@/lib/savedItems";
import { getTerminals } from "@/lib/terminals";
import type { Terminal } from "@/lib/terminals";

interface SavedCard {
  kind: SavedKind;
  targetId: number;
  name: string;
  details: string[];
}

interface SavedMapData {
  routeMapIndex: RouteMapIndex;
  terminals: Terminal[];
}

const categories: { kind: SavedKind; label: string }[] = [
  { kind: "route", label: "Saved Routes" },
  { kind: "stop", label: "Saved Stops" },
  { kind: "terminal", label: "Saved Terminals" },
];

export default function Saved() {
  const navigate = useNavigate();
  const {
    bookmarkIds,
    loading: bookmarksLoading,
    error: bookmarksError,
    removeBookmark,
  } = useSavedItems();
  const [activeCategory, setActiveCategory] = useState<SavedKind>("route");
  const [mapDataResult, setMapDataResult] = useState<{
    attempt: number;
    data: SavedMapData | null;
    error: string | null;
  }>({ attempt: -1, data: null, error: null });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void Promise.all([getRouteMapIndex(), getTerminals()])
      .then(([routeMapIndex, terminals]) => {
        if (active) {
          setMapDataResult({
            attempt: loadAttempt,
            data: { routeMapIndex, terminals },
            error: null,
          });
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setMapDataResult({
            attempt: loadAttempt,
            data: null,
            error:
              cause instanceof Error
                ? cause.message
                : "Unable to load public map information.",
          });
        }
      })

    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const mapDataLoading = mapDataResult.attempt !== loadAttempt;
  const mapData =
    mapDataResult.attempt === loadAttempt ? mapDataResult.data : null;
  const mapDataError =
    mapDataResult.attempt === loadAttempt ? mapDataResult.error : null;

  const mapPoints = useMemo(
    () =>
      mapData
        ? mergeMapTerminals(mapData.routeMapIndex, mapData.terminals)
        : [],
    [mapData]
  );

  const visibleItems = useMemo<Record<SavedKind, SavedCard[]>>(() => {
    if (!mapData) return { route: [], stop: [], terminal: [] };

    const routeCards = bookmarkIds.routeIds.flatMap((targetId) => {
      const route = mapData.routeMapIndex.routes.find(
        (item) => item.id === targetId
      );
      if (!route) return [];

      const routePoints = mapPoints
        .flatMap((point) => {
          const routeStop = point.routes.find(
            (item) => item.route.id === route.id
          );
          return routeStop ? [{ point, stopOrder: routeStop.stop_order }] : [];
        })
        .sort((left, right) => left.stopOrder - right.stopOrder);
      const origin = routePoints[0]?.point.name;
      const destination = routePoints[routePoints.length - 1]?.point.name;

      return [
        {
          kind: "route" as const,
          targetId,
          name: route.name,
          details: [
            route.transport_types.name,
            origin && destination ? `${origin} to ${destination}` : "",
          ].filter(Boolean),
        },
      ];
    });

    const pointCards = (kind: "stop" | "terminal") =>
      bookmarkIds[kind === "stop" ? "stopIds" : "terminalIds"].flatMap(
        (targetId) => {
          const point = mapPoints.find(
            (item) => item.kind === kind && item.ref_id === targetId
          );
          if (!point) return [];

          const servingRoutes = point.routes.map(
            ({ route }) => `${route.transport_types.name}: ${route.name}`
          );

          return [
            {
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
        }
      );

    return {
      route: routeCards,
      stop: pointCards("stop"),
      terminal: pointCards("terminal"),
    };
  }, [bookmarkIds, mapData, mapPoints]);

  const items = visibleItems[activeCategory];

  const handleRemove = async (item: SavedCard) => {
    const key = `${item.kind}:${item.targetId}`;
    setRemovingKey(key);
    setRemoveError(null);

    try {
      await removeBookmark(item.kind, item.targetId);
    } catch (cause: unknown) {
      setRemoveError(
        cause instanceof Error ? cause.message : "Unable to remove this item."
      );
    } finally {
      setRemovingKey(null);
    }
  };

  const selectItem = (item: SavedCard) => {
    navigate("/home", {
      state: {
        savedSelection: { kind: item.kind, targetId: item.targetId },
      },
    });
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={() => navigate("/home")}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition hover:text-[#0f2a47]"
        >
          <ArrowLeft size={18} />
          Back to map
        </button>

        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Saved</h1>
          <p className="mt-1 text-sm text-gray-500">
            Your bookmarked routes, stops, and terminals.
          </p>
        </header>

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

        {(bookmarksLoading || mapDataLoading) && (
          <p role="status" className="rounded-lg bg-white p-5 text-sm text-gray-500">
            Loading your saved items...
          </p>
        )}

        {(bookmarksError || mapDataError) && (
          <div role="alert" className="rounded-lg bg-red-50 p-5 text-sm text-red-700">
            <p>{bookmarksError ?? mapDataError}</p>
            {mapDataError && (
              <button
                type="button"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                className="mt-3 font-semibold underline"
              >
                Retry loading map information
              </button>
            )}
          </div>
        )}

        {removeError && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
            {removeError}
          </p>
        )}

        {!bookmarksLoading &&
          !mapDataLoading &&
          !bookmarksError &&
          !mapDataError &&
          (items.length === 0 ? (
            <p className="rounded-lg bg-white p-6 text-sm text-gray-500 shadow-sm">
              No saved {activeCategory === "route" ? "routes" : `${activeCategory}s`} yet.
              Save items from their information panel on the map.
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => {
                const key = `${item.kind}:${item.targetId}`;
                const isRemoving = removingKey === key;

                return (
                  <li
                    key={key}
                    className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{item.name}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500">
                        {item.details.map((detail) => (
                          <span key={detail}>{detail}</span>
                        ))}
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => selectItem(item)}
                        className="rounded-lg bg-[#0f2a47] px-4 py-2 text-sm font-medium text-white hover:bg-[#183b60]"
                      >
                        View on map
                      </button>
                      <button
                        type="button"
                        disabled={isRemoving}
                        onClick={() => void handleRemove(item)}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isRemoving ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ))}
      </div>
    </main>
  );
}
