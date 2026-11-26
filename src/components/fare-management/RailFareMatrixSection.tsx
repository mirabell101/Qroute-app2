import { Archive, Pencil, Plus, TrainFront } from "lucide-react";

import type {
  AdminFareManagementData,
  AdminRailFare,
  AdminRailRoute,
} from "@/lib/adminFareApi";

import {
  activeRailFare,
  dateStatus,
  displayDate,
  EmptyState,
  Field,
  getStationName,
  peso,
  SelectField,
  StatusBadge,
  TABLE_HEAD_CLASS,
} from "./fareManagementShared";

interface RailFareMatrixSectionProps {
  currentData: AdminFareManagementData;
  railRouteId: string;
  onRailRouteChange: (value: string) => void;
  railAsOfDate: string;
  onRailAsOfDateChange: (value: string) => void;
  selectedRailRoute: AdminRailRoute | undefined;
  selectedRailFares: AdminRailFare[];
  isMutating: boolean;
  onOpenEditor: (
    route: AdminRailRoute,
    fromStopId: number,
    toStopId: number,
    existing: AdminRailFare | null,
  ) => void;
  onArchive: (fare: AdminRailFare) => void;
}

export default function RailFareMatrixSection({
  currentData,
  railRouteId,
  onRailRouteChange,
  railAsOfDate,
  onRailAsOfDateChange,
  selectedRailRoute,
  selectedRailFares,
  isMutating,
  onOpenEditor,
  onArchive,
}: RailFareMatrixSectionProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_220px]">
        <SelectField
          label="Train route"
          value={railRouteId}
          onChange={onRailRouteChange}
          disabled={!currentData.railRoutes.length}
        >
          {currentData.railRoutes.map((route) => (
            <option key={route.id} value={route.id}>
              {route.name} · {route.variant_code}
            </option>
          ))}
        </SelectField>

        <Field
          label="View fares effective on"
          type="date"
          value={railAsOfDate}
          onChange={onRailAsOfDateChange}
        />
      </div>

      {!currentData.railRoutes.length ? (
        <EmptyState
          title="No train routes available"
          description="Only routes assigned to matrix-based transport variants with at least two ordered train stations can be managed here."
        />
      ) : selectedRailRoute ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900">
                {selectedRailRoute.name}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {selectedRailRoute.stations.length} ordered stations · {selectedRailFares.length} fare records
              </p>
            </div>

            <span className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700">
              <TrainFront size={14} />
              Matrix fare model
            </span>
          </div>

          <div className="rounded-xl border border-slate-200">
            <div className="border-b border-slate-200 px-4 py-3">
              <h4 className="font-semibold text-slate-800">
                Station-to-station fare matrix
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                Select any station pair to add or edit its fare. Both directions display the same stored fare record.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] border-collapse text-center text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-[160px] bg-[#EAF1F8] px-3 py-3 text-left text-xs font-semibold text-slate-600">
                      From / To
                    </th>
                    {selectedRailRoute.stations.map((station) => (
                      <th
                        key={station.id}
                        className="min-w-[120px] bg-[#EAF1F8] px-3 py-3 text-xs font-semibold text-slate-700"
                      >
                        {station.name}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {selectedRailRoute.stations.map((fromStation) => (
                    <tr key={fromStation.id}>
                      <th className="sticky left-0 z-10 bg-white px-3 py-3 text-left text-xs font-semibold text-slate-700">
                        {fromStation.name}
                      </th>
                      {selectedRailRoute.stations.map((toStation) => {
                        if (fromStation.id === toStation.id) {
                          return (
                            <td
                              key={toStation.id}
                              className="bg-slate-50 px-2 py-3 text-slate-300"
                            >
                              —
                            </td>
                          );
                        }

                        const fare = activeRailFare(
                          currentData.railFares,
                          selectedRailRoute.id,
                          fromStation.id,
                          toStation.id,
                          railAsOfDate,
                        );

                        return (
                          <td key={toStation.id} className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() =>
                                onOpenEditor(
                                  selectedRailRoute,
                                  fromStation.id,
                                  toStation.id,
                                  fare,
                                )
                              }
                              className={`min-h-[68px] w-full rounded-lg border px-2 py-2 text-left transition ${
                                fare
                                  ? "border-slate-200 bg-white hover:border-[#102E4D] hover:bg-blue-50"
                                  : "border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-[#102E4D] hover:bg-blue-50"
                              }`}
                              title={`${fromStation.name} to ${toStation.name}`}
                            >
                              {fare ? (
                                <>
                                  <p className="text-xs font-bold text-[#102E4D]">
                                    {peso(fare.stored_value_fare)}
                                  </p>
                                  <p className="mt-1 text-[10px] text-slate-500">SV</p>
                                  <p className="mt-1 border-t border-slate-100 pt-1 text-xs font-semibold text-slate-700">
                                    {peso(fare.single_journey_fare)}
                                  </p>
                                  <p className="text-[10px] text-slate-400">Single</p>
                                </>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-medium">
                                  <Plus size={13} />
                                  Add fare
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Stored-value fare
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Usually the contactless or stored-value ticket fare.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Single-journey fare
              </p>
              <p className="mt-1 text-sm text-slate-600">
                The single-journey ticket fare.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="font-bold text-slate-900">Fare schedule records</h4>
              <p className="mt-1 text-xs text-slate-500">
                Includes active, upcoming, expired and archived station-pair records.
              </p>
            </div>

            {!selectedRailFares.length ? (
              <EmptyState
                title="No train fare records"
                description="Select a matrix cell above to add the first station-pair fare."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[750px] border-collapse text-left text-sm">
                    <thead>
                      <tr>
                        <th className={TABLE_HEAD_CLASS}>Station Pair</th>
                        <th className={TABLE_HEAD_CLASS}>Stored Value</th>
                        <th className={TABLE_HEAD_CLASS}>Single Journey</th>
                        <th className={TABLE_HEAD_CLASS}>Effective From</th>
                        <th className={TABLE_HEAD_CLASS}>Status</th>
                        <th className={`${TABLE_HEAD_CLASS} text-center`}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedRailFares.map((fare) => {
                        const status = dateStatus(
                          fare.effective_from,
                          fare.effective_to,
                          fare.is_deleted,
                          railAsOfDate,
                        );

                        return (
                          <tr key={fare.id}>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-800">
                                {getStationName(selectedRailRoute, fare.from_stop_id)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                to {getStationName(selectedRailRoute, fare.to_stop_id)}
                              </p>
                            </td>
                            <td className="px-4 py-3">{peso(fare.stored_value_fare)}</td>
                            <td className="px-4 py-3">{peso(fare.single_journey_fare)}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{displayDate(fare.effective_from)}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                Until {displayDate(fare.effective_to)}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={status} />
                            </td>
                            <td className="px-4 py-3">
                              {!fare.is_deleted && (
                                <div className="flex justify-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenEditor(
                                        selectedRailRoute,
                                        fare.from_stop_id,
                                        fare.to_stop_id,
                                        fare,
                                      )
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:border-[#102E4D] hover:text-[#102E4D]"
                                  >
                                    <Pencil size={13} />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isMutating}
                                    onClick={() => onArchive(fare)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                                  >
                                    <Archive size={13} />
                                    Archive
                                  </button>
                                </div>
                              )}
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
        </>
      ) : null}
    </div>
  );
}
