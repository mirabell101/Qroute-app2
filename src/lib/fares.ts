import { supabase } from "@/lib/supabase";
import type { FareDistanceBand } from "./fareCalculations";

// Explicit column lists: anon only has column-level SELECT grants,
// so select("*") would fail with "permission denied for table".
const FARE_RULE_COLUMNS =
  "id, variant_id, fare_area_id, base_fare, base_distance_km, per_km_rate, rounding_step, effective_from, effective_to, is_deleted";
const RAIL_FARE_COLUMNS =
  "id, route_id, from_stop_id, to_stop_id, stored_value_fare, single_journey_fare, effective_from, effective_to, is_deleted";

export interface FareRule {
  id: number;
  variant_id: number;
  fare_area_id: number | null;
  base_fare: number;
  base_distance_km: number;
  per_km_rate: number;
  rounding_step: number;
  effective_from: string;
  effective_to: string | null;
}

export type PassengerCategory = "student" | "senior_citizen" | "pwd";

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
  is_deleted: boolean;
}

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// ISO dates compare correctly as strings.
function isEffective(
  row: { effective_from: string; effective_to: string | null },
  day: string
): boolean {
  return (
    row.effective_from <= day &&
    (row.effective_to === null || row.effective_to > day)
  );
}

// Currently effective rule for a vehicle variant (latest effective_from wins).
export async function getActiveFareRule(
  variantId: number
): Promise<FareRule | null> {
  const { data, error } = await supabase
    .from("fare_rules")
    .select(FARE_RULE_COLUMNS)
    .eq("variant_id", variantId)
    .eq("is_deleted", false);

  if (error) throw new Error(error.message);

  const day = todayIso();

  const rule = ((data ?? []) as unknown as FareRule[])
    .filter((row) => isEffective(row, day))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];

  if (!rule) return null;

  return {
    ...rule,
    base_fare: Number(rule.base_fare),
    base_distance_km: Number(rule.base_distance_km),
    per_km_rate: Number(rule.per_km_rate),
    rounding_step: Number(rule.rounding_step),
  };
}

export async function getTransportFareOptions(
  transportTypeId: number,
  fareAreaId: number | null,
  day: string = todayIso()
): Promise<TransportFareOption[]> {
  const { data: variantData, error: variantError } = await supabase
    .from("transport_variants")
    .select("id, code, name, fare_model")
    .eq("transport_type_id", transportTypeId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (variantError) throw new Error(variantError.message);

  const variants = (variantData ?? []) as TransportVariant[];
  if (variants.length === 0) return [];

  const variantIds = variants.map((variant) => variant.id);
  let rules: FareRule[] = [];

  if (fareAreaId !== null) {
    const { data: ruleData, error: ruleError } = await supabase
      .from("fare_rules")
      .select(FARE_RULE_COLUMNS)
      .in("variant_id", variantIds)
      .eq("fare_area_id", fareAreaId)
      .eq("is_deleted", false);

    if (ruleError) throw new Error(ruleError.message);

    rules = ((ruleData ?? []) as unknown as FareRule[])
      .filter((rule) => isEffective(rule, day))
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
      .map((rule) => ({
        ...rule,
        base_fare: Number(rule.base_fare),
        base_distance_km: Number(rule.base_distance_km),
        per_km_rate: Number(rule.per_km_rate),
        rounding_step: Number(rule.rounding_step),
      }));
  }

  const ruleIds = rules.map((rule) => rule.id);
  let bandsByRule = new Map<number, FareDistanceBand[]>();

  if (ruleIds.length > 0) {
    const { data: bandData, error: bandError } = await supabase
      .from("fare_rule_distance_bands")
      .select(
        "id, fare_rule_id, lower_distance_km, upper_distance_km, per_km_rate"
      )
      .in("fare_rule_id", ruleIds)
      .order("lower_distance_km", { ascending: true });

    if (bandError) throw new Error(bandError.message);

    bandsByRule = new Map<number, FareDistanceBand[]>();
    for (const raw of (bandData ?? []) as RawFareDistanceBand[]) {
      const bands = bandsByRule.get(raw.fare_rule_id) ?? [];
      bands.push({
        id: raw.id,
        fare_rule_id: raw.fare_rule_id,
        lower_distance_km: Number(raw.lower_distance_km),
        upper_distance_km:
          raw.upper_distance_km === null
            ? null
            : Number(raw.upper_distance_km),
        per_km_rate: Number(raw.per_km_rate),
      });
      bandsByRule.set(raw.fare_rule_id, bands);
    }
  }

  const { data: discountData, error: discountError } = await supabase
    .from("fare_discount_rules")
    .select(
      "id, variant_id, passenger_category, discount_percent, effective_from, effective_to, is_deleted"
    )
    .in("variant_id", variantIds)
    .eq("is_deleted", false);

  if (discountError) throw new Error(discountError.message);

  const discountsByVariant = new Map<number, FareDiscountRule[]>();
  const discounts = ((discountData ?? []) as RawFareDiscountRule[])
    .filter((discount) => isEffective(discount, day))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));

  for (const discount of discounts) {
    const current = discountsByVariant.get(discount.variant_id) ?? [];
    if (
      current.some(
        (item) => item.passenger_category === discount.passenger_category
      )
    ) {
      continue;
    }

    current.push({
      ...discount,
      discount_percent: Number(discount.discount_percent),
    });
    discountsByVariant.set(discount.variant_id, current);
  }

  return variants.map((variant) => {
    const rule = rules.find((item) => item.variant_id === variant.id) ?? null;

    return {
      variant,
      fareRule: rule,
      distanceBands: rule ? bandsByRule.get(rule.id) ?? [] : [],
      discountRules: discountsByVariant.get(variant.id) ?? [],
    };
  });
}

export interface DistanceFare {
  fare: number;
  unroundedFare: number;
  distanceKm: number;
  extraKm: number;
}

// base fare covers the first base_distance_km; each extra km adds per_km_rate.
// ASSUMPTION: fractional km are prorated and the result is rounded to the
// nearest rounding_step. Verify against LTFRB's published fare tables.
export function calculateDistanceFare(
  rule: FareRule,
  distanceMeters: number
): DistanceFare {
  const distanceKm = Math.max(0, distanceMeters) / 1000;
  const extraKm = Math.max(0, distanceKm - rule.base_distance_km);
  const unroundedFare = rule.base_fare + extraKm * rule.per_km_rate;
  const step = rule.rounding_step > 0 ? rule.rounding_step : 0.25;
  const fare = Number((Math.round(unroundedFare / step) * step).toFixed(2));

  return { fare, unroundedFare, distanceKm, extraKm };
}

// Station-to-station fare (matrix is symmetric, so both directions match).
export async function getRailFare(
  routeId: number,
  stopAId: number,
  stopBId: number
): Promise<RailFare | null> {
  const { data, error } = await supabase
    .from("rail_fares")
    .select(RAIL_FARE_COLUMNS)
    .eq("route_id", routeId)
    .eq("is_deleted", false)
    .or(
      `and(from_stop_id.eq.${stopAId},to_stop_id.eq.${stopBId}),` +
        `and(from_stop_id.eq.${stopBId},to_stop_id.eq.${stopAId})`
    );

  if (error) throw new Error(error.message);

  const day = todayIso();

  const row = ((data ?? []) as unknown as RailFare[])
    .filter((item) => isEffective(item, day))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];

  if (!row) return null;

  return {
    ...row,
    stored_value_fare:
      row.stored_value_fare === null ? null : Number(row.stored_value_fare),
    single_journey_fare:
      row.single_journey_fare === null
        ? null
        : Number(row.single_journey_fare),
  };
}