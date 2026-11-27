import { Ban, Check } from "lucide-react";
import type { AdminMapImage } from "@/lib/adminApi";
import { formatProposalDate } from "../helpers";

// ============================================================
// MAP IMAGE REVIEW CARD
// ============================================================

export function MapImageReviewCard({
  image,
  canModerate,
  canApprove,
  isMutating,
  onModerate,
}: {
  image: AdminMapImage;
  canModerate: boolean;
  canApprove: boolean;
  isMutating: boolean;
  onModerate: (
    image: AdminMapImage,
    action: "approve" | "reject",
  ) => void;
}) {
  const statusLabel = image.isBanned
    ? "Banned"
    : image.isDeleted
      ? "Deleted"
      : image.moderationStatus === "pending"
        ? "Pending"
        : image.moderationStatus === "approved"
          ? "Approved"
          : "Rejected";

  const statusStyle = image.isBanned || image.isDeleted
    ? "bg-red-100 text-red-700"
    : image.moderationStatus === "approved"
      ? "bg-green-100 text-green-700"
      : image.moderationStatus === "rejected"
        ? "bg-red-100 text-red-700"
        : "bg-amber-100 text-amber-700";

  const isPending =
    image.moderationStatus === "pending" &&
    !image.isBanned &&
    !image.isDeleted;

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="aspect-[4/3] bg-slate-100">
        {image.imageUrl ? (
          <img
            src={image.imageUrl}
            alt={image.caption?.trim() || `Submitted map photograph ${image.id}`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-500">
            The secure preview could not be generated for this photograph.
          </div>
        )}
      </div>

      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-500">
            Image #{image.id}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyle}`}>
            {statusLabel}
          </span>
        </div>

        {image.caption?.trim() ? (
          <p className="whitespace-pre-wrap break-words text-sm text-slate-700">
            {image.caption}
          </p>
        ) : (
          <p className="text-xs italic text-slate-400">No caption provided</p>
        )}

        <p className="text-[11px] text-slate-400">
          Submitted {formatProposalDate(image.createdAt)}
        </p>

        {image.moderationNote && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Moderation note: {image.moderationNote}
          </p>
        )}

        {isPending && canModerate && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {canApprove && (
              <button
                type="button"
                disabled={isMutating}
                onClick={() => onModerate(image, "approve")}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50"
              >
                <Check size={13} /> Approve photo
              </button>
            )}
            <button
              type="button"
              disabled={isMutating}
              onClick={() => onModerate(image, "reject")}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              <Ban size={13} /> Reject photo
            </button>
          </div>
        )}

        {isPending && !canApprove && (
          <p className="border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
            This photo cannot be approved until its parent location or proposal is eligible. Remaining pending photographs are automatically approved with an approved parent submission.
          </p>
        )}
      </div>
    </article>
  );
}

