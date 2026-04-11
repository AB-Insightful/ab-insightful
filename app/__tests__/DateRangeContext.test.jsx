import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  DateRangeProvider,
  useDateRange,
  getCurrentDate,
  getDateDaysAgo,
  formatDateForDisplay,
} from "../contexts/DateRangeContext";

function DateRangeConsumer() {
  const { dateRange, setDateRange } = useDateRange();
  return (
    <div>
      <span data-testid="start">{dateRange.start}</span>
      <span data-testid="end">{dateRange.end}</span>
      <button
        type="button"
        onClick={() => setDateRange({ start: "2026-01-01", end: "2026-01-31" })}
      >
        Update range
      </button>
    </div>
  );
}

function HookOutsideProvider() {
  useDateRange();
  return null;
}

describe("DateRangeContext helpers", () => {
  let previousTz;

  beforeEach(() => {
    previousTz = process.env.TZ;
    process.env.TZ = "UTC";
    vi.useFakeTimers({ now: new Date("2026-04-10T12:00:00.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (previousTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTz;
    }
  });

  it("getCurrentDate returns the UTC calendar day for the frozen clock", () => {
    expect(getCurrentDate()).toBe("2026-04-10");
  });

  it("getDateDaysAgo subtracts whole days in the local calendar and returns UTC YYYY-MM-DD", () => {
    expect(getDateDaysAgo(0)).toBe("2026-04-10");
    expect(getDateDaysAgo(1)).toBe("2026-04-09");
    expect(getDateDaysAgo(30)).toBe("2026-03-11");
  });

  it("formatDateForDisplay returns empty string for missing values", () => {
    expect(formatDateForDisplay("")).toBe("");
    expect(formatDateForDisplay(null)).toBe("");
    expect(formatDateForDisplay(undefined)).toBe("");
  });

  it("formatDateForDisplay parses YYYY-MM-DD as local midnight and formats", () => {
    const out = formatDateForDisplay("2026-01-15");
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/2026/);
  });
});

describe("DateRangeProvider and useDateRange", () => {
  let previousTz;

  beforeEach(() => {
    previousTz = process.env.TZ;
    process.env.TZ = "UTC";
    vi.useFakeTimers({ now: new Date("2026-04-10T12:00:00.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (previousTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTz;
    }
  });

  it("initializes range to the last 30 days including today", () => {
    render(
      <DateRangeProvider>
        <DateRangeConsumer />
      </DateRangeProvider>,
    );

    expect(screen.getByTestId("start")).toHaveTextContent("2026-03-11");
    expect(screen.getByTestId("end")).toHaveTextContent("2026-04-10");
  });

  it("exposes setDateRange so consumers can replace the range", () => {
    render(
      <DateRangeProvider>
        <DateRangeConsumer />
      </DateRangeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Update range" }));

    expect(screen.getByTestId("start")).toHaveTextContent("2026-01-01");
    expect(screen.getByTestId("end")).toHaveTextContent("2026-01-31");
  });

  it("throws when useDateRange is used outside DateRangeProvider", () => {
    expect(() => render(<HookOutsideProvider />)).toThrow(
      "useDateRange must be used within a DateRangeProvider",
    );
  });
});
