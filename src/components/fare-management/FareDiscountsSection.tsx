import { Archive, Pencil, Plus } from "lucide-react";

import type {
  AdminFareManagementData,
} from "@/lib/adminFareApi";

import {
  dateStatus,
  displayDate,
  EmptyState,
  getVariantName,
  StatusBadge,
  TABLE_HEAD_CLASS,
} from "./fareManagementShared";

interface FareDiscountsSectionProps {
  currentData: AdminFareManagementData;
  discountRules: AdminFareManagementData["discountRules"];
  isMutating: boolean;
  onAdd: () => void;
  onEdit: (rule: AdminFareManagementData["discountRules"][number]) => void;
  onArchive: (rule: AdminFareManagementData["discountRules"][number]) => void;
}

export default function FareDiscountsSection({
  currentData,
  discountRules,
  isMutating,
  onAdd,
  onEdit,
  onArchive,
}: FareDiscountsSectionProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900">
            Passenger Discount Rules
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Discounts remain assigned to individual transport variants.
          </p>
        </div>

        <button
          type="button"
          onClick={onAdd}
          disabled={!currentData.variants.length}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#102E4D] px-4 text-sm font-semibold text-white transition hover:bg-[#19476D] disabled:opacity-50"
        >
          <Plus size={16} />
          Add Discount
        </button>
      </div>

      {!discountRules.length ? (
        <EmptyState
          title="No discount rules found"
          description="Add a passenger discount to begin managing student, senior citizen and PWD fares."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className={TABLE_HEAD_CLASS}>Transport Variant</th>
                  <th className={TABLE_HEAD_CLASS}>Passenger Category</th>
                  <th className={TABLE_HEAD_CLASS}>Discount</th>
                  <th className={TABLE_HEAD_CLASS}>Effective Schedule</th>
                  <th className={TABLE_HEAD_CLASS}>Status</th>
                  <th className={`${TABLE_HEAD_CLASS} text-center`}>Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {discountRules.map((rule) => {
                  const status = dateStatus(
                    rule.effective_from,
                    rule.effective_to,
                    rule.is_deleted,
                  );

                  return (
                    <tr key={rule.id} className="transition hover:bg-slate-50">
                      <td className="px-4 py-4 font-semibold text-slate-800">
                        {getVariantName(currentData, rule.variant_id)}
                      </td>
                      <td className="px-4 py-4 capitalize text-slate-700">
                        {rule.passenger_category.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-4">
                        <span className="rounded-lg bg-green-50 px-3 py-1.5 font-bold text-green-700">
                          {rule.discount_percent}%
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-700">
                          {displayDate(rule.effective_from)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Until {displayDate(rule.effective_to)}
                        </p>
                      </td>
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
    </div>
  );
}
