import { Car } from "lucide-react";

import type {
  MyContribution,
  MyContributionStatus,
} from "@/lib/contributions";

interface ContributionHistoryProps {
  contributions: MyContribution[];
  loading: boolean;
  error: string;
}

function formatDate(date: string) {
  const value = new Date(date);

  if (Number.isNaN(value.getTime())) {
    return "Unknown date";
  }

  return value.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function kindLabel(kind: MyContribution["kind"]) {
  switch (kind) {
    case "terminal":
      return "Terminal";
    case "stop":
      return "Stop";
    case "route":
      return "Route";
    case "route_change":
      return "Route modification";
    default:
      return "Contribution";
  }
}

function statusLabel(status: MyContributionStatus) {
  switch (status) {
    case "pending":
      return "Pending review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "conflicted":
      return "Conflicted";
    case "withdrawn":
      return "Withdrawn";
  }
}

function statusClass(status: MyContributionStatus) {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "approved":
      return "bg-green-100 text-green-800";
    case "rejected":
      return "bg-red-100 text-red-800";
    case "conflicted":
      return "bg-orange-100 text-orange-800";
    case "withdrawn":
      return "bg-gray-100 text-gray-600";
  }
}

export default function ContributionHistory({
  contributions,
  loading,
  error,
}: ContributionHistoryProps) {
  return (
    <div className="mt-6 flex flex-col gap-3">
      {loading && (
        <p role="status" className="text-sm text-gray-500">
          Loading your contributions...
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {!loading && !error && contributions.length === 0 && (
        <div className="flex min-h-[330px] flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 text-center shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <div className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[#f1f3f5]">
            <Car
              size={27}
              strokeWidth={1.8}
              className="text-gray-400"
            />
          </div>

          <h2 className="mt-5 text-[17px] font-semibold text-gray-800">
            Nothing to see here yet.
          </h2>

          <p className="mt-2 max-w-[380px] text-[13px] leading-[1.6] text-gray-500">
            Your submitted contributions and their review statuses will
            appear here.
          </p>
        </div>
      )}

      {!loading && !error && contributions.map((item) => (
        <article
          key={item.key}
          className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-700">
                {kindLabel(item.kind)}
              </span>

              <p className="text-xs text-gray-500">
                Submitted {formatDate(item.createdAt)}
              </p>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}
            >
              {statusLabel(item.status)}
            </span>
          </div>

          <p className="mt-2 break-words text-sm font-semibold text-gray-900">
            {item.name}
          </p>

          {item.status === "pending" && (
            <p className="mt-1 text-xs text-gray-500">
              Only you and authorized reviewers can see this while it is
              pending.
            </p>
          )}

          {(item.status === "rejected" ||
            item.status === "conflicted" ||
            item.status === "withdrawn") &&
            item.note && (
              <p className="mt-2 text-sm text-gray-600">
                Review note: {item.note}
              </p>
            )}
        </article>
      ))}
    </div>
  );
}
