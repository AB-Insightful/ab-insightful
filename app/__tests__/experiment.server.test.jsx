// app/__tests__/experiment.server.test.js
// Assumptions:
// - @prisma/client is mocked so Prisma error classes can be used with instanceof checks.
// - Dates are controlled with fake timers to keep tests deterministic.

import { Prisma, ExperimentStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import db from "../db.server";
import * as experimentServer from "../services/experiment.server";
import {
  experimentListReport,
  getAnalysis,
  getCandidatesForScheduledEnd,
  getCandidatesForScheduledStart,
  getExperimentById,
  getExperimentReportData,
  getExperimentsList,
  getExperimentsWithAnalyses,
  getMostRecentExperiment,
  getNameOfExpGoal,
  getVariant,
  isExperimentActive,
  getCandidatesForStableSuccessEnd,
  getVariantConversionRate,
  getImprovement,
  createExperiment,
  pauseExperiment,
  resumeExperiment,
  startExperiment,
  deleteExperiment,
} from "../services/experiment.server";

vi.mock("../db.server", () => {
  return {
    default: {
      experiment: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      analysis: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      variant: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
  };
});

vi.mock("@prisma/client", () => {
  class PrismaClientKnownRequestError extends Error {}
  class PrismaClientValidationError extends Error {}

  return {
    Prisma: {
      PrismaClientKnownRequestError,
      PrismaClientValidationError,
    },
    ExperimentStatus: {
      active: "active",
      draft: "draft",
      paused: "paused",
      completed: "completed",
      archived: "archived",
    },
  };
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("getCandidatesForScheduledEnd", () => {
  test("success: queries active experiments with endDate <= now and returns list", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-03T12:00:00.000Z"));

    db.experiment.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

    const result = await getCandidatesForScheduledEnd();

    expect(db.experiment.findMany).toHaveBeenCalledTimes(1);

    const arg = db.experiment.findMany.mock.calls[0][0];
    expect(arg.where.status).toBe(ExperimentStatus.active);
    expect(arg.where.endDate.lte).toBeInstanceOf(Date);
    expect(arg.where.endDate.lte.toISOString()).toBe("2026-03-03T12:00:00.000Z");

    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test("failure: PrismaClientKnownRequestError returns { error: message }", async () => {
    const err = new Prisma.PrismaClientKnownRequestError("known error");
    db.experiment.findMany.mockRejectedValueOnce(err);

    const result = await getCandidatesForScheduledEnd();

    expect(result).toEqual({ error: "known error" });
    expect(console.error).toHaveBeenCalled();
  });

  test("failure: PrismaClientValidationError returns { error: message }", async () => {
    const err = new Prisma.PrismaClientValidationError("validation error");
    db.experiment.findMany.mockRejectedValueOnce(err);

    const result = await getCandidatesForScheduledEnd();

    expect(result).toEqual({ error: "validation error" });
    expect(console.error).toHaveBeenCalled();
  });
});

describe("getCandidatesForScheduledStart", () => {
  test("success: queries draft experiments with startDate <= now and returns list", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-03T12:00:00.000Z"));

    db.experiment.findMany.mockResolvedValueOnce([{ id: 10 }]);

    const result = await getCandidatesForScheduledStart();

    expect(db.experiment.findMany).toHaveBeenCalledTimes(1);

    const arg = db.experiment.findMany.mock.calls[0][0];
    expect(arg.where.status).toBe(ExperimentStatus.draft);
    expect(arg.where.startDate.lte).toBeInstanceOf(Date);
    expect(arg.where.startDate.lte.toISOString()).toBe(
      "2026-03-03T12:00:00.000Z",
    );

    expect(result).toEqual([{ id: 10 }]);
  });

  describe("getCandidatesForStableSuccessEnd", () => {
    test("success: returns experiments where a variant has SMA >= 80% and beats control", async () => {
      // Mock the active experiment
      db.experiment.findMany.mockResolvedValueOnce([
        {
          id: "exp_1",
          variants: [
            { id: "v_ctrl", name: "Control" },
            { id: "v_treat", name: "Variant B" },
          ],
        },
      ]);
  
      // Mock Variant History: 3 days of high probability (Average = 0.9)
      // Most recent conversion rate: 0.15
      db.analysis.findMany.mockResolvedValueOnce([
        { probabilityOfBeingBest: 0.9, conversionRate: 0.15 },
        { probabilityOfBeingBest: 0.9, conversionRate: 0.14 },
        { probabilityOfBeingBest: 0.9, conversionRate: 0.13 },
      ]);
  
      // Mock Control History: Most recent conversion rate: 0.10
      db.analysis.findMany.mockResolvedValueOnce([
        { probabilityOfBeingBest: 0.05, conversionRate: 0.10 },
        { probabilityOfBeingBest: 0.05, conversionRate: 0.11 },
        { probabilityOfBeingBest: 0.05, conversionRate: 0.12 },
      ]);
  
      const result = await getCandidatesForStableSuccessEnd();
  
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("exp_1");
    });
  
    test("failure: returns empty if SMA is high but conversion rate is lower than control", async () => {
      db.experiment.findMany.mockResolvedValueOnce([
        {
          id: "exp_2",
          variants: [
            { id: "v_ctrl", name: "Control" },
            { id: "v_treat", name: "Variant B" },
          ],
        },
      ]);
  
      // High SMA (1.0) but variant (0.05) is currently LOSING to control (0.10)
      db.analysis.findMany.mockResolvedValueOnce([
        { probabilityOfBeingBest: 1.0, conversionRate: 0.05 },
        { probabilityOfBeingBest: 1.0, conversionRate: 0.05 },
        { probabilityOfBeingBest: 1.0, conversionRate: 0.05 },
      ]);
      db.analysis.findMany.mockResolvedValueOnce([
        { probabilityOfBeingBest: 0.0, conversionRate: 0.10 },
        { probabilityOfBeingBest: 0.0, conversionRate: 0.10 },
        { probabilityOfBeingBest: 0.0, conversionRate: 0.10 },
      ]);
  
      const result = await getCandidatesForStableSuccessEnd();
      expect(result).toHaveLength(0);
    });
  
    test("failure: returns empty if history has fewer than 3 entries", async () => {
      db.experiment.findMany.mockResolvedValueOnce([
        {
          id: "exp_3",
          variants: [{ id: "c", name: "Control" }, { id: "v", name: "V" }],
        },
      ]);
  
      // Only 2 days of data
      db.analysis.findMany.mockResolvedValueOnce([{ probabilityOfBeingBest: 1.0 }, { probabilityOfBeingBest: 1.0 }]);
      db.analysis.findMany.mockResolvedValueOnce([{ probabilityOfBeingBest: 0.0 }, { probabilityOfBeingBest: 0.0 }]);
  
      const result = await getCandidatesForStableSuccessEnd();
      expect(result).toHaveLength(0);
    });
  });

  test("failure: PrismaClientKnownRequestError returns { error: message }", async () => {
    const err = new Prisma.PrismaClientKnownRequestError("known error");
    db.experiment.findMany.mockRejectedValueOnce(err);

    const result = await getCandidatesForScheduledStart();

    expect(result).toEqual({ error: "known error" });
    expect(console.error).toHaveBeenCalled();
  });

  test("failure: PrismaClientValidationError returns { error: message }", async () => {
    const err = new Prisma.PrismaClientValidationError("validation error");
    db.experiment.findMany.mockRejectedValueOnce(err);

    const result = await getCandidatesForScheduledStart();

    expect(result).toEqual({ error: "validation error" });
    expect(console.error).toHaveBeenCalled();
  });
});

describe("getExperimentReportData", () => {
  test("success: queries experiment by id with analyses, variants, and experimentGoals.goal included", async () => {
    const mockExperiment = {
      id: 42,
      name: "Homepage Hero Test",
      analyses: [
        {
          id: 100,
          deviceSegment: "mobile",
          variant: { id: 1, name: "Control" },
          goal: { id: 7, name: "Completed Checkout" },
        },
      ],
      variants: [
        { id: 1, name: "Control" },
        { id: 2, name: "Variant A" },
      ],
      experimentGoals: [
        {
          goal: { id: 7, name: "Completed Checkout" },
        },
      ],
    };

    db.experiment.findUnique.mockResolvedValueOnce(mockExperiment);

    const result = await getExperimentReportData(42, "mobile");

    expect(db.experiment.findUnique).toHaveBeenCalledTimes(1);
    expect(db.experiment.findUnique).toHaveBeenCalledWith({
      where: {
        id: 42,
      },
      include: {
        analyses: {
          where: { deviceSegment: "mobile" },
          include: {
            variant: true,
            goal: true,
          },
          orderBy: { calculatedWhen: "desc" },
        },
        variants: true,
        experimentGoals: {
          include: {
            goal: true,
          },
        },
      },
    });

    expect(result).toEqual(mockExperiment);
  });

  test("success: defaults deviceSegment to all when omitted", async () => {
    db.experiment.findUnique.mockResolvedValueOnce({ id: 99 });

    await getExperimentReportData(99);

    expect(db.experiment.findUnique).toHaveBeenCalledWith({
      where: {
        id: 99,
      },
      include: {
        analyses: {
          where: { deviceSegment: "all" },
          include: {
            variant: true,
            goal: true,
          },
          orderBy: { calculatedWhen: "desc" },
        },
        variants: true,
        experimentGoals: {
          include: {
            goal: true,
          },
        },
      },
    });
  });

  test("returns null when experiment is not found", async () => {
    db.experiment.findUnique.mockResolvedValueOnce(null);

    const result = await getExperimentReportData(404, "all");

    expect(result).toBeNull();
  });
});

describe("getExperimentsList", () => {
  const listInclude = {
    include: {
      analyses: {
        include: {
          variant: true,
        },
      },
      project: {
        select: { maxUsersPerExperiment: true },
      },
      history: true,
    },
  };

  test("happy path: returns experiments with analyses, project, and history included", async () => {
    const rows = [
      {
        id: 1,
        name: "Exp A",
        analyses: [{ id: 10, variant: { id: 1, name: "Control" } }],
        project: { maxUsersPerExperiment: 500 },
        history: [],
      },
    ];
    db.experiment.findMany.mockResolvedValueOnce(rows);

    const result = await getExperimentsList();

    expect(db.experiment.findMany).toHaveBeenCalledTimes(1);
    expect(db.experiment.findMany).toHaveBeenCalledWith(listInclude);
    expect(result).toEqual(rows);
  });

  test("empty results: returns [] when findMany returns no experiment rows", async () => {
    db.experiment.findMany.mockResolvedValueOnce([]);

    const result = await getExperimentsList();

    expect(db.experiment.findMany).toHaveBeenCalledWith(listInclude);
    expect(result).toEqual([]);
  });

  test("not found / edge: passes through null when findMany resolves to null", async () => {
    db.experiment.findMany.mockResolvedValueOnce(null);

    const result = await getExperimentsList();

    expect(db.experiment.findMany).toHaveBeenCalledWith(listInclude);
    expect(result).toBeNull();
  });
});

describe("getVariant", () => {
  test("happy path: returns variant id and name for experiment and name", async () => {
    const row = { id: 2, name: "Variant A" };
    db.variant.findFirst.mockResolvedValueOnce(row);

    const result = await getVariant(42, "Variant A");

    expect(db.variant.findFirst).toHaveBeenCalledWith({
      where: { experimentId: 42, name: "Variant A" },
      select: { id: true, name: true },
    });
    expect(result).toEqual(row);
  });

  test("empty results: returns null when no variant row matches the filter", async () => {
    db.variant.findFirst.mockResolvedValueOnce(null);

    const result = await getVariant(42, "Variant A");
    expect(db.variant.findFirst).toHaveBeenCalledWith({
      where: { experimentId: 42, name: "Variant A" },
      select: { id: true, name: true },
    });
    expect(result).toBeNull();
  });

  test("not found: returns null when variant name does not exist for that experiment", async () => {
    db.variant.findFirst.mockResolvedValueOnce(null);

    const result = await getVariant(42, "Nonexistent");

    expect(db.variant.findFirst).toHaveBeenCalledWith({
      where: { experimentId: 42, name: "Nonexistent" },
      select: { id: true, name: true },
    });
    expect(result).toBeNull();
  });
});

describe("getAnalysis", () => {
  const analysisQuery = {
    orderBy: { calculatedWhen: "desc" },
    include: { goal: true },
  };

  test("happy path: returns latest analysis with goal and respects deviceSegment (default all)", async () => {
    const row = {
      id: 100,
      experimentId: 1,
      variantId: 2,
      deviceSegment: "mobile",
      conversionRate: 0.12,
      goal: { id: 7, name: "Purchase" },
    };
    db.analysis.findFirst.mockResolvedValueOnce(row);

    const result = await getAnalysis(1, 2, "mobile");

    expect(db.analysis.findFirst).toHaveBeenCalledWith({
      where: { experimentId: 1, variantId: 2, deviceSegment: "mobile" },
      ...analysisQuery,
    });
    expect(result).toEqual(row);

    db.analysis.findFirst.mockResolvedValueOnce({ id: 1, goal: { id: 1, name: "A" } });
    await getAnalysis(5, 3);

    expect(db.analysis.findFirst).toHaveBeenCalledWith({
      where: { experimentId: 5, variantId: 3, deviceSegment: "all" },
      ...analysisQuery,
    });
  });

  test("empty results: returns null when no analysis row exists for variant and segment", async () => {
    db.analysis.findFirst.mockResolvedValueOnce(null);

    const result = await getAnalysis(1, 2, "mobile");

    expect(db.analysis.findFirst).toHaveBeenCalledWith({
      where: { experimentId: 1, variantId: 2, deviceSegment: "mobile" },
      ...analysisQuery,
    });
    expect(result).toBeNull();
  });

  test("not found: returns null when ids or segment do not match any stored analysis", async () => {
    db.analysis.findFirst.mockResolvedValueOnce(null);

    const result = await getAnalysis(999, 888, "desktop");

    expect(db.analysis.findFirst).toHaveBeenCalledWith({
      where: {
        experimentId: 999,
        variantId: 888,
        deviceSegment: "desktop",
      },
      ...analysisQuery,
    });
    expect(result).toBeNull();
  });
});

describe("getExperimentById", () => {
  test("happy path: returns experiment when found", async () => {
    const experiment = { id: 7, name: "Homepage" };
    db.experiment.findUnique.mockResolvedValueOnce(experiment);

    const result = await getExperimentById(7);

    expect(db.experiment.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
    });
    expect(result).toEqual(experiment);
  });

  test("empty / missing id: returns null without querying when id is falsy", async () => {
    expect(await getExperimentById(null)).toBeNull();
    expect(await getExperimentById(undefined)).toBeNull();
    expect(await getExperimentById(0)).toBeNull();

    expect(db.experiment.findUnique).not.toHaveBeenCalled();
  });

  test("not found: returns null when id is valid but no experiment exists", async () => {
    db.experiment.findUnique.mockResolvedValueOnce(null);

    const result = await getExperimentById(404);

    expect(db.experiment.findUnique).toHaveBeenCalledWith({
      where: { id: 404 },
    });
    expect(result).toBeNull();
  });
});

describe("getMostRecentExperiment", () => {
  test("returns the newest active experiment", async () => {
    const row = { id: 5, name: "Latest", status: "active" };
    db.experiment.findFirst.mockResolvedValueOnce(row);

    const result = await getMostRecentExperiment();

    expect(db.experiment.findFirst).toHaveBeenCalledWith({
      where: { status: ExperimentStatus.active },
      orderBy: { createdAt: "desc" },
    });
    expect(result).toEqual(row);
  });

  test("returns null when no active experiment exists", async () => {
    db.experiment.findFirst.mockResolvedValueOnce(null);

    const result = await getMostRecentExperiment();

    expect(result).toBeNull();
  });
});

describe("getNameOfExpGoal", () => {
  test("returns analysis row with goal for experiment id", async () => {
    const row = {
      id: 1,
      experimentId: 42,
      goal: { id: 7, name: "Purchase" },
    };
    db.analysis.findFirst.mockResolvedValueOnce(row);

    const result = await getNameOfExpGoal(42);

    expect(db.analysis.findFirst).toHaveBeenCalledWith({
      where: { experimentId: 42, deviceSegment: "all" },
      include: { goal: true },
    });
    expect(result).toEqual(row);
  });

  test("returns null when no analysis exists", async () => {
    db.analysis.findFirst.mockResolvedValueOnce(null);

    const result = await getNameOfExpGoal(99);

    expect(result).toBeNull();
  });
});

describe("getExperimentsWithAnalyses", () => {
  test("returns experiments that have analyses with project and nested relations", async () => {
    const rows = [
      {
        id: 1,
        project: { id: 10, maxUsersPerExperiment: 1000 },
        analyses: [
          {
            id: 100,
            variant: { id: 1, name: "Control" },
            goal: { id: 7, name: "Checkout" },
          },
        ],
      },
    ];
    db.experiment.findMany.mockResolvedValueOnce(rows);

    const result = await getExperimentsWithAnalyses();

    expect(db.experiment.findMany).toHaveBeenCalledWith({
      where: {
        analyses: { some: {} },
      },
      include: {
        project: true,
        analyses: {
          include: {
            variant: true,
            goal: true,
          },
          orderBy: { calculatedWhen: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(result).toEqual(rows);
  });

  test("returns empty array when no experiments have analyses", async () => {
    db.experiment.findMany.mockResolvedValueOnce([]);

    const result = await getExperimentsWithAnalyses();

    expect(result).toEqual([]);
  });
});

describe("isExperimentActive", () => {
  test("returns false when experiment is null", () => {
    expect(isExperimentActive(null)).toBe(false);
  });

  test("returns false when status is not active", () => {
    const experiment = {
      status: "draft",
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-10T00:00:00.000Z"),
    };

    expect(isExperimentActive(experiment, new Date("2026-03-05T00:00:00.000Z"))).toBe(false);
  });

  test("returns false when active experiment startDate is in the future", () => {
    const experiment = {
      status: "active",
      startDate: new Date("2026-03-10T00:00:00.000Z"),
      endDate: new Date("2026-03-20T00:00:00.000Z"),
    };

    expect(isExperimentActive(experiment, new Date("2026-03-05T00:00:00.000Z"))).toBe(false);
  });

  test("returns false when active experiment endDate is in the past", () => {
    const experiment = {
      status: "active",
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-04T00:00:00.000Z"),
    };

    expect(isExperimentActive(experiment, new Date("2026-03-05T00:00:00.000Z"))).toBe(false);
  });

  test("returns true when experiment is active and current time is within range", () => {
    const experiment = {
      status: "active",
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-10T00:00:00.000Z"),
    };

    expect(isExperimentActive(experiment, new Date("2026-03-05T00:00:00.000Z"))).toBe(true);
  });

  test("accepts a string timeCheck and still evaluates correctly", () => {
    const experiment = {
      status: "active",
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-10T00:00:00.000Z"),
    };

    expect(isExperimentActive(experiment, "2026-03-05T00:00:00.000Z")).toBe(true);
  });
});

describe("experimentListReport", () => {
  test("success: returns experiments with report fields ordered by createdAt desc", async () => {
    const mockExperiments = [
      {
        id: 1,
        name: "Test Experiment",
        status: "active",
        startDate: new Date("2026-01-01"),
        endDate: null,
        endCondition: "Manual",
        analyses: [
          {
            totalConversions: 50,
            totalUsers: 500,
            calculatedWhen: new Date("2026-01-15"),
          },
        ],
      },
    ];
    db.experiment.findMany.mockResolvedValueOnce(mockExperiments);

    const result = await experimentListReport();

    expect(db.experiment.findMany).toHaveBeenCalledTimes(1);
    const arg = db.experiment.findMany.mock.calls[0][0];
    expect(arg.select).toMatchObject({
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      endCondition: true,
    });
    expect(arg.select.history).toEqual({
      select: {
        prevStatus: true,
        newStatus: true,
        changedAt: true,
      },
      orderBy: {
        changedAt: "asc",
      },
    });
    expect(arg.select.analyses).toEqual({
      select: {
        totalConversions: true,
        totalUsers: true,
        calculatedWhen: true,
      },
      where: {
        deviceSegment: "all",
      },
      orderBy: {
        calculatedWhen: "desc",
      },
    });
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
    expect(result).toEqual(mockExperiments);
  });

  test("returns null when no experiments found", async () => {
    db.experiment.findMany.mockResolvedValueOnce([]); //pretends to return [] on db query

    const result = await experimentListReport();

    expect(result).toEqual([]);
  });

  test("returns empty array when experiments is empty", async () => {
    db.experiment.findMany.mockResolvedValueOnce([]);

    const result = await experimentListReport();

    expect(result).toEqual([]);
  });
});

describe("getVariantConversionRate", () => {
  test("returns null when no analysis row exists", async () => {
    db.analysis.findFirst.mockResolvedValueOnce(null);

    const result = await getVariantConversionRate(1, 2, "all");

    expect(result).toBeNull();
    expect(db.analysis.findFirst).toHaveBeenCalledWith({
      where: { experimentId: 1, variantId: 2, deviceSegment: "all" },
      orderBy: { calculatedWhen: "desc" },
      include: { goal: true },
    });
  });

  test("returns conversionRate when analysis exists", async () => {
    db.analysis.findFirst.mockResolvedValueOnce({
      id: 123,
      experimentId: 1,
      variantId: 2,
      deviceSegment: "mobile",
      conversionRate: 0.23,
      goal: { id: 1, name: "Purchase" },
    });

    const result = await getVariantConversionRate(1, 2, "mobile");

    expect(result).toBe(0.23);
    expect(db.analysis.findFirst).toHaveBeenCalledWith({
      where: { experimentId: 1, variantId: 2, deviceSegment: "mobile" },
      orderBy: { calculatedWhen: "desc" },
      include: { goal: true },
    });
  });
});

describe("getImprovement", () => {
  test("returns null when control variant does not exist", async () => {
    db.variant.findFirst.mockResolvedValueOnce(null);

    const result = await getImprovement(1);

    expect(result).toBeNull();
  });

  test("returns null when no treatment variants exist", async () => {
    db.variant.findFirst.mockResolvedValueOnce({
      id: 10,
      name: "Control",
    });
    db.variant.findMany.mockResolvedValueOnce([]);

    const result = await getImprovement(1);

    expect(result).toBeNull();
  });

  test("returns null when control rate is invalid", async () => {
    db.variant.findFirst.mockResolvedValueOnce({
      id: 10,
      name: "Control",
    });
    db.variant.findMany.mockResolvedValueOnce([
      { id: 20, name: "Variant A" },
    ]);

    db.analysis.findFirst.mockResolvedValueOnce({
      id: 1,
      conversionRate: 0,
      goal: { id: 1, name: "Purchase" },
    });

    const result = await getImprovement(1);

    expect(result).toBeNull();
  });

  test("returns improvement percentage for best treatment vs control", async () => {
    db.variant.findFirst.mockResolvedValueOnce({
      id: 10,
      name: "Control",
    });

    db.variant.findMany.mockResolvedValueOnce([
      { id: 20, name: "Variant A" },
      { id: 21, name: "Variant B" },
    ]);

    db.analysis.findFirst
      .mockResolvedValueOnce({
        id: 100,
        conversionRate: 0.10,
        goal: { id: 1, name: "Purchase" },
      }) // control
      .mockResolvedValueOnce({
        id: 101,
        conversionRate: 0.12,
        goal: { id: 1, name: "Purchase" },
      }) // variant A
      .mockResolvedValueOnce({
        id: 102,
        conversionRate: 0.15,
        goal: { id: 1, name: "Purchase" },
      }); // variant B

    const result = await getImprovement(1);

    expect(result).toBeCloseTo(50);
  });
});

describe("createExperiment", () => {
  test("creates control and treatment variants with generated names", async () => {
    db.experiment.create.mockResolvedValueOnce({ id: 1, name: "Exp 1" });

    const result = await createExperiment(
      { name: "Exp 1" },
      {
        controlSectionId: "sec-control",
        variants: [
          { sectionId: "sec-a", trafficAllocation: 0.3 },
          { sectionId: "sec-b", trafficAllocation: 0.2 },
        ],
      },
    );

    expect(db.experiment.create).toHaveBeenCalledWith({
      data: {
        name: "Exp 1",
        variants: {
          create: [
            {
              name: "Control",
              configData: { sectionId: "sec-control" },
              trafficAllocation: 0.5,
            },
            {
              name: "Variant A",
              configData: { sectionId: "sec-a" },
              trafficAllocation: 0.3,
            },
            {
              name: "Variant B",
              configData: { sectionId: "sec-b" },
              trafficAllocation: 0.2,
            },
          ],
        },
      },
    });

    expect(result).toEqual({ id: 1, name: "Exp 1" });
  });

  test("creates control with null configData when no controlSectionId is passed", async () => {
    db.experiment.create.mockResolvedValueOnce({ id: 2 });

    await createExperiment(
      { name: "No Control Section" },
      {
        variants: [{ sectionId: "sec-a", trafficAllocation: 0.4 }],
      },
    );

    expect(db.experiment.create).toHaveBeenCalledWith({
      data: {
        name: "No Control Section",
        variants: {
          create: [
            {
              name: "Control",
              configData: null,
              trafficAllocation: 0.6,
            },
            {
              name: "Variant A",
              configData: { sectionId: "sec-a" },
              trafficAllocation: 0.4,
            },
          ],
        },
      },
    });
  });

  test("throws when treatment traffic allocations exceed 1.0", async () => {
    await expect(
      createExperiment(
        { name: "Bad Exp" },
        {
          variants: [
            { sectionId: "a", trafficAllocation: 0.7 },
            { sectionId: "b", trafficAllocation: 0.4 },
          ],
        },
      ),
    ).rejects.toThrow("Treatment traffic allocations exceed 1.0");
  });
});

describe("pauseExperiment", () => {
  test("throws when experimentId is missing", async () => {
    await expect(pauseExperiment()).rejects.toThrow(
      "pauseExperiment: experimentId is required",
    );
  });

  test("throws when experiment is not found", async () => {
    db.experiment.findUnique.mockResolvedValueOnce(null);

    await expect(pauseExperiment(123)).rejects.toThrow(
      "pauseExperiment: Experiment with ID 123 not found",
    );
  });

  test("returns original experiment when status cannot be paused", async () => {
    const experiment = { id: 1, status: "draft" };
    db.experiment.findUnique.mockResolvedValueOnce(experiment);

    const result = await pauseExperiment(1);

    expect(result).toEqual(experiment);
    expect(db.experiment.update).not.toHaveBeenCalled();
  });

  test("updates active experiment to paused and adds history", async () => {
    db.experiment.findUnique.mockResolvedValueOnce({
      id: 1,
      status: "active",
    });

    db.experiment.update.mockResolvedValueOnce({
      id: 1,
      status: "paused",
      history: [],
    });

    const result = await pauseExperiment(1);

    expect(db.experiment.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        status: "paused",
        history: {
          create: {
            prevStatus: "active",
            newStatus: "paused",
          },
        },
      },
      include: {
        history: true,
      },
    });

    expect(result).toEqual({
      id: 1,
      status: "paused",
      history: [],
    });
  });
});

describe("startExperiment", () => {
  test("throws when experimentId is missing", async () => {
    await expect(startExperiment()).rejects.toThrow(
      "startExperiment: experimentId is required",
    );
  });

  test("throws when experiment is not found", async () => {
    db.experiment.findUnique.mockResolvedValueOnce(null);

    await expect(startExperiment(77)).rejects.toThrow(
      "startExperiment: Experiment 77 not found",
    );
  });

  test("returns original experiment when status cannot be started", async () => {
    const experiment = { id: 1, status: "active" };
    db.experiment.findUnique.mockResolvedValueOnce(experiment);

    const result = await startExperiment(1);

    expect(result).toEqual(experiment);
    expect(db.experiment.update).not.toHaveBeenCalled();
  });

  test("throws when draft experiment endDate is in the past", async () => {
    db.experiment.findUnique.mockResolvedValueOnce({
      id: 1,
      status: "draft",
      endDate: new Date("2020-01-01T00:00:00.000Z"),
    });

    await expect(startExperiment(1)).rejects.toThrow(
      /cannot be started/,
    );
  });

  test("updates draft experiment to active", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T12:00:00.000Z"));

    db.experiment.findUnique.mockResolvedValueOnce({
      id: 1,
      status: "draft",
      endDate: new Date("2027-01-01T00:00:00.000Z"),
    });

    db.experiment.update.mockResolvedValueOnce({
      id: 1,
      status: "active",
      startDate: new Date("2026-04-21T12:00:00.000Z"),
      history: [],
    });

    const result = await startExperiment(1);

    expect(db.experiment.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        status: "active",
        startDate: new Date("2026-04-21T12:00:00.000Z"),
        history: {
          create: {
            prevStatus: "draft",
            newStatus: "active",
          },
        },
      },
      include: {
        history: true,
      },
    });

    expect(result.status).toBe("active");
  });
});

describe("resumeExperiment", () => {
  test("throws when experimentId is missing", async () => {
    await expect(resumeExperiment()).rejects.toThrow(
      "resumeExperiment: experimentId is required",
    );
  });

  test("throws when experiment is not found", async () => {
    db.experiment.findUnique.mockResolvedValueOnce(null);

    await expect(resumeExperiment(5)).rejects.toThrow(
      "resumeExperiment: Experiment 5 not found",
    );
  });

  test("returns original experiment when status cannot be resumed", async () => {
    const experiment = { id: 5, status: "active" };
    db.experiment.findUnique.mockResolvedValueOnce(experiment);

    const result = await resumeExperiment(5);

    expect(result).toEqual(experiment);
    expect(db.experiment.update).not.toHaveBeenCalled();
  });

  test("throws when paused experiment has past endDate", async () => {
    db.experiment.findUnique.mockResolvedValueOnce({
      id: 5,
      status: "paused",
      endDate: new Date("2020-01-01T00:00:00.000Z"),
    });

    await expect(resumeExperiment(5)).rejects.toThrow(/cannot be resumed/);
  });

  test("updates paused experiment to active", async () => {
    db.experiment.findUnique.mockResolvedValueOnce({
      id: 5,
      status: "paused",
      endDate: new Date("2030-01-01T00:00:00.000Z"),
    });

    db.experiment.update.mockResolvedValueOnce({
      id: 5,
      status: "active",
      history: [],
    });

    const result = await resumeExperiment(5);

    expect(db.experiment.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: {
        status: "active",
        history: {
          create: {
            prevStatus: "paused",
            newStatus: "active",
          },
        },
      },
      include: {
        history: true,
      },
    });

    expect(result.status).toBe("active");
  });
});

describe("deleteExperiment", () => {
  test("throws when experimentId is missing", async () => {
    await expect(deleteExperiment()).rejects.toThrow(
      "deleteExperiment: experimentId is required",
    );
  });

  test("throws when experiment is not found", async () => {
    db.experiment.findUnique.mockResolvedValueOnce(null);

    await expect(deleteExperiment(44)).rejects.toThrow(
      "deleteExperiment: Experiment 44 not found",
    );
  });

  test("returns original experiment when status cannot be deleted", async () => {
    const experiment = { id: 44, status: "active" };
    db.experiment.findUnique.mockResolvedValueOnce(experiment);

    const result = await deleteExperiment(44);

    expect(result).toEqual(experiment);
    expect(db.experiment.delete).not.toHaveBeenCalled();
  });

  test("deletes draft experiment", async () => {
    db.experiment.findUnique.mockResolvedValueOnce({
      id: 44,
      status: "draft",
    });

    db.experiment.delete.mockResolvedValueOnce({
      id: 44,
      status: "draft",
    });

    const result = await deleteExperiment(44);

    expect(db.experiment.delete).toHaveBeenCalledWith({
      where: { id: 44 },
    });
    expect(result).toEqual({
      id: 44,
      status: "draft",
    });
  });
});

describe("experimentListReport mapping", () => {
  test("keeps only analyses with the latest calculatedWhen", async () => {
    const latest = new Date("2026-01-20T00:00:00.000Z");
    const older = new Date("2026-01-10T00:00:00.000Z");

    db.experiment.findMany.mockResolvedValueOnce([
      {
        id: 1,
        name: "Exp",
        status: "active",
        startDate: null,
        endDate: null,
        endCondition: "manual",
        history: [],
        analyses: [
          { totalConversions: 5, totalUsers: 50, calculatedWhen: latest },
          { totalConversions: 6, totalUsers: 60, calculatedWhen: latest },
          { totalConversions: 1, totalUsers: 10, calculatedWhen: older },
        ],
      },
    ]);

    const result = await experimentListReport();

    expect(result).toEqual([
      {
        id: 1,
        name: "Exp",
        status: "active",
        startDate: null,
        endDate: null,
        endCondition: "manual",
        history: [],
        analyses: [
          { totalConversions: 5, totalUsers: 50, calculatedWhen: latest },
          { totalConversions: 6, totalUsers: 60, calculatedWhen: latest },
        ],
      },
    ]);
  });

  test("uses the provided device segment filter", async () => {
    db.experiment.findMany.mockResolvedValueOnce([]);

    await experimentListReport("mobile");

    expect(db.experiment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          analyses: expect.objectContaining({
            where: { deviceSegment: "mobile" },
          }),
        }),
      }),
    );
  });
});

describe("isExperimentActive boundaries", () => {
  test("returns true when timeCheck equals startDate exactly", () => {
    const t = new Date("2026-03-05T00:00:00.000Z");
    const experiment = {
      status: "active",
      startDate: t,
      endDate: new Date("2026-03-10T00:00:00.000Z"),
    };

    expect(isExperimentActive(experiment, t)).toBe(true);
  });

  test("returns true when timeCheck equals endDate exactly", () => {
    const t = new Date("2026-03-10T00:00:00.000Z");
    const experiment = {
      status: "active",
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: t,
    };

    expect(isExperimentActive(experiment, t)).toBe(true);
  });

  test("returns true for active experiment with no date limits", () => {
    const experiment = {
      status: "active",
      startDate: null,
      endDate: null,
    };

    expect(isExperimentActive(experiment, new Date("2026-03-05T00:00:00.000Z"))).toBe(true);
  });
});