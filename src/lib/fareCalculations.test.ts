import { describe, expect, it } from "vitest";

import type {
  FareDiscountRule,
  FareRule,
  RailFare,
  TransportFareOption,
} from "./fares";
import {
  buildFareCards,
  calculateFareOptionEstimates,
  calculateDiscountedFare,
  calculateDistanceFare,
  roundFareForDisplay,
} from "./fareCalculations";
import type { FareOptionEstimate } from "./fareCalculations";

const rule: FareRule = {
  id: 1,
  variant_id: 1,
  fare_area_id: null,
  base_fare: 14,
  base_distance_km: 4,
  per_km_rate: 2,
  rounding_step: 0.25,
  effective_from: "2026-01-01",
  effective_to: null,
  source_name: "Test fare source",
  source_url: null,
  verification_status: "verified",
  notes: null,
};

const studentDiscount: FareDiscountRule = {
  id: 1,
  variant_id: 1,
  passenger_category: "student",
  discount_percent: 20,
  effective_from: "2026-01-01",
  effective_to: null,
  source_name: "Student fare source",
  source_url: "https://example.test/student",
  verification_status: "verified",
};

const pwdDiscount: FareDiscountRule = {
  ...studentDiscount,
  id: 2,
  passenger_category: "pwd",
  source_name: "PWD fare source",
  source_url: "https://example.test/pwd",
  verification_status: "secondary",
};

function fareEstimate(
  variantId: number,
  variantName: string,
  calculatedFare: number | null,
  displayFare: number | null,
  discounts: FareOptionEstimate["discounts"] = {
    student: null,
    senior_citizen: null,
    pwd: null,
  },
  discountRules: FareDiscountRule[] = []
): FareOptionEstimate {
  return {
    option: {
      variant: {
        id: variantId,
        code: `variant-${variantId}`,
        name: variantName,
        fare_model: "distance",
      },
      fareRule: { ...rule, id: variantId, variant_id: variantId },
      distanceBands: [],
      discountRules,
    },
    fare:
      calculatedFare === null || displayFare === null
        ? null
        : {
            calculatedFare,
            displayFare,
            distanceKm: 6,
            extraKm: 2,
          },
    discounts,
  };
}

describe("calculateDistanceFare", () => {
  it("adds the rate for each succeeding-distance band", () => {
    const estimate = calculateDistanceFare(
      rule,
      [
        { lower_distance_km: 4, upper_distance_km: 5, per_km_rate: 2 },
        { lower_distance_km: 5, upper_distance_km: null, per_km_rate: 2.4 },
      ],
      6000
    );

    expect(estimate).toEqual({
      calculatedFare: 18.4,
      displayFare: 18,
      distanceKm: 6,
      extraKm: 2,
    });
  });

  it("returns no estimate when a required distance band is missing", () => {
    const estimate = calculateDistanceFare(
      rule,
      [
        { lower_distance_km: 4, upper_distance_km: 5, per_km_rate: 2 },
        { lower_distance_km: 5.5, upper_distance_km: null, per_km_rate: 2.4 },
      ],
      6000
    );

    expect(estimate).toBeNull();
  });

  it("returns no estimate when required distance bands overlap", () => {
    const estimate = calculateDistanceFare(
      rule,
      [
        { lower_distance_km: 4, upper_distance_km: 5.5, per_km_rate: 2 },
        { lower_distance_km: 5, upper_distance_km: null, per_km_rate: 2.4 },
      ],
      6000
    );

    expect(estimate).toBeNull();
  });

  it("rejects an overlap even when an earlier band covers the requested distance", () => {
    const estimate = calculateDistanceFare(
      rule,
      [
        { lower_distance_km: 4, upper_distance_km: 8, per_km_rate: 2 },
        { lower_distance_km: 5, upper_distance_km: null, per_km_rate: 2.4 },
      ],
      6000
    );

    expect(estimate).toBeNull();
  });

  it("does not charge a band beginning at the exact trip distance", () => {
    const estimate = calculateDistanceFare(
      rule,
      [
        { lower_distance_km: 4, upper_distance_km: 5, per_km_rate: 2 },
        { lower_distance_km: 5, upper_distance_km: null, per_km_rate: 2.4 },
      ],
      5000
    );

    expect(estimate?.calculatedFare).toBe(16);
  });
});

describe("fare display and passenger discounts", () => {
  it("applies the discount before rounding the displayed estimate", () => {
    const discount = calculateDiscountedFare(18.4, 20);

    expect(discount.calculatedFare).toBeCloseTo(14.72, 10);
    expect(discount.displayFare).toBe(15);
  });

  it("rounds positive display estimates to the nearest peso", () => {
    expect(roundFareForDisplay(1.49)).toBe(1);
    expect(roundFareForDisplay(1.5)).toBe(2);
    expect(roundFareForDisplay(1.51)).toBe(2);
  });
});

describe("calculateFareOptionEstimates", () => {
  it("calculates configured road variants and leaves missing or matrix fares unavailable", () => {
    const discount = {
      id: 1,
      variant_id: 1,
      passenger_category: "student" as const,
      discount_percent: 13.5,
      effective_from: "2026-01-01",
      effective_to: null,
      source_name: "Student fare source",
      source_url: "https://example.test/student",
      verification_status: "unverified" as const,
    };
    const options: TransportFareOption[] = [
      {
        variant: {
          id: 1,
          code: "traditional",
          name: "Traditional jeepney",
          fare_model: "distance",
        },
        fareRule: rule,
        distanceBands: [
          { lower_distance_km: 4, upper_distance_km: 5, per_km_rate: 2 },
          { lower_distance_km: 5, upper_distance_km: null, per_km_rate: 2.4 },
        ],
        discountRules: [discount],
      },
      {
        variant: {
          id: 2,
          code: "modern",
          name: "Modern jeepney",
          fare_model: "distance",
        },
        fareRule: null,
        distanceBands: [],
        discountRules: [{ ...discount, id: 2, variant_id: 2 }],
      },
      {
        variant: {
          id: 3,
          code: "rail",
          name: "Rail",
          fare_model: "matrix",
        },
        fareRule: { ...rule, id: 3, variant_id: 3 },
        distanceBands: [],
        discountRules: [{ ...discount, id: 3, variant_id: 3 }],
      },
      {
        variant: {
          id: 4,
          code: "incomplete",
          name: "Incomplete road fare",
          fare_model: "distance",
        },
        fareRule: { ...rule, id: 4, variant_id: 4 },
        distanceBands: [],
        discountRules: [{ ...discount, id: 4, variant_id: 4 }],
      },
    ];

    const estimates = calculateFareOptionEstimates(options, 6000);

    expect(estimates[0].discounts.student?.calculatedFare).toBeCloseTo(
      15.916,
      10
    );
    expect(
      estimates.map(({ option, fare, discounts }) => ({
        variant: option.variant.code,
        calculatedFare: fare?.calculatedFare ?? null,
        displayFare: fare?.displayFare ?? null,
        studentDiscount: discounts.student?.displayFare ?? null,
        seniorDiscount: discounts.senior_citizen?.displayFare ?? null,
        pwdDiscount: discounts.pwd?.displayFare ?? null,
      }))
    ).toEqual([
      {
        variant: "traditional",
        calculatedFare: 18.4,
        displayFare: 18,
        studentDiscount: 16,
        seniorDiscount: null,
        pwdDiscount: null,
      },
      {
        variant: "modern",
        calculatedFare: null,
        displayFare: null,
        studentDiscount: null,
        seniorDiscount: null,
        pwdDiscount: null,
      },
      {
        variant: "rail",
        calculatedFare: null,
        displayFare: null,
        studentDiscount: null,
        seniorDiscount: null,
        pwdDiscount: null,
      },
      {
        variant: "incomplete",
        calculatedFare: null,
        displayFare: null,
        studentDiscount: null,
        seniorDiscount: null,
        pwdDiscount: null,
      },
    ]);
  });
});

describe("buildFareCards", () => {
  it("groups current road estimates by Regular Student and PWD", () => {
    const estimates = [
      fareEstimate(
        1,
        "Traditional jeepney",
        18.4,
        18,
        {
          student: { calculatedFare: 14.72, displayFare: 15 },
          senior_citizen: null,
          pwd: { calculatedFare: 14.72, displayFare: 15 },
        },
        [studentDiscount, pwdDiscount]
      ),
    ];

    const cards = buildFareCards(estimates, null, null);

    expect(cards.map(({ category, label }) => ({ category, label }))).toEqual([
      { category: "regular", label: "Regular" },
      { category: "student", label: "Student" },
      { category: "pwd", label: "PWD" },
    ]);
    expect(cards.map((card) => card.options[0].amounts)).toEqual([
      [{ label: "", amount: 18 }],
      [{ label: "", amount: 15 }],
      [{ label: "", amount: 15 }],
    ]);
    expect(cards[1].options[0].sources[0]).toMatchObject({
      name: "Student fare source",
      status: "verified",
    });
    expect(cards[2].options[0].sources[0]).toMatchObject({
      name: "PWD fare source",
      status: "secondary",
    });
  });

  it("retains multiple transport variants in each passenger card", () => {
    const cards = buildFareCards(
      [
        fareEstimate(1, "Traditional jeepney", 18, 18),
        fareEstimate(2, "Modern jeepney", 21, 21),
      ],
      null,
      null
    );

    expect(cards[0].options.map(({ variantName, amounts }) => ({
      variantName,
      amounts,
    }))).toEqual([
      { variantName: "Traditional jeepney", amounts: [{ label: "", amount: 18 }] },
      { variantName: "Modern jeepney", amounts: [{ label: "", amount: 21 }] },
    ]);
  });

  it("marks missing rules and estimates unavailable", () => {
    const cards = buildFareCards(
      [
        fareEstimate(1, "Missing regular fare", null, null),
        fareEstimate(2, "No discount rule", 20, 20),
      ],
      null,
      null
    );

    expect(cards[0].options.map(({ amounts, unavailableReason }) => ({
      amounts,
      unavailableReason,
    }))).toEqual([
      {
        amounts: [{ label: "", amount: null }],
        unavailableReason: "Fare unavailable",
      },
      {
        amounts: [{ label: "", amount: 20 }],
        unavailableReason: null,
      },
    ]);
    expect(cards[1].options[1]).toMatchObject({
      amounts: [{ label: "", amount: null }],
      unavailableReason: "Discount unavailable — no configured rule",
    });
    expect(cards[2].options[1].unavailableReason).toBe(
      "Discount unavailable — no configured rule"
    );
  });

  it("uses only the selected rail route's matrix fares", () => {
    const railOption = fareEstimate(7, "Rail", null, null, {
      student: null,
      senior_citizen: null,
      pwd: null,
    });
    railOption.option.variant.fare_model = "matrix";
    railOption.option.fareRule = null;
    railOption.option.discountRules = [studentDiscount, pwdDiscount];
    const railFare: RailFare = {
      id: 9,
      route_id: 17,
      from_stop_id: 101,
      to_stop_id: 102,
      stored_value_fare: 28.5,
      single_journey_fare: 30,
      effective_from: "2026-01-01",
      effective_to: null,
      source_name: "Official rail fare source",
      source_url: "https://example.test/rail",
      verification_status: "verified",
    };

    const cards = buildFareCards([railOption], railFare, 7);

    expect(cards[0].options[0].amounts).toEqual([
      { label: "Stored value", amount: 28.5 },
      { label: "Single journey", amount: 30 },
    ]);
    expect(cards[0].options[0].sources[0].name).toBe(
      "Official rail fare source"
    );
  });
});
