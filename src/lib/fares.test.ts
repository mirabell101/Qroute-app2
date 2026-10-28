import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockResult {
  data: Record<string, unknown>[];
  error: null;
}

interface MockQuery extends PromiseLike<MockResult> {
  select(columns: string): MockQuery;
  eq(column: string, value: unknown): MockQuery;
  in(column: string, values: unknown[]): MockQuery;
  order(column: string, options?: { ascending?: boolean }): MockQuery;
}

function createQuery(rows: Record<string, unknown>[]): MockQuery {
  let filteredRows = [...rows];
  const query: MockQuery = {
    select: () => query,
    eq: (column, value) => {
      filteredRows = filteredRows.filter((row) => row[column] === value);
      return query;
    },
    in: (column, values) => {
      filteredRows = filteredRows.filter((row) => values.includes(row[column]));
      return query;
    },
    order: (column, options) => {
      const direction = options?.ascending === false ? -1 : 1;
      filteredRows.sort((a, b) => {
        const left = a[column];
        const right = b[column];
        if (left === right) return 0;
        if (typeof left === "number" && typeof right === "number") {
          return (left - right) * direction;
        }
        return String(left).localeCompare(String(right)) * direction;
      });
      return query;
    },
    then: (onFulfilled, onRejected) =>
      Promise.resolve({ data: filteredRows, error: null }).then(
        onFulfilled,
        onRejected
      ),
  };

  return query;
}

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn<(table: string) => MockQuery>(),
  tableRows: {} as Record<string, Record<string, unknown>[]>,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: mockSupabase,
}));

import { getTransportFareOptions } from "./fares";

describe("getTransportFareOptions", () => {
  beforeEach(() => {
    mockSupabase.tableRows = {
      transport_variants: [
        {
          id: 1,
          transport_type_id: 7,
          code: "traditional_jeepney",
          name: "Traditional jeepney",
          fare_model: "distance",
          is_active: true,
        },
        {
          id: 2,
          transport_type_id: 7,
          code: "modern_jeepney",
          name: "Modern jeepney",
          fare_model: "distance",
          is_active: true,
        },
        {
          id: 3,
          transport_type_id: 7,
          code: "inactive_variant",
          name: "Inactive variant",
          fare_model: "distance",
          is_active: false,
        },
      ],
      fare_rules: [
        {
          id: 10,
          variant_id: 1,
          fare_area_id: 4,
          base_fare: "14.00",
          base_distance_km: "4.00",
          per_km_rate: "2.00",
          rounding_step: "0.25",
          effective_from: "2026-10-27",
          effective_to: null,
          source_name: "Current area fare rule",
          source_url: null,
          verification_status: "verified",
          notes: null,
          is_deleted: false,
        },
        {
          id: 11,
          variant_id: 1,
          fare_area_id: 4,
          base_fare: "13.00",
          base_distance_km: "4.00",
          per_km_rate: "2.00",
          rounding_step: "0.25",
          effective_from: "2026-09-01",
          effective_to: "2026-10-27",
          source_name: "Expired fare rule",
          source_url: null,
          verification_status: "verified",
          notes: null,
          is_deleted: false,
        },
        {
          id: 12,
          variant_id: 1,
          fare_area_id: 99,
          base_fare: "99.00",
          base_distance_km: "4.00",
          per_km_rate: "9.00",
          rounding_step: "0.25",
          effective_from: "2026-10-01",
          effective_to: null,
          source_name: "Different area fare rule",
          source_url: null,
          verification_status: "verified",
          notes: null,
          is_deleted: false,
        },
        {
          id: 13,
          variant_id: 1,
          fare_area_id: 4,
          base_fare: "15.00",
          base_distance_km: "4.00",
          per_km_rate: "2.00",
          rounding_step: "0.25",
          effective_from: "2026-10-28",
          effective_to: null,
          source_name: "Future fare rule",
          source_url: null,
          verification_status: "verified",
          notes: null,
          is_deleted: false,
        },
        {
          id: 14,
          variant_id: 2,
          fare_area_id: 4,
          base_fare: "25.00",
          base_distance_km: "4.00",
          per_km_rate: "3.00",
          rounding_step: "0.25",
          effective_from: "2026-10-01",
          effective_to: null,
          source_name: "Deleted fare rule",
          source_url: null,
          verification_status: "verified",
          notes: null,
          is_deleted: true,
        },
        {
          id: 15,
          variant_id: 1,
          fare_area_id: 4,
          base_fare: "12.00",
          base_distance_km: "4.00",
          per_km_rate: "1.50",
          rounding_step: "0.25",
          effective_from: "2026-09-01",
          effective_to: null,
          source_name: "Older active fare rule",
          source_url: null,
          verification_status: "verified",
          notes: null,
          is_deleted: false,
        },
        {
          id: 16,
          variant_id: 2,
          fare_area_id: null,
          base_fare: "18.00",
          base_distance_km: "4.00",
          per_km_rate: "2.50",
          rounding_step: "0.25",
          effective_from: "2026-10-01",
          effective_to: null,
          source_name: "Unscoped fare rule",
          source_url: null,
          verification_status: "unverified",
          notes: null,
          is_deleted: false,
        },
      ],
      fare_rule_distance_bands: [
        {
          id: 30,
          fare_rule_id: 10,
          lower_distance_km: "4.00",
          upper_distance_km: null,
          per_km_rate: "2.00",
        },
      ],
      fare_discount_rules: [
        {
          id: 40,
          variant_id: 1,
          passenger_category: "student",
          discount_percent: "20.00",
          effective_from: "2026-10-27",
          effective_to: null,
          source_name: "Student discount law",
          source_url: "https://example.test/student",
          verification_status: "unverified",
          is_deleted: false,
        },
        {
          id: 41,
          variant_id: 1,
          passenger_category: "senior_citizen",
          discount_percent: "20.00",
          effective_from: "2026-01-01",
          effective_to: "2026-10-27",
          source_name: "Expired senior discount",
          source_url: "https://example.test/senior",
          verification_status: "verified",
          is_deleted: false,
        },
      ],
    };

    mockSupabase.from.mockImplementation((table) =>
      createQuery(mockSupabase.tableRows[table] ?? [])
    );
  });

  it("returns the latest current rule in the selected area and excludes deleted rules", async () => {
    const options = await getTransportFareOptions(7, 4, "2026-10-27");

    expect(options).toHaveLength(2);
    const traditional = options.find((item) => item.variant.id === 1);
    const modern = options.find((item) => item.variant.id === 2);

    expect(traditional?.fareRule?.id).toBe(10);
    expect(modern?.fareRule).toBeNull();
    expect(traditional?.distanceBands).toEqual([
      {
        id: 30,
        fare_rule_id: 10,
        lower_distance_km: 4,
        upper_distance_km: null,
        per_km_rate: 2,
      },
    ]);
  });

  it("includes the effective start date and excludes the effective end date", async () => {
    const options = await getTransportFareOptions(7, 4, "2026-10-27");
    const traditional = options.find((item) => item.variant.id === 1);

    expect(traditional?.fareRule?.id).toBe(10);
    expect(
      traditional?.discountRules.map((item) => item.passenger_category)
    ).toEqual(["student"]);
  });

  it("returns active variants without matching rates when route area is missing", async () => {
    const options = await getTransportFareOptions(7, null, "2026-10-27");

    expect(options.map((item) => item.variant.id).sort()).toEqual([1, 2]);
    expect(options.every((item) => item.fareRule === null)).toBe(true);
  });
});
