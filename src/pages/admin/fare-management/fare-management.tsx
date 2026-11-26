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
  type AdminRailFare,
  type AdminRailRoute,
  type AdminRoadFareRule,
  type FareDiscountInput,
  type RailFareInput,
  type RoadFareRuleInput,
} from "@/lib/adminFareApi";

import { getAdminNavigationDestination } from "@/pages/admin/adminNavigation";
import { logoutCurrentDevice } from "@/lib/authLogout";

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
  RefreshCw,
  ArrowLeftRight,
  Calculator,
} from "lucide-react";

import RoadFareRulesSection from "../../../components/fare-management/RoadFareRulesSection";
import FareDiscountsSection from "../../../components/fare-management/FareDiscountsSection";
import RailFareMatrixSection from "../../../components/fare-management/RailFareMatrixSection";
import FareManagementModals from "../../../components/fare-management/FareManagementModals";

import {
  EmptyState,
  getStationName,
  getVariantName,
  localToday,
  type DiscountForm,
  type RailForm,
  type RoadBandForm,
  type RoadRuleForm,
} from "../../../components/fare-management/fareManagementShared";

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

export default function FareManagement() {
  const navigate = useNavigate();
  const { userId, account } = useAccountProfile();

  const [data, setData] = useState<AdminFareManagementData | null>(null);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const [activeTab, setActiveTab] = useState<FareTab>("road");
  const [isSaving, setIsSaving] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const [roadVariantId, setRoadVariantId] = useState("");
  const [roadEditor, setRoadEditor] = useState<RoadRuleForm | null>(null);
  const [roadEditorError, setRoadEditorError] = useState<string | null>(null);

  const [discountEditor, setDiscountEditor] = useState<DiscountForm | null>(null);
  const [discountEditorError, setDiscountEditorError] = useState<string | null>(null);

  const [railRouteId, setRailRouteId] = useState("");
  const [railAsOfDate, setRailAsOfDate] = useState(localToday());
  const [railEditor, setRailEditor] = useState<RailForm | null>(null);
  const [railEditorError, setRailEditorError] = useState<string | null>(null);

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

  const currentData = userId && dataOwnerId === userId ? data : null;

  const distanceVariants = useMemo(
    () =>
      (currentData?.variants ?? []).filter(
        (variant) => variant.fare_model === "distance",
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
        .filter((rule) => rule.variant_id === selectedRoadVariantId)
        .sort((a, b) => b.effective_from.localeCompare(a.effective_from)),
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
        .sort((a, b) => b.effective_from.localeCompare(a.effective_from)),
    [currentData, railRouteId],
  );

  // ---------------------------------------------------
  // LOGOUT
  // ---------------------------------------------------

  const handleLogout = async (): Promise<void> => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      await logoutCurrentDevice();
      navigate("/login", { replace: true });
    } catch (error: unknown) {
      console.error("Fare Management logout failed:", error);
      setLogoutError("Unable to sign out. Please try again.");
    } finally {
      setIsLoggingOut(false);
    }
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
      .sort((a, b) => a.lower_distance_km - b.lower_distance_km)
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
      bands[index] = { ...bands[index], [key]: value };
      return { ...previous, bands };
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
        Number(lastBand.upperDistanceKm) <= Number(lastBand.lowerDistanceKm)
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
      if (!previous || previous.bands.length <= 1) return previous;
      return {
        ...previous,
        bands: previous.bands.filter((_band, bandIndex) => bandIndex !== index),
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
      (roadEditor.effectiveTo && roadEditor.effectiveTo <= roadEditor.effectiveFrom)
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

      if (!band.lowerDistanceKm.trim() || !band.perKmRate.trim()) {
        setRoadEditorError(
          `Complete the lower distance and rate for band ${index + 1}.`,
        );
        return;
      }

      if (index < roadEditor.bands.length - 1 && !band.upperDistanceKm.trim()) {
        setRoadEditorError(`Band ${index + 1} needs an upper distance.`);
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
        (upper !== null && (!Number.isFinite(upper) || upper <= lower))
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
      if (bands[index - 1].upperDistanceKm !== bands[index].lowerDistanceKm) {
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
        await updateAdminRoadFareRule(userId, roadEditor.id, input);
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
    if (!userId || !currentData) return;

    if (
      !window.confirm(
        `Archive this road fare rule for ${getVariantName(currentData, rule.variant_id)}? The record will be retained for historical reference.`,
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

  const openDiscountEditor = (
    rule: AdminFareManagementData["discountRules"][number],
  ) => {
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

    if (!Number.isSafeInteger(variantId) || variantId <= 0) {
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
      (discountEditor.effectiveTo &&
        discountEditor.effectiveTo <= discountEditor.effectiveFrom)
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
        await updateAdminFareDiscount(userId, discountEditor.id, input);
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
    if (!userId || !currentData) return;

    if (
      !window.confirm(
        `Archive the ${rule.passenger_category.replace("_", " ")} discount for ${getVariantName(currentData, rule.variant_id)}?`,
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
      (railEditor.effectiveTo && railEditor.effectiveTo <= railEditor.effectiveFrom)
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
      (storedValueFare !== null &&
        (!Number.isFinite(storedValueFare) || storedValueFare < 0)) ||
      (singleJourneyFare !== null &&
        (!Number.isFinite(singleJourneyFare) || singleJourneyFare < 0))
    ) {
      setRailEditorError("Train fares must be valid nonnegative amounts.");
      return;
    }

    if (storedValueFare === null && singleJourneyFare === null) {
      setRailEditorError("Enter at least one fare type.");
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
        await updateAdminRailFare(userId, railEditor.id, input);
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

    const fromName = getStationName(selectedRailRoute, fare.from_stop_id);
    const toName = getStationName(selectedRailRoute, fare.to_stop_id);

    if (!window.confirm(`Archive the fare between ${fromName} and ${toName}?`)) {
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

  const patchRoadEditor = (patch: Partial<RoadRuleForm>) => {
    setRoadEditor((previous) => previous ? { ...previous, ...patch } : previous);
  };

  const patchDiscountEditor = (patch: Partial<DiscountForm>) => {
    setDiscountEditor((previous) => previous ? { ...previous, ...patch } : previous);
  };

  const patchRailEditor = (patch: Partial<RailForm>) => {
    setRailEditor((previous) => previous ? { ...previous, ...patch } : previous);
  };

  // ---------------------------------------------------
  // COMMON UI
  // ---------------------------------------------------

  const loadError = Boolean(errorMessage && !currentData);

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
              const destination = getAdminNavigationDestination(item.label);
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
                  onClick={() => destination && navigate(destination)}
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
                    <span className="ml-auto text-[10px]">Unavailable</span>
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
                <p className="text-sm font-semibold">Fare Management</p>
                <p className="text-xs text-slate-300">Administrator workspace</p>
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
            disabled={isLoggingOut}
            onClick={() => void handleLogout()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut size={17} />
            {isLoggingOut ? "Signing Out..." : "Sign Out"}
          </button>

          {logoutError && (
            <p role="alert" className="mt-2 text-center text-xs text-red-300">
              {logoutError}
            </p>
          )}
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
              <div role="status" className="py-16 text-center text-sm text-slate-500">
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
                {activeTab === "road" && (
                  <RoadFareRulesSection
                    currentData={currentData}
                    distanceVariants={distanceVariants}
                    roadVariantId={roadVariantId}
                    onRoadVariantChange={setRoadVariantId}
                    roadRules={roadRules}
                    isMutating={isMutating}
                    onAdd={openNewRoadRule}
                    onEdit={openRoadRuleEditor}
                    onArchive={(rule) => void archiveRoadRule(rule)}
                  />
                )}

                {activeTab === "discounts" && (
                  <FareDiscountsSection
                    currentData={currentData}
                    discountRules={discountRules}
                    isMutating={isMutating}
                    onAdd={openNewDiscount}
                    onEdit={openDiscountEditor}
                    onArchive={(rule) => void archiveDiscount(rule)}
                  />
                )}

                {activeTab === "rail" && (
                  <RailFareMatrixSection
                    currentData={currentData}
                    railRouteId={railRouteId}
                    onRailRouteChange={setRailRouteId}
                    railAsOfDate={railAsOfDate}
                    onRailAsOfDateChange={setRailAsOfDate}
                    selectedRailRoute={selectedRailRoute}
                    selectedRailFares={selectedRailFares}
                    isMutating={isMutating}
                    onOpenEditor={openRailEditor}
                    onArchive={(fare) => void archiveRailFare(fare)}
                  />
                )}
              </>
            )}
          </section>

          <footer className="pb-2 pt-8 text-center text-xs text-slate-400">
            QRoute · Fare Management
          </footer>
        </div>
      </main>

      <FareManagementModals
        roadEditor={roadEditor}
        roadEditorError={roadEditorError}
        discountEditor={discountEditor}
        discountEditorError={discountEditorError}
        railEditor={railEditor}
        railEditorError={railEditorError}
        distanceVariants={distanceVariants}
        currentData={currentData}
        selectedRailRoute={selectedRailRoute}
        isSaving={isSaving}
        onCloseRoad={() => setRoadEditor(null)}
        onSaveRoad={() => void saveRoadRule()}
        onRoadEditorPatch={patchRoadEditor}
        onRoadBandChange={updateRoadBand}
        onAddRoadBand={addRoadBand}
        onRemoveRoadBand={removeRoadBand}
        onCloseDiscount={() => setDiscountEditor(null)}
        onSaveDiscount={() => void saveDiscount()}
        onDiscountEditorPatch={patchDiscountEditor}
        onCloseRail={() => setRailEditor(null)}
        onSaveRail={() => void saveRailFare()}
        onRailEditorPatch={patchRailEditor}
      />
    </div>
  );
}
