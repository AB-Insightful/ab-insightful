import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db.server", () => {
  return {
    default: {
      analysis: {
        findFirst: vi.fn(),
      },
      variant: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
  };
});

import db from "../../db.server";
import {
  getAnalysis,
  getVariantConversionRate,
  getImprovement,
} from "../../services/experiment.server";

describe("experiment.server segmented analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAnalysis", () => {
    it("requests the latest analysis row for the specified device segment", async () => {
      db.analysis.findFirst.mockResolvedValue({
        id: 1,
        experimentId: 2003,
        variantId: 3005,
        deviceSegment: "mobile",
        conversionRate: 0.12,
      });

      const result = await getAnalysis(2003, 3005, "mobile");

      expect(db.analysis.findFirst).toHaveBeenCalledWith({
        where: { experimentId: 2003, variantId: 3005, deviceSegment: "mobile" },
        orderBy: { calculatedWhen: "desc" },
        include: { goal: true },
      });

      expect(result).toEqual({
        id: 1,
        experimentId: 2003,
        variantId: 3005,
        deviceSegment: "mobile",
        conversionRate: 0.12,
      });
    });

    it('defaults to "all" when no segment is provided', async () => {
      db.analysis.findFirst.mockResolvedValue({
        id: 2,
        experimentId: 2003,
        variantId: 3005,
        deviceSegment: "all",
        conversionRate: 0.1,
      });

      await getAnalysis(2003, 3005);

      expect(db.analysis.findFirst).toHaveBeenCalledWith({
        where: { experimentId: 2003, variantId: 3005, deviceSegment: "all" },
        orderBy: { calculatedWhen: "desc" },
        include: { goal: true },
      });
    });
  });

  describe("getVariantConversionRate", () => {
    it("returns the conversion rate for the requested segment", async () => {
      db.analysis.findFirst.mockResolvedValue({
        conversionRate: 0.22,
      });

      const result = await getVariantConversionRate(2003, 3006, "desktop");

      expect(result).toBe(0.22);
      expect(db.analysis.findFirst).toHaveBeenCalledWith({
        where: {
          experimentId: 2003,
          variantId: 3006,
          deviceSegment: "desktop",
        },
        orderBy: { calculatedWhen: "desc" },
        include: { goal: true },
      });
    });

    it("returns null when no analysis row exists for that segment", async () => {
      db.analysis.findFirst.mockResolvedValue(null);

      const result = await getVariantConversionRate(2003, 3006, "mobile");

      expect(result).toBeNull();
    });
  });

  describe("getImprovement", () => {
    it("calculates improvement using only the requested segment", async () => {
      db.variant.findFirst.mockResolvedValue({
        id: 3005,
        name: "Control",
      });

      db.variant.findMany.mockResolvedValue([
        { id: 3006, name: "Variant A" },
        { id: 3007, name: "Variant B" },
      ]);

      db.analysis.findFirst
        // control, mobile
        .mockResolvedValueOnce({
          conversionRate: 0.1,
        })
        // variant A, mobile
        .mockResolvedValueOnce({
          conversionRate: 0.15,
        })
        // variant B, mobile
        .mockResolvedValueOnce({
          conversionRate: 0.12,
        });

      const result = await getImprovement(2003, "mobile");

      expect(result).toBeCloseTo(50, 10);
    });

    it("returns null when control analysis is missing for that segment", async () => {
      db.variant.findFirst.mockResolvedValue({
        id: 3005,
        name: "Control",
      });

      db.variant.findMany.mockResolvedValue([{ id: 3006, name: "Variant A" }]);

      db.analysis.findFirst.mockResolvedValueOnce(null);

      const result = await getImprovement(2003, "desktop");

      expect(result).toBeNull();
    });

    it("returns null when control conversion rate is zero", async () => {
      db.variant.findFirst.mockResolvedValue({
        id: 3005,
        name: "Control",
      });

      db.variant.findMany.mockResolvedValue([{ id: 3006, name: "Variant A" }]);

      db.analysis.findFirst.mockResolvedValueOnce({
        conversionRate: 0,
      });

      const result = await getImprovement(2003, "all");

      expect(result).toBeNull();
    });
  });
});
