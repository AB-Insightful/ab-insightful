import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConversionsReportData } from "../services/conversions.server";

describe("conversions.server -> getConversionsReportData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("maps live ShopifyQL rows and computes total + conversionRate branches", async () => {
    const admin = {
      graphql: vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          data: {
            shopifyqlQuery: {
              parseErrors: [],
              tableData: {
                rows: [
                  {
                    day: "2026-04-01",
                    sessions: "10",
                    sessions_with_cart_additions: "5",
                    sessions_that_reached_checkout: "4",
                    sessions_that_completed_checkout: "2",
                    conversion_rate: "25",
                  },
                  {
                    day: "2026-04-02",
                    sessions: "20",
                    sessions_with_cart_additions: "10",
                    sessions_that_reached_checkout: "8",
                    sessions_that_completed_checkout: "6",
                    conversion_rate: "0",
                  },
                  {
                    day: "2026-04-03",
                    sessions: "0",
                    sessions_with_cart_additions: "0",
                    sessions_that_reached_checkout: "0",
                    sessions_that_completed_checkout: "0",
                    conversion_rate: "0",
                  },
                ],
              },
            },
          },
        }),
      }),
    };

    const result = await getConversionsReportData(admin, "2026-04-01", "2026-04-03");

    expect(admin.graphql).toHaveBeenCalledOnce();
    expect(result).toEqual({
      sessions: [
        {
          date: "2026-04-01",
          count: 2,
          sessions: 10,
          addedToCart: 5,
          reachedCheckout: 4,
          completedCheckout: 2,
          conversionRate: 25,
        },
        {
          date: "2026-04-02",
          count: 6,
          sessions: 20,
          addedToCart: 10,
          reachedCheckout: 8,
          completedCheckout: 6,
          conversionRate: 30,
        },
        {
          date: "2026-04-03",
          count: 0,
          sessions: 0,
          addedToCart: 0,
          reachedCheckout: 0,
          completedCheckout: 0,
          conversionRate: 0,
        },
      ],
      total: 8,
    });
  });

  it("uses default date range when start/end are missing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T12:00:00.000Z"));

    const admin = {
      graphql: vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          data: {
            shopifyqlQuery: {
              parseErrors: [],
              tableData: { rows: [] },
            },
          },
        }),
      }),
    };

    await getConversionsReportData(admin);

    const [, options] = admin.graphql.mock.calls[0];
    expect(options.variables.query).toContain("SINCE 2026-03-12");
    expect(options.variables.query).toContain("UNTIL 2026-04-11");
  });

  it("falls back to mock data when response has GraphQL errors", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const admin = {
      graphql: vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          errors: [{ message: "No permission" }],
          data: {
            shopifyqlQuery: {
              parseErrors: [],
              tableData: { rows: [] },
            },
          },
        }),
      }),
    };

    const result = await getConversionsReportData(admin, "2026-04-01", "2026-04-01");

    expect(result).toEqual({
      sessions: [
        {
          date: "2026-04-01",
          count: 0,
          sessions: 40,
          addedToCart: 6,
          reachedCheckout: 3,
          completedCheckout: 0,
          conversionRate: 0,
        },
      ],
      total: 0,
    });
  });

  it("falls back to mock data when ShopifyQL parseErrors exist", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const admin = {
      graphql: vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          data: {
            shopifyqlQuery: {
              parseErrors: ["Invalid field in query"],
              tableData: { rows: [] },
            },
          },
        }),
      }),
    };

    const result = await getConversionsReportData(admin, "2026-04-02", "2026-04-02");

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].date).toBe("2026-04-02");
  });

  it("falls back to mock data when live rows are empty", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const admin = {
      graphql: vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          data: {
            shopifyqlQuery: {
              parseErrors: [],
              tableData: { rows: [] },
            },
          },
        }),
      }),
    };

    const result = await getConversionsReportData(admin, "2026-04-03", "2026-04-03");

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({ date: "2026-04-03", sessions: 40 });
  });

  it("limits fallback generation to 100 rows for long ranges", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const admin = {
      graphql: vi.fn().mockRejectedValue(new Error("network down")),
    };

    const result = await getConversionsReportData(admin, "2025-01-01", "2026-12-31");

    expect(result.sessions).toHaveLength(100);
    expect(result.total).toBe(0);
  });
});
