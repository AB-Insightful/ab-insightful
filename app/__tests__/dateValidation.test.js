import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { validateStartIsInFuture } from "../utils/validateStartIsInFuture";
import { validateEndIsAfterStart } from "../utils/validateEndIsAfterStart";

describe("date/time validation utils", () => {
  // Freeze time so tests don't depend on your real clock
  beforeEach(() => {
    vi.useFakeTimers();
    // Set "now" to Feb 1, 2026 at 12:00:00 local time
    vi.setSystemTime(new Date(2026, 1, 1, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("validateStartIsInFuture", () => {
    it("returns no errors if start date is empty", () => {
      expect(validateStartIsInFuture("", "10:00")).toEqual({
        dateError: "",
        timeError: "",
      });
    });

    it("errors if start date is in the past", () => {
      expect(validateStartIsInFuture("2026-01-31", "10:00")).toEqual({
        dateError: "Start date cannot be in the past",
        timeError: "",
      });
    });

    it("on today: errors if start time is now or earlier", () => {
      // now is 12:00
      expect(validateStartIsInFuture("2026-02-01", "11:59")).toEqual({
        dateError: "",
        timeError: "Start time must be in the future",
      });

      expect(validateStartIsInFuture("2026-02-01", "12:00")).toEqual({
        dateError: "",
        timeError: "Start time must be in the future",
      });
    });

    it("on today: passes if start time is later", () => {
      expect(validateStartIsInFuture("2026-02-01", "12:01")).toEqual({
        dateError: "",
        timeError: "",
      });
    });

    it("future date: passes regardless of time", () => {
      expect(validateStartIsInFuture("2026-02-02", "00:00")).toEqual({
        dateError: "",
        timeError: "",
      });
    });
  });

  describe("validateEndIsAfterStart", () => {
    it("returns no errors if either date is missing", () => {
      expect(validateEndIsAfterStart("", "10:00", "2026-02-01", "11:00")).toEqual(
        { dateError: "", timeError: "" },
      );
      expect(validateEndIsAfterStart("2026-02-01", "10:00", "", "11:00")).toEqual(
        { dateError: "", timeError: "" },
      );
    });

    it("errors on date if end date is before start date", () => {
      expect(
        validateEndIsAfterStart("2026-02-02", "10:00", "2026-02-01", "11:00"),
      ).toEqual({
        dateError: "End date must be after the start date",
        timeError: "",
      });
    });

    it("errors on time if same day but end time is not after start time", () => {
      expect(
        validateEndIsAfterStart("2026-02-01", "10:00", "2026-02-01", "09:59"),
      ).toEqual({
        dateError: "",
        timeError: "End time must be after the start time",
      });

      expect(
        validateEndIsAfterStart("2026-02-01", "10:00", "2026-02-01", "10:00"),
      ).toEqual({
        dateError: "",
        timeError: "End time must be after the start time",
      });
    });

    it("passes if end is after start (same day)", () => {
      expect(
        validateEndIsAfterStart("2026-02-01", "10:00", "2026-02-01", "10:01"),
      ).toEqual({ dateError: "", timeError: "" });
    });

    it("uses default end time of 23:59 when endTimeStr is empty", () => {
      expect(
        validateEndIsAfterStart("2026-02-01", "10:00", "2026-02-01", ""),
      ).toEqual({ dateError: "", timeError: "" });

      // But if start is at 23:59 and end time is omitted, it's equal => invalid time
      expect(
        validateEndIsAfterStart("2026-02-01", "23:59", "2026-02-01", ""),
      ).toEqual({
        dateError: "",
        timeError: "End time must be after the start time",
      });
    });
  });
});