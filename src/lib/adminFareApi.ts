import { API_BASE_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";

// =====================================================
// TYPES
// =====================================================

export type AdminFarePassengerCategory =
  | "student"
  | "senior_citizen"
  | "pwd";

export interface AdminFareVariant {
  id: number;
  code: string;
  name: string;
  fare_model: "distance" | "matrix";
  is_active: boolean;
}

export interface AdminRoadFareRule {
  id: number;
  variant_id: number;
  base_fare: number;
  base_distance_km: number;
  rounding_step: number;
  effective_from: string;
  effective_to: string | null;
  is_deleted: boolean;
}

export interface AdminFareDistanceBand {
  id: number;
  fare_rule_id: number;
  lower_distance_km: number;
  upper_distance_km: number | null;
  per_km_rate: number;
}

export interface AdminFareDiscountRule {
  id: number;
  variant_id: number;
  passenger_category: AdminFarePassengerCategory;
  discount_percent: number;
  effective_from: string;
  effective_to: string | null;
  is_deleted: boolean;
}

export interface AdminRailStation {
  id: number;
  name: string;
  stop_order: number;
}

export interface AdminRailRoute {
  id: number;
  name: string;
  variant_id: number;
  variant_code: string;
  variant_name: string;
  stations: AdminRailStation[];
}

export interface AdminRailFare {
  id: number;
  route_id: number;
  from_stop_id: number;
  to_stop_id: number;
  stored_value_fare: number | null;
  single_journey_fare: number | null;
  effective_from: string;
  effective_to: string | null;
  is_deleted: boolean;
}

export interface AdminFareManagementData {
  variants: AdminFareVariant[];
  roadFareRules: AdminRoadFareRule[];
  distanceBands: AdminFareDistanceBand[];
  discountRules: AdminFareDiscountRule[];
  railRoutes: AdminRailRoute[];
  railFares: AdminRailFare[];
}

export interface RoadFareDistanceBandInput {
  lowerDistanceKm: number;
  upperDistanceKm: number | null;
  perKmRate: number;
}

export interface RoadFareRuleInput {
  variantId: number;
  baseFare: number;
  baseDistanceKm: number;
  roundingStep: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  bands: RoadFareDistanceBandInput[];
}

export interface FareDiscountInput {
  variantId: number;
  passengerCategory: AdminFarePassengerCategory;
  discountPercent: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface RailFareInput {
  routeId: number;
  fromStopId: number;
  toStopId: number;
  storedValueFare: number | null;
  singleJourneyFare: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}


// =====================================================
// RESPONSE VALIDATION
// =====================================================

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isPositiveInteger(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function isFiniteNumber(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

function isNullableNumber(value: unknown): boolean {
  return value === null || isFiniteNumber(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): boolean {
  return value === null || isString(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isPassengerCategory(
  value: unknown,
): value is AdminFarePassengerCategory {
  return (
    value === "student" ||
    value === "senior_citizen" ||
    value === "pwd"
  );
}

function isFareVariant(
  value: unknown,
): value is AdminFareVariant {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    isString(value.code) &&
    isString(value.name) &&
    (
      value.fare_model === "distance" ||
      value.fare_model === "matrix"
    ) &&
    isBoolean(value.is_active)
  );
}

function isRoadFareRule(
  value: unknown,
): value is AdminRoadFareRule {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    isPositiveInteger(value.variant_id) &&
    isFiniteNumber(value.base_fare) &&
    isFiniteNumber(value.base_distance_km) &&
    isFiniteNumber(value.rounding_step) &&
    isString(value.effective_from) &&
    isNullableString(value.effective_to) &&
    isBoolean(value.is_deleted)
  );
}

function isFareDistanceBand(
  value: unknown,
): value is AdminFareDistanceBand {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    isPositiveInteger(value.fare_rule_id) &&
    isFiniteNumber(value.lower_distance_km) &&
    isNullableNumber(value.upper_distance_km) &&
    isFiniteNumber(value.per_km_rate)
  );
}

function isFareDiscountRule(
  value: unknown,
): value is AdminFareDiscountRule {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    isPositiveInteger(value.variant_id) &&
    isPassengerCategory(value.passenger_category) &&
    isFiniteNumber(value.discount_percent) &&
    isString(value.effective_from) &&
    isNullableString(value.effective_to) &&
    isBoolean(value.is_deleted)
  );
}

function isRailStation(
  value: unknown,
): value is AdminRailStation {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    isString(value.name) &&
    Number.isSafeInteger(value.stop_order) &&
    Number(value.stop_order) > 0
  );
}

function isRailRoute(
  value: unknown,
): value is AdminRailRoute {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    isString(value.name) &&
    isPositiveInteger(value.variant_id) &&
    isString(value.variant_code) &&
    isString(value.variant_name) &&
    Array.isArray(value.stations) &&
    value.stations.length >= 2 &&
    value.stations.every(isRailStation)
  );
}

function isRailFare(
  value: unknown,
): value is AdminRailFare {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    isPositiveInteger(value.route_id) &&
    isPositiveInteger(value.from_stop_id) &&
    isPositiveInteger(value.to_stop_id) &&
    isNullableNumber(value.stored_value_fare) &&
    isNullableNumber(value.single_journey_fare) &&
    isString(value.effective_from) &&
    isNullableString(value.effective_to) &&
    isBoolean(value.is_deleted)
  );
}

function parseFareManagementData(
  value: unknown,
): AdminFareManagementData {
  if (
    !isRecord(value) ||
    !Array.isArray(value.variants) ||
    !value.variants.every(isFareVariant) ||
    !Array.isArray(value.roadFareRules) ||
    !value.roadFareRules.every(isRoadFareRule) ||
    !Array.isArray(value.distanceBands) ||
    !value.distanceBands.every(isFareDistanceBand) ||
    !Array.isArray(value.discountRules) ||
    !value.discountRules.every(isFareDiscountRule) ||
    !Array.isArray(value.railRoutes) ||
    !value.railRoutes.every(isRailRoute) ||
    !Array.isArray(value.railFares) ||
    !value.railFares.every(isRailFare)
  ) {
    throw new Error(
      "Fare Management returned an invalid database response.",
    );
  }

  return {
    variants: value.variants,
    roadFareRules: value.roadFareRules,
    distanceBands: value.distanceBands,
    discountRules: value.discountRules,
    railRoutes: value.railRoutes,
    railFares: value.railFares,
  };
}


// =====================================================
// AUTHENTICATED API REQUEST
// =====================================================

interface FareApiOptions {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
}

async function requestFareManagement(
  path: string,
  expectedUserId: string,
  options: FareApiOptions = {},
): Promise<Record<string, unknown>> {
  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  const session = sessionData.session;

  if (!session?.access_token) {
    throw new Error(
      "Please sign in to continue.",
    );
  }

  if (session.user.id !== expectedUserId) {
    throw new Error(
      "The active account changed. Please try again.",
    );
  }

  const method = options.method ?? "GET";
  const hasBody = options.body !== undefined;

  const baseUrl = API_BASE_URL.replace(/\/$/, "");

  const response = await fetch(
    `${baseUrl}/api/admin/fare-management${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(hasBody
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(hasBody
        ? {
            body: JSON.stringify(options.body),
          }
        : {}),
    },
  );

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw new Error(
        `Fare Management request failed (HTTP ${response.status}).`,
      );
    }

    throw new Error(
      "Fare Management returned an invalid response.",
    );
  }

  if (!response.ok) {
    const message =
      isRecord(payload) &&
      typeof payload.message === "string"
        ? payload.message
        : `Fare Management request failed (HTTP ${response.status}).`;

    throw new Error(message);
  }

  if (
    !isRecord(payload) ||
    payload.success !== true
  ) {
    throw new Error(
      "Fare Management returned an invalid response.",
    );
  }

  return payload;
}

function parseSavedId(
  payload: Record<string, unknown>,
): number {
  if (!isPositiveInteger(payload.id)) {
    throw new Error(
      "Fare Management did not return a valid saved record ID.",
    );
  }

  return payload.id;
}


// =====================================================
// LOAD MANAGEMENT DATA
// =====================================================

export async function getAdminFareManagementData(
  expectedUserId: string,
): Promise<AdminFareManagementData> {
  const payload = await requestFareManagement(
    "",
    expectedUserId,
  );

  return parseFareManagementData(payload.data);
}


// =====================================================
// ROAD FARE RULES
// =====================================================

export async function createAdminRoadFareRule(
  expectedUserId: string,
  input: RoadFareRuleInput,
): Promise<number> {
  const payload = await requestFareManagement(
    "/road-rules",
    expectedUserId,
    {
      method: "POST",
      body: input,
    },
  );

  return parseSavedId(payload);
}

export async function updateAdminRoadFareRule(
  expectedUserId: string,
  ruleId: number,
  input: RoadFareRuleInput,
): Promise<number> {
  const payload = await requestFareManagement(
    `/road-rules/${ruleId}`,
    expectedUserId,
    {
      method: "PATCH",
      body: input,
    },
  );

  return parseSavedId(payload);
}

export async function archiveAdminRoadFareRule(
  expectedUserId: string,
  ruleId: number,
): Promise<void> {
  await requestFareManagement(
    `/road-rules/${ruleId}/archive`,
    expectedUserId,
    {
      method: "PATCH",
    },
  );
}


// =====================================================
// FARE DISCOUNTS
// =====================================================

export async function createAdminFareDiscount(
  expectedUserId: string,
  input: FareDiscountInput,
): Promise<number> {
  const payload = await requestFareManagement(
    "/discount-rules",
    expectedUserId,
    {
      method: "POST",
      body: input,
    },
  );

  return parseSavedId(payload);
}

export async function updateAdminFareDiscount(
  expectedUserId: string,
  ruleId: number,
  input: FareDiscountInput,
): Promise<number> {
  const payload = await requestFareManagement(
    `/discount-rules/${ruleId}`,
    expectedUserId,
    {
      method: "PATCH",
      body: input,
    },
  );

  return parseSavedId(payload);
}

export async function archiveAdminFareDiscount(
  expectedUserId: string,
  ruleId: number,
): Promise<void> {
  await requestFareManagement(
    `/discount-rules/${ruleId}/archive`,
    expectedUserId,
    {
      method: "PATCH",
    },
  );
}


// =====================================================
// TRAIN FARE MATRIX
// =====================================================

export async function createAdminRailFare(
  expectedUserId: string,
  input: RailFareInput,
): Promise<number> {
  const payload = await requestFareManagement(
    "/rail-fares",
    expectedUserId,
    {
      method: "POST",
      body: input,
    },
  );

  return parseSavedId(payload);
}

export async function updateAdminRailFare(
  expectedUserId: string,
  fareId: number,
  input: RailFareInput,
): Promise<number> {
  const payload = await requestFareManagement(
    `/rail-fares/${fareId}`,
    expectedUserId,
    {
      method: "PATCH",
      body: input,
    },
  );

  return parseSavedId(payload);
}

export async function archiveAdminRailFare(
  expectedUserId: string,
  fareId: number,
): Promise<void> {
  await requestFareManagement(
    `/rail-fares/${fareId}/archive`,
    expectedUserId,
    {
      method: "PATCH",
    },
  );
}