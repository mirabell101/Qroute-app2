import { Eye, GitBranch, MapPin } from "lucide-react";

// ============================================================
// SHARED PENDING REVIEW CARD
// ============================================================

export function PendingReviewCard({
  category,
  title,
  description,
  metadata,
  onView,
}: {
  category: string;
  title: string;
  description: string;
  metadata: string;
  onView: () => void;
}) {
  return (
    <article className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF1F8] text-[#102E4D]">
          {category === "Route change proposal" ? (
            <GitBranch size={19} />
          ) : (
            <MapPin size={19} />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#EAF1F8] px-2.5 py-1 text-[11px] font-semibold text-[#102E4D]">
              {category}
            </span>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
              Pending review
            </span>
          </div>

          <h4 className="mt-2 break-words text-base font-bold text-slate-900">
            {title}
          </h4>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
          <p className="mt-1 text-xs text-slate-400">{metadata}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onView}
        className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#19476D] sm:self-center"
      >
        <Eye size={15} />
        View &amp; review
      </button>
    </article>
  );
}

