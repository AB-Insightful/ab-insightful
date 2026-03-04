
import { describe, it, expect } from "vitest";
import { localDateTimeToISOString } from "../utils/localDateTimeToISOString";

describe("localDateTimeToISOString", () => {
  it("returns empty string when dateStr is missing", () => {
    expect(localDateTimeToISOString("")).toBe("");
    expect(localDateTimeToISOString(null)).toBe("");
    expect(localDateTimeToISOString(undefined)).toBe("");
  });

  it("defaults time to 00:00 when omitted/empty", () => {
    const a = localDateTimeToISOString("2026-02-01");
    const b = localDateTimeToISOString("2026-02-01", "00:00");
    const c = localDateTimeToISOString("2026-02-01", "");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("matches the UTC instant for the same local components", () => {
    // Build the same local instant the function builds, then compare ISO strings
    const expected = new Date(2026, 1, 1, 13, 30, 0, 0).toISOString(); // Feb is month=1 (0-based)
    const actual = localDateTimeToISOString("2026-02-01", "13:30");
    expect(actual).toBe(expected);
  });

  it("handles single-digit hours/minutes if passed (e.g. 7:5)", () => {
    const expected = new Date(2026, 1, 1, 7, 5, 0, 0).toISOString();
    const actual = localDateTimeToISOString("2026-02-01", "7:5");
    expect(actual).toBe(expected);
  });
});