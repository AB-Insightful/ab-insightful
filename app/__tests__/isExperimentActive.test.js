import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExperimentStatus } from "@prisma/client";

vi.mock("../db.server", () => ({ default: {} }));

import { isExperimentActive } from "../services/experiment.server";

describe("isExperimentActive", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 1, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false for null/undefined experiment", () => {
    expect(isExperimentActive(null)).toBe(false);
    expect(isExperimentActive(undefined)).toBe(false);
  });

  it("returns false for non-active statuses", () => {
    const base = { startDate: new Date(2026, 1, 1), endDate: null };
    expect(isExperimentActive({ ...base, status: ExperimentStatus.draft })).toBe(false);
    expect(isExperimentActive({ ...base, status: ExperimentStatus.paused })).toBe(false);
    expect(isExperimentActive({ ...base, status: ExperimentStatus.completed })).toBe(false);
    expect(isExperimentActive({ ...base, status: ExperimentStatus.archived })).toBe(false);
  });

  it("returns true for an active experiment within date range", () => {
    expect(
      isExperimentActive({
        status: ExperimentStatus.active,
        startDate: new Date(2026, 1, 1),
        endDate: new Date(2026, 3, 1),
      }),
    ).toBe(true);
  });

  it("returns true for an active experiment with no end date", () => {
    expect(
      isExperimentActive({
        status: ExperimentStatus.active,
        startDate: new Date(2026, 1, 1),
        endDate: null,
      }),
    ).toBe(true);
  });

  it("returns false if the check time is before the start date", () => {
    expect(
      isExperimentActive({
        status: ExperimentStatus.active,
        startDate: new Date(2026, 5, 1),
        endDate: null,
      }),
    ).toBe(false);
  });

  it("returns false if the check time is after the end date", () => {
    expect(
      isExperimentActive({
        status: ExperimentStatus.active,
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2026, 1, 1),
      }),
    ).toBe(false);
  });

  it("accepts a custom timeCheck argument (Date object)", () => {
    expect(
      isExperimentActive(
        {
          status: ExperimentStatus.active,
          startDate: new Date(2026, 0, 1),
          endDate: new Date(2026, 6, 1),
        },
        new Date(2026, 3, 15),
      ),
    ).toBe(true);
  });

  it("accepts a custom timeCheck argument (string)", () => {
    expect(
      isExperimentActive(
        {
          status: ExperimentStatus.active,
          startDate: new Date(2026, 0, 1),
          endDate: new Date(2026, 1, 1),
        },
        "2026-01-15T12:00:00.000Z",
      ),
    ).toBe(true);
  });

  it("returns true when startDate is null (no lower bound)", () => {
    expect(
      isExperimentActive({
        status: ExperimentStatus.active,
        startDate: null,
        endDate: new Date(2026, 6, 1),
      }),
    ).toBe(true);
  });
});
