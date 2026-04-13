import { describe, it, expect, vi, beforeEach } from "vitest";
/** 
coverage of the following functions from app.experiment.server.js:
getImprovement, updateProbabilityOfBest, setProbabilityOfBest, isExperimentActive 
**/
const { mockDb, betaFactoryMock } = vi.hoisted(() => ({
  mockDb: {
    experiment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    variant: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    analysis: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },

  // betaFactory.factory(alpha, beta) -> sampler fn
  betaFactoryMock: {
    factory: vi.fn(),
  },
}));

vi.mock("../db.server", () => ({
  default: mockDb,
}));

vi.mock("@stdlib/random-base-beta", () => ({
  default: betaFactoryMock,
}));

vi.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {},
    PrismaClientValidationError: class PrismaClientValidationError extends Error {},
    JsonNull: null,
  },
  ExperimentStatus: {
    draft: "draft",
    active: "active",
    paused: "paused",
    completed: "completed",
    archived: "archived",
  },
}));

import {
  getImprovement,
  updateProbabilityOfBest,
  setProbabilityOfBest,
  isExperimentActive,
} from "../services/experiment.server";

describe("experiment.server analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getImprovement", () => {
    it("returns null when Control variant does not exist", async () => {
      mockDb.variant.findFirst.mockResolvedValue(null);

      const result = await getImprovement(123);

      expect(result).toBeNull();
      expect(mockDb.variant.findFirst).toHaveBeenCalledWith({
        where: { experimentId: 123, name: "Control" },
        select: { id: true, name: true },
      });
    });

    it("returns null when there are no treatment variants", async () => {
      mockDb.variant.findFirst.mockResolvedValue({ id: 1, name: "Control" });
      mockDb.variant.findMany.mockResolvedValue([]);

      const result = await getImprovement(123);

      expect(result).toBeNull();
    });

    it("returns null when control conversion rate is invalid", async () => {
      mockDb.variant.findFirst.mockResolvedValue({ id: 1, name: "Control" });
      mockDb.variant.findMany.mockResolvedValue([{ id: 2, name: "Variant A" }]);

      // control analysis lookup
      mockDb.analysis.findFirst.mockResolvedValueOnce({
        conversionRate: 0,
        goal: { id: 10 },
      });

      const result = await getImprovement(123);

      expect(result).toBeNull();
    });

    it("returns null when no valid treatment rate is found", async () => {
      mockDb.variant.findFirst.mockResolvedValue({ id: 1, name: "Control" });
      mockDb.variant.findMany.mockResolvedValue([
        { id: 2, name: "Variant A" },
        { id: 3, name: "Variant B" },
      ]);

      mockDb.analysis.findFirst
        .mockResolvedValueOnce({ conversionRate: 0.25, goal: { id: 10 } }) // control
        .mockResolvedValueOnce(null) // variant A
        .mockResolvedValueOnce({ conversionRate: null, goal: { id: 10 } }); // variant B

      const result = await getImprovement(123);

      expect(result).toBeNull();
    });

    it("returns null when best treatment rate is outside valid range", async () => {
      mockDb.variant.findFirst.mockResolvedValue({ id: 1, name: "Control" });
      mockDb.variant.findMany.mockResolvedValue([{ id: 2, name: "Variant A" }]);

      mockDb.analysis.findFirst
        .mockResolvedValueOnce({ conversionRate: 0.2, goal: { id: 10 } }) // control
        .mockResolvedValueOnce({ conversionRate: 1.05, goal: { id: 10 } }); // invalid best

      const result = await getImprovement(123);

      expect(result).toBeNull();
    });

    it("calculates improvement using the best treatment variant", async () => {
      mockDb.variant.findFirst.mockResolvedValue({ id: 1, name: "Control" });
      mockDb.variant.findMany.mockResolvedValue([
        { id: 2, name: "Variant A" },
        { id: 3, name: "Variant B" },
      ]);

      mockDb.analysis.findFirst
        .mockResolvedValueOnce({ conversionRate: 0.1, goal: { id: 10 } }) // control
        .mockResolvedValueOnce({ conversionRate: 0.15, goal: { id: 10 } }) // A
        .mockResolvedValueOnce({ conversionRate: 0.3, goal: { id: 10 } }); // B best

      const result = await getImprovement(123);

      // ((0.3 - 0.1) / 0.1) * 100 = 200
      expect(result).toBeCloseTo(200);
    });

    it("passes through the requested device segment to analysis lookups", async () => {
      mockDb.variant.findFirst.mockResolvedValue({ id: 1, name: "Control" });
      mockDb.variant.findMany.mockResolvedValue([{ id: 2, name: "Variant A" }]);

      mockDb.analysis.findFirst
        .mockResolvedValueOnce({ conversionRate: 0.1, goal: { id: 10 } })
        .mockResolvedValueOnce({ conversionRate: 0.2, goal: { id: 10 } });

      await getImprovement(555, "mobile");

      expect(mockDb.analysis.findFirst).toHaveBeenNthCalledWith(1, {
        where: { experimentId: 555, variantId: 1, deviceSegment: "mobile" },
        orderBy: { calculatedWhen: "desc" },
        include: { goal: true },
      });

      expect(mockDb.analysis.findFirst).toHaveBeenNthCalledWith(2, {
        where: { experimentId: 555, variantId: 2, deviceSegment: "mobile" },
        orderBy: { calculatedWhen: "desc" },
        include: { goal: true },
      });
    });
  });

  describe("setProbabilityOfBest", () => {
    it("throws when the experiment is not found", async () => {
      mockDb.experiment.findUnique.mockResolvedValue(null);

      await expect(
        setProbabilityOfBest({
          experimentId: 42,
          goalId: 9,
          deviceSegment: "all",
        }),
      ).rejects.toThrow("Experiment with ID 42 not found");
    });

    it("returns reason when there are no analysis rows", async () => {
      mockDb.experiment.findUnique.mockResolvedValue({
        id: 42,
        analyses: [],
      });

      mockDb.analysis.findMany.mockResolvedValueOnce([]);

      const result = await setProbabilityOfBest({
        experimentId: 42,
        goalId: 9,
        deviceSegment: "all",
      });

      expect(result).toEqual({
        updated: 0,
        reason: "No Analysis rows found",
      });
    });

    it("returns undefined when fewer than two uncalculated rows exist", async () => {
      mockDb.experiment.findUnique.mockResolvedValue({
        id: 42,
        analyses: [{}],
      });

      // allAnalysisRows
      mockDb.analysis.findMany.mockResolvedValueOnce([
        { id: 1, variantId: 10, postAlpha: 5, postBeta: 10 },
      ]);

      // uncalculatedRows
      mockDb.analysis.findMany.mockResolvedValueOnce([
        { id: 1, variantId: 10, postAlpha: 5, postBeta: 10 },
      ]);

      const result = await setProbabilityOfBest({
        experimentId: 42,
        goalId: 9,
        deviceSegment: "all",
      });

      expect(result).toBeUndefined();
      expect(mockDb.analysis.update).not.toHaveBeenCalled();
    });

    it("returns reason when fewer than two valid posteriors remain after filtering", async () => {
      mockDb.experiment.findUnique.mockResolvedValue({
        id: 42,
        analyses: [{ id: 1 }, { id: 2 }],
      });

      mockDb.analysis.findMany
        .mockResolvedValueOnce([
          { id: 1, variantId: 10, postAlpha: 0, postBeta: 5 },
          { id: 2, variantId: 11, postAlpha: 2, postBeta: 2 },
        ]) // allAnalysisRows
        .mockResolvedValueOnce([
          {
            id: 1,
            variantId: 10,
            totalConversions: 0,
            totalUsers: 10,
            postAlpha: 0,
            postBeta: 5,
          },
          {
            id: 2,
            variantId: 11,
            totalConversions: 2,
            totalUsers: 10,
            postAlpha: 2,
            postBeta: 2,
          },
        ]); // uncalculatedRows

      const result = await setProbabilityOfBest({
        experimentId: 42,
        goalId: 9,
        deviceSegment: "all",
      });

      expect(result).toEqual({
        updated: null,
        reason: "Need at least two variants with posteriors",
      });
      expect(mockDb.analysis.update).not.toHaveBeenCalled();
    });

    it("updates each posterior row with probabilityOfBeingBest and expectedLoss", async () => {
      mockDb.experiment.findUnique.mockResolvedValue({
        id: 42,
        analyses: [{ id: 1 }, { id: 2 }],
      });

      const rowA = {
        id: 101,
        variantId: 201,
        totalConversions: 20,
        totalUsers: 100,
        postAlpha: 2,
        postBeta: 8,
      };
      const rowB = {
        id: 102,
        variantId: 202,
        totalConversions: 25,
        totalUsers: 100,
        postAlpha: 3,
        postBeta: 7,
      };

      mockDb.analysis.findMany
        .mockResolvedValueOnce([rowA, rowB]) // allAnalysisRows
        .mockResolvedValueOnce([rowA, rowB]); // uncalculatedRows

      // deterministic samplers
      const samplerA = vi.fn()
        .mockReturnValueOnce(0.2)
        .mockReturnValueOnce(0.3)
        .mockReturnValueOnce(0.4);

      const samplerB = vi.fn()
        .mockReturnValueOnce(0.8)
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.6);

      betaFactoryMock.factory
        .mockReturnValueOnce(samplerA)
        .mockReturnValueOnce(samplerB);

      await setProbabilityOfBest({
        experimentId: 42,
        goalId: 9,
        deviceSegment: "desktop",
        draws: 3,
      });

      expect(betaFactoryMock.factory).toHaveBeenCalledWith(2, 8);
      expect(betaFactoryMock.factory).toHaveBeenCalledWith(3, 7);

      expect(mockDb.analysis.update).toHaveBeenCalledTimes(2);

      const firstCall = mockDb.analysis.update.mock.calls[0][0];
      const secondCall = mockDb.analysis.update.mock.calls[1][0];

      expect(firstCall.where).toEqual({ id: 101 });
      expect(secondCall.where).toEqual({ id: 102 });

      // A loses every draw: prob 0, loss avg ((0.8-0.2)+(0.3-0.3)+(0.6-0.4))/3 = 0.266666...
      expect(firstCall.data.probabilityOfBeingBest).toBeCloseTo(1 / 3); // draw 2 tie-ish? no, B=0.1 A=0.3 => A wins there
      expect(firstCall.data.expectedLoss).toBeCloseTo((0.6 + 0 + 0.2) / 3);

      // B wins draws 1 and 3
      expect(secondCall.data.probabilityOfBeingBest).toBeCloseTo(2 / 3);
      expect(secondCall.data.expectedLoss).toBeCloseTo((0 + 0.2 + 0) / 3);

      expect(firstCall.data.calculatedWhen).toBeInstanceOf(Date);
      expect(secondCall.data.calculatedWhen).toBeInstanceOf(Date);
    });
  });

  describe("updateProbabilityOfBest", () => {
    it("runs setProbabilityOfBest logic across all experiments and three device segments", async () => {
      mockDb.experiment.findUnique.mockResolvedValue({
        id: 1,
        analyses: [{ id: 1 }, { id: 2 }],
      });

      const validRows = [
        {
          id: 1,
          variantId: 11,
          totalConversions: 10,
          totalUsers: 100,
          postAlpha: 2,
          postBeta: 8,
        },
        {
          id: 2,
          variantId: 12,
          totalConversions: 20,
          totalUsers: 100,
          postAlpha: 3,
          postBeta: 7,
        },
      ];

      // 2 experiments × 3 segments × 2 findMany calls inside setProbabilityOfBest = 12
      mockDb.analysis.findMany.mockImplementation(async () => validRows);
      mockDb.analysis.update.mockResolvedValue({});

      betaFactoryMock.factory.mockImplementation((alpha) => {
        // return stable but distinct samplers
        return alpha === 2 ? () => 0.25 : () => 0.75;
      });

      const experiments = [
        { id: 1001, goalId: 9001 },
        { id: 1002, goalId: 9002 },
      ];

      const result = await updateProbabilityOfBest(experiments);

      expect(result).toEqual(experiments);
      expect(mockDb.experiment.findUnique).toHaveBeenCalledTimes(6);
      expect(mockDb.analysis.findMany).toHaveBeenCalledTimes(12);
      expect(mockDb.analysis.update).toHaveBeenCalledTimes(12);

      expect(mockDb.experiment.findUnique).toHaveBeenNthCalledWith(1, {
        where: { id: 1001 },
        include: { analyses: true },
      });
    });
  });

  describe("isExperimentActive", () => {
    it("returns false for null experiment", () => {
      expect(isExperimentActive(null)).toBe(false);
    });

    it("returns false when status is not active", () => {
      expect(
        isExperimentActive({
          status: "draft",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-12-31T00:00:00.000Z"),
        }),
      ).toBe(false);
    });

    it("returns false when time is before startDate", () => {
      const experiment = {
        status: "active",
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        endDate: null,
      };

      expect(
        isExperimentActive(experiment, new Date("2026-05-01T00:00:00.000Z")),
      ).toBe(false);
    });

    it("returns false when time is after endDate", () => {
      const experiment = {
        status: "active",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-02-01T00:00:00.000Z"),
      };

      expect(
        isExperimentActive(experiment, new Date("2026-03-01T00:00:00.000Z")),
      ).toBe(false);
    });

    it("returns true when status is active and time is within the window", () => {
      const experiment = {
        status: "active",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
      };

      expect(
        isExperimentActive(experiment, new Date("2026-06-01T00:00:00.000Z")),
      ).toBe(true);
    });

    it("accepts a non-Date timeCheck value", () => {
      const experiment = {
        status: "active",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: null,
      };

      expect(isExperimentActive(experiment, "2026-06-01T00:00:00.000Z")).toBe(
        true,
      );
    });
  });
});