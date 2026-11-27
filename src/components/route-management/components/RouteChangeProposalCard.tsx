import {
  AlertTriangle, ArrowRight, Ban, Check, Clock3, GitBranch, MapPin,
} from "lucide-react";
import type {
  AdminRouteChangeProposalRecord,
  AdminRouteRecord,
} from "@/lib/adminApi";
import {
  formatProposalDate,
  proposalPointCoordinates,
  proposalPointName,
  proposalPointType,
  proposalPoints,
  proposalTypeLabel,
} from "../helpers";

// ============================================================
// ROUTE CHANGE PROPOSAL CARD
// ============================================================

export function RouteChangeProposalCard({
  proposal,
  route,
  canModerate,
  isMutating,
  onModerate,
}: {
  proposal: AdminRouteChangeProposalRecord;
  route: AdminRouteRecord | undefined;
  canModerate: boolean;
  isMutating: boolean;
  onModerate: (
    proposal: AdminRouteChangeProposalRecord,
    action: "approve" | "reject",
  ) => void;
}) {
  const orderedPoints = proposalPoints(proposal);
  const activePoints = orderedPoints.filter(
    (point) => !point.is_removed_from_route,
  );
  const removalPoints = orderedPoints.filter(
    (point) => point.is_removed_from_route,
  );

  const currentRoutePoints = route
    ? [...route.route_stops].sort(
        (left, right) => left.stop_order - right.stop_order,
      )
    : [];

  const routeName = route?.name ?? `Route #${proposal.route_id}`;
  const proposedRouteName = proposal.proposed_name?.trim() || routeName;

  const proposedChangeDescription = (() => {
    switch (proposal.proposal_type) {
      case "insert_point":
        return "Add one or more locations within the existing route sequence.";
      case "extend_route":
        return "Extend the existing route while preserving its route identity.";
      case "combined":
        return "Combine internal insertions and an extension in one route proposal.";
      case "remove_points":
        return "Remove selected locations from this route after approval.";
      default:
        return "Modify the existing route after moderator approval.";
    }
  })();

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* PROPOSAL HEADER */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF1F8] px-3 py-1.5 text-xs font-semibold text-[#102E4D]">
              <GitBranch size={13} />
              {proposalTypeLabel(proposal)}
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700">
              Pending review
            </span>
            {removalPoints.length > 0 && (
              <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                {removalPoints.length} removal{removalPoints.length === 1 ? "" : "s"} requested
              </span>
            )}
          </div>

          <h4 className="mt-3 break-words text-lg font-bold text-slate-900">
            {proposedRouteName}
          </h4>

          <p className="mt-1 text-sm text-slate-500">
            Existing route:{" "}
            <span className="font-semibold text-slate-700">{routeName}</span>
            {" · "}Route ID: {proposal.route_id}
          </p>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
            <span>
              Submitted by{" "}
              <span className="font-semibold text-slate-700">
                {proposal.contributor_display_name}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock3 size={13} />
              {formatProposalDate(proposal.created_at)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            Proposal #{proposal.id}
          </span>
        </div>
      </div>

      {/* CONTRIBUTOR REMARKS */}
      {proposal.contributor_remarks?.trim() && (
        <section className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
            Contributor remarks
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
            {proposal.contributor_remarks}
          </p>
        </section>
      )}

      {/* ROUTE CHANGE DETAILS */}
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h5 className="flex items-center gap-2 text-sm font-bold text-[#102E4D]">
              <GitBranch size={16} /> Proposed active sequence
            </h5>
            <span className="text-xs text-slate-500">
              {activePoints.length} {activePoints.length === 1 ? "point" : "points"}
            </span>
          </div>

          {proposal.proposed_name && (
            <div className="mb-3 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs">
              <span className="text-slate-500">Proposed route name</span>
              <p className="mt-0.5 font-semibold text-slate-800">
                {proposal.proposed_name}
              </p>
            </div>
          )}

          {activePoints.length > 0 ? (
            <ol className="space-y-2">
              {activePoints.map((point) => {
                const currentName = point.terminals?.name ?? point.stops?.name ?? "Point unavailable";
                const hasNameChange = Boolean(
                  point.proposed_name?.trim() &&
                  point.proposed_name.trim() !== (point.original_name ?? currentName),
                );
                const originalCoordinates = proposalPointCoordinates(
                  point.original_latitude,
                  point.original_longitude,
                );
                const proposedCoordinates = proposalPointCoordinates(
                  point.proposed_latitude,
                  point.proposed_longitude,
                );
                const hasCoordinateChange = Boolean(
                  proposedCoordinates && proposedCoordinates !== originalCoordinates,
                );

                return (
                  <li
                    key={`${proposal.id}-active-${point.stop_order}`}
                    className="flex items-start gap-3 rounded-lg border border-blue-100 bg-white px-3 py-2.5"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EAF1F8] text-xs font-bold text-[#102E4D]">
                      {point.proposed_stop_order}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold text-slate-800">
                        {proposalPointName(point)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {proposalPointType(point)}
                        {" · "}
                        {point.is_new_point ? "New proposed point" : "Existing approved point"}
                      </p>

                      {hasNameChange && (
                        <p className="mt-1 text-xs text-blue-700">
                          Name change: {point.original_name ?? currentName} → {point.proposed_name}
                        </p>
                      )}

                      {hasCoordinateChange && (
                        <p className="mt-1 text-xs text-blue-700">
                          Coordinate change: {originalCoordinates ?? "Original coordinates unavailable"} → {proposedCoordinates}
                        </p>
                      )}

                      {point.replaces_stop_order !== null && (
                        <p className="mt-1 text-xs font-medium text-violet-700">
                          Replacement for original route point #{point.replaces_stop_order}
                        </p>
                      )}
                    </div>

                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                      point.is_new_point
                        ? "bg-green-50 text-green-700"
                        : "bg-slate-100 text-slate-600"
                    }`}>
                      {point.is_new_point ? "New" : "Existing"}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="rounded-lg bg-white px-3 py-4 text-center text-sm text-slate-500">
              No active proposed locations are available.
            </p>
          )}
        </section>

        {/* CURRENT ROUTE SEQUENCE */}
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h5 className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <MapPin size={16} /> Current route sequence
            </h5>
            <span className="text-xs text-slate-500">
              {currentRoutePoints.length} {currentRoutePoints.length === 1 ? "point" : "points"}
            </span>
          </div>

          {currentRoutePoints.length > 0 ? (
            <ol className="space-y-2">
              {currentRoutePoints.map((routeStop) => (
                <li
                  key={routeStop.id}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                    {routeStop.stop_order}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-slate-700">
                      {routeStop.terminals?.name ?? routeStop.stops?.name ?? "Point unavailable"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {routeStop.terminals
                        ? "Terminal"
                        : routeStop.stops?.stop_type === "train_station"
                          ? "Train station"
                          : "Road stop"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <AlertTriangle size={15} /> Current route unavailable
              </p>
              <p className="mt-1 text-xs text-amber-700">
                The target route could not be loaded. The proposal should be checked for a conflict before approval.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* REMOVAL REQUESTS */}
      {removalPoints.length > 0 && (
        <section className="mt-4 rounded-xl border border-red-200 bg-red-50/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h5 className="flex items-center gap-2 text-sm font-bold text-red-800">
              <Ban size={16} /> Removal requested
            </h5>
            <span className="text-xs text-red-700">
              {removalPoints.length} {removalPoints.length === 1 ? "location" : "locations"}
            </span>
          </div>
          <ol className="space-y-2">
            {removalPoints.map((point) => (
              <li
                key={`${proposal.id}-removed-${point.stop_order}`}
                className="flex items-start gap-3 rounded-lg border border-red-100 bg-white px-3 py-2.5"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-bold text-red-700">
                  {point.stop_order}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-slate-800">
                    {point.original_name ?? proposalPointName(point)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {proposalPointType(point)} · Original route position #{point.stop_order}
                  </p>
                  <p className="mt-1 text-xs font-medium text-red-700">
                    Will be detached from this route on approval
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-red-100 px-2 py-1 text-[10px] font-semibold text-red-700">
                  Removal requested
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* PROPOSAL CHANGE SUMMARY */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <span className="font-semibold text-slate-700">Proposed change:</span>
        <span>{proposedChangeDescription}</span>
        <ArrowRight size={14} className="text-slate-400" />
        <span>
          Existing shared locations are not changed until moderator approval. Route-specific removals are detached from this route, and are only soft-deleted when no other route uses them.
        </span>
      </div>

      {/* EXISTING MODERATION NOTE */}
      {proposal.moderation_note && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold text-slate-600">Existing moderation note</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
            {proposal.moderation_note}
          </p>
        </div>
      )}

      {/* ACTIONS */}
      {canModerate && (
        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={isMutating}
            onClick={() => onModerate(proposal, "reject")}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Ban size={15} /> Reject proposal
          </button>
          <button
            type="button"
            disabled={isMutating || activePoints.length < 2 || !route}
            onClick={() => onModerate(proposal, "approve")}
            title={
              !route
                ? "The target route is unavailable."
                : activePoints.length < 2
                  ? "The proposal needs at least two active points."
                  : undefined
            }
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check size={15} /> Approve proposal
          </button>
        </div>
      )}
    </article>
  );
}

