import {
  Plus,
  X,
} from "lucide-react";

// ==================================================
// TYPES
// ==================================================

export interface PhotoPreview {
  previewUrl: string;
  fileName: string;
}

interface PhotoUploadGridProps {
  photos: PhotoPreview[];
  maximum: number;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

// ==================================================
// COMPONENT
// ==================================================

export default function PhotoUploadGrid({
  photos,
  maximum,
  onAdd,
  onRemove,
}: PhotoUploadGridProps) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
          Photos (optional)
        </label>

        <span className="text-xs text-gray-500">
          {photos.length}/{maximum}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, index) => (
          <div
            key={photo.previewUrl}
            className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
          >
            <img
              src={photo.previewUrl}
              alt={`Selected photo ${index + 1}`}
              className="h-24 w-full object-cover"
            />

            <button
              type="button"
              aria-label={`Remove photo ${index + 1}`}
              onClick={() => onRemove(index)}
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-red-600"
            >
              <X size={15} />
            </button>

            <p className="truncate px-2 py-1 text-[11px] text-gray-600">
              {photo.fileName}
            </p>
          </div>
        ))}

        {photos.length < maximum && (
          <button
            type="button"
            onClick={onAdd}
            className="flex min-h-[96px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-center transition-colors hover:border-[#12395A] hover:bg-gray-100"
          >
            <Plus size={22} className="mb-1 text-gray-500" />

            <span className="text-sm font-medium text-gray-700">
              Add photo
            </span>

            <span className="mt-0.5 text-xs text-gray-500">
              JPG, PNG or WebP
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
