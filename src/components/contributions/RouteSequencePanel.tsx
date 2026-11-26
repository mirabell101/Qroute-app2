import { useState } from "react";
import type { DragEvent } from "react";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  GripVertical,
  ImagePlus,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import type { PointKind } from "@/lib/contributions";

export interface RouteSequenceEntry {
  key: string;
  kind: PointKind;
  name: string;
  stopNumber: number | null;
  typeLabel: string;
  existing: boolean;
  editable: boolean;
  draftIndex: number | null;
  canMove: boolean;
  canConvertToStop: boolean;
  canConvertToTerminal: boolean;
  canRemove: boolean;
  canRestore: boolean;
  pendingRemoval: boolean;
  canUpload: boolean;
  photoPreviewUrl: string | null;
  photoFileName: string | null;
  positionPending: boolean;
}

interface RouteSequencePanelProps {
  entries: RouteSequenceEntry[];
  color: string;
  title: string;
  description: string;
  selectedKey: string | null;
  showValidation: boolean;
  onSelect: (key: string | null) => void;
  onNameChange: (key: string, value: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onMoveTo: (fromIndex: number, toIndex: number) => void;
  onConvertToKind: (key: string, kind: PointKind) => void;
  onRemove: (key: string) => void;
  onRestore: (key: string) => void;
  onChoosePhoto: (key: string) => void;
  onRemovePhoto: (key: string) => void;
}

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
  onMoveTo,
  onConvertToKind,
  onRemove,
  onRestore,
  onChoosePhoto,
  onRemovePhoto,
}: RouteSequencePanelProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (index: number, event: DragEvent<HTMLDivElement>) => {
    if (!entries[index]?.canMove) {
      event.preventDefault();
      return;
    }

    setDraggedIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleDragOver = (index: number, event: DragEvent<HTMLDivElement>) => {
    if (draggedIndex === null || !entries[index]?.canMove) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (index: number, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (
      draggedIndex === null ||
      draggedIndex === index ||
      !entries[draggedIndex]?.canMove ||
      !entries[index]?.canMove
    ) {
      setDraggedIndex(null);
      return;
    }

    onMoveTo(draggedIndex, index);
    setDraggedIndex(null);
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-gray-600">
            {description}
          </p>
        )}
      </div>

      <div className="space-y-2">
        {entries.map((entry, index) => {
          const selected = selectedKey === entry.key;
          const nameMissing = showValidation && !entry.name.trim();
          const previousEntry = entries[index - 1];
          const nextEntry = entries[index + 1];
          const canMoveUp = entry.canMove && !!previousEntry?.canMove;
          const canMoveDown = entry.canMove && !!nextEntry?.canMove;
          const rowIsDragging = draggedIndex === index;

          return (
            <div
              key={entry.key}
              onClick={() => onSelect(entry.key)}
              onDragOver={(event) => handleDragOver(index, event)}
              onDrop={(event) => handleDrop(index, event)}
              className={`rounded-lg border p-2.5 transition-colors ${
                entry.pendingRemoval
                  ? "border-red-200 bg-red-50/70 opacity-80"
                  : rowIsDragging
                    ? "border-dashed border-[#12395A] bg-blue-50 opacity-50"
                    : selected
                      ? "border-[#12395A] bg-blue-50/60"
                      : "border-gray-200 bg-gray-50 hover:border-gray-300"
              }`}
            >
              <div className="flex min-w-0 items-start gap-2">
                {entry.canMove ? (
                  <div
                    draggable
                    onDragStart={(event) => handleDragStart(index, event)}
                    onDragEnd={() => setDraggedIndex(null)}
                    onClick={(event) => event.stopPropagation()}
                    title="Drag to reorder this stop"
                    aria-label={`Drag ${entry.typeLabel.toLowerCase()} to reorder`}
                    className="mt-1 flex h-8 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-gray-500 hover:bg-white hover:text-[#12395A] active:cursor-grabbing"
                  >
                    <GripVertical size={17} />
                  </div>
                ) : (
                  <div className="mt-1 flex h-8 w-7 shrink-0 items-center justify-center">
                    <span
                      className="h-2.5 w-2.5 rounded-full border-2 border-white shadow-sm"
                      style={{ backgroundColor: color }}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(entry.key);
                  }}
                  className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
                  style={{ backgroundColor: color }}
                  aria-label={`Select ${entry.typeLabel.toLowerCase()} ${entry.name || index + 1}`}
                >
                  {entry.stopNumber ?? (entry.kind === "terminal" ? "T" : index + 1)}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {entry.typeLabel}
                    </span>
                    {entry.existing && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
                        Existing
                      </span>
                    )}
                    {entry.positionPending && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                        Proposed point
                      </span>
                    )}
                    {entry.canConvertToStop && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onConvertToKind(entry.key, "stop");
                        }}
                        title="Replace this terminal with a stop in this route"
                        className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        <ArrowRightLeft size={12} />
                        Convert to stop
                      </button>
                    )}
                    {entry.canConvertToTerminal && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onConvertToKind(entry.key, "terminal");
                        }}
                        title="Convert this road stop into a terminal at its current position in the proposed route"
                        className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-800 hover:bg-blue-100"
                      >
                        <ArrowRightLeft size={12} />
                        Convert to terminal
                      </button>
                    )}
                  </div>

                  {entry.editable && !entry.pendingRemoval ? (
                    <input
                      value={entry.name}
                      maxLength={120}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => onNameChange(entry.key, event.target.value)}
                      placeholder={`Name of this ${entry.typeLabel.toLowerCase()}`}
                      aria-label={`${entry.typeLabel} name`}
                      className={`h-9 w-full min-w-0 rounded-lg border bg-white px-2.5 text-sm outline-none focus:ring-1 ${
                        nameMissing
                          ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                          : "border-gray-300 focus:border-[#12395A] focus:ring-[#12395A]"
                      }`}
                    />
                  ) : (
                    <p className={`truncate py-1.5 text-sm font-medium ${entry.pendingRemoval ? "text-red-800 line-through" : "text-gray-900"}`}>
                      {entry.name || "Unnamed location"}
                    </p>
                  )}

                  {nameMissing && (
                    <p className="mt-1 text-[11px] text-red-600">
                      Enter a name for this location.
                    </p>
                  )}

                  {entry.photoFileName && (
                    <div className="mt-2 flex min-w-0 items-center gap-2 text-[11px] text-gray-600">
                      {entry.photoPreviewUrl && (
                        <img
                          src={entry.photoPreviewUrl}
                          alt={`Preview for ${entry.name || entry.typeLabel}`}
                          className="h-9 w-9 shrink-0 rounded-md object-cover"
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {entry.photoFileName}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemovePhoto(entry.key);
                        }}
                        title="Remove photo"
                        aria-label={`Remove photo from ${entry.name || entry.typeLabel}`}
                        className="rounded p-1 text-gray-500 hover:bg-white hover:text-red-600"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  {entry.canMove && (
                    <div className="flex flex-col">
                      <button
                        type="button"
                        disabled={!canMoveUp}
                        onClick={(event) => {
                          event.stopPropagation();
                          onMove(entry.draftIndex ?? index, -1);
                        }}
                        aria-label="Move stop up"
                        title="Move up"
                        className="rounded p-1 text-gray-500 hover:bg-white hover:text-[#12395A] disabled:cursor-not-allowed disabled:opacity-25"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={!canMoveDown}
                        onClick={(event) => {
                          event.stopPropagation();
                          onMove(entry.draftIndex ?? index, 1);
                        }}
                        aria-label="Move stop down"
                        title="Move down"
                        className="rounded p-1 text-gray-500 hover:bg-white hover:text-[#12395A] disabled:cursor-not-allowed disabled:opacity-25"
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  )}

                  {entry.canUpload && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onChoosePhoto(entry.key);
                      }}
                      title="Add or change photo"
                      aria-label={`Add a photo to ${entry.name || entry.typeLabel}`}
                      className={`rounded p-1.5 hover:bg-white ${
                        entry.photoPreviewUrl ? "text-[#12395A]" : "text-gray-500"
                      }`}
                    >
                      <ImagePlus size={16} />
                    </button>
                  )}

                  {entry.canRemove && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemove(entry.key);
                      }}
                      title={entry.existing ? "Request removal from this route" : "Remove proposed point"}
                      aria-label={`${entry.existing ? "Request removal of" : "Remove"} ${entry.name || entry.typeLabel}`}
                      className="rounded p-1.5 text-gray-500 hover:bg-white hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  {entry.canRestore && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRestore(entry.key);
                      }}
                      title="Restore this location to the proposed route"
                      aria-label={`Restore ${entry.name || entry.typeLabel} to route`}
                      className="rounded p-1.5 text-red-700 hover:bg-white hover:text-green-700"
                    >
                      <Undo2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {entries.some((entry) => entry.canMove) && (
        <p className="mt-2 text-[11px] text-gray-500">
          Drag a road stop using the grip handle, or use the arrows to move it. Reordering affects only this proposed route sequence.
        </p>
      )}
      {entries.some((entry) => entry.pendingRemoval) && (
        <p className="mt-2 text-[11px] text-red-700">
          Requested removals are not applied unless a moderator approves the proposal. A shared location is soft-deleted only when no other route still uses it.
        </p>
      )}
    </section>
  );
}
