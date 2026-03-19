// app/__tests__/experiment.server.test.js
// Assumptions:
// - @prisma/client is mocked so Prisma error classes can be used with instanceof checks.
// - Dates are controlled with fake timers to keep tests deterministic.

import { Prisma, ExperimentStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import db from "../db.server";
import {
  experimentListReport,
  getCandidatesForScheduledEnd,
  getCandidatesForScheduledStart,
  getExperimentReportData,
  isExperimentActive,
} from "../services/experiment.server";

vi.mock("../db.server", () => {
  return {
    default: {
      experiment: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
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
    expect(arg.select.analyses).toBeDefined();
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
    expect(result).toEqual(mockExperiments);
  });

  test("returns null when no experiments found", async () => {
    db.experiment.findMany.mockResolvedValueOnce(null);

    const result = await experimentListReport();

    expect(result).toBeNull();
  });

  test("returns empty array when experiments is empty", async () => {
    db.experiment.findMany.mockResolvedValueOnce([]);

    const result = await experimentListReport();

    expect(result).toEqual([]);
  });
});
