import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  Accessibility,
  GraduationCap,
  UserRound,
  Users,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import { findRouteStopIndex } from "@/lib/routeMap";
import type { RouteDetails } from "@/lib/routes";

import {
  hasSavedBookmark,
  normalizeSavedJourneyName,
  SAVED_JOURNEY_NAME_MAX_LENGTH,
} from "@/lib/savedItems";

import type {
  SavedJourneyEndpoint,
} from "@/lib/savedItems";

import { useSavedItems } from "@/components/saved/savedItemsStore";

import { stopTypeLabel } from "./useTransitMap";
import type { TransitMapController } from "./useTransitMap";

// ============================================================
// TYPES
// ============================================================

type SelectedMapPlace =
  NonNullable<TransitMapController["selectedPlace"]>;

type SelectedMapImage =
  TransitMapController["selectedPlaceImages"][number];

type PhotoGalleryPlace = Pick<
  SelectedMapPlace,
  "kind" | "ref_id" | "name"
>;

type PhotoGalleryEntry = {
  place: PhotoGalleryPlace;
  // Map selections remain in the viewing history. Route-list
  // selections represent journey endpoints and can be replaced.
  source: "history" | "endpoint";
};

function photoPlaceKey(
  place: PhotoGalleryPlace | null | undefined,
): string | null {
  return place ? `${place.kind}-${place.ref_id}` : null;
}

// ============================================================
// CONSTANTS
// ============================================================

const JOURNEY_BOOKMARKS_ENABLED = true;

// ============================================================
// HELPERS
// ============================================================

const peso = (value: number) => `₱${value.toFixed(2)}`;
const wholePeso = (value: number) => `₱${value.toFixed(0)}`;

/**
 * Generates the suggested passenger-defined journey name.
 *
 * The generated name is kept within the same 80-character
 * limit enforced by savedItems.ts and the database.
 */
function createSuggestedJourneyName(
  originName: string,
  destinationName: string,
): string {
  const suggestedName =
    `${originName} → ${destinationName}`;

  return Array.from(suggestedName)
    .slice(0, SAVED_JOURNEY_NAME_MAX_LENGTH)
    .join("");
}

/**
 * Displays all approved public photographs belonging to
 * one specific terminal or stop.
 *
 * Terminal and stop photographs are deliberately rendered
 * in separate gallery sections.
 */
function PlacePhotoGallery({
  placeName,
  images,
}: {
  placeName: string;
  images: SelectedMapImage[];
}) {
  if (images.length === 0) {
    return null;
  }

  return (
    <section
      aria-label={`${placeName} community photos`}
      className="mt-3"
    >
      <h3 className="mb-2 text-xs font-semibold text-gray-800">
        {placeName}
      </h3>

      <div
        className={`grid gap-2 ${
          images.length === 1
            ? "grid-cols-1"
            : "grid-cols-2"
        }`}
        role="group"
        aria-label={`Community photos of ${placeName}`}
      >
        {images.map((image, index) => {
          const isThirdPhoto =
            images.length === 3 && index === 2;

          const isFullWidth =
            images.length === 1 || isThirdPhoto;

          return (
            <figure
              key={image.id}
              className={`min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 ${
                isThirdPhoto ? "col-span-2" : ""
              }`}
            >
              <img
                src={image.url}
                alt={
                  image.caption?.trim()
                    ? `${placeName}: ${image.caption.trim()}`
                    : `Photo ${index + 1} of ${placeName}`
                }
                loading="lazy"
                className={`w-full object-cover ${
                  isFullWidth
                    ? "aspect-[16/9]"
                    : "aspect-[4/3]"
                }`}
              />

              <figcaption className="truncate border-t border-gray-100 px-2 py-1.5 text-[10px] text-gray-600">
                {image.caption?.trim() ||
                  `Community photo ${index + 1}`}
              </figcaption>
            </figure>
          );
        })}
      </div>

      <p className="mt-1.5 text-right text-[10px] text-gray-400">
        {images.length} approved{" "}
        {images.length === 1
          ? "community photo"
          : "community photos"}
      </p>
    </section>
  );
}

// ============================================================
// COMPONENT
// ============================================================

export function TransitMapPanel({
  map,
  className = "absolute left-4 top-24 z-[1500] max-h-[calc(100vh-130px)] w-[min(360px,calc(100vw-32px))] overflow-y-auto rounded-xl bg-white p-4 shadow-lg",
  renderRouteActions,
}: {
  map: TransitMapController;
  className?: string;

  // Page-specific actions (e.g. Home's "Edit route") stay in the page shell.
  renderRouteActions?: (route: RouteDetails) => ReactNode;
}) {
  const navigate = useNavigate();

  // ==========================================================
  // SAVED ITEMS CONTEXT
  // ==========================================================

  const {
    userId,
    bookmarkIds,
    routeBookmarks,
    loading: bookmarksLoading,
    error: bookmarksError,
    addBookmark,
    removeBookmark,
    addJourneyBookmark,
  } = useSavedItems();

  // ==========================================================
  // BOOKMARK ACTION STATE
  // ==========================================================

  const [bookmarkActionKey, setBookmarkActionKey] =
    useState<string | null>(null);

  const [bookmarkActionError, setBookmarkActionError] =
    useState<string | null>(null);

  // ==========================================================
  // JOURNEY ACTION STATE
  // ==========================================================

  const [journeyName, setJourneyName] =
    useState("");

  const [journeySaving, setJourneySaving] =
    useState(false);

  const [journeyActionError, setJourneyActionError] =
    useState<string | null>(null);

  // ==========================================================
  // LOGIN PROMPT STATE
  // ==========================================================

  const [showLoginPrompt, setShowLoginPrompt] =
    useState(false);

  // ==========================================================
  // SELECTED PHOTO GALLERY COLLECTION
  // ==========================================================

  const [photoGalleryEntries, setPhotoGalleryEntries] =
    useState<PhotoGalleryEntry[]>([]);

  const previousJourneyEndpoints = useRef<{
    boarding: string | null;
    destination: string | null;
  }>({
    boarding: null,
    destination: null,
  });

  const handledPhotoSelectionSequence = useRef(0);

  // ==========================================================
  // MAP CONTROLLER
  // ==========================================================

  const {
    selectedPlace,
    pointImages,
    photoSelectionEvent,
    selectedRoute,
    selectedRouteStops,
    routesLoading,
    routeStopsLoading,
    roadRouteLoading,
    routeMapError,
    routeError,
    selectionError,
    routeMapIndex,

    routeDistanceMeters,
    routeDurationSeconds,

    routeColor,
    isRailRoute,
    originName,
    destinationName,

    boardingIndex,
    destinationIndex,
    boardingStop,
    destinationStop,

    fareOption,
    fareOptionLoading,
    fareOptionError,

    railFareLoading,
    railFareError,

    hasTripSegment,
    tripDistanceMeters,
    tripDurationSeconds,
    journeyGeometryError,

    fareCards,

    handleRouteListPick,
    clearTrip,
    clearSelectedRoute,
    closePlace,
  } = map;

  // ==========================================================
  // UPDATE THE ORDERED PHOTO GALLERY COLLECTION
  // ==========================================================

  const currentBoardingPhotoKey = photoPlaceKey(boardingStop);
  const currentDestinationPhotoKey = photoPlaceKey(destinationStop);

  useEffect(() => {
    const currentEndpoints = {
      boarding: currentBoardingPhotoKey,
      destination: currentDestinationPhotoKey,
    };

    if (!selectedPlace) {
      // Closing the place details starts a fresh gallery session.
      setPhotoGalleryEntries([]);
      previousJourneyEndpoints.current = currentEndpoints;
      handledPhotoSelectionSequence.current =
        photoSelectionEvent?.sequence ??
        handledPhotoSelectionSequence.current;
      return;
    }

    const event = photoSelectionEvent;

    if (
      !event ||
      event.sequence === handledPhotoSelectionSequence.current
    ) {
      previousJourneyEndpoints.current = currentEndpoints;
      return;
    }

    const previousEndpoints = previousJourneyEndpoints.current;
    const selectedPlaceKey = photoPlaceKey(event.place);

    setPhotoGalleryEntries((current) => {
      let next = [...current];

      // A route-list click explicitly changes the journey endpoint.
      // Remove the old endpoint-only gallery when that endpoint is
      // replaced, but keep locations that were separately selected
      // from the map as part of the user's viewing history.
      if (event.source === "route-list") {
        if (
          previousEndpoints.boarding &&
          currentEndpoints.boarding &&
          previousEndpoints.boarding !== currentEndpoints.boarding &&
          previousEndpoints.boarding !== currentEndpoints.destination
        ) {
          next = next.filter((entry) =>
            photoPlaceKey(entry.place) !== previousEndpoints.boarding ||
            entry.source === "history"
          );
        }

        if (
          previousEndpoints.destination &&
          currentEndpoints.destination &&
          previousEndpoints.destination !== currentEndpoints.destination &&
          previousEndpoints.destination !== currentEndpoints.boarding
        ) {
          next = next.filter((entry) =>
            photoPlaceKey(entry.place) !== previousEndpoints.destination ||
            entry.source === "history"
          );
        }
      }

      if (!selectedPlaceKey) {
        return next;
      }

      const existingIndex = next.findIndex(
        (entry) => photoPlaceKey(entry.place) === selectedPlaceKey,
      );

      const nextSource =
        event.source === "map" ? "history" : "endpoint";
      const selectedGalleryPlace: PhotoGalleryPlace = {
        kind: event.place.kind,
        ref_id: event.place.ref_id,
        name: event.place.name,
      };

      if (existingIndex >= 0) {
        const existing = next[existingIndex];
        next[existingIndex] = {
          place: selectedGalleryPlace,
          // Once a location was independently selected on the map,
          // replacing a journey endpoint must not remove its gallery.
          source:
            existing.source === "history" || nextSource === "history"
              ? "history"
              : "endpoint",
        };
      } else {
        next.push({
          place: selectedGalleryPlace,
          source: nextSource,
        });
      }

      return next;
    });

    previousJourneyEndpoints.current = currentEndpoints;
    handledPhotoSelectionSequence.current = event.sequence;
  }, [
    selectedPlace?.kind,
    selectedPlace?.ref_id,
    photoSelectionEvent?.sequence,
    currentBoardingPhotoKey,
    currentDestinationPhotoKey,
  ]);

  // ==========================================================
  // JOURNEY ENDPOINTS
  // ==========================================================

  /**
   * Only the actual selected boarding and destination stops
   * are used to construct a saved journey.
   *
   * The selected public route is validated separately by the
   * database before journey insertion is eventually enabled.
   */
  const boardingEndpoint: SavedJourneyEndpoint | null =
    boardingStop &&
    (
      boardingStop.kind === "stop" ||
      boardingStop.kind === "terminal"
    )
      ? {
          kind: boardingStop.kind,
          id: boardingStop.ref_id,
        }
      : null;

  const destinationEndpoint: SavedJourneyEndpoint | null =
    destinationStop &&
    (
      destinationStop.kind === "stop" ||
      destinationStop.kind === "terminal"
    )
      ? {
          kind: destinationStop.kind,
          id: destinationStop.ref_id,
        }
      : null;

  // ==========================================================
  // SUGGESTED JOURNEY NAME
  // ==========================================================

  const suggestedJourneyName =
    hasTripSegment &&
    boardingStop &&
    destinationStop
      ? createSuggestedJourneyName(
          boardingStop.name,
          destinationStop.name,
        )
      : "";

  /**
   * Reset the suggested name whenever the selected journey
   * endpoints change.
   *
   * Once the passenger manually edits the field, ordinary
   * rerenders do not overwrite their text.
   */
  useEffect(() => {
    setJourneyName(suggestedJourneyName);
    setJourneyActionError(null);
  }, [suggestedJourneyName]);

  // ==========================================================
  // EXISTING JOURNEY DETECTION
  // ==========================================================

  /**
   * A journey is identified by:
   * - User
   * - Route
   * - Origin kind and ID
   * - Destination kind and ID
   *
   * The selected orientation matters. A reverse journey is
   * a different saved journey.
   */
  const existingJourneyBookmark =
    selectedRoute &&
    boardingEndpoint &&
    destinationEndpoint
      ? routeBookmarks.find((bookmark) => {
          if (
            bookmark.bookmarkType !== "journey" ||
            bookmark.routeId !== selectedRoute.id
          ) {
            return false;
          }

          return (
            bookmark.origin.kind === boardingEndpoint.kind &&
            bookmark.origin.id === boardingEndpoint.id &&
            bookmark.destination.kind === destinationEndpoint.kind &&
            bookmark.destination.id === destinationEndpoint.id
          );
        })
      : undefined;

  // ==========================================================
  // STOP / TERMINAL BOOKMARKING
  // ==========================================================

  const toggleBookmark = async (
    kind: "stop" | "terminal",
    targetId: number,
    isSaved: boolean,
  ) => {
    if (!userId) {
      setShowLoginPrompt(true);
      return;
    }

    const key = `${kind}:${targetId}`;

    setBookmarkActionKey(key);
    setBookmarkActionError(null);

    try {
      if (isSaved) {
        await removeBookmark(kind, targetId);
      } else {
        await addBookmark(kind, targetId);
      }
    } catch (cause: unknown) {
      setBookmarkActionError(
        cause instanceof Error
          ? cause.message
          : "Unable to update this saved item.",
      );
    } finally {
      setBookmarkActionKey(null);
    }
  };

  /**
   * This control handles independent stop and terminal bookmarks.
   * Passenger journeys are identified and managed separately.
   */
  const bookmarkButton = (
    kind: "stop" | "terminal",
    targetId: number,
  ) => {
    const label = kind === "stop" ? "Stop" : "Terminal";

    const isSaved = hasSavedBookmark(
      bookmarkIds,
      kind,
      targetId,
    );

    const key = `${kind}:${targetId}`;
    const isPending = bookmarkActionKey === key;

    return (
      <button
        type="button"
        aria-pressed={isSaved}
        disabled={bookmarksLoading || isPending}
        onClick={() =>
          void toggleBookmark(kind, targetId, isSaved)
        }
        className="w-full rounded-lg border border-[#0f2a47] px-3 py-2 text-xs font-semibold text-[#0f2a47] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending
          ? `${isSaved ? "Removing" : "Saving"} ${label}...`
          : isSaved
            ? `Remove Saved ${label}`
            : `Save ${label}`}
      </button>
    );
  };

  // ==========================================================
  // SAVE JOURNEY
  // ==========================================================

  const handleSaveJourney = async () => {
    if (!userId) {
      setShowLoginPrompt(true);
      return;
    }

    /**
     * Safety guard:
     *
     * The temporary database constraint still blocks journey
     * insertion. This operation must not run until Phase 3B
     * removes that restriction.
     */
    if (!JOURNEY_BOOKMARKS_ENABLED) {
      return;
    }

    if (
      !selectedRoute ||
      !hasTripSegment ||
      !boardingEndpoint ||
      !destinationEndpoint
    ) {
      setJourneyActionError(
        "Select a valid boarding point and destination first.",
      );

      return;
    }

    if (existingJourneyBookmark) {
      setJourneyActionError(
        "This journey is already saved.",
      );

      return;
    }

    let normalizedJourneyName: string;

    try {
      normalizedJourneyName =
        normalizeSavedJourneyName(journeyName);
    } catch (cause: unknown) {
      setJourneyActionError(
        cause instanceof Error
          ? cause.message
          : "Please enter a valid journey name.",
      );

      return;
    }

    setJourneySaving(true);
    setJourneyActionError(null);

    try {
      await addJourneyBookmark(
        selectedRoute.id,
        boardingEndpoint,
        destinationEndpoint,
        normalizedJourneyName,
      );
    } catch (cause: unknown) {
      setJourneyActionError(
        cause instanceof Error
          ? cause.message
          : "Unable to save this journey.",
      );
    } finally {
      setJourneySaving(false);
    }
  };

  // ==========================================================
  // JOURNEY NAME INPUT VALIDATION
  // ==========================================================

  const journeyNameCharacterCount =
    Array.from(journeyName).length;

  const journeyNameIsValid =
    journeyName.trim().length > 0 &&
    journeyNameCharacterCount <=
      SAVED_JOURNEY_NAME_MAX_LENGTH;

  // ==========================================================
  // PANEL VISIBILITY
  // ==========================================================

  const visible =
    selectedPlace ||
    selectedRoute ||
    selectionError ||
    routesLoading ||
    routeStopsLoading ||
    routeMapError ||
    routeError ||
    (!routesLoading && routeMapIndex.routes.length === 0);

  if (!visible) {
    return null;
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className={className}>
      {/* ================================================== */}
      {/* SAVED ITEM STATUS */}
      {/* ================================================== */}

      {bookmarksLoading && userId && (
        <p role="status" className="mb-2 text-xs text-gray-500">
          Checking saved status...
        </p>
      )}

      {bookmarksError && (
        <p role="alert" className="mb-2 text-xs text-red-600">
          Saved status could not be loaded: {bookmarksError}
        </p>
      )}

      {bookmarkActionError && (
        <p role="alert" className="mb-2 text-xs text-red-600">
          {bookmarkActionError}
        </p>
      )}

      {/* ================================================== */}
      {/* MAP LOADING AND ERRORS */}
      {/* ================================================== */}

      {routesLoading && (
        <p role="status" className="text-sm text-gray-500">
          Loading routes and stops...
        </p>
      )}

      {routeMapError && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          Failed to load routes and map points: {routeMapError}
        </p>
      )}

      {routeError && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {routeError}
        </p>
      )}

      {selectionError && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {selectionError}
        </p>
      )}

      {!routesLoading &&
        !routeMapError &&
        routeMapIndex.routes.length === 0 && (
          <p className="text-sm text-gray-500">
            No active routes found.
          </p>
        )}

      {/* ================================================== */}
      {/* SELECTED PLACE DETAILS */}
      {/* ================================================== */}

      {selectedPlace && (
        <section
          aria-labelledby="selected-place-title"
          className={
            selectedRoute
              ? "border-b border-gray-200 pb-4"
              : ""
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                id="selected-place-title"
                className="text-base font-semibold text-gray-900"
              >
                {selectedPlace.name}
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                {stopTypeLabel(selectedPlace)}
              </p>
            </div>

            <button
              type="button"
              aria-label="Close place details"
              onClick={closePlace}
              className="rounded-full px-2 py-1 text-lg leading-none text-gray-500 hover:bg-gray-100"
            >
              ×
            </button>
          </div>

          {/* ------------------------------------------------ */}
          {/* SELECTED LOCATION PHOTO GALLERIES                */}
          {/* ------------------------------------------------ */}

          {photoGalleryEntries.map(({ place }) => (
            <PlacePhotoGallery
              key={`${place.kind}-${place.ref_id}`}
              placeName={place.name}
              images={
                pointImages[`${place.kind}-${place.ref_id}`] ?? []
              }
            />
          ))}

          {selectedPlace.description && (
            <p className="mt-3 text-sm text-gray-700">
              {selectedPlace.description}
            </p>
          )}

          <p className="mt-2 text-[11px] text-gray-500">
            {selectedPlace.latitude.toFixed(5)}, {" "}
            {selectedPlace.longitude.toFixed(5)}
          </p>

          <div className="mt-3">
            {bookmarkButton(
              selectedPlace.kind,
              selectedPlace.ref_id,
            )}
          </div>

          {selectedPlace.routes.length > 1 && (
            <p className="mt-2 text-xs text-gray-600">
              Several routes serve this place. Click a colored
              route line to choose one; click again to cycle
              through overlapping lines.
            </p>
          )}

          {selectedRoute &&
            !routeStopsLoading &&
            findRouteStopIndex(
              selectedRouteStops,
              selectedPlace,
            ) === null && (
              <p className="mt-2 text-xs text-amber-700">
                This place is not served by {selectedRoute.name}.
                Select a compatible route to use it as a trip stop.
              </p>
            )}
        </section>
      )}

      {/* ================================================== */}
      {/* ROUTE LOADING */}
      {/* ================================================== */}

      {routeStopsLoading && (
        <p role="status" className="mt-2 text-sm text-gray-500">
          Loading route details...
        </p>
      )}

      {roadRouteLoading && (
        <p role="status" className="mt-2 text-sm text-gray-500">
          Finding roads between stops...
        </p>
      )}

      {/* ================================================== */}
      {/* ROUTE / JOURNEY GEOMETRY MEASUREMENTS */}
      {/* ================================================== */}

      {selectedRoute && !hasTripSegment &&
        !roadRouteLoading &&
        routeDistanceMeters !== null &&
        routeDurationSeconds !== null && (
          <p className="mt-3 text-xs text-gray-500">
            {(routeDistanceMeters / 1000).toFixed(1)} km route
            {" · "}
            {Math.round(routeDurationSeconds / 60)} min
          </p>
        )}

      {selectedRoute && hasTripSegment && (
        <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2">
          <p className="text-[11px] font-semibold text-[#0f2a47]">
            Selected journey segment
          </p>

          {tripDistanceMeters !== null ? (
            <p className="mt-1 text-xs text-gray-700">
              {(tripDistanceMeters / 1000).toFixed(1)} km
              {" · "}
              {tripDurationSeconds !== null
                ? `${Math.round(tripDurationSeconds / 60)} min estimated`
                : isRailRoute
                  ? "Travel time unavailable"
                  : "Duration unavailable"}
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-600">
              {roadRouteLoading
                ? "Calculating journey distance..."
                : "Journey distance is unavailable."}
            </p>
          )}

          {journeyGeometryError && (
            <p role="alert" className="mt-2 text-xs text-amber-700">
              {journeyGeometryError}
            </p>
          )}
        </div>
      )}

      {/* ================================================== */}
      {/* ACTIVE ROUTE DETAILS */}
      {/* ================================================== */}

      {selectedRoute && (
        <div
          className={`flex min-h-0 flex-col ${
            selectedPlace ? "mt-4" : ""
          }`}
        >
          <div className="flex flex-wrap gap-2">
            <span
              className="w-fit rounded-full px-4 py-1 text-[11px] font-medium text-white"
              style={{ backgroundColor: routeColor }}
            >
              {selectedRoute.transport_variants.name}
            </span>

            {!selectedRoute.is_approved && (
              <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-[11px] font-medium text-amber-800">
                {selectedRoute.moderation_status === "rejected"
                  ? "Rejected"
                  : "Pending admin approval"}
              </span>
            )}
          </div>

          <h2 className="mt-3 text-base font-semibold text-gray-900">
            {selectedRoute.name}
          </h2>

          <p className="mt-2 text-[11px] text-gray-500">
            Origin: {originName}
          </p>

          <p className="mt-1 text-[11px] text-gray-500">
            Destination: {destinationName}
          </p>

          {/* ------------------------------------------------ */}
          {/* WHOLE-ROUTE BOOKMARK */}
          {/* ------------------------------------------------ */}

          {/* ================================================= */}
          {/* TRIP + FARE */}
          {/* ================================================= */}

          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-[11px] text-gray-700">
            <div className="flex justify-between gap-2">
              <span>Boarding</span>

              <span className="text-right font-medium">
                {boardingStop?.name ?? "Tap a stop or terminal"}
              </span>
            </div>

            <div className="mt-1 flex justify-between gap-2">
              <span>Destination</span>

              <span className="text-right font-medium">
                {destinationStop?.name ?? "Tap a later stop"}
              </span>
            </div>

            {/* ---------------------------------------------- */}
            {/* FARE LOADING AND ERRORS */}
            {/* ---------------------------------------------- */}

            {fareOptionLoading && (
              <p role="status" className="mt-2 text-gray-500">
                Loading assigned vehicle fare...
              </p>
            )}

            {fareOptionError && (
              <p role="alert" className="mt-2 text-red-600">
                {fareOptionError}
              </p>
            )}

            {isRailRoute && (
              <>
                {railFareLoading && (
                  <p
                    role="status"
                    className="mt-2 text-gray-500"
                  >
                    Loading station fares...
                  </p>
                )}

                {railFareError && (
                  <p role="alert" className="mt-2 text-red-600">
                    {railFareError}
                  </p>
                )}
              </>
            )}

            {!fareOptionLoading &&
              !fareOptionError &&
              !fareOption && (
                <p className="mt-2 text-amber-700">
                  The fare configuration for this route's assigned
                  vehicle variant is unavailable.
                </p>
              )}

            {!isRailRoute &&
              fareOption &&
              !fareOptionLoading &&
              !fareOptionError &&
              !fareOption.fareRule && (
                <p className="mt-2 text-amber-700">
                  No currently effective road fare rule is
                  configured for {fareOption.variant.name}.
                </p>
              )}

            {/* ---------------------------------------------- */}
            {/* TRIP SELECTION INSTRUCTIONS */}
            {/* ---------------------------------------------- */}

            {!hasTripSegment && (
              <p className="mt-2 text-gray-600">
                Select any stop on this route to board, then any
                other stop as your destination to view the fare.
              </p>
            )}

            {hasTripSegment &&
              !isRailRoute &&
              tripDistanceMeters === null && (
                <p className="mt-2 text-gray-600">
                  {roadRouteLoading
                    ? "Calculating distance along the route..."
                    : "Route distance is unavailable, so the fare cannot be calculated."}
                </p>
              )}

            {hasTripSegment &&
              isRailRoute &&
              railFareLoading && (
                <p role="status" className="mt-2 text-gray-500">
                  Loading station fares...
                </p>
              )}

            {/* ---------------------------------------------- */}
            {/* FARE CARDS */}
            {/* ---------------------------------------------- */}

            {hasTripSegment &&
              !fareOptionLoading &&
              !fareOptionError &&
              fareOption &&
              (!isRailRoute || !railFareLoading) &&
              (isRailRoute || tripDistanceMeters !== null) && (
                <section
                  aria-label="Estimated fares"
                  className="mt-3"
                >
                  <p className="mb-2 text-[10px] leading-snug text-gray-500">
                    Estimates only. The fare is based on this
                    route's assigned vehicle and configured fare
                    rules.
                  </p>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {fareCards.map((card) => {
                      const Icon =
                        card.category === "regular"
                          ? UserRound
                          : card.category === "student"
                            ? GraduationCap
                            : card.category === "senior_citizen"
                              ? Users
                              : Accessibility;

                      return (
                        <article
                          key={card.category}
                          aria-label={`${card.label} fare`}
                          className="min-w-0 rounded-lg border border-gray-200 bg-white p-2"
                        >
                          <h4 className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-800">
                            <Icon
                              aria-hidden="true"
                              className="h-4 w-4 shrink-0 text-blue-700"
                            />
                            {card.label}
                          </h4>

                          {card.options.length === 0 ? (
                            <p className="mt-2 text-[10px] text-amber-700">
                              Fare unavailable
                            </p>
                          ) : (
                            <div className="mt-1.5 space-y-2">
                              {card.options.map((option) => (
                                <div
                                  key={option.variantId}
                                  className="border-t border-gray-100 pt-1.5 first:border-0 first:pt-0"
                                >
                                  {card.options.length > 1 && (
                                    <p className="text-[9px] font-medium text-gray-500">
                                      {option.variantName}
                                    </p>
                                  )}

                                  {option.amounts.length > 0 ? (
                                    option.amounts.map((amount) => (
                                      <p
                                        key={amount.label || "fare"}
                                        className="text-[11px] font-semibold text-gray-900"
                                      >
                                        {amount.label && (
                                          <span className="font-normal text-gray-500">
                                            {amount.label}: {" "}
                                          </span>
                                        )}

                                        {amount.amount === null
                                          ? option.unavailableReason ??
                                            "Fare unavailable"
                                          : card.category === "regular"
                                            ? peso(amount.amount)
                                            : wholePeso(amount.amount)}
                                      </p>
                                    ))
                                  ) : (
                                    <p className="text-[10px] text-amber-700">
                                      {option.unavailableReason ??
                                        "Fare unavailable"}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

            {/* ================================================= */}
            {/* SAVE PASSENGER JOURNEY */}
            {/* ================================================= */}

            {hasTripSegment &&
              boardingStop &&
              destinationStop &&
              selectedRoute && (
                <section
                  aria-labelledby="save-journey-title"
                  className="mt-4 rounded-lg border border-[#d7e3ef] bg-white p-3"
                >
                  <h3
                    id="save-journey-title"
                    className="text-xs font-semibold text-[#0f2a47]"
                  >
                    Save this journey
                  </h3>

                  <p className="mt-1 text-[10px] text-gray-500">
                    Give this trip your own name so you can
                    recognize it in your saved journeys.
                  </p>

                  {/* ------------------------------------------ */}
                  {/* JOURNEY NAME INPUT */}
                  {/* ------------------------------------------ */}

                  <label
                    htmlFor="saved-journey-name"
                    className="mt-3 block text-[11px] font-medium text-gray-700"
                  >
                    Journey name
                  </label>

                  <input
                    id="saved-journey-name"
                    type="text"
                    value={
                      existingJourneyBookmark?.bookmarkType === "journey"
                        ? existingJourneyBookmark.journeyName
                        : journeyName
                    }
                    disabled={Boolean(existingJourneyBookmark)}
                    onChange={(event) => {
                      const nextName = Array.from(
                        event.currentTarget.value,
                      )
                        .slice(
                          0,
                          SAVED_JOURNEY_NAME_MAX_LENGTH,
                        )
                        .join("");

                      setJourneyName(nextName);
                      setJourneyActionError(null);
                    }}
                    placeholder="Enter a name for this journey"
                    aria-describedby="saved-journey-name-help"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-[#0f2a47] focus:ring-2 focus:ring-[#0f2a47]/10 disabled:bg-gray-100"
                  />

                  <div
                    id="saved-journey-name-help"
                    className="mt-1 flex justify-between text-[10px] text-gray-400"
                  >
                    <span>
                      Suggested: {suggestedJourneyName}
                    </span>

                    <span className="shrink-0">
                      {journeyNameCharacterCount}/
                      {SAVED_JOURNEY_NAME_MAX_LENGTH}
                    </span>
                  </div>

                  {/* ------------------------------------------ */}
                  {/* EXISTING JOURNEY STATUS */}
                  {/* ------------------------------------------ */}

                  {existingJourneyBookmark && (
                    <p className="mt-2 text-[10px] font-medium text-green-700">
                      This journey is already saved under this name.
                    </p>
                  )}

                  {/* ------------------------------------------ */}
                  {/* DATABASE PHASE STATUS */}
                  {/* ------------------------------------------ */}

                  {!JOURNEY_BOOKMARKS_ENABLED &&
                    !existingJourneyBookmark && (
                      <p className="mt-2 text-[10px] text-amber-700">
                        Journey saving will become available after
                        the database journey restriction is removed
                        in Phase 3B.
                      </p>
                    )}

                  {/* ------------------------------------------ */}
                  {/* SAVE ERROR */}
                  {/* ------------------------------------------ */}

                  {journeyActionError && (
                    <p
                      role="alert"
                      className="mt-2 text-[10px] text-red-600"
                    >
                      {journeyActionError}
                    </p>
                  )}

                  {/* ------------------------------------------ */}
                  {/* SAVE BUTTON */}
                  {/* ------------------------------------------ */}

                  <button
                    type="button"
                    disabled={
                      !JOURNEY_BOOKMARKS_ENABLED ||
                      bookmarksLoading ||
                      journeySaving ||
                      Boolean(existingJourneyBookmark) ||
                      !boardingEndpoint ||
                      !destinationEndpoint ||
                      !journeyNameIsValid
                    }
                    onClick={() => void handleSaveJourney()}
                    title={
                      !JOURNEY_BOOKMARKS_ENABLED
                        ? "Journey saving is not enabled until Phase 3B."
                        : undefined
                    }
                    className="mt-3 w-full rounded-lg bg-[#0f2a47] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#183b60] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {existingJourneyBookmark
                      ? "Journey Already Saved"
                      : journeySaving
                        ? "Saving Journey..."
                        : "Save Journey"}
                  </button>
                </section>
              )}

            {/* ================================================= */}
            {/* CLEAR TRIP */}
            {/* ================================================= */}

            {(boardingIndex !== null ||
              destinationIndex !== null) && (
              <button
                type="button"
                onClick={clearTrip}
                className="mt-3 text-[11px] text-gray-500 underline"
              >
                Clear trip
              </button>
            )}
          </div>

          {/* ================================================= */}
          {/* ROUTE STOP LIST */}
          {/* ================================================= */}

          <hr className="my-3 border-gray-200" />

          <h3 className="text-xs font-semibold text-gray-800">
            Stops ({selectedRouteStops.length})
          </h3>

          <ol
            aria-label={`Stops on ${selectedRoute.name}`}
            className="mt-3 max-h-[30vh] overflow-y-auto pr-1"
          >
            {selectedRouteStops.map((stop, index) => {
              const isBoarding =
                index === boardingIndex;

              const isDestination =
                index === destinationIndex;

              return (
                <li
                  key={`${stop.kind}-${stop.ref_id}-${stop.stop_order}`}
                  className="relative pb-4 last:pb-0"
                >
                  {index < selectedRouteStops.length - 1 && (
                    <span
                      className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-px"
                      style={{
                        backgroundColor: routeColor,
                        opacity: 0.4,
                      }}
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => handleRouteListPick(index)}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <span
                      className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center text-[10px] font-semibold text-white ${
                        stop.kind === "terminal"
                          ? "rounded-md"
                          : "rounded-full"
                      } ${
                        isBoarding
                          ? "ring-2 ring-green-500"
                          : isDestination
                            ? "ring-2 ring-red-500"
                            : ""
                      }`}
                      style={{ backgroundColor: routeColor }}
                    >
                      {stop.stop_order}
                    </span>

                    <span className="text-[11px] text-gray-800">
                      {stop.name}
                      {stop.kind === "terminal"
                        ? " (Terminal)"
                        : ""}
                      {stop.stop_type === "train_station"
                        ? " (Station)"
                        : ""}

                      {isBoarding && (
                        <span className="ml-1 font-semibold text-green-700">
                          · Boarding
                        </span>
                      )}

                      {isDestination && (
                        <span className="ml-1 font-semibold text-red-700">
                          · Destination
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* ================================================= */}
          {/* PAGE-SPECIFIC ROUTE ACTIONS */}
          {/* ================================================= */}

          <div className="mt-4 flex flex-col gap-2">
            {renderRouteActions?.(selectedRoute)}

            <button
              type="button"
              onClick={clearSelectedRoute}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
            >
              Clear selected route
            </button>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* LOGIN PROMPT */}
      {/* ================================================== */}

      {showLoginPrompt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bookmark-login-title"
          className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2
              id="bookmark-login-title"
              className="text-lg font-semibold text-gray-900"
            >
              Sign in to save map information
            </h2>

            <p className="mt-2 text-sm text-gray-600">
              Sign in or create an account to save routes, journeys,
              stops, and terminals.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLoginPrompt(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => navigate("/login")}
                className="rounded-lg bg-[#0f2a47] px-4 py-2 text-sm font-medium text-white hover:bg-[#183b60]"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
