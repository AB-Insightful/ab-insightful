import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateMockSessions,
  getConversionsReportData,
  getSessionReportData,
} from "../services/analytics.server";

describe("analytics.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("getSessionReportData", () => {
    it("maps live session rows and totals them", async () => {
      const admin = {
        graphql: vi.fn().mockResolvedValue({
          json: vi.fn().mockResolvedValue({
            data: {
              shopifyqlQuery: {
                parseErrors: [],
                tableData: {
                  rows: [
                    { day: "2026-04-01", sessions: "12" },
                    { day: "2026-04-02", sessions: "7" },
                    { day: "2026-04-03", sessions: "bad" },
                  ],
                },
              },
            },
          }),
        }),
      };

      const result = await getSessionReportData(admin, "2026-04-01", "2026-04-03");

      expect(admin.graphql).toHaveBeenCalledOnce();
      expect(result).toEqual({
        sessions: [
          { date: "2026-04-01", count: 12 },
          { date: "2026-04-02", count: 7 },
          { date: "2026-04-03", count: 0 },
        ],
        total: 19,
      });
    });

    it("uses default dates when start and end are omitted", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-12T12:00:00.000Z"));

      const admin = {
        graphql: vi.fn().mockResolvedValue({
          json: vi.fn().mockResolvedValue({
            data: {
              shopifyqlQuery: {
                parseErrors: [],
                tableData: {
                  rows: [{ day: "2026-04-12", sessions: "1" }],
                },
              },
            },
          }),
        }),
      };

      await getSessionReportData(admin);

      const [, options] = admin.graphql.mock.calls[0];
      expect(options.variables.query).toContain("SINCE 2026-03-13");
      expect(options.variables.query).toContain("UNTIL 2026-04-12");
    });

    it("returns an empty payload when GraphQL errors are present", async () => {
      const admin = {
        graphql: vi.fn().mockResolvedValue({
          json: vi.fn().mockResolvedValue({
            errors: [{ message: "denied" }],
            data: {
              shopifyqlQuery: {
                parseErrors: [],
                tableData: { rows: [] },
              },
            },
          }),
        }),
      };

      await expect(
        getSessionReportData(admin, "2026-04-01", "2026-04-01"),
      ).resolves.toEqual({ sessions: [], total: 0 });
    });

    it("returns an empty payload when ShopifyQL parseErrors exist", async () => {
      const admin = {
        graphql: vi.fn().mockResolvedValue({
          json: vi.fn().mockResolvedValue({
            data: {
              shopifyqlQuery: {
                parseErrors: ["bad query"],
                tableData: { rows: [] },
              },
            },
          }),
        }),
      };

      await expect(
        getSessionReportData(admin, "2026-04-01", "2026-04-01"),
      ).resolves.toEqual({ sessions: [], total: 0 });
    });

    it("returns an empty payload when live rows are empty", async () => {
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

      await expect(
        getSessionReportData(admin, "2026-04-01", "2026-04-01"),
      ).resolves.toEqual({ sessions: [], total: 0 });
    });
  });

  describe("generateMockSessions", () => {
    it("builds deterministic daily mock sessions and totals them", () => {
      vi.spyOn(Math, "random").mockReturnValue(0);

      const result = generateMockSessions("2026-04-01", "2026-04-03");

      expect(result).toEqual({
        sessions: [
          { date: "2026-04-01", count: 40 },
          { date: "2026-04-02", count: 40 },
          { date: "2026-04-03", count: 40 },
        ],
        total: 120,
      });
    });

    it("caps generation at 100 rows", () => {
      vi.spyOn(Math, "random").mockReturnValue(0);

      const result = generateMockSessions("2025-01-01", "2026-12-31");

      expect(result.sessions).toHaveLength(100);
      expect(result.total).toBe(4000);
    });
  });

  describe("getConversionsReportData", () => {
    it("maps live conversion rows and totals them", async () => {
      const admin = {
        graphql: vi.fn().mockResolvedValue({
          json: vi.fn().mockResolvedValue({
            data: {
              shopifyqlQuery: {
                parseErrors: [],
                tableData: {
                  rows: [
                    ["2026-04-01", "3"],
                    ["2026-04-02", "5"],
                    ["2026-04-03", "0"],
                  ],
                },
              },
            },
          }),
        }),
      };

      const result = await getConversionsReportData(admin, "2026-04-01", "2026-04-03");

      expect(result).toEqual({
        sessions: [
          { date: "2026-04-01", count: 3 },
          { date: "2026-04-02", count: 5 },
          { date: "2026-04-03", count: 0 },
        ],
        total: 8,
      });
    });

    it("uses default dates for conversion queries when omitted", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-12T12:00:00.000Z"));

      const admin = {
        graphql: vi.fn().mockResolvedValue({
          json: vi.fn().mockResolvedValue({
            data: {
              shopifyqlQuery: {
                parseErrors: [],
                tableData: {
                  rows: [["2026-04-12", "1"]],
                },
              },
            },
          }),
        }),
      };

      await getConversionsReportData(admin);

      const [, options] = admin.graphql.mock.calls[0];
      expect(options.variables.query).toContain("SINCE 2026-03-13");
      expect(options.variables.query).toContain("UNTIL 2026-04-12");
    });

    it("returns an empty payload when conversion GraphQL errors are present", async () => {
      const admin = {
        graphql: vi.fn().mockResolvedValue({
          json: vi.fn().mockResolvedValue({
            errors: [{ message: "denied" }],
            data: {
              shopifyqlQuery: {
                parseErrors: [],
                tableData: { rows: [] },
              },
            },
          }),
        }),
      };

      await expect(
        getConversionsReportData(admin, "2026-04-01", "2026-04-01"),
      ).resolves.toEqual({ sessions: [], total: 0 });
    });

    it("returns an empty payload when conversion parseErrors exist", async () => {
      const admin = {
        graphql: vi.fn().mockResolvedValue({
          json: vi.fn().mockResolvedValue({
            data: {
              shopifyqlQuery: {
                parseErrors: ["bad query"],
                tableData: { rows: [] },
              },
            },
          }),
        }),
      };

      await expect(
        getConversionsReportData(admin, "2026-04-01", "2026-04-01"),
      ).resolves.toEqual({ sessions: [], total: 0 });
    });

    it("returns an empty payload when conversion rows are empty", async () => {
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

      await expect(
        getConversionsReportData(admin, "2026-04-01", "2026-04-01"),
      ).resolves.toEqual({ sessions: [], total: 0 });
    });
  });
});