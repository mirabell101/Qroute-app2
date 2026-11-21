import type {
  FareRule,
  PassengerCategory,
  RailFare,
  TransportFareOption,
} from "./fares";

export interface FareDistanceBand {
  id?: number;
  fare_rule_id?: number;
  lower_distance_km: number;
  upper_distance_km: number | null;
  per_km_rate: number;
}

export interface FareEstimate {
  // This is the regular fare after applying the fare rule's rounding step.
  // Discount calculations use this value as their starting amount.
  calculatedFare: number;
  displayFare: number;
  distanceKm: number;
  extraKm: number;
}

export interface DiscountEstimate {
  // Discounted amount before whole-peso display rounding.
  calculatedFare: number;
  displayFare: number;
}

export interface FareOptionEstimate {
  option: TransportFareOption;
  fare: FareEstimate | null;
  discounts: Record<
    PassengerCategory,
    DiscountEstimate | null
  >;
}

export type FareCardCategory =
  | "regular"
  | "student"
  | "senior_citizen"
  | "pwd";

export interface FareCardOption {
  variantId: number;
  variantName: string;
  amounts: {
    label: string;
    amount: number | null;
  }[];
  unavailableReason: string | null;
}

export interface FareCard {
  category: FareCardCategory;
  label: string;
  options: FareCardOption[];
}

const fareCardCategories: {
  category: FareCardCategory;
  label: string;
}[] = [
  { category: "regular", label: "Regular" },
  { category: "student", label: "Student" },
  { category: "senior_citizen", label: "Senior Citizen" },
  { category: "pwd", label: "PWD" },
];

const DISTANCE_EPSILON = 1e-9;

const PASSENGER_CATEGORIES: PassengerCategory[] = [
  "student",
  "senior_citizen",
  "pwd",
];

function getRailAmounts(
  fare: RailFare,
): {
  label: string;
  amount: number;
}[] {
  const amounts: {
    label: string;
    amount: number;
  }[] = [];

  if (fare.stored_value_fare !== null) {
    amounts.push({
      label: "Stored value",
      amount: fare.stored_value_fare,
    });
  }

  if (fare.single_journey_fare !== null) {
    amounts.push({
      label: "Single journey",
      amount: fare.single_journey_fare,
    });
  }

  return amounts;
}

export function buildFareCards(
  estimates: FareOptionEstimate[],
  railFare: RailFare | null,
  selectedRailVariantId: number | null,
): FareCard[] {
  return fareCardCategories.map(({ category, label }) => ({
    category,
    label,
    options: estimates.map((estimate): FareCardOption => {
      const { option, fare, discounts } = estimate;

      const isRail = option.variant.fare_model === "matrix";
      const isSelectedRailVariant =
        isRail && option.variant.id === selectedRailVariantId;

      const discountRule =
        category === "regular"
          ? undefined
          : option.discountRules.find(
              (rule) => rule.passenger_category === category,
            );

      if (category === "regular") {
        if (isRail) {
          const amounts =
            isSelectedRailVariant && railFare
              ? getRailAmounts(railFare)
              : [];

          return {
            variantId: option.variant.id,
            variantName: option.variant.name,
            amounts,
            unavailableReason:
              amounts.length > 0 ? null : "Fare unavailable",
          };
        }

        return {
          variantId: option.variant.id,
          variantName: option.variant.name,
          amounts: [
            {
              label: "",
              amount: fare?.displayFare ?? null,
            },
          ],
          unavailableReason: fare ? null : "Fare unavailable",
        };
      }

      if (!discountRule) {
        return {
          variantId: option.variant.id,
          variantName: option.variant.name,
          amounts: isRail
            ? []
            : [
                {
                  label: "",
                  amount: null,
                },
              ],
          unavailableReason:
            "Discount unavailable — no configured rule",
        };
      }

      if (
        !Number.isFinite(discountRule.discount_percent) ||
        discountRule.discount_percent <= 0 ||
        discountRule.discount_percent > 100
      ) {
        return {
          variantId: option.variant.id,
          variantName: option.variant.name,
          amounts: [],
          unavailableReason:
            "Discount unavailable — configured rule is invalid",
        };
      }

      if (isRail) {
        if (!isSelectedRailVariant || !railFare) {
          return {
            variantId: option.variant.id,
            variantName: option.variant.name,
            amounts: [],
            unavailableReason: "Fare unavailable",
          };
        }

        const amounts = getRailAmounts(railFare).map(
          ({ label: amountLabel, amount }) => ({
            label: amountLabel,
            amount: calculateDiscountedFare(
              amount,
              discountRule.discount_percent,
            ).displayFare,
          }),
        );

        return {
          variantId: option.variant.id,
          variantName: option.variant.name,
          amounts,
          unavailableReason:
            amounts.length > 0 ? null : "Fare unavailable",
        };
      }

      const discount = discounts[category];

      return {
        variantId: option.variant.id,
        variantName: option.variant.name,
        amounts: [
          {
            label: "",
            amount: discount?.displayFare ?? null,
          },
        ],
        unavailableReason: discount
          ? null
          : "Discount unavailable — fare estimate unavailable",
      };
    }),
  }));
}

// Round a regular fare to the increment configured on its fare rule.
export function roundFareToStep(
  calculatedFare: number,
  roundingStep: number,
): number {
  if (
    !Number.isFinite(calculatedFare) ||
    calculatedFare < 0
  ) {
    throw new RangeError(
      "Fare must be a finite non-negative amount.",
    );
  }

  if (
    !Number.isFinite(roundingStep) ||
    roundingStep <= 0
  ) {
    throw new RangeError(
      "Fare rounding step must be a positive finite amount.",
    );
  }

  const rounded =
    Math.round(calculatedFare / roundingStep + 1e-9) *
    roundingStep;

  return Number(rounded.toFixed(2));
}

// Discounted fares are displayed as whole pesos.
export function roundFareForDisplay(
  calculatedFare: number,
): number {
  if (
    !Number.isFinite(calculatedFare) ||
    calculatedFare < 0
  ) {
    throw new RangeError(
      "Fare must be a finite non-negative amount.",
    );
  }

  return Math.round(calculatedFare);
}

export function calculateDiscountedFare(
  calculatedFare: number,
  discountPercent: number,
): DiscountEstimate {
  if (
    !Number.isFinite(calculatedFare) ||
    calculatedFare < 0
  ) {
    throw new RangeError(
      "Fare must be a finite non-negative amount.",
    );
  }

  if (
    !Number.isFinite(discountPercent) ||
    discountPercent <= 0 ||
    discountPercent > 100
  ) {
    throw new RangeError(
      "Discount must be greater than 0 and no more than 100 percent.",
    );
  }

  // calculatedFare is already rounded using the road fare rule's
  // rounding_step when this function is used for a road fare.
  const discountedFare =
    calculatedFare * (1 - discountPercent / 100);

  return {
    calculatedFare: discountedFare,
    displayFare: roundFareForDisplay(discountedFare),
  };
}

export function calculateDistanceFare(
  rule: FareRule,
  bands: FareDistanceBand[],
  distanceMeters: number,
): FareEstimate | null {
  if (
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(rule.base_fare) ||
    !Number.isFinite(rule.base_distance_km) ||
    !Number.isFinite(rule.rounding_step) ||
    rule.base_fare < 0 ||
    rule.base_distance_km < 0 ||
    rule.rounding_step <= 0
  ) {
    return null;
  }

  const distanceKm = Math.max(0, distanceMeters) / 1000;
  const extraKm = Math.max(
    0,
    distanceKm - rule.base_distance_km,
  );

  // Calculate the unrounded regular fare.
  let unroundedFare = rule.base_fare;

  if (extraKm > 0) {
    const relevantBands = bands
      .filter((band) => {
        const upper =
          band.upper_distance_km ?? Number.POSITIVE_INFINITY;

        return (
          upper > rule.base_distance_km &&
          band.lower_distance_km < distanceKm
        );
      })
      .sort(
        (a, b) =>
          a.lower_distance_km - b.lower_distance_km,
      );

    let coveredTo = rule.base_distance_km;

    for (const band of relevantBands) {
      const upper =
        band.upper_distance_km ?? Number.POSITIVE_INFINITY;

      if (
        !Number.isFinite(band.lower_distance_km) ||
        !Number.isFinite(band.per_km_rate) ||
        band.lower_distance_km < 0 ||
        band.per_km_rate < 0 ||
        (band.upper_distance_km !== null &&
          (
            !Number.isFinite(band.upper_distance_km) ||
            band.upper_distance_km <= band.lower_distance_km
          ))
      ) {
        return null;
      }

      const from = Math.max(
        band.lower_distance_km,
        rule.base_distance_km,
      );

      const to = Math.min(upper, distanceKm);

      if (to <= from) {
        continue;
      }

      // A gap means some distance has no configured rate.
      if (from > coveredTo + DISTANCE_EPSILON) {
        return null;
      }

      // An overlap means the distance would be charged twice.
      if (from < coveredTo - DISTANCE_EPSILON) {
        return null;
      }

      unroundedFare +=
        (to - from) * band.per_km_rate;

      coveredTo = to;
    }

    // Do not estimate a fare if the bands fail to cover the trip.
    if (coveredTo < distanceKm - DISTANCE_EPSILON) {
      return null;
    }
  }

  // Apply the configured regular fare rounding step only after
  // the base and all succeeding-distance charges are calculated.
  const roundedRegularFare = roundFareToStep(
    unroundedFare,
    rule.rounding_step,
  );

  return {
    // Discounts use this rounded regular fare as their base.
    calculatedFare: roundedRegularFare,
    displayFare: roundedRegularFare,
    distanceKm,
    extraKm,
  };
}

export function calculateFareOptionEstimates(
  options: TransportFareOption[],
  distanceMeters: number,
): FareOptionEstimate[] {
  return options.map((option) => {
    const fare =
      option.variant.fare_model === "distance" &&
      option.fareRule
        ? calculateDistanceFare(
            option.fareRule,
            option.distanceBands,
            distanceMeters,
          )
        : null;

    const discounts: Record<
      PassengerCategory,
      DiscountEstimate | null
    > = {
      student: null,
      senior_citizen: null,
      pwd: null,
    };

    for (const category of PASSENGER_CATEGORIES) {
      const rule = option.discountRules.find(
        (item) => item.passenger_category === category,
      );

      discounts[category] =
        fare &&
        rule &&
        Number.isFinite(rule.discount_percent) &&
        rule.discount_percent > 0 &&
        rule.discount_percent <= 100
          ? calculateDiscountedFare(
              // This is the regular fare after rounding_step.
              fare.calculatedFare,
              rule.discount_percent,
            )
          : null;
    }

    return {
      option,
      fare,
      discounts,
    };
  });
}