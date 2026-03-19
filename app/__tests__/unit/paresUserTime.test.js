// parseUserTime.test.js
import { describe, it, expect } from "vitest";
import { parseUserTime } from "../../utils/parseUserTime"; // <-- adjust path if needed

describe("parseUserTime", () => {
  it("returns empty string for empty input", () => {
    expect(parseUserTime("")).toBe("");
    expect(parseUserTime(null)).toBe("");
    expect(parseUserTime(undefined)).toBe("");
  });

  it("handles special words", () => {
    expect(parseUserTime("noon")).toBe("12:00");
    expect(parseUserTime("midnight")).toBe("00:00");
  });

  it("parses 24-hour inputs (with colon)", () => {
    expect(parseUserTime("00:00")).toBe("00:00");
    expect(parseUserTime("13:30")).toBe("13:30");
    expect(parseUserTime("23:59")).toBe("23:59");
  });

  it("parses 12-hour inputs with AM/PM", () => {
    expect(parseUserTime("1:30 PM")).toBe("13:30");
    expect(parseUserTime("1:30PM")).toBe("13:30");
    expect(parseUserTime("12:00am")).toBe("00:00");
    expect(parseUserTime("12:00pm")).toBe("12:00");
    expect(parseUserTime("12am")).toBe("00:00");
    expect(parseUserTime("12pm")).toBe("12:00");
    expect(parseUserTime("11pm")).toBe("23:00");
  });

  it("scrubs spaces, dots, and junk characters", () => {
    expect(parseUserTime(" 1 : 3 0  p.m. ")).toBe("13:30");
    expect(parseUserTime("Time=9:05am!!")).toBe("09:05");
  });

  it("pads / truncates minutes when colon is present", () => {
    expect(parseUserTime("9:3")).toBe("09:30"); // padEnd -> "30"
    expect(parseUserTime("9:345")).toBe("09:34"); // slice(0,2) -> "34"
    expect(parseUserTime("9:")).toBe(null); // mStr = "" fails /^\d+$/
  });

  it("parses compact numeric inputs (no colon)", () => {
    expect(parseUserTime("9")).toBe("09:00");
    expect(parseUserTime("09")).toBe("09:00");
    expect(parseUserTime("930")).toBe("09:30");
    expect(parseUserTime("0930")).toBe("09:30");
    expect(parseUserTime("1234")).toBe("12:34");
    expect(parseUserTime("2359")).toBe("23:59");
  });

  it("rejects invalid minutes", () => {
    expect(parseUserTime("1:99 PM")).toBe(null);
    expect(parseUserTime("12:60")).toBe(null);
    expect(parseUserTime("1260")).toBe(null); // mm=60
  });

  it("rejects invalid hours (24h mode)", () => {
    expect(parseUserTime("24:00")).toBe(null);
    expect(parseUserTime("25")).toBe(null);
    expect(parseUserTime("9999")).toBe(null); // hh=99
  });

  it("rejects invalid hours (12h mode)", () => {
    expect(parseUserTime("0am")).toBe(null);
    expect(parseUserTime("13pm")).toBe(null);
  });

  it("rejects non-numeric garbage after scrubbing", () => {
    expect(parseUserTime("abc")).toBe(null);
    expect(parseUserTime("::")).toBe(null);
  });
});
