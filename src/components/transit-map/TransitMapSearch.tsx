import { MapPin } from "lucide-react";

import { Input } from "@/components/ui/input";

import { stopTypeLabel } from "./useTransitMap";
import type { TransitMapController } from "./useTransitMap";

export function TransitMapSearch({
  map,
  className = "relative h-[50px] w-[260px] shrink-0 sm:w-[320px] md:w-[360px] lg:w-[400px]",
}: {
  map: TransitMapController;
  className?: string;
}) {
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    showSearchResults,
    setShowSearchResults,
    activeSearchIndex,
    setActiveSearchIndex,
    handleSearchKeyDown,
    handleSearchResultSelect,
  } = map;

  return (
    <div className={className}>
      <MapPin
        size={19}
        strokeWidth={2}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600"
      />

      <Input
        type="text"
        role="combobox"
        aria-label="Search routes, stops, and terminals"
        aria-autocomplete="list"
        aria-expanded={showSearchResults && searchQuery.trim().length > 0}
        aria-controls={
          showSearchResults && searchQuery.trim().length > 0
            ? "route-place-search-results"
            : undefined
        }
        aria-activedescendant={
          showSearchResults && searchResults.length > 0
            ? `route-place-search-result-${activeSearchIndex}`
            : undefined
        }
        placeholder="Search routes, stops, and terminals..."
        value={searchQuery}
        className="
          h-full w-full rounded-full border border-gray-300
          bg-white pl-12 pr-5 text-[16px]
          shadow-[0_2px_8px_rgba(0,0,0,0.15)]
          outline-none placeholder:text-gray-500
          focus-visible:ring-1 focus-visible:ring-gray-300
        "
        onFocus={() => setShowSearchResults(true)}
        onChange={(event) => {
          setSearchQuery(event.target.value);
          setActiveSearchIndex(0);
          setShowSearchResults(true);
        }}
        onKeyDown={handleSearchKeyDown}
      />

      {showSearchResults && searchQuery.trim() && (
        <div
          id="route-place-search-results"
          role="listbox"
          aria-label="Route and place search results"
          className="absolute left-0 right-0 top-[56px] z-[3500] max-h-[60vh] overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
        >
          {searchResults.length === 0 ? (
            <p role="status" className="px-3 py-2 text-sm text-gray-500">
              No matching routes or places.
            </p>
          ) : (
            searchResults.map((result, index) => {
              const label =
                result.kind === "route" ? result.route.name : result.point.name;
              const detail =
                result.kind === "route"
                  ? result.route.transport_types.name
                  : `${stopTypeLabel(result.point)} · ${
                      result.point.routes.length
                    } ${
                      result.point.routes.length === 1 ? "route" : "routes"
                    }`;

              return (
                <button
                  key={
                    result.kind === "route"
                      ? `route-${result.route.id}`
                      : `point-${result.point.kind}-${result.point.ref_id}`
                  }
                  id={`route-place-search-result-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeSearchIndex}
                  onClick={() => handleSearchResultSelect(result)}
                  className={`flex w-full flex-col rounded-lg px-3 py-2 text-left ${
                    index === activeSearchIndex
                      ? "bg-blue-50"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <span className="text-sm font-medium text-gray-900">
                    {label}
                  </span>
                  <span className="mt-0.5 text-xs text-gray-500">
                    {result.kind === "point" && result.point.routes.length === 0
                      ? `${detail} · no routes listed`
                      : detail}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}