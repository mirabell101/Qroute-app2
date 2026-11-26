import type { ReactNode } from "react";
import { Receipt, Save, X } from "lucide-react";

import type {
  AdminFareManagementData,
  AdminRailFare,
  AdminRailRoute,
} from "@/lib/adminFareApi";

export const INPUT_CLASS =
  "mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100";

export const TABLE_HEAD_CLASS =
  "bg-[#EAF1F8] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600";

export interface RoadBandForm {
  lowerDistanceKm: string;
  upperDistanceKm: string;
  perKmRate: string;
}

export interface RoadRuleForm {
  id: number | null;
  variantId: string;
  baseFare: string;
  baseDistanceKm: string;
  roundingStep: string;
  effectiveFrom: string;
  effectiveTo: string;
  bands: RoadBandForm[];
}

export interface DiscountForm {
  id: number | null;
  variantId: string;
  passengerCategory: AdminFareManagementData["discountRules"][number]["passenger_category"];
  discountPercent: string;
  effectiveFrom: string;
  effectiveTo: string;
}

export interface RailForm {
  id: number | null;
  routeId: string;
  fromStopId: string;
  toStopId: string;
  storedValueFare: string;
  singleJourneyFare: string;
  effectiveFrom: string;
  effectiveTo: string;
}

export function localToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function peso(value: number | null): string {
  if (value === null) return "—";

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function displayDate(value: string | null): string {
  if (!value) return "No end date";

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function dateStatus(
  effectiveFrom: string,
  effectiveTo: string | null,
  isDeleted: boolean,
  asOf = localToday(),
): string {
  if (isDeleted) return "Archived";
  if (effectiveFrom > asOf) return "Upcoming";
  if (effectiveTo !== null && effectiveTo <= asOf) return "Expired";
  return "Active";
}

function statusClass(status: string): string {
  switch (status) {
    case "Active":
      return "bg-green-100 text-green-700";
    case "Upcoming":
      return "bg-blue-100 text-blue-700";
    case "Expired":
      return "bg-amber-100 text-amber-700";
    case "Archived":
      return "bg-slate-200 text-slate-500";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(status)}`}
    >
      {status}
    </span>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  min,
  max,
  step,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className={`${INPUT_CLASS} disabled:cursor-not-allowed disabled:bg-slate-100`}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  children,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={`${INPUT_CLASS} disabled:cursor-not-allowed disabled:bg-slate-100`}
      >
        {children}
      </select>
    </label>
  );
}

export function Modal({
  title,
  description,
  onClose,
  children,
  maxWidth = "max-w-xl",
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[2px] sm:p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="fare-editor-title"
        className={`max-h-[92vh] w-full ${maxWidth} overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6`}
      >
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h2
              id="fare-editor-title"
              className="text-xl font-bold text-[#102E4D]"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
          >
            <X size={19} />
          </button>
        </div>

        {children}
      </section>
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#EAF1F8] text-[#102E4D]">
        <Receipt size={23} />
      </div>
      <h3 className="mt-4 font-semibold text-slate-800">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        {description}
      </p>
    </div>
  );
}

export function ModalActions({
  saving,
  onCancel,
  onSave,
}: {
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
      >
        Cancel
      </button>

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#19476D] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save size={16} />
        {saving ? "Saving..." : "Save changes"}
      </button>
    </div>
  );
}

export function getVariantName(
  data: AdminFareManagementData,
  variantId: number,
): string {
  const variant = data.variants.find((item) => item.id === variantId);
  return variant
    ? `${variant.name} (${variant.code})`
    : `Variant #${variantId}`;
}

export function getStationName(
  route: AdminRailRoute | undefined,
  stopId: number,
): string {
  return (
    route?.stations.find((station) => station.id === stopId)?.name ??
    `Station #${stopId}`
  );
}

export function activeRailFare(
  fares: AdminRailFare[],
  routeId: number,
  stationA: number,
  stationB: number,
  asOf: string,
): AdminRailFare | null {
  return (
    fares
      .filter(
        (fare) =>
          fare.route_id === routeId &&
          !fare.is_deleted &&
          ((fare.from_stop_id === stationA && fare.to_stop_id === stationB) ||
            (fare.from_stop_id === stationB && fare.to_stop_id === stationA)) &&
          fare.effective_from <= asOf &&
          (fare.effective_to === null || fare.effective_to > asOf),
      )
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ??
    null
  );
}
