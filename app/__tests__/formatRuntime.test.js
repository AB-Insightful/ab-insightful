import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatRuntime } from "../utils/formatRuntime.js";

// Freeze time so "now" is deterministic across all active/paused tests
const FROZEN_NOW = new Date("2026-04-01T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helper to build ExperimentHistory entries
// ---------------------------------------------------------------------------

function historyEntry(prevStatus, newStatus, changedAt) {
  return { prevStatus, newStatus, changedAt };
}

// ---------------------------------------------------------------------------
// Early exits — statuses/inputs that should always return "-"
// ---------------------------------------------------------------------------

describe("formatRuntime — early exits", () => {
  it("returns '-' for draft status", () => {
    expect(formatRuntime("2026-03-01T00:00:00.000Z", null, "draft")).toBe("-");
  });

  it("returns '-' for scheduled status", () => {
    expect(formatRuntime("2026-03-01T00:00:00.000Z", null, "scheduled")).toBe("-");
  });

  it("returns '-' when startDate is null", () => {
    expect(formatRuntime(null, null, "active")).toBe("-");
  });

  it("returns '-' for an unrecognised status", () => {
    expect(formatRuntime("2026-03-01T00:00:00.000Z", null, "unknown_status")).toBe("-");
  });

  it("returns '-' for completed experiment with no endDate", () => {
    expect(formatRuntime("2026-03-01T00:00:00.000Z", null, "completed")).toBe("-");
  });

  it("returns '-' for an invalid startDate string", () => {
    expect(formatRuntime("not-a-date", "2026-04-01T00:00:00.000Z", "completed")).toBe("-");
  });

  it("returns '-' for an invalid endDate on a completed experiment", () => {
    expect(formatRuntime("2026-03-01T00:00:00.000Z", "not-a-date", "completed")).toBe("-");
  });
});

// ---------------------------------------------------------------------------
// Active experiments — no pauses
// ---------------------------------------------------------------------------

describe("formatRuntime — active, no pauses", () => {
  it("returns '< 1m' when elapsed time is under a minute", () => {
    const start = new Date(FROZEN_NOW.getTime() - 30_000).toISOString(); // 30s ago
    expect(formatRuntime(start, null, "active")).toBe("< 1m");
  });

  it("clamps negative diff to '< 1m' when startDate is ahead of now (clock skew)", () => {
    const start = new Date(FROZEN_NOW.getTime() + 60_000).toISOString(); // 1m in the future
    expect(formatRuntime(start, null, "active")).toBe("< 1m");
  });

  it("returns minutes only when runtime is under an hour", () => {
    const start = new Date(FROZEN_NOW.getTime() - 45 * 60_000).toISOString(); // 45m ago
    expect(formatRuntime(start, null, "active")).toBe("45m");
  });

  it("returns '1h 0m' for exactly one hour", () => {
    const start = new Date(FROZEN_NOW.getTime() - 60 * 60_000).toISOString();
    expect(formatRuntime(start, null, "active")).toBe("1h 0m");
  });

  it("returns hours and minutes when runtime is between 1h and 24h", () => {
    const start = new Date(FROZEN_NOW.getTime() - (2 * 60 + 30) * 60_000).toISOString(); // 2h 30m ago
    expect(formatRuntime(start, null, "active")).toBe("2h 30m");
  });

  it("returns days and hours when runtime exceeds 24h", () => {
    const start = new Date(FROZEN_NOW.getTime() - (3 * 24 * 60 + 4 * 60) * 60_000).toISOString(); // 3d 4h ago
    expect(formatRuntime(start, null, "active")).toBe("3d 4h");
  });
});

// ---------------------------------------------------------------------------
// Completed experiments — no pauses
// ---------------------------------------------------------------------------

describe("formatRuntime — completed, no pauses", () => {
  it("uses endDate rather than now for a completed experiment", () => {
    const start = "2026-03-01T00:00:00.000Z";
    const end   = "2026-03-03T06:00:00.000Z"; // 2d 6h later
    expect(formatRuntime(start, end, "completed")).toBe("2d 6h");
  });

  it("returns '1h 30m' for a completed 90-minute experiment", () => {
    const start = "2026-01-01T10:00:00.000Z";
    const end   = "2026-01-01T11:30:00.000Z";
    expect(formatRuntime(start, end, "completed")).toBe("1h 30m");
  });
});

// ---------------------------------------------------------------------------
// Core ask: pause / resume correctly subtracts paused time
// ---------------------------------------------------------------------------

describe("formatRuntime — pause and resume", () => {
  it("subtracts a single 1-hour pause from an active experiment's runtime", () => {
    // Timeline (all relative to FROZEN_NOW = 12:00):
    //   10:00 — experiment started        (2h wall-clock ago)
    //   10:30 — paused                    (active for 30m)
    //   11:30 — resumed                   (paused for 1h)
    //   12:00 — now
    // Expected active time: 2h total − 1h paused = 1h → 30m before pause + 30m after resume = 1h 0m
    const start     = new Date(FROZEN_NOW.getTime() - 2 * 60 * 60_000).toISOString();  // 10:00
    const pausedAt  = new Date(FROZEN_NOW.getTime() - 90 * 60_000).toISOString();       // 10:30
    const resumedAt = new Date(FROZEN_NOW.getTime() - 30 * 60_000).toISOString();       // 11:30

    const history = [
      historyEntry("active", "paused", pausedAt),
      historyEntry("paused", "active", resumedAt),
    ];

    expect(formatRuntime(start, null, "active", history)).toBe("1h 0m");
  });

  it("subtracts multiple pause intervals correctly", () => {
    // Timeline (relative to FROZEN_NOW = 12:00):
    //   06:00 — started                   (6h wall-clock ago)
    //   07:00 — paused  (pause #1 start)
    //   08:00 — resumed (pause #1 end)    → 1h paused
    //   09:00 — paused  (pause #2 start)
    //   10:00 — resumed (pause #2 end)    → 1h paused
    //   12:00 — now
    // Total paused: 2h  |  Expected active: 6h − 2h = 4h
    const start     = new Date(FROZEN_NOW.getTime() - 6 * 60 * 60_000).toISOString();
    const pause1At  = new Date(FROZEN_NOW.getTime() - 5 * 60 * 60_000).toISOString();
    const resume1At = new Date(FROZEN_NOW.getTime() - 4 * 60 * 60_000).toISOString();
    const pause2At  = new Date(FROZEN_NOW.getTime() - 3 * 60 * 60_000).toISOString();
    const resume2At = new Date(FROZEN_NOW.getTime() - 2 * 60 * 60_000).toISOString();

    const history = [
      historyEntry("active", "paused", pause1At),
      historyEntry("paused", "active", resume1At),
      historyEntry("active", "paused", pause2At),
      historyEntry("paused", "active", resume2At),
    ];

    expect(formatRuntime(start, null, "active", history)).toBe("4h 0m");
  });

  it("counts an open (not yet resumed) pause up to now for a currently-paused experiment", () => {
    // Timeline (relative to FROZEN_NOW = 12:00):
    //   10:00 — started
    //   11:00 — paused (still paused at 12:00)
    // Wall-clock: 2h  |  Paused: 1h  |  Expected active: 1h 0m
    const start    = new Date(FROZEN_NOW.getTime() - 2 * 60 * 60_000).toISOString();
    const pausedAt = new Date(FROZEN_NOW.getTime() - 1 * 60 * 60_000).toISOString();

    const history = [
      historyEntry("active", "paused", pausedAt),
    ];

    expect(formatRuntime(start, null, "paused", history)).toBe("1h 0m");
  });

  it("returns correct runtime for a completed experiment that was paused then resumed", () => {
    // Timeline (fixed timestamps, not relative to now):
    //   08:00 — started
    //   09:00 — paused
    //   10:00 — resumed
    //   12:00 — ended
    // Wall-clock: 4h  |  Paused: 1h  |  Expected active: 3h 0m
    const start   = "2026-04-01T08:00:00.000Z";
    const end     = "2026-04-01T12:00:00.000Z";
    const paused  = "2026-04-01T09:00:00.000Z";
    const resumed = "2026-04-01T10:00:00.000Z";

    const history = [
      historyEntry("active", "paused",  paused),
      historyEntry("paused", "active",  resumed),
    ];

    expect(formatRuntime(start, end, "completed", history)).toBe("3h 0m");
  });

  it("returns the same result when history entries are out of chronological order", () => {
    // Same scenario as the single-pause test but history supplied in reverse order
    const start     = new Date(FROZEN_NOW.getTime() - 2 * 60 * 60_000).toISOString();
    const pausedAt  = new Date(FROZEN_NOW.getTime() - 90 * 60_000).toISOString();
    const resumedAt = new Date(FROZEN_NOW.getTime() - 30 * 60_000).toISOString();

    const history = [
      historyEntry("paused", "active",  resumedAt), // out of order
      historyEntry("active", "paused",  pausedAt),
    ];

    expect(formatRuntime(start, null, "active", history)).toBe("1h 0m");
  });

  it("ignores unrelated history entries (e.g. draft → active transitions)", () => {
    // The draft→active entry should have no effect on pause calculation
    const start     = new Date(FROZEN_NOW.getTime() - 2 * 60 * 60_000).toISOString();
    const pausedAt  = new Date(FROZEN_NOW.getTime() - 90 * 60_000).toISOString();
    const resumedAt = new Date(FROZEN_NOW.getTime() - 30 * 60_000).toISOString();

    const history = [
      historyEntry("draft",  "active", start),      // unrelated — should be ignored
      historyEntry("active", "paused", pausedAt),
      historyEntry("paused", "active", resumedAt),
    ];

    expect(formatRuntime(start, null, "active", history)).toBe("1h 0m");
  });

  it("handles an empty history array the same as no history argument", () => {
    const start = new Date(FROZEN_NOW.getTime() - 45 * 60_000).toISOString();
    expect(formatRuntime(start, null, "active", [])).toBe("45m");
    expect(formatRuntime(start, null, "active")).toBe("45m");
  });
});
