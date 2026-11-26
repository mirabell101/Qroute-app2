import { Plus } from "lucide-react";

import type {
  AdminFareManagementData,
  AdminFareVariant,
  AdminRailRoute,
  AdminFarePassengerCategory,
} from "@/lib/adminFareApi";

import {
  Field,
  getStationName,
  Modal,
  ModalActions,
  SelectField,
  type DiscountForm,
  type RailForm,
  type RoadBandForm,
  type RoadRuleForm,
} from "./fareManagementShared";

interface FareManagementModalsProps {
  roadEditor: RoadRuleForm | null;
  roadEditorError: string | null;
  discountEditor: DiscountForm | null;
  discountEditorError: string | null;
  railEditor: RailForm | null;
  railEditorError: string | null;
  distanceVariants: AdminFareVariant[];
  currentData: AdminFareManagementData | null;
  selectedRailRoute: AdminRailRoute | undefined;
  isSaving: boolean;
  onCloseRoad: () => void;
  onSaveRoad: () => void;
  onRoadEditorPatch: (patch: Partial<RoadRuleForm>) => void;
  onRoadBandChange: (
    index: number,
    key: keyof RoadBandForm,
    value: string,
  ) => void;
  onAddRoadBand: () => void;
  onRemoveRoadBand: (index: number) => void;
  onCloseDiscount: () => void;
  onSaveDiscount: () => void;
  onDiscountEditorPatch: (patch: Partial<DiscountForm>) => void;
  onCloseRail: () => void;
  onSaveRail: () => void;
  onRailEditorPatch: (patch: Partial<RailForm>) => void;
}

export default function FareManagementModals({
  roadEditor,
  roadEditorError,
  discountEditor,
  discountEditorError,
  railEditor,
  railEditorError,
  distanceVariants,
  currentData,
  selectedRailRoute,
  isSaving,
  onCloseRoad,
  onSaveRoad,
  onRoadEditorPatch,
  onRoadBandChange,
  onAddRoadBand,
  onRemoveRoadBand,
  onCloseDiscount,
  onSaveDiscount,
  onDiscountEditorPatch,
  onCloseRail,
  onSaveRail,
  onRailEditorPatch,
}: FareManagementModalsProps) {
  return (
    <>
      {/* ============================================= */}
      {/* ROAD FARE RULE MODAL */}
      {/* ============================================= */}
      {roadEditor && (
        <Modal
          title={
            roadEditor.id === null
              ? "Add Road Fare Rule"
              : `Edit Road Fare Rule #${roadEditor.id}`
          }
          description="Configure the base fare and progressive succeeding-distance rates."
          onClose={() => !isSaving && onCloseRoad()}
          maxWidth="max-w-3xl"
        >
          <div className="space-y-5">
            <SelectField
              label="Transport variant"
              value={roadEditor.variantId}
              onChange={(value) => onRoadEditorPatch({ variantId: value })}
            >
              {distanceVariants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name} ({variant.code})
                </option>
              ))}
            </SelectField>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Base fare (₱)"
                type="number"
                min="0"
                step="0.01"
                value={roadEditor.baseFare}
                onChange={(value) => onRoadEditorPatch({ baseFare: value })}
                placeholder="e.g. 14.00"
              />
              <Field
                label="Included distance (km)"
                type="number"
                min="0"
                step="0.01"
                value={roadEditor.baseDistanceKm}
                onChange={(value) =>
                  onRoadEditorPatch({
                    baseDistanceKm: value,
                    bands:
                      roadEditor.bands.length === 1
                        ? [
                            {
                              ...roadEditor.bands[0],
                              lowerDistanceKm: value,
                            },
                          ]
                        : roadEditor.bands,
                  })
                }
                placeholder="e.g. 4"
              />
              <Field
                label="Rounding step (₱)"
                type="number"
                min="0.01"
                step="0.01"
                value={roadEditor.roundingStep}
                onChange={(value) => onRoadEditorPatch({ roundingStep: value })}
                placeholder="e.g. 0.25"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Effective from"
                type="date"
                value={roadEditor.effectiveFrom}
                onChange={(value) => onRoadEditorPatch({ effectiveFrom: value })}
              />
              <Field
                label="Effective to (optional)"
                type="date"
                value={roadEditor.effectiveTo}
                onChange={(value) => onRoadEditorPatch({ effectiveTo: value })}
              />
            </div>

            <div className="rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div>
                  <h3 className="font-bold text-slate-800">
                    Progressive distance bands
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    The final band must remain unlimited.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onAddRoadBand}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#102E4D] hover:bg-slate-50"
                >
                  <Plus size={14} />
                  Add band
                </button>
              </div>

              <div className="space-y-3 p-4">
                {roadEditor.bands.map((band, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700">
                        Band {index + 1}
                      </p>
                      {roadEditor.bands.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onRemoveRoadBand(index)}
                          className="text-xs font-semibold text-red-600 hover:text-red-800"
                        >
                          Remove band
                        </button>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field
                        label="Lower distance (km)"
                        type="number"
                        min="0"
                        step="0.01"
                        value={band.lowerDistanceKm}
                        onChange={(value) =>
                          onRoadBandChange(index, "lowerDistanceKm", value)
                        }
                      />
                      <Field
                        label={
                          index === roadEditor.bands.length - 1
                            ? "Upper distance (unlimited)"
                            : "Upper distance (km)"
                        }
                        type="number"
                        min="0"
                        step="0.01"
                        value={band.upperDistanceKm}
                        onChange={(value) =>
                          onRoadBandChange(index, "upperDistanceKm", value)
                        }
                        placeholder={
                          index === roadEditor.bands.length - 1
                            ? "Leave blank for unlimited"
                            : "Required"
                        }
                      />
                      <Field
                        label="Rate per km (₱)"
                        type="number"
                        min="0"
                        step="0.01"
                        value={band.perKmRate}
                        onChange={(value) =>
                          onRoadBandChange(index, "perKmRate", value)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {roadEditorError && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {roadEditorError}
              </p>
            )}

            <ModalActions
              saving={isSaving}
              onCancel={onCloseRoad}
              onSave={onSaveRoad}
            />
          </div>
        </Modal>
      )}

      {/* ============================================= */}
      {/* FARE DISCOUNT MODAL */}
      {/* ============================================= */}
      {discountEditor && (
        <Modal
          title={
            discountEditor.id === null
              ? "Add Fare Discount"
              : `Edit Fare Discount #${discountEditor.id}`
          }
          description="Configure a passenger discount for a specific transport variant."
          onClose={() => !isSaving && onCloseDiscount()}
        >
          <div className="space-y-4">
            <SelectField
              label="Transport variant"
              value={discountEditor.variantId}
              onChange={(value) => onDiscountEditorPatch({ variantId: value })}
            >
              {currentData?.variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name} ({variant.code})
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Passenger category"
              value={discountEditor.passengerCategory}
              onChange={(value) =>
                onDiscountEditorPatch({
                  passengerCategory: value as AdminFarePassengerCategory,
                })
              }
            >
              <option value="student">Student</option>
              <option value="senior_citizen">Senior Citizen</option>
              <option value="pwd">Person with Disability (PWD)</option>
            </SelectField>

            <Field
              label="Discount percentage (%)"
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              value={discountEditor.discountPercent}
              onChange={(value) =>
                onDiscountEditorPatch({ discountPercent: value })
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Effective from"
                type="date"
                value={discountEditor.effectiveFrom}
                onChange={(value) => onDiscountEditorPatch({ effectiveFrom: value })}
              />
              <Field
                label="Effective to (optional)"
                type="date"
                value={discountEditor.effectiveTo}
                onChange={(value) => onDiscountEditorPatch({ effectiveTo: value })}
              />
            </div>

            {discountEditorError && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {discountEditorError}
              </p>
            )}

            <ModalActions
              saving={isSaving}
              onCancel={onCloseDiscount}
              onSave={onSaveDiscount}
            />
          </div>
        </Modal>
      )}

      {/* ============================================= */}
      {/* RAIL FARE MODAL */}
      {/* ============================================= */}
      {railEditor && (
        <Modal
          title={
            railEditor.id === null
              ? "Add Train Station-Pair Fare"
              : `Edit Train Fare #${railEditor.id}`
          }
          description="Configure the fare between the selected train stations."
          onClose={() => !isSaving && onCloseRail()}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
                Station pair
              </p>
              <p className="mt-1 font-bold text-[#102E4D]">
                {getStationName(selectedRailRoute, Number(railEditor.fromStopId))}
                <span className="mx-2 text-purple-400">↔</span>
                {getStationName(selectedRailRoute, Number(railEditor.toStopId))}
              </p>
              <p className="mt-1 text-xs text-purple-700">
                This fare is stored once and applies in both directions.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Stored-value fare (₱)"
                type="number"
                min="0"
                step="0.01"
                value={railEditor.storedValueFare}
                onChange={(value) =>
                  onRailEditorPatch({ storedValueFare: value })
                }
                placeholder="Leave blank if unavailable"
              />
              <Field
                label="Single-journey fare (₱)"
                type="number"
                min="0"
                step="0.01"
                value={railEditor.singleJourneyFare}
                onChange={(value) =>
                  onRailEditorPatch({ singleJourneyFare: value })
                }
                placeholder="Leave blank if unavailable"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Effective from"
                type="date"
                value={railEditor.effectiveFrom}
                onChange={(value) => onRailEditorPatch({ effectiveFrom: value })}
              />
              <Field
                label="Effective to (optional)"
                type="date"
                value={railEditor.effectiveTo}
                onChange={(value) => onRailEditorPatch({ effectiveTo: value })}
              />
            </div>

            {railEditorError && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {railEditorError}
              </p>
            )}

            <ModalActions
              saving={isSaving}
              onCancel={onCloseRail}
              onSave={onSaveRail}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
