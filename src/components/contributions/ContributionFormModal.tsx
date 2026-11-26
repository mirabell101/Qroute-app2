import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { MapPin } from "lucide-react";

import ContributionMap from "@/components/contributions/ContributionMap";
import RouteSequencePanel from "@/components/contributions/RouteSequencePanel";
import PhotoUploadGrid from "@/components/contributions/PhotoUploadGrid";

import type {
  ContributionMapLine,
  ContributionMapMarker,
} from "@/components/contributions/ContributionMap";
import type {
  RouteSequenceEntry,
} from "@/components/contributions/RouteSequencePanel";
import type {
  PhotoPreview,
} from "@/components/contributions/PhotoUploadGrid";

import type {
  ExistingPoint,
  ExistingRoute,
  TransportTypeOption,
  TransportVariantOption,
} from "@/lib/contributions";
import { pointKey } from "@/lib/contributions";

type FormAction = "terminal" | "route" | "modify_route";
type Coordinates = [number, number];
type RoutePlacement =
  | { status: "ready"; proposalType: "extend_route" | "insert_point" | "combined" | "remove_points" }
  | { status: "error"; message: string }
  | null;

interface ContributionFormModalState {
  formAction: FormAction;
  submitting: boolean;
  showValidation: boolean;
  formError: string;
  vehicleTypeId: string;
  variantId: string;
  selectedExistingRouteId: string;
  name: string;
  description: string;
  existingQuery: string;
  selectedPointKey: string | null;
  selectedPreviewRouteId: number | null;
  pin: Coordinates | null;
  currentPosition: Coordinates | null;
  focus: Coordinates | null;
  locationMessage: string;
  routeChangeRemarks: string;
  routePointCount: number;
  terminalPhotos: PhotoPreview[];
}

interface ContributionFormModalData {
  types: TransportTypeOption[];
  typeVariants: TransportVariantOption[];
  existingByKey: ReadonlyMap<string, ExistingPoint>;
  existingRoutes: ExistingRoute[];
  catalogLoading: boolean;
  existingError: string;
  optionsError: string;
  selectedExistingRoute: ExistingRoute | null;
  selectedRouteFirstPoint: ExistingPoint | undefined;
  selectedRouteLastPoint: ExistingPoint | undefined;
  selectedExistingRouteType: TransportTypeOption | undefined;
  selectedExistingRouteVariant: TransportVariantOption | undefined;
  selectedVehicleTypeName: string;
  activeRouteColor: string;
  routeMarkers: ContributionMapMarker[];
  candidatePoints: ExistingPoint[];
  connectedKeys: Set<string>;
  linePositions: Coordinates[];
  previewLines: ContributionMapLine[];
  routeSequenceEntries: RouteSequenceEntry[];
  routeChangePlacement: RoutePlacement;
  connectedList: ExistingPoint[];
  otherTerminals: ExistingPoint[];
  otherStops: ExistingPoint[];
  lastExistingPoint: ExistingPoint | undefined;
  inspectKey: string | null;
  inspectPoint: ExistingPoint | undefined;
  inspectRoutes: ExistingRoute[];
}

interface ContributionFormModalActions {
  onClose: () => void;
  onSwitchAction: (action: FormAction) => void;
  onVehicleTypeChange: (value: string) => void;
  onVariantChange: (value: string) => void;
  onExistingRouteChange: (value: string) => void;
  onLocate: () => void;
  onMapPick: (position: Coordinates) => void;
  onPickExisting: (point: ExistingPoint) => void;
  onAddExistingPoint: (point: ExistingPoint) => void;
  onAddExistingKeys: (keys: string[]) => void;
  onSelectPoint: (key: string | null) => void;
  onMovePin: (position: Coordinates) => void;
  onMoveRoutePoint: (index: number, position: Coordinates) => void;
  onNameChange: (value: string) => void;
  onProposedRouteNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onExistingQueryChange: (value: string) => void;
  onSelectPreviewRoute: (routeId: number | null) => void;
  onCloseInspection: () => void;
  onRoutePointNameChange: (key: string, value: string) => void;
  onMoveRoutePointInSequence: (index: number, direction: -1 | 1) => void;
  onMoveRoutePointTo: (fromIndex: number, toIndex: number) => void;
  onConvertRoutePointKind: (key: string, kind: "terminal" | "stop") => void;
  onRouteChangeRemarksChange: (value: string) => void;
  onRemoveRoutePoint: (key: string) => void;
  onRestoreRoutePoint: (key: string) => void;
  onPointPhotoFile: (key: string, file: File) => void;
  onRemovePointPhoto: (key: string) => void;
  onTerminalPhotosChange: (files: File[]) => void;
  onRemoveTerminalPhoto: (index: number) => void;
  onSubmit: () => void;
}

interface ContributionFormModalProps {
  state: ContributionFormModalState;
  data: ContributionFormModalData;
  actions: ContributionFormModalActions;
}

function fieldClass(hasError: boolean) {
  return `h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-1 ${
    hasError
      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
      : "border-gray-300 focus:border-[#12395A] focus:ring-[#12395A]"
  }`;
}

function existingLabel(point: ExistingPoint) {
  return point.kind === "stop" && point.stopType === "train_station"
    ? `${point.name} (Station)`
    : point.name;
}

function getSegmentKeys(
  route: ExistingRoute,
  anchor: string,
  target: string
): string[] {
  const anchorIndex = route.keys.indexOf(anchor);
  const targetIndex = route.keys.indexOf(target);

  if (
    anchorIndex < 0 ||
    targetIndex < 0 ||
    anchorIndex === targetIndex
  ) {
    return [];
  }

  return anchorIndex < targetIndex
    ? route.keys.slice(anchorIndex + 1, targetIndex + 1)
    : route.keys.slice(targetIndex, anchorIndex).reverse();
}

function getStopNumber(
  route: ExistingRoute,
  index: number,
  existingByKey: ReadonlyMap<string, ExistingPoint>
) {
  return route.keys
    .slice(0, index + 1)
    .filter((key) => existingByKey.get(key)?.kind === "stop")
    .length;
}

export default function ContributionFormModal({
  state,
  data,
  actions,
}: ContributionFormModalProps) {
  const terminalPhotoInputRef = useRef<HTMLInputElement>(null);
  const pointPhotoInputRef = useRef<HTMLInputElement>(null);
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);

  const isRouteChange = state.formAction === "modify_route";
  const isNewRoute = state.formAction === "route";
  const isTerminal = state.formAction === "terminal";
  const isStandalonePoint = isTerminal;

  const onTerminalPhotoInput = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.target.files ?? []) as File[];
    event.target.value = "";
    if (files.length > 0) actions.onTerminalPhotosChange(files);
  };

  const pointPhotoTargetRef = useRef<string | null>(null);

  const selectPointPhoto = (key: string) => {
    pointPhotoTargetRef.current = key;
    pointPhotoInputRef.current?.click();
  };

  const handlePointPhotoInput = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const target = pointPhotoTargetRef.current;
    pointPhotoTargetRef.current = null;
    if (file && target) {
      actions.onPointPhotoFile(target, file);
    }
  };

  const variantName = (id: number) =>
    data.typeVariants.find((variant) => variant.id === id)?.name ??
    "Variant unavailable";

  return (
    <div
      className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/45 px-4 py-6"
      onClick={actions.onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-contribution-title"
        className="max-h-[94vh] w-full max-w-[960px] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2
              id="add-contribution-title"
              className="text-xl font-semibold text-gray-900"
            >
              Add a contribution
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {isRouteChange
                ? "Propose changes to an approved route. The live route remains unchanged until approval."
                : "Your submission will be reviewed before appearing on the map."}
            </p>
          </div>

          <button
            type="button"
            aria-label="Close"
            onClick={actions.onClose}
            disabled={state.submitting}
            className="rounded-full px-2 py-1 text-xl leading-none text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        {state.formError && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {state.formError}
          </p>
        )}

        <div className="space-y-5">
          <div>
            <p className="mb-1.5 text-sm font-medium text-gray-700">
              What would you like to do?
            </p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {([
                {
                  value: "terminal",
                  label: "Terminal",
                  hint: "Add a vehicle terminal",
                },
                {
                  value: "route",
                  label: "New route",
                  hint: "Create a separate route service",
                },
                {
                  value: "modify_route",
                  label: "Modify route",
                  hint: "Propose changes to an approved route",
                },
              ] as const).map((option) => {
                const selected = state.formAction === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={state.submitting}
                    aria-pressed={selected}
                    onClick={() => actions.onSwitchAction(option.value)}
                    className={`rounded-xl border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected
                        ? "border-[#12395A] bg-[#12395A] text-white"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="block text-sm font-semibold">
                      {option.label}
                    </span>
                    <span
                      className={`mt-0.5 block text-[11px] leading-snug ${
                        selected ? "text-white/80" : "text-gray-500"
                      }`}
                    >
                      {option.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="vehicle-type"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              Vehicle type <span className="text-red-500">*</span>
            </label>
            <select
              id="vehicle-type"
              value={state.vehicleTypeId}
              onChange={(event) =>
                actions.onVehicleTypeChange(event.target.value)
              }
              disabled={state.submitting}
              className={`${fieldClass(
                state.showValidation && !state.vehicleTypeId
              )} disabled:bg-gray-100`}
            >
              <option value="">Choose a vehicle type...</option>
              {data.types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>

            {data.optionsError && (
              <p className="mt-1 text-xs text-red-600">
                {data.optionsError}
              </p>
            )}
            {(isNewRoute || isRouteChange) && (
              <p className="mt-1 text-xs text-gray-500">
                Only approved locations and routes belonging to this
                vehicle type will be loaded.
              </p>
            )}
          </div>

          {isNewRoute && (
            <div>
              <label
                htmlFor="route-variant"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Vehicle variant <span className="text-red-500">*</span>
              </label>
              <select
                id="route-variant"
                value={state.variantId}
                onChange={(event) =>
                  actions.onVariantChange(event.target.value)
                }
                disabled={!state.vehicleTypeId || state.submitting}
                className={`${fieldClass(
                  state.showValidation && !state.variantId
                )} disabled:bg-gray-100`}
              >
                <option value="">
                  {!state.vehicleTypeId
                    ? "Choose a vehicle type first"
                    : "Choose a vehicle variant..."}
                </option>
                {data.typeVariants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isRouteChange && (
            <div>
              <label
                htmlFor="existing-route"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Approved route to modify{" "}
                <span className="text-red-500">*</span>
              </label>
              <select
                id="existing-route"
                value={state.selectedExistingRouteId}
                onChange={(event) =>
                  actions.onExistingRouteChange(event.target.value)
                }
                disabled={
                  !state.vehicleTypeId ||
                  data.catalogLoading ||
                  state.submitting
                }
                className={`${fieldClass(
                  state.showValidation && !state.selectedExistingRouteId
                )} disabled:bg-gray-100`}
              >
                <option value="">
                  {!state.vehicleTypeId
                    ? "Choose a vehicle type first"
                    : data.catalogLoading
                      ? "Loading routes..."
                      : "Choose an approved route..."}
                </option>
                {data.existingRoutes.map((route) => {
                  const variant = data.typeVariants.find(
                    (item) => item.id === route.variantId
                  );
                  const fallbackVariant = variant?.name ?? "Variant unavailable";
                  return (
                    <option key={route.id} value={route.id}>
                      {route.name} · {fallbackVariant}
                    </option>
                  );
                })}
              </select>

              {data.existingError && (
                <p role="alert" className="mt-1 text-xs text-red-600">
                  {data.existingError}
                </p>
              )}
              {state.vehicleTypeId &&
                !data.catalogLoading &&
                !data.existingError &&
                data.existingRoutes.length === 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    No eligible approved routes were found for this
                    vehicle type.
                  </p>
                )}

              {data.selectedExistingRoute && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5">
                  <p className="text-sm font-semibold text-gray-900">
                    {data.selectedExistingRoute.name}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    {data.selectedExistingRouteType?.name ??
                      "Vehicle unavailable"}{" "}
                    · {data.selectedExistingRouteVariant?.name ??
                      "Variant unavailable"}{" "}
                    · {data.selectedExistingRoute.keys.length} locations
                  </p>
                  <p className="mt-1 text-xs text-blue-800">
                    Route ID #{data.selectedExistingRoute.id} will remain
                    unchanged.
                  </p>
                  <p className="mt-1 text-xs text-gray-700">
                    Current endpoints: <strong>{data.selectedRouteFirstPoint?.name ?? "Unknown start"}</strong>
                    {" → "}
                    <strong>{data.selectedRouteLastPoint?.name ?? "Unknown end"}</strong>
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className="text-sm font-semibold text-gray-800">
                {isTerminal
                  ? "Terminal location"
                  : isRouteChange
                    ? "Existing route and proposed locations"
                    : "Build the new route"}
                <span className="text-red-500"> *</span>
              </label>
              <button
                type="button"
                onClick={actions.onLocate}
                disabled={state.submitting}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <MapPin size={13} />
                My location
              </button>
            </div>

            <div
              className={`isolate h-[390px] overflow-hidden rounded-xl border ${
                state.showValidation &&
                ((isStandalonePoint && !state.pin) ||
                  (isNewRoute && !state.variantId) ||
                  (isNewRoute && state.routePointCount < 2) ||
                  (isRouteChange &&
                    (!data.selectedExistingRoute ||
                      (state.routePointCount < 1 &&
                        !data.routeSequenceEntries.some((entry) => entry.pendingRemoval)))))
                  ? "border-red-500"
                  : "border-gray-300"
              }`}
            >
              <ContributionMap
                mode={state.formAction}
                currentPosition={state.currentPosition}
                focus={state.focus}
                pin={state.pin}
                pinName={state.name}
                routeMarkers={data.routeMarkers}
                candidatePoints={data.candidatePoints}
                routeColor={data.activeRouteColor}
                vehicleTypeName={data.selectedVehicleTypeName}
                linePositions={data.linePositions}
                previewLines={data.previewLines}
                selectedPreviewRouteId={state.selectedPreviewRouteId}
                selectedPointKey={state.selectedPointKey}
                connectedKeys={data.connectedKeys}
                fitBoundsKey={isRouteChange
                  ? state.selectedExistingRouteId ? `route-${state.selectedExistingRouteId}` : ""
                  : isNewRoute && data.inspectKey
                    ? `inspect-${data.inspectKey}-${state.selectedPreviewRouteId ?? "all"}`
                    : ""}
                onPick={actions.onMapPick}
                onPickExisting={actions.onPickExisting}
                onSelectPoint={actions.onSelectPoint}
                onMovePin={actions.onMovePin}
                onMoveRoutePoint={actions.onMoveRoutePoint}
                onPinNameChange={actions.onNameChange}
                onRoutePointNameChange={actions.onRoutePointNameChange}
              />
            </div>

            <p className="mt-1 text-xs text-gray-500">
              {state.locationMessage ||
                (isStandalonePoint
                  ? "Tap the map or drag the marker to position the terminal."
                  : isRouteChange
                    ? !data.selectedExistingRoute
                      ? "Choose a vehicle type and an approved route to display its points."
                      : "Tap the map to add a location, drag existing route markers to suggest coordinate corrections, and reorder stops below."
                    : !state.vehicleTypeId || !state.variantId
                      ? "Choose a vehicle type and variant before adding route points."
                      : data.typeVariants.find(
                          (variant) => String(variant.id) === state.variantId
                        )?.fare_model === "matrix"
                        ? "Tap the map to add train stations, or select approved stations."
                        : "Tap the map to add road stops. A terminal is optional; you can convert an endpoint to a terminal in the sequence below.")}
            </p>

            {isStandalonePoint && state.pin && (
              <p className="mt-1 text-[11px] text-gray-500">
                {state.pin[0].toFixed(5)}, {state.pin[1].toFixed(5)}
              </p>
            )}
          </div>

          {(isNewRoute || isRouteChange) &&
            data.routeSequenceEntries.length > 0 && (
              <RouteSequencePanel
                entries={data.routeSequenceEntries}
                color={data.activeRouteColor}
                title={
                  isRouteChange
                    ? "Proposed complete route sequence"
                    : "Route sequence"
                }
                description={
                  isRouteChange
                    ? "Newly placed stops open a name popup on the marker. You can edit names, drag markers to suggest coordinate corrections, reorder road stops, attach photos, convert stops and terminals, or request removal of any existing stop or terminal. Conversions and removals require moderator approval. A removed shared location is soft-deleted only if no other route still uses it; otherwise it remains available to those routes."
                    : "Terminals are optional route endpoints. Stops can form a complete route on their own."
                }
                selectedKey={state.selectedPointKey}
                showValidation={state.showValidation}
                onSelect={actions.onSelectPoint}
                onNameChange={actions.onRoutePointNameChange}
                onMove={actions.onMoveRoutePointInSequence}
                onMoveTo={actions.onMoveRoutePointTo}
                onConvertToKind={actions.onConvertRoutePointKind}
                onRemove={actions.onRemoveRoutePoint}
                onRestore={actions.onRestoreRoutePoint}
                onChoosePhoto={selectPointPhoto}
                onRemovePhoto={actions.onRemovePointPhoto}
              />
            )}

          {isRouteChange && (
            <div>
              <label
                htmlFor="route-change-remarks"
                className="mb-1.5 block text-sm font-semibold text-gray-800"
              >
                Reason / remarks for this proposal (optional)
              </label>
              <textarea
                id="route-change-remarks"
                value={state.routeChangeRemarks}
                maxLength={1000}
                onChange={(event) =>
                  actions.onRouteChangeRemarksChange(event.target.value)
                }
                disabled={state.submitting}
                rows={3}
                placeholder="Explain what changed, why this route needs updating, or add details that may help the reviewer."
                className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#12395A] focus:ring-1 focus:ring-[#12395A] disabled:bg-gray-100"
              />
              <p className="mt-1 text-right text-[11px] text-gray-500">
                {state.routeChangeRemarks.length}/1000
              </p>
            </div>
          )}

          {isRouteChange && (
            <div>
              {data.routeChangePlacement?.status === "ready" && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
                  <p className="text-sm font-semibold text-green-800">
                    {data.routeChangePlacement.proposalType === "remove_points"
                      ? "Route removal request detected"
                      : data.routeChangePlacement.proposalType === "combined"
                        ? "Combined route changes detected"
                        : data.routeChangePlacement.proposalType === "extend_route"
                          ? "Route extension detected"
                          : "Internal route insertion detected"}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-green-800">
                    {data.routeChangePlacement.proposalType === "remove_points"
                      ? "The marked locations will only be removed after moderator approval. A shared stop or terminal will be soft-deleted only when no other route still uses it."
                      : data.routeChangePlacement.proposalType === "combined"
                        ? "This proposal can add locations between existing route points and beyond the current final point in one submission."
                        : data.routeChangePlacement.proposalType === "extend_route"
                          ? "The new location will be appended after the existing final location."
                          : "The new location will be inserted between existing route locations."}
                    {data.routeChangePlacement.proposalType !== "remove_points" &&
                      data.routeSequenceEntries.some((entry) => entry.pendingRemoval) &&
                      " Marked existing locations will also be removed only after moderator approval; a shared location is soft-deleted only if no other route still uses it."}
                  </p>
                </div>
              )}

              {data.routeChangePlacement?.status === "error" && (
                <p
                  role="alert"
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800"
                >
                  {data.routeChangePlacement.message}
                </p>
              )}

              {!data.routeChangePlacement && (
                <p className="text-xs text-gray-500">
                  {state.routePointCount === 0
                    ? "Add a new location, convert an existing stop or terminal, or select a route location for removal. You can also adjust existing names and positions before submitting."
                    : "The proposed route sequence is being calculated."}
                </p>
              )}
            </div>
          )}

          {isNewRoute && (
            <div>
              <label
                htmlFor="contribution-name"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Route name <span className="text-red-500">*</span>
              </label>
              <input
                id="contribution-name"
                value={state.name}
                maxLength={120}
                onChange={(event) => actions.onNameChange(event.target.value)}
                disabled={state.submitting}
                placeholder="e.g. Terminal A to Stop B"
                className={fieldClass(
                  state.showValidation && !state.name.trim()
                )}
              />
            </div>
          )}

          {isRouteChange &&
            data.routeChangePlacement?.status === "ready" &&
            (data.routeChangePlacement.proposalType === "extend_route" ||
              data.routeChangePlacement.proposalType === "combined") && (
              <div>
                <label
                  htmlFor="proposed-route-name"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  Proposed route name (optional)
                </label>
                <input
                  id="proposed-route-name"
                  value={state.name}
                  maxLength={180}
                  onChange={(event) =>
                    actions.onProposedRouteNameChange(event.target.value)
                  }
                  disabled={state.submitting}
                  placeholder="Leave blank to retain the original name"
                  className={fieldClass(false)}
                />
                <p className="mt-1 text-xs text-gray-500">
                  The suggested name uses the first and final route locations.
                  You can edit or clear it.
                </p>
              </div>
            )}

          {isRouteChange &&
            data.routeChangePlacement?.status === "ready" &&
            data.routeChangePlacement.proposalType === "insert_point" && (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                This point is being inserted within the existing route. Its
                original route name will be retained.
              </p>
            )}

          {isStandalonePoint && (
            <>
              <div>
                <label
                  htmlFor="contribution-name"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  Terminal name <span className="text-red-500">*</span>
                </label>
                <input
                  id="contribution-name"
                  value={state.name}
                  maxLength={120}
                  onChange={(event) => actions.onNameChange(event.target.value)}
                  disabled={state.submitting}
                  placeholder="e.g. SM Fairview Terminal"
                  className={fieldClass(
                    state.showValidation && !state.name.trim()
                  )}
                />
              </div>

              <div>
                <label
                  htmlFor="terminal-description"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  Landmark / description
                </label>
                <textarea
                  id="terminal-description"
                  value={state.description}
                  maxLength={500}
                  onChange={(event) =>
                    actions.onDescriptionChange(event.target.value)
                  }
                  disabled={state.submitting}
                  rows={2}
                  placeholder="Optional terminal details"
                  className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#12395A] focus:ring-1 focus:ring-[#12395A] disabled:bg-gray-100"
                />
              </div>
            </>
          )}

          {isNewRoute && (
            <div>
              <label
                htmlFor="existing-point"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Use an existing approved location (optional)
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr]">
                <input
                  aria-label="Search existing locations"
                  value={state.existingQuery}
                  disabled={!state.vehicleTypeId || !state.variantId || state.submitting}
                  onChange={(event) =>
                    actions.onExistingQueryChange(event.target.value)
                  }
                  placeholder="Search by name..."
                  className={`${fieldClass(false)} disabled:bg-gray-100`}
                />
                <select
                  id="existing-point"
                  value=""
                  disabled={
                    !state.vehicleTypeId ||
                    !state.variantId ||
                    data.catalogLoading ||
                    state.submitting
                  }
                  onChange={(event) => {
                    const point = data.existingByKey.get(event.target.value);
                    if (point) actions.onAddExistingPoint(point);
                  }}
                  className={`${fieldClass(false)} disabled:bg-gray-100`}
                >
                  <option value="">
                    {!state.vehicleTypeId
                      ? "Choose a vehicle type first"
                      : !state.variantId
                        ? "Choose a variant first"
                        : data.catalogLoading
                          ? "Loading approved locations..."
                          : data.candidatePoints.length === 0
                            ? "No compatible locations"
                            : "Choose an existing location..."}
                  </option>
                  {data.connectedList.length > 0 && data.lastExistingPoint && (
                    <optgroup label={`Connected to ${data.lastExistingPoint.name}`}>
                      {data.connectedList.map((point) => {
                        const key = pointKey(point.kind, point.id);
                        return (
                          <option key={key} value={key}>
                            {existingLabel(point)}
                          </option>
                        );
                      })}
                    </optgroup>
                  )}
                  {data.otherTerminals.length > 0 && (
                    <optgroup label="Terminals">
                      {data.otherTerminals.map((point) => {
                        const key = pointKey(point.kind, point.id);
                        return (
                          <option key={key} value={key}>
                            {existingLabel(point)}
                          </option>
                        );
                      })}
                    </optgroup>
                  )}
                  {data.otherStops.length > 0 && (
                    <optgroup label="Stops and stations">
                      {data.otherStops.map((point) => {
                        const key = pointKey(point.kind, point.id);
                        return (
                          <option key={key} value={key}>
                            {existingLabel(point)}
                          </option>
                        );
                      })}
                    </optgroup>
                  )}
                </select>
              </div>
              {data.existingError && (
                <p className="mt-1 text-xs text-red-600">
                  {data.existingError}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Choose a compatible approved terminal or stop, or select its
                marker on the map.
              </p>
            </div>
          )}

          {isNewRoute && data.inspectPoint && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Routes through {existingLabel(data.inspectPoint)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-600">
                    Select a destination to add the approved route locations
                    between the selected point and that destination.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close route details"
                  onClick={actions.onCloseInspection}
                  className="rounded-full px-2 text-lg leading-none text-gray-500 hover:bg-white"
                >
                  ×
                </button>
              </div>

              {data.inspectRoutes.length === 0 ? (
                <p className="mt-2 text-xs text-gray-600">
                  No approved route of this vehicle type passes through this
                  point.
                </p>
              ) : (
                <div className="mt-3 max-h-[260px] space-y-3 overflow-y-auto pr-1">
                  {data.inspectRoutes.map((route) => {
                    const anchorIndex = data.inspectKey
                      ? route.keys.indexOf(data.inspectKey)
                      : -1;
                    const firstKey = route.keys[0];
                    const lastKey = route.keys[route.keys.length - 1];
                    const firstName = firstKey
                      ? data.existingByKey.get(firstKey)?.name ?? "start"
                      : "start";
                    const lastName = lastKey
                      ? data.existingByKey.get(lastKey)?.name ?? "end"
                      : "end";

                    return (
                      <div
                        key={route.id}
                        className="rounded-lg border border-gray-200 bg-white p-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            aria-pressed={state.selectedPreviewRouteId === route.id}
                            onClick={() => actions.onSelectPreviewRoute(route.id)}
                            className={`text-left text-sm font-semibold ${
                              state.selectedPreviewRouteId === route.id
                                ? "text-[#12395A] underline"
                                : "text-gray-900 hover:underline"
                            }`}
                          >
                            {route.name}
                            <span className="ml-2 text-xs font-normal text-gray-500">
                              {variantName(route.variantId)} · {route.keys.length} points
                            </span>
                          </button>

                          <div className="flex flex-wrap gap-1.5">
                            {data.inspectKey && lastKey &&
                              anchorIndex >= 0 &&
                              anchorIndex < route.keys.length - 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    actions.onAddExistingKeys(
                                      getSegmentKeys(route, data.inspectKey!, lastKey)
                                    )
                                  }
                                  className="rounded-md border border-[#12395A] px-2 py-1 text-[11px] font-semibold text-[#12395A] hover:bg-[#12395A] hover:text-white"
                                >
                                  Add all to {lastName}
                                </button>
                              )}
                            {data.inspectKey && firstKey && anchorIndex > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  actions.onAddExistingKeys(
                                    getSegmentKeys(route, data.inspectKey!, firstKey)
                                  )
                                }
                                className="rounded-md border border-[#12395A] px-2 py-1 text-[11px] font-semibold text-[#12395A] hover:bg-[#12395A] hover:text-white"
                              >
                                Add all to {firstName}
                              </button>
                            )}
                          </div>
                        </div>

                        <ol className="mt-2 space-y-1">
                          {route.keys.map((key, index) => {
                            const point = data.existingByKey.get(key);
                            if (!point) return null;

                            const isAnchor = key === data.inspectKey;
                            const alreadyAdded = data.routeSequenceEntries.some(
                              (entry) => entry.key === key && !entry.positionPending
                            );
                            const stopNumber = getStopNumber(
                              route,
                              index,
                              data.existingByKey
                            );

                            return (
                              <li
                                key={key}
                                className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs ${
                                  isAnchor
                                    ? "bg-blue-100 font-semibold text-blue-900"
                                    : "text-gray-700"
                                }`}
                              >
                                <span className="w-7 shrink-0 text-right text-gray-400">
                                  {point.kind === "terminal" ? "T" : `#${stopNumber}`}
                                </span>
                                <span className="min-w-0 flex-1 truncate">
                                  {existingLabel(point)}
                                </span>
                                {isAnchor ? (
                                  <span className="shrink-0 text-[11px]">Selected</span>
                                ) : alreadyAdded ? (
                                  <span className="shrink-0 text-[11px] text-green-700">
                                    Added
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!data.inspectKey) return;
                                      actions.onAddExistingKeys(
                                        getSegmentKeys(route, data.inspectKey, key)
                                      );
                                    }}
                                    className="shrink-0 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-100"
                                  >
                                    Add through here
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {isNewRoute || isRouteChange ? (
            <input
              ref={pointPhotoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handlePointPhotoInput}
            />
          ) : null}

          {isStandalonePoint && (
            <>
              <PhotoUploadGrid
                photos={state.terminalPhotos}
                maximum={3}
                onAdd={() => terminalPhotoInputRef.current?.click()}
                onRemove={actions.onRemoveTerminalPhoto}
              />
              <input
                ref={terminalPhotoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={onTerminalPhotoInput}
              />
            </>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse justify-end gap-3 border-t border-gray-100 pt-4 sm:flex-row">
          <button
            type="button"
            onClick={actions.onClose}
            disabled={state.submitting}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setShowSubmitConfirmation(true)}
            disabled={state.submitting}
            className="rounded-lg bg-[#12395A] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1b4b6f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.submitting
              ? "Submitting..."
              : isRouteChange
                ? "Submit route-change proposal"
                : "Submit for review"}
          </button>
        </div>

        {showSubmitConfirmation && (
          <div
            className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/55 p-4"
            onClick={() => setShowSubmitConfirmation(false)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-contribution-title"
              className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 id="confirm-contribution-title" className="text-base font-semibold text-gray-900">
                Confirm submission
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                {isRouteChange
                  ? data.routeChangePlacement?.status === "ready" &&
                    data.routeChangePlacement.proposalType === "remove_points"
                    ? "Submit this route-location removal request for moderator review? Nothing will be removed unless the proposal is approved. A shared location will only be soft-deleted if no other route still uses it."
                    : data.routeSequenceEntries.some((entry) => entry.pendingRemoval)
                      ? "Submit this route-change proposal for moderator review? It also requests removal of the marked locations. No route changes or soft-deletions will happen unless the proposal is approved."
                      : "Submit this route-change proposal for moderator review? The approved route will remain unchanged until it is approved."
                  : "Submit this contribution for review? It will only appear on the map after approval."}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirmation(false)}
                  disabled={state.submitting}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Go back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSubmitConfirmation(false);
                    actions.onSubmit();
                  }}
                  disabled={state.submitting}
                  className="rounded-lg bg-[#12395A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b4b6f] disabled:opacity-50"
                >
                  Confirm submission
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
