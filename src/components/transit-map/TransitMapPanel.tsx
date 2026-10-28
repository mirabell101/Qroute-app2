import type { ReactNode } from "react";

import { Accessibility, GraduationCap, UserRound } from "lucide-react";

import { findRouteStopIndex } from "@/lib/routeMap";
import type { RouteDetails } from "@/lib/routes";

import { stopTypeLabel } from "./useTransitMap";
import type { TransitMapController } from "./useTransitMap";

const peso = (value: number) => `₱${value.toFixed(2)}`;
const wholePeso = (value: number) => `₱${value.toFixed(0)}`;

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
  const {
    selectedPlace,
    selectedPlaceImage,
    selectedRoute,
    selectedRouteStops,
    routesLoading,
    routeStopsLoading,
    roadRouteLoading,
    routeMapError,
    routeError,
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
    fareOptions,
    fareOptionsLoading,
    fareOptionsError,
    railFareLoading,
    railFareError,
    hasTripSegment,
    tripDistanceMeters,
    fareCards,
    handleListPick,
    clearTrip,
    clearSelectedRoute,
    closePlace,
  } = map;

  const visible =
    selectedPlace ||
    selectedRoute ||
    routesLoading ||
    routeStopsLoading ||
    routeMapError ||
    routeError ||
    (!routesLoading && routeMapIndex.routes.length === 0);

  if (!visible) return null;

  return (
    <div className={className}>
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

      {!routesLoading && !routeMapError && routeMapIndex.routes.length === 0 && (
        <p className="text-sm text-gray-500">No active routes found.</p>
      )}

      {selectedPlace && (
        <section
          aria-labelledby="selected-place-title"
          className={selectedRoute ? "border-b border-gray-200 pb-4" : ""}
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

          {selectedPlaceImage && (
            <div className="mt-3">
              <img
                src={selectedPlaceImage.url}
                alt={selectedPlace.name}
                loading="lazy"
                className="h-36 w-full rounded-lg object-cover"
              />
              {!selectedPlaceImage.is_approved && (
                <p className="mt-1 text-[10px] text-amber-700">
                  Photo pending admin review
                </p>
              )}
            </div>
          )}

          {selectedPlace.description && (
            <p className="mt-3 text-sm text-gray-700">
              {selectedPlace.description}
            </p>
          )}
          <p className="mt-2 text-[11px] text-gray-500">
            {selectedPlace.latitude.toFixed(5)},{" "}
            {selectedPlace.longitude.toFixed(5)}
          </p>

          {selectedPlace.routes.length > 1 && (
            <p className="mt-2 text-xs text-gray-600">
              Several routes serve this place. Click a colored route line to
              choose one; click again to cycle through overlapping lines.
            </p>
          )}

          {selectedRoute &&
            !routeStopsLoading &&
            findRouteStopIndex(selectedRouteStops, selectedPlace) === null && (
              <p className="mt-2 text-xs text-amber-700">
                This place is not served by {selectedRoute.name}. Select a
                compatible route to use it as a trip stop.
              </p>
            )}
        </section>
      )}

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

      {selectedRoute &&
        !roadRouteLoading &&
        routeDistanceMeters !== null &&
        routeDurationSeconds !== null && (
          <p className="mt-3 text-xs text-gray-500">
            {(routeDistanceMeters / 1000).toFixed(1)} km route
            {" · "}
            {Math.round(routeDurationSeconds / 60)} min
          </p>
        )}

      {/* Active route details */}
      {selectedRoute && (
        <div
          className={`flex min-h-0 flex-col ${selectedPlace ? "mt-4" : ""}`}
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

          <p className="mt-2 text-[11px] text-gray-500">Origin: {originName}</p>
          <p className="mt-1 text-[11px] text-gray-500">
            Destination: {destinationName}
          </p>

          {/* Trip + fare */}
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

            {fareOptionsLoading && (
              <p role="status" className="mt-2 text-gray-500">
                Loading fare comparisons...
              </p>
            )}

            {fareOptionsError && (
              <p role="alert" className="mt-2 text-red-600">
                {fareOptionsError}
              </p>
            )}

            {isRailRoute && (
              <>
                {railFareLoading && (
                  <p role="status" className="mt-2 text-gray-500">
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

            {!isRailRoute && selectedRoute.fare_area_id === null && (
              <p className="mt-2 text-amber-700">
                Fare area is not assigned to this route. Fare estimates are
                unavailable until its area and matching rules are configured.
              </p>
            )}

            {!hasTripSegment && (
              <p className="mt-2 text-gray-600">
                Select any stop on this route to board, then any other stop as
                your destination to compare fares.
              </p>
            )}

            {hasTripSegment && !isRailRoute && tripDistanceMeters === null && (
              <p className="mt-2 text-gray-600">
                {roadRouteLoading
                  ? "Calculating distance along the route..."
                  : "Route distance is unavailable, so fare estimates cannot be calculated."}
              </p>
            )}

            {!fareOptionsLoading &&
              !fareOptionsError &&
              fareOptions.length === 0 && (
                <p className="mt-2 text-amber-700">
                  No active fare variants are configured for this transport
                  type.
                </p>
              )}

            {hasTripSegment && isRailRoute && railFareLoading && (
              <p role="status" className="mt-2 text-gray-500">
                Loading station fares...
              </p>
            )}

            {hasTripSegment &&
              !fareOptionsLoading &&
              !fareOptionsError &&
              fareOptions.length > 0 &&
              (!isRailRoute || (isRailRoute && !railFareLoading)) &&
              (isRailRoute || tripDistanceMeters !== null) && (
                <section aria-label="Estimated fares" className="mt-3">
                  <p className="mb-2 text-[10px] leading-snug text-gray-500">
                    Estimates only. Fares are based on the selected route and
                    configured rules.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {fareCards.map((card) => {
                      const Icon =
                        card.category === "regular"
                          ? UserRound
                          : card.category === "student"
                            ? GraduationCap
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
                                            {amount.label}:{" "}
                                          </span>
                                        )}
                                        {amount.amount === null
                                          ? option.unavailableReason ??
                                            "Fare unavailable"
                                          : isRailRoute
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

            {(boardingIndex !== null || destinationIndex !== null) && (
              <button
                type="button"
                onClick={clearTrip}
                className="mt-2 text-[11px] text-gray-500 underline"
              >
                Clear trip
              </button>
            )}
          </div>

          <hr className="my-3 border-gray-200" />

          <h3 className="text-xs font-semibold text-gray-800">
            Stops ({selectedRouteStops.length})
          </h3>

          <ol
            aria-label={`Stops on ${selectedRoute.name}`}
            className="mt-3 max-h-[30vh] overflow-y-auto pr-1"
          >
            {selectedRouteStops.map((stop, index) => {
              const isBoarding = index === boardingIndex;
              const isDestination = index === destinationIndex;

              return (
                <li
                  key={`${stop.kind}-${stop.ref_id}-${stop.stop_order}`}
                  className="relative pb-4 last:pb-0"
                >
                  {index < selectedRouteStops.length - 1 && (
                    <span
                      className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-px"
                      style={{ backgroundColor: routeColor, opacity: 0.4 }}
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => handleListPick(index)}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <span
                      className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center text-[10px] font-semibold text-white ${
                        stop.kind === "terminal" ? "rounded-md" : "rounded-full"
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
                      {stop.kind === "terminal" ? " (Terminal)" : ""}
                      {stop.stop_type === "train_station" ? " (Station)" : ""}
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
    </div>
  );
}