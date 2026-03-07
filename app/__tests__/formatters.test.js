import { describe, it, expect } from 'vitest';
import { formatImprovement as formatImprovementFromFormatters, formatProbability, formatRatio } from '../utils/formatters';
import { formatImprovement } from "../utils/formatImprovement";
import { formatRuntime } from "../utils/formatRuntime";

describe("Formatter Utilities", () => {
  describe("formatImprovement", () => {
    it("returns N/A for null/undefined", () => {
      expect(formatImprovementFromFormatters(null)).toBe("N/A");
      expect(formatImprovementFromFormatters(undefined)).toBe("N/A");
    });

    it("adds + for positive, none for 0, keeps - for negative", () => {
      expect(formatImprovementFromFormatters(5.235)).toBe("+5.24%");
      expect(formatImprovementFromFormatters(0)).toBe("0.00%");
      expect(formatImprovementFromFormatters(-2.1)).toBe("-2.10%");
    });
  });

  describe("formatProbability", () => {
    it("returns N/A for null/undefined", () => {
      expect(formatProbability(null)).toBe("N/A");
      expect(formatProbability(undefined)).toBe("N/A");
    });

    it("converts decimals to % with 1 decimal + rounding", () => {
      expect(formatProbability(0)).toBe("0.0%");
      expect(formatProbability(1)).toBe("100.0%");
      expect(formatProbability(0.8567)).toBe("85.7%");
      expect(formatProbability(0.9995)).toBe("100.0%");
    });
  });

  describe("formatRatio", () => {
    it("returns N/A if either input is null/undefined", () => {
      expect(formatRatio(null, 100)).toBe("N/A");
      expect(formatRatio(10, null)).toBe("N/A");
      expect(formatRatio(undefined, 1)).toBe("N/A");
      expect(formatRatio(1, undefined)).toBe("N/A");
    });

    it("formats ratio string (including 0 values)", () => {
      expect(formatRatio(5, 50)).toBe("5/50");
      expect(formatRatio(0, 50)).toBe("0/50");
      expect(formatRatio(5, 0)).toBe("5/0");
    });
  });
});

describe("formatImprovement", () => {
  it('returns "N/A" for null/undefined/NaN', () => {
    expect(formatImprovement(null)).toBe("N/A");
    expect(formatImprovement(undefined)).toBe("N/A");
    expect(formatImprovement(NaN)).toBe("N/A");
    expect(formatImprovement("nope")).toBe("N/A"); // isNaN("nope") -> true
  });

  it("uses 2 decimals for |value| >= 1 and adds + for positive", () => {
    expect(formatImprovement(1)).toBe("+1.00%");
    expect(formatImprovement(1.234)).toBe("+1.23%");
    expect(formatImprovement(-2.5)).toBe("-2.50%");
  });

  it("uses 3 decimals for |value| < 1", () => {
    expect(formatImprovement(0.5)).toBe("+0.500%");
    expect(formatImprovement(-0.04567)).toBe("-0.046%");
    expect(formatImprovement(0)).toBe("0.000%"); // no plus sign for 0
  });
});

describe("formatRuntime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // lock "now" so active runtime is deterministic
    vi.setSystemTime(new Date(2026, 1, 1, 12, 0, 0)); // Feb 1, 2026 12:00 local
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "-" for draft/scheduled or missing startDateISO', () => {
    expect(formatRuntime(null, null, "draft")).toBe("-");
    expect(formatRuntime("2026-02-01T00:00:00.000Z", null, "draft")).toBe("-");
    expect(formatRuntime("2026-02-01T00:00:00.000Z", null, "scheduled")).toBe("-");
    expect(formatRuntime("", null, "active")).toBe("-");
  });

  it('returns "-" for unsupported status', () => {
    expect(formatRuntime("2026-02-01T00:00:00.000Z", null, "paused")).toBe("-");
    expect(formatRuntime("2026-02-01T00:00:00.000Z", null, "archived")).toBe("-");
  });

  it('returns "-" for invalid dates', () => {
    expect(formatRuntime("not-a-date", null, "active")).toBe("-");
    expect(formatRuntime("2026-02-01T00:00:00.000Z", "not-a-date", "completed")).toBe("-");
  });

  it('active: uses "now" as end time', () => {
    // now is 12:00 local, start is 11:30 local => 30 minutes
    const start = new Date(2026, 1, 1, 11, 30, 0).toISOString();
    expect(formatRuntime(start, null, "active")).toBe("30m");
  });

  it('completed: uses endDateISO when provided', () => {
    const start = new Date(2026, 1, 1, 10, 0, 0).toISOString();
    const end = new Date(2026, 1, 1, 12, 30, 0).toISOString();
    expect(formatRuntime(start, end, "completed")).toBe("2h 30m");
  });

  it('completed: missing endDateISO returns "-"', () => {
    const start = new Date(2026, 1, 1, 10, 0, 0).toISOString();
    expect(formatRuntime(start, null, "completed")).toBe("-");
  });

  it('formats < 1 minute as "< 1m"', () => {
    const start = new Date(2026, 1, 1, 11, 59, 40).toISOString(); // 20 seconds ago
    expect(formatRuntime(start, null, "active")).toBe("< 1m");
  });

  it("formats days as 'Xd Yh'", () => {
    // 3 days 4 hours difference
    const start = new Date(2026, 0, 29, 8, 0, 0).toISOString(); // Jan 29 08:00
    // now is Feb 1 12:00 => 3d 4h
    expect(formatRuntime(start, null, "active")).toBe("3d 4h");
  });

  it("clamps negative runtime to 0 and returns '< 1m'", () => {
    // start in the future vs now -> diffMs negative -> clamp to 0 -> totalMinutes 0
    const start = new Date(2026, 1, 1, 13, 0, 0).toISOString(); // 1pm, now is noon
    expect(formatRuntime(start, null, "active")).toBe("< 1m");
  });
});