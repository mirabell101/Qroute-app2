import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";
import AccountAvatar from "@/components/account/AccountAvatar";
import AdminNotificationBell from "@/components/admin/AdminNotificationBell";
import { useAccountProfile } from "@/components/account/accountProfileStore";

import {
  archiveAdminFareDiscount,
  archiveAdminRailFare,
  archiveAdminRoadFareRule,
  createAdminFareDiscount,
  createAdminRailFare,
  createAdminRoadFareRule,
  getAdminFareManagementData,
  updateAdminFareDiscount,
  updateAdminRailFare,
  updateAdminRoadFareRule,
  type AdminFareManagementData,
  type AdminFarePassengerCategory,
  type AdminRailFare,
  type AdminRailRoute,
  type AdminRoadFareRule,
  type FareDiscountInput,
  type RailFareInput,
  type RoadFareRuleInput,
} from "@/lib/adminFareApi";

import { getAdminNavigationDestination } from "@/pages/admin/adminNavigation";
import { supabase } from "@/lib/supabase";

import {
  LayoutDashboard,
  Route,
  FileText,
  Flag,
  Users,
  Settings,
  Receipt,
  Percent,
  TrainFront,
  Menu,
  LogOut,
  Plus,
  Pencil,
  Archive,
  RefreshCw,
  X,
  Save,
  CalendarDays,
  ArrowLeftRight,
  AlertCircle,
  ChevronDown,
  Calculator,
} from "lucide-react";

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Route Management", icon: Route },
  { label: "Fare Management", icon: Receipt },
  { label: "Post Management", icon: FileText },
  { label: "Reports", icon: Flag },
  { label: "User Management", icon: Users },
  { label: "Settings", icon: Settings },
];

const TABS = [
  { id: "road", label: "Road Fare Rules", icon: Route },
  { id: "discounts", label: "Fare Discounts", icon: Percent },
  { id: "rail", label: "Train Fare Matrix", icon: TrainFront },
] as const;

type FareTab = (typeof TABS)[number]["id"];

interface RoadBandForm {
  lowerDistanceKm: string;
  upperDistanceKm: string;
  perKmRate: string;
}

interface RoadRuleForm {
  id: number | null;
  variantId: string;
  baseFare: string;
  baseDistanceKm: string;
  roundingStep: string;
  effectiveFrom: string;
  effectiveTo: string;
  bands: RoadBandForm[];
}

interface DiscountForm {
  id: number | null;
  variantId: string;
  passengerCategory: AdminFarePassengerCategory;
  discountPercent: string;
  effectiveFrom: string;
  effectiveTo: string;
}

interface RailForm {
  id: number | null;
  routeId: string;
  fromStopId: string;
  toStopId: string;
  storedValueFare: string;
  singleJourneyFare: string;
  effectiveFrom: string;
  effectiveTo: string;
}

const INPUT_CLASS =
  "mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100";

const TABLE_HEAD_CLASS =
  "bg-[#EAF1F8] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600";

function localToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function peso(value: number | null): string {
  if (value === null) return "—";

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function displayDate(value: string | null): string {
  if (!value) return "No end date";

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function dateStatus(
  effectiveFrom: string,
  effectiveTo: string | null,
  isDeleted: boolean,
  asOf = localToday(),
): string {
  if (isDeleted) return "Archived";
  if (effectiveFrom > asOf) return "Upcoming";
  if (effectiveTo !== null && effectiveTo <= asOf) {
    return "Expired";
  }

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

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(status)}`}
    >
      {status}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  min,
  step,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  min?: string;
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
        step={step}
        disabled={disabled}
        className={`${INPUT_CLASS} disabled:cursor-not-allowed disabled:bg-slate-100`}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
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

function Modal({
  title,
  description,
  onClose,
  children,
  maxWidth = "max-w-xl",
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
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
            <p className="mt-1 text-sm text-slate-500">
              {description}
            </p>
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

function EmptyState({
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

function getVariantName(
  data: AdminFareManagementData,
  variantId: number,
): string {
  const variant = data.variants.find(
    (item) => item.id === variantId,
  );

  return variant
    ? `${variant.name} (${variant.code})`
    : `Variant #${variantId}`;
}

function getStationName(
  route: AdminRailRoute | undefined,
  stopId: number,
): string {
  return (
    route?.stations.find((station) => station.id === stopId)?.name ??
    `Station #${stopId}`
  );
}

function activeRailFare(
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
          (
            (
              fare.from_stop_id === stationA &&
              fare.to_stop_id === stationB
            ) ||
            (
              fare.from_stop_id === stationB &&
              fare.to_stop_id === stationA
            )
          ) &&
          fare.effective_from <= asOf &&
          (
            fare.effective_to === null ||
            fare.effective_to > asOf
          ),
      )
      .sort((a, b) =>
        b.effective_from.localeCompare(a.effective_from),
      )[0] ?? null
  );
}

function ModalActions({
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

export default function FareManagement() {
  const navigate = useNavigate();
  const { userId, account } = useAccountProfile();

  const [data, setData] =
    useState<AdminFareManagementData | null>(null);

  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const [activeTab, setActiveTab] = useState<FareTab>("road");
  const [isSaving, setIsSaving] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const [roadVariantId, setRoadVariantId] = useState("");
  const [roadEditor, setRoadEditor] = useState<RoadRuleForm | null>(null);
  const [roadEditorError, setRoadEditorError] = useState<string | null>(
    null,
  );

  const [discountEditor, setDiscountEditor] =
    useState<DiscountForm | null>(null);
  const [discountEditorError, setDiscountEditorError] =
    useState<string | null>(null);

  const [railRouteId, setRailRouteId] = useState("");
  const [railAsOfDate, setRailAsOfDate] = useState(localToday());
  const [railEditor, setRailEditor] = useState<RailForm | null>(null);
  const [railEditorError, setRailEditorError] = useState<string | null>(
    null,
  );

  const accountName =
    account?.displayName?.trim() ||
    account?.username?.trim() ||
    (account?.email ? account.email.split("@")[0] : null) ||
    "Administrator";

  const accountEmail = account?.email || "Administrator";

  // ---------------------------------------------------
  // LOAD FARE MANAGEMENT DATA
  // ---------------------------------------------------

  useEffect(() => {
    let active = true;

    setData(null);
    setDataOwnerId(null);
    setErrorMessage(null);

    if (!userId) {
      setIsLoading(false);
      setErrorMessage("Please sign in to continue.");
      return () => {
        active = false;
      };
    }

    setIsLoading(true);

    void getAdminFareManagementData(userId)
      .then((result) => {
        if (!active) return;

        setData(result);
        setDataOwnerId(userId);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (!active) return;

        setData(null);
        setDataOwnerId(null);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load Fare Management data.",
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId, retryCount]);

  const refreshData = () => {
    setIsLoading(true);
    setRetryCount((count) => count + 1);
  };

  const currentData =
    userId && dataOwnerId === userId ? data : null;

  const distanceVariants = useMemo(
    () =>
      (currentData?.variants ?? []).filter(
        (variant) => variant.fare_model === "distance",
      ),
    [currentData],
  );

  const matrixVariants = useMemo(
    () =>
      (currentData?.variants ?? []).filter(
        (variant) => variant.fare_model === "matrix",
      ),
    [currentData],
  );

  // Select the first available road variant when data arrives.
  useEffect(() => {
    if (!distanceVariants.length) {
      setRoadVariantId("");
      return;
    }

    if (
      !distanceVariants.some(
        (variant) => String(variant.id) === roadVariantId,
      )
    ) {
      setRoadVariantId(String(distanceVariants[0].id));
    }
  }, [distanceVariants, roadVariantId]);

  // Select the first available matrix route when data arrives.
  useEffect(() => {
    const routes = currentData?.railRoutes ?? [];

    if (!routes.length) {
      setRailRouteId("");
      return;
    }

    if (!routes.some((route) => String(route.id) === railRouteId)) {
      setRailRouteId(String(routes[0].id));
    }
  }, [currentData?.railRoutes, railRouteId]);

  const selectedRoadVariantId = Number(roadVariantId);

  const roadRules = useMemo(
    () =>
      (currentData?.roadFareRules ?? [])
        .filter(
          (rule) => rule.variant_id === selectedRoadVariantId,
        )
        .sort((a, b) =>
          b.effective_from.localeCompare(a.effective_from),
        ),
    [currentData, selectedRoadVariantId],
  );

  const discountRules = useMemo(
    () =>
      [...(currentData?.discountRules ?? [])].sort((a, b) => {
        const variantDifference = a.variant_id - b.variant_id;

        return (
          variantDifference ||
          a.passenger_category.localeCompare(b.passenger_category) ||
          b.effective_from.localeCompare(a.effective_from)
        );
      }),
    [currentData],
  );

  const selectedRailRoute = useMemo(
    () =>
      currentData?.railRoutes.find(
        (route) => String(route.id) === railRouteId,
      ),
    [currentData, railRouteId],
  );

  const selectedRailFares = useMemo(
    () =>
      (currentData?.railFares ?? [])
        .filter((fare) => fare.route_id === Number(railRouteId))
        .sort((a, b) =>
          b.effective_from.localeCompare(a.effective_from),
        ),
    [currentData, railRouteId],
  );

  // ---------------------------------------------------
  // LOGOUT
  // ---------------------------------------------------

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: "local" });

    localStorage.removeItem("qroute_current_user");
    sessionStorage.removeItem("qroute_current_user");

    navigate("/login", { replace: true });
  };

  // ---------------------------------------------------
  // ROAD FARE RULE EDITOR
  // ---------------------------------------------------

  const openNewRoadRule = () => {
    if (!roadVariantId) return;

    setRoadEditorError(null);

    setRoadEditor({
      id: null,
      variantId: roadVariantId,
      baseFare: "",
      baseDistanceKm: "",
      roundingStep: "0.25",
      effectiveFrom: localToday(),
      effectiveTo: "",
      bands: [
        {
          lowerDistanceKm: "",
          upperDistanceKm: "",
          perKmRate: "",
        },
      ],
    });
  };

  const openRoadRuleEditor = (rule: AdminRoadFareRule) => {
    if (!currentData) return;

    const bands = currentData.distanceBands
      .filter((band) => band.fare_rule_id === rule.id)
      .sort((a, b) =>
        a.lower_distance_km - b.lower_distance_km,
      )
      .map((band) => ({
        lowerDistanceKm: String(band.lower_distance_km),
        upperDistanceKm:
          band.upper_distance_km === null
            ? ""
            : String(band.upper_distance_km),
        perKmRate: String(band.per_km_rate),
      }));

    setRoadEditorError(null);
    setRoadEditor({
      id: rule.id,
      variantId: String(rule.variant_id),
      baseFare: String(rule.base_fare),
      baseDistanceKm: String(rule.base_distance_km),
      roundingStep: String(rule.rounding_step),
      effectiveFrom: rule.effective_from,
      effectiveTo: rule.effective_to ?? "",
      bands,
    });
  };

  const updateRoadBand = (
    index: number,
    key: keyof RoadBandForm,
    value: string,
  ) => {
    setRoadEditor((previous) => {
      if (!previous) return previous;

      const bands = [...previous.bands];
      bands[index] = {
        ...bands[index],
        [key]: value,
      };

      return {
        ...previous,
        bands,
      };
    });
  };

  const addRoadBand = () => {
    setRoadEditor((previous) => {
      if (!previous) return previous;

      const lastBand = previous.bands.at(-1);

      if (
        !lastBand ||
        !lastBand.upperDistanceKm.trim() ||
        !Number.isFinite(Number(lastBand.upperDistanceKm)) ||
        Number(lastBand.upperDistanceKm) <=
          Number(lastBand.lowerDistanceKm)
      ) {
        setRoadEditorError(
          "Enter a valid upper distance for the current final band before adding another band.",
        );

        return previous;
      }

      setRoadEditorError(null);

      return {
        ...previous,
        bands: [
          ...previous.bands,
          {
            lowerDistanceKm: lastBand.upperDistanceKm,
            upperDistanceKm: "",
            perKmRate: "",
          },
        ],
      };
    });
  };

  const removeRoadBand = (index: number) => {
    setRoadEditor((previous) => {
      if (!previous || previous.bands.length <= 1) {
        return previous;
      }

      return {
        ...previous,
        bands: previous.bands.filter(
          (_band, bandIndex) => bandIndex !== index,
        ),
      };
    });
  };

  const saveRoadRule = async () => {
    if (!userId || !roadEditor) return;

    setRoadEditorError(null);

    if (!roadEditor.variantId) {
      setRoadEditorError("Select a transport variant.");
      return;
    }

    if (
      !roadEditor.baseFare.trim() ||
      !roadEditor.baseDistanceKm.trim() ||
      !roadEditor.roundingStep.trim()
    ) {
      setRoadEditorError(
        "Complete the base fare, included distance and rounding step.",
      );
      return;
    }

    if (
      !roadEditor.effectiveFrom ||
      (
        roadEditor.effectiveTo &&
        roadEditor.effectiveTo <= roadEditor.effectiveFrom
      )
    ) {
      setRoadEditorError("Enter a valid effective date range.");
      return;
    }

    if (!roadEditor.bands.length) {
      setRoadEditorError("At least one distance band is required.");
      return;
    }

    const bands: RoadFareRuleInput["bands"] = [];

    for (let index = 0; index < roadEditor.bands.length; index += 1) {
      const band = roadEditor.bands[index];

      if (
        !band.lowerDistanceKm.trim() ||
        !band.perKmRate.trim()
      ) {
        setRoadEditorError(
          `Complete the lower distance and rate for band ${index + 1}.`,
        );
        return;
      }

      if (
        index < roadEditor.bands.length - 1 &&
        !band.upperDistanceKm.trim()
      ) {
        setRoadEditorError(
          `Band ${index + 1} needs an upper distance.`,
        );
        return;
      }

      const lower = Number(band.lowerDistanceKm);
      const upper = band.upperDistanceKm.trim()
        ? Number(band.upperDistanceKm)
        : null;
      const rate = Number(band.perKmRate);

      if (
        !Number.isFinite(lower) ||
        lower < 0 ||
        !Number.isFinite(rate) ||
        rate < 0 ||
        (
          upper !== null &&
          (!Number.isFinite(upper) || upper <= lower)
        )
      ) {
        setRoadEditorError(
          `Band ${index + 1} contains invalid distance or rate values.`,
        );
        return;
      }

      bands.push({
        lowerDistanceKm: lower,
        upperDistanceKm: upper,
        perKmRate: rate,
      });
    }

    const lastBand = bands[bands.length - 1];

    if (lastBand.upperDistanceKm !== null) {
      setRoadEditorError(
        "The final distance band must have an unlimited upper distance.",
      );
      return;
    }

    const input: RoadFareRuleInput = {
      variantId: Number(roadEditor.variantId),
      baseFare: Number(roadEditor.baseFare),
      baseDistanceKm: Number(roadEditor.baseDistanceKm),
      roundingStep: Number(roadEditor.roundingStep),
      effectiveFrom: roadEditor.effectiveFrom,
      effectiveTo: roadEditor.effectiveTo || null,
      bands,
    };

    if (
      !Number.isFinite(input.baseFare) ||
      input.baseFare < 0 ||
      !Number.isFinite(input.baseDistanceKm) ||
      input.baseDistanceKm < 0 ||
      !Number.isFinite(input.roundingStep) ||
      input.roundingStep <= 0
    ) {
      setRoadEditorError("Enter valid base fare settings.");
      return;
    }

    if (bands[0].lowerDistanceKm !== input.baseDistanceKm) {
      setRoadEditorError(
        "The first distance band must begin at the included base distance.",
      );
      return;
    }

    for (let index = 1; index < bands.length; index += 1) {
      if (
        bands[index - 1].upperDistanceKm !==
        bands[index].lowerDistanceKm
      ) {
        setRoadEditorError(
          `Band ${index + 1} must begin exactly where the previous band ends.`,
        );
        return;
      }
    }

    setIsSaving(true);

    try {
      if (roadEditor.id === null) {
        await createAdminRoadFareRule(userId, input);
      } else {
        await updateAdminRoadFareRule(
          userId,
          roadEditor.id,
          input,
        );
      }

      setRoadEditor(null);
      refreshData();
    } catch (error: unknown) {
      setRoadEditorError(
        error instanceof Error
          ? error.message
          : "Unable to save the road fare rule.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const archiveRoadRule = async (rule: AdminRoadFareRule) => {
    if (!userId) return;

    if (
      !window.confirm(
        `Archive this road fare rule for ${getVariantName(currentData!, rule.variant_id)}? The record will be retained for historical reference.`,
      )
    ) {
      return;
    }

    setIsMutating(true);
    setErrorMessage(null);

    try {
      await archiveAdminRoadFareRule(userId, rule.id);
      refreshData();
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to archive the road fare rule.",
      );
    } finally {
      setIsMutating(false);
    }
  };

  // ---------------------------------------------------
  // DISCOUNT EDITOR
  // ---------------------------------------------------

  const openNewDiscount = () => {
    const firstVariant =
      currentData?.variants.find((variant) => variant.is_active) ??
      currentData?.variants[0];

    if (!firstVariant) return;

    setDiscountEditorError(null);

    setDiscountEditor({
      id: null,
      variantId: String(firstVariant.id),
      passengerCategory: "student",
      discountPercent: "20",
      effectiveFrom: localToday(),
      effectiveTo: "",
    });
  };

  const openDiscountEditor = (rule: AdminFareManagementData["discountRules"][number]) => {
    setDiscountEditorError(null);

    setDiscountEditor({
      id: rule.id,
      variantId: String(rule.variant_id),
      passengerCategory: rule.passenger_category,
      discountPercent: String(rule.discount_percent),
      effectiveFrom: rule.effective_from,
      effectiveTo: rule.effective_to ?? "",
    });
  };

  const saveDiscount = async () => {
    if (!userId || !discountEditor) return;

    setDiscountEditorError(null);

    const variantId = Number(discountEditor.variantId);
    const discountPercent = Number(discountEditor.discountPercent);

    if (
      !Number.isSafeInteger(variantId) ||
      variantId <= 0
    ) {
      setDiscountEditorError("Select a valid transport variant.");
      return;
    }

    if (
      !Number.isFinite(discountPercent) ||
      discountPercent <= 0 ||
      discountPercent > 100
    ) {
      setDiscountEditorError(
        "Discount percentage must be greater than zero and no greater than 100.",
      );
      return;
    }

    if (
      !discountEditor.effectiveFrom ||
      (
        discountEditor.effectiveTo &&
        discountEditor.effectiveTo <= discountEditor.effectiveFrom
      )
    ) {
      setDiscountEditorError("Enter a valid effective date range.");
      return;
    }

    const input: FareDiscountInput = {
      variantId,
      passengerCategory: discountEditor.passengerCategory,
      discountPercent,
      effectiveFrom: discountEditor.effectiveFrom,
      effectiveTo: discountEditor.effectiveTo || null,
    };

    setIsSaving(true);

    try {
      if (discountEditor.id === null) {
        await createAdminFareDiscount(userId, input);
      } else {
        await updateAdminFareDiscount(
          userId,
          discountEditor.id,
          input,
        );
      }

      setDiscountEditor(null);
      refreshData();
    } catch (error: unknown) {
      setDiscountEditorError(
        error instanceof Error
          ? error.message
          : "Unable to save the fare discount.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const archiveDiscount = async (
    rule: AdminFareManagementData["discountRules"][number],
  ) => {
    if (!userId) return;

    if (
      !window.confirm(
        `Archive the ${rule.passenger_category.replace("_", " ")} discount for ${getVariantName(currentData!, rule.variant_id)}?`,
      )
    ) {
      return;
    }

    setIsMutating(true);
    setErrorMessage(null);

    try {
      await archiveAdminFareDiscount(userId, rule.id);
      refreshData();
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to archive the fare discount.",
      );
    } finally {
      setIsMutating(false);
    }
  };

  // ---------------------------------------------------
  // RAIL FARE MATRIX EDITOR
  // ---------------------------------------------------

  const openRailEditor = (
    route: AdminRailRoute,
    fromStopId: number,
    toStopId: number,
    existing: AdminRailFare | null,
  ) => {
    setRailEditorError(null);

    setRailEditor({
      id: existing?.id ?? null,
      routeId: String(route.id),
      fromStopId: String(fromStopId),
      toStopId: String(toStopId),
      storedValueFare:
        existing?.stored_value_fare === null ||
        existing?.stored_value_fare === undefined
          ? ""
          : String(existing.stored_value_fare),
      singleJourneyFare:
        existing?.single_journey_fare === null ||
        existing?.single_journey_fare === undefined
          ? ""
          : String(existing.single_journey_fare),
      effectiveFrom: existing?.effective_from ?? railAsOfDate,
      effectiveTo: existing?.effective_to ?? "",
    });
  };

  const saveRailFare = async () => {
    if (!userId || !railEditor) return;

    setRailEditorError(null);

    if (
      !railEditor.effectiveFrom ||
      (
        railEditor.effectiveTo &&
        railEditor.effectiveTo <= railEditor.effectiveFrom
      )
    ) {
      setRailEditorError("Enter a valid effective date range.");
      return;
    }

    const storedValueFare = railEditor.storedValueFare.trim()
      ? Number(railEditor.storedValueFare)
      : null;

    const singleJourneyFare = railEditor.singleJourneyFare.trim()
      ? Number(railEditor.singleJourneyFare)
      : null;

    if (
      (
        storedValueFare !== null &&
        (!Number.isFinite(storedValueFare) || storedValueFare < 0)
      ) ||
      (
        singleJourneyFare !== null &&
        (!Number.isFinite(singleJourneyFare) || singleJourneyFare < 0)
      )
    ) {
      setRailEditorError(
        "Train fares must be valid nonnegative amounts.",
      );
      return;
    }

    if (
      storedValueFare === null &&
      singleJourneyFare === null
    ) {
      setRailEditorError(
        "Enter at least one fare type.",
      );
      return;
    }

    const input: RailFareInput = {
      routeId: Number(railEditor.routeId),
      fromStopId: Number(railEditor.fromStopId),
      toStopId: Number(railEditor.toStopId),
      storedValueFare,
      singleJourneyFare,
      effectiveFrom: railEditor.effectiveFrom,
      effectiveTo: railEditor.effectiveTo || null,
    };

    setIsSaving(true);

    try {
      if (railEditor.id === null) {
        await createAdminRailFare(userId, input);
      } else {
        await updateAdminRailFare(
          userId,
          railEditor.id,
          input,
        );
      }

      setRailEditor(null);
      refreshData();
    } catch (error: unknown) {
      setRailEditorError(
        error instanceof Error
          ? error.message
          : "Unable to save the train fare.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const archiveRailFare = async (fare: AdminRailFare) => {
    if (!userId || !selectedRailRoute) return;

    const fromName = getStationName(
      selectedRailRoute,
      fare.from_stop_id,
    );

    const toName = getStationName(
      selectedRailRoute,
      fare.to_stop_id,
    );

    if (
      !window.confirm(
        `Archive the fare between ${fromName} and ${toName}?`,
      )
    ) {
      return;
    }

    setIsMutating(true);
    setErrorMessage(null);

    try {
      await archiveAdminRailFare(userId, fare.id);
      refreshData();
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to archive the train fare.",
      );
    } finally {
      setIsMutating(false);
    }
  };

  // ---------------------------------------------------
  // COMMON UI
  // ---------------------------------------------------

  const loadError = errorMessage && !currentData;

  return (
    <div className="min-h-screen bg-[#F4F8FC] text-slate-800">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[250px] flex-col bg-[#102E4D] text-white md:flex">
        <div className="flex h-[105px] items-center border-b border-white/10 px-7">
          <button
            type="button"
            onClick={() => navigate("/admin/dashboard")}
            className="text-left"
            aria-label="QRoute dashboard"
          >
            <img
              src={qrouteWhiteLogo}
              alt="QRoute Logo"
              className="h-auto w-[150px] object-contain"
            />
            <p className="mt-0.5 text-xs tracking-wide text-blue-200">
              ADMINISTRATION
            </p>
          </button>
        </div>

        <div className="px-5 pt-8">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[2px] text-slate-400">
            Main Menu
          </p>

          <nav className="space-y-1.5">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const destination =
                getAdminNavigationDestination(item.label);
              const active = item.label === "Fare Management";

              return (
                <button
                  key={item.label}
                  type="button"
                  disabled={!destination}
                  title={
                    destination
                      ? undefined
                      : `${item.label} is unavailable in the current system.`
                  }
                  onClick={() =>
                    destination && navigate(destination)
                  }
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                    active
                      ? "bg-[#CFD5DB] font-semibold text-[#102E4D]"
                      : destination
                        ? "text-slate-200 hover:bg-white/10 hover:text-white"
                        : "cursor-not-allowed text-slate-400"
                  }`}
                >
                  <Icon size={19} strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {!destination && (
                    <span className="ml-auto text-[10px]">
                      Unavailable
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-5">
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-200 text-[#102E4D]">
                <Calculator size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  Fare Management
                </p>
                <p className="text-xs text-slate-300">
                  Administrator workspace
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/admin/base")}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
          >
            <ArrowLeftRight size={17} />
            Preview of the System
          </button>

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/20"
          >
            <LogOut size={17} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="min-h-screen md:ml-[250px]">
        <header className="sticky top-0 z-20 flex min-h-[86px] items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#102E4D] text-white md:hidden">
              <Menu size={21} />
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-[#102E4D] sm:text-2xl">
                Fare Management
              </h2>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                Configure road fares, passenger discounts and train fares
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            <AdminNotificationBell adminUserId={userId ?? ""} />

            <div className="hidden h-9 w-px bg-slate-200 sm:block" />

            <div className="flex items-center gap-2.5">
              <AccountAvatar
                account={account}
                className="h-10 w-10 bg-[#DCE9F7] font-bold text-[#102E4D]"
                iconSize={20}
              />

              <div className="hidden text-left sm:block">
                <p className="text-sm font-semibold text-slate-800">
                  {accountName}
                </p>
                <p
                  className="max-w-[180px] truncate text-xs text-slate-500"
                  title={accountEmail}
                >
                  {accountEmail}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
          <section className="mb-8">
            <h3 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
              Fare Configuration
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Manage effective-dated fare schedules. Previous records are
              retained when archived, and changes are recorded in the
              administrative audit log.
            </p>
          </section>

          {(errorMessage || loadError) && (
            <div
              role="alert"
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={refreshData}
                className="inline-flex items-center gap-2 font-semibold underline"
              >
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          )}

          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_3px_14px_rgba(15,23,42,0.035)] sm:p-6">
            {/* Tabs */}
            <div
              className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-4"
              role="tablist"
              aria-label="Fare management categories"
            >
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition sm:px-4 ${
                      active
                        ? "bg-[#102E4D] text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {isLoading && !currentData ? (
              <div
                role="status"
                className="py-16 text-center text-sm text-slate-500"
              >
                <RefreshCw
                  size={20}
                  className="mx-auto mb-3 animate-spin text-[#102E4D]"
                />
                Loading fare-management records...
              </div>
            ) : loadError ? (
              <EmptyState
                title="Fare data could not be loaded"
                description="Check your administrator session and API connection, then retry."
              />
            ) : !currentData ? (
              <EmptyState
                title="No fare data available"
                description="Fare-management data has not been returned by the server."
              />
            ) : (
              <>
                {/* =================================== */}
                {/* ROAD FARE RULES */}
                {/* =================================== */}

                {activeTab === "road" && (
                  <div className="space-y-5">
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                      <div className="grid flex-1 gap-3 sm:grid-cols-2">
                        <SelectField
                          label="Transport variant"
                          value={roadVariantId}
                          onChange={setRoadVariantId}
                          disabled={!distanceVariants.length}
                        >
                          {distanceVariants.map((variant) => (
                            <option
                              key={variant.id}
                              value={variant.id}
                            >
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
                        onClick={openNewRoadRule}
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
                                <th className={TABLE_HEAD_CLASS}>
                                  Schedule
                                </th>
                                <th className={TABLE_HEAD_CLASS}>
                                  Base Fare
                                </th>
                                <th className={TABLE_HEAD_CLASS}>
                                  Included Distance
                                </th>
                                <th className={TABLE_HEAD_CLASS}>
                                  Rounding Step
                                </th>
                                <th className={TABLE_HEAD_CLASS}>
                                  Status
                                </th>
                                <th className={`${TABLE_HEAD_CLASS} text-center`}>
                                  Actions
                                </th>
                              </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-100">
                              {roadRules.map((rule) => {
                                const bands =
                                  currentData.distanceBands
                                    .filter(
                                      (band) =>
                                        band.fare_rule_id === rule.id,
                                    )
                                    .sort(
                                      (a, b) =>
                                        a.lower_distance_km -
                                        b.lower_distance_km,
                                    );

                                const status = dateStatus(
                                  rule.effective_from,
                                  rule.effective_to,
                                  rule.is_deleted,
                                );

                                return (
                                  <tr
                                    key={rule.id}
                                    className="transition hover:bg-slate-50"
                                  >
                                    <td className="px-4 py-4">
                                      <p className="font-semibold text-slate-800">
                                        {displayDate(rule.effective_from)}
                                      </p>
                                      <p className="mt-1 text-xs text-slate-500">
                                        Until{" "}
                                        {displayDate(rule.effective_to)}
                                      </p>
                                      <p className="mt-1 text-xs text-slate-400">
                                        {bands.length} distance{" "}
                                        {bands.length === 1
                                          ? "band"
                                          : "bands"}
                                      </p>
                                    </td>

                                    <td className="px-4 py-4 font-semibold text-[#102E4D]">
                                      {peso(rule.base_fare)}
                                    </td>

                                    <td className="px-4 py-4">
                                      {rule.base_distance_km} km
                                    </td>

                                    <td className="px-4 py-4">
                                      ₱{rule.rounding_step.toFixed(2)}
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
                                              onClick={() =>
                                                openRoadRuleEditor(rule)
                                              }
                                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#102E4D] hover:text-[#102E4D]"
                                            >
                                              <Pencil size={13} />
                                              Edit
                                            </button>

                                            <button
                                              type="button"
                                              disabled={isMutating}
                                              onClick={() =>
                                                void archiveRoadRule(rule)
                                              }
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
                          <AlertCircle
                            size={18}
                            className="mt-0.5 shrink-0 text-blue-700"
                          />
                          <div>
                            <p className="text-sm font-semibold text-blue-900">
                              Progressive fare calculation
                            </p>
                            <p className="mt-1 text-xs leading-5 text-blue-800">
                              The first distance band begins at the included
                              base distance. Following bands must be
                              contiguous, and the final band must have no
                              upper-distance limit. These conditions are
                              validated again by the database when saved.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* =================================== */}
                {/* FARE DISCOUNTS */}
                {/* =================================== */}

                {activeTab === "discounts" && (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-slate-900">
                          Passenger Discount Rules
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Discounts remain assigned to individual transport
                          variants.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={openNewDiscount}
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
                                <th className={TABLE_HEAD_CLASS}>
                                  Transport Variant
                                </th>
                                <th className={TABLE_HEAD_CLASS}>
                                  Passenger Category
                                </th>
                                <th className={TABLE_HEAD_CLASS}>
                                  Discount
                                </th>
                                <th className={TABLE_HEAD_CLASS}>
                                  Effective Schedule
                                </th>
                                <th className={TABLE_HEAD_CLASS}>
                                  Status
                                </th>
                                <th className={`${TABLE_HEAD_CLASS} text-center`}>
                                  Actions
                                </th>
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
                                  <tr
                                    key={rule.id}
                                    className="transition hover:bg-slate-50"
                                  >
                                    <td className="px-4 py-4 font-semibold text-slate-800">
                                      {getVariantName(
                                        currentData,
                                        rule.variant_id,
                                      )}
                                    </td>

                                    <td className="px-4 py-4 capitalize text-slate-700">
                                      {rule.passenger_category.replace(
                                        /_/g,
                                        " ",
                                      )}
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
                                        Until{" "}
                                        {displayDate(rule.effective_to)}
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
                                              onClick={() =>
                                                openDiscountEditor(rule)
                                              }
                                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#102E4D] hover:text-[#102E4D]"
                                            >
                                              <Pencil size={13} />
                                              Edit
                                            </button>

                                            <button
                                              type="button"
                                              disabled={isMutating}
                                              onClick={() =>
                                                void archiveDiscount(rule)
                                              }
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
                )}

                {/* =================================== */}
                {/* TRAIN FARE MATRIX */}
                {/* =================================== */}

                {activeTab === "rail" && (
                  <div className="space-y-6">
                    <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_220px]">
                      <SelectField
                        label="Train route"
                        value={railRouteId}
                        onChange={setRailRouteId}
                        disabled={!currentData.railRoutes.length}
                      >
                        {currentData.railRoutes.map((route) => (
                          <option
                            key={route.id}
                            value={route.id}
                          >
                            {route.name} · {route.variant_code}
                          </option>
                        ))}
                      </SelectField>

                      <Field
                        label="View fares effective on"
                        type="date"
                        value={railAsOfDate}
                        onChange={setRailAsOfDate}
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
                              {selectedRailRoute.stations.length} ordered
                              stations · {selectedRailFares.length} fare
                              records
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
                              Select any station pair to add or edit its
                              fare. Both directions display the same stored
                              fare record.
                            </p>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[650px] border-collapse text-center text-sm">
                              <thead>
                                <tr>
                                  <th className="sticky left-0 z-10 min-w-[160px] bg-[#EAF1F8] px-3 py-3 text-left text-xs font-semibold text-slate-600">
                                    From / To
                                  </th>

                                  {selectedRailRoute.stations.map(
                                    (station) => (
                                      <th
                                        key={station.id}
                                        className="min-w-[120px] bg-[#EAF1F8] px-3 py-3 text-xs font-semibold text-slate-700"
                                      >
                                        {station.name}
                                      </th>
                                    ),
                                  )}
                                </tr>
                              </thead>

                              <tbody className="divide-y divide-slate-100">
                                {selectedRailRoute.stations.map(
                                  (fromStation) => (
                                    <tr key={fromStation.id}>
                                      <th className="sticky left-0 z-10 bg-white px-3 py-3 text-left text-xs font-semibold text-slate-700">
                                        {fromStation.name}
                                      </th>

                                      {selectedRailRoute.stations.map(
                                        (toStation) => {
                                          if (
                                            fromStation.id ===
                                            toStation.id
                                          ) {
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
                                            <td
                                              key={toStation.id}
                                              className="px-2 py-2"
                                            >
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  openRailEditor(
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
                                                      {peso(
                                                        fare.stored_value_fare,
                                                      )}
                                                    </p>
                                                    <p className="mt-1 text-[10px] text-slate-500">
                                                      SV
                                                    </p>
                                                    <p className="mt-1 border-t border-slate-100 pt-1 text-xs font-semibold text-slate-700">
                                                      {peso(
                                                        fare.single_journey_fare,
                                                      )}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400">
                                                      Single
                                                    </p>
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
                                        },
                                      )}
                                    </tr>
                                  ),
                                )}
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
                              Usually the contactless or stored-value ticket
                              fare.
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

                        {/* Fare history */}
                        <div className="space-y-3">
                          <div>
                            <h4 className="font-bold text-slate-900">
                              Fare schedule records
                            </h4>
                            <p className="mt-1 text-xs text-slate-500">
                              Includes active, upcoming, expired and
                              archived station-pair records.
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
                                      <th className={TABLE_HEAD_CLASS}>
                                        Station Pair
                                      </th>
                                      <th className={TABLE_HEAD_CLASS}>
                                        Stored Value
                                      </th>
                                      <th className={TABLE_HEAD_CLASS}>
                                        Single Journey
                                      </th>
                                      <th className={TABLE_HEAD_CLASS}>
                                        Effective From
                                      </th>
                                      <th className={TABLE_HEAD_CLASS}>
                                        Status
                                      </th>
                                      <th className={`${TABLE_HEAD_CLASS} text-center`}>
                                        Actions
                                      </th>
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
                                              {getStationName(
                                                selectedRailRoute,
                                                fare.from_stop_id,
                                              )}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500">
                                              to{" "}
                                              {getStationName(
                                                selectedRailRoute,
                                                fare.to_stop_id,
                                              )}
                                            </p>
                                          </td>

                                          <td className="px-4 py-3">
                                            {peso(fare.stored_value_fare)}
                                          </td>

                                          <td className="px-4 py-3">
                                            {peso(
                                              fare.single_journey_fare,
                                            )}
                                          </td>

                                          <td className="px-4 py-3">
                                            <p className="font-medium">
                                              {displayDate(
                                                fare.effective_from,
                                              )}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500">
                                              Until{" "}
                                              {displayDate(
                                                fare.effective_to,
                                              )}
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
                                                    openRailEditor(
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
                                                  onClick={() =>
                                                    void archiveRailFare(fare)
                                                  }
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
                )}
              </>
            )}
          </section>

          <footer className="pb-2 pt-8 text-center text-xs text-slate-400">
            QRoute · Fare Management
          </footer>
        </div>
      </main>

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
          onClose={() => !isSaving && setRoadEditor(null)}
          maxWidth="max-w-3xl"
        >
          <div className="space-y-5">
            <SelectField
              label="Transport variant"
              value={roadEditor.variantId}
              onChange={(value) =>
                setRoadEditor({
                  ...roadEditor,
                  variantId: value,
                })
              }
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
                onChange={(value) =>
                  setRoadEditor({
                    ...roadEditor,
                    baseFare: value,
                  })
                }
                placeholder="e.g. 14.00"
              />

              <Field
                label="Included distance (km)"
                type="number"
                min="0"
                step="0.01"
                value={roadEditor.baseDistanceKm}
                onChange={(value) =>
                  setRoadEditor({
                    ...roadEditor,
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
                onChange={(value) =>
                  setRoadEditor({
                    ...roadEditor,
                    roundingStep: value,
                  })
                }
                placeholder="e.g. 0.25"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Effective from"
                type="date"
                value={roadEditor.effectiveFrom}
                onChange={(value) =>
                  setRoadEditor({
                    ...roadEditor,
                    effectiveFrom: value,
                  })
                }
              />

              <Field
                label="Effective to (optional)"
                type="date"
                value={roadEditor.effectiveTo}
                onChange={(value) =>
                  setRoadEditor({
                    ...roadEditor,
                    effectiveTo: value,
                  })
                }
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
                  onClick={addRoadBand}
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
                          onClick={() => removeRoadBand(index)}
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
                          updateRoadBand(
                            index,
                            "lowerDistanceKm",
                            value,
                          )
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
                          updateRoadBand(
                            index,
                            "upperDistanceKm",
                            value,
                          )
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
                          updateRoadBand(
                            index,
                            "perKmRate",
                            value,
                          )
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
              onCancel={() => setRoadEditor(null)}
              onSave={() => void saveRoadRule()}
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
          onClose={() => !isSaving && setDiscountEditor(null)}
        >
          <div className="space-y-4">
            <SelectField
              label="Transport variant"
              value={discountEditor.variantId}
              onChange={(value) =>
                setDiscountEditor({
                  ...discountEditor,
                  variantId: value,
                })
              }
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
                setDiscountEditor({
                  ...discountEditor,
                  passengerCategory:
                    value as AdminFarePassengerCategory,
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
                setDiscountEditor({
                  ...discountEditor,
                  discountPercent: value,
                })
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Effective from"
                type="date"
                value={discountEditor.effectiveFrom}
                onChange={(value) =>
                  setDiscountEditor({
                    ...discountEditor,
                    effectiveFrom: value,
                  })
                }
              />

              <Field
                label="Effective to (optional)"
                type="date"
                value={discountEditor.effectiveTo}
                onChange={(value) =>
                  setDiscountEditor({
                    ...discountEditor,
                    effectiveTo: value,
                  })
                }
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
              onCancel={() => setDiscountEditor(null)}
              onSave={() => void saveDiscount()}
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
          onClose={() => !isSaving && setRailEditor(null)}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
                Station pair
              </p>
              <p className="mt-1 font-bold text-[#102E4D]">
                {getStationName(
                  selectedRailRoute,
                  Number(railEditor.fromStopId),
                )}
                <span className="mx-2 text-purple-400">↔</span>
                {getStationName(
                  selectedRailRoute,
                  Number(railEditor.toStopId),
                )}
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
                  setRailEditor({
                    ...railEditor,
                    storedValueFare: value,
                  })
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
                  setRailEditor({
                    ...railEditor,
                    singleJourneyFare: value,
                  })
                }
                placeholder="Leave blank if unavailable"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Effective from"
                type="date"
                value={railEditor.effectiveFrom}
                onChange={(value) =>
                  setRailEditor({
                    ...railEditor,
                    effectiveFrom: value,
                  })
                }
              />

              <Field
                label="Effective to (optional)"
                type="date"
                value={railEditor.effectiveTo}
                onChange={(value) =>
                  setRailEditor({
                    ...railEditor,
                    effectiveTo: value,
                  })
                }
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
              onCancel={() => setRailEditor(null)}
              onSave={() => void saveRailFare()}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}