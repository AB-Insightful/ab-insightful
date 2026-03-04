// app/__tests__/experiment.server.test.js
// Assumptions:
// - We mock app/db.server.js so no real database is used.
// - We mock @prisma/client error classes to reliably trigger instanceof branches.
// - We freeze system time to make new Date() deterministic.
// - We do not modify production code.

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Prisma } from "@prisma/client";

const fakeFindMany = vi.fn();

vi.mock("../db.server", () => {
  return {
    default: {
      experiment: {
        findMany: fakeFindMany,
      },
    },
  };
});

import {
  getCandidatesForScheduledEnd,
  getCandidatesForScheduledStart,
} from "../services/experiment.server.js";

describe("services/experiment.server - scheduled candidate queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:00:00.000Z"));

    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("getCandidatesForScheduledEnd: success returns array of ids", async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    fakeFindMany.mockResolvedValueOnce(rows);

    const result = await getCandidatesForScheduledEnd();

    expect(fakeFindMany).toHaveBeenCalledTimes(1);

    const callArg = fakeFindMany.mock.calls[0][0];
    expect(callArg.select).toEqual({ id: true });
    expect(callArg.where).toHaveProperty("status");
    expect(callArg.where).toHaveProperty("endDate");
    expect(callArg.where.endDate).toHaveProperty("lte");
    expect(callArg.where.endDate.lte).toBeInstanceOf(Date);

    expect(result).toEqual(rows);
  });

  test("getCandidatesForScheduledStart: success returns array of ids", async () => {
    const rows = [{ id: 10 }];
    fakeFindMany.mockResolvedValueOnce(rows);

    const result = await getCandidatesForScheduledStart();

    expect(fakeFindMany).toHaveBeenCalledTimes(1);

    const callArg = fakeFindMany.mock.calls[0][0];
    expect(callArg.select).toEqual({ id: true });
    expect(callArg.where).toHaveProperty("status");
    expect(callArg.where).toHaveProperty("startDate");
    expect(callArg.where.startDate).toHaveProperty("lte");
    expect(callArg.where.startDate.lte).toBeInstanceOf(Date);

    expect(result).toEqual(rows);
  });

  test("getCandidatesForScheduledEnd: handles PrismaClientKnownRequestError", async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      "known error",
      "P2002",
      "4.0.0",
    );

    fakeFindMany.mockRejectedValueOnce(prismaError);

    const result = await getCandidatesForScheduledEnd();

    expect(fakeFindMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ error: prismaError.message });
    expect(console.error).toHaveBeenCalled();
  });

  test("getCandidatesForScheduledStart: handles PrismaClientValidationError", async () => {
    const validationError = new Prisma.PrismaClientValidationError(
      "validation error",
    );

    fakeFindMany.mockRejectedValueOnce(validationError);

    const result = await getCandidatesForScheduledStart();

    expect(fakeFindMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ error: validationError.message });
    expect(console.error).toHaveBeenCalled();
  });

  test("getCandidatesForScheduledEnd: non-Prisma error returns undefined", async () => {
    fakeFindMany.mockRejectedValueOnce(new Error("unexpected"));

    const result = await getCandidatesForScheduledEnd();

    expect(fakeFindMany).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
  });
});
