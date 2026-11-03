import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type {
  RecentSearchKind,
} from "@/lib/recentSearches";
import { useRecentSearches } from "@/components/recent-searches/recentSearchesStore";

interface RecentSearchesProps {
  currentUserId: string | null;
}

const getKindLabel = (kind: RecentSearchKind): string =>
  kind === "route" ? "Route" : kind === "stop" ? "Stop" : "Terminal";

const formatSearchedAt = (searchedAt: number): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(searchedAt));

export default function RecentSearches({
  currentUserId,
}: RecentSearchesProps) {
  const navigate = useNavigate();
  const { items, loading, error, remove, clear, retrySync } =
    useRecentSearches();

  const handleSelect = (item: (typeof items)[number]) => {
    navigate(currentUserId ? "/home" : "/", {
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
    if (!window.confirm("Clear all recent searches? This cannot be undone.")) {
      return;
    }

    void clear();
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={() => navigate(currentUserId ? "/home" : "/")}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition hover:text-[#0f2a47]"
        >
          <ArrowLeft size={18} />
          Back to map
        </button>

        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Recent Searches
            </h1>
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

        {loading ? (
          <p role="status" className="rounded-xl bg-white p-6 text-sm text-gray-500 shadow-sm">
            Loading recent searches...
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-xl bg-white p-6 text-sm text-gray-500 shadow-sm">
            Search for a route, stop, or terminal and select a result to see it
            here.
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
                    <p className="font-semibold text-gray-900">{item.name}</p>
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
                      className="rounded-lg bg-[#0f2a47] px-4 py-2 text-sm font-medium text-white hover:bg-[#183b60]"
                    >
                      View on map
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name} from recent searches`}
                      onClick={() => handleRemove(item)}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
  );
}
