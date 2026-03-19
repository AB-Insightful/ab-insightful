// app/__tests__/experiment.server.test.js
// Assumptions:
// - @prisma/client is mocked so Prisma error classes can be used with instanceof checks.
// - Dates are controlled with fake timers to keep tests deterministic.

import { Prisma, ExperimentStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import db from "../../db.server";
import {
  getCandidatesForScheduledEnd,
  getCandidatesForScheduledStart,
} from "../../services/experiment.server";

vi.mock("../db.server", () => {
  return {
    default: {
      experiment: {
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
    expect(arg.where.endDate.lte.toISOString()).toBe(
      "2026-03-03T12:00:00.000Z",
    );

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
