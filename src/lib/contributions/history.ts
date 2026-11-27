import { supabase } from "@/lib/supabase";
import type {
  ContributionKind,
  MyContribution,
  MyContributionKind,
  MyContributionStatus,
  ReviewStatus,
  RouteChangeProposalStatus,
  RouteChangeProposalType,
} from "./types";

interface OwnRow {
  id: number;
  name: string;
  moderation_status: ReviewStatus;
  moderation_note: string | null;
  created_at: string;
}

interface OwnRouteChangeProposalRow {
  id: number;
  route_id: number;
  proposal_type: RouteChangeProposalType;
  proposed_name: string | null;
  status: RouteChangeProposalStatus;
  moderation_note: string | null;
  created_at: string;
}

interface OwnRouteChangeProposalPointRow {
  terminal_id: number | null;
  stop_id: number | null;
}

/**
 * Loads the current user's standalone contributions and route-change proposals.
 * Proposal-owned new locations are listed under their proposal, not twice as
 * standalone terminal/stop submissions.
 */
export async function getMyContributions(userId: string): Promise<MyContribution[]> {
  const load = async (table: "terminals" | "stops" | "routes") => {
    const { data, error } = await supabase
      .from(table)
      .select("id, name, moderation_status, moderation_note, created_at")
      .eq("created_by", userId)
      .eq("is_deleted", false);

    if (error) throw new Error(error.message);
    return (data ?? []) as OwnRow[];
  };

  const [terminals, stops, routes, routeChangeProposalsResult] = await Promise.all([
    load("terminals"),
    load("stops"),
    load("routes"),
    supabase
      .from("route_change_proposals")
      .select("id, route_id, proposal_type, proposed_name, status, moderation_note, created_at")
      .eq("contributor_id", userId),
  ]);

  if (routeChangeProposalsResult.error) {
    throw new Error(routeChangeProposalsResult.error.message);
  }

  const routeChangeProposals =
    (routeChangeProposalsResult.data ?? []) as OwnRouteChangeProposalRow[];
  const proposalIds = routeChangeProposals.map((proposal) => proposal.id);
  let proposalCreatedPoints: OwnRouteChangeProposalPointRow[] = [];

  if (proposalIds.length > 0) {
    const { data, error } = await supabase
      .from("route_change_proposal_points")
      .select("terminal_id, stop_id")
      .eq("is_new_point", true)
      .in("proposal_id", proposalIds);

    if (error) throw new Error(error.message);
    proposalCreatedPoints = (data ?? []) as OwnRouteChangeProposalPointRow[];
  }

  const proposalCreatedTerminalIds = new Set<number>();
  const proposalCreatedStopIds = new Set<number>();
  for (const point of proposalCreatedPoints) {
    if (point.terminal_id !== null) proposalCreatedTerminalIds.add(point.terminal_id);
    if (point.stop_id !== null) proposalCreatedStopIds.add(point.stop_id);
  }

  const toItem = (kind: ContributionKind) => (row: OwnRow): MyContribution => ({
    key: `${kind}-${row.id}`,
    kind,
    id: row.id,
    name: row.name,
    status: row.moderation_status,
    note: row.moderation_note,
    createdAt: row.created_at,
  });

  const normalContributions: MyContribution[] = [
    ...terminals
      .filter((row) => !proposalCreatedTerminalIds.has(row.id))
      .map(toItem("terminal")),
    ...stops
      .filter((row) => !proposalCreatedStopIds.has(row.id))
      .map(toItem("stop")),
    ...routes.map(toItem("route")),
  ];

  const proposalContributions: MyContribution[] = routeChangeProposals.map((row) => {
    const proposalLabel =
      row.proposal_type === "remove_points"
        ? "Route location removal proposal"
        : row.proposal_type === "combined"
          ? "Combined route-change proposal"
          : row.proposal_type === "insert_point"
            ? "Route insertion proposal"
            : "Route extension proposal";

    return {
      key: `route-change-${row.id}`,
      kind: "route_change" as MyContributionKind,
      id: row.id,
      name: row.proposed_name?.trim() || `${proposalLabel} · Route #${row.route_id}`,
      status: row.status as MyContributionStatus,
      note: row.moderation_note,
      createdAt: row.created_at,
    };
  });

  return [...normalContributions, ...proposalContributions].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
