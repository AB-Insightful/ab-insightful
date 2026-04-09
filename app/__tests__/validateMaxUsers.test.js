import { describe, it, expect } from "vitest";
import { validateMaxUsers } from "../utils/validateMaxUsers";

describe("validateMaxUsers", () => {
  it("returns null when using account default", () => {
    expect(validateMaxUsers(true, "")).toBeNull();
    expect(validateMaxUsers(true, "abc")).toBeNull();
    expect(validateMaxUsers(true, "5000")).toBeNull();
  });

  it("returns error when not using account default and value is empty", () => {
    expect(validateMaxUsers(false, "")).toBe(
      "Max users is required when not using account default",
    );
  });

  it("returns error when value is not a whole number", () => {
    expect(validateMaxUsers(false, "abc")).toBe(
      "Max users must be a whole number",
    );
    expect(validateMaxUsers(false, "1.5")).toBe(
      "Max users must be a whole number",
    );
  });

  it("returns error when value is less than 1", () => {
    expect(validateMaxUsers(false, "0")).toBe(
      "Max users must be at least 1",
    );
    expect(validateMaxUsers(false, "-1")).toBe(
      "Max users must be at least 1",
    );
  });

  it("returns error when value exceeds 1,000,000", () => {
    expect(validateMaxUsers(false, "1000001")).toBe(
      "Max users must be at most 1,000,000",
    );
    expect(validateMaxUsers(false, "2000000")).toBe(
      "Max users must be at most 1,000,000",
    );
  });

  it("returns null for valid values", () => {
    expect(validateMaxUsers(false, "1")).toBeNull();
    expect(validateMaxUsers(false, "5000")).toBeNull();
    expect(validateMaxUsers(false, "1000000")).toBeNull();
  });
});
