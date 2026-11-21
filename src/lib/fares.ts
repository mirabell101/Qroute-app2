import { supabase } from "@/lib/supabase";
import type { FareDistanceBand } from "./fareCalculations";
import {
  getPublicMapData,
  hasMapAuthSession,
} from "./publicMap";

const FARE_RULE_COLUMNS =
  "id, variant_id, base_fare, base_distance_km, rounding_step, effective_from, effective_to, is_deleted";

const RAIL_FARE_COLUMNS =
  "id, route_id, from_stop_id, to_stop_id, stored_value_fare, single_journey_fare, effective_from, effective_to, is_deleted";

export interface FareRule {
  id: number;
  variant_id: number;
  base_fare: number;
  base_distance_km: number;
  rounding_step: number;
  effective_from: string;
  effective_to: string | null;
}

export type PassengerCategory =
  | "student"
  | "senior_citizen"
  | "pwd";

export interface FareDiscountRule {
  id: number;
  variant_id: number;
  passenger_category: PassengerCategory;
  discount_percent: number;
  effective_from: string;
  effective_to: string | null;
}

export interface TransportVariant {
  id: number;
  code: string;
  name: string;
  fare_model: "distance" | "matrix";
}

export interface TransportFareOption {
  variant: TransportVariant;
  fareRule: FareRule | null;
  distanceBands: FareDistanceBand[];
  discountRules: FareDiscountRule[];
}

export interface RailFare {
  id: number;
  route_id: number;
  from_stop_id: number;
  to_stop_id: number;
  stored_value_fare: number | null;
  single_journey_fare: number | null;
  effective_from: string;
  effective_to: string | null;
}

interface RawFareRule extends Omit<
  FareRule,
  "base_fare" | "base_distance_km" | "rounding_step"
> {
  base_fare: number | string;
  base_distance_km: number | string;
  rounding_step: number | string;
  is_deleted?: boolean;
}

interface RawFareDistanceBand {
  id: number;
  fare_rule_id: number;
  lower_distance_km: number | string;
  upper_distance_km: number | string | null;
  per_km_rate: number | string;
}

interface RawFareDiscountRule extends Omit<
  FareDiscountRule,
  "discount_percent"
> {
  discount_percent: number | string;
  is_deleted?: boolean;
}

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

// ISO dates compare correctly as strings.
function isEffective(
  row: {
    effective_from: string;
    effective_to: string | null;
  },
  day: string,
): boolean {
  return (
    row.effective_from <= day &&
    (row.effective_to === null || row.effective_to > day)
  );
}

function normalizeFareRule(
  row: FareRule | RawFareRule,
): FareRule {
  return {
    id: row.id,
    variant_id: row.variant_id,
    base_fare: Number(row.base_fare),
    base_distance_km: Number(row.base_distance_km),
    rounding_step: Number(row.rounding_step),
    effective_from: row.effective_from,
    effective_to: row.effective_to,
  };
}

function findActiveFareRule(
  rows: readonly (FareRule | RawFareRule)[],
  variantId: number,
  day: string,
): FareRule | null {
  const matchingRule = rows
    .filter((row) => row.variant_id === variantId)
    .filter((row) => {
      if ("is_deleted" in row && row.is_deleted === true) {
        return false;
      }

      return isEffective(row, day);
    })
    .sort((a, b) =>
      b.effective_from.localeCompare(a.effective_from),
    )[0];

  return matchingRule
    ? normalizeFareRule(matchingRule)
    : null;
}

function normalizeDistanceBands(
  rows: readonly RawFareDistanceBand[],
): FareDistanceBand[] {
  return rows
    .map((row) => ({
      id: row.id,
      fare_rule_id: row.fare_rule_id,
      lower_distance_km: Number(row.lower_distance_km),
      upper_distance_km:
        row.upper_distance_km === null
          ? null
          : Number(row.upper_distance_km),
      per_km_rate: Number(row.per_km_rate),
    }))
    .sort(
      (a, b) => a.lower_distance_km - b.lower_distance_km,
    );
}

function normalizeDiscountRules(
  rows: readonly (FareDiscountRule | RawFareDiscountRule)[],
  variantId: number,
  day: string,
): FareDiscountRule[] {
  const matchingRules = rows
    .filter((row) => row.variant_id === variantId)
    .filter((row) => {
      if ("is_deleted" in row && row.is_deleted === true) {
        return false;
      }

      return isEffective(row, day);
    })
    .sort((a, b) =>
      b.effective_from.localeCompare(a.effective_from),
    );

  const selectedByCategory = new Map<
    PassengerCategory,
    FareDiscountRule
  >();

  for (const row of matchingRules) {
    if (selectedByCategory.has(row.passenger_category)) {
      continue;
    }

    selectedByCategory.set(row.passenger_category, {
      id: row.id,
      variant_id: row.variant_id,
      passenger_category: row.passenger_category,
      discount_percent: Number(row.discount_percent),
      effective_from: row.effective_from,
      effective_to: row.effective_to,
    });
  }

  return [...selectedByCategory.values()];
}

// Currently effective rule for one vehicle variant.
// When multiple effective rules are eligible, the latest effective_from wins.
export async function getActiveFareRule(
  variantId: number,
): Promise<FareRule | null> {
  const { data, error } = await supabase
    .from("fare_rules")
    .select(FARE_RULE_COLUMNS)
    .eq("variant_id", variantId)
    .eq("is_deleted", false);

  if (error) {
    throw new Error(error.message);
  }

  return findActiveFareRule(
    (data ?? []) as unknown as RawFareRule[],
    variantId,
    todayIso(),
  );
}

/**
 * Retrieves the fare configuration assigned to one selected route variant.
 *
 * Road variants return their active parent fare rule and associated
 * succeeding-distance bands.
 *
 * Matrix variants retain their rail fare handling and may have no
 * distance-based parent fare rule.
 *
 * The public-map RPC is used for guests. Authenticated users query the
 * relevant tables directly.
 */
export async function getRouteFareOption(
  variantId: number,
  currentUserId: string | null | undefined = undefined,
  day: string = todayIso(),
): Promise<TransportFareOption | null> {
  if (!Number.isSafeInteger(variantId) || variantId <= 0) {
    return null;
  }

  if (!(await hasMapAuthSession(currentUserId))) {
    const publicData = await getPublicMapData();

    const publicVariant = publicData.transportVariants.find(
      (variant) => variant.id === variantId,
    );

    if (!publicVariant) {
      return null;
    }

    const variant: TransportVariant = {
      id: publicVariant.id,
      code: publicVariant.code,
      name: publicVariant.name,
      fare_model: publicVariant.fare_model,
    };

    const fareRule = findActiveFareRule(
      publicData.fareRules,
      variantId,
      day,
    );

    const distanceBands = fareRule
      ? normalizeDistanceBands(
          publicData.fareRuleDistanceBands
            .filter((band) => band.fare_rule_id === fareRule.id)
            .map((band) => ({
              id: band.id,
              fare_rule_id: band.fare_rule_id,
              lower_distance_km: band.lower_distance_km,
              upper_distance_km: band.upper_distance_km,
              per_km_rate: band.per_km_rate,
            })),
        )
      : [];

    const discountRules = normalizeDiscountRules(
      publicData.fareDiscountRules,
      variantId,
      day,
    );

    return {
      variant,
      fareRule,
      distanceBands,
      discountRules,
    };
  }

  // Retrieve only the variant actually assigned to the selected route.
  const { data: variantData, error: variantError } = await supabase
    .from("transport_variants")
    .select("id, code, name, fare_model")
    .eq("id", variantId)
    .eq("is_active", true)
    .maybeSingle();

  if (variantError) {
    throw new Error(variantError.message);
  }

  if (!variantData) {
    return null;
  }

  const variant = variantData as TransportVariant;

  // Load the selected variant's fare rules and discount rules.
  const [ruleResult, discountResult] = await Promise.all([
    supabase
      .from("fare_rules")
      .select(FARE_RULE_COLUMNS)
      .eq("variant_id", variantId)
      .eq("is_deleted", false),

    supabase
      .from("fare_discount_rules")
      .select(
        "id, variant_id, passenger_category, discount_percent, effective_from, effective_to, is_deleted",
      )
      .eq("variant_id", variantId)
      .eq("is_deleted", false),
  ]);

  if (ruleResult.error) {
    throw new Error(ruleResult.error.message);
  }

  if (discountResult.error) {
    throw new Error(discountResult.error.message);
  }

  const fareRule = findActiveFareRule(
    (ruleResult.data ?? []) as unknown as RawFareRule[],
    variantId,
    day,
  );

  let distanceBands: FareDistanceBand[] = [];

  if (fareRule) {
    const { data: bandData, error: bandError } = await supabase
      .from("fare_rule_distance_bands")
      .select(
        "id, fare_rule_id, lower_distance_km, upper_distance_km, per_km_rate",
      )
      .eq("fare_rule_id", fareRule.id)
      .order("lower_distance_km", { ascending: true });

    if (bandError) {
      throw new Error(bandError.message);
    }

    distanceBands = normalizeDistanceBands(
      (bandData ?? []) as RawFareDistanceBand[],
    );
  }

  const discountRules = normalizeDiscountRules(
    (discountResult.data ?? []) as RawFareDiscountRule[],
    variantId,
    day,
  );

  return {
    variant,
    fareRule,
    distanceBands,
    discountRules,
  };
}

// Station-to-station fare (matrix is symmetric, so both directions match).
export async function getRailFare(
  routeId: number,
  stopAId: number,
  stopBId: number,
  currentUserId: string | null | undefined = undefined,
): Promise<RailFare | null> {
  if (!(await hasMapAuthSession(currentUserId))) {
    const publicData = await getPublicMapData();
    const day = todayIso();

    const row = publicData.railFares
      .filter((item) => item.route_id === routeId)
      .filter(
        (item) =>
          (item.from_stop_id === stopAId &&
            item.to_stop_id === stopBId) ||
          (item.from_stop_id === stopBId &&
            item.to_stop_id === stopAId),
      )
      .filter((item) => isEffective(item, day))
      .sort((a, b) =>
        b.effective_from.localeCompare(a.effective_from),
      )[0];

    if (!row) {
      return null;
    }

    return {
      ...row,
      stored_value_fare:
        row.stored_value_fare === null
          ? null
          : Number(row.stored_value_fare),
      single_journey_fare:
        row.single_journey_fare === null
          ? null
          : Number(row.single_journey_fare),
    };
  }

  const { data, error } = await supabase
    .from("rail_fares")
    .select(RAIL_FARE_COLUMNS)
    .eq("route_id", routeId)
    .eq("is_deleted", false)
    .or(
      `and(from_stop_id.eq.${stopAId},to_stop_id.eq.${stopBId}),` +
        `and(from_stop_id.eq.${stopBId},to_stop_id.eq.${stopAId})`,
    );

  if (error) {
    throw new Error(error.message);
  }

  const day = todayIso();

  const row = ((data ?? []) as unknown as RailFare[])
    .filter((item) => isEffective(item, day))
    .sort((a, b) =>
      b.effective_from.localeCompare(a.effective_from),
    )[0];

  if (!row) {
    return null;
  }

  return {
    ...row,
    stored_value_fare:
      row.stored_value_fare === null
        ? null
        : Number(row.stored_value_fare),
    single_journey_fare:
      row.single_journey_fare === null
        ? null
        : Number(row.single_journey_fare),
  };
}