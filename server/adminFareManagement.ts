import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AdminInputError,
  AdminNotFoundError,
} from "./admin.ts";

// =====================================================
// TYPES
// =====================================================

export type FarePassengerCategory =
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
  passenger_category: FarePassengerCategory;
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
  passengerCategory: FarePassengerCategory;
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
// INPUT VALIDATION
// =====================================================

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function positiveInteger(
  value: unknown,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new AdminInputError(
      `${label} must be a valid positive integer.`,
    );
  }

  return value;
}

function finiteNumber(
  value: unknown,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new AdminInputError(
      `${label} must be a valid number.`,
    );
  }

  return value;
}

function nonNegativeNumber(
  value: unknown,
  label: string,
): number {
  const parsed = finiteNumber(value, label);

  if (parsed < 0) {
    throw new AdminInputError(
      `${label} cannot be negative.`,
    );
  }

  return parsed;
}

function requiredDate(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new AdminInputError(
      `${label} must use YYYY-MM-DD format.`,
    );
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new AdminInputError(
      `${label} is not a valid calendar date.`,
    );
  }

  return value;
}

function nullableDate(
  value: unknown,
  label: string,
): string | null {
  if (value === null) {
    return null;
  }

  return requiredDate(value, label);
}

function validateDateRange(
  effectiveFrom: string,
  effectiveTo: string | null,
): void {
  if (
    effectiveTo !== null &&
    effectiveTo <= effectiveFrom
  ) {
    throw new AdminInputError(
      "The effective end date must be later than the start date.",
    );
  }
}

function parseRoadFareRuleInput(
  value: unknown,
): RoadFareRuleInput {
  if (!isRecord(value)) {
    throw new AdminInputError(
      "A valid road fare rule payload is required.",
    );
  }

  const variantId = positiveInteger(
    value.variantId,
    "Transport variant",
  );

  const baseFare = nonNegativeNumber(
    value.baseFare,
    "Base fare",
  );

  const baseDistanceKm = nonNegativeNumber(
    value.baseDistanceKm,
    "Included distance",
  );

  const roundingStep = finiteNumber(
    value.roundingStep,
    "Rounding step",
  );

  if (roundingStep <= 0) {
    throw new AdminInputError(
      "The rounding step must be greater than zero.",
    );
  }

  const effectiveFrom = requiredDate(
    value.effectiveFrom,
    "Effective start date",
  );

  const effectiveTo = nullableDate(
    value.effectiveTo,
    "Effective end date",
  );

  validateDateRange(effectiveFrom, effectiveTo);

  if (
    !Array.isArray(value.bands) ||
    value.bands.length === 0 ||
    value.bands.length > 100
  ) {
    throw new AdminInputError(
      "A road fare rule must contain between 1 and 100 distance bands.",
    );
  }

  const bands = value.bands.map(
    (item, index): RoadFareDistanceBandInput => {
      if (!isRecord(item)) {
        throw new AdminInputError(
          `Distance band ${index + 1} is invalid.`,
        );
      }

      const lowerDistanceKm = nonNegativeNumber(
        item.lowerDistanceKm,
        `Distance band ${index + 1} lower distance`,
      );

      const upperDistanceKm =
        item.upperDistanceKm === null
          ? null
          : finiteNumber(
              item.upperDistanceKm,
              `Distance band ${index + 1} upper distance`,
            );

      const perKmRate = nonNegativeNumber(
        item.perKmRate,
        `Distance band ${index + 1} rate`,
      );

      if (
        upperDistanceKm !== null &&
        upperDistanceKm <= lowerDistanceKm
      ) {
        throw new AdminInputError(
          `Distance band ${index + 1} must have an upper distance greater than its lower distance.`,
        );
      }

      return {
        lowerDistanceKm,
        upperDistanceKm,
        perKmRate,
      };
    },
  );

  // Band continuity is validated again in PostgreSQL.
  return {
    variantId,
    baseFare,
    baseDistanceKm,
    roundingStep,
    effectiveFrom,
    effectiveTo,
    bands,
  };
}

function parseFareDiscountInput(
  value: unknown,
): FareDiscountInput {
  if (!isRecord(value)) {
    throw new AdminInputError(
      "A valid fare discount payload is required.",
    );
  }

  const variantId = positiveInteger(
    value.variantId,
    "Transport variant",
  );

  if (
    value.passengerCategory !== "student" &&
    value.passengerCategory !== "senior_citizen" &&
    value.passengerCategory !== "pwd"
  ) {
    throw new AdminInputError(
      "Select a valid passenger category.",
    );
  }

  const discountPercent = finiteNumber(
    value.discountPercent,
    "Discount percentage",
  );

  if (
    discountPercent <= 0 ||
    discountPercent > 100
  ) {
    throw new AdminInputError(
      "Discount percentage must be greater than zero and no greater than 100.",
    );
  }

  const effectiveFrom = requiredDate(
    value.effectiveFrom,
    "Effective start date",
  );

  const effectiveTo = nullableDate(
    value.effectiveTo,
    "Effective end date",
  );

  validateDateRange(effectiveFrom, effectiveTo);

  return {
    variantId,
    passengerCategory: value.passengerCategory,
    discountPercent,
    effectiveFrom,
    effectiveTo,
  };
}

function parseRailFareInput(
  value: unknown,
): RailFareInput {
  if (!isRecord(value)) {
    throw new AdminInputError(
      "A valid train fare payload is required.",
    );
  }

  const routeId = positiveInteger(
    value.routeId,
    "Train route",
  );

  const fromStopId = positiveInteger(
    value.fromStopId,
    "Departure station",
  );

  const toStopId = positiveInteger(
    value.toStopId,
    "Destination station",
  );

  if (fromStopId === toStopId) {
    throw new AdminInputError(
      "Departure and destination stations must be different.",
    );
  }

  const storedValueFare =
    value.storedValueFare === null
      ? null
      : nonNegativeNumber(
          value.storedValueFare,
          "Stored-value fare",
        );

  const singleJourneyFare =
    value.singleJourneyFare === null
      ? null
      : nonNegativeNumber(
          value.singleJourneyFare,
          "Single-journey fare",
        );

  if (
    storedValueFare === null &&
    singleJourneyFare === null
  ) {
    throw new AdminInputError(
      "At least one train fare value is required.",
    );
  }

  const effectiveFrom = requiredDate(
    value.effectiveFrom,
    "Effective start date",
  );

  const effectiveTo = nullableDate(
    value.effectiveTo,
    "Effective end date",
  );

  validateDateRange(effectiveFrom, effectiveTo);

  return {
    routeId,
    fromStopId,
    toStopId,
    storedValueFare,
    singleJourneyFare,
    effectiveFrom,
    effectiveTo,
  };
}


// =====================================================
// DATABASE NORMALIZATION
// =====================================================

function databaseNumber(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      "Fare Management returned an invalid numeric value.",
    );
  }

  return parsed;
}

function nullableDatabaseNumber(
  value: unknown,
): number | null {
  return value === null ? null : databaseNumber(value);
}

function oneRelation<T>(
  value: T | T[] | null | undefined,
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function mapFareRule(row: Record<string, unknown>): AdminRoadFareRule {
  return {
    id: Number(row.id),
    variant_id: Number(row.variant_id),
    base_fare: databaseNumber(row.base_fare),
    base_distance_km: databaseNumber(row.base_distance_km),
    rounding_step: databaseNumber(row.rounding_step),
    effective_from: String(row.effective_from),
    effective_to:
      row.effective_to === null
        ? null
        : String(row.effective_to),
    is_deleted: row.is_deleted === true,
  };
}

function mapDistanceBand(
  row: Record<string, unknown>,
): AdminFareDistanceBand {
  return {
    id: Number(row.id),
    fare_rule_id: Number(row.fare_rule_id),
    lower_distance_km: databaseNumber(
      row.lower_distance_km,
    ),
    upper_distance_km: nullableDatabaseNumber(
      row.upper_distance_km,
    ),
    per_km_rate: databaseNumber(row.per_km_rate),
  };
}

function mapDiscountRule(
  row: Record<string, unknown>,
): AdminFareDiscountRule {
  return {
    id: Number(row.id),
    variant_id: Number(row.variant_id),
    passenger_category:
      row.passenger_category as FarePassengerCategory,
    discount_percent: databaseNumber(
      row.discount_percent,
    ),
    effective_from: String(row.effective_from),
    effective_to:
      row.effective_to === null
        ? null
        : String(row.effective_to),
    is_deleted: row.is_deleted === true,
  };
}

function mapRailFare(
  row: Record<string, unknown>,
): AdminRailFare {
  return {
    id: Number(row.id),
    route_id: Number(row.route_id),
    from_stop_id: Number(row.from_stop_id),
    to_stop_id: Number(row.to_stop_id),
    stored_value_fare: nullableDatabaseNumber(
      row.stored_value_fare,
    ),
    single_journey_fare: nullableDatabaseNumber(
      row.single_journey_fare,
    ),
    effective_from: String(row.effective_from),
    effective_to:
      row.effective_to === null
        ? null
        : String(row.effective_to),
    is_deleted: row.is_deleted === true,
  };
}


// =====================================================
// LOAD FARE MANAGEMENT DATA
// =====================================================

export async function getAdminFareManagementData(
  client: SupabaseClient,
): Promise<AdminFareManagementData> {
  const [
    variantsResult,
    rulesResult,
    discountsResult,
    routesResult,
    railFaresResult,
  ] = await Promise.all([
    client
      .from("transport_variants")
      .select("id, code, name, fare_model, is_active")
      .order("name", { ascending: true }),

    client
      .from("fare_rules")
      .select(
        "id, variant_id, base_fare, base_distance_km, rounding_step, effective_from, effective_to, is_deleted",
      )
      .order("variant_id", { ascending: true })
      .order("effective_from", { ascending: false }),

    client
      .from("fare_discount_rules")
      .select(
        "id, variant_id, passenger_category, discount_percent, effective_from, effective_to, is_deleted",
      )
      .order("variant_id", { ascending: true })
      .order("effective_from", { ascending: false }),

    client
      .from("routes")
      .select(`
        id,
        name,
        variant_id,
        is_deleted,
        transport_variants!inner (
          id,
          code,
          name,
          fare_model
        ),
        route_stops (
          stop_order,
          stops (
            id,
            name,
            stop_type
          )
        )
      `)
      .eq("is_deleted", false)
      .eq("transport_variants.fare_model", "matrix")
      .order("name", { ascending: true })
      .order("stop_order", {
        ascending: true,
        referencedTable: "route_stops",
      }),

    client
      .from("rail_fares")
      .select(
        "id, route_id, from_stop_id, to_stop_id, stored_value_fare, single_journey_fare, effective_from, effective_to, is_deleted",
      )
      .order("route_id", { ascending: true })
      .order("effective_from", { ascending: false }),
  ]);

  if (variantsResult.error) throw variantsResult.error;
  if (rulesResult.error) throw rulesResult.error;
  if (discountsResult.error) throw discountsResult.error;
  if (routesResult.error) throw routesResult.error;
  if (railFaresResult.error) throw railFaresResult.error;

  const ruleRows = (
    rulesResult.data ?? []
  ) as unknown as Record<string, unknown>[];

  const ruleIds = ruleRows.map((row) => Number(row.id));

  let bandRows: Record<string, unknown>[] = [];

  if (ruleIds.length > 0) {
    const { data, error } = await client
      .from("fare_rule_distance_bands")
      .select(
        "id, fare_rule_id, lower_distance_km, upper_distance_km, per_km_rate",
      )
      .in("fare_rule_id", ruleIds)
      .order("fare_rule_id", { ascending: true })
      .order("lower_distance_km", { ascending: true });

    if (error) throw error;

    bandRows = (data ?? []) as unknown as Record<
      string,
      unknown
    >[];
  }

  const variants: AdminFareVariant[] = (
    variantsResult.data ?? []
  ).map((row) => ({
    id: Number(row.id),
    code: row.code,
    name: row.name,
    fare_model: row.fare_model as "distance" | "matrix",
    is_active: row.is_active === true,
  }));

  const roadFareRules = ruleRows.map(mapFareRule);

  const distanceBands = bandRows.map(mapDistanceBand);

  const discountRules = (
    (discountsResult.data ?? []) as unknown as Record<
      string,
      unknown
    >[]
  ).map(mapDiscountRule);

  const railRouteRows = (
    routesResult.data ?? []
  ) as unknown as Array<Record<string, unknown>>;

  const railRoutes: AdminRailRoute[] = [];

  for (const route of railRouteRows) {
    const variant = oneRelation(
      route.transport_variants as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | null,
    );

    if (!variant) continue;

    const routeStops = Array.isArray(route.route_stops)
      ? (route.route_stops as Array<Record<string, unknown>>)
      : [];

    const stations: AdminRailStation[] = routeStops
      .flatMap((routeStop) => {
        const stop = oneRelation(
          routeStop.stops as
            | Record<string, unknown>
            | Record<string, unknown>[]
            | null,
        );

        if (
          !stop ||
          stop.stop_type !== "train_station"
        ) {
          return [];
        }

        return [{
          id: Number(stop.id),
          name: String(stop.name),
          stop_order: Number(routeStop.stop_order),
        }];
      })
      .sort((a, b) => a.stop_order - b.stop_order);

    // A matrix editor requires at least two stations.
    if (stations.length < 2) continue;

    railRoutes.push({
      id: Number(route.id),
      name: String(route.name),
      variant_id: Number(route.variant_id),
      variant_code: String(variant.code),
      variant_name: String(variant.name),
      stations,
    });
  }

  const railFares = (
    (railFaresResult.data ?? []) as unknown as Record<
      string,
      unknown
    >[]
  ).map(mapRailFare);

  return {
    variants,
    roadFareRules,
    distanceBands,
    discountRules,
    railRoutes,
    railFares,
  };
}


// =====================================================
// RPC ERROR HANDLING
// =====================================================

function throwFareRpcError(error: {
  code?: string;
  message: string;
}): never {
  if (error.code === "P0002") {
    throw new AdminNotFoundError(error.message);
  }

  if (
    error.code === "P0001" ||
    error.code === "22023" ||
    error.code === "23505" ||
    error.code === "23514" ||
    error.code === "23503"
  ) {
    throw new AdminInputError(error.message);
  }

  throw new Error(error.message);
}

async function callFareSaveRpc(
  client: SupabaseClient,
  functionName:
    | "save_admin_fare_rule"
    | "save_admin_fare_discount"
    | "save_admin_rail_fare",
  args: Record<string, unknown>,
): Promise<number> {
  const { data, error } = await client.rpc(
    functionName,
    args,
  );

  if (error) {
    throwFareRpcError(error);
  }

  const id = Number(data);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(
      "Fare Management did not return a valid saved record ID.",
    );
  }

  return id;
}


// =====================================================
// ROAD FARE RULE OPERATIONS
// =====================================================

export async function saveAdminRoadFareRule(
  client: SupabaseClient,
  ruleId: number | null,
  rawInput: unknown,
): Promise<number> {
  const input = parseRoadFareRuleInput(rawInput);

  return callFareSaveRpc(
    client,
    "save_admin_fare_rule",
    {
      p_rule_id: ruleId,
      p_variant_id: input.variantId,
      p_base_fare: input.baseFare,
      p_base_distance_km: input.baseDistanceKm,
      p_rounding_step: input.roundingStep,
      p_effective_from: input.effectiveFrom,
      p_effective_to: input.effectiveTo,
      p_bands: input.bands.map((band) => ({
        lower_distance_km: band.lowerDistanceKm,
        upper_distance_km: band.upperDistanceKm,
        per_km_rate: band.perKmRate,
      })),
    },
  );
}


// =====================================================
// DISCOUNT OPERATIONS
// =====================================================

export async function saveAdminFareDiscount(
  client: SupabaseClient,
  ruleId: number | null,
  rawInput: unknown,
): Promise<number> {
  const input = parseFareDiscountInput(rawInput);

  return callFareSaveRpc(
    client,
    "save_admin_fare_discount",
    {
      p_rule_id: ruleId,
      p_variant_id: input.variantId,
      p_passenger_category: input.passengerCategory,
      p_discount_percent: input.discountPercent,
      p_effective_from: input.effectiveFrom,
      p_effective_to: input.effectiveTo,
    },
  );
}


// =====================================================
// RAIL FARE OPERATIONS
// =====================================================

export async function saveAdminRailFare(
  client: SupabaseClient,
  fareId: number | null,
  rawInput: unknown,
): Promise<number> {
  const input = parseRailFareInput(rawInput);

  return callFareSaveRpc(
    client,
    "save_admin_rail_fare",
    {
      p_fare_id: fareId,
      p_route_id: input.routeId,
      p_from_stop_id: input.fromStopId,
      p_to_stop_id: input.toStopId,
      p_stored_value_fare: input.storedValueFare,
      p_single_journey_fare: input.singleJourneyFare,
      p_effective_from: input.effectiveFrom,
      p_effective_to: input.effectiveTo,
    },
  );
}


// =====================================================
// ARCHIVE OPERATIONS
// =====================================================

async function archiveFareRecord(
  client: SupabaseClient,
  table:
    | "fare_rules"
    | "fare_discount_rules"
    | "rail_fares",
  id: number,
): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AdminInputError(
      "A valid fare record ID is required.",
    );
  }

  const { data, error } = await client
    .from(table)
    .update({ is_deleted: true })
    .eq("id", id)
    .eq("is_deleted", false)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") {
      throw new Error(
        "Administrator permission is required to archive fare records.",
      );
    }

    throw error;
  }

  if (!data) {
    throw new AdminNotFoundError(
      "The active fare record could not be found.",
    );
  }
}

export async function archiveAdminRoadFareRule(
  client: SupabaseClient,
  id: number,
): Promise<void> {
  await archiveFareRecord(client, "fare_rules", id);
}

export async function archiveAdminFareDiscount(
  client: SupabaseClient,
  id: number,
): Promise<void> {
  await archiveFareRecord(
    client,
    "fare_discount_rules",
    id,
  );
}

export async function archiveAdminRailFare(
  client: SupabaseClient,
  id: number,
): Promise<void> {
  await archiveFareRecord(client, "rail_fares", id);
}