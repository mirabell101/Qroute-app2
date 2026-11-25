
import {
  ChevronDown,
  ChevronUp,
  ImagePlus,
  MapPin,
  Trash2,
} from "lucide-react";

import type { PointKind } from "@/lib/contributions";

// ==================================================
// TYPES
// ==================================================

export interface RouteSequenceEntry {
  key: string;
  kind: PointKind;
  name: string;

  stopNumber: number | null;

  /** Display label: Terminal, Stop or Station. */
  typeLabel: string;

  /** An existing approved database location. */
  existing: boolean;

  /** Whether this point's name can be edited. */
  editable: boolean;

  /** Draft routePoints index, or null for original points. */
  draftIndex: number | null;

  canMove: boolean;
  canRemove: boolean;
  canUpload: boolean;

  photoPreviewUrl: string | null;
  photoFileName: string | null;

  /** True when automatic placement has not succeeded. */
  positionPending: boolean;
}

interface RouteSequencePanelProps {
  entries: RouteSequenceEntry[];
  color: string;

  title: string;
  description?: string;

  selectedKey: string | null;
  showValidation: boolean;

  onSelect: (key: string) => void;
  onNameChange: (key: string, name: string) => void;

  onMove: (
    index: number,
    direction: -1 | 1
  ) => void;

  onRemove: (key: string) => void;
  onChoosePhoto: (key: string) => void;
  onRemovePhoto: (key: string) => void;
}

// ==================================================
// COMPONENT
// ==================================================

export default function RouteSequencePanel({
  entries,
  color,
  title,
  description,
  selectedKey,
  showValidation,
  onSelect,
  onNameChange,
  onMove,
  onRemove,
  onChoosePhoto,
  onRemovePhoto,
}: RouteSequencePanelProps) {
  if (entries.length === 0) {
    return null;
  }

  const stopCount = entries.filter(
    (entry) => entry.kind === "stop"
  ).length;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {title}
          </h3>

          {description && (
            <p className="mt-0.5 text-xs text-gray-500">
              {description}
            </p>
          )}
        </div>

        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
          {entries.length} locations · {stopCount} stops
        </span>
      </div>

      <ol className="space-y-2">
        {entries.map((entry, index) => {
          const selected =
            entry.key === selectedKey;

          const hasNameError =
            showValidation &&
            entry.editable &&
            !entry.name.trim();

          return (
            <li
              key={entry.key}
              className={`rounded-lg border p-2.5 transition-colors ${
                selected
                  ? "border-[#12395A] bg-blue-50/60"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-2">
                {/* Sequence number or terminal label */}

                <div
                  className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2 text-xs font-semibold text-white"
                  style={{
                    backgroundColor: color,
                  }}
                >
                  {entry.kind === "terminal"
                    ? <MapPin size={15} />
                    : entry.positionPending ||
                        entry.stopNumber === null
                      ? "?"
                      : entry.stopNumber}
                </div>

                {/* Location type */}

                <span className="w-[76px] shrink-0 text-xs font-medium text-gray-600">
                  {entry.typeLabel}
                </span>

                {/* Location name */}

                {entry.editable ? (
                  <input
                    aria-label={`${entry.typeLabel} name`}
                    value={entry.name}
                    maxLength={120}
                    onChange={(event) =>
                      onNameChange(
                        entry.key,
                        event.target.value
                      )
                    }
                    placeholder={`Name of this ${entry.typeLabel.toLowerCase()}`}
                    className={`h-9 min-w-0 flex-1 rounded-lg border bg-white px-2 text-sm outline-none focus:border-[#12395A] focus:ring-1 focus:ring-[#12395A] ${
                      hasNameError
                        ? "border-red-500"
                        : "border-gray-300"
                    }`}
                  />
                ) : (
                  <button
                    type="button"
                    title="Select this location on the map"
                    onClick={() => onSelect(entry.key)}
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium text-gray-800 hover:text-[#12395A] hover:underline"
                  >
                    {entry.name || "Unnamed location"}
                  </button>
                )}

                {/* Existing location indicator */}

                {entry.existing && (
                  <span className="hidden shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 sm:inline">
                    Existing
                  </span>
                )}

                {/* Select marker */}

                {entry.editable && (
                  <button
                    type="button"
                    title="Show on map"
                    aria-label={`Select ${entry.typeLabel} on map`}
                    onClick={() => onSelect(entry.key)}
                    className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-[#12395A]"
                  >
                    <MapPin size={15} />
                  </button>
                )}

                {/* Point photo */}

                {entry.canUpload && (
                  <button
                    type="button"
                    title="Add a photo"
                    aria-label={`Add photo to ${entry.typeLabel}`}
                    onClick={() =>
                      onChoosePhoto(entry.key)
                    }
                    className={`rounded p-1.5 hover:bg-gray-200 ${
                      entry.photoPreviewUrl
                        ? "text-[#12395A]"
                        : "text-gray-500"
                    }`}
                  >
                    <ImagePlus size={16} />
                  </button>
                )}

                {/* Reorder: new-route points only */}

                {entry.canMove &&
                  entry.draftIndex !== null && (
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        aria-label={`Move ${entry.typeLabel} up`}
                        disabled={index === 0}
                        onClick={() =>
                          onMove(
                            entry.draftIndex as number,
                            -1
                          )
                        }
                        className="rounded px-1 text-gray-600 hover:bg-gray-200 disabled:opacity-30"
                      >
                        <ChevronUp size={15} />
                      </button>

                      <button
                        type="button"
                        aria-label={`Move ${entry.typeLabel} down`}
                        disabled={index === entries.length - 1}
                        onClick={() =>
                          onMove(
                            entry.draftIndex as number,
                            1
                          )
                        }
                        className="rounded px-1 text-gray-600 hover:bg-gray-200 disabled:opacity-30"
                      >
                        <ChevronDown size={15} />
                      </button>
                    </div>
                  )}

                {/* Remove draft point */}

                {entry.canRemove && (
                  <button
                    type="button"
                    title="Remove this proposed point"
                    aria-label={`Remove ${entry.typeLabel}`}
                    onClick={() =>
                      onRemove(entry.key)
                    }
                    className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              {/* Photo preview */}

              {entry.photoPreviewUrl && (
                <div className="ml-10 mt-2 flex items-center gap-2">
                  <img
                    src={entry.photoPreviewUrl}
                    alt={`Photo for ${entry.name || entry.typeLabel}`}
                    className="h-12 w-16 rounded-md border border-gray-200 object-cover"
                  />

                  <span className="min-w-0 flex-1 truncate text-xs text-gray-500">
                    {entry.photoFileName}
                  </span>

                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() =>
                      onRemovePhoto(entry.key)
                    }
                    className="rounded px-1.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Placement feedback */}

              {entry.positionPending && (
                <p className="ml-10 mt-1 text-[11px] text-amber-700">
                  Automatic position not determined yet.
                </p>
              )}

              {hasNameError && (
                <p className="ml-10 mt-1 text-[11px] text-red-600">
                  Enter a name for this location.
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
