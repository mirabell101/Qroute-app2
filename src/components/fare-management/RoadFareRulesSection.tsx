import { Archive, AlertCircle, Pencil, Plus } from "lucide-react";

import type {
  AdminFareManagementData,
  AdminFareVariant,
  AdminRoadFareRule,
} from "@/lib/adminFareApi";

import {
  dateStatus,
  displayDate,
  EmptyState,
  peso,
  SelectField,
  StatusBadge,
  TABLE_HEAD_CLASS,
} from "./fareManagementShared";

interface RoadFareRulesSectionProps {
  currentData: AdminFareManagementData;
  distanceVariants: AdminFareVariant[];
  roadVariantId: string;
  onRoadVariantChange: (value: string) => void;
  roadRules: AdminRoadFareRule[];
  isMutating: boolean;
  onAdd: () => void;
  onEdit: (rule: AdminRoadFareRule) => void;
  onArchive: (rule: AdminRoadFareRule) => void;
}

export default function RoadFareRulesSection({
  currentData,
  distanceVariants,
  roadVariantId,
  onRoadVariantChange,
  roadRules,
  isMutating,
  onAdd,
  onEdit,
  onArchive,
}: RoadFareRulesSectionProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <SelectField
            label="Transport variant"
            value={roadVariantId}
            onChange={onRoadVariantChange}
            disabled={!distanceVariants.length}
          >
            {distanceVariants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.name} ({variant.code})
                {!variant.is_active ? " · Inactive" : ""}
              </option>
            ))}
          </SelectField>

          <div className="flex items-end">
            <div className="w-full rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-xs font-medium text-blue-700">
                Available distance-based variants
              </p>
              <p className="mt-1 text-lg font-bold text-[#102E4D]">
                {distanceVariants.length}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onAdd}
          disabled={!distanceVariants.length || isMutating}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#102E4D] px-4 text-sm font-semibold text-white transition hover:bg-[#19476D] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={16} />
          Add Fare Rule
        </button>
      </div>

      {!distanceVariants.length ? (
        <EmptyState
          title="No distance-based variants found"
          description="Active or inactive distance-based transport variants will appear here when available."
        />
      ) : !roadRules.length ? (
        <EmptyState
          title="No fare rules for this variant"
          description="Create the first road fare rule for the selected transport variant."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className={TABLE_HEAD_CLASS}>Schedule</th>
                  <th className={TABLE_HEAD_CLASS}>Base Fare</th>
                  <th className={TABLE_HEAD_CLASS}>Included Distance</th>
                  <th className={TABLE_HEAD_CLASS}>Rounding Step</th>
                  <th className={TABLE_HEAD_CLASS}>Status</th>
                  <th className={`${TABLE_HEAD_CLASS} text-center`}>Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {roadRules.map((rule) => {
                  const bands = currentData.distanceBands
                    .filter((band) => band.fare_rule_id === rule.id)
                    .sort((a, b) => a.lower_distance_km - b.lower_distance_km);

                  const status = dateStatus(
                    rule.effective_from,
                    rule.effective_to,
                    rule.is_deleted,
                  );

                  return (
                    <tr key={rule.id} className="transition hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-800">
                          {displayDate(rule.effective_from)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Until {displayDate(rule.effective_to)}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {bands.length} distance {bands.length === 1 ? "band" : "bands"}
                        </p>
                      </td>

                      <td className="px-4 py-4 font-semibold text-[#102E4D]">
                        {peso(rule.base_fare)}
                      </td>
                      <td className="px-4 py-4">{rule.base_distance_km} km</td>
                      <td className="px-4 py-4">₱{rule.rounding_step.toFixed(2)}</td>
                      <td className="px-4 py-4">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-center gap-2">
                          {!rule.is_deleted && (
                            <>
                              <button
                                type="button"
                                onClick={() => onEdit(rule)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#102E4D] hover:text-[#102E4D]"
                              >
                                <Pencil size={13} />
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={isMutating}
                                onClick={() => onArchive(rule)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                              >
                                <Archive size={13} />
                                Archive
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {roadRules.some((rule) => !rule.is_deleted) && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-blue-700" />
            <div>
              <p className="text-sm font-semibold text-blue-900">
                Progressive fare calculation
              </p>
              <p className="mt-1 text-xs leading-5 text-blue-800">
                The first distance band begins at the included base distance.
                Following bands must be contiguous, and the final band must
                have no upper-distance limit. These conditions are validated
                again by the database when saved.
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
